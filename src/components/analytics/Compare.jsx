import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { GlassPanel, PanelHeader, Select, EmptyState, EvidenceBar, Skeleton } from '../ui';
import { fmtInt, fmtPct } from '../../lib/format';
import { BarGrow } from '../motion';

/**
 * SO SÁNH HAI SẢN PHẨM
 * ------------------------------------------------------------------
 * Đặt sản phẩm của mình cạnh sản phẩm đối thủ (thu thập bằng liên kết ở
 * trang Nguồn dữ liệu), hoặc hai sản phẩm bất kỳ. Khác biệt về tỉ lệ phản
 * hồi tiêu cực được kiểm định hai tỉ lệ: không đủ dữ liệu thì nói thẳng là
 * chưa đủ chắc, thay vì để hai con số tự nói.
 *
 * Màu: A = màu nhấn, B = mực — hai thực thể, hai màu cố định trên mọi biểu đồ.
 */

const A_COLOR = 'var(--accent)';
const B_COLOR = 'var(--text-mid)';

const pct = (v) => fmtPct(v, v != null && v > 0 && v < 0.01 ? 2 : 1);

const Side = ({ p, color, tag }) => (
  <GlassPanel tone="strong" className="p-5">
    <div className="flex items-start gap-2.5">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-xs" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-ink-lo">Sản phẩm {tag}</p>
        <h3 className="text-sm leading-snug font-semibold text-ink-hi">{p.name}</h3>
      </div>
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-3">
      <div>
        <dt className="text-xs text-ink-lo">Phản hồi</dt>
        <dd className="mt-0.5 tabular-nums text-heading font-semibold text-ink-hi">{fmtInt(p.n)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-lo">Tiêu cực</dt>
        <dd className="mt-0.5 tabular-nums text-heading font-semibold text-ink-hi">{pct(p.negativeShare.p)}</dd>
        <dd className="text-xs text-ink-lo">từ {pct(p.negativeShare.low)} đến {pct(p.negativeShare.high)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-lo">Điểm sao</dt>
        <dd className="mt-0.5 tabular-nums text-heading font-semibold text-ink-hi">{p.avgRating != null ? p.avgRating.toFixed(1).replace('.', ',') : '—'}</dd>
      </div>
    </dl>
    <EvidenceBar mix={p.evidence} className="mt-4" />
    {p.topCauses.length > 0 && (
      <div className="mt-4 border-t border-line-soft pt-3">
        <p className="text-xs font-semibold text-ink-mid">Bị chê nhiều nhất</p>
        <ul className="paper mt-1.5 flex list-none flex-col gap-1 px-3 py-2 text-sm">
          {p.topCauses.map((c) => (
            <li key={`${c.category}-${c.label}`} className="flex justify-between gap-3">
              <span className="truncate text-ink-hi">{c.label}</span>
              <span className="tabular-nums text-ink-mid">{fmtInt(c.count)}</span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </GlassPanel>
);

const Compare = () => {
  const [products, setProducts] = useState(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get('/compare/products')
      .then((r) => {
        const list = r.data?.products || [];
        setProducts(list);
        // Mặc định: hai sản phẩm nhiều phản hồi nhất CÙNG nhóm hàng, nếu có
        const first = list[0];
        const peer = first && list.find((p) => p.name !== first.name && p.category && p.category === first.category);
        setA(first?.name || '');
        setB((peer || list[1])?.name || '');
      })
      .catch(() => setError('Không tải được danh sách sản phẩm. Tải lại trang, hoặc kiểm tra mạng.'));
  }, []);

  useEffect(() => {
    if (!a || !b || a === b) return;
    setLoading(true);
    axios
      .get(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch(() => setError('Không so sánh được hai sản phẩm này.'))
      .finally(() => setLoading(false));
  }, [a, b]);

  if (error && !products) return <GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel>;
  if (!products) return <Skeleton as="div" className="h-[420px] rounded-surf bg-raised" />;
  if (products.length < 2) {
    return (
      <GlassPanel>
        <EmptyState title="Chưa đủ sản phẩm để so sánh" description="Cần ít nhất hai sản phẩm, mỗi sản phẩm từ 20 phản hồi. Thu thập thêm ở trang Nguồn dữ liệu, kể cả sản phẩm của đối thủ." />
      </GlassPanel>
    );
  }

  const options = products.map((p) => ({ value: p.name, label: `${p.name} (${fmtInt(p.count)})` }));
  const d = data?.difference;
  const maxShare = data ? Math.max(0.0001, ...data.categories.flatMap((c) => [c.a, c.b])) : 1;

  let verdict = null;
  if (data && d) {
    const gap = Math.abs(d.delta * 100).toFixed(1).replace('.', ',');
    const higher = d.delta > 0 ? 'A' : 'B';
    verdict = !d.valid
      ? `Chưa đủ dữ liệu để kết luận (${d.reason ? d.reason.toLowerCase() : 'mẫu quá nhỏ'}).`
      : d.significant
        ? `Sản phẩm ${higher} bị chê nhiều hơn rõ rệt: chênh ${gap} điểm phần trăm, đủ lớn để không phải do ngẫu nhiên.`
        : `Chênh ${gap} điểm phần trăm, nhưng chưa đủ chắc để nói sản phẩm nào bị chê nhiều hơn.`;
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel tone="strong" className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Sản phẩm A (ví dụ: của bạn)" value={a} onChange={(e) => setA(e.target.value)} options={options} />
          <Select label="Sản phẩm B (ví dụ: của đối thủ)" value={b} onChange={(e) => setB(e.target.value)} options={options} />
        </div>
        {a === b && <p className="mt-3 text-sm text-high">Chọn hai sản phẩm khác nhau.</p>}
        {verdict && a !== b && <p className="mt-4 rounded-ctrl bg-accent-dim px-4 py-3 text-sm leading-relaxed text-ink-hi">{verdict}</p>}
      </GlassPanel>

      {data && a !== b && (
        <div className={`flex flex-col gap-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <Side p={data.a} color={A_COLOR} tag="A" />
            <Side p={data.b} color={B_COLOR} tag="B" />
          </div>

          <GlassPanel tone="strong" className="reveal p-5">
            <PanelHeader title="Bị chê về điều gì" subtitle="Tỉ lệ phản hồi chê từng nhóm vấn đề, trên tổng phản hồi của mỗi sản phẩm" />
            {data.categories.length === 0 ? (
              <p className="text-sm text-ink-lo">Hai sản phẩm chưa có lời chê nào được xếp nhóm.</p>
            ) : (
              <ul className="flex list-none flex-col gap-4">
                {data.categories.map((c) => (
                  <li key={c.key}>
                    <p className="text-sm text-ink-hi">{c.label}</p>
                    {[['A', c.a, A_COLOR], ['B', c.b, B_COLOR]].map(([tag, v, color]) => (
                      <div key={tag} className="mt-1.5 flex items-center gap-3">
                        <span className="w-4 text-xs text-ink-lo">{tag}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                          <BarGrow grow={false} value={maxShare ? v / maxShare : 0} className="rounded-full" style={{ background: color }} />
                        </span>
                        <span className="w-14 text-right tabular-nums text-xs text-ink-mid">{pct(v)}</span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
};

export default Compare;
