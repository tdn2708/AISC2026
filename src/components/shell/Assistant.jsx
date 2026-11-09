import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, RotateCcw, ArrowUpRight } from 'lucide-react';
import { Drawer, EvidenceSwatch } from '../ui';
import { fmtInt, fmtDate } from '../../lib/format';
import { readStorage } from '../../lib/storage';
import { ASK_EVENT } from '../../lib/assistant';

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
 */

const PROVIDER = {
  gemini: 'Gemini diễn đạt lại từ số liệu hệ thống tính',
  groq: 'Groq diễn đạt lại từ số liệu hệ thống tính',
  openrouter: 'Mô hình ngôn ngữ diễn đạt lại từ số liệu hệ thống tính',
  deterministic: 'Tính trực tiếp từ dữ liệu, không qua mô hình ngôn ngữ'
};

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

/** Markdown tối giản: **đậm**, _nghiêng_, gạch đầu dòng, tiêu đề ###, trích dẫn [n] */
const Inline = ({ text, onCite, maxCite = 0 }) => {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\[\d+\]|(?<![\w])_[^_]+_(?![\w]))/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-ink-hi">{p.slice(2, -2)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    const cite = p.match(/^\[(\d+)\]$/);
    if (cite && Number(cite[1]) > maxCite) return null;
    if (cite) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onCite(Number(cite[1]))}
          className="mx-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded bg-accent-dim px-1 align-text-top font-mono text-xs font-semibold text-accent-hi hover:bg-accent hover:text-on-accent"
          aria-label={`Xem dẫn chứng số ${cite[1]}`}
        >
          {cite[1]}
        </button>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
};

const Markdown = ({ text, onCite, maxCite = 0 }) => {
  const blocks = [];
  let list = null;
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      list ||= [];
      list.push(<li key={i}><Inline text={bullet[1]} onCite={onCite} maxCite={maxCite} /></li>);
      return;
    }
    if (list) {
      blocks.push(<ul key={`l${i}`} className="my-1.5 list-disc space-y-1 pl-5">{list}</ul>);
      list = null;
    }
    if (!line.trim()) return;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      heading
        ? <p key={i} className="mt-3 font-semibold text-ink-hi first:mt-0"><Inline text={heading[1]} onCite={onCite} maxCite={maxCite} /></p>
        : <p key={i} className="mt-2 first:mt-0"><Inline text={line} onCite={onCite} maxCite={maxCite} /></p>
    );
  });
  if (list) blocks.push(<ul key="lend" className="my-1.5 list-disc space-y-1 pl-5">{list}</ul>);
  return <div className="text-sm leading-relaxed text-ink-mid">{blocks}</div>;
};

const Answer = ({ msg, index, onOpenFeedback }) => {
  const [focus, setFocus] = useState(null);
  const listRef = useRef(null);
  const cite = (n) => {
    setFocus(n);
    listRef.current?.querySelector(`[data-cite="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (msg.error) return <p className="rounded-lg bg-crit/8 px-3 py-2.5 text-sm text-crit">{msg.error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <Markdown text={msg.text} onCite={cite} maxCite={Math.min(5, msg.evidence?.length || 0)} />

      {msg.facts?.length > 0 && (
        <details className="rounded-lg border border-line-soft">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink-mid hover:text-ink-hi">
            Số liệu hệ thống đã tính
          </summary>
          <div className="border-t border-line-soft px-3 py-2.5 text-xs leading-relaxed text-ink-mid">
            {msg.facts.map((s) => (
              <div key={s.title} className="mb-2 last:mb-0">
                <p className="font-semibold text-ink-hi">{s.title}</p>
                <ul className="mt-0.5 list-disc pl-4">{s.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {msg.evidence?.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-mid">Dẫn chứng</p>
          {/* Đánh số vì câu trả lời trích dẫn theo [n] */}
          <ol ref={listRef} className="flex list-none flex-col gap-1.5">
            {msg.evidence.slice(0, 5).map((e, i) => {
              const verified = e.trustTier === 'P1' || e.trustTier === 'P2';
              return (
                <li
                  key={`${index}-${e.id}`}
                  data-cite={i + 1}
                  className={`rounded-lg border p-2.5 transition-colors ${focus === i + 1 ? 'border-accent bg-accent-dim' : 'border-line-soft'}`}
                >
                  <p className="flex gap-2 text-[0.8rem] leading-relaxed text-ink-hi">
                    <span className="font-mono text-xs font-semibold text-accent-hi">{i + 1}</span>
                    <span className="line-clamp-3">“{e.text}”</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-xs text-ink-lo">
                    <span className="inline-flex items-center gap-1">
                      <EvidenceSwatch kind={verified ? 'verified' : 'inferred'} size={9} />
                      {verified ? 'Có chứng từ' : 'AI đoán'}
                    </span>
                    {e.cause || e.category ? <span>{e.cause || e.category}</span> : null}
                    <span>{e.source}</span>
                    {e.date && <span className="font-mono">{fmtDate(e.date)}</span>}
                    <button type="button" onClick={() => onOpenFeedback(e.text)} className="ml-auto inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
                      Mở <ArrowUpRight size={11} aria-hidden="true" />
                    </button>
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {msg.meta && (
        <p className="text-xs leading-relaxed text-ink-lo">
          {PROVIDER[msg.meta.provider] || PROVIDER.deterministic}. Dựa trên {fmtInt(msg.meta.validFeedbacks)} phản hồi được tính, cùng số liệu với Tổng quan.
        </p>
      )}
    </div>
  );
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
      setMessages((m) => [...m, { role: 'assistant', text: data.text, facts: data.facts, evidence: data.evidence, meta: data.meta }]);
    } catch (e) {
      const msg = e.response?.data?.message || 'Không kết nối được máy chủ phân tích. Thử lại sau ít phút.';
      setMessages((m) => [...m, { role: 'assistant', error: msg }]);
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

  const openFeedback = (text) => {
    setOpen(false);
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
      onClose={() => setOpen(false)}
      title="Hỏi dữ liệu"
      subtitle="Trả lời bằng chính số liệu trên dashboard, kèm dẫn chứng"
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
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-hi outline-none placeholder:text-ink-lo focus:border-accent focus:ring-4 focus:ring-accent-dim"
            />
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={busy || !input.trim()}
              aria-label="Gửi câu hỏi"
              className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-on-accent transition-opacity disabled:opacity-40"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="inline-flex items-center gap-1 self-start text-xs text-ink-lo hover:text-ink-hi">
              <RotateCcw size={12} aria-hidden="true" /> Bắt đầu cuộc hỏi mới
            </button>
          )}
        </div>
      }
    >
      {messages.length === 0 ? (
        <div>
          <p className="text-sm leading-relaxed text-ink-mid">
            Hỏi bằng tiếng Việt thường. Hệ thống tự tính con số trên toàn bộ dữ liệu, rồi trả lời kèm phản hồi gốc để bạn kiểm lại.
          </p>
          {suggestions.length > 0 && (
            <ul className="mt-5 flex list-none flex-col gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full rounded-lg border border-line px-3.5 py-2.5 text-left text-sm text-ink-hi transition-colors hover:border-accent hover:bg-accent-dim"
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
              <p key={i} className="ml-10 self-end rounded-lg bg-raised px-3.5 py-2 text-sm text-ink-hi">{m.text}</p>
            ) : (
              <Answer key={i} msg={m} index={i} onOpenFeedback={openFeedback} />
            )
          )}
          {busy && (
            <div className="flex flex-col gap-2" aria-live="polite">
              <span className="sr-only">Đang tính câu trả lời</span>
              <div className="h-3 w-3/4 animate-pulse rounded bg-raised" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-raised" />
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
    </Drawer>
  );
};

export default Assistant;
