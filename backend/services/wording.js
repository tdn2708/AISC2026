/**
 * CÂU CHỮ DÙNG CHUNG
 * ------------------------------------------------------------------
 * Nhãn vấn đề viết thành một cụm đọc được: "Giao hàng: giao chậm" thay vì
 * "Giao hàng - Giao chậm" (hai nhãn viết hoa ghép bằng gạch nối đọc như hai
 * mục riêng). Chữ đầu của nguyên nhân hạ xuống chữ thường, trừ từ viết tắt
 * ("COD ...").
 */

const lowerFirst = (t) => (t && !/^[A-ZĐ]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

/** "Giao hàng" + "Giao chậm" -> "Giao hàng: giao chậm"; không có nguyên nhân thì chỉ nhóm */
function issueTitle(categoryLabel, causeLabel) {
  return causeLabel ? `${categoryLabel}: ${lowerFirst(causeLabel)}` : categoryLabel;
}

/** Số nguyên kiểu Việt, dấu chấm ngăn nghìn: 9691 -> "9.691" */
const fmtVi = (n) => Number(n).toLocaleString('vi-VN');

module.exports = { lowerFirst, issueTitle, fmtVi };
