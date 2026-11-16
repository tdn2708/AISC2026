/**
 * API LỊCH LIVESTREAM — /api/live/schedule
 * ==================================================================
 * Quản lý lịch hẹn phiên live trong từng kho dữ liệu (demo hoặc real):
 *   - Thêm, sửa, hủy và xóa lịch đã hủy.
 *   - Tự động gắn lịch với phiên live khi chủ shop bấm mở phiên trong khung giờ hẹn.
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const hub = require('../services/live/hub');
const { rateLimit } = require('../services/rate_limit');

const router = express.Router();

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;
const ALLOWED_REMIND = new Set([0, 10, 15, 30, 60, 120]);
const indexed = new WeakSet();

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(`[LIVE SCHEDULE] ${req.method} ${req.path}:`, err.message);
    if (!res.headersSent) res.status(status).json({ error: err.message });
  });
};

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

async function ensureScheduleIndexes(db) {
  if (!db || indexed.has(db)) return;
  indexed.add(db);
  await db
    .collection('live_schedule')
    .createIndex({ status: 1, startAt: 1 })
    .catch((e) => console.warn('[LIVE SCHEDULE] Không tạo được chỉ mục:', e.message));
}

function parseObjectId(id) {
  const s = String(id || '');
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return null;
  try {
    return new ObjectId(s);
  } catch {
    return null;
  }
}

/**
 * Kiểm tra và chuẩn hóa dữ liệu lịch live (hàm thuần để kiểm thử đơn vị).
 */
function validateSchedulePayload(body = {}, { workspace = 'real', now = new Date() } = {}) {
  if (!body || typeof body !== 'object') {
    throw bad('Dữ liệu lịch live không hợp lệ.');
  }

  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  if (!rawTitle || rawTitle.length > 120) {
    throw bad('Tên phiên hẹn phải từ 1 đến 120 ký tự.');
  }
  const title = rawTitle.slice(0, 120);

  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
  if (!platform || !Object.hasOwn(hub.PLATFORMS, platform)) {
    throw bad('Nền tảng livestream không hợp lệ.');
  }
  if (platform === 'simulator' && workspace !== 'demo') {
    throw bad('Phiên mô phỏng chỉ dùng được trong kho Mô phỏng.');
  }

  const target = typeof body.target === 'string' ? body.target.trim().slice(0, 300) : '';
  if ((platform === 'tiktok' || platform === 'youtube') && !target) {
    throw bad(
      platform === 'tiktok'
        ? 'Nhập tên tài khoản TikTok sẽ live.'
        : 'Nhập liên kết video YouTube sẽ live.'
    );
  }

  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const startDate = body.startAt instanceof Date ? new Date(body.startAt.getTime()) : new Date(body.startAt);
  const startMs = startDate.getTime();
  if (!body.startAt || Number.isNaN(startMs)) {
    throw bad('Giờ bắt đầu không hợp lệ.');
  }
  if (startMs < nowMs - 5 * MIN_MS) {
    throw bad('Giờ bắt đầu không được ở trong quá khứ quá 5 phút.');
  }
  if (startMs > nowMs + 90 * DAY_MS) {
    throw bad('Giờ bắt đầu không được quá 90 ngày tính từ hiện tại.');
  }

  let durationMin = 120;
  if (body.durationMin !== undefined && body.durationMin !== null && body.durationMin !== '') {
    const d = Number(body.durationMin);
    if (!Number.isInteger(d) || d < 15 || d > 720) {
      throw bad('Thời lượng dự kiến phải là số nguyên từ 15 đến 720 phút.');
    }
    durationMin = d;
  }

  let remindBeforeMin = 30;
  if (body.remindBeforeMin !== undefined && body.remindBeforeMin !== null && body.remindBeforeMin !== '') {
    const r = Number(body.remindBeforeMin);
    if (!Number.isInteger(r) || !ALLOWED_REMIND.has(r)) {
      throw bad('Thời gian nhắc trước phải là một trong các mức 0, 10, 15, 30, 60 hoặc 120 phút.');
    }
    remindBeforeMin = r;
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  return {
    title,
    platform,
    target: platform === 'simulator' ? 'megalive-1111' : target,
    startAt: startDate,
    durationMin,
    remindBeforeMin,
    note
  };
}

function publicSchedule(doc) {
  if (!doc) return null;
  const startAt = doc.startAt instanceof Date ? doc.startAt : new Date(doc.startAt);
  const durationMin = Number(doc.durationMin) || 120;
  const endAt = new Date(startAt.getTime() + durationMin * MIN_MS);
  return {
    id: String(doc._id),
    title: doc.title,
    platform: doc.platform,
    platformLabel: Object.hasOwn(hub.PLATFORMS, doc.platform)
      ? hub.PLATFORMS[doc.platform].label
      : doc.platform,
    target: doc.target || '',
    startAt,
    endAt,
    durationMin,
    remindBeforeMin: doc.remindBeforeMin ?? 30,
    note: doc.note || '',
    status: doc.status || 'scheduled',
    sessionId: doc.sessionId ? String(doc.sessionId) : null,
    createdBy: doc.createdBy || ''
  };
}

/**
 * Tìm lịch `scheduled` khớp nền tảng và gần giờ mở phiên nhất trong khoảng [-60 phút, +180 phút]
 * để đánh dấu `done` và gắn `sessionId`.
 */
async function linkSession(db, session) {
  if (!db || !session || !session._id || !session.platform) return null;
  await ensureScheduleIndexes(db);
  const createdMs = (session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt || Date.now())).getTime();
  const from = new Date(createdMs - 60 * MIN_MS);
  const to = new Date(createdMs + 180 * MIN_MS);

  const col = db.collection('live_schedule');
  const candidates = await col
    .find({
      status: 'scheduled',
      platform: session.platform,
      startAt: { $gte: from, $lte: to }
    })
    .toArray();

  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.startAt).getTime() - createdMs) -
      Math.abs(new Date(b.startAt).getTime() - createdMs)
  );
  const picked = candidates[0];
  const now = new Date();
  await col.updateOne(
    { _id: picked._id },
    { $set: { status: 'done', sessionId: session._id, updatedAt: now } }
  );
  return picked._id;
}

const writeLimiter = rateLimit({ max: 30, windowMs: 60_000, name: 'lịch live' });

router.get(
  '/',
  wrap(async (req, res) => {
    await ensureScheduleIndexes(req.db);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const rows = await req.db
      .collection('live_schedule')
      .find({
        $or: [
          { status: 'scheduled', startAt: { $gte: dayAgo } },
          { status: { $in: ['done', 'cancelled'] }, startAt: { $gte: weekAgo } }
        ]
      })
      .sort({ startAt: 1 })
      .limit(60)
      .toArray();

    res.json({ items: rows.map(publicSchedule) });
  })
);

router.post(
  '/',
  writeLimiter,
  wrap(async (req, res) => {
    await ensureScheduleIndexes(req.db);
    const now = new Date();
    const clean = validateSchedulePayload(req.body || {}, { workspace: req.workspace, now });

    const col = req.db.collection('live_schedule');
    const futureCount = await col.countDocuments({
      status: 'scheduled',
      startAt: { $gt: now }
    });
    if (futureCount >= 50) {
      throw bad('Đã có 50 phiên hẹn, hủy bớt rồi thêm.', 400);
    }

    const doc = {
      ...clean,
      status: 'scheduled',
      sessionId: null,
      createdBy: String(req.user?.name || '').trim().slice(0, 80),
      createdAt: now,
      updatedAt: now
    };
    const { insertedId } = await col.insertOne(doc);
    doc._id = insertedId;
    res.status(201).json({ item: publicSchedule(doc) });
  })
);

router.patch(
  '/:id',
  writeLimiter,
  wrap(async (req, res) => {
    await ensureScheduleIndexes(req.db);
    const oid = parseObjectId(req.params.id);
    if (!oid) throw bad('Không tìm thấy lịch live.', 404);

    const col = req.db.collection('live_schedule');
    const existing = await col.findOne({ _id: oid });
    if (!existing) throw bad('Không tìm thấy lịch live.', 404);
    if (existing.status === 'done') {
      throw bad('Lịch này đã gắn với phiên live nên không sửa được.', 409);
    }

    const now = new Date();
    const body = req.body || {};

    if (body.status !== undefined) {
      if (body.status !== 'cancelled') {
        throw bad('Trạng thái cập nhật không hợp lệ.', 400);
      }
      await col.updateOne(
        { _id: oid },
        { $set: { status: 'cancelled', updatedAt: now } }
      );
      const updated = { ...existing, status: 'cancelled', updatedAt: now };
      return res.json({ item: publicSchedule(updated) });
    }

    const mergedInput = {
      title: body.title !== undefined ? body.title : existing.title,
      platform: body.platform !== undefined ? body.platform : existing.platform,
      target: body.target !== undefined ? body.target : existing.target,
      startAt: body.startAt !== undefined ? body.startAt : existing.startAt,
      durationMin: body.durationMin !== undefined ? body.durationMin : existing.durationMin,
      remindBeforeMin: body.remindBeforeMin !== undefined ? body.remindBeforeMin : existing.remindBeforeMin,
      note: body.note !== undefined ? body.note : existing.note
    };

    const clean = validateSchedulePayload(mergedInput, { workspace: req.workspace, now });
    await col.updateOne(
      { _id: oid },
      { $set: { ...clean, updatedAt: now } }
    );
    const updated = { ...existing, ...clean, updatedAt: now };
    res.json({ item: publicSchedule(updated) });
  })
);

router.delete(
  '/:id',
  writeLimiter,
  wrap(async (req, res) => {
    await ensureScheduleIndexes(req.db);
    const oid = parseObjectId(req.params.id);
    if (!oid) throw bad('Không tìm thấy lịch live.', 404);

    const col = req.db.collection('live_schedule');
    const existing = await col.findOne({ _id: oid });
    if (!existing) throw bad('Không tìm thấy lịch live.', 404);
    if (existing.status !== 'cancelled') {
      throw bad('Hủy lịch trước rồi mới xóa.', 409);
    }

    await col.deleteOne({ _id: oid });
    res.json({ ok: true });
  })
);

router.linkSession = linkSession;
router.validateSchedulePayload = validateSchedulePayload;
router.publicSchedule = publicSchedule;
router.ensureScheduleIndexes = ensureScheduleIndexes;

module.exports = router;
