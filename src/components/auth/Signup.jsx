import React, { useLayoutEffect, useRef, useState } from 'react';
import { Mail, Lock, EyeOff, Eye, UserRound, Store, CircleAlert, Check, Minus } from 'lucide-react';
import { Button, IconButton, TextField, Checkbox } from '../ui';
import { useAuthFlow } from './AuthShell';
import { AuthLink, BackLink, Pane, useFocusFrame, canAutoFocus } from './parts';
import { signup, authError, PASSWORD_RULES } from '../../lib/auth';

/**
 * TẠO TÀI KHOẢN (/signup). Luật kiểm ở đây khớp backend/services/auth.js
 * (validateSignup); máy chủ vẫn kiểm lại và trả lỗi từng ô. Luật mật khẩu
 * hiện ngay dưới ô và đổi trạng thái khi gõ, nên không phải bấm nút mới biết
 * sai. Email đã có tài khoản: chỉ đường sang đăng nhập, mang email theo.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const Signup = () => {
  const { setHome, go } = useAuthFlow();
  const focusFrame = useFocusFrame();
  const formRef = useRef(null);
  const refs = { name: useRef(null), email: useRef(null), password: useRef(null) };

  const [form, setForm] = useState({ name: '', shop: '', email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [taken, setTaken] = useState(false);

  useLayoutEffect(() => {
    setHome(formRef.current);
    if (canAutoFocus()) refs.name.current?.focus({ preventScroll: true });
    return () => setHome(null);
  }, [setHome]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    if (fieldErr[k]) setFieldErr((fe) => ({ ...fe, [k]: undefined }));
    if (k === 'email') setTaken(false);
  };

  const check = () => {
    const fe = {};
    if (form.name.trim().length < 2) fe.name = 'Nhập họ và tên (ít nhất 2 ký tự).';
    if (!EMAIL_RE.test(form.email.trim())) fe.email = 'Email chưa đúng dạng, ví dụ ten@cuahang.vn.';
    const broken = PASSWORD_RULES.find((r) => !r.test(form.password));
    if (broken) fe.password = `Mật khẩu chưa đạt: ${broken.label.toLowerCase()}.`;
    return fe;
  };

  const submit = async (e) => {
    e.preventDefault();
    const fe = check();
    setFieldErr(fe);
    setError('');
    setTaken(false);
    const first = ['name', 'email', 'password'].find((k) => fe[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setLoading(true);
    try {
      await signup({ ...form, remember });
      // App thấy phiên mới và tự chuyển sang trang cần vào
    } catch (err) {
      const { message, fields, status } = authError(err);
      setLoading(false);
      if (status === 409) {
        setTaken(true);
        setFieldErr({ email: fields.email || message });
        refs.email.current?.focus();
        return;
      }
      if (Object.keys(fields).length) setFieldErr(fields);
      else setError(message);
    }
  };

  const pw = form.password;

  return (
    <Pane>
      <BackLink />
      <div className="mt-4">
        <h1 className="text-display font-semibold tracking-[-0.01em] text-ink-hi">Tạo tài khoản</h1>
        <p className="mt-1.5 text-sm text-ink-mid">
          Đã có tài khoản?{' '}
          <AuthLink to="/login" className="rounded-ctrl font-medium text-accent-hi underline underline-offset-4 hover:text-accent">
            Đăng nhập
          </AuthLink>
        </p>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-8 flex flex-col gap-4" {...focusFrame}>
        <TextField ref={refs.name} label="Họ và tên" icon={UserRound} value={form.name} onChange={set('name')} autoComplete="name" error={fieldErr.name} maxLength={80} required />
        <TextField
          label="Tên cửa hàng"
          aside={<span className="text-xs text-ink-lo">Không bắt buộc</span>}
          icon={Store}
          value={form.shop}
          onChange={set('shop')}
          autoComplete="organization"
          maxLength={120}
        />
        <TextField ref={refs.email} label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" error={fieldErr.email} required />
        {taken && (
          <Button
            variant="link"
            type="button"
            className="-mt-2 self-start text-sm font-medium"
            onClick={() => go('/login', { state: { email: form.email.trim() } })}
          >
            Đăng nhập bằng email này
          </Button>
        )}
        <div>
          <TextField
            ref={refs.password}
            label="Mật khẩu"
            type={showPw ? 'text' : 'password'}
            icon={Lock}
            value={pw}
            onChange={set('password')}
            autoComplete="new-password"
            error={fieldErr.password}
            id="mat-khau-moi"
            aria-describedby={fieldErr.password ? 'mat-khau-moi-err luat-mat-khau' : 'luat-mat-khau'}
            required
            trailing={
              <IconButton icon={showPw ? EyeOff : Eye} variant="ghost" size="sm" label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} pressed={showPw} onClick={() => setShowPw((v) => !v)} />
            }
          />
          <ul id="luat-mat-khau" className="mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Yêu cầu mật khẩu">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(pw);
              const Icon = ok ? Check : Minus;
              return (
                <li key={r.id} className={`flex items-center gap-1.5 transition-colors duration-micro ${ok ? 'text-ok' : 'text-ink-lo'}`}>
                  <Icon size={14} strokeWidth={ok ? 3 : 2} aria-hidden="true" />
                  {r.label}
                  <span className="sr-only">{ok ? ', đã đạt' : ', chưa đạt'}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <Checkbox checked={remember} onChange={setRemember} label="Giữ đăng nhập trên máy này" />
        {error && (
          <p role="alert" className="flex items-start gap-1.5 rounded-ctrl bg-crit/12 px-3 py-2.5 text-sm text-crit">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
        <Button type="submit" block loading={loading} className="mt-2 h-11">
          Tạo tài khoản
        </Button>
      </form>

    </Pane>
  );
};

export default Signup;
