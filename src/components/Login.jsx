import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, ShieldCheck, Activity, EyeOff, Eye, KeyRound } from 'lucide-react';
import Logo, { LogoMark } from './Logo';
import { Button, TextField } from './ui';

/**
 * ĐĂNG NHẬP — màn "trình diễn" của sản phẩm.
 * Ảnh phong cảnh tràn màn hình (chỉ là hình nền, không gắn với khách hàng
 * nào), phủ sương sage; thẻ đăng nhập là một tấm kính.
 *
 * Tài khoản demo in THẲNG trên màn hình: người mở link lần đầu (giám khảo,
 * khách tham quan) gặp ô trống không gợi ý thì phần lớn sẽ đóng tab.
 */
const DEMO = { email: 'admin@company.com', password: 'password123' };

const FEATURES = [
  { icon: ShieldCheck, title: 'Tầng kiểm soát tin cậy', text: 'Năm nhóm tín hiệu lọc đánh giá ảo trước khi chạm tới con số' },
  { icon: Activity, title: 'Cảnh báo có kiểm định', text: 'z-test, EWMA và hiệu chỉnh FDR — không dùng ngưỡng cố định' },
  { icon: EyeOff, title: 'Che thông tin cá nhân', text: 'Ngay từ bước tiền xử lý, theo Nghị định 13/2023' }
];

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (email === DEMO.email && password === DEMO.password) {
        onLogin();
        navigate('/dashboard');
      } else {
        setError('Sai thông tin đăng nhập. Dùng tài khoản dùng thử bên dưới.');
        setLoading(false);
      }
    }, 700);
  };

  return (
    <div className="cx relative min-h-screen overflow-hidden">
      {/* Ảnh nền + lớp sương: đậm dần sang phải để thẻ kính luôn đọc rõ */}
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/uit-campus.webp')" }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, transparent 45%, rgb(20 34 38 / 0.45) 100%), linear-gradient(100deg, rgb(20 34 38 / 0.7) 0%, rgb(20 34 38 / 0.42) 42%, rgb(233 239 238 / 0.35) 62%, rgb(233 239 238 / 0.82) 100%)'
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1320px] items-center gap-10 px-6 py-10 lg:grid-cols-[1.15fr_minmax(380px,460px)] lg:px-12">
        {/* Thương hiệu */}
        <section className="hidden text-white lg:block animate-fade-up">
          <div className="inline-flex items-center gap-3 rounded-lg border border-white/20 bg-white/12 p-2 pr-5 backdrop-blur-md">
            <LogoMark size={38} />
            <span className="text-lg leading-none text-white">
              <span className="font-semibold">Customer</span>{' '}
              <span className="font-semibold text-[#CFE6DE]">Radar</span>
            </span>
          </div>
          <p className="mt-10 text-xs font-semibold tracking-[0.22em] text-white/75 uppercase">Customer intelligence · đa kênh</p>
          <h1 className="mt-3 max-w-xl text-[3.4rem] leading-[1.08] font-semibold tracking-tight">
            Nghe đúng tiếng nói
            <span className="block">của khách hàng thật.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[1.02rem] leading-relaxed text-white/80">
            Phân tích phản hồi đa kênh với một tầng kiểm soát tin cậy đặt trước tầng phân tích — đánh giá ảo, quảng cáo và
            chiến dịch có tổ chức bị loại trước khi chạm tới bất kỳ con số nào bạn nhìn thấy.
          </p>
          <ul className="mt-9 grid max-w-2xl list-none gap-3 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                <f.icon size={18} className="text-[#CFE6DE]" aria-hidden="true" />
                <p className="mt-2.5 text-sm font-semibold">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/70">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Thẻ đăng nhập */}
        <section className="glass-strong mx-auto w-full max-w-[460px] rounded-xl p-7 sm:p-9 animate-pop-in">
          <div className="mb-7 lg:hidden"><Logo size="md" /></div>
          <p className="eyebrow">Đăng nhập</p>
          <h2 className="mt-2 text-[1.7rem] font-semibold tracking-tight text-ink-hi">
            Chào mừng trở lại
          </h2>
          <p className="mt-1 text-sm text-ink-mid">Đăng nhập để vào bảng điều khiển.</p>

          <div className="mt-6 rounded-lg bg-accent-dim p-4">
            <p className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.12em] text-accent-hi uppercase">
              <KeyRound size={13} aria-hidden="true" /> Tài khoản dùng thử
            </p>
            <p className="mt-1.5 font-mono text-[0.82rem] leading-relaxed text-ink-hi">
              {DEMO.email}
              <br />
              {DEMO.password}
            </p>
            <Button
              variant="outline"
              size="sm"
              block
              className="mt-3"
              onClick={() => {
                setEmail(DEMO.email);
                setPassword(DEMO.password);
                setError('');
              }}
            >
              Điền sẵn thông tin
            </Button>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <TextField label="Email" type="email" icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <TextField
              label="Mật khẩu"
              type={showPw ? 'text' : 'password'}
              icon={Lock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              error={error || undefined}
              aside={<span className="text-xs text-ink-lo">Quên mật khẩu? Liên hệ quản trị viên</span>}
              trailing={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="grid size-8 place-items-center rounded-lg text-ink-lo hover:bg-raised hover:text-ink-hi">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <Button type="submit" size="lg" block iconRight={ArrowRight} loading={loading} className="mt-2">
              {loading ? 'Đang xác thực…' : 'Vào bảng điều khiển'}
            </Button>
          </form>

          <p className="mt-7 text-center text-xs text-ink-lo">© 2026 Customer Radar</p>
        </section>
      </div>
    </div>
  );
};

export default Login;
