/**
 * GIỚI HẠN TẦN SUẤT THEO ĐỊA CHỈ IP (trong bộ nhớ, không cần thư viện)
 * ------------------------------------------------------------------
 * Các API gọi mô hình ngôn ngữ (trợ lý, nháp trả lời, gán nhãn khi nạp file,
 * thu thập) dùng chung 500 lượt Gemini mỗi ngày. Không có giới hạn thì một vòng
 * lặp gọi liên tục làm cạn hạn mức, và trợ lý chết đúng lúc demo. Mỗi IP được
 * `max` lượt trong `windowMs`; quá thì trả 429 kèm số giây phải chờ.
 *
 * Đây là hàng rào chống lạm dụng, không phải xác thực: máy chủ chạy một tiến
 * trình (Render free), nên bộ đếm trong bộ nhớ là đủ; khởi động lại thì đếm lại.
 */

function rateLimit({ max, windowMs, name }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      const retry = Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000));
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Gọi ${name} quá nhanh. Thử lại sau ${retry} giây.` });
    }
    list.push(now);
    hits.set(key, list);
    // Dọn bộ đếm cũ để bảng không phình mãi
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    return next();
  };
}

module.exports = { rateLimit };
