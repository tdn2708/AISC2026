import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, User, Loader2, Trash2, Maximize2, Minimize2,
  Copy, Check, RefreshCw, Sparkles, FileText, ChevronDown, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { LogoMark } from './Logo';

/**
 * TRỢ LÝ PHÂN TÍCH
 * ------------------------------------------------------------------
 * Những gì đã sửa so với bản cũ, theo thứ tự mức ảnh hưởng tới người dùng:
 *
 *  - Gửi kèm LỊCH SỬ HỘI THOẠI, nên câu hỏi tiếp nối kiểu "còn tháng
 *    trước thì sao?" mới có nghĩa. Bản cũ chỉ gửi đúng một câu.
 *  - Hiện DẪN CHỨNG là các phản hồi thật đứng sau câu trả lời, mở ra
 *    xem được. Trước đây câu trả lời là một khối văn bản không kiểm
 *    chứng được.
 *  - Câu hỏi GỢI Ý sinh theo tình hình dữ liệu thật, vì người dùng mở
 *    khung chat lên thường không biết nên hỏi gì.
 *  - Phóng to toàn màn hình — phân tích dữ liệu trong khung 340px là
 *    không đọc nổi.
 *  - Sao chép câu trả lời, hỏi lại khi mạng lỗi, gõ nhiều dòng.
 *  - Dùng chung logo với toàn hệ thống thay vì chữ "CR" font viết tay.
 */

const GREETING = {
  role: 'ai',
  content:
    'Xin chào, tôi là trợ lý phân tích của **Customer Radar**.\n\n' +
    'Tôi đọc được toàn bộ dữ liệu đã qua tầng kiểm soát tin cậy: chỉ số, cảnh báo có kiểm ' +
    'định thống kê, nguyên nhân cốt lõi, chất lượng dữ liệu và kết quả thực nghiệm. ' +
    'Mọi con số tôi đưa ra đều được tính trực tiếp từ dữ liệu, không phải ước lượng.'
};

const STORAGE_KEY = 'crChatHistory';

const AiChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {
      console.error('Không đọc được lịch sử trò chuyện:', e);
    }
    return [GREETING];
  });

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [openEvidence, setOpenEvidence] = useState(null);
  const [lastFailed, setLastFailed] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      // Chỉ lưu phần cần thiết: dẫn chứng có thể rất dài
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-30).map((m) => ({ ...m, evidence: undefined })))
      );
    } catch (e) {
      console.error('Không lưu được lịch sử:', e);
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Câu hỏi gợi ý sinh theo dữ liệu thật, tải khi mở khung chat lần đầu
  useEffect(() => {
    if (!isOpen || suggestions.length) return;
    axios
      .get('/chat/suggestions')
      .then((res) => setSuggestions(res.data.suggestions || []))
      .catch(() => setSuggestions([]));
  }, [isOpen, suggestions.length]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, expanded]);

  const send = useCallback(async (text) => {
    const question = (text ?? input).trim();
    if (!question || isTyping) return;

    setInput('');
    setLastFailed(null);
    const nextMessages = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setIsTyping(true);

    try {
      // Gửi kèm lịch sử để câu hỏi tiếp nối có ngữ cảnh
      const history = nextMessages
        .slice(-8, -1)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

      // Tôn trọng bộ lọc người dùng đang đặt trên dashboard
      const filters = {
        time: localStorage.getItem('timeFilter') || 'All',
        source: localStorage.getItem('sourceFilter') || 'All',
        product: localStorage.getItem('productFilter') || 'All'
      };

      const res = await axios.post('/chat', { message: question, history, filters });
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: res.data.text,
          evidence: res.data.evidence || [],
          meta: res.data.meta || null
        }
      ]);
    } catch (error) {
      console.error('Lỗi gọi trợ lý:', error);
      setLastFailed(question);
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          isError: true,
          content:
            'Tôi không kết nối được tới máy chủ. Các số liệu trên dashboard vẫn chính xác ' +
            'vì chúng được tính bằng thống kê, không phụ thuộc vào trợ lý này.'
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, messages]);

  const handleKeyDown = (e) => {
    // Enter gửi, Shift+Enter xuống dòng — quy ước quen thuộc của mọi khung chat
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const copyAnswer = async (content, idx) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      /* trình duyệt chặn clipboard thì bỏ qua, không làm phiền người dùng */
    }
  };

  const resetChat = () => {
    setMessages([GREETING]);
    setOpenEvidence(null);
    setLastFailed(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const panelSize = expanded
    ? { width: 'min(920px, calc(100vw - 3rem))', height: 'min(760px, calc(100vh - 3rem))' }
    : { width: 'min(400px, calc(100vw - 2rem))', height: 'min(560px, calc(100vh - 3rem))' };

  return (
    <>
      {/* Nút nổi */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Mở trợ lý phân tích"
        style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          /* Bản cũ là một hình tròn tối kèm quầng sáng tím, trông như
             một phần tử vẽ lỗi hơn là một nút bấm. Nay dùng đúng bề mặt
             và viền của hệ thiết kế, và có nhãn khi rê chuột. */
          width: '52px', height: '52px', borderRadius: '50%',
          background: 'var(--raised)',
          border: '1px solid var(--border)',
          color: 'var(--accent-hi)',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1000,
          transition: 'border-color 120ms ease-out, background-color 120ms ease-out'
        }}
        title="Trợ lý phân tích"
        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--raised)'; }}
      >
        <LogoMark size={34} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed', bottom: '2rem', right: '2rem',
            ...panelSize,
            background: 'rgba(15,23,42,0.93)', WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '1rem',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            zIndex: 1000, overflow: 'hidden',
            transition: 'width 0.25s ease, height 0.25s ease'
          }}
        >
          {/* Thanh tiêu đề */}
          <div style={{
            padding: '0.85rem 1rem',
            background: 'var(--raised)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
              <LogoMark size={32} />
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Trợ lý phân tích</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>
                  Đọc toàn bộ dữ liệu đã qua Trust Layer
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }}>
              {[
                { icon: expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />, onClick: () => setExpanded(!expanded), title: expanded ? 'Thu nhỏ' : 'Phóng to' },
                { icon: <Trash2 size={16} />, onClick: resetChat, title: 'Xóa lịch sử trò chuyện' },
                { icon: <X size={18} />, onClick: () => setIsOpen(false), title: 'Đóng' }
              ].map((b, i) => (
                <button
                  key={i} onClick={b.onClick} title={b.title} aria-label={b.title}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '6px'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {b.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Vùng tin nhắn */}
          <div style={{
            flex: 1, padding: '1.1rem', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: '0.65rem',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {msg.role === 'user' ? <User size={14} /> : <LogoMark size={28} />}
                </div>

                <div style={{ maxWidth: expanded ? '78%' : '85%', minWidth: 0 }}>
                  <div style={{
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)'
                      : msg.isError ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
                    border: msg.isError ? '1px solid rgba(239,68,68,0.3)' : (msg.role === 'ai' ? '1px solid rgba(255,255,255,0.08)' : 'none'),
                    color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                    padding: '0.85rem 1.1rem', borderRadius: '1.25rem',
                    borderTopRightRadius: msg.role === 'user' ? '0.25rem' : '1.25rem',
                    borderTopLeftRadius: msg.role === 'ai' ? '0.25rem' : '1.25rem',
                    fontSize: '0.9rem', lineHeight: 1.6, wordBreak: 'break-word',
                    boxShadow: msg.role === 'user' ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'
                  }}>
                    {msg.role === 'user'
                      ? msg.content
                      : <div className="markdown-body" style={{ fontSize: '0.9rem' }}><ReactMarkdown>{msg.content}</ReactMarkdown></div>}
                  </div>

                  {/* Thanh công cụ dưới mỗi câu trả lời */}
                  {msg.role === 'ai' && !msg.isError && idx > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      marginTop: '0.4rem', flexWrap: 'wrap'
                    }}>
                      <button
                        onClick={() => copyAnswer(msg.content, idx)}
                        style={toolbarBtn}
                        title="Sao chép câu trả lời"
                      >
                        {copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                        {copiedIdx === idx ? 'Đã chép' : 'Chép'}
                      </button>

                      {msg.evidence?.length > 0 && (
                        <button
                          onClick={() => setOpenEvidence(openEvidence === idx ? null : idx)}
                          style={toolbarBtn}
                          title="Xem các phản hồi thật đứng sau câu trả lời này"
                        >
                          <FileText size={12} />
                          {msg.evidence.length} dẫn chứng
                          <ChevronDown
                            size={11}
                            style={{
                              transform: openEvidence === idx ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }}
                          />
                        </button>
                      )}

                      {msg.meta && (
                        <span
                          title={`Ý định: ${msg.meta.intent} · Công cụ: ${(msg.meta.toolsUsed || []).join(', ')}`}
                          style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}
                        >
                          {msg.meta.llmUsed ? 'dựa trên' : 'tính trực tiếp từ'}{' '}
                          {new Intl.NumberFormat('vi-VN').format(msg.meta.validFeedbacks)} phản hồi hợp lệ
                        </span>
                      )}
                    </div>
                  )}

                  {/* Dẫn chứng mở rộng */}
                  {openEvidence === idx && msg.evidence?.length > 0 && (
                    <div style={{
                      marginTop: '0.5rem', padding: '0.7rem 0.85rem',
                      background: 'rgba(0,0,0,0.25)', borderRadius: '0.6rem',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', flexDirection: 'column', gap: '0.55rem'
                    }}>
                      {msg.evidence.map((e, i) => (
                        <div key={e.id || i} style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>[{i + 1}]</span>{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>{e.text}</span>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {[e.category, e.cause, e.source, e.product, e.trustTier && `hạng ${e.trustTier}`]
                              .filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <LogoMark size={28} />
                <div style={{
                  background: 'rgba(255,255,255,0.05)', padding: '0.7rem 0.95rem',
                  borderRadius: '0.9rem', borderTopLeftRadius: 0,
                  display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-purple)' }} />
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    Đang tra cứu dữ liệu...
                  </span>
                </div>
              </div>
            )}

            {/* Thử lại khi lỗi mạng */}
            {lastFailed && !isTyping && (
              <button
                onClick={() => send(lastFailed)}
                style={{
                  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)',
                  color: 'var(--accent-blue)', padding: '0.4rem 0.8rem',
                  borderRadius: '99px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                }}
              >
                <RefreshCw size={12} /> Thử lại câu hỏi vừa rồi
              </button>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Câu hỏi gợi ý — chỉ hiện khi chưa có trao đổi nào */}
          {messages.length <= 1 && suggestions.length > 0 && (
            <div style={{ padding: '0 1.1rem 0.5rem 1.1rem' }}>
              <div style={{
                fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.45rem',
                display: 'flex', alignItems: 'center', gap: '0.3rem'
              }}>
                <Sparkles size={11} /> Gợi ý theo dữ liệu hiện tại
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    style={{
                      fontSize: '0.75rem', padding: '0.35rem 0.7rem', borderRadius: '99px',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                      color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-cyan)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ô nhập */}
          <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-card)' }}>
            <div 
              style={{ 
                position: 'relative', display: 'flex', alignItems: 'flex-end', 
                background: 'rgba(255,255,255,0.04)', borderRadius: '1.25rem', 
                border: '1px solid rgba(255,255,255,0.12)', padding: '0.2rem'
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Hỏi AI về chỉ số, nguyên nhân..."
                style={{
                  flex: 1, background: 'transparent',
                  border: 'none',
                  padding: '0.65rem 3rem 0.65rem 1rem', color: 'var(--text-primary)', outline: 'none',
                  fontSize: '0.9rem', fontFamily: 'inherit', resize: 'none',
                  maxHeight: '150px', lineHeight: 1.5,
                  minHeight: '24px'
                }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || isTyping}
                aria-label="Gửi câu hỏi"
                style={{
                  position: 'absolute',
                  right: '0.4rem',
                  bottom: '0.4rem',
                  width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                  background: input.trim() && !isTyping ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)' : 'transparent',
                  border: 'none', color: input.trim() && !isTyping ? 'white' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !isTyping ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  opacity: input.trim() && !isTyping ? 1 : 0.6
                }}
              >
                <Send size={16} style={{ marginLeft: input.trim() && !isTyping ? '2px' : '0' }} />
              </button>
            </div>

            <p style={{
              margin: '0.5rem 0 0 0', fontSize: '0.67rem', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '0.3rem', lineHeight: 1.4
            }}>
              <AlertCircle size={10} style={{ flexShrink: 0 }} />
              Mọi con số được tính trực tiếp từ dữ liệu. Enter để gửi, Shift+Enter xuống dòng.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
  background: 'transparent', border: 'none', color: 'var(--text-muted)',
  cursor: 'pointer', fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px'
};

export default AiChatWidget;
