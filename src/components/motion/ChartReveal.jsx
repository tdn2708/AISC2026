import React, { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useInView } from './useInView';

/**
 * Bọc một biểu đồ, mở nó từ trái sang bằng clip-path khi vào khung nhìn,
 * một lần, trong --motion-long. Biểu đồ Recharts bên trong nên tắt hiệu ứng
 * riêng (isAnimationActive={false}): Recharts animate thuộc tính SVG, không
 * phải transform.
 *
 *   <ChartReveal className="h-64"><ResponsiveContainer>…</ResponsiveContainer></ChartReveal>
 *
 * - as: thẻ bọc (mặc định div); className, style chuyển thẳng xuống.
 * - threshold: tỉ lệ phải lộ ra mới mở (mặc định 0,3).
 * Mặc định (chưa có JS, giảm chuyển động) biểu đồ hiện đủ.
 */
export const ChartReveal = ({ as: Tag = 'div', threshold = 0.3, className = '', children, ...rest }) => {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { threshold, enabled: !reduced });
  // undefined = hiện đủ; 'wait' = đang che chờ mở; 'run' = đang mở
  const [phase, setPhase] = useState(undefined);

  useLayoutEffect(() => {
    if (reduced) {
      setPhase(undefined);
      return;
    }
    setPhase((p) => (p === undefined && !inView ? 'wait' : p));
  }, [reduced, inView]);

  useLayoutEffect(() => {
    if (!reduced && inView) setPhase((p) => (p === 'wait' ? 'run' : p));
  }, [reduced, inView]);

  // Quan sát lớp ngoài, che lớp trong: phần tử đang bị clip-path che hết thì
  // IntersectionObserver của Chrome coi như không giao với khung nhìn
  return (
    <Tag ref={ref} className={className} {...rest}>
      <div
        className="motion-reveal h-full w-full"
        data-reveal={phase}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setPhase(undefined);
        }}
      >
        {children}
      </div>
    </Tag>
  );
};

export default ChartReveal;
