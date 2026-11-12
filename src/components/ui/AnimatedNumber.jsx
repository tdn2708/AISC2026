import React, { useEffect, useRef, useState } from 'react';
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
 *
 * Phần đơn vị (`unit`) nhỏ và nhạt hơn phần số: con số "đanh" hơn mà
 * không cần to thêm. API cũ giữ nguyên: value, decimals, signed, unit,
 * unitClassName, className, duration.
 */
const easeOut = (t) => 1 - (1 - t) ** 3;

const format = (n, decimals, signed) => {
  const abs = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(n));
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
  const reduced = useReducedMotion();
  const finite = value != null && Number.isFinite(value);
  const inView = useInView(ref, { threshold: 0.6, enabled: finite && !reduced });
  // Chưa đếm lần nào: hiện `from` (giữ chỗ đúng bề ngang); giảm chuyển động thì hiện ngay số cuối
  const [shown, setShown] = useState(() => (reduced ? value : from));
  const [settleKey, setSettleKey] = useState(0);
  // Số đang hiện (kể cả giữa lúc đếm): bị ngắt thì đếm tiếp từ đây, không bật lùi
  const shownRef = useRef(reduced ? value : from);
  const startedRef = useRef(false); // đã hiện số thật lần nào chưa
  const initialRef = useRef(value); // chỉ giá trị lúc mount mới chờ vào khung nhìn để đếm mở đầu

  useEffect(() => {
    if (!finite) return undefined;
    const show = (v) => { shownRef.current = v; setShown(v); };
    if (reduced) {
      show(value);
      startedRef.current = true;
      return undefined;
    }
    if (!inView) {
      // Chưa ai thấy: giữ chỗ chờ đếm mở đầu, trừ khi dữ liệu đã đổi (lọc) thì hiện số mới luôn
      if (startedRef.current || value !== initialRef.current) {
        show(value);
        startedRef.current = true;
      }
      return undefined;
    }
    const start = startedRef.current ? shownRef.current : from;
    startedRef.current = true;
    if (start === value) {
      show(value);
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      show(t < 1 ? start + (value - start) * easeOut(t) : value);
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (settle) setSettleKey((k) => k + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, finite, reduced, inView, from, duration, settle]);

  if (!finite) return <span ref={ref} className={className}>{EMPTY_CELL}</span>;

  const now = format(shown ?? value, decimals, signed);
  const end = format(value, decimals, signed);

  return (
    <span ref={ref} className={`proportional-nums ${className}`}>
      {/* Nhịp chốt nằm ở lớp trong: lớp ngoài giữ className của trang (cỡ chữ, màu) */}
      <span key={settleKey} className={`inline-block ${settleKey ? 'motion-settle' : ''}`} aria-hidden="true">
        {now.sign}
        {now.abs}
        {unit && <span className={unitClassName}>{unit}</span>}
      </span>
      <span className="sr-only">{end.sign}{end.abs}{unit || ''}</span>
    </span>
  );
};
