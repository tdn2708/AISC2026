import React, { useEffect, useRef, useState } from 'react';

/**
 * Số đếm lên từ giá trị cũ tới giá trị mới trong ~0,7 giây — một lần khi
 * tải trang và mỗi lần dữ liệu đổi, không lặp. Người dùng bật "giảm
 * chuyển động" thì hiện ngay giá trị cuối.
 *
 * Phần đơn vị (`unit`) nhỏ và nhạt hơn phần số: con số "đanh" hơn mà
 * không cần to thêm.
 */
const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t) => 1 - (1 - t) ** 3;

export const AnimatedNumber = ({ value, decimals = 0, signed = false, unit, unitClassName = 'text-[0.55em] font-medium opacity-60', className = '', duration = 700 }) => {
  const [shown, setShown] = useState(reduceMotion() ? value : 0);
  const fromRef = useRef(shown);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return undefined;
    if (reduceMotion()) {
      setShown(value);
      fromRef.current = value;
      return undefined;
    }
    const from = fromRef.current ?? 0;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOut(t);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  if (value == null || !Number.isFinite(value)) return <span className={className}>—</span>;

  const abs = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(shown));
  const isZero = Number(Math.abs(shown).toFixed(decimals)) === 0;
  const sign = shown < 0 && !isZero ? '−' : signed && shown > 0 && !isZero ? '+' : '';

  return (
    <span className={`proportional-nums ${className}`}>
      {sign}
      {abs}
      {unit && <span className={unitClassName}>{unit}</span>}
    </span>
  );
};
