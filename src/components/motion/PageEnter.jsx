import React, { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { MOTION, EASE, ENTER_RISE, ENTER_STEP, ENTER_MAX } from './tokens';
import { routeReady } from './routeGate';

/**
 * VÀO TRANG (M1, K3-01): màn mở đầu có dàn dựng DUY NHẤT của một trang.
 *
 *   <PageEnter className="cx pt-2" onDone={…}>
 *     <SummaryHeader />   // khối 1
 *     <FilterBar />       // khối 2 (lệch 60ms)
 *     <div>…phần còn lại</div>   // khối 3
 *   </PageEnter>
 *
 * Mỗi con trực tiếp (tối đa 4 con đầu) đi từ opacity 0, translateY(12px) về
 * 0 trong --motion-medium, --ease-out, lệch 60ms. Chỉ chạy khi ĐỔI ROUTE:
 * RouteTransition gắn trang mới bằng key = pathname, nên PageEnter chỉ gắn lại
 * khi đổi đường dẫn; lọc, đổi ?tab=, dữ liệu về đều không làm chạy lại (hiệu
 * ứng nằm trong useLayoutEffect không phụ thuộc gì, chạy một lần lúc gắn).
 *
 * Mặc định "đã hiện đủ": không có lớp CSS chờ nào. JS chỉ tạo animation (fill
 * backwards) ngay trước khung hình đầu, nên tắt JS hay trình duyệt không có
 * Web Animations vẫn thấy hết. Giảm chuyển động: không chạy, onDone gọi ngay.
 *
 * Với hai cơ chế chuyển trang có sẵn của RouteTransition:
 * - View Transitions (bấm liên kết nội bộ): thẻ <html> được gắn data-page-enter
 *   để CSS (khối K3) tắt lớp mờ vào của vùng nội dung, khỏi chồng hai hiệu ứng;
 *   animation tạm dừng ở khung đầu cho tới khi chuyển trang sẵn sàng
 *   (routeReady), nên không mất những khung đầu của đường cong ease-out.
 * - navigate() từ code: bỏ lớp animate-fade-in của vùng nội dung (cùng lý do).
 *
 * Props:
 *   as: thẻ bọc (mặc định div); className, ...rest chuyển cho thẻ bọc
 *   max: số khối tối đa (mặc định 4; luật là tối đa 4)
 *   local: true cho bản dựng thử trong trang (/ui-kit): không đụng tới vùng nội
 *     dung của route, không gắn data-page-enter, không chờ chuyển trang
 *   onDone: gọi một lần khi khối cuối đã vào xong (hoặc ngay khi không chạy).
 *     Dùng để chờ số đếm; xem usePageEntered.
 */
export const PageEnter = ({ as: Tag = 'div', max = ENTER_MAX, local = false, onDone, className = '', children, ...rest }) => {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    const done = () => onDoneRef.current?.();
    if (!el || reduced || typeof el.animate !== 'function') {
      done();
      return undefined;
    }
    const root = document.documentElement;
    if (!local) {
      // Hiệu ứng mờ vào của vùng nội dung (fallback khi không có View Transitions) nhường cho PageEnter
      el.closest('[data-route-pane]')?.classList.remove('animate-fade-in');
      root.dataset.pageEnter = '';
    }

    const blocks = Array.from(el.children).slice(0, Math.min(max, ENTER_MAX));
    const anims = blocks.map((child, i) =>
      child.animate(
        [{ opacity: 0, transform: `translateY(${ENTER_RISE}px)` }, { opacity: 1, transform: 'none' }],
        { duration: MOTION.medium, delay: i * ENTER_STEP, easing: EASE.out, fill: 'backwards' }
      )
    );

    let cancelled = false;
    const gate = local ? null : routeReady();
    if (gate) {
      anims.forEach((a) => a.pause());
      gate.then(() => { if (!cancelled) anims.forEach((a) => a.play()); });
    }
    Promise.all(anims.map((a) => a.finished)).then(
      () => { if (!cancelled) done(); },
      () => {}
    );
    if (!anims.length) done();

    return () => {
      cancelled = true;
      anims.forEach((a) => a.cancel());
      if (!local) delete root.dataset.pageEnter;
    };
  }, [reduced, max, local]);

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
};

export default PageEnter;
