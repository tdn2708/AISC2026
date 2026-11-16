import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, RotateCcw } from 'lucide-react';
import { Drawer, Button, IconButton, fieldClass } from '../ui';
import { readStorage } from '../../lib/storage';
import { ASK_EVENT } from '../../lib/assistant';
import { SkeletonBlock, SkeletonLines } from '../ui/Skeleton';
import { Answer } from './ChatAnswer';

/**
 * TRỢ LÝ "HỎI DỮ LIỆU"
 * ------------------------------------------------------------------
 * Mặt trước của backend/services/chat_engine.js: mọi con số do JavaScript
 * tính trên toàn bộ dữ liệu (trùng với dashboard), dẫn chứng lấy bằng BM25
 * có mã truy vết, mô hình ngôn ngữ chỉ diễn đạt lại. Mỗi câu trả lời hiện
 * kèm: số liệu hệ thống đã tính, dẫn chứng đánh số khớp với [n] trong câu,
 * và nguồn của câu trả lời (mô hình nào, hay tính trực tiếp).
 *
 * Lịch sử giữ trong sessionStorage theo kho dữ liệu: khung trang dựng lại
 * mỗi lần chuyển trang, nhưng cuộc hỏi đáp thì không được mất.
 *
 * Chuyển động (F4-03): ngăn kéo trượt vào từ mép phải (transform,
 * --motion-medium, ease-out) và trượt ra nhanh hơn (70%, ease-in). Câu trả
 * lời MỚI hiện theo đoạn: từng đoạn, rồi số liệu, dẫn chứng, nguồn, lệch
 * nhịp nhẹ bằng opacity + dịch 4px (Stagger). Không giả hiệu ứng gõ chữ.
 * Câu trả lời cũ (mở lại ngăn kéo, tải lại trang) hiện ngay. Giảm chuyển
 * động: không trượt, không lệch nhịp.
 */

const storeKey = () => `crAssistant:${readStorage('workspace', 'demo')}`;
const loadHistory = () => {
  try {
    const v = JSON.parse(sessionStorage.getItem(storeKey()) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const saveHistory = (msgs) => {
  try {
    sessionStorage.setItem(storeKey(), JSON.stringify(msgs.slice(-20)));
  } catch {
    // không lưu được thì thôi, cuộc hỏi đáp vẫn chạy trong phiên này
  }
};

const Assistant = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const endRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => saveHistory(messages), [messages]);
  useEffect(() => {
    if (open) setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 30);
  }, [open, messages.length, busy]);

  const ask = useCallback(async (question) => {
    const q = String(question || '').trim();
    if (!q) return;
    const history = messagesRef.current
      .filter((m) => !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.role === 'user' ? m.text : String(m.text || '').slice(0, 800) }));
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const { data } = await axios.post('/chat', {
        message: q,
        history,
        filters: {
          time: readStorage('timeFilter', 'All'),
          source: readStorage('sourceFilter', 'All'),
          product: readStorage('productFilter', 'All')
        }
      });
      setMessages((m) => [...m, { role: 'assistant', text: data.text, facts: data.facts, evidence: data.evidence, meta: data.meta, at: Date.now() }]);
    } catch (e) {
      const msg = e.response?.data?.message || 'Không kết nối được máy chủ phân tích. Thử lại sau ít phút.';
      setMessages((m) => [...m, { role: 'assistant', error: msg, at: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      setOpen(true);
      if (e.detail?.question) ask(e.detail.question);
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [ask]);

  useEffect(() => {
    if (!open || suggestions.length) return;
    axios.get('/chat/suggestions').then((r) => setSuggestions(r.data?.suggestions || [])).catch(() => {});
  }, [open, suggestions.length]);

  // Trượt vào và ra do Drawer dùng chung lo (ui/Overlay.jsx)
  const close = useCallback(() => setOpen(false), []);

  const openFeedback = (text) => {
    close();
    navigate(`/feedbacks?q=${encodeURIComponent(String(text).slice(0, 40))}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (!busy) ask(input);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Hỏi dữ liệu"
      subtitle="Trả lời bằng số liệu của shop"
      width={520}
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-end gap-2">
            <textarea
              data-autofocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Ví dụ: Tuần này khách chê gì nhiều nhất?"
              aria-label="Câu hỏi"
              className={`min-h-11 flex-1 resize-none px-3 py-2 ${fieldClass({ multiline: true })}`}
            />
            <IconButton icon={ArrowUp} variant="primary" size={44} label="Gửi câu hỏi" onClick={() => ask(input)} disabled={busy || !input.trim()} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                close();
                navigate('/butler');
              }}
            >
              Mở Quản gia
            </Button>
            {messages.length > 0 && (
              <Button variant="link" size="sm" icon={RotateCcw} onClick={() => setMessages([])}>
                Bắt đầu cuộc hỏi mới
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div>
      {messages.length === 0 ? (
        <div>
          <p className="text-sm leading-relaxed text-ink-mid">
            Hỏi bằng tiếng Việt thường, câu trả lời kèm phản hồi gốc.
          </p>
          {suggestions.length > 0 && (
            <ul className="mt-5 flex list-none flex-col gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full rounded-ctrl border border-line px-3.5 py-2.5 text-left text-sm text-ink-hi transition-colors duration-micro ease-out hover:border-accent hover:text-accent-hi"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className="ml-10 self-end rounded-ctrl bg-raised px-3.5 py-2 text-sm text-ink-hi">{m.text}</p>
            ) : (
              <Answer key={i} msg={m} index={i} onOpenFeedback={openFeedback} />
            )
          )}
          {busy && (
            <SkeletonBlock label="Đang tính câu trả lời" className="flex max-w-[80%] flex-col gap-4">
              <SkeletonLines lines={3} />
              <SkeletonLines lines={2} />
            </SkeletonBlock>
          )}
          <div ref={endRef} />
        </div>
      )}
      </div>
    </Drawer>
  );
};

export default Assistant;
