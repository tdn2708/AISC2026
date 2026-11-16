import React, { useCallback, useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  GlassPanel,
  Button,
  IconButton,
  Drawer,
  Toast,
  EmptyState,
  Skeleton,
  SkeletonBlock
} from './ui';
import { PageEnter } from './motion';
import { fmtRelative } from '../lib/format';
import { bumpDataVersion, useDataVersion } from '../lib/dataVersion';
import { getWorkspace } from '../lib/workspace';
import { useWorkspaceEmpty } from '../lib/workspaceEmpty';
import {
  getStatus,
  getMessages,
  sendCommand,
  saveSettings,
  getOutbox,
  sendTest,
  unlinkZalo
} from '../lib/butler';
import Conversation from './butler/Conversation';
import Composer from './butler/Composer';
import WatchPanel from './butler/WatchPanel';
import ZaloConnect from './butler/ZaloConnect';

function workspaceLabel(ws) {
  return ws === 'demo' ? 'Mô phỏng' : 'Dữ liệu thật';
}

const ButlerSkeleton = () => (
  <SkeletonBlock label="Đang tải trang Quản gia" className="cx pt-2">
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-28 rounded-ctrl" />
    </div>
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-h-[28rem] flex-1 max-w-[680px] flex-col justify-between rounded-surf border border-line-soft p-5">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-3/4 rounded-ctrl" />
          <Skeleton className="h-10 w-1/2 self-end rounded-ctrl" />
          <Skeleton className="h-24 w-5/6 rounded-ctrl" />
        </div>
        <Skeleton className="h-12 w-full rounded-ctrl" />
      </div>
      <div className="hidden w-[320px] shrink-0 lg:block">
        <Skeleton className="h-[32rem] w-full rounded-surf" />
      </div>
    </div>
  </SkeletonBlock>
);

const Butler = () => {
  const dataVersion = useDataVersion();
  const workspaceEmpty = useWorkspaceEmpty();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [outboxItems, setOutboxItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const [connectOpen, setConnectOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, tone: 'ok', text: '' });

  const showToast = useCallback((text, tone = 'ok') => {
    setToast({ show: true, tone, text });
  }, []);

  useEffect(() => {
    if (!toast.show) return undefined;
    const t = setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [st, msgData, obData] = await Promise.all([
        getStatus(),
        getMessages({ limit: 30 }),
        getOutbox(10)
      ]);
      setStatus(st);
      setMessages(msgData.messages || []);
      setHasMore(Boolean(msgData.hasMore));
      setOutboxItems(obData.items || []);
    } catch (e) {
      if (!silent) {
        setLoadError(e.response?.data?.error || 'Không tải được dữ liệu Quản gia. Vui lòng thử lại.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [loadAll, dataVersion]);

  const handleLoadMore = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const firstId = messages[0]._id;
      const older = await getMessages({ before: firstId, limit: 30 });
      setMessages((prev) => [...(older.messages || []), ...prev]);
      setHasMore(Boolean(older.hasMore));
    } catch {
      showToast('Không tải được tin cũ hơn', 'crit');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendCommand = useCallback(
    async (text) => {
      const clean = String(text || '').trim();
      if (!clean || busy) return;
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { _id: tempId, role: 'user', channel: 'web', text: clean, at: new Date().toISOString() }
      ]);
      setBusy(true);
      try {
        const res = await sendCommand(clean);
        const [uMsg, bMsg] = res.messages || [];
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m._id !== tempId);
          return [...withoutTemp, ...(uMsg ? [uMsg] : []), ...(bMsg ? [bMsg] : [])];
        });
        if (String(res.reply?.text || '').startsWith('Đã ghi')) {
          bumpDataVersion();
        }
        const [st, ob] = await Promise.all([getStatus().catch(() => null), getOutbox(10).catch(() => null)]);
        if (st) setStatus(st);
        if (ob?.items) setOutboxItems(ob.items);
      } catch (e) {
        const errText = e.response?.data?.error || 'Không gửi được lệnh tới máy chủ.';
        setMessages((prev) => [
          ...prev.filter((m) => m._id !== tempId),
          { role: 'user', channel: 'web', text: clean, at: new Date().toISOString() },
          { role: 'butler', channel: 'web', text: errText, reply: { kind: 'error' }, at: new Date().toISOString() }
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  const handleSaveSettings = async (patch) => {
    try {
      const res = await saveSettings(patch);
      setStatus((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      showToast('Đã lưu');
    } catch (e) {
      showToast(e.response?.data?.error || 'Không lưu được cài đặt', 'crit');
    }
  };

  const handleSendTest = async () => {
    try {
      await sendTest();
      showToast('Đã đưa tin thử vào hàng đợi gửi Zalo');
      const ob = await getOutbox(10).catch(() => null);
      if (ob?.items) setOutboxItems(ob.items);
    } catch (e) {
      showToast(e.response?.data?.error || 'Không gửi được tin thử', 'crit');
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkZalo();
      setStatus((prev) =>
        prev ? { ...prev, link: { linked: false, zaloName: null, linkedAt: null } } : prev
      );
      showToast('Đã ngắt kết nối Zalo');
    } catch (e) {
      showToast(e.response?.data?.error || 'Không ngắt được kết nối Zalo', 'crit');
    }
  };

  const handleLinked = useCallback(
    (newStatus) => {
      setStatus(newStatus);
      setConnectOpen(false);
      showToast('Đã nối Zalo');
      loadAll(true);
    },
    [loadAll, showToast]
  );

  if (loading) return <ButlerSkeleton />;

  if (loadError) {
    return (
      <PageEnter className="cx pt-2">
        <GlassPanel tone="strong" className="p-6">
          <EmptyState
            variant="error"
            title="Không tải được trang Quản gia"
            description={loadError}
            action={
              <Button variant="primary" onClick={() => loadAll(false)}>
                Thử lại
              </Button>
            }
          />
        </GlassPanel>
      </PageEnter>
    );
  }

  const webWs = getWorkspace();
  const webWsName = workspaceLabel(webWs);
  const zaloWs = (status?.settings?.workspace || 'real') === 'demo' ? 'demo' : 'real';
  const zaloWsName = workspaceLabel(zaloWs);
  const sameWs = webWs === zaloWs;
  const lastCheck = status?.watcher?.lastRunAt
    ? `kiểm lần cuối ${fmtRelative(status.watcher.lastRunAt)}`
    : 'chờ lượt kiểm đầu tiên';
  const linked = Boolean(status?.link?.linked);

  const desktopSubtitle = sameWs
    ? `Canh kho ${zaloWsName}, ${lastCheck}.`
    : `Đang xem kho ${webWsName}. Zalo canh kho ${zaloWsName}, ${lastCheck}.`;
  const mobileSubtitle = sameWs
    ? `Canh kho ${zaloWsName}. ${linked ? 'Zalo đã nối.' : 'Chưa nối Zalo.'}`
    : `Đang xem kho ${webWsName}. Zalo canh kho ${zaloWsName}. ${linked ? 'Zalo đã nối.' : 'Chưa nối Zalo.'}`;
  const drawerSubtitle = sameWs
    ? `Canh kho ${zaloWsName}, ${lastCheck}`
    : `Đang xem kho ${webWsName}. Zalo canh kho ${zaloWsName}, ${lastCheck}`;

  return (
    <PageEnter className="cx pt-2 pb-4">
      {/* Đầu trang trên máy tính (từ lg) */}
      <header className="mb-5 hidden lg:block">
        <h1 className="text-display font-semibold tracking-[-0.02em] text-ink-hi">
          Quản gia
        </h1>
        <p className="mt-1 text-sm text-ink-mid">
          {desktopSubtitle}
        </p>
      </header>

      {/* Thanh trạng thái gọn trên điện thoại / máy tính bảng */}
      <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
        <div className="min-w-0">
          <h1 className="text-heading font-semibold text-ink-hi">Quản gia</h1>
          <p className="text-xs leading-snug text-ink-mid">
            {mobileSubtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!linked && (
            <Button variant="primary" size="sm" onClick={() => setConnectOpen(true)}>
              Nối Zalo
            </Button>
          )}
          <IconButton
            icon={SlidersHorizontal}
            label="Cài đặt báo"
            variant="glass"
            size="md"
            onClick={() => setDrawerOpen(true)}
          />
        </div>
      </div>

      {/* Bố cục chính: cột cuộc trò chuyện (tối đa 680px) và cột phải (320px trên lg) */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <GlassPanel
          as="section"
          tone="strong"
          aria-label="Cuộc trò chuyện với quản gia"
          className="flex h-[calc(100dvh-12rem)] min-h-[24rem] w-full max-w-[680px] flex-col overflow-hidden px-4 pt-2 sm:px-5 lg:h-[calc(100dvh-11.5rem)] lg:min-h-[26rem] lg:flex-1"
        >
          <Conversation
            messages={messages}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            onCommand={handleSendCommand}
            busy={busy}
            workspaceEmpty={workspaceEmpty === true}
          />
          <Composer onSend={handleSendCommand} busy={busy} />
        </GlassPanel>

        <div className="hidden w-[320px] shrink-0 lg:block">
          <WatchPanel
            status={status}
            outboxItems={outboxItems}
            onOpenConnect={() => setConnectOpen(true)}
            onSaveSettings={handleSaveSettings}
            onSendTest={handleSendTest}
            onUnlink={handleUnlink}
          />
        </div>
      </div>

      {/* Ngăn kéo cài đặt báo trên điện thoại */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Đang canh"
        subtitle={drawerSubtitle}
        width={400}
      >
        <WatchPanel
          inDrawer
          status={status}
          outboxItems={outboxItems}
          onOpenConnect={() => {
            setDrawerOpen(false);
            setConnectOpen(true);
          }}
          onSaveSettings={handleSaveSettings}
          onSendTest={handleSendTest}
          onUnlink={handleUnlink}
        />
      </Drawer>

      <ZaloConnect
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        defaultBotName={status?.zalo?.botName}
        onLinked={handleLinked}
      />

      <Toast show={toast.show} tone={toast.tone}>
        {toast.text}
      </Toast>
    </PageEnter>
  );
};

export default Butler;
