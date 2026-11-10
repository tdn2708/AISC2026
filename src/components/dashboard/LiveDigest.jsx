import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Radio, ArrowRight } from 'lucide-react';
import { Badge } from '../ui';
import { fmtInt, fmtPct, fmtRelative } from '../../lib/format';

/**
 * LIVESTREAM TRÊN TRANG TỔNG QUAN
 * Đang có phiên live: số liệu trực tiếp và việc gấp nhất trợ lý đang gợi ý.
 * Không có: kết quả phiên gần nhất và ba việc cần làm cho phiên sau.
 * Ẩn hẳn khi kho chưa có phiên live nào.
 */

const money = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu` : `${fmtInt(Math.round(n / 1000))} nghìn`);
const SEV_TONE = { critical: 'crit', high: 'high', medium: 'accent' };
const PRIO_TONE = { high: 'crit', medium: 'high', low: 'neutral' };

const Mini = ({ label, value, tone }) => (
  <div className="min-w-0">
    <p className="truncate text-xs text-ink-lo">{label}</p>
    <p className={`font-mono text-base font-semibold ${tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : 'text-ink-hi'}`}>{value}</p>
  </div>
);

const LiveDigest = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => axios.get('/live/overview').then((r) => alive && setData(r.data)).catch(() => {});
    load();
    // Phiên đang live thì cập nhật nửa phút một lần; trang Livestream mới là nơi xem thời gian thực
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!data || (!data.live.length && !data.latest)) return null;
  const now = data.live[0];
  const last = data.latest;

  return (
    <div className="glass-strong mt-6 rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-heading font-semibold text-ink-hi">
          <Radio size={16} className="text-accent" aria-hidden="true" />Livestream
        </h2>
        {now ? <Badge tone="crit" className="gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-crit" aria-hidden="true" />Đang live</Badge> : null}
      </div>

      {now ? (
        <>
          <p className="truncate text-sm font-medium text-ink-hi">{now.title}</p>
          <div className="mt-2.5 grid grid-cols-3 gap-3">
            <Mini label="Người xem" value={now.viewers != null ? fmtInt(now.viewers) : '—'} />
            <Mini label="Lượt chốt" value={fmtInt(now.orders)} tone="ok" />
            <Mini label="Câu hỏi chờ" value={fmtInt(now.queueOpen)} tone={now.queueOpen > 5 ? 'crit' : undefined} />
          </div>
          {now.actions.length > 0 && (
            <ul className="mt-3 flex list-none flex-col gap-1.5">
              {now.actions.map((a) => (
                <li key={a.title} className="flex items-start gap-2 text-sm">
                  <Badge tone={SEV_TONE[a.severity] || 'accent'} className="mt-0.5 shrink-0">{a.severity === 'critical' ? 'Khẩn' : 'Nên làm'}</Badge>
                  <span className="text-ink-hi">{a.title}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/live?session=${now.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-hi hover:underline">
            Mở bảng điều khiển phiên<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </>
      ) : (
        <>
          <p className="truncate text-sm font-medium text-ink-hi">{last.title}</p>
          <p className="text-xs text-ink-lo">Kết thúc {fmtRelative(last.endedAt)}{last.simulated ? ', dữ liệu mô phỏng' : ''}</p>
          <div className="mt-2.5 grid grid-cols-3 gap-3">
            <Mini label="Doanh thu ước tính" value={money(last.revenue)} tone="ok" />
            <Mini label="Lỡ vì hết hàng" value={money(last.lostRevenue)} tone={last.lostRevenue ? 'crit' : undefined} />
            <Mini label="Khách được trả lời" value={last.answeredShare != null ? fmtPct(last.answeredShare, 0) : '—'} />
          </div>
          {last.todo.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-ink-mid">Việc cho phiên sau</p>
              <ol className="mt-1 flex list-none flex-col gap-1.5">
                {last.todo.map((t) => (
                  <li key={t.title} className="flex items-start gap-2 text-sm">
                    <Badge tone={PRIO_TONE[t.priority]} className="mt-0.5 shrink-0">{t.priority === 'high' ? 'Ưu tiên' : t.priority === 'medium' ? 'Nên làm' : 'Gợi ý'}</Badge>
                    <span className="text-ink-hi">{t.title}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {last.complaintsUnpushed > 0 && (
            <p className="mt-2 text-xs text-high">{last.complaintsUnpushed} khiếu nại từ phiên này chưa đưa vào hệ thống phản hồi.</p>
          )}
          <Link to={`/live?session=${last.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-hi hover:underline">
            Xem báo cáo sau live<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </>
      )}
    </div>
  );
};

export default LiveDigest;
