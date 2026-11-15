import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PageEnter } from '../motion';
import { useAuthFlow } from './AuthShell';

/**
 * Mảnh dùng chung của ba trang tài khoản.
 *   AuthLink   liên kết thật (giữ href cho chuột giữa, đọc màn hình), bấm thường
 *              thì đi qua `go()` của khung để có hiệu ứng chuyển.
 *   Pane       lần mở đầu: PageEnter (M1); đến bằng chuyển trang: thẻ div thường,
 *              vì View Transition đã lo hiệu ứng, chạy thêm PageEnter là hai lớp chồng.
 *   focusFrame khung ngắm đi theo ô đang focus trong biểu mẫu.
 */
export const AuthLink = ({ to, state, onClick, children, ...rest }) => {
  const { go } = useAuthFlow();
  return (
    <Link
      to={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(to, { state });
      }}
      {...rest}
    >
      {children}
    </Link>
  );
};

export const BackLink = ({ to = '/auth' }) => (
  <AuthLink
    to={to}
    className="-ml-2 inline-flex h-8 items-center gap-1 rounded-ctrl px-2 text-sm text-ink-mid transition-colors duration-micro hover:bg-raised hover:text-ink-hi"
  >
    <ChevronLeft size={16} aria-hidden="true" />
    Quay lại
  </AuthLink>
);

export const Pane = ({ children, className = '' }) => {
  const { isFirstView } = useAuthFlow();
  const [first] = useState(isFirstView);
  return first ? <PageEnter className={className}>{children}</PageEnter> : <div className={className}>{children}</div>;
};

/** Ô đang focus là ô được ngắm; nút mắt trong ô mật khẩu vẫn ngắm ô mật khẩu */
export const useFocusFrame = () => {
  const { frame } = useAuthFlow();
  return {
    onFocusCapture: (e) => {
      const t = e.target;
      const box = t.tagName === 'INPUT' ? t : t.closest('.relative')?.querySelector('input') || t;
      frame(box);
    },
    onBlurCapture: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) frame(null);
    }
  };
};

/** Bàn phím ảo trên điện thoại che nửa màn: chỉ tự focus khi có chuột */
export const canAutoFocus = () => {
  try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; }
};
