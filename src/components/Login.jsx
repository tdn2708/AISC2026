import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck, BarChart3, KeyRound } from 'lucide-react';
import Logo from './Logo';

/**
 * Tài khoản demo được IN THẲNG trên màn hình đăng nhập.
 * Người mở link lần đầu (giám khảo, khách tham quan) gặp ngay ô "Email /
 * Mật khẩu" mà không có gợi ý thì phần lớn sẽ đóng tab — và toàn bộ
 * công sức triển khai thành số không. Một nút điền sẵn giải quyết việc đó.
 */
const DEMO_ACCOUNT = { email: 'admin@company.com', password: 'password123' };

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState(DEMO_ACCOUNT.email);
  const [password, setPassword] = useState(DEMO_ACCOUNT.password);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Simulate API call for premium feel
    setTimeout(() => {
      if (email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
        onLogin();
        navigate('/dashboard');
      } else {
        setError('Sai thông tin đăng nhập. Dùng tài khoản demo hiển thị phía trên.');
        setIsLoading(false);
      }
    }, 1500);
  };

  return (
    <div className="login-container">
      {/* Left Side - Marketing/Branding */}
      <div className="login-left">
        {/* Decorative Blur Circles */}
        <div style={{ position: 'absolute', top: '20%', left: '10%', width: '300px', height: '300px', background: 'var(--accent-dim)', borderRadius: '50%', filter: 'blur(100px)' }}></div>
        <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: '300px', height: '300px', background: 'var(--accent-dim)', borderRadius: '50%', filter: 'blur(100px)' }}></div>

        <div style={{ position: 'relative', zIndex: 10, maxWidth: '600px' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <Logo size="lg" tagline="Customer Intelligence" />
          </div>

          <h2 style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1.12, marginBottom: '1.25rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Nghe đúng tiếng nói<br />
            <span style={{ color: 'var(--accent-blue)' }}>của khách hàng thật</span>
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '2.5rem', maxWidth: '85%' }}>
            Phân tích phản hồi đa kênh với một tầng kiểm soát tin cậy dữ liệu đặt trước
            tầng phân tích. Đánh giá ảo, nội dung quảng cáo và cụm đánh giá có tổ chức
            được loại trước khi chạm tới bất kỳ con số nào bạn nhìn thấy.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldCheck size={18} color="var(--risk-low)" style={{ flexShrink: 0 }} />
              Năm nhóm tín hiệu phát hiện đánh giá không xác thực
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <BarChart3 size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              Cảnh báo có kiểm định thống kê, không dùng ngưỡng cố định
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Lock size={18} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
              Che thông tin cá nhân ngay từ bước tiền xử lý
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="login-right">
        {/* Logo lặp lại ở cột phải cho màn hình hẹp, nơi cột trái bị ẩn */}
        <div className="login-mobile-logo" style={{ marginBottom: '2rem' }}>
          <Logo size="md" />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Đăng nhập</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>Nhập thông tin để vào bảng điều khiển.</p>
        </div>

        {/* Tài khoản demo hiển thị sẵn — xem ghi chú ở đầu tệp */}
        <div style={{
          background: 'rgba(34, 211, 238, 0.07)',
          border: '1px solid rgba(34, 211, 238, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <KeyRound size={15} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Tài khoản dùng thử
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.7 }}>
            {DEMO_ACCOUNT.email}<br />
            {DEMO_ACCOUNT.password}
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_ACCOUNT.email);
              setPassword(DEMO_ACCOUNT.password);
              setError('');
            }}
            style={{
              marginTop: '0.75rem', width: '100%', padding: '0.5rem',
              background: 'rgba(34, 211, 238, 0.12)', color: 'var(--accent-cyan)',
              border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600
            }}
          >
            Điền sẵn và đăng nhập nhanh
          </button>
        </div>

        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', 
            color: 'var(--risk-critical)', padding: '1rem', borderRadius: 'var(--radius-md)', 
            marginBottom: '1.5rem', fontSize: '0.9rem' 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Địa chỉ email</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Mail size={18} />
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ 
                  width: '100%', padding: '1rem 1rem 1rem 3rem', 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', 
                  fontSize: '1rem', outline: 'none', transition: 'border 0.2s'
                }} 
                onFocus={(e) => e.target.style.border = '1px solid var(--accent-blue)'}
                onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Mật khẩu</label>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', cursor: 'pointer' }}>Quên mật khẩu?</span>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ 
                  width: '100%', padding: '1rem 1rem 1rem 3rem', 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', 
                  fontSize: '1rem', outline: 'none', transition: 'border 0.2s'
                }} 
                onFocus={(e) => e.target.style.border = '1px solid var(--accent-blue)'}
                onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            style={{ 
              marginTop: '1rem', width: '100%', padding: '1rem', 
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', 
              color: 'white', border: 'none', borderRadius: 'var(--radius-md)', 
              fontSize: '1rem', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 10px 25px var(--accent)', transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
              opacity: isLoading ? 0.8 : 1
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                Đang xác thực...
              </>
            ) : (
              <>
                Vào bảng điều khiển <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '3rem' }}>
          &copy; 2026 Customer Radar — Đội LDS, Trường Đại học Công nghệ Thông tin
        </p>
      </div>
    </div>
  );
};

export default Login;
