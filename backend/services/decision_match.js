/**
 * KHỚP QUYẾT ĐỊNH VỚI CẢNH BÁO THEO PHẠM VI
 * ------------------------------------------------------------------
 * Mã cảnh báo có dạng "Nhóm|Nguyên nhân|Sản phẩm|Khu vực|Ngày" (hoặc
 * "drift|Nhóm|Ngày"). Phần ngày đổi mỗi ngày, nên so đúng cả mã thì quyết
 * định Chấp nhận/Bỏ qua của hôm nay biến mất sau nửa đêm: cùng một vấn đề
 * hiện lại như chưa ai xử lý. Ở đây khớp theo PHẠM VI (mã bỏ ngày cuối) và
 * giữ hiệu lực trong cửa sổ theo dõi lại, đúng với lời hứa ở giao diện
 * "theo dõi lại sau 7 ngày".
 */

const DECISION_WINDOW_DAYS = 7;
const DAY_MS = 86400000;
const DATE_TAIL = /^\d{4}-\d{2}-\d{2}$/;

/** Phạm vi của một mã cảnh báo: bỏ đoạn ngày ở cuối nếu có */
function alertScope(alertId) {
  const id = String(alertId ?? '');
  const cut = id.lastIndexOf('|');
  if (cut < 0) return id;
  return DATE_TAIL.test(id.slice(cut + 1)) ? id.slice(0, cut) : id;
}

/**
 * Quyết định áp dụng cho một cảnh báo: cùng mã (mọi lúc) hoặc cùng phạm vi và
 * được ghi trong cửa sổ theo dõi lại. Nhiều quyết định thì lấy cái mới nhất.
 */
function findDecision(alertId, decisions = [], nowMs = Date.now(), windowDays = DECISION_WINDOW_DAYS) {
  const scope = alertScope(alertId);
  const from = nowMs - windowDays * DAY_MS;
  let best;
  let bestAt = -Infinity;
  for (const d of decisions) {
    const at = d.at ? new Date(d.at).getTime() : 0;
    const exact = d.alertId === alertId;
    if (!exact && !(alertScope(d.alertId) === scope && at >= from)) continue;
    if (at >= bestAt) {
      best = d;
      bestAt = at;
    }
  }
  return best;
}

module.exports = { alertScope, findDecision, DECISION_WINDOW_DAYS };
