import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const AiChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('aiChatHistory');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [{ role: 'ai', content: 'Xin chào, tôi là **CustomerRadar AI**, Chuyên gia Phân tích Trải nghiệm Khách hàng (CX). Bạn cần tôi phân tích số liệu hay đưa ra chiến lược gì hôm nay?' }];
  });
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('aiChatHistory', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    try {
      const res = await axios.post('/chat', { message: userMsg });
      setMessages(prev => [...prev, { role: 'ai', content: res.data.text }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Lỗi kết nối đến máy chủ AI.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(6,182,212,0.1) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          color: 'white',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 30px rgba(139, 92, 246, 0.3), inset 0 0 15px rgba(168,85,247,0.2)',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'transform 0.2s ease',
          overflow: 'hidden'
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)' }}></div>
        <div style={{ position: 'absolute', width: '60%', height: '60%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)' }}></div>
        <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }}></div>
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
        <span style={{ 
          fontFamily: "'Dancing Script', cursive", 
          fontSize: '1.8rem', 
          fontWeight: 700,
          background: 'linear-gradient(135deg, #22d3ee, #c084fc)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          position: 'relative',
          zIndex: 2,
          lineHeight: 1,
          marginLeft: '2px'
        }}>
          CR
        </span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '340px',
          height: '520px',
          maxHeight: '80vh',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '1rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          overflow: 'hidden',
          animation: 'fadeIn 0.3s ease'
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ 
                position: 'relative',
                width: '36px', height: '36px', borderRadius: '50%', 
                background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(6,182,212,0.1) 100%)', 
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0
              }}>
                <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}></div>
                <div style={{ position: 'absolute', width: '60%', height: '60%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}></div>
                <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)' }}></div>
                <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                <span style={{ 
                  fontFamily: "'Dancing Script', cursive", 
                  fontSize: '1.2rem', 
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #22d3ee, #c084fc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  position: 'relative',
                  zIndex: 2,
                  lineHeight: 1,
                  marginLeft: '2px'
                }}>
                  CR
                </span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>CustomerRadar AI</h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>CX Intelligence</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => {
                  setMessages([{ role: 'ai', content: 'Xin chào, tôi là **CustomerRadar AI**, Chuyên gia Phân tích Trải nghiệm Khách hàng (CX). Bạn cần tôi phân tích số liệu hay đưa ra chiến lược gì hôm nay?' }]);
                  localStorage.removeItem('aiChatHistory');
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex' }}
                title="Xóa lịch sử trò chuyện"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                gap: '0.75rem',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
              }}>
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} color="var(--accent-purple)" />}
                </div>
                <div style={{
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  padding: '0.75rem 1rem',
                  borderRadius: '1rem',
                  borderTopRightRadius: msg.role === 'user' ? 0 : '1rem',
                  borderTopLeftRadius: msg.role === 'ai' ? 0 : '1rem',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  maxWidth: '85%'
                }}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={14} color="var(--accent-purple)" />
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.75rem 1rem', borderRadius: '1rem', borderTopLeftRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Loader2 size={16} className="animate-spin" color="var(--accent-purple)" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập câu hỏi phân tích (VD: Xu hướng khiếu nại...)"
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '99px',
                  padding: '0.75rem 1.25rem',
                  color: 'white',
                  outline: 'none',
                  fontSize: '0.9rem'
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                style={{
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: input.trim() && !isTyping ? 'var(--accent-purple)' : 'rgba(255,255,255,0.1)',
                  border: 'none', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s ease'
                }}
              >
                <Send size={18} style={{ marginLeft: '2px' }} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AiChatWidget;
