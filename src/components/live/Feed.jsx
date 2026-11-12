import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Phone, Pause } from 'lucide-react';
import { GlassPanel, PanelHeader, Segmented, EmptyState } from '../ui';
import { INTENTS, INTENT_MAP, clock, variantText } from './shared';

/**
 * DÒNG BÌNH LUẬN TRỰC TIẾP
 * Mới nhất ở trên. Di chuột vào danh sách thì dòng ngừng chảy để đọc kịp;
 * bình luận đến trong lúc đó được giữ lại, rời chuột ra là hiện tiếp.
 *
 * Bấm vào nhãn ý định để sửa nếu máy phân loại sai. Nhãn sửa tay được đánh
 * dấu "người sửa" và đi vào dữ liệu xuất cho huấn luyện.
 */

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'question', label: 'Hỏi' },
  { value: 'order', label: 'Chốt' },
  { value: 'complaint', label: 'Khiếu nại' }
];

const TONE_CLS = {
  crit: 'bg-crit/12 text-crit',
  accent: 'bg-accent-dim text-accent-hi',
  ok: 'bg-ok/12 text-ok',
  sky: 'bg-sky/45 text-ink-hi',
  neutral: 'bg-raised text-ink-mid'
};

const IntentSelect = ({ c, sessionId, onPatched }) => {
  const [busy, setBusy] = useState(false);
  const m = INTENT_MAP[c.intent] || INTENT_MAP.chatter;
  const change = async (e) => {
    const intent = e.target.value;
    if (intent === c.intent) return;
    setBusy(true);
    try {
      const r = await axios.post(`/live/sessions/${sessionId}/comments/${c.id}/label`, { intent, topic: intent === 'question' ? c.topic || 'other' : null });
      onPatched?.(r.data.comment);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="relative inline-flex">
      <span className="sr-only">Sửa ý định</span>
      <select
        value={c.intent}
        onChange={change}
        disabled={busy}
        title="Bấm để sửa nếu phân loại sai"
        className={`cursor-pointer appearance-none rounded-ctrl border-0 px-1.5 py-0.5 font-sans text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${TONE_CLS[m.tone]} ${c.labelledBy === 'human' ? 'ring-1 ring-ink-lo/40' : ''}`}
      >
        {INTENTS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
      </select>
    </label>
  );
};

const Row = ({ c, sessionId, onPatched }) => (
  <li className="flex gap-2.5 border-b border-line-soft py-2 last:border-0">
    <span className="w-[3.6rem] shrink-0 pt-0.5 tabular-nums text-xs text-ink-lo">{clock(c.ts)}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm leading-snug break-words text-ink-hi">
        {c.author?.handle && <span className="mr-1 text-ink-lo">@{c.author.handle}</span>}
        {c.text}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-lo">
        <IntentSelect c={c} sessionId={sessionId} onPatched={onPatched} />
        {c.topicLabel && <span>{c.topicLabel}</span>}
        {c.productName && <span className="truncate">{c.productName}{c.productInferred ? ' (đang giới thiệu)' : ''}</span>}
        {c.intent === 'order' && (variantText(c.variant) || c.quantity > 1) && (
          <span className="font-medium text-ok">{[variantText(c.variant), c.quantity > 1 ? `${c.quantity} cái` : ''].filter(Boolean).join(', ')}</span>
        )}
        {c.hasPhone && <span className="inline-flex items-center gap-0.5"><Phone size={11} aria-hidden="true" />Có SĐT (đã che)</span>}
      </div>
    </div>
  </li>
);

const Feed = ({ feed, sessionId, onPatched, live }) => {
  const [filter, setFilter] = useState('all');
  const [frozen, setFrozen] = useState(null);

  const source = frozen || feed;
  const items = useMemo(() => (filter === 'all' ? source : source.filter((c) => c.intent === filter)), [source, filter]);
  const waiting = frozen ? feed.length - frozen.length : 0;

  return (
    <GlassPanel tone="strong" className="flex min-h-0 flex-col p-4 sm:p-5">
      <PanelHeader title="Bình luận trực tiếp" className="mb-3" />
      <div className="mb-3"><Segmented label="Lọc bình luận" value={filter} onChange={setFilter} options={FILTERS} /></div>
      {frozen && live && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-lo">
          <Pause size={12} aria-hidden="true" />
          Đang tạm dừng để đọc{waiting > 0 ? `, ${waiting} bình luận mới đang chờ` : ''}
        </p>
      )}
      {items.length ? (
        <ul
          className="-mr-2 max-h-[70vh] list-none overflow-y-auto pr-2"
          onMouseEnter={() => live && setFrozen(feed)}
          onMouseLeave={() => setFrozen(null)}
          aria-live="off"
        >
          {items.map((c) => <Row key={c.id} c={c} sessionId={sessionId} onPatched={onPatched} />)}
        </ul>
      ) : (
        <EmptyState compact title={live ? 'Đang chờ bình luận' : 'Không có bình luận'} description={live ? 'Bình luận đầu tiên sẽ hiện ở đây.' : undefined} />
      )}
    </GlassPanel>
  );
};

export default Feed;
