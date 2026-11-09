import React, { useState } from 'react';
import axios from 'axios';
import { Phone, Download } from 'lucide-react';
import { GlassPanel, PanelHeader, Segmented, EmptyState, Button } from '../ui';
import { fmtInt } from '../../lib/format';
import { clock, variantText } from './shared';
import { liveUrl } from '../../hooks/useLiveSession';

/**
 * KHÁCH CHỐT ĐƠN TRONG PHIÊN
 * Danh sách để shop gọi lại, nhắn tin, lên đơn sau live. Đánh dấu "đã lên
 * đơn" hay "hủy" ngay tại đây; tải CSV để nhập vào phần mềm bán hàng.
 */

const STATUS_OPTS = [
  { value: 'new', label: 'Mới' },
  { value: 'confirmed', label: 'Đã lên đơn' },
  { value: 'cancelled', label: 'Hủy' }
];

const Orders = ({ stats, sessionId, onChanged }) => {
  const [filter, setFilter] = useState('new');
  const all = stats?.orders || [];
  const items = filter === 'all' ? all : all.filter((o) => o.status === filter);
  const count = (s) => all.filter((o) => o.status === s).length;

  const setStatus = async (o, status) => {
    await axios.post(`/live/sessions/${sessionId}/orders/${o.id}`, { status });
    onChanged?.();
  };

  return (
    <GlassPanel tone="strong" className="p-4 sm:p-5">
      <PanelHeader
        title="Khách chốt đơn"
        subtitle={`${fmtInt(all.length)} lượt chốt, ${fmtInt(stats?.totals?.orderQuantity || 0)} sản phẩm (trừ đơn hủy)`}
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Lọc đơn"
              value={filter}
              onChange={setFilter}
              options={[{ value: 'new', label: `Mới ${count('new')}` }, { value: 'confirmed', label: `Đã lên ${count('confirmed')}` }, { value: 'all', label: 'Tất cả' }]}
            />
            <Button size="sm" variant="secondary" icon={Download} onClick={() => window.open(liveUrl(`/sessions/${sessionId}/export`, { kind: 'orders', format: 'csv' }), '_blank')}>CSV</Button>
          </div>
        )}
      />
      {items.length ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs text-ink-lo">
                <th className="px-1 py-2 font-medium">Giờ</th>
                <th className="px-1 py-2 font-medium">Khách</th>
                <th className="px-1 py-2 font-medium">Sản phẩm</th>
                <th className="px-1 py-2 font-medium">Biến thể</th>
                <th className="px-1 py-2 text-right font-medium">Số lượng</th>
                <th className="px-1 py-2 font-medium">Bình luận</th>
                <th className="px-1 py-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 100).map((o) => (
                <tr key={o.id} className={`border-b border-line-soft last:border-0 ${o.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <td className="px-1 py-2 font-mono text-xs text-ink-lo">{clock(o.ts)}</td>
                  <td className="px-1 py-2 text-ink-hi">
                    <span className="block max-w-[10rem] truncate">@{o.handle || '—'}</span>
                    {o.hasPhone && <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-ink-lo"><Phone size={10} aria-hidden="true" />Để lại SĐT</span>}
                  </td>
                  <td className="px-1 py-2 text-ink-hi"><span className="block max-w-[11rem] truncate">{o.productName || <span className="text-ink-lo">Chưa rõ</span>}</span></td>
                  <td className="px-1 py-2 text-ink-mid">{variantText(o.variant) || '—'}</td>
                  <td className="px-1 py-2 text-right font-mono text-ink-hi">{o.quantity}</td>
                  <td className="px-1 py-2 text-ink-mid"><span className="block max-w-[14rem] truncate" title={o.text}>{o.text}</span></td>
                  <td className="px-1 py-2">
                    <select
                      aria-label="Trạng thái đơn"
                      value={o.status}
                      onChange={(e) => setStatus(o, e.target.value)}
                      className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink-hi"
                    >
                      {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact title={filter === 'new' ? 'Không có đơn mới' : 'Chưa có đơn'} />
      )}
    </GlassPanel>
  );
};

export default Orders;
