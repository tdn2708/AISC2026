import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Check, Sparkles, X, TriangleAlert, Undo2 } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, Badge, EmptyState, Segmented, fieldClass } from '../ui';
import { fmtInt, fmtRelative } from '../../lib/format';
import { clock } from './shared';

/**
 * HÀNG ĐỢI CẦN TRẢ LỜI
 * ------------------------------------------------------------------
 * Mỗi thẻ là MỘT câu hỏi mà nhiều người cùng hỏi (cùng chủ đề, cùng sản phẩm),
 * hoặc một khiếu nại. Người đứng live đọc gợi ý trên sóng hoặc dán vào ô bình
 * luận, rồi bấm "Đã trả lời": cả nhóm được đánh dấu, thẻ rời hàng đợi. Có
 * thêm ba người hỏi lại thì thẻ tự mở lại.
 *
 * Gợi ý thiếu dữ kiện (danh mục chưa khai báo) có cảnh báo vàng: đừng đọc
 * nguyên văn khi chưa kiểm tra.
 */

const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const QueueCard = ({ g, sessionId, onResolved }) => {
  const [text, setText] = useState(g.suggestion?.text || '');
  const [edited, setEdited] = useState(false);
  const [provider, setProvider] = useState('template');
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const complaint = g.intent === 'complaint';

  // Gợi ý được tính lại khi danh mục đổi; chỉ ghi đè khi người dùng chưa sửa
  useEffect(() => {
    if (!edited) setText(g.suggestion?.text || '');
  }, [g.suggestion?.text, edited]);

  const rewrite = async () => {
    setBusy('rewrite');
    try {
      const r = await axios.post(`/live/sessions/${sessionId}/groups/rewrite`, { key: g.key });
      setText(r.data.text);
      setProvider(r.data.provider);
      setEdited(true);
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (status) => {
    setBusy(status);
    try {
      await axios.post(`/live/sessions/${sessionId}/groups/resolve`, { key: g.key, status, text: status === 'answered' ? text : undefined, provider: edited ? (provider === 'template' ? 'human' : provider) : 'template' });
      onResolved?.(g.key, status);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className={`rounded-ctrl p-3.5 ${complaint ? 'bg-crit/8' : 'bg-raised'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={complaint ? 'crit' : 'accent'}>{g.topicLabel}</Badge>
        {g.productName && <span className="truncate text-xs font-medium text-ink-mid">{g.productName}{g.size ? `, size ${g.size}` : ''}</span>}
        <span className="ml-auto font-mono text-xs text-ink-lo" title={`Lần cuối ${clock(g.lastAt)}`}>{fmtRelative(g.lastAt)}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        {g.count > 1 && (
          <span className="shrink-0 font-mono text-lg font-semibold text-ink-hi">{fmtInt(g.count)}<span className="ml-1 font-sans text-xs font-normal text-ink-lo">người hỏi</span></span>
        )}
        <p className="min-w-0 truncate text-sm text-ink-hi" title={g.samples?.[0]?.text}>
          {g.samples?.[0]?.handle && <span className="text-ink-lo">@{g.samples[0].handle}: </span>}
          “{g.samples?.[0]?.text}”
        </p>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Câu trả lời</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => { setText(e.target.value); setEdited(true); }}
          className={`resize-y px-3 py-2 leading-relaxed ${fieldClass({ multiline: true })}`}
        />
      </label>
      {g.suggestion && !g.suggestion.grounded && !edited && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-high">
          <TriangleAlert size={13} aria-hidden="true" />
          Danh mục chưa có thông tin này. Kiểm tra trước khi trả lời.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="sm" icon={Check} loading={busy === 'answered'} onClick={() => resolve('answered')}>Đã trả lời</Button>
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={async () => { if (await copy(text)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
        >
          {copied ? 'Đã chép' : 'Chép'}
        </Button>
        {!complaint && (
          <Button size="sm" variant="ghost" icon={Sparkles} loading={busy === 'rewrite'} onClick={rewrite}>Viết tự nhiên hơn</Button>
        )}
        <Button size="sm" variant="ghost" icon={X} loading={busy === 'dismissed'} onClick={() => resolve('dismissed')} className="ml-auto">Bỏ qua</Button>
      </div>
    </li>
  );
};

const AnsweredRow = ({ g, sessionId, onResolved }) => (
  <li className="flex items-start gap-3 border-b border-line-soft py-2.5 last:border-0">
    <div className="min-w-0 flex-1">
      <p className="text-xs text-ink-lo">
        {g.topicLabel}{g.productName ? `, ${g.productName}` : ''}, {fmtInt(g.count)} người hỏi
      </p>
      <p className="mt-0.5 text-sm text-ink-hi">{g.status === 'dismissed' ? <span className="text-ink-lo">Đã bỏ qua</span> : g.answer?.text || 'Đã trả lời trên sóng'}</p>
    </div>
    <Button
      size="sm"
      variant="ghost"
      icon={Undo2}
      onClick={async () => { await axios.post(`/live/sessions/${sessionId}/groups/resolve`, { key: g.key, status: 'open' }); onResolved?.(g.key, 'open'); }}
    >
      Mở lại
    </Button>
  </li>
);

const Queue = ({ stats, sessionId, onChanged }) => {
  const [view, setView] = useState('open');
  const open = stats?.queue || [];
  const done = stats?.answered || [];

  return (
    <GlassPanel tone="strong" className="flex min-h-0 flex-col p-4 sm:p-5">
      <PanelHeader
        title="Cần trả lời"
        subtitle={view === 'open' ? 'Câu hỏi giống nhau đã được gom. Khiếu nại luôn ở trên cùng.' : 'Các nhóm đã xử lý trong phiên.'}
        right={(
          <Segmented
            label="Hàng đợi"
            value={view}
            onChange={setView}
            options={[{ value: 'open', label: `Đang chờ ${stats?.queueOpen ?? 0}` }, { value: 'done', label: `Đã xử lý ${done.length}` }]}
          />
        )}
      />
      {view === 'open' ? (
        open.length ? (
          <ul className="-mr-2 flex max-h-[70vh] list-none flex-col gap-2.5 overflow-y-auto pr-2">
            {open.map((g) => <QueueCard key={g.key} g={g} sessionId={sessionId} onResolved={onChanged} />)}
          </ul>
        ) : (
          <EmptyState compact title="Không còn câu hỏi chờ" description="Câu hỏi và khiếu nại mới sẽ hiện ở đây ngay khi khách bình luận." />
        )
      ) : done.length ? (
        <ul className="max-h-[70vh] list-none overflow-y-auto">
          {done.map((g) => <AnsweredRow key={g.key} g={g} sessionId={sessionId} onResolved={onChanged} />)}
        </ul>
      ) : (
        <EmptyState compact title="Chưa xử lý nhóm nào" />
      )}
    </GlassPanel>
  );
};

export default Queue;
