import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, ChevronLeft, ChevronRight, HeartHandshake, TriangleAlert, Users } from 'lucide-react';
import { GlassPanel, ChipGroup, EmptyState, SentimentFace } from './ui';
import { fmtInt, fmtDate, initials } from '../lib/format';

/**
 * PHÂN KHÚC KHÁCH HÀNG — nay là một tab của Phân tích nguyên nhân.
 * Ba nhóm do máy chủ phân theo lịch sử cảm xúc của từng khách:
 *   rủi ro (có phản hồi tiêu cực) · trung thành · trung lập.
 */

const SEGMENTS = [
  {
    key: 'atRisk',
    label: 'Có nguy cơ rời bỏ',
    icon: TriangleAlert,
    note: 'Đã để lại ít nhất một phản hồi tiêu cực — cần liên hệ trước tiên.',
    tone: 'bg-blush/45 text-[#8E2F45]'
  },
  {
    key: 'promoters',
    label: 'Khách trung thành',
    icon: HeartHandshake,
    note: 'Phản hồi chủ yếu tích cực — ứng viên cho chương trình giới thiệu.',
    tone: 'bg-sky/50 text-[#2F5E92]'
  },
  {
    key: 'passives',
    label: 'Trung lập',
    icon: Users,
    note: 'Cảm xúc lẫn lộn hoặc trung tính — có thể đi theo cả hai hướng.',
    tone: 'bg-raised text-ink-mid'
  }
];

const RANGES = [
  { value: 'all', label: 'Mọi lúc' },
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' }
];

const PAGE = 12;

const Segments = () => {
  const [data, setData] = useState({ promoters: [], atRisk: [], passives: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [segment, setSegment] = useState('atRisk');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    axios
      .get('/segments')
      .then((r) => setData(r.data))
      .catch(() => setError('Không tải được dữ liệu phân khúc.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => setPage(1), [segment, search, range]);

  const list = useMemo(() => {
    let l = data[segment] || [];
    if (search) l = l.filter((u) => u.author.toLowerCase().includes(search.toLowerCase()));
    if (range !== 'all') {
      const cutoff = Date.now() - Number(range) * 86400000;
      l = l.filter((u) => new Date(u.latestFeedback).getTime() >= cutoff);
    }
    return [...l].sort((a, b) => b.total - a.total);
  }, [data, segment, search, range]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const total = data.atRisk.length + data.promoters.length + data.passives.length;

  if (error) return <GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel>;

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {SEGMENTS.map((s) => {
          const n = data[s.key].length;
          const active = s.key === segment;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              aria-pressed={active}
              className={`glass rounded-[20px] p-5 text-left transition-[box-shadow,transform] hover:-translate-y-0.5 ${active ? 'shadow-[0_0_0_2px_var(--accent),var(--glass-shade)]' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`grid size-10 place-items-center rounded-2xl ${s.tone}`}>
                  <s.icon size={18} aria-hidden="true" />
                </span>
                <span className="font-mono text-xs text-ink-lo">{total ? Math.round((n / total) * 100) : 0}%</span>
              </div>
              <p className="mt-4 text-sm font-medium text-ink-mid">{s.label}</p>
              <p className="font-mono text-3xl font-semibold tracking-tight text-ink-hi">{loading ? '—' : fmtInt(n)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-lo">{s.note}</p>
            </button>
          );
        })}
      </div>

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft p-5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm khách hàng…"
              aria-label="Tìm khách hàng"
              className="h-10 w-full rounded-xl border border-line bg-surface/70 pr-3 pl-10 text-sm text-ink-hi outline-none placeholder:text-ink-lo focus:border-accent focus:ring-4 focus:ring-accent-dim"
            />
          </div>
          <ChipGroup label="Hoạt động gần nhất" options={RANGES} value={range} onChange={setRange} />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-raised" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState compact title="Không có khách hàng khớp" description="Thử đổi khoảng thời gian hoặc từ khoá." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th className="pl-6">Khách hàng</th>
                  <th>Số phản hồi</th>
                  <th>Phân bố cảm xúc</th>
                  <th className="pr-6">Hoạt động gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const parts = [
                    ['Positive', u.positive, 'bg-pos'],
                    ['Neutral', u.neutral, 'bg-neu'],
                    ['Negative', u.negative, 'bg-neg']
                  ];
                  return (
                    <tr key={u.author}>
                      <td className="pl-6">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-sky/70 to-blush/70 text-xs font-semibold text-ink-hi">
                            {initials(u.author)}
                          </span>
                          <span className="font-medium">{u.author}</span>
                        </div>
                      </td>
                      <td className="font-mono">{fmtInt(u.total)}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-2 w-32 gap-0.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${u.positive} tích cực, ${u.neutral} trung tính, ${u.negative} tiêu cực`}>
                            {parts.filter(([, n]) => n > 0).map(([k, n, cls]) => (
                              <span key={k} className={`h-full ${cls}`} style={{ flexGrow: n }} />
                            ))}
                          </div>
                          <span className="flex items-center gap-1.5">
                            {parts.filter(([, n]) => n > 0).map(([k, n]) => (
                              <span key={k} className="inline-flex items-center gap-1 font-mono text-xs text-ink-mid">
                                <SentimentFace sentiment={k} size={18} />{n}
                              </span>
                            ))}
                          </span>
                        </div>
                      </td>
                      <td className="pr-6 font-mono text-xs text-ink-mid">{fmtDate(u.latestFeedback)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {list.length > PAGE && (
          <div className="fb-pager">
            <span className="fb-pager-info">{fmtInt((page - 1) * PAGE + 1)}–{fmtInt(Math.min(page * PAGE, list.length))} / {fmtInt(list.length)} khách</span>
            <div className="fb-pager-btns">
              <button className="fb-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Trang trước"><ChevronLeft size={14} /></button>
              <span className="px-2 font-mono text-xs text-ink-mid">{page} / {pages}</span>
              <button className="fb-page-btn" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} aria-label="Trang sau"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </GlassPanel>
    </>
  );
};

export default Segments;
