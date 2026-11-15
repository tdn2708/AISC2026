import React, { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mail, Lock, EyeOff, Eye, CircleAlert } from 'lucide-react';
import { Button, IconButton, TextField, Checkbox } from './ui';
import { useAuthFlow } from './auth/AuthShell';
import { AuthLink, BackLink, Pane, useFocusFrame, canAutoFocus } from './auth/parts';
import { login, authError, DEMO_LOGIN } from '../lib/auth';

/**
 * ĐĂNG NHẬP (/login), nằm trong khung chung `auth/AuthShell.jsx`.
 * Tài khoản thật lưu ở máy chủ (backend/routes/auth.js). Ô trống như mọi trang
 * đăng nhập thật; người xem thử bấm "Điền tài khoản mẫu" hoặc vào từ trang chọn.
 * Sai mật khẩu: một câu chung, không nói email có tồn tại hay không.
 */
const Login = () => {
  const location = useLocation();
  const { setHome } = useAuthFlow();
  const focusFrame = useFocusFrame();
  const formRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [email, setEmail] = useState(() => location.state?.email || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});

  // Khung về biểu mẫu; có chuột thì đặt con trỏ vào ô đầu còn trống (khung bay theo)
  useLayoutEffect(() => {
    setHome(formRef.current);
    if (canAutoFocus()) (location.state?.email ? passwordRef.current : emailRef.current)?.focus({ preventScroll: true });
    return () => setHome(null);
  }, [setHome]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!email.trim()) fe.email = 'Nhập email đã đăng ký.';
    if (!password) fe.password = 'Nhập mật khẩu.';
    setFieldErr(fe);
    setError('');
    if (Object.keys(fe).length) {
      (fe.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      await login({ email, password, remember });
      // App thấy phiên mới và tự chuyển sang trang cần vào
    } catch (err) {
      const { message } = authError(err);
      setError(message);
      setLoading(false);
      passwordRef.current?.select();
    }
  };

  const fillDemo = () => {
    setEmail(DEMO_LOGIN.email);
    setPassword(DEMO_LOGIN.password);
    setFieldErr({});
    setError('');
  };

  return (
    <Pane>
      <BackLink />
      <div className="mt-4">
        <h1 className="text-display font-semibold tracking-[-0.01em] text-ink-hi">Đăng nhập</h1>
        <p className="mt-1.5 text-sm text-ink-mid">
          Chưa có tài khoản?{' '}
          <AuthLink to="/signup" className="rounded-ctrl font-medium text-accent-hi underline underline-offset-4 hover:text-accent">
            Tạo tài khoản
          </AuthLink>
        </p>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-8 flex flex-col gap-4" {...focusFrame}>
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
            <IconButton icon={showPw ? EyeOff : Eye} variant="ghost" size="sm" label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} pressed={showPw} onClick={() => setShowPw((v) => !v)} />
          }
        />
        <Checkbox checked={remember} onChange={setRemember} label="Giữ đăng nhập trên máy này" description="Tắt khi dùng máy chung: đóng trình duyệt là phải đăng nhập lại." />
        {error && (
          <p role="alert" className="flex items-start gap-1.5 rounded-ctrl bg-crit/12 px-3 py-2.5 text-sm text-crit">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
        <Button type="submit" block loading={loading} className="mt-2 h-11">
          Đăng nhập
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-mid">
        Chỉ xem thử?{' '}
        <Button variant="link" type="button" onClick={fillDemo} className="font-medium">
          Điền tài khoản mẫu
        </Button>
      </p>
    </Pane>
  );
};

export default Login;
