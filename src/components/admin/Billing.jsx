import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button, ChipGroup, EmptyState, GlassPanel, PanelHeader, SkeletonBlock } from '../ui';
import { PageEnter } from '../motion';
import { adminError } from '../../lib/admin';
import { fmtDateTime } from '../../lib/format';

/**
 * THANH TOÁN (/admin/billing, backend/routes/billing.js). Đơn mua gói chờ chuyển khoản:
 * khi chưa nối webhook ngân hàng (SePay/Casso), quản trị viên đối chiếu sao kê rồi bấm
 * xác nhận; gói của shop bật ngay và nhật ký ghi lại người xác nhận.
 */
const STATUS = [
  { value: 'pending', label: 'Chờ chuyển khoản' },
  { value: 'paid', label: 'Đã nhận tiền' },
  { value: 'cancelled', label: 'Đã hủy' }
];
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

const Billing = () => {
  const [status, setStatus] = useState('pending');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await axios.get('/admin/billing', { params: { status } });
      setOrders(data.orders || []);
    } catch (e) {
      setError(adminError(e));
      setOrders([]);
    }
  }, [status]);
  useEffect(() => { setOrders(null); load(); }, [load]);

  const confirm = async (o) => {
    if (!window.confirm(`Đã thấy ${vnd(o.amount)} với nội dung ${o.code} trong sao kê? Gói ${o.planName} của ${o.email} sẽ bật ngay.`)) return;
    setBusy(o.code);
    setNote('');
    try {
      const { data } = await axios.post(`/admin/billing/${o.code}/confirm`);
      setNote(`Đã bật gói ${o.planName} cho ${o.email} tới ${new Date(data.planUntil).toLocaleDateString('vi-VN')}.`);
      await load();
    } catch (e) {
      setNote(adminError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageEnter className="flex flex-col gap-6">
      <GlassPanel tone="strong" className="p-6">
        <PanelHeader title="Đơn mua gói" subtitle="Đối chiếu số tiền và nội dung chuyển khoản với sao kê trước khi xác nhận." />
        <ChipGroup value={status} onChange={setStatus} options={STATUS} label="Trạng thái đơn" />
        <p role="status" className="mt-3 min-h-5 text-sm text-ok">{note}</p>
        {error && <p role="alert" className="mt-2 text-sm text-crit">{error}</p>}
        {orders === null ? (
          <SkeletonBlock className="mt-4 h-40" />
        ) : orders.length === 0 ? (
          <EmptyState compact title="Không có đơn nào" description={status === 'pending' ? 'Đơn mới hiện ở đây khi shop tạo mã chuyển khoản.' : 'Chưa có đơn ở trạng thái này.'} />
        ) : (
          <ul className="mt-4 flex flex-col">
            {orders.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-soft py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-hi">{o.email}</p>
                  <p className="text-xs text-ink-mid">
                    Gói {o.planName}, {o.months} tháng, <span className="tabular-nums">{vnd(o.amount)}</span>, nội dung <span className="font-code text-ink-hi">{o.code}</span>
                  </p>
                  <p className="text-xs text-ink-lo tabular-nums">
                    Tạo {fmtDateTime(o.createdAt)}{o.paidAt ? `, nhận tiền ${fmtDateTime(o.paidAt)}${o.paidBy ? ` (${o.paidBy === 'bank' ? 'ngân hàng báo' : o.paidBy})` : ''}` : ''}
                  </p>
                </div>
                {o.status === 'pending' && (
                  <Button size="sm" loading={busy === o.code} onClick={() => confirm(o)}>Xác nhận đã nhận tiền</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </PageEnter>
  );
};

export default Billing;
