import { useCallback, useLayoutEffect, useState } from 'react';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Cổng "M1 đã xong" cho thứ phải chờ (số đếm, phép trừ chạy).
 *   const [entered, onEntered] = usePageEntered();
 *   <PageEnter onDone={onEntered}>…  rồi dùng `entered` để mở số đếm.
 * entered bắt đầu true khi giảm chuyển động. Có thêm chốt an toàn: sau 1500ms
 * thì mở dù PageEnter không báo (trang bị chặn animation, tab nền).
 */
export const usePageEntered = () => {
  const [entered, setEntered] = useState(() => prefersReducedMotion());
  const open = useCallback(() => setEntered(true), []);
  useLayoutEffect(() => {
    if (entered) return undefined;
    const t = setTimeout(open, 1500);
    return () => clearTimeout(t);
  }, [entered, open]);
  return [entered, open];
};

export default usePageEntered;
