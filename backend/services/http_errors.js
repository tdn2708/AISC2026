/**
 * LỖI TRẢ RA NGOÀI
 * ------------------------------------------------------------------
 * Lỗi của request (JSON hỏng, thân quá lớn, đầu vào sai: 4xx) trả đúng thông
 * báo để người gọi sửa. Lỗi của máy chủ (5xx) chỉ ghi vào log; thông báo gốc
 * có thể chứa tên kho, địa chỉ cụm dữ liệu hay câu truy vấn nên không trả ra.
 */
function errorResponse(err) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message =
    err?.type === 'entity.parse.failed' ? 'Thân request không phải JSON hợp lệ'
      : err?.type === 'entity.too.large' ? 'Thân request vượt quá 2MB'
        : status >= 500 ? 'Lỗi máy chủ, vui lòng thử lại sau.'
          : err?.message || 'Yêu cầu không hợp lệ';
  return { status, message };
}

module.exports = { errorResponse };
