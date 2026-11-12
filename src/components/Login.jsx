import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, EyeOff, Eye } from 'lucide-react';
import Logo from './Logo';
import { Button, IconButton, TextField, EvidenceSwatch } from './ui';
import { LedgerRun, PageEnter } from './motion';
import LedgerSkeleton from './dashboard/LedgerSkeleton';

/**
 * ĐĂNG NHẬP
 * ------------------------------------------------------------------
 * Trái: một khối mực nói sản phẩm làm gì, minh hoạ bằng chính thanh bằng
 * chứng sẽ gặp trong ứng dụng. Phải: biểu mẫu, đã điền sẵn tài khoản dùng
 * thử — người mở link lần đầu (giám khảo, khách tham quan) gặp ô trống
 * không gợi ý thì phần lớn sẽ đóng tab.
 *
 * F4-04: khối mực chạy "phép trừ" (LedgerRun mode="auto") MỘT lần khi tải,
 * với số thật của /trust/health; đây là chuyển động dàn dựng duy nhất của
 * trang. Giảm chuyển động: tờ sổ tĩnh, đủ số ngay. Chờ số thì khung xương
 * cùng hình tờ sổ; không tải được thì hiện ba loại bằng chứng.
 */
const DEMO = { email: 'admin@company.com', password: 'password123' };

const PROOF = [
  { kind: 'verified', text: 'Có chứng từ: khớp đơn hàng hoặc sàn xác nhận đã mua' },
  { kind: 'human', text: 'Người kiểm duyệt đã đọc lại' },
  { kind: 'inferred', text: 'AI đoán, chưa có chứng từ' }
];

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Sổ đối chiếu thật của kho đang chọn: người mở link thấy sản phẩm làm gì
  // trước cả khi đăng nhập. Không tải được thì quay về danh sách ba loại bằng chứng.
  const [ledger, setLedger] = useState(null);
  const [ledgerFailed, setLedgerFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    axios.get('/trust/health').then((r) => alive && setLedger(r.data)).catch(() => alive && setLedgerFailed(true));
    return () => { alive = false; };
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (email === DEMO.email && password === DEMO.password) {
        onLogin();
        navigate('/dashboard');
      } else {
        setError(`Sai email hoặc mật khẩu. Tài khoản dùng thử: ${DEMO.email} / ${DEMO.password}`);
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div className="cx grid min-h-screen min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section className="hidden flex-col justify-between bg-strip p-12 text-on-strip lg:flex">
        {/* Đổi token chữ cục bộ để chữ ký thương hiệu đọc được trên nền mực */}
        <div style={{ '--text-hi': 'var(--on-strip)', '--accent': 'var(--accent-on-strip)' }}>
          <Logo size="md" showTagline={false} />
        </div>
        <div className="max-w-[34rem]">
          <h1 className="text-cover font-semibold tracking-[-0.02em] text-balance">
            Phản hồi khách hàng, kèm bằng chứng cho từng con số.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-on-strip-mid">
            Đánh giá ảo, quảng cáo và chiến dịch có tổ chức bị lọc trước khi được tính. Phần còn lại cho bạn biết
            con số nào dựa trên chứng từ, con số nào do AI đoán.
          </p>
          {!ledgerFailed ? (
            <div className="mt-8 max-w-[400px]">
              {ledger ? <LedgerRun ledger={ledger} mode="auto" play={false} showLink={false} /> : <LedgerSkeleton />}
            </div>
          ) : (
          <ul className="mt-8 flex list-none flex-col gap-3 text-sm text-on-strip-mid">
            {PROOF.map((p) => (
              <li key={p.kind} className="flex items-center gap-3">
                {/* Mẫu tô sáng trên nền mực: cùng ngôn ngữ với thanh bằng chứng trong ứng dụng */}
                <span style={{ '--accent': 'var(--accent-on-strip)' }}><EvidenceSwatch kind={p.kind} size={14} /></span>
                {p.text}
              </li>
            ))}
          </ul>
          )}
        </div>
        <p className="text-xs text-on-strip-lo">© 2026 Customer Radar, đội LDS, Trường Đại học Công nghệ Thông tin</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        {/* M1 (K4-02): chỉ phần form vào bằng PageEnter; khối mực bên trái đứng yên */}
        <PageEnter className="w-full max-w-[380px]">
          <div className="mb-10 lg:hidden"><Logo size="md" showTagline={false} /></div>
          <div>
            <h2 className="text-display font-semibold tracking-[-0.01em] text-ink-hi">Đăng nhập</h2>
            <p className="mt-1.5 text-sm text-ink-mid">Tài khoản dùng thử đã được điền sẵn.</p>
          </div>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
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
              trailing={
                <IconButton icon={showPw ? EyeOff : Eye} variant="ghost" size="sm" label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} pressed={showPw} onClick={() => setShowPw((v) => !v)} />
              }
            />
            <Button type="submit" block loading={loading} className="mt-2 h-11">
              Đăng nhập
            </Button>
          </form>
          <p className="mt-8 border-t border-line-soft pt-5 text-sm text-ink-mid">
            Chưa biết Customer Radar làm gì?{' '}
            <Link to="/" className="rounded-ctrl font-medium text-accent-hi underline underline-offset-4 hover:text-accent">
              Xem trang giới thiệu
            </Link>
          </p>
        </PageEnter>
      </section>
    </div>
  );
};

export default Login;
