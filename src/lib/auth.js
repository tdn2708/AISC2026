import axios from 'axios';

/**
 * PHIÊN ĐĂNG NHẬP PHÍA TRÌNH DUYỆT
 * ------------------------------------------------------------------
 * Máy chủ (backend/routes/auth.js) trả một token; trình duyệt gửi lại bằng
 * header `Authorization: Bearer`. Không dùng cookie vì giao diện (Vercel) và
 * máy chủ (Render) khác tên miền.
 *
 *   "Giữ đăng nhập" bật:  localStorage, còn sau khi đóng trình duyệt (máy chủ giữ 30 ngày)
 *   "Giữ đăng nhập" tắt:  sessionStorage, mất khi đóng tab (máy chủ giữ 12 giờ)
 *
 * Mọi thay đổi phát sự kiện `cr-auth` trên window; App và thanh bên nghe nó.
 * Lỗi bộ nhớ trình duyệt (chế độ riêng tư) không làm sập trang: khi đó phiên
 * chỉ sống trong bộ nhớ của tab.
 */
const KEY = 'cr-session';
let memory = null;

const stores = () => {
  const out = [];
  try { out.push(window.localStorage); } catch { /* bị chặn */ }
  try { out.push(window.sessionStorage); } catch { /* bị chặn */ }
  return out;
};

const readStored = () => {
  for (const s of stores()) {
    try {
      const raw = s.getItem(KEY);
      if (!raw) continue;
      const v = JSON.parse(raw);
      if (v && typeof v.token === 'string' && v.user) return v;
    } catch { /* hỏng thì coi như không có */ }
  }
  return null;
};

const applyHeader = (sess) => {
  if (sess?.token) axios.defaults.headers.common.Authorization = `Bearer ${sess.token}`;
  else delete axios.defaults.headers.common.Authorization;
};

const emit = () => {
  try { window.dispatchEvent(new Event('cr-auth')); } catch { /* môi trường không có window */ }
};

/** Phiên hiện tại { token, user, expiresAt } hoặc null (đã hết hạn thì coi như không có) */
export const getSession = () => {
  const s = memory || readStored();
  if (!s) return null;
  if (s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now()) return null;
  return s;
};

export const currentAccount = () => getSession()?.user || null;

const save = (sess, remember) => {
  memory = sess;
  const [local, session] = stores();
  for (const s of stores()) { try { s.removeItem(KEY); } catch { /* bỏ qua */ } }
  const target = remember ? local : session || local;
  try { target?.setItem(KEY, JSON.stringify(sess)); } catch { /* chỉ giữ trong bộ nhớ */ }
  applyHeader(sess);
  emit();
};

const clear = () => {
  memory = null;
  for (const s of stores()) { try { s.removeItem(KEY); } catch { /* bỏ qua */ } }
  applyHeader(null);
  emit();
};

/**
 * Gọi một lần lúc nạp app: gắn header nếu đã có phiên, và nghe lỗi 401
 * "auth_required" của API dữ liệu (phiên hết hạn hoặc bị đăng xuất ở máy khác):
 * xóa phiên ở đây, App thấy sự kiện cr-auth và đưa về /auth?next=<trang đang xem>.
 * 401 của khóa ghi (X-Write-Key) không có mã này nên không làm đăng xuất.
 */
let intercepted = false;
export const applyAuthHeader = () => {
  applyHeader(getSession());
  if (intercepted) return;
  intercepted = true;
  axios.interceptors.response.use(undefined, (err) => {
    if (err?.response?.status === 401 && err.response.data?.code === 'auth_required' && getSession()) clear();
    // Máy chủ chặn vì còn dùng mật khẩu tạm: bật cờ để hộp "Đặt mật khẩu mới" hiện ra
    if (err?.response?.status === 403 && err.response.data?.code === 'password_change_required') {
      const s = getSession();
      if (s && !s.user?.mustChangePassword) {
        const keep = (() => { try { return Boolean(window.localStorage.getItem(KEY)); } catch { return false; } })();
        save({ ...s, user: { ...s.user, mustChangePassword: true } }, keep);
      }
    }
    return Promise.reject(err);
  });
};

/** Token cho chỗ không gửi được header (EventSource, liên kết tải file) */
export const sessionToken = () => getSession()?.token || null;

/** Câu lỗi để hiện cho người dùng, kèm lỗi từng ô nếu máy chủ trả */
export const authError = (e) => {
  const data = e?.response?.data || {};
  if (!e?.response) return { message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', fields: {} };
  return { message: data.error || 'Có lỗi ở máy chủ. Thử lại sau ít phút.', fields: data.fields || {}, status: e.response.status };
};

export const isAdmin = (u = currentAccount()) => u?.role === 'admin';

export const homeFor = (u = currentAccount()) => (isAdmin(u) ? '/admin' : '/dashboard');

export async function login({ email, password, remember = true, scope }) {
  const payload = { email, password, remember };
  if (scope) payload.scope = scope;
  const { data } = await axios.post('/auth/login', payload);
  save({ token: data.token, user: data.user, expiresAt: data.expiresAt }, scope === 'admin' ? false : remember);
  return data.user;
}

export async function changePassword({ current, next }) {
  const s = getSession();
  const { data } = await axios.post('/auth/password', { current, next });
  const keep = (() => { try { return Boolean(window.localStorage.getItem(KEY)); } catch { return false; } })();
  if (s) {
    const nextUser = data.user || { ...s.user, mustChangePassword: false };
    save({ ...s, user: nextUser }, keep);
    return nextUser;
  }
  return data.user || null;
}

export async function signup({ name, shop, email, password, remember = true, acceptTerms = false }) {
  const { data } = await axios.post('/auth/signup', { name, shop, email, password, remember, acceptTerms });
  save({ token: data.token, user: data.user, expiresAt: data.expiresAt }, remember);
  return data.user;
}

export async function logout() {
  const had = getSession();
  // Xóa phía trình duyệt trước: mạng chậm cũng không giữ người dùng lại
  clear();
  if (had?.token) {
    try { await axios.post('/auth/logout', null, { headers: { Authorization: `Bearer ${had.token}` } }); } catch { /* phiên tự hết hạn ở máy chủ */ }
  }
}

/** Kiểm lại phiên với máy chủ. 401 thì đăng xuất; mất mạng thì giữ nguyên. */
export async function refreshAccount() {
  const s = getSession();
  if (!s) return null;
  try {
    const { data } = await axios.get('/auth/me');
    const keep = (() => { try { return Boolean(window.localStorage.getItem(KEY)); } catch { return false; } })();
    save({ ...s, user: data.user }, keep);
    return data.user;
  } catch (e) {
    if (e?.response?.status === 401) clear();
    return s.user;
  }
}

export async function updateAccount(patch) {
  const s = getSession();
  const { data } = await axios.patch('/auth/me', patch);
  const keep = (() => { try { return Boolean(window.localStorage.getItem(KEY)); } catch { return false; } })();
  if (s) save({ ...s, user: data.user }, keep);
  return data.user;
}

/** Luật mật khẩu, khớp backend/services/auth.js passwordProblems */
export const PASSWORD_RULES = [
  { id: 'len', label: 'Ít nhất 8 ký tự', test: (pw) => pw.length >= 8 },
  { id: 'mix', label: 'Có cả chữ và số', test: (pw) => /\p{L}/u.test(pw) && /\d/.test(pw) }
];

export const DEMO_LOGIN = { email: 'demo@customerradar.vn', password: 'demo2026' };

/** Chỉ nhận đường dẫn nội bộ cho ?next=, tránh bị dẫn sang trang ngoài */
export const safeNext = (v, user = currentAccount()) => {
  const s = String(v || '');
  const fallback = homeFor(user);
  if (
    !s.startsWith('/') ||
    s.startsWith('//') ||
    s.startsWith('/auth') ||
    s.startsWith('/login') ||
    s.startsWith('/signup') ||
    s.startsWith('/admin/login')
  ) {
    return fallback;
  }
  if (s.startsWith('/admin') && !isAdmin(user)) return '/dashboard';
  return s;
};
