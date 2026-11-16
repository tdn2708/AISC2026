/**
 * KẾT NỐI ZALO BOT PLATFORM
 * ==================================================================
 * Gói gọn mọi lời gọi tới Zalo Bot Platform:
 *   - Không bao giờ đưa URL hay thông báo lỗi gốc của axios (có chứa mã bot)
 *     vào lỗi ném ra hoặc nhật ký.
 *   - Tự ngắt mạch 2 phút khi gặp 5 lỗi liên tiếp để không kéo máy chủ chậm theo.
 *   - Hỗ trợ cả hai chế độ nhận tin: long-polling (máy local) và webhook (Render).
 */

const axios = require('axios');
const crypto = require('crypto');
const { chunk } = require('./text');

const BASE = () => (process.env.ZALO_API_BASE || 'https://bot-api.zaloplatforms.com').replace(/\/+$/, '');
const token = () => process.env.ZALO_BOT_TOKEN || '';

const TOKEN_RE = /^\d+:[A-Za-z0-9_-]{10,}$/;
let warnedBadToken = false;
let warnedWebhookConflict = false;

/** Kiểm tra biến môi trường ZALO_BOT_TOKEN đã đặt và đúng khuôn dạng chưa */
function configured() {
  const t = token();
  if (!t) return false;
  if (!TOKEN_RE.test(t)) {
    if (!warnedBadToken) {
      warnedBadToken = true;
      console.warn('[QUẢN GIA] Mã bot sai dạng.');
    }
    return false;
  }
  return true;
}

/** Chế độ hoạt động của kênh Zalo: poll | webhook | off */
function mode() {
  if (!configured() || process.env.ZALO_MODE === 'off') return 'off';
  if (process.env.ZALO_MODE === 'poll' || process.env.ZALO_MODE === 'webhook') {
    return process.env.ZALO_MODE;
  }
  return process.env.RENDER ? 'webhook' : 'poll';
}

class ZaloError extends Error {
  constructor(method, code, description) {
    const detail = description || code || 'lỗi không xác định';
    super(`Zalo ${method}: ${detail}`);
    this.name = 'ZaloError';
    this.method = method;
    this.code = code || method;
    this.description = description || null;
  }
}

const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 2 * 60 * 1000;
let consecutiveFailures = 0;
let openUntilMs = 0;
let lastError = null;
let lastOkAt = null;

function resetCircuit() {
  consecutiveFailures = 0;
  openUntilMs = 0;
  lastError = null;
}

function isPollTimeout(method, code, description) {
  if (method !== 'getUpdates') return false;
  if (Number(code) === 408 || code === 'ECONNABORTED') return true;
  if (typeof description === 'string' && /timeout|time out|quá thời gian|no update/i.test(description)) return true;
  return false;
}

function recordFailure(err) {
  lastError = err.message;
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    openUntilMs = Date.now() + CIRCUIT_OPEN_MS;
  }
}

/**
 * Gọi một phương thức của Zalo Bot API.
 * Nhận tham số `post` để kiểm thử đơn vị không cần mạng.
 */
async function call(method, body = {}, { timeoutMs = 10000, post = axios.post } = {}) {
  if (Date.now() < openUntilMs) {
    const err = new ZaloError('circuit_open', 'circuit_open', 'Tạm ngắt kết nối Zalo sau 5 lỗi liên tiếp');
    err.openUntil = new Date(openUntilMs);
    throw err;
  }

  let res;
  try {
    const url = `${BASE()}/bot${token()}/${method}`;
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url);
    res = await post(url, body, {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
      ...(isLocal ? { proxy: false } : {})
    });
  } catch (netErr) {
    const code = netErr && netErr.code ? String(netErr.code) : 'network';
    const desc = code === 'ECONNABORTED' ? 'quá thời gian' : 'lỗi mạng';
    const zErr = new ZaloError(method, code, desc);
    if (isPollTimeout(method, code, desc)) {
      zErr.isTimeout = true;
      throw zErr;
    }
    recordFailure(zErr);
    throw zErr;
  }

  const status = res && typeof res.status === 'number' ? res.status : 500;
  const data = res && res.data && typeof res.data === 'object' ? res.data : null;

  if (status < 200 || status >= 300 || !data || data.ok !== true) {
    const code = data?.error_code ?? status;
    const desc = typeof data?.description === 'string' ? data.description : `HTTP ${status}`;
    const zErr = new ZaloError(method, code, desc);
    if (isPollTimeout(method, code, desc)) {
      zErr.isTimeout = true;
      throw zErr;
    }
    recordFailure(zErr);
    throw zErr;
  }

  consecutiveFailures = 0;
  openUntilMs = 0;
  lastError = null;
  lastOkAt = new Date();
  return data.result;
}

let meCache = { tokenKey: '', at: 0, value: null };
const ME_TTL_MS = 60 * 60 * 1000;

/** Lấy thông tin tài khoản bot (nhớ đệm 1 giờ) */
async function getMe(opts) {
  const tk = `${BASE()}|${token().slice(0, 6)}`;
  if (meCache.value && meCache.tokenKey === tk && Date.now() - meCache.at < ME_TTL_MS) {
    return meCache.value;
  }
  const r = await call('getMe', {}, opts);
  const val = {
    id: r?.id != null ? String(r.id) : '',
    name: r?.account_name || r?.name || 'Bot Zalo'
  };
  meCache = { tokenKey: tk, at: Date.now(), value: val };
  return val;
}

/** Cắt tin nhắn dài theo ngưỡng 2000 ký tự và gửi tuần tự từ đoạn `fromPart` */
async function sendText(chatId, text, opts = {}) {
  const parts = chunk(text, 2000);
  const startIdx = Math.max(0, Math.trunc(Number(opts.fromPart) || 0));
  let sentParts = startIdx;
  let lastId = null;
  for (let i = startIdx; i < parts.length; i += 1) {
    try {
      const r = await call('sendMessage', { chat_id: String(chatId), text: parts[i] }, opts);
      if (r && r.message_id != null) lastId = String(r.message_id);
      sentParts = i + 1;
      if (typeof opts.onPartSent === 'function') {
        await opts.onPartSent(sentParts, parts.length);
      }
    } catch (err) {
      if (err && typeof err === 'object') {
        err.sentParts = sentParts;
      }
      throw err;
    }
  }
  return lastId;
}

/** Gửi trạng thái đang gõ, bỏ qua mọi lỗi */
async function typing(chatId, opts) {
  try {
    await call('sendChatAction', { chat_id: String(chatId), action: 'typing' }, { timeoutMs: 5000, ...opts });
  } catch {
    // Không để lỗi trạng thái đang gõ ảnh hưởng luồng trả lời
  }
}

/** Đăng ký đường dẫn webhook với Zalo */
async function setWebhook(url, secret, opts) {
  return call('setWebhook', { url, secret_token: secret }, opts);
}

/** Trạng thái sức khỏe của kết nối Zalo */
function health() {
  const isOpen = Date.now() < openUntilMs;
  return {
    configured: configured(),
    mode: mode(),
    circuit: isOpen ? 'open' : 'closed',
    openUntil: isOpen ? new Date(openUntilMs) : null,
    lastError,
    lastOkAt
  };
}

/**
 * Chuẩn hóa dữ liệu sự kiện từ getUpdates hoặc webhook thành mảng đồng nhất.
 */
function normalizeUpdate(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => normalizeUpdate(item));
  }
  if ('result' in raw) {
    return normalizeUpdate(raw.result);
  }

  const eventName = typeof raw.event_name === 'string' ? raw.event_name : '';
  const msg = raw.message && typeof raw.message === 'object' ? raw.message : raw;
  if (!msg || typeof msg !== 'object') return [];
  if (msg.from && msg.from.is_bot === true) return [];

  const chatId = msg.chat?.id ?? msg.chat_id;
  const messageId = msg.message_id ?? msg.messageId;
  if (chatId == null || String(chatId).trim() === '' || messageId == null || String(messageId).trim() === '') {
    return [];
  }

  let kind = 'other';
  if (eventName) {
    kind = eventName === 'message.text.received' ? 'text' : 'other';
  } else if (typeof msg.message_type === 'string') {
    kind = msg.message_type.toLowerCase() === 'text' ? 'text' : 'other';
  } else if (typeof msg.text === 'string') {
    kind = 'text';
  }

  const fromName = String(msg.from?.display_name || msg.from?.name || 'Người dùng Zalo').trim().slice(0, 80);
  const text = kind === 'text' ? String(msg.text ?? '') : '';

  let at = new Date();
  if (msg.date != null) {
    const n = Number(msg.date);
    if (Number.isFinite(n) && n > 0) {
      at = new Date(n < 1e11 ? n * 1000 : n);
    } else {
      const parsed = new Date(msg.date);
      if (!Number.isNaN(parsed.getTime())) at = parsed;
    }
  }

  return [
    {
      messageId: String(messageId),
      chatId: String(chatId),
      fromName,
      text,
      at,
      kind
    }
  ];
}

/** Kiểm tra X-Bot-Api-Secret-Token bằng so sánh thời gian hằng số */
function verifySecret(headerValue, envSecret = process.env.ZALO_WEBHOOK_SECRET) {
  const secret = String(envSecret || '');
  if (!secret || typeof headerValue !== 'string' || !headerValue) return false;
  const a = Buffer.from(headerValue, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Bật vòng lặp long-polling nhận tin từ Zalo (chỉ chạy khi mode === 'poll') */
function startPolling(onUpdate) {
  if (mode() !== 'poll') return () => {};
  let stopped = false;
  let sleepTimer = null;
  let sleepResolve = null;
  let failStep = 0;

  const sleep = (ms) =>
    new Promise((resolve) => {
      sleepResolve = resolve;
      sleepTimer = setTimeout(() => {
        sleepTimer = null;
        sleepResolve = null;
        resolve();
      }, ms);
      if (sleepTimer.unref) sleepTimer.unref();
    });

  (async () => {
    while (!stopped) {
      try {
        const result = await call('getUpdates', { timeout: '30' }, { timeoutMs: 40000 });
        failStep = 0;
        if (stopped) break;
        const list = normalizeUpdate(result);
        for (const u of list) {
          try {
            onUpdate(u);
          } catch (e) {
            console.error('[QUẢN GIA] Lỗi đẩy tin vào hàng đợi:', e.message);
          }
        }
      } catch (err) {
        if (stopped) break;
        if (err && err.isTimeout) continue;
        if (/webhook/i.test(String(err?.message || ''))) {
          if (!warnedWebhookConflict) {
            warnedWebhookConflict = true;
            console.warn('Bot này đang dùng webhook (có thể của Render). Máy local cần bot riêng.');
          }
          await sleep(5 * 60 * 1000);
          continue;
        }
        const delays = [5000, 10000, 20000, 40000, 60000];
        const waitMs = delays[Math.min(failStep, delays.length - 1)];
        failStep += 1;
        await sleep(waitMs);
      }
    }
  })();

  return () => {
    stopped = true;
    if (sleepTimer) clearTimeout(sleepTimer);
    if (sleepResolve) sleepResolve();
  };
}

module.exports = {
  ZaloError,
  configured,
  mode,
  call,
  getMe,
  sendText,
  typing,
  setWebhook,
  health,
  normalizeUpdate,
  verifySecret,
  startPolling,
  resetCircuit
};
