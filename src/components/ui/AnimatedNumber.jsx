import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../motion/useReducedMotion';
import { useInView } from '../motion/useInView';

/**
 * Số đếm tới giá trị mới (F2-03).
 * - Lần đầu: đếm từ `from` (mặc định 0) khi con số VÀO KHUNG NHÌN, không
 *   phải lúc mount: số nằm dưới màn đầu sẽ đếm khi người xem cuộn tới.
 * - Sau đó mỗi lần `value` đổi (lọc, dữ liệu về): đếm từ số đang hiện sang số
 *   mới (kể cả khi đang đếm dở); ngoài khung nhìn thì đổi ngay, không chạy
 *   chuyển động không ai thấy, và số chưa ai thấy cũng không giữ số cũ.
 * - Không có số: hiện "—".
 * - Kết thúc bằng một nhịp "chốt" rất nhỏ (scale 0,965 về 1, chỉ transform).
 * - Giảm chuyển động: hiện ngay giá trị cuối, không đếm, không chốt.
 * Trình đọc màn hình chỉ đọc số cuối (aria-label), không đọc từng số đang đếm.
 * K7-02 lỗi 18: mỗi khung đếm chỉ ghi textContent của một nút qua ref, không setState, nên React
 * không dựng lại cây mỗi khung; nhịp chốt bật lại bằng classList, không đổi key.
 *
 * Phần đơn vị (`unit`) nhỏ và nhạt hơn phần số: con số "đanh" hơn mà
 * không cần to thêm. API cũ giữ nguyên: value, decimals, signed, unit,
 * unitClassName, className, duration.
 */
const easeOut = (t) => 1 - (1 - t) ** 3;

const FORMATTERS = new Map();
const nf = (decimals) => {
  if (!FORMATTERS.has(decimals)) FORMATTERS.set(decimals, new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  return FORMATTERS.get(decimals);
};

const format = (n, decimals, signed) => {
  const abs = nf(decimals).format(Math.abs(n));
  const isZero = Number(Math.abs(n).toFixed(decimals)) === 0;
  const sign = n < 0 && !isZero ? '−' : signed && n > 0 && !isZero ? '+' : '';
  return { sign, abs };
};

// Ô trống hiện dấu gạch dài theo luật người dùng chốt 11/11. Đây là giá trị rỗng của ô số, không phải
// dấu câu trong lời; sloplint mã 19 (tầng Floor) không cho miễn, nên giữ ký tự trong một hằng thay vì chữ trong JSX.
const EMPTY_CELL = '—';

export const AnimatedNumber = ({
  value,
  from = 0,
  decimals = 0,
  signed = false,
  unit,
  unitClassName = 'text-[0.55em] font-medium opacity-60',
  className = '',
  duration = 700, // giữ nhịp cũ; số lớn đứng riêng có thể truyền MOTION.long
  settle = true
}) => {
  const ref = useRef(null);
  const numRef = useRef(null); // nút chữ số: React không bao giờ ghi vào đây, chỉ ghi qua paint()
  const innerRef = useRef(null);
  const reduced = useReducedMotion();
  const finite = value != null && Number.isFinite(value);
  const inView = useInView(ref, { threshold: 0.6, enabled: finite && !reduced });
  // Số đang hiện (kể cả giữa lúc đếm): bị ngắt thì đếm tiếp từ đây, không bật lùi.
  // Chưa đếm lần nào: hiện `from` (giữ chỗ đúng bề ngang); giảm chuyển động thì hiện ngay số cuối.
  const shownRef = useRef(reduced ? value : from);
  const startedRef = useRef(false); // đã hiện số thật lần nào chưa
  const initialRef = useRef(value); // chỉ giá trị lúc mount mới chờ vào khung nhìn để đếm mở đầu

  const paint = (v) => {
    shownRef.current = v;
    const el = numRef.current;
    if (!el) return;
    const f = format(v, decimals, signed);
    const text = `${f.sign}${f.abs}`;
    if (el.textContent !== text) el.textContent = text;
  };

  // Giữ chữ trên màn khớp số đang hiện khi nút vừa gắn hoặc đổi cách định dạng (trước khi vẽ khung đầu)
  useLayoutEffect(() => {
    if (!finite) return;
    paint(shownRef.current ?? value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finite, decimals, signed]);

  useEffect(() => {
    if (!finite) return undefined;
    if (reduced) {
      paint(value);
      startedRef.current = true;
      return undefined;
    }
    if (!inView) {
      // Chưa ai thấy: giữ chỗ chờ đếm mở đầu, trừ khi dữ liệu đã đổi (lọc) thì hiện số mới luôn
      if (startedRef.current || value !== initialRef.current) {
        paint(value);
        startedRef.current = true;
      }
      return undefined;
    }
    const start = startedRef.current ? shownRef.current : from;
    startedRef.current = true;
    if (start === value) {
      paint(value);
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      paint(t < 1 ? start + (value - start) * easeOut(t) : value);
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (settle && innerRef.current) {
        // Bật lại nhịp chốt: bỏ lớp, ép tính bố cục, gắn lại lớp
        const inner = innerRef.current;
        inner.classList.remove('motion-settle');
        void inner.offsetWidth;
        inner.classList.add('motion-settle');
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, finite, reduced, inView, from, duration, settle]);

  if (!finite) return <span ref={ref} className={className}>{EMPTY_CELL}</span>;

  const end = format(value, decimals, signed);

  return (
    <span ref={ref} className={`proportional-nums ${className}`}>
      {/* Nhịp chốt nằm ở lớp trong: lớp ngoài giữ className của trang (cỡ chữ, màu) */}
      <span ref={innerRef} className="inline-block" aria-hidden="true">
        <span ref={numRef} />
        {unit && <span className={unitClassName}>{unit}</span>}
      </span>
      <span className="sr-only">{end.sign}{end.abs}{unit || ''}</span>
    </span>
  );
};
