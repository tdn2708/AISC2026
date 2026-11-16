/**
 * LƯU TRỮ DỮ LIỆU QUẢN GIA TRONG DATABASE TÀI KHOẢN (authDb)
 * ==================================================================
 * Tách riêng trong authDb để theo từng tài khoản người dùng và không bị
 * lệnh nạp lại dữ liệu mô phỏng (npm run seed) xóa mất.
 */

const crypto = require('crypto');
const { ObjectId } = require('mongodb');

const DEFAULT_SETTINGS = {
  workspace: 'real',
  notifyLevel: 'high',
  quietFrom: 22,
  quietTo: 7,
  digest: true,
  digestHour: 8,
  muteUntil: null
};

const VALID_WORKSPACES = new Set(['real', 'demo']);
const VALID_LEVELS = new Set(['critical', 'high', 'all']);

async function ensureButlerIndexes(authDb) {
  const specs = [
    ['butler_links', { userId: 1 }, { unique: true }],
    ['butler_links', { chatId: 1 }, { unique: true, partialFilterExpression: { chatId: { $type: 'string' } } }],
    ['butler_link_codes', { codeHash: 1 }, { unique: true }],
    ['butler_link_codes', { expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ['butler_messages', { userId: 1, at: -1 }],
    ['butler_messages', { at: 1 }, { expireAfterSeconds: 2592000 }],
    ['butler_incidents', { workspace: 1, resolvedAt: 1, lastSeenAt: -1 }],
    ['butler_incidents', { lastSeenAt: 1 }, { expireAfterSeconds: 2592000 }],
    ['butler_outbox', { dedupKey: 1 }, { unique: true }],
    ['butler_outbox', { status: 1, nextAttemptAt: 1 }],
    ['butler_outbox', { userId: 1, createdAt: -1 }],
    ['butler_outbox', { createdAt: 1 }, { expireAfterSeconds: 2592000 }],
    ['butler_inbound', { at: 1 }, { expireAfterSeconds: 172800 }],
    ['butler_pending', { expiresAt: 1 }, { expireAfterSeconds: 0 }]
  ];
  const results = await Promise.allSettled(
    specs.map(([coll, keys, opts]) => authDb.collection(coll).createIndex(keys, opts))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[QUẢN GIA] Không tạo được chỉ mục ${specs[i][0]}:`, r.reason?.message || r.reason);
    }
  });
}

function toObjectId(userId) {
  return userId instanceof ObjectId ? userId : new ObjectId(String(userId));
}

function unwrapFindAndModify(res) {
  if (!res) return null;
  if (typeof res === 'object' && 'value' in res && ('ok' in res || 'lastErrorObject' in res)) {
    return res.value;
  }
  return res;
}

/** Lấy bản ghi kết nối của người dùng; chưa có thì khởi tạo mặc định */
async function getLink(authDb, userId) {
  const uid = toObjectId(userId);
  const now = new Date();
  const res = await authDb.collection('butler_links').findOneAndUpdate(
    { userId: uid },
    {
      $setOnInsert: {
        userId: uid,
        chatId: null,
        zaloName: null,
        linkedAt: null,
        settings: { ...DEFAULT_SETTINGS },
        lastList: null,
        lastDigestOn: null,
        watchStarted: {},
        createdAt: now,
        updatedAt: now
      }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return unwrapFindAndModify(res);
}

/** Tìm bản ghi kết nối theo chatId của Zalo */
async function findLinkByChat(authDb, chatId) {
  if (!chatId) return null;
  return authDb.collection('butler_links').findOne({ chatId: String(chatId) });
}

function badRequest(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

/** Kiểm tra và cập nhật cài đặt báo của người dùng */
async function updateSettings(authDb, userId, patch = {}) {
  if (!patch || typeof patch !== 'object') {
    throw badRequest('Dữ liệu cài đặt không hợp lệ.');
  }

  const updates = {};
  if ('workspace' in patch) {
    if (!VALID_WORKSPACES.has(patch.workspace)) {
      throw badRequest('Kho dữ liệu phải là "real" hoặc "demo".');
    }
    updates['settings.workspace'] = patch.workspace;
  }

  if ('notifyLevel' in patch) {
    if (!VALID_LEVELS.has(patch.notifyLevel)) {
      throw badRequest('Mức độ báo phải là "critical", "high" hoặc "all".');
    }
    updates['settings.notifyLevel'] = patch.notifyLevel;
  }

  for (const hourField of ['quietFrom', 'quietTo', 'digestHour']) {
    if (hourField in patch) {
      const h = Number(patch[hourField]);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        throw badRequest(`Giờ (${hourField}) phải là số nguyên từ 0 đến 23.`);
      }
      updates[`settings.${hourField}`] = h;
    }
  }

  if ('digest' in patch) {
    if (typeof patch.digest !== 'boolean') {
      throw badRequest('Trường bản tin sáng (digest) phải là true hoặc false.');
    }
    updates['settings.digest'] = patch.digest;
  }

  if ('muteUntil' in patch) {
    if (patch.muteUntil === null || patch.muteUntil === '') {
      updates['settings.muteUntil'] = null;
    } else {
      const d = new Date(patch.muteUntil);
      const maxMs = Date.now() + 7 * 24 * 3600 * 1000 + 60 * 1000;
      if (Number.isNaN(d.getTime()) || d.getTime() > maxMs) {
        throw badRequest('Thời điểm tạm im không hợp lệ hoặc vượt quá 7 ngày.');
      }
      updates['settings.muteUntil'] = d;
    }
  }

  if (Object.keys(updates).length === 0) {
    return getLink(authDb, userId);
  }

  await getLink(authDb, userId);
  const uid = toObjectId(userId);
  updates.updatedAt = new Date();
  const res = await authDb.collection('butler_links').findOneAndUpdate(
    { userId: uid },
    { $set: updates },
    { returnDocument: 'after' }
  );
  return unwrapFindAndModify(res);
}

/** Tạo mã nối Zalo 6 chữ số có hạn 10 phút, xóa mã cũ của cùng người dùng */
async function createLinkCode(authDb, userId) {
  const uid = toObjectId(userId);
  await authDb.collection('butler_link_codes').deleteMany({ userId: uid });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await authDb.collection('butler_link_codes').insertOne({
    codeHash,
    userId: uid,
    createdAt: new Date(),
    expiresAt
  });
  return { code, expiresAt };
}

/** Đổi mã 6 chữ số lấy userId (chỉ dùng một lần, kiểm tra còn hạn) */
async function consumeLinkCode(authDb, code) {
  const clean = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const codeHash = crypto.createHash('sha256').update(clean).digest('hex');
  const res = await authDb.collection('butler_link_codes').findOneAndDelete({
    codeHash,
    expiresAt: { $gt: new Date() }
  });
  const doc = unwrapFindAndModify(res);
  return doc ? doc.userId : null;
}

/** Gắn chatId Zalo vào tài khoản; đảm bảo mỗi chatId chỉ gắn với một tài khoản */
async function linkChat(authDb, userId, chatId, zaloName) {
  const uid = toObjectId(userId);
  const cid = String(chatId);
  const zName = String(zaloName || 'Người dùng Zalo').trim().slice(0, 80);
  await getLink(authDb, uid);
  await authDb.collection('butler_links').updateMany(
    { chatId: cid, userId: { $ne: uid } },
    { $set: { chatId: null, zaloName: null, linkedAt: null, updatedAt: new Date() } }
  );
  const res = await authDb.collection('butler_links').findOneAndUpdate(
    { userId: uid },
    {
      $set: {
        chatId: cid,
        zaloName: zName,
        linkedAt: new Date(),
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  return unwrapFindAndModify(res);
}

/** Ngắt kết nối Zalo khỏi tài khoản; trả bản ghi trước khi ngắt */
async function unlink(authDb, userId) {
  const uid = toObjectId(userId);
  const prev = await getLink(authDb, uid);
  await authDb.collection('butler_links').updateOne(
    { userId: uid },
    { $set: { chatId: null, zaloName: null, linkedAt: null, updatedAt: new Date() } }
  );
  return prev;
}

/** Lưu danh sách việc đánh số gần nhất của người dùng */
async function saveLastList(authDb, userId, lastList) {
  const uid = toObjectId(userId);
  await getLink(authDb, uid);
  await authDb.collection('butler_links').updateOne(
    { userId: uid },
    { $set: { lastList, updatedAt: new Date() } }
  );
}

/** Lưu một tin nhắn vào lịch sử chung web và Zalo */
async function saveMessage(authDb, { userId, channel, role, text, reply = null, workspace = 'real', at = new Date() }) {
  const uid = toObjectId(userId);
  const doc = {
    userId: uid,
    channel: channel === 'zalo' ? 'zalo' : 'web',
    role: role === 'butler' ? 'butler' : 'user',
    text: String(text ?? '').slice(0, 4000),
    reply: reply || null,
    workspace: workspace === 'demo' ? 'demo' : 'real',
    at: at instanceof Date ? at : new Date(at)
  };
  const r = await authDb.collection('butler_messages').insertOne(doc);
  return {
    ...doc,
    _id: String(r.insertedId),
    userId: String(uid)
  };
}

/** Đọc lịch sử tin nhắn từ cũ tới mới, hỗ trợ tải thêm tin cũ qua tham số before */
async function recentMessages(authDb, userId, { before, limit = 30 } = {}) {
  const uid = toObjectId(userId);
  const lim = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 30)));
  const filter = { userId: uid };

  if (before) {
    const bStr = String(before).trim();
    if (/^[0-9a-fA-F]{24}$/.test(bStr)) {
      const target = await authDb.collection('butler_messages').findOne({ _id: new ObjectId(bStr), userId: uid });
      if (target) {
        filter.$or = [
          { at: { $lt: target.at } },
          { at: target.at, _id: { $lt: target._id } }
        ];
      } else {
        filter._id = { $lt: new ObjectId(bStr) };
      }
    } else {
      const d = new Date(bStr);
      if (!Number.isNaN(d.getTime())) {
        filter.at = { $lt: d };
      }
    }
  }

  const rows = await authDb
    .collection('butler_messages')
    .find(filter)
    .sort({ at: -1, _id: -1 })
    .limit(lim + 1)
    .toArray();

  const hasMore = rows.length > lim;
  const items = rows
    .slice(0, lim)
    .reverse()
    .map((m) => ({
      ...m,
      _id: String(m._id),
      userId: String(m.userId)
    }));

  return { messages: items, hasMore };
}

/** Ghi lệnh chờ xác nhận (hạn 5 phút, đè lệnh cũ nếu có) */
async function setPending(authDb, userId, { action, args = {}, workspace = 'real', prompt = '' }) {
  const id = String(userId);
  const now = new Date();
  const doc = {
    _id: id,
    action,
    args,
    workspace: workspace === 'demo' ? 'demo' : 'real',
    prompt: String(prompt || ''),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
  };
  await authDb.collection('butler_pending').updateOne(
    { _id: id },
    { $set: doc },
    { upsert: true }
  );
  return doc;
}

/** Lấy và xóa nguyên tử lệnh đang chờ xác nhận nếu còn hạn */
async function takePending(authDb, userId) {
  const id = String(userId);
  const res = await authDb.collection('butler_pending').findOneAndDelete({
    _id: id,
    expiresAt: { $gt: new Date() }
  });
  return unwrapFindAndModify(res);
}

/** Xem lệnh đang chờ xác nhận mà không xóa */
async function peekPending(authDb, userId) {
  const id = String(userId);
  return authDb.collection('butler_pending').findOne({
    _id: id,
    expiresAt: { $gt: new Date() }
  });
}

/** Hủy lệnh đang chờ xác nhận */
async function clearPending(authDb, userId) {
  const id = String(userId);
  await authDb.collection('butler_pending').deleteOne({ _id: id });
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureButlerIndexes,
  getLink,
  findLinkByChat,
  updateSettings,
  createLinkCode,
  consumeLinkCode,
  linkChat,
  unlink,
  saveLastList,
  saveMessage,
  recentMessages,
  setPending,
  takePending,
  peekPending,
  clearPending
};
