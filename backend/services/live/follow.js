/**
 * THEO DÕI KÊNH: TỰ MỞ PHIÊN KHI SHOP LÊN LIVE
 * ==================================================================
 * Shop hợp tác (ví dụ TikTok @bluestonevn) live nhiều lần mỗi ngày; chờ người bấm "Mở
 * phiên live" thì bỏ lỡ bình luận đầu phiên hoặc cả phiên. Mỗi kho dữ liệu thật lưu tối
 * đa MAX_FOLLOWS kênh trong `live_follow`; cứ LIVE_FOLLOW_MIN phút (mặc định 10) máy
 * chủ hỏi TikTok kênh có đang live không, có thì mở phiên đọc bình luận như khi bấm tay
 * (cùng danh mục hàng đã lưu). Hết live thì phiên tự kết thúc như thường (STREAM_END).
 *
 * Chỉ ĐỌC dữ liệu công khai, như bộ kết nối TikTok. Hỏi trạng thái mỗi kênh tối đa một
 * lần mỗi nhịp; TikTok tạm chặn (DEVICE_BLOCKED, 429) thì kênh đó nghỉ 60 phút, lỗi
 * khác nghỉ 10 phút, để không làm lần chặn dài thêm. Kho mô phỏng không theo dõi.
 * Render ngủ sau 15 phút không có request: cần ping ngoài (UptimeRobot) để vòng này chạy.
 * Tắt bằng LIVE_FOLLOW=0.
 */
const crypto = require('crypto');
const hub = require('./hub');

const MAX_FOLLOWS = 5;
const EVERY_MS = Math.max(2, Number(process.env.LIVE_FOLLOW_MIN) || 10) * 60 * 1000;
const BLOCK_BACKOFF_MS = 60 * 60 * 1000;
const ERROR_BACKOFF_MS = 10 * 60 * 1000;
const ACTIVE = ['connecting', 'live', 'reconnecting'];

function cleanTikTok(target) {
  const s = String(target || '').trim();
  const m = s.match(/tiktok\.com\/@([\w.]+)/i);
  const id = (m ? m[1] : s.replace(/^@/, '')).trim();
  return /^[\w.]{2,40}$/.test(id) ? id : null;
}

/** Kênh TikTok có đang live không (một lần hỏi, không mở kết nối nhận bình luận) */
async function isTikTokLive(target) {
  const lib = await import('tiktok-live-connector');
  const conn = new lib.TikTokLiveConnection(target, {
    signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined,
    processInitialData: false
  });
  return Boolean(await conn.fetchIsLive());
}

/** Phiên mới cho một kênh đang theo dõi, cùng dạng phiên mở tay (routes/live.js) */
function sessionFor(follow, now) {
  const products = Array.isArray(follow.products) ? follow.products : [];
  return {
    title: `${follow.title || `@${follow.target}`} ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`,
    platform: 'tiktok',
    target: follow.target,
    simulated: false,
    speed: null,
    seed: null,
    products,
    policy: follow.policy || {},
    currentProductId: products[0]?.id || null,
    status: 'connecting',
    ingestKey: crypto.randomBytes(12).toString('hex'),
    createdAt: now,
    followId: follow._id,
    autoStarted: true
  };
}

/**
 * Một nhịp: mọi kho thật (kho chung và kho riêng từng shop). Trả danh sách phiên đã mở.
 * isLive và now đưa vào được để kiểm thử.
 */
async function tick(workspaces, { isLive = isTikTokLive, now = new Date(), log = console.log } = {}) {
  const opened = [];
  for (const [key, db] of Object.entries(workspaces || {})) {
    if (key === 'demo' || !db) continue;
    let follows = [];
    try {
      follows = await db.collection('live_follow').find({ enabled: true }).limit(MAX_FOLLOWS).toArray();
    } catch { continue; }
    for (const f of follows) {
      if (f.backoffUntil && new Date(f.backoffUntil) > now) continue;
      const running = await db.collection('live_sessions')
        .find({ platform: 'tiktok', target: f.target, status: { $in: ACTIVE } }, { projection: { _id: 1 } }).toArray();
      if (running.some((s) => hub.runtimeFor(s._id, key))) continue;
      let live = false;
      try {
        live = await isLive(f.target);
      } catch (e) {
        const blocked = /DEVICE_BLOCKED|429|rate/i.test(String(e?.message || e));
        await db.collection('live_follow').updateOne({ _id: f._id }, {
          $set: { lastCheckAt: now, lastError: String(e?.message || e).slice(0, 200), backoffUntil: new Date(now.getTime() + (blocked ? BLOCK_BACKOFF_MS : ERROR_BACKOFF_MS)) }
        });
        continue;
      }
      await db.collection('live_follow').updateOne({ _id: f._id }, { $set: { lastCheckAt: now, lastLive: live, lastError: null, backoffUntil: null } });
      if (!live) continue;
      const session = sessionFor(f, now);
      await hub.ensureIndexes(db);
      const { insertedId } = await db.collection('live_sessions').insertOne(session);
      session._id = insertedId;
      await hub.startSession(db, key, session);
      try { require('../../routes/live_schedule').linkSession(db, session).catch(() => {}); } catch { /* lịch không bắt buộc */ }
      await db.collection('live_follow').updateOne({ _id: f._id }, { $set: { lastStartedAt: now, lastSessionId: insertedId } });
      log(`[LIVE] Theo dõi kênh: @${f.target} đang live, đã tự mở phiên ${insertedId} (kho ${key})`);
      opened.push({ key, target: f.target, sessionId: String(insertedId) });
    }
  }
  return opened;
}

let timer = null;
function startFollowing(workspaces) {
  if (String(process.env.LIVE_FOLLOW) === '0' || timer) return null;
  const run = () => tick(workspaces).catch((e) => console.warn('[LIVE] Theo dõi kênh lỗi:', e.message));
  setTimeout(run, 60 * 1000).unref?.();
  timer = setInterval(run, EVERY_MS);
  timer.unref?.();
  return timer;
}

module.exports = { tick, startFollowing, cleanTikTok, sessionFor, MAX_FOLLOWS, isTikTokLive };
