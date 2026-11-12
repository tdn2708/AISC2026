import React, { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useInView } from './useInView';

/**
 * Phần tô của một thanh ngang, mọc từ mép trái bằng transform: scaleX
 * (không đổi width). Đặt bên trong một rãnh do trang tự vẽ, ví dụ:
 *
 *   <div className="h-2 overflow-hidden rounded-xs bg-raised">
 *     <BarGrow value={0.62} className="bg-accent" />
 *   </div>
 *
 * - value: tỉ lệ 0..1 (tự kẹp).
 * - grow (mặc định true): lần đầu mọc từ 0 khi rãnh vào khung nhìn, một lần.
 *   false thì hiện ngay độ dài đúng.
 * - start: cổng tùy chọn; truyền vào thì chỉ mọc khi start = true (ví dụ
 *   sau khi phép trừ chạy xong).
 * - Đổi value về sau (lọc chéo): thanh co giãn sang độ dài mới trong
 *   --motion-long; giảm chuyển động thì nhảy ngay.
 * Mặc định (chưa có JS, giảm chuyển động) thanh đã đúng độ dài.
 */
export const BarGrow = ({ value, grow = true, start, className = '', style, ...rest }) => {
  const ref = useRef(null);
  // Quan sát rãnh (phần tử cha) chứ không phải thanh: thanh đang scaleX(0) không có diện tích
  const trackRef = useRef(null);
  useLayoutEffect(() => {
    trackRef.current = ref.current?.parentElement || ref.current;
  });
  const reduced = useReducedMotion();
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const wantsGrow = grow && !reduced;
  const inView = useInView(trackRef, { threshold: 0.1, enabled: wantsGrow });
  // 'idle' = hiện đúng độ dài; 'wait' = đang giữ ở 0 chờ mọc; 'grown' = đã mọc xong một lần
  const [phase, setPhase] = useState('idle');

  useLayoutEffect(() => {
    if (!wantsGrow) return;
    if (phase === 'idle') setPhase('wait');
  }, [wantsGrow, phase]);

  const ready = inView && (start === undefined || start);
  useLayoutEffect(() => {
    if (phase !== 'wait' || !ready) return undefined;
    // Một khung hình ở 0 rồi mới đặt độ dài thật, để transition có điểm xuất phát
    const raf = requestAnimationFrame(() => setPhase('grown'));
    return () => cancelAnimationFrame(raf);
  }, [phase, ready]);

  const scale = phase === 'wait' && wantsGrow ? 0 : v;
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`motion-bar ${className}`}
      style={{ ...style, transform: `scaleX(${scale})` }}
      {...rest}
    />
  );
};

export default BarGrow;
