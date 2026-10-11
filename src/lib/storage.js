/**
 * localStorage có thể ném lỗi (chế độ riêng tư của Safari, bộ nhớ đầy, trình
 * duyệt chặn dữ liệu trang). Gọi thẳng trong useEffect thì lỗi đó làm sập cả
 * trang, nên mọi lượt đọc/ghi đi qua hai hàm này. Đây chỉ là tiện ích ghi nhớ
 * lựa chọn của người xem; thiếu nó giao diện vẫn chạy với giá trị mặc định.
 */
export const readStorage = (key, fallback = null) => {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};

export const writeStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // bỏ qua: không ghi nhớ được thì lần sau dùng giá trị mặc định
  }
};
