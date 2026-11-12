import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReducedMotion } from './useReducedMotion';

/**
 * CHUYỂN TRANG (F2-06), hiệu ứng toàn cục duy nhất của khung ứng dụng.
 *
 * Chrome, Edge, Safari 18+: View Transitions API. Thanh bên và thanh trên
 * đứng yên (view-transition-name riêng, không animation), chỉ vùng nội dung
 * mờ ra rồi hiện vào và dịch lên 6px (CSS ở index.css, mục "Chuyển trang").
 * Trình duyệt không có API: vùng nội dung chạy animate-fade-in như cũ.
 * Giảm chuyển động: không hiệu ứng nào.
 *
 * Vì sao bắt cú bấm liên kết: app dùng <BrowserRouter> (không phải data
 * router) nên prop viewTransition của <Link> không có tác dụng. Ở pha capture
 * của document, cú bấm vào liên kết nội bộ được preventDefault (onClick riêng
 * của liên kết vẫn chạy; <Link> thấy defaultPrevented nên không tự điều hướng),
 * rồi điều hướng trong document.startViewTransition. Router cập nhật trong
 * startTransition nên callback chờ tới khi trang mới đã gắn vào DOM (lời hứa
 * được giải ở useLayoutEffect của trang mới), tối đa 600ms.
 * Điều hướng bằng code (navigate() từ nút, bảng lệnh) không qua đây và rơi về
 * animate-fade-in.
 */

const supportsVT = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

// Lời hứa của lần chuyển đang chờ trang mới gắn vào DOM (một lúc chỉ một lần)
let pending = null;
const settlePending = () => {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.resolve();
  pending = null;
};

const internalTarget = (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.noTransition != null) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location;
  // Cùng trang (chỉ đổi #) thì để trình duyệt tự xử lý
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.pathname + url.search + url.hash;
};

/** Vùng nội dung của một trang; gắn mới mỗi lần đổi đường dẫn */
const RoutePane = ({ reduced, children }) => {
  // Trang này đến bằng View Transition không? Có thì không chạy thêm fade CSS
  const [viaVT] = useState(() => pending != null);
  return <div className={viaVT || reduced ? '' : 'animate-fade-in'}>{children}</div>;
};

export const RouteTransition = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  // Trang mới đã gắn vào DOM: cho View Transition chụp trạng thái mới
  useLayoutEffect(() => {
    settlePending();
  }, [location.key]);

  useEffect(() => {
    if (reduced || !supportsVT()) return undefined;
    const onClick = (e) => {
      const to = internalTarget(e);
      if (!to) return;
      e.preventDefault();
      const root = document.documentElement;
      root.classList.add('vt-route');
      const vt = document.startViewTransition(
        () =>
          new Promise((resolve) => {
            pending = { resolve, timer: setTimeout(settlePending, 600) };
            navigate(to);
          })
      );
      // Bị bỏ qua (bấm liên kết khác giữa chừng) thì ready bị từ chối: không phải lỗi
      vt.ready.catch(() => {});
      vt.finished.finally(() => root.classList.remove('vt-route'));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate, reduced]);

  return (
    <RoutePane key={location.pathname} reduced={reduced}>
      {children}
    </RoutePane>
  );
};

export default RouteTransition;
