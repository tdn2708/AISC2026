import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, UserPlus, CircleAlert } from 'lucide-react';
import { Button } from '../ui';
import { useAuthFlow } from './AuthShell';
import { AuthLink, Pane } from './parts';
import { login, authError, DEMO_LOGIN } from '../../lib/auth';

/**
 * TRANG CHỌN (/auth): đăng nhập hay tạo tài khoản.
 * Khung ngắm đứng ở "Đăng nhập" (lựa chọn của phần lớn người quay lại), rê hay
 * focus lựa chọn kia thì khung chuyển sang. Người chỉ muốn xem (giám khảo)
 * vào bằng tài khoản mẫu, một lần bấm, đăng nhập thật với máy chủ.
 */
const OPTIONS = [
  { to: '/login', icon: LogIn, title: 'Đăng nhập', text: 'Đã có tài khoản của cửa hàng' },
  { to: '/signup', icon: UserPlus, title: 'Tạo tài khoản', text: 'Cần họ tên, email và mật khẩu' }
];

const AuthChoice = () => {
  const { frame, setHome } = useAuthFlow();
  const homeRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    setHome(homeRef.current);
    return () => setHome(null);
  }, [setHome]);

  const tryDemo = async () => {
    setBusy(true);
    setError('');
    try {
      await login({ ...DEMO_LOGIN, remember: false });
      // App thấy phiên mới và tự chuyển sang trang cần vào
    } catch (e) {
      setError(authError(e).message);
      setBusy(false);
    }
  };

  return (
    <Pane>
      <div>
        <h1 className="text-display font-semibold tracking-[-0.01em] text-ink-hi">Vào Customer Radar</h1>
        <p className="mt-1.5 text-sm text-ink-mid">Chọn cách bắt đầu.</p>
      </div>

      <div className="mt-8 flex flex-col gap-4" onPointerLeave={() => frame(null)}>
        {OPTIONS.map((o, i) => (
          <AuthLink
            key={o.to}
            to={o.to}
            ref={i === 0 ? homeRef : undefined}
            onPointerEnter={(e) => frame(e.currentTarget)}
            onFocus={(e) => frame(e.currentTarget)}
            onBlur={() => frame(null)}
            className="flex items-center gap-4 rounded-surf border border-line bg-surface px-5 py-4 transition-colors duration-micro hover:border-accent"
          >
            <o.icon size={20} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-base font-semibold text-ink-hi">{o.title}</span>
              <span className="mt-0.5 block text-sm text-ink-mid">{o.text}</span>
            </span>
          </AuthLink>
        ))}
      </div>

      <div className="mt-8 border-t border-line-soft pt-6">
        <p className="text-sm text-ink-mid">Chỉ muốn xem thử với dữ liệu mẫu?</p>
        <Button variant="secondary" block loading={busy} onClick={tryDemo} className="mt-3">
          Vào bằng tài khoản mẫu
        </Button>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-crit">
            <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
        <p className="mt-6 text-sm text-ink-mid">
          Chưa biết Customer Radar làm gì?{' '}
          <Link to="/" className="rounded-ctrl font-medium text-accent-hi underline underline-offset-4 hover:text-accent">
            Xem trang giới thiệu
          </Link>
        </p>
      </div>
    </Pane>
  );
};

export default AuthChoice;
