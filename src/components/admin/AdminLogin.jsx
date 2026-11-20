import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, EyeOff, Eye, CircleAlert } from 'lucide-react';
import Logo from '../Logo';
import { Button, IconButton, TextField } from '../ui';
import { PageEnter } from '../motion';
import { canAutoFocus } from '../auth/parts';
import { login, authError, safeNext } from '../../lib/auth';
import AdminInk from './AdminInk';

/**
 * ĐĂNG NHẬP QUẢN TRỊ (/admin/login), mục 5.3.
 * Gửi scope: 'admin' và không có tùy chọn giữ đăng nhập; phiên quản trị tự hết sau 8 giờ.
 */
const AdminLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});

  useEffect(() => {
    document.title = 'Đăng nhập quản trị | Customer Radar';
    if (canAutoFocus()) emailRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!email.trim()) fe.email = 'Nhập email quản trị.';
    if (!password) fe.password = 'Nhập mật khẩu.';
    setFieldErr(fe);
    setError('');
    if (Object.keys(fe).length) {
      (fe.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      const user = await login({ email, password, remember: false, scope: 'admin' });
      const next = new URLSearchParams(location.search).get('next');
      navigate(safeNext(next, user), { replace: true });
    } catch (err) {
      const { message } = authError(err);
      setError(message);
      setLoading(false);
      passwordRef.current?.select();
    }
  };

  return (
    <div className="cx grid min-h-screen min-h-dvh grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,1fr)] lg:grid-rows-1">
      <AdminInk />
      <section className="relative flex min-w-0 flex-col px-6 py-8 sm:px-10">
        <main id="noi-dung" className="mx-auto w-full max-w-[400px] lg:pt-[10vh]">
          <PageEnter>
            <div className="mb-8">
              <Link to="/" aria-label="Customer Radar, về trang giới thiệu" className="inline-block rounded-ctrl">
                <Logo size="sm" showTagline={false} />
              </Link>
            </div>

            <h1 className="text-display font-semibold tracking-[-0.01em] text-ink-hi">
              Đăng nhập quản trị
            </h1>

            <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
              <TextField
                ref={emailRef}
                label="Email"
                type="email"
                icon={Mail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email"
                error={fieldErr.email}
                required
              />
              <TextField
                ref={passwordRef}
                label="Mật khẩu"
                type={showPw ? 'text' : 'password'}
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                error={fieldErr.password}
                required
                trailing={
                  <IconButton
                    icon={showPw ? EyeOff : Eye}
                    variant="ghost"
                    size="sm"
                    label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    pressed={showPw}
                    onClick={() => setShowPw((v) => !v)}
                  />
                }
              />

              {error && (
                <p role="alert" className="flex items-start gap-1.5 rounded-ctrl bg-crit/12 px-3 py-2.5 text-sm text-crit">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
                </p>
              )}

              <Button type="submit" block loading={loading} className="mt-2 h-11">
                Vào bàn điều khiển
              </Button>
            </form>

            <p className="mt-5 text-xs text-ink-lo">
              Phiên quản trị tự hết sau 8 giờ.
            </p>

            <p className="mt-6 text-sm text-ink-mid">
              Không phải quản trị viên?{' '}
              <Link to="/login" className="rounded-ctrl font-medium text-accent-hi underline underline-offset-4 hover:text-accent">
                Về trang đăng nhập thường
              </Link>
            </p>
          </PageEnter>
        </main>
      </section>
    </div>
  );
};

export default AdminLogin;
