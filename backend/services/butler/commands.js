/**
 * HIỂU CÂU LỆNH QUẢN GIA (HÀM THUẦN)
 * ==================================================================
 * Phân loại tin nhắn của chủ shop bằng luật và biểu thức chính quy có neo,
 * không tốn lượt gọi mô hình ngôn ngữ. Câu không khớp lệnh nào mới chuyển
 * sang hỏi đáp trên dữ liệu.
 */

const { fold, vnParts } = require('./text');

const MAX_MUTE_MINUTES = 7 * 24 * 60;

/** Tính số phút từ hiện tại tới 7 giờ sáng gần nhất theo giờ Việt Nam */
function minutesUntilMorning(now = new Date()) {
  const { hour, minute } = vnParts(now);
  const cur = hour * 60 + minute;
  const target = 7 * 60;
  const diff = cur < target ? target - cur : (24 * 60 - cur) + target;
  return Math.max(1, Math.min(MAX_MUTE_MINUTES, diff));
}

/**
 * Phân tích một câu người dùng gửi vào lệnh có cấu trúc.
 * @param {string} text câu gốc người dùng nhập
 * @param {Date} [now] mốc thời gian (để tính "im đến sáng" khi kiểm thử)
 */
function parseCommand(text, now = new Date()) {
  const raw = String(text ?? '').trim();
  if (!raw) return { type: 'help' };

  if (raw === '?' || raw === '？') return { type: 'help' };

  // Bỏ dấu câu kết thúc (. ! ?) trước khi gấp chữ để khớp mẫu
  const stripped = raw.replace(/[.!?。！？]+$/u, '').trim();
  const f = fold(stripped);

  if (!f) return { type: 'help' };

  // 1. Trợ giúp
  if (/^(?:giup|tro giup|huong dan|lenh|help|\/help|\?)$/.test(f)) {
    return { type: 'help' };
  }

  // 2. Danh sách việc cần làm
  if (/^(?:viec|viec hom nay|co viec gi|can lam gi|\/viec|ds|danh sach viec)$/.test(f)) {
    return { type: 'tasks' };
  }

  // 3. Xem chi tiết / kế hoạch việc số n (1 đến 99)
  const detailMatch = /^(?:(?:xem|chi tiet|ke hoach)(?:\s+so)?\s+)?([1-9]\d?)$/.exec(f);
  if (detailMatch) {
    return { type: 'detail', n: Number(detailMatch[1]) };
  }

  // 4. Chấp nhận / duyệt việc số n (1 đến 99)
  const acceptMatch = /^(?:duyet|chap nhan|ok|dong y)(?:\s+so)?\s+([1-9]\d?)$/.exec(f);
  if (acceptMatch) {
    return { type: 'accept', n: Number(acceptMatch[1]) };
  }

  // 5. Bỏ qua việc số n kèm lý do (giữ nguyên dấu tiếng Việt ở phần lý do)
  const dismissFoldMatch = /^(?:bo qua|bo)(?:\s+so)?\s+([1-9]\d?)(?:\s|[:,-]|$)/.exec(f);
  if (dismissFoldMatch) {
    const n = Number(dismissFoldMatch[1]);
    const rawDismiss = /^(?:b[oỏ]\s+qua|b[oỏ])(?:\s+s[oố])?\s+[1-9]\d?\s*[:,-]?\s*(.*)$/iu.exec(stripped);
    let reason = rawDismiss && rawDismiss[1] ? rawDismiss[1].trim() : '';
    if (reason) {
      reason = reason.replace(/^(?:v[iì]|do|l[yý]\s+do)(?=\s|[:,-]|$)\s*[:,-]?\s*/iu, '').trim();
    }
    return { type: 'dismiss', n, reason: reason || null };
  }

  // 6. Xác nhận lệnh đang chờ (không kèm số)
  if (/^(?:co|ok|dong y|xac nhan|yes|uh|u)$/.test(f)) {
    return { type: 'confirm' };
  }

  // 7. Hủy lệnh đang chờ (không kèm số)
  if (/^(?:khong|thoi|huy|no|dung)$/.test(f)) {
    return { type: 'cancel' };
  }

  // 8. Tình hình / bản tin tóm tắt
  if (/^(?:tinh hinh|tom tat|bao cao|ban tin|the nao roi|\/status)$/.test(f)) {
    return { type: 'status' };
  }

  // 9. Thu thập dữ liệu mới
  if (/^(?:thu thap|lay du lieu moi|cap nhat du lieu|thu thap du lieu)$/.test(f)) {
    return { type: 'collect' };
  }

  // 10. Tạm im thông báo
  if (/^(?:im|tam im|tat bao)$/.test(f)) {
    return { type: 'mute', minutes: 120 };
  }
  if (/^(?:im|tam im|tat bao)\s+den\s+sang$/.test(f)) {
    return { type: 'mute', minutes: minutesUntilMorning(now) };
  }
  const muteMatch = /^(?:im|tam im|tat bao)\s+(\d+)\s*(gio|h|phut|p|ngay)$/.exec(f);
  if (muteMatch) {
    const val = Number(muteMatch[1]);
    const unit = muteMatch[2];
    const mult = unit === 'ngay' ? 1440 : (unit === 'gio' || unit === 'h') ? 60 : 1;
    const minutes = Math.max(1, Math.min(MAX_MUTE_MINUTES, Math.round(val * mult)));
    return { type: 'mute', minutes };
  }

  // 11. Bật lại thông báo
  if (/^(?:bat bao|het im|bao lai|mo bao|bat thong bao)$/.test(f)) {
    return { type: 'unmute' };
  }

  // 12. Đổi kho dữ liệu
  if (/^(?:kho that|du lieu that|sang kho that|doi sang kho that)$/.test(f)) {
    return { type: 'workspace', workspace: 'real' };
  }
  if (/^(?:kho mo phong|kho demo|du lieu mo phong|sang kho mo phong|sang kho demo)$/.test(f)) {
    return { type: 'workspace', workspace: 'demo' };
  }

  // 13a. Lịch livestream đã hẹn
  if (/^(?:lich|lich live|lich livestream)$/.test(f)) {
    return { type: 'schedule' };
  }

  // 13. Tình hình livestream
  if (/^(?:live|phien live|livestream|tinh hinh live|tinh hinh livestream)$/.test(f)) {
    return { type: 'live' };
  }

  // 14. Mã nối Zalo 6 chữ số (cho phép khoảng trắng giữa các chữ số)
  const linkMatch = /^(?:(?:ket noi|ma|noi)\s+)?(\d(?:\s*\d){5})$/.exec(f);
  if (linkMatch) {
    return { type: 'link_code', code: linkMatch[1].replace(/\s+/g, '') };
  }

  // 15. Ngắt kết nối Zalo
  if (/^(?:huy ket noi|ngat zalo|ngat ket noi|huy zalo)$/.test(f)) {
    return { type: 'unlink' };
  }

  // 16. Mặc định: câu hỏi về dữ liệu
  return { type: 'question', text: raw };
}

module.exports = {
  parseCommand,
  minutesUntilMorning
};
