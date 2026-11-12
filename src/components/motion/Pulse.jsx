import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Một nhịp tô nền (màu nhấn nhạt) ở phần tử vừa đổi, rồi tắt hẳn. Thay cho
 * chấm trạng thái: dòng vừa được chấp nhận, bình luận live mới về.
 *
 *   <Pulse trigger={row.updatedAt} className="rounded-ctrl">…dòng…</Pulse>
 *
 * - trigger: giá trị bất kỳ; mỗi lần nó ĐỔI (không tính lần render đầu) thì
 *   chạy một nhịp trong --motion-long.
 * - as: thẻ bọc (mặc định div). Lớp nền nằm sau nội dung, không nhận chuột.
 * Giảm chuyển động: không tô.
 */
export const Pulse = ({ trigger, as: Tag = 'div', className = '', children, ...rest }) => {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const firstRef = useRef(true);
  const prevRef = useRef(trigger);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = trigger;
      return;
    }
    if (Object.is(prevRef.current, trigger)) return;
    prevRef.current = trigger;
    if (!reduced) setBeat((b) => b + 1);
  }, [trigger, reduced]);

  return (
    <Tag className={`motion-pulse ${className}`} {...rest}>
      {/* key mới = phần tử mới = animation chạy lại đúng một lần */}
      <span key={beat} className={`motion-pulse-layer ${beat ? 'is-on' : ''}`} aria-hidden="true" />
      {children}
    </Tag>
  );
};

export default Pulse;
