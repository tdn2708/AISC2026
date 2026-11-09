import React, { useState } from 'react';
import axios from 'axios';
import { Copy, Check, X, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button, Badge } from '../ui';
import { fmtRelative } from '../../lib/format';

/**
 * VIỆC NÊN LÀM NGAY — trợ lý hành động trong phiên live
 * ------------------------------------------------------------------
 * Mỗi thẻ là một việc cụ thể rút ra từ bình luận (services/live/coach.js):
 * lý do bằng số liệu, câu nói mẫu để đọc trên sóng, và một nút làm luôn.
 * Việc đã làm được đo trước/sau 3 phút để người bán biết việc nào có tác dụng.
 */

const SEV = {
  critical: { label: 'Khẩn', tone: 'crit', bar: 'bg-crit' },
  high: { label: 'Nên làm ngay', tone: 'high', bar: 'bg-high' },
  medium: { label: 'Cơ hội', tone: 'accent', bar: 'bg-accent' }
};

const PRIMARY = {
  question_burst: 'Đã nói trên sóng',
  hot_other_product: 'Chuyển sản phẩm',
  engagement_drop: 'Đã làm',
  missing_info: 'Bổ sung danh mục',
  soldout_demand: 'Đã báo hết hàng',
  low_stock: 'Đã nói trên sóng',
  complaint_spike: 'Đã xin lỗi trên sóng',
  ask_not_buy: 'Đã nhắc ưu đãi',
  backlog: 'Đã thêm người'
};

const num = (x) => (x == null ? '—' : x.toFixed(1).replace('.', ','));

export const EffectLine = ({ effect }) => {
  if (!effect) return null;
  if (!effect.ready) return <span className="text-ink-lo">Đang đo hiệu quả, cần đủ 3 phút sau khi làm</span>;
  const Icon = effect.better ? TrendingUp : effect.after === effect.before ? Minus : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${effect.better ? 'text-ok' : 'text-ink-mid'}`}>
      <Icon size={13} aria-hidden="true" />
      {effect.metric}: <span className="font-mono">{num(effect.before)} → {num(effect.after)}</span>
    </span>
  );
};

const ActionCard = ({ a, sessionId, onOpenCatalog }) => {
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const sev = SEV[a.severity] || SEV.medium;

  const resolve = async (status) => {
    setBusy(status);
    try {
      if (status === 'done' && a.do?.kind === 'open_catalog') onOpenCatalog?.();
      await axios.post(`/live/sessions/${sessionId}/actions`, { id: a.id, status });
    } catch {
      /* việc đã hết hiệu lực: lần cập nhật sau sẽ tự bỏ thẻ */
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-line-soft bg-surface p-3.5 pl-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${sev.bar}`} aria-hidden="true" />
      <div className="flex items-center gap-2">
        <Badge tone={sev.tone}>{sev.label}</Badge>
      </div>
      <p className="mt-1.5 text-sm leading-snug font-semibold text-ink-hi">{a.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-mid">{a.why}</p>
      {a.script && (
        <div className="mt-2 rounded-md bg-raised px-3 py-2">
          <p className="text-xs font-medium text-ink-lo">Câu nói mẫu</p>
          <p className="mt-0.5 text-sm leading-snug text-ink-hi">“{a.script}”</p>
          {a.grounded === false && <p className="mt-1 text-xs text-high">Danh mục chưa đủ thông tin, kiểm tra trước khi đọc.</p>}
        </div>
      )}
      {a.steps?.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-mid">
          {a.steps.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        <Button size="sm" icon={Zap} loading={busy === 'done'} onClick={() => resolve('done')}>{PRIMARY[a.type] || 'Đã làm'}</Button>
        {a.script && (
          <Button
            size="sm"
            variant="secondary"
            icon={copied ? Check : Copy}
            onClick={async () => { try { await navigator.clipboard.writeText(a.script); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* bị chặn */ } }}
          >
            {copied ? 'Đã chép' : 'Chép'}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={X} loading={busy === 'dismissed'} onClick={() => resolve('dismissed')} className="ml-auto">Bỏ qua</Button>
      </div>
    </li>
  );
};

const ActionCoach = ({ stats, sessionId, live, onOpenCatalog }) => {
  const [showAll, setShowAll] = useState(false);
  const active = stats?.actions?.active || [];
  const history = (stats?.actions?.history || []).filter((h) => h.status === 'done').slice(0, 4);
  if (!live && !history.length) return null;
  const shown = showAll ? active : active.slice(0, 3);

  return (
    <section aria-labelledby="coach-title" className="rounded-xl border border-line-soft bg-accent-dim/40 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="coach-title" className="text-[1.04rem] font-semibold text-ink-hi">Việc nên làm ngay</h2>
          <p className="text-xs text-ink-mid">Rút ra từ bình luận trong vài phút gần nhất. Câu nói mẫu chỉ dùng thông tin shop đã khai báo.</p>
        </div>
        {active.length > 3 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-accent-hi hover:underline">
            {showAll ? 'Thu gọn' : `Xem cả ${active.length} việc`}
          </button>
        )}
      </div>

      {live && (shown.length ? (
        <ul className="grid list-none gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => <ActionCard key={a.id} a={a} sessionId={sessionId} onOpenCatalog={onOpenCatalog} />)}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-mid">Phiên đang ổn. Trợ lý sẽ báo khi có khách hỏi dồn, hàng sắp hết, khiếu nại tăng hay bình luận chững lại.</p>
      ))}

      {history.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="mb-1.5 text-xs font-semibold text-ink-mid">Hiệu quả các việc đã làm (so 3 phút trước và sau, chưa loại trừ yếu tố khác)</p>
          <ul className="flex list-none flex-col gap-1">
            {history.map((h) => (
              <li key={`${h.id}-${h.at}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                <span className="min-w-0 truncate text-ink-hi">{h.title}</span>
                <span className="text-ink-lo">{fmtRelative(h.at)}</span>
                <EffectLine effect={h.effect} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ActionCoach;
