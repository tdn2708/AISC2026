/**
 * HÀNG ĐỢI TIN ĐI BỀN VỮNG TRONG MONGODB (butler_outbox)
 * ==================================================================
 * Mọi tin nhắn gửi qua Zalo (báo sự cố, bản tin sáng, trả lời lệnh, tin thử)
 * đều ghi vào butler_outbox trước kèm khóa chống trùng dedupKey.
 * Worker nền lấy từng tin một cách nguyên tử, thử lại tối đa 5 lần khi lỗi,
 * và tự hoàn trả tin bị treo nếu tiến trình trước dừng giữa chừng.
 */

const { ObjectId } = require('mongodb');
const zalo = require('./zalo');

const PROD_RETRY_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];
const FAST_RETRY_DELAYS_MS = [200, 400, 800, 1500];

function isFastRetry() {
  return process.env.BUTLER_FAST_RETRY === '1';
}

function toObjectId(userId) {
  if (!userId) return null;
  return userId instanceof ObjectId ? userId : new ObjectId(String(userId));
}

function unwrapDoc(res) {
  if (!res) return null;
  if (typeof res === 'object' && 'value' in res && ('ok' in res || 'lastErrorObject' in res)) {
    return res.value;
  }
  return res;
}

let activeAuthDb = null;
let timer = null;
let busy = false;
let pendingKick = false;
let lastSendAt = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

/** Đưa một tin nhắn vào hàng đợi outbox */
async function enqueue(authDb, { dedupKey, userId, chatId, kind = 'reply', text }) {
  const uid = toObjectId(userId);
  const cid = chatId ? String(chatId) : null;
  const now = new Date();

  let status = 'queued';
  let lastError = null;

  if (!zalo.configured()) {
    status = 'skipped';
    lastError = 'Chưa cấu hình bot Zalo';
  } else if (!cid) {
    status = 'skipped';
    lastError = 'Chưa nối Zalo';
  } else if (kind === 'alert' && uid) {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const count1h = await authDb.collection('butler_outbox').countDocuments({
      userId: uid,
      kind: 'alert',
      status: { $in: ['queued', 'sending', 'sent'] },
      createdAt: { $gte: hourAgo }
    });
    if (count1h >= 10) {
      status = 'skipped';
      lastError = 'Quá 10 tin trong một giờ, gộp vào bản tin sáng';
    }
  } else if (kind === 'live' && uid) {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const count1h = await authDb.collection('butler_outbox').countDocuments({
      userId: uid,
      kind: 'live',
      status: { $in: ['queued', 'sending', 'sent'] },
      createdAt: { $gte: hourAgo }
    });
    if (count1h >= 20) {
      status = 'skipped';
      lastError = 'Quá 20 tin live trong một giờ';
    }
  }

  const doc = {
    dedupKey: String(dedupKey),
    userId: uid,
    chatId: cid,
    kind,
    text: String(text ?? ''),
    status,
    tries: 0,
    sentParts: 0,
    nextAttemptAt: now,
    claimedAt: null,
    lastError,
    createdAt: now,
    sentAt: null
  };

  try {
    const r = await authDb.collection('butler_outbox').insertOne(doc);
    if (status === 'queued') {
      kick(authDb);
    }
    return { insertedId: r.insertedId, status, duplicate: false };
  } catch (e) {
    if (e && e.code === 11000) {
      return { duplicate: true };
    }
    throw e;
  }
}

/** Một nhịp xử lý hàng đợi tin đi */
async function tick(authDb) {
  if (!authDb || !zalo.configured()) return;
  if (busy) {
    pendingKick = true;
    return;
  }
  busy = true;
  try {
    const col = authDb.collection('butler_outbox');
    const now = new Date();

    // 1. Hoàn trả về queued các tin sending bị kẹt quá 2 phút
    const staleClaim = new Date(now.getTime() - 2 * 60 * 1000);
    await col.updateMany(
      { status: 'sending', claimedAt: { $lte: staleClaim } },
      { $set: { status: 'queued', claimedAt: null } }
    );

    // 2. Lấy nguyên tử tối đa 5 tin đến hạn gửi
    const maxBatch = 5;
    const claimed = [];
    for (let i = 0; i < maxBatch; i += 1) {
      const claimNow = new Date();
      const res = await col.findOneAndUpdate(
        { status: 'queued', nextAttemptAt: { $lte: claimNow } },
        { $set: { status: 'sending', claimedAt: claimNow } },
        { sort: { nextAttemptAt: 1 }, returnDocument: 'after' }
      );
      const doc = unwrapDoc(res);
      if (!doc) break;
      claimed.push(doc);
    }

    // 3. Luôn gửi tuần tự và giãn khoảng cách giữa hai tin
    const minGapMs = isFastRetry() ? 50 : 1100;
    const retryDelays = isFastRetry() ? FAST_RETRY_DELAYS_MS : PROD_RETRY_DELAYS_MS;

    const sendOne = async (item) => {
      const elapsed = Date.now() - lastSendAt;
      if (elapsed < minGapMs) {
        await sleep(minGapMs - elapsed);
      }

      const startParts = Math.max(0, Math.trunc(Number(item.sentParts) || 0));
      let currentSentParts = startParts;

      try {
        lastSendAt = Date.now();
        await zalo.sendText(item.chatId, item.text, {
          fromPart: startParts,
          onPartSent: (n) => {
            currentSentParts = n;
          }
        });
        await col.updateOne(
          { _id: item._id },
          {
            $set: {
              status: 'sent',
              sentParts: currentSentParts,
              sentAt: new Date(),
              claimedAt: null,
              lastError: null
            }
          }
        );
        return 'sent';
      } catch (err) {
        const cleanMsg = String(err?.message || 'Lỗi gửi Zalo').slice(0, 300);
        const savedParts = Number.isInteger(err?.sentParts) ? err.sentParts : currentSentParts;
        if (err && err.code === 'circuit_open') {
          const nextAt = err.openUntil instanceof Date ? err.openUntil : new Date(Date.now() + 2 * 60 * 1000);
          await col.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'queued',
                sentParts: savedParts,
                claimedAt: null,
                nextAttemptAt: nextAt,
                lastError: cleanMsg
              }
            }
          );
          return 'circuit_open';
        }

        const tries = (Number(item.tries) || 0) + 1;
        if (tries >= 5) {
          await col.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'failed',
                tries,
                sentParts: savedParts,
                claimedAt: null,
                lastError: cleanMsg
              }
            }
          );
        } else {
          const delayMs = retryDelays[Math.min(tries - 1, retryDelays.length - 1)];
          await col.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'queued',
                tries,
                sentParts: savedParts,
                claimedAt: null,
                nextAttemptAt: new Date(Date.now() + delayMs),
                lastError: cleanMsg
              }
            }
          );
        }
        return 'failed';
      }
    };

    for (const item of claimed) {
      const r = await sendOne(item);
      if (r === 'circuit_open') break;
    }

    if (claimed.length === maxBatch) {
      pendingKick = true;
    }
  } catch (e) {
    console.warn('[QUẢN GIA] Lỗi xử lý hàng đợi tin đi:', e.message);
  } finally {
    busy = false;
    if (pendingKick) {
      pendingKick = false;
      const dbRef = authDb || activeAuthDb;
      if (dbRef) {
        const t = setTimeout(() => tick(dbRef), isFastRetry() ? 50 : 200);
        if (t.unref) t.unref();
      }
    }
  }
}

function kick(authDb) {
  const dbRef = authDb || activeAuthDb;
  if (!dbRef || !zalo.configured()) return;
  const t = setTimeout(() => tick(dbRef), 10);
  if (t.unref) t.unref();
}

/** Bật bộ xử lý hàng đợi tin đi định kỳ */
function startOutbox(authDb) {
  activeAuthDb = authDb;
  if (timer) clearInterval(timer);
  const intervalMs = isFastRetry() ? 400 : 15000;
  timer = setInterval(() => {
    tick(authDb);
  }, intervalMs);
  if (timer.unref) timer.unref();
  kick(authDb);
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Thống kê tin đi của một tài khoản */
async function stats(authDb, userId) {
  const uid = toObjectId(userId);
  const col = authDb.collection('butler_outbox');
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [queued, failed24h, lastSent] = await Promise.all([
    col.countDocuments({ userId: uid, status: { $in: ['queued', 'sending'] } }),
    col.countDocuments({ userId: uid, status: 'failed', createdAt: { $gte: dayAgo } }),
    col.findOne({ userId: uid, status: 'sent' }, { sort: { sentAt: -1 }, projection: { sentAt: 1 } })
  ]);
  return {
    queued,
    failed24h,
    lastSentAt: lastSent?.sentAt || null
  };
}

/** Danh sách tin đi gần nhất của một tài khoản */
async function recentOutbox(authDb, userId, limit = 20) {
  const uid = toObjectId(userId);
  const lim = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 20)));
  const rows = await authDb
    .collection('butler_outbox')
    .find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray();
  return rows.map((r) => ({
    _id: String(r._id),
    kind: r.kind,
    text: String(r.text || '').slice(0, 300),
    status: r.status,
    tries: r.tries || 0,
    createdAt: r.createdAt,
    sentAt: r.sentAt || null,
    lastError: r.lastError || null
  }));
}

module.exports = {
  enqueue,
  tick,
  kick,
  startOutbox,
  stats,
  recentOutbox
};
