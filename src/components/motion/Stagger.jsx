import React, { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { MOTION, EASE, STAGGER_STEP } from './tokens';

/**
 * Lệch nhịp 40ms cho các con trực tiếp của một danh sách, CHỈ khi dữ liệu
 * mới về sau thao tác của người dùng (lọc, tìm, bấm tải thêm). Không dùng khi
 * tải trang: luật chuyển động của app chỉ cho một màn mở đầu mỗi trang.
 *
 *   const [runKey, setRunKey] = useState(0);
 *   // sau khi người dùng lọc và dữ liệu về: setRunKey((k) => k + 1)
 *   <Stagger as="ul" active runKey={runKey}>{items.map(…)}</Stagger>
 *
 * - active (mặc định false): tắt thì là thẻ bọc bình thường.
 * - runKey: mỗi lần đổi (và active) thì các con hiện vào lệch nhịp một lần.
 *   Lần render đầu không chạy.
 * - step: khoảng lệch (mặc định 40ms); tổng lệch tối đa 500ms (12 dòng đầu
 *   lệch, các dòng sau hiện cùng dòng thứ 12).
 * Dùng Web Animations API trên phần tử con, không đổi cấu trúc DOM, không
 * remount con. Giảm chuyển động: không chạy.
 */
export const Stagger = ({ as: Tag = 'div', active = false, runKey, step = STAGGER_STEP, className = '', children, ...rest }) => {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const prevKeyRef = useRef(runKey);

  useLayoutEffect(() => {
    // Chỉ phát nhịp khi runKey thật sự đổi (lần đầu và lần gắn lại của StrictMode thì không)
    if (Object.is(prevKeyRef.current, runKey)) return undefined;
    prevKeyRef.current = runKey;
    const el = ref.current;
    if (!active || reduced || !el || typeof el.animate !== 'function') return undefined;
    const maxSteps = Math.floor(500 / Math.max(1, step));
    const anims = Array.from(el.children).map((child, i) =>
      child.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: MOTION.short, delay: Math.min(i, maxSteps) * step, easing: EASE.out, fill: 'backwards' }
      )
    );
    return () => anims.forEach((a) => a.cancel());
  }, [runKey, active, reduced, step]);

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
};

export default Stagger;
