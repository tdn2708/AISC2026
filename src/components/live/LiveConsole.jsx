import React, { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Square, RotateCw, Package, MessageSquarePlus, Download, Ellipsis, Radio } from 'lucide-react';
import { Button, Badge, Drawer, EmptyState, Tabs, Modal, Popover, MenuItem, Skeleton, Select } from '../ui';
import { fmtInt } from '../../lib/format';
import useLiveSession, { liveUrl } from '../../hooks/useLiveSession';
import { StatusPill, PLATFORM_LABEL, durationMs } from './shared';
import QueueRaw from './Queue';
import Feed from './Feed';
import OrdersRaw from './Orders';
import PulseRaw from './Pulse';
import BuyerNowRaw from './BuyerNow';
import CatalogEditor, { toRow, fromRow } from './CatalogEditor';
import ManualInput from './ManualInput';
import ActionCoachRaw from './ActionCoach';
import Report from './Report';

/**
 * BẢNG ĐIỀU KHIỂN MỘT PHIÊN LIVE (tối giản, 24/11), đọc từ trên xuống theo đúng luồng:
 *   1. Nhịp phiên        người xem, bình luận, lượt chốt trên cùng trục thời gian (dữ liệu vào)
 *   2. Người mua lúc này  muốn mua gì, muốn biết gì, đang cần gì (xu hướng 10 phút)
 *   3. Nên làm ngay       hai việc gấp nhất để giữ hoặc kéo lại nhịp bán
 *   4. Khung có tab       cần trả lời, bình luận trực tiếp, khách chốt đơn (làm việc chi tiết)
 * Sản phẩm đang giới thiệu chọn ở thanh đầu: câu hỏi không nhắc tên sản phẩm được hiểu là hỏi món đó.
 * Danh mục, nhập bình luận, xuất dữ liệu nằm trong menu "Thêm".
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
const Pulse = memo(PulseRaw, slice((s) => s?.series, (s) => s?.trend?.sales, (s) => s?.viewers, (s) => s?.totals));
const BuyerNow = memo(BuyerNowRaw, slice((s) => s?.trend, (s) => s?.actions?.active));
const ActionCoach = memo(ActionCoachRaw, slice((s) => s?.actions, (s) => s?.totals, (s) => s?.products));

/** Đồng hồ thời lượng phiên: tự đếm từng giây, không kéo cả bảng điều khiển vẽ lại */
// K7-02 lỗi 25: dùng session.liveMs của máy chủ (thời lượng live KHÔNG tính lúc bị ngắt); thiếu hoặc null thì ẩn câu, không đoán từ startedAt
const Elapsed = ({ session, live }) => {
  const [, setTick] = useState(0);
  const base = useRef({ ms: null, at: 0 });
  if (base.current.ms !== session.liveMs) base.current = { ms: session.liveMs, at: Date.now() };
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  if (session.liveMs == null || !Number.isFinite(session.liveMs)) return null;
  const extra = live ? Date.now() - base.current.at : 0;
  return `, đã live ${durationMs(session.liveMs + extra)}`;
};

/** Menu "Thêm": việc ít dùng trong lúc live, không chiếm chỗ trên thanh đầu */
const MoreMenu = ({ sessionId, canInput, onCatalog, onInput }) => {
  const [open, setOpen] = useState(false);
  const go = (fn) => { setOpen(false); fn(); };
  const exp = (kind, format) => go(() => window.open(liveUrl(`/sessions/${sessionId}/export`, { kind, format }), '_blank'));
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" icon={Ellipsis} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">Thêm</Button>
      {open && (
        <Popover className="absolute right-0 z-20 mt-1 w-72" role="menu">
          <MenuItem role="menuitem" icon={Package} hint="Gợi ý trả lời chỉ dùng thông tin ở đây" onClick={() => go(onCatalog)} className="font-medium">Sản phẩm, chính sách</MenuItem>
          {canInput && <MenuItem role="menuitem" icon={MessageSquarePlus} hint="Dán bình luận hoặc nhập tệp CSV" onClick={() => go(onInput)} className="font-medium">Nhập bình luận</MenuItem>}
          <MenuItem role="menuitem" icon={Download} hint="CSV để lên đơn sau live" onClick={() => exp('orders', 'csv')} className="font-medium">Xuất danh sách chốt đơn</MenuItem>
          <MenuItem role="menuitem" icon={Download} hint="JSONL, không có tên tài khoản" onClick={() => exp('comments', 'jsonl')} className="font-medium">Xuất bình luận đã chuẩn hóa</MenuItem>
          <MenuItem role="menuitem" icon={Download} hint="Câu khách hỏi và câu shop đã trả lời" onClick={() => exp('qa', 'jsonl')} className="font-medium">Xuất cặp hỏi đáp</MenuItem>
        </Popover>
      )}
    </div>
  );
};

/** Nguồn của phiên: TikTok là tên tài khoản, YouTube là tên kênh (không hiện cả đường dẫn) */
const sourceLabel = (session) => {
  if (!session.target || session.platform === 'simulator' || session.platform === 'manual') return '';
  if (session.platform === 'youtube') return session.info?.channel ? `, kênh ${session.info.channel}` : '';
  return `, @${String(session.target).replace(/^@+/, '')}`;
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
  const [work, setWork] = useState('queue');

  if (error && !session) {
    return <EmptyState variant="error" title="Không mở được phiên" description={error} action={<Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Về danh sách phiên</Button>} />;
  }
  if (!session || !stats) {
    return <Skeleton as="div" className="h-64 rounded-surf" />;
  }

  const live = ['live', 'connecting', 'reconnecting'].includes(session.status);
  // Phiên đã kết thúc mở thẳng báo cáo; đang live mở bảng điều khiển
  const tab = view || (live ? 'console' : 'report');
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
            {PLATFORM_LABEL[session.platform]}{sourceLabel(session)}
            <Elapsed session={session} live={live} />
            {connection === 'reconnecting' && live && <span className="text-high">, đang nối lại luồng dữ liệu</span>}
          </p>
          {session.error && <p role="alert" className="mt-1.5 text-sm text-crit">{session.error}</p>}
          {live && stats?.health?.writeFailures > 0 && (
            <p role="alert" className="mt-1.5 text-sm text-high">
              Chưa ghi được {fmtInt(stats.health.pendingWrites)} bình luận vào kho, đang thử lại. Bình luận vẫn hiện và vẫn được tính.
            </p>
          )}
          {stats?.health?.dropped > 0 && (
            <p role="alert" className="mt-1.5 text-sm text-crit">
              Đã phải bỏ {fmtInt(stats.health.dropped)} bình luận cũ nhất vì không ghi được vào kho quá lâu.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <Select
              aria-label="Sản phẩm đang giới thiệu"
              icon={Radio}
              size="sm"
              className="w-80 max-w-full"
              value={stats.currentProductId || session.currentProductId || ''}
              onChange={(e) => setCurrent(e.target.value)}
              options={products.map((p) => ({ value: p.id, label: `Đang giới thiệu: ${p.code ? `${p.code} ` : ''}${p.name}` }))}
            />
          )}
          <MoreMenu sessionId={session.id} canInput={session.platform === 'manual' || !live} onCatalog={openCatalog} onInput={() => setDrawer('input')} />
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
      <Pulse stats={slow} sessionId={session.id} live={live} />
      <BuyerNow stats={slow} sessionId={session.id} live={live} onOpen={setWork} onOpenCatalog={openCatalog} />
      <ActionCoach stats={slow} sessionId={session.id} live={live} onOpenCatalog={openCatalog} />

      {/* Làm việc chi tiết: một khung, ba tab */}
      <section aria-label="Xử lý bình luận" className="glass-strong rounded-surf p-4 sm:p-5">
        <Tabs
          className="mb-4"
          value={work}
          onChange={setWork}
          tabs={[
            { value: 'queue', label: 'Cần trả lời', count: stats.queueOpen || undefined },
            { value: 'feed', label: 'Bình luận trực tiếp' },
            { value: 'orders', label: 'Khách chốt đơn', count: (stats.orders || []).filter((o) => o.status === 'new').length || undefined }
          ]}
        />
        {work === 'queue' && <Queue bare stats={slow} sessionId={session.id} onChanged={live ? undefined : refresh} />}
        {work === 'feed' && <Feed bare feed={feed} sessionId={session.id} onPatched={(c) => { patchComment(c); if (!live) refresh(); }} live={live} />}
        {work === 'orders' && <Orders bare stats={slow} sessionId={session.id} onChanged={live ? undefined : refresh} />}
      </section>
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
