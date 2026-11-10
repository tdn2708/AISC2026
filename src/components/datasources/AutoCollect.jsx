import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarClock, RefreshCw, TriangleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { GlassPanel, Button } from '../ui';
import { fmtDateTime, fmtInt, fmtRelative } from '../../lib/format';
import { getWorkspace } from '../../lib/workspace';
import { reportRefreshing } from '../../lib/dataVersion';

/**
 * TỰ THU THẬP KHO THẬT
 * ------------------------------------------------------------------
 * Máy chủ tự lấy đánh giá mới mỗi 24 giờ (backend/services/real_collector.js).
 * Thẻ này cho người dùng thấy luồng đó đang sống: lần gần nhất thêm được bao
 * nhiêu, lần kế tiếp lúc nào, đang chạy tới đâu, và nếu chưa chạy được thì
 * thiếu đúng cái gì. Luôn hỏi kho "real" dù đang xem kho nào, vì chỉ kho thật
 * có luồng này.
 */

const REAL = { headers: { 'X-Workspace': 'real' } };

const AutoCollect = () => {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => axios.get('/collector/status', REAL).then((r) => setS(r.data)).catch(() => setS(null)), []);

  useEffect(() => { load(); }, [load]);

  // Đang chạy thì hỏi lại mỗi 10 giây để tiến độ nhích lên trước mắt người xem
  useEffect(() => {
    if (!s?.running) return undefined;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [s?.running, load]);

  // Vừa chạy xong và có dữ liệu mới: báo các trang khác tải lại số liệu
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (s?.running) setWasRunning(true);
    else if (wasRunning && s) {
      setWasRunning(false);
      if (s.lastResult?.inserted > 0 && getWorkspace() === 'real') reportRefreshing(true);
    }
  }, [s, wasRunning]);

  if (!s?.applicable) return null;

  const runNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await axios.post('/collector/run', {}, REAL);
      setS({ applicable: true, ...r.data.status });
    } catch (e) {
      setMsg(e.response?.data?.error || 'Không gọi được máy chủ.');
      if (e.response?.data?.status) setS({ applicable: true, ...e.response.data.status });
    } finally {
      setBusy(false);
    }
  };

  const last = s.lastResult;
  let tone = 'ok';
  let Icon = CircleCheck;
  let headline;
  if (!s.ready || !s.enabled) {
    tone = 'warn';
    Icon = TriangleAlert;
    headline = 'Tự thu thập chưa chạy';
  } else if (s.running) {
    tone = 'run';
    Icon = Loader2;
    headline = s.progress
      ? `Đang thu thập: ${fmtInt(s.progress.products)} sản phẩm, thêm ${fmtInt(s.progress.inserted)} đánh giá mới`
      : 'Đang thu thập đánh giá mới';
  } else if (s.lastError) {
    tone = 'warn';
    Icon = TriangleAlert;
    headline = 'Lần thu thập gần nhất gặp lỗi';
  } else if (s.lastFinishedAt) {
    headline = `Lần gần nhất ${fmtRelative(s.lastFinishedAt)}: thêm ${fmtInt(last?.inserted ?? 0)} đánh giá mới`;
  } else {
    headline = 'Chưa thu thập lần nào, lượt đầu sẽ chạy trong vài phút';
  }

  const iconCls = { ok: 'bg-ok/12 text-ok', warn: 'bg-high/12 text-high', run: 'bg-accent-dim text-accent-hi' }[tone];

  return (
    <GlassPanel tone="strong" className="mb-6 p-5" aria-live="polite">
      <div className="flex flex-wrap items-start gap-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${iconCls}`}>
          <Icon size={20} className={s.running ? 'animate-spin' : ''} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-mid">Kho Dữ liệu thật tự cập nhật mỗi {s.everyHours} giờ</p>
          <p className="mt-0.5 text-base font-semibold text-ink-hi">{headline}</p>
          {s.reason && <p className="mt-1 max-w-[70ch] text-sm text-high">{s.reason}</p>}
          {s.lastError && !s.running && <p className="mt-1 max-w-[70ch] text-sm text-high">{s.lastError}</p>}
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-mid">
            {last && (
              <div className="flex gap-1">
                <dt>Lượt trước:</dt>
                <dd className="text-ink-hi">{fmtInt(last.products)} sản phẩm, {fmtInt(last.fetched)} đánh giá đọc được, {fmtInt(last.duplicates)} đã có sẵn</dd>
              </div>
            )}
            {s.nextDueAt && s.ready && !s.running && (
              <div className="flex gap-1">
                <dt className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" /> Lần kế tiếp:</dt>
                <dd className="text-ink-hi">{new Date(s.nextDueAt) < new Date() ? 'ngay khi máy chủ rảnh' : fmtDateTime(s.nextDueAt)}</dd>
              </div>
            )}
          </dl>
          {msg && <p role="alert" className="mt-2 text-sm text-high">{msg}</p>}
        </div>
        {s.ready && s.enabled && (
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={busy} disabled={s.running} onClick={runNow}>
            Thu thập ngay
          </Button>
        )}
      </div>
    </GlassPanel>
  );
};

export default AutoCollect;
