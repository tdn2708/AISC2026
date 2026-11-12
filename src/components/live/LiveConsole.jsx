import React, { memo, useDeferredValue, useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Square, RotateCw, Package, MessageSquarePlus, Download, ChevronDown } from 'lucide-react';
import { Button, Badge, Drawer, EmptyState, GlassPanel, Tabs, Modal, Popover, MenuItem, SELECTED } from '../ui';
import { fmtInt, fmtPct } from '../../lib/format';
import useLiveSession, { liveUrl } from '../../hooks/useLiveSession';
import { StatusPill, PLATFORM_LABEL, duration } from './shared';
import QueueRaw from './Queue';
import Feed from './Feed';
import OrdersRaw from './Orders';
import { Rhythm as RhythmRaw, Topics as TopicsRaw, Products as ProductsRaw } from './Insights';
import CatalogEditor, { toRow, fromRow } from './CatalogEditor';
import ManualInput from './ManualInput';
import ActionCoachRaw from './ActionCoach';
import Report from './Report';

/**
 * BẢNG ĐIỀU KHIỂN MỘT PHIÊN LIVE
 *   Hàng số liệu:  người xem, nhịp bình luận, câu hỏi chờ, đơn chốt, khiếu nại
 *   Dải sản phẩm:  bấm để báo "đang giới thiệu sản phẩm này" — câu hỏi không
 *                  nhắc tên sản phẩm sẽ được hiểu là hỏi về sản phẩm đó
 *   Ba cột:        cần trả lời | bình luận trực tiếp | nhịp và chủ đề
 *   Dưới cùng:     khách chốt đơn
 */

/**
 * Bình luận về 2 cái mỗi giây làm LiveConsole vẽ lại liên tục. Các khối dưới đây
 * chỉ phụ thuộc một lát của stats (gửi 1,5 giây một lần, object mới dù nội dung giống),
 * nên so theo nội dung của đúng lát đó và bỏ qua hàm truyền vào.
 */
const slice = (...pick) => (a, b) =>
  pick.every((f) => JSON.stringify(f(a.stats)) === JSON.stringify(f(b.stats))) && a.sessionId === b.sessionId && a.live === b.live;
const Queue = memo(QueueRaw, slice((s) => s?.queue, (s) => s?.answered, (s) => s?.queueOpen));
const Orders = memo(OrdersRaw, slice((s) => s?.orders, (s) => s?.totals?.orderQuantity));
const Rhythm = memo(RhythmRaw, slice((s) => s?.series));
const Topics = memo(TopicsRaw, slice((s) => s?.topics));
const Products = memo(ProductsRaw, slice((s) => s?.products));
const ActionCoach = memo(ActionCoachRaw, slice((s) => s?.actions, (s) => s?.totals, (s) => s?.products));

/** Đồng hồ thời lượng phiên: tự đếm từng giây, không kéo cả bảng điều khiển vẽ lại */
const Elapsed = ({ session }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return session.startedAt ? `, đã live ${duration(session.startedAt, session.endedAt)}` : null;
};

const Kpi = ({ label, value, sub, tone }) => (
  <div className="glass-strong min-w-0 rounded-surf px-3.5 py-3">
    <p className="truncate text-xs text-ink-lo">{label}</p>
    <p className={`mt-1 tabular-nums text-display leading-none font-semibold ${tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : 'text-ink-hi'}`}>{value}</p>
    {sub && <p className="mt-1 truncate text-xs text-ink-lo">{sub}</p>}
  </div>
);

const ExportMenu = ({ sessionId }) => {
  const [open, setOpen] = useState(false);
  const go = (kind, format) => {
    window.open(liveUrl(`/sessions/${sessionId}/export`, { kind, format }), '_blank');
    setOpen(false);
  };
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" icon={Download} iconRight={ChevronDown} onClick={() => setOpen((v) => !v)} aria-expanded={open}>Xuất dữ liệu</Button>
      {open && (
        <Popover className="absolute right-0 mt-1 w-72" role="menu">
          {[
            ['comments', 'jsonl', 'Bình luận đã chuẩn hóa', 'JSONL, không có tên tài khoản. Dùng cho huấn luyện.'],
            ['qa', 'jsonl', 'Cặp hỏi đáp đã xác nhận', 'JSONL. Câu hỏi của khách và câu shop đã trả lời.'],
            ['orders', 'csv', 'Danh sách chốt đơn', 'CSV để lên đơn sau live.']
          ].map(([kind, format, label, hint]) => (
            <MenuItem key={kind} role="menuitem" hint={hint} onClick={() => go(kind, format)} className="font-medium">
              {label}
            </MenuItem>
          ))}
        </Popover>
      )}
    </div>
  );
};

const LiveConsole = ({ sessionId, onBack }) => {
  const [epoch, setEpoch] = useState(0);
  const { session, stats, feed, error, refresh, patchComment, connection } = useLiveSession(sessionId, epoch);
  // Biểu đồ, hàng đợi, đơn chốt vẽ ở mức ưu tiên thấp: React chia nhỏ việc vẽ nên dòng bình luận và cuộn không bị giật
  const slow = useDeferredValue(stats);
  const [drawer, setDrawer] = useState(null);
  const [rows, setRows] = useState([]);
  const [policy, setPolicy] = useState({});
  const [busy, setBusy] = useState(null);
  const [view, setView] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);

  if (error && !session) {
    return <EmptyState variant="error" title="Không mở được phiên" description={error} action={<Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Về danh sách phiên</Button>} />;
  }
  if (!session || !stats) {
    return <GlassPanel className="h-64 animate-skeleton" />;
  }

  const live = ['live', 'connecting', 'reconnecting'].includes(session.status);
  // Phiên đã kết thúc mở thẳng báo cáo; đang live mở bảng điều khiển
  const tab = view || (live ? 'console' : 'report');
  const t = stats.totals;
  const products = session.products || [];

  const openCatalog = () => {
    setRows(products.map(toRow));
    setPolicy(session.policy || {});
    setDrawer('catalog');
  };
  const saveCatalog = async () => {
    setBusy('catalog');
    try {
      await axios.put(`/live/sessions/${session.id}/catalog`, { products: rows.filter((r) => r.name?.trim()).map(fromRow), policy });
      await refresh();
      setDrawer(null);
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    setConfirmStop(false);
    setBusy('stop');
    try {
      await axios.post(`/live/sessions/${session.id}/stop`);
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const resume = async () => {
    setBusy('resume');
    try {
      await axios.post(`/live/sessions/${session.id}/resume`);
      // Mở lại luồng sự kiện cho phiên vừa nối lại
      setEpoch((e) => e + 1);
    } finally {
      setBusy(null);
    }
  };
  const setCurrent = async (productId) => {
    await axios.post(`/live/sessions/${session.id}/current-product`, { productId });
    if (!live) refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Đầu trang phiên */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Button variant="link" size="sm" icon={ArrowLeft} onClick={onBack} className="mb-1.5">
            Tất cả phiên live
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-display leading-tight font-semibold tracking-[-0.02em] text-ink-hi">{session.title}</h1>
            <StatusPill status={session.status} />
            {session.simulated && <Badge tone="sky">Dữ liệu mô phỏng</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-mid">
            {PLATFORM_LABEL[session.platform]}{session.target && session.platform !== 'simulator' ? `, @${String(session.target).replace(/^@/, '')}` : ''}
            <Elapsed session={session} />
            {connection === 'reconnecting' && live && <span className="text-high">, đang nối lại luồng dữ liệu</span>}
          </p>
          {session.error && <p role="alert" className="mt-1.5 text-sm text-crit">{session.error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(session.platform === 'manual' || !live) && (
            <Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setDrawer('input')}>Nhập bình luận</Button>
          )}
          <Button size="sm" variant="secondary" icon={Package} onClick={openCatalog}>Sản phẩm, chính sách</Button>
          <ExportMenu sessionId={session.id} />
          {live && <Button size="sm" variant="danger" icon={Square} loading={busy === 'stop'} onClick={() => setConfirmStop(true)}>Kết thúc</Button>}
          {['interrupted', 'error'].includes(session.status) && session.platform !== 'manual' && (
            <Button size="sm" icon={RotateCw} loading={busy === 'resume'} onClick={resume}>Kết nối lại</Button>
          )}
        </div>
      </header>

      <Tabs
        value={tab}
        onChange={setView}
        tabs={[{ value: 'console', label: 'Điều khiển phiên' }, { value: 'report', label: live ? 'Báo cáo đến hiện tại' : 'Báo cáo sau live' }]}
      />

      {tab === 'report' ? <Report key={`${session.status}-${session.endedAt || ''}`} sessionId={session.id} /> : (<>
      {/* Số liệu */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Người xem" value={stats.viewers?.now != null ? fmtInt(stats.viewers.now) : '—'} sub={stats.viewers?.peak ? `Cao nhất ${fmtInt(stats.viewers.peak)}` : 'Nền tảng chưa báo'} />
        <Kpi label="Bình luận mỗi phút" value={live ? fmtInt(t.perMinuteNow) : '—'} sub={`Tổng ${fmtInt(t.comments)} bình luận, ${fmtInt(t.commenters)} người`} />
        <Kpi label="Câu hỏi đang chờ" value={fmtInt(stats.queueOpen)} sub={t.answeredShare != null ? `Đã trả lời ${fmtPct(t.answeredShare, 0)} câu hỏi` : 'Chưa có câu hỏi'} tone={stats.queueOpen > 5 ? 'crit' : undefined} />
        <Kpi label="Lượt chốt đơn" value={fmtInt(t.byIntent.order)} sub={`${fmtInt(t.orderQuantity)} sản phẩm`} tone="ok" />
        <Kpi label="Khiếu nại" value={fmtInt(t.byIntent.complaint)} sub={t.byIntent.complaint ? 'Xem đầu hàng đợi' : 'Không có'} tone={t.byIntent.complaint ? 'crit' : undefined} />
        <Kpi label="Lượt thích" value={stats.likes != null ? fmtInt(stats.likes) : '—'} sub={`${fmtInt(t.byIntent.praise)} lời khen`} />
      </div>

      {/* Sản phẩm đang giới thiệu */}
      {products.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs text-ink-lo">Đang giới thiệu</span>
          {products.map((p) => {
            const active = p.id === (stats.currentProductId || session.currentProductId);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCurrent(p.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-ctrl border px-2.5 text-xs transition-[background-color,border-color,color] duration-micro ease-out ${active ? `${SELECTED} font-semibold` : 'border-line bg-surface text-ink-mid hover:border-ink-lo hover:text-ink-hi'}`}
              >
                <span className="tabular-nums">{p.code}</span>
                <span className="max-w-[12rem] truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <ActionCoach stats={slow} sessionId={session.id} live={live} onOpenCatalog={openCatalog} />

      {/* Ba cột */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5"><Queue stats={slow} sessionId={session.id} onChanged={live ? undefined : refresh} /></div>
        <div className="lg:col-span-4"><Feed feed={feed} sessionId={session.id} onPatched={(c) => { patchComment(c); if (!live) refresh(); }} live={live} /></div>
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Rhythm stats={slow} />
          <Topics stats={slow} />
          <Products stats={slow} />
        </div>
      </div>

      <Orders stats={slow} sessionId={session.id} onChanged={live ? undefined : refresh} />
      </>)}

      <Drawer
        open={drawer === 'catalog'}
        onClose={() => setDrawer(null)}
        title="Sản phẩm và chính sách"
        subtitle="Gợi ý trả lời chỉ dùng thông tin ở đây"
        width={720}
        footer={<><Button variant="ghost" onClick={() => setDrawer(null)}>Hủy</Button><Button loading={busy === 'catalog'} onClick={saveCatalog}>Lưu danh mục</Button></>}
      >
        <CatalogEditor rows={rows} onRows={setRows} policy={policy} onPolicy={setPolicy} />
      </Drawer>
      <Drawer open={drawer === 'input'} onClose={() => setDrawer(null)} title="Nhập bình luận" subtitle={live ? 'Bình luận được phân loại ngay khi gửi' : 'Nhập bổ sung vào phiên đã kết thúc'} width={600}>
        <ManualInput session={session} onDone={live ? undefined : refresh} />
      </Drawer>
      <Modal
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        icon={Square}
        tone="crit"
        size="sm"
        title="Kết thúc phiên và ngừng thu bình luận?"
        footer={<><Button variant="ghost" onClick={() => setConfirmStop(false)}>Hủy</Button><Button variant="danger" icon={Square} onClick={stop}>Kết thúc phiên</Button></>}
      />
    </div>
  );
};

export default LiveConsole;
