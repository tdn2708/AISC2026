import React, { useLayoutEffect, useRef, useState } from 'react';
import { EvidenceSwatch, Button } from '../ui';
import { fmtInt, fmtDate } from '../../lib/format';
import { Stagger, prefersReducedMotion } from '../motion';

// Câu trả lời về trong khoảng này (tính từ lúc nhận) thì coi là mới, được hiện theo đoạn
const FRESH_MS = 3000;

const PROVIDER = {
  gemini: 'Gemini diễn đạt lại từ số liệu hệ thống tính',
  groq: 'Groq diễn đạt lại từ số liệu hệ thống tính',
  openrouter: 'Mô hình ngôn ngữ diễn đạt lại từ số liệu hệ thống tính',
  deterministic: 'Tính trực tiếp từ dữ liệu, không qua mô hình ngôn ngữ'
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
          onClick={() => onCite?.(Number(cite[1]))}
          className="mx-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-ctrl bg-accent-dim px-1 align-text-top tabular-nums text-xs font-semibold text-accent-hi hover:bg-accent hover:text-on-accent"
          aria-label={`Xem dẫn chứng số ${cite[1]}`}
        >
          {cite[1]}
        </button>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
};

/** Các khối (đoạn, danh sách, tiêu đề) của một câu trả lời, để hiện lệch nhịp theo đoạn */
const markdownBlocks = ({ text, onCite, maxCite = 0 }) => {
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
  return blocks;
};

export const Answer = ({ msg, index = 0, onOpenFeedback }) => {
  const [focus, setFocus] = useState(null);
  const listRef = useRef(null);
  const facts = msg.facts || msg.reply?.facts;
  const evidence = msg.evidence || msg.reply?.evidence;
  const meta = msg.meta || msg.reply?.meta;

  // Mới về thì hiện theo đoạn: đổi runKey ngay trong layout effect (trước khi vẽ)
  // để Stagger giấu các đoạn rồi cho hiện lần lượt, không nháy
  const [fresh] = useState(() => {
    if (!msg.at) return false;
    const ts = new Date(msg.at).getTime();
    return Number.isFinite(ts) && Date.now() - ts < FRESH_MS;
  });
  const [runKey, setRunKey] = useState(0);
  useLayoutEffect(() => {
    if (fresh) setRunKey(1);
  }, [fresh]);

  const cite = (n) => {
    setFocus(n);
    listRef.current?.querySelector(`[data-cite="${n}"]`)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest'
    });
  };

  if (msg.error) return <p className="rounded-ctrl bg-crit/8 px-3 py-2.5 text-sm text-crit">{msg.error}</p>;

  return (
    <Stagger active={fresh} runKey={runKey} step={70} className="text-sm leading-relaxed text-ink-mid">
      {markdownBlocks({ text: msg.text, onCite: cite, maxCite: Math.min(5, evidence?.length || 0) })}

      {facts?.length > 0 && (
        <details className="mt-3 rounded-ctrl border border-line-soft">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink-mid hover:text-ink-hi">
            Số liệu hệ thống đã tính
          </summary>
          <div className="border-t border-line-soft px-3 py-2.5 text-xs leading-relaxed text-ink-mid">
            {facts.map((s, idx) => (
              <div key={s.title || idx} className="mb-2 last:mb-0">
                {s.title && <p className="font-semibold text-ink-hi">{s.title}</p>}
                {Array.isArray(s.facts) ? (
                  <ul className="mt-0.5 list-disc pl-4">{s.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                ) : typeof s === 'string' ? (
                  <p>{s}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      )}

      {evidence?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-ink-mid">Dẫn chứng</p>
          {/* Đánh số vì câu trả lời trích dẫn theo [n] */}
          <ol ref={listRef} className="flex list-none flex-col gap-1.5">
            {evidence.slice(0, 5).map((e, i) => {
              const verified = e.trustTier === 'P1' || e.trustTier === 'P2';
              return (
                <li
                  key={`${index}-${e.id || i}`}
                  data-cite={i + 1}
                  className={`rounded-ctrl p-2.5 transition-colors duration-short ease-out ${focus === i + 1 ? 'bg-accent-dim' : 'bg-raised'}`}
                >
                  <p className="flex gap-2 text-sm leading-relaxed text-ink-hi">
                    <span className="tabular-nums text-xs font-semibold text-accent-hi">{i + 1}</span>
                    <span className="line-clamp-3">“{e.text}”</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-xs text-ink-lo">
                    <span className="inline-flex items-center gap-1">
                      <EvidenceSwatch kind={verified ? 'verified' : 'inferred'} size={9} />
                      {verified ? 'Có chứng từ' : 'AI đoán'}
                    </span>
                    {e.cause || e.category ? <span>{e.cause || e.category}</span> : null}
                    <span>{e.source}</span>
                    {e.date && <span className="tabular-nums">{fmtDate(e.date)}</span>}
                    {onOpenFeedback && (
                      <Button variant="link" size="sm" onClick={() => onOpenFeedback(e.text)} className="ml-auto">
                        Mở
                      </Button>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {meta && meta.validFeedbacks != null && (
        <p className="mt-3 text-xs leading-relaxed text-ink-lo">
          {PROVIDER[meta.provider] || PROVIDER.deterministic}. Dựa trên {fmtInt(meta.validFeedbacks)} phản hồi được tính, cùng số liệu với Tổng quan.
        </p>
      )}
    </Stagger>
  );
};
