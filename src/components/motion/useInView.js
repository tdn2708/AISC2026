import { useEffect, useState } from 'react';

const hasIO = () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';

/**
 * Phần tử đã vào khung nhìn chưa. Trả true MỘT lần rồi giữ nguyên (không
 * bật tắt theo cuộn), vì chuyển động tự chạy trong app chỉ chạy một lần.
 * Trình duyệt không có IntersectionObserver thì coi như đã thấy, để nội dung
 * không bao giờ bị giữ ở trạng thái chờ.
 *
 * Vùng cuộn của app là main.main-content chứ không phải document; IO với
 * root mặc định vẫn tính đúng vì nó cắt theo mọi khung cuộn tổ tiên.
 *
 * ref: ref của phần tử; threshold: tỉ lệ diện tích phải lộ ra (0 đến 1);
 * enabled: false thì không quan sát (trả false cho tới khi bật).
 */
export const useInView = (ref, { threshold = 0.25, rootMargin = '0px', enabled = true } = {}) => {
  const [seen, setSeen] = useState(() => enabled && !hasIO());

  useEffect(() => {
    if (!enabled || seen) return undefined;
    if (!hasIO()) {
      setSeen(true);
      return undefined;
    }
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, rootMargin, enabled, seen]);

  return seen;
};

export default useInView;
