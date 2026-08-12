import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@company.com');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Simulate API call for premium feel
    setTimeout(() => {
      if (email === 'admin@company.com' && password === 'password123') {
        onLogin();
        navigate('/dashboard');
      } else {
        setError('Invalid credentials. Try admin@company.com / password123');
        setIsLoading(false);
      }
    }, 1500);
  };

  return (
    <div className="login-container">
      {/* Left Side - Marketing/Branding */}
      <div className="login-left">
        {/* Decorative Blur Circles */}
        <div style={{ position: 'absolute', top: '20%', left: '10%', width: '300px', height: '300px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '50%', filter: 'blur(100px)' }}></div>
        <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: '300px', height: '300px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '50%', filter: 'blur(100px)' }}></div>

        <div style={{ position: 'relative', zIndex: 10, maxWidth: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{
              width: '48px', height: '48px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 'bold', fontSize: '1.5rem',
              boxShadow: '0 10px 25px rgba(59, 130, 246, 0.5)'
            }}>
              CX
            </div>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.5px', margin: 0, color: 'var(--text-primary)' }}>
                Customer<span className="text-gradient">Radar</span>
              </h1>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>
                Enterprise Edition
              </div>
            </div>
          </div>
          
          <h2 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
            Elevate Your <br />
            <span style={{ color: 'var(--accent-blue)' }}>Customer Experience</span>
          </h2>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '3rem', maxWidth: '80%' }}>
            Harness the power of AI to analyze feedback, predict trends, and prevent crises before they happen. Log in to your enterprise command center.
          </p>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <ShieldCheck size={20} color="var(--risk-low)" />
            Enterprise-grade security & SOC2 Compliant
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="login-right">
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Welcome Back</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Please enter your credentials to access the dashboard.</p>
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
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address</label>
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
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', cursor: 'pointer' }}>Forgot password?</span>
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
              boxShadow: '0 10px 25px rgba(59, 130, 246, 0.4)', transition: 'all 0.2s',
              opacity: isLoading ? 0.8 : 1
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                Authenticating...
              </>
            ) : (
              <>
                Sign In to Dashboard <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '3rem' }}>
          &copy; 2026 CustomerRadar Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
