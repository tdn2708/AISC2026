import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, HeartHandshake, TriangleAlert, Users } from 'lucide-react';
import { GlassPanel, ChipGroup, EmptyState, SentimentFace, Pager, fieldClass, Skeleton } from './ui';
import { fmtInt, fmtDate } from '../lib/format';

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
    note: 'Đã để lại ít nhất một phản hồi tiêu cực, cần liên hệ trước tiên.',
    tone: 'bg-crit/12 text-crit'
  },
  {
    key: 'promoters',
    label: 'Khách trung thành',
    icon: HeartHandshake,
    note: 'Phản hồi chủ yếu tích cực, ứng viên cho chương trình giới thiệu.',
    tone: 'bg-accent-dim text-accent-hi'
  },
  {
    key: 'passives',
    label: 'Trung lập',
    icon: Users,
    note: 'Cảm xúc lẫn lộn hoặc trung tính, có thể đi theo cả hai hướng.',
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
  const [data, setData] = useState({ promoters: [], atRisk: [], passives: [], oneTime: 0, asOf: null });
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
      .catch(() => setError('Không tải được dữ liệu phân khúc. Tải lại trang, hoặc kiểm tra mạng.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => setPage(1), [segment, search, range]);

  const list = useMemo(() => {
    let l = data[segment] || [];
    if (search) l = l.filter((u) => u.author.toLowerCase().includes(search.toLowerCase()));
    if (range !== 'all') {
      // Tính từ mốc dữ liệu (kho thật: đánh giá mới nhất), không từ đồng hồ, như mọi trang khác
      const anchor = data.asOf ? new Date(data.asOf).getTime() : Date.now();
      const cutoff = anchor - Number(range) * 86400000;
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
            // Lớp ngoài mang lift (M4): nút giữ transition màu riêng, không bị lift ghi đè
            <div key={s.key} className="lift rounded-surf">
            <button
              type="button"
              onClick={() => setSegment(s.key)}
              aria-pressed={active}
              className={`h-full w-full rounded-surf border p-5 text-left transition-[background-color,border-color] duration-micro ease-out ${active ? 'border-accent bg-accent-dim' : 'border-line bg-surface hover:border-ink-lo'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`grid size-10 place-items-center rounded-ctrl ${s.tone}`}>
                  <s.icon size={18} aria-hidden="true" />
                </span>
                <span className="tabular-nums text-xs text-ink-lo">{total ? Math.round((n / total) * 100) : 0}%</span>
              </div>
              <p className="mt-4 text-sm font-medium text-ink-mid">{s.label}</p>
              <p className="tabular-nums text-metric font-semibold tracking-tight text-ink-hi">{loading ? '—' : fmtInt(n)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-lo">{s.note}</p>
            </button>
            </div>
          );
        })}
      </div>

      {!loading && data.oneTime > 0 && (
        <p className="-mt-2 mb-6 text-sm text-ink-mid">
          Còn <span className="font-semibold text-ink-hi tabular-nums">{fmtInt(data.oneTime)}</span> khách chỉ để lại một phản hồi không chê: chưa đủ để gọi là trung thành hay trung lập, nên không xếp vào nhóm nào.
        </p>
      )}

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft p-5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm khách hàng…"
              aria-label="Tìm khách hàng"
              className={`pr-3 pl-10 ${fieldClass()}`}
            />
          </div>
          <ChipGroup label="Hoạt động gần nhất" options={RANGES} value={range} onChange={setRange} />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton as="div" key={i} className="h-14 rounded-ctrl bg-raised" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState compact title="Không có khách hàng khớp" description="Thử đổi khoảng thời gian hoặc từ khoá." />
        ) : (
          <div className="paper mx-3 mb-3 scroll-hint-x overflow-x-auto">
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
                {rows.map((u, i) => {
                  const parts = [
                    ['Positive', u.positive, 'bg-pos'],
                    ['Neutral', u.neutral, 'bg-neu'],
                    ['Negative', u.negative, 'bg-neg']
                  ];
                  return (
                    <tr key={u.id || `${u.author}-${i}`}>
                      <td className="pl-6">
                        <span className="font-medium">{u.author}</span>
                      </td>
                      <td className="tabular-nums">{fmtInt(u.total)}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-2 w-32 gap-0.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${u.positive} tích cực, ${u.neutral} trung tính, ${u.negative} tiêu cực`}>
                            {parts.filter(([, n]) => n > 0).map(([k, n, cls]) => (
                              <span key={k} className={`h-full ${cls}`} style={{ flexGrow: n }} />
                            ))}
                          </div>
                          <span className="flex items-center gap-1.5">
                            {parts.filter(([, n]) => n > 0).map(([k, n]) => (
                              <span key={k} className="inline-flex items-center gap-1 tabular-nums text-xs text-ink-mid">
                                <SentimentFace sentiment={k} size={18} />{n}
                              </span>
                            ))}
                          </span>
                        </div>
                      </td>
                      <td className="pr-6 tabular-nums text-xs text-ink-mid">{fmtDate(u.latestFeedback)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {list.length > PAGE && (
          <Pager page={page} pages={pages} total={list.length} pageSize={PAGE} unit="khách" onChange={(p) => setPage(Math.min(pages, Math.max(1, p)))} />
        )}
      </GlassPanel>
    </>
  );
};

export default Segments;
