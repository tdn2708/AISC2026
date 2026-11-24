import axios from 'axios';
import { DEMO_LOGIN } from './auth';

/**
 * GỌI API BÀN ĐIỀU KHIỂN MÁY CHỦ (/api/admin/*)
 * ------------------------------------------------------------------
 * Header Authorization và X-Write-Key đã gắn chung ở axios.defaults.
 */

const SELF_FORBIDDEN = new Set(['lock', 'delete_user', 'set_role']);
const DEMO_ALLOWED = new Set(['revoke_sessions', 'revoke_session']);
const LAST_ADMIN_ACTIONS = new Set(['set_role', 'delete_user', 'lock']);

export const adminError = (err) => {
  if (!err?.response) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return err.response.data?.error || 'Có lỗi ở máy chủ. Thử lại sau ít phút.';
};

/**
 * Phản chiếu chốt chặn guard() ở backend/services/admin.js để nút tắt sớm kèm đúng lý do.
 * Máy chủ vẫn luôn kiểm lại.
 */
export function guardAction(actor, target, action, { adminCount = 1 } = {}) {
  if (!target) return 'Không tìm thấy tài khoản.';
  if (target.email === DEMO_LOGIN.email && !DEMO_ALLOWED.has(action)) {
    return 'Tài khoản mẫu dùng chung nên không đổi được.';
  }
  const actorId = actor?.id || actor?._id;
  const targetId = target?.id || target?._id;
  if (actorId && targetId && String(actorId) === String(targetId) && SELF_FORBIDDEN.has(action)) {
    return 'Không tự khóa, tự xóa hay tự đổi vai trò của chính mình.';
  }
  if (target.role === 'admin' && LAST_ADMIN_ACTIONS.has(action) && Number(adminCount) <= 1) {
    return 'Phải còn ít nhất một quản trị viên.';
  }
  return null;
}

export async function getOverview() {
  const { data } = await axios.get('/admin/overview');
  return data;
}

export async function getUsers(params = {}) {
  const { data } = await axios.get('/admin/users', { params });
  return data;
}

export async function getUser(id) {
  const { data } = await axios.get(`/admin/users/${encodeURIComponent(id)}`);
  return data;
}

export async function lockUser(id, reason) {
  const { data } = await axios.post(`/admin/users/${encodeURIComponent(id)}/lock`, { reason });
  return data;
}

export async function unlockUser(id) {
  const { data } = await axios.post(`/admin/users/${encodeURIComponent(id)}/unlock`);
  return data;
}

export async function revokeAllSessions(id) {
  const { data } = await axios.post(`/admin/users/${encodeURIComponent(id)}/sessions/revoke`);
  return data;
}

export async function revokeSession(sid) {
  const { data } = await axios.delete(`/admin/sessions/${encodeURIComponent(sid)}`);
  return data;
}

export async function resetPassword(id) {
  const { data } = await axios.post(`/admin/users/${encodeURIComponent(id)}/reset-password`);
  return data;
}

export async function setRole(id, role) {
  const { data } = await axios.post(`/admin/users/${encodeURIComponent(id)}/role`, { role });
  return data;
}

export async function deleteUser(id, confirmEmail) {
  const { data } = await axios.delete(`/admin/users/${encodeURIComponent(id)}`, {
    data: { confirmEmail }
  });
  return data;
}

export async function getAudit(params = {}) {
  const { data } = await axios.get('/admin/audit', { params });
  return data;
}

export const roleLabel = (role) => (role === 'admin' ? 'Quản trị' : 'Người dùng');

export const AUDIT_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'lock', label: 'Khóa' },
  { value: 'unlock', label: 'Mở khóa' },
  { value: 'revoke_sessions', label: 'Đăng xuất mọi máy' },
  { value: 'revoke_session', label: 'Đăng xuất một phiên' },
  { value: 'reset_password', label: 'Đặt lại mật khẩu' },
  { value: 'set_role', label: 'Đổi vai trò' },
  { value: 'delete_user', label: 'Xóa tài khoản' },
  { value: 'login', label: 'Đăng nhập quản trị' }
];

const AUDIT_LABELS = {
  lock: 'Khóa',
  unlock: 'Mở khóa',
  revoke_sessions: 'Đăng xuất mọi máy',
  revoke_session: 'Đăng xuất một phiên',
  reset_password: 'Đặt lại mật khẩu',
  set_role: 'Đổi vai trò',
  delete_user: 'Xóa tài khoản',
  confirm_payment: 'Xác nhận đã nhận tiền',
  login: 'Đăng nhập quản trị'
};

export function auditActionLabel(item) {
  if (!item) return '';
  if (item.action === 'set_role' && item.detail?.from && item.detail?.to) {
    return `Đổi vai trò từ ${roleLabel(item.detail.from)} sang ${roleLabel(item.detail.to)}`;
  }
  return AUDIT_LABELS[item.action] || item.action;
}

export function auditActionTone(action) {
  if (action === 'lock' || action === 'delete_user') return 'crit';
  if (action === 'reset_password') return 'high';
  if (action === 'unlock') return 'ok';
  if (action === 'set_role' || action === 'login') return 'accent';
  return 'neutral';
}
