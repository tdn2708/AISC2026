import React from 'react';
import { ShoppingBag, CircleHelp, HandHelping, CircleCheck, MessageSquareWarning, Clock, PackageX, FileQuestion } from 'lucide-react';
import { fmtInt } from '../../lib/format';

/**
 * NGƯỜI MUA LÚC NÀY — từ bình luận ra "khách muốn gì"
 * ------------------------------------------------------------------
 * Ba câu, mỗi câu tối đa ba dòng, đếm thật trong 10 phút gần nhất và so với 10 phút trước
 * (services/live/trends.js). "Đang cần" ghép người chờ trả lời, khiếu nại với các việc trợ
 * lý phát hiện (hết hàng vẫn có người mua, sắp hết, danh mục thiếu thông tin).
 * Một khung, ba cột ngăn bằng đường kẻ (không lồng thẻ).
 */

const change = (now, before) => {
  if (!before) return 'mới trong 10 phút qua';
  if (now > before) return `tăng từ ${fmtInt(before)}`;
  if (now < before) return `giảm từ ${fmtInt(before)}`;
  return 'như 10 phút trước';
};

const Column = ({ icon: Icon, title, children }) => (
  <div className="min-w-0 py-4 first:pt-0 last:pb-0 lg:px-5 lg:py-0 lg:first:pl-0 lg:last:pr-0">
    <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink-hi">
      <Icon size={18} className="text-ink-mid" aria-hidden="true" />
      {title}
    </h3>
    {children}
  </div>
);

const Empty = ({ children }) => <p className="text-sm text-ink-lo">{children}</p>;

const Row = ({ label, count, unit, sub, quote }) => (
  <li className="min-w-0">
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-sm font-medium text-ink-hi" title={label}>{label}</span>
      <span className="shrink-0 text-sm tabular-nums text-ink-hi">{fmtInt(count)} <span className="text-xs text-ink-lo">{unit}</span></span>
    </div>
    {quote && <p className="mt-0.5 truncate text-sm text-ink-mid" title={quote}>“{quote}”</p>}
    {sub && <p className="mt-0.5 text-xs text-ink-lo">{sub}</p>}
  </li>
);

const NEED_TONE = { crit: 'text-crit', high: 'text-high', med: 'text-med' };

const NeedRow = ({ icon: Icon, tone, title, sub, onClick }) => {
  const body = (
    <>
      <Icon size={16} className={`mt-0.5 shrink-0 ${NEED_TONE[tone] || 'text-ink-mid'}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-hi">{title}</span>
        {sub && <span className="mt-0.5 block text-xs text-ink-lo">{sub}</span>}
      </span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-ctrl px-1.5 py-1 text-left hover:bg-raised">
          {body}
        </button>
      ) : <div className="flex items-start gap-2 py-1">{body}</div>}
    </li>
  );
};

const ACTION_NEED = {
  soldout_demand: { icon: PackageX, tone: 'crit' },
  low_stock: { icon: PackageX, tone: 'high' },
  missing_info: { icon: FileQuestion, tone: 'med' }
};

const BuyerNow = ({ stats, onOpen, onOpenCatalog }) => {
  const tr = stats?.trend || {};
  const wants = tr.wants || [];
  const asks = tr.asks || [];
  const needs = [];
  for (const n of tr.needs || []) {
    if (n.kind === 'complaint') {
      needs.push({ key: 'complaint', icon: MessageSquareWarning, tone: 'crit', title: `${fmtInt(n.count)} khiếu nại chưa xử lý`, sub: n.recent ? `${fmtInt(n.recent)} khiếu nại mới trong 10 phút` : null, onClick: () => onOpen?.('queue') });
    }
    if (n.kind === 'waiting') {
      needs.push({ key: 'waiting', icon: Clock, tone: n.tone, title: `${fmtInt(n.count)} khách chờ trả lời`, sub: n.waitMin ? `Người chờ lâu nhất ${fmtInt(n.waitMin)} phút` : null, onClick: () => onOpen?.('queue') });
    }
  }
  for (const a of stats?.actions?.active || []) {
    const m = ACTION_NEED[a.type];
    if (!m) continue;
    needs.push({ key: a.id, icon: m.icon, tone: m.tone, title: a.title, onClick: a.type === 'missing_info' ? onOpenCatalog : undefined });
  }

  return (
    <section aria-labelledby="buyers-title" className="glass-strong rounded-surf p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="buyers-title" className="text-heading font-bold tracking-tight text-ink-hi">Người mua lúc này</h2>
        <p className="text-xs text-ink-lo">10 phút gần nhất, so với 10 phút trước</p>
      </header>
      <div className="grid divide-y divide-line-soft lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <Column icon={ShoppingBag} title="Muốn mua">
          {wants.length ? (
            <ul className="flex list-none flex-col gap-3">
              {wants.map((w) => (
                <Row key={w.key} label={w.label} count={w.now} unit="lượt" sub={`${w.units > w.now ? `${fmtInt(w.units)} sản phẩm, ` : ''}${change(w.now, w.before)}`} />
              ))}
            </ul>
          ) : <Empty>Chưa ai chốt hay hỏi còn hàng trong 10 phút qua.</Empty>}
        </Column>
        <Column icon={CircleHelp} title="Muốn biết">
          {asks.length ? (
            <ul className="flex list-none flex-col gap-3">
              {asks.map((a) => <Row key={a.key} label={a.label} count={a.now} unit="câu" quote={a.sample} sub={change(a.now, a.before)} />)}
            </ul>
          ) : <Empty>Chưa có câu hỏi trong 10 phút qua.</Empty>}
        </Column>
        <Column icon={HandHelping} title="Đang cần">
          {needs.length ? (
            <ul className="flex list-none flex-col gap-1.5">
              {needs.slice(0, 4).map(({ key, ...n }) => <NeedRow key={key} {...n} />)}
            </ul>
          ) : (
            <p className="flex items-start gap-2 text-sm text-ink-mid"><CircleCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />Không có khách nào đang chờ.</p>
          )}
        </Column>
      </div>
    </section>
  );
};

export default BuyerNow;
