/**
 * KHỞI ĐỘNG DỊCH VỤ QUẢN GIA (startButler)
 * ==================================================================
 * Bật chỉ mục MongoDB, hàng đợi tin đi, vòng canh sự cố, hàng đợi tin đến,
 * và kết nối Zalo (long-polling trên máy cục bộ hoặc webhook trên Render).
 * Đặt BUTLER=0 để tắt hoàn toàn phần nền của quản gia.
 */

const axios = require('axios');
const store = require('./store');
const outbox = require('./outbox');
const watcher = require('./watcher');
const liveWatch = require('./live_watch');
const { createInbound } = require('./inbound');
const zalo = require('./zalo');

function isButlerEnabled() {
  return String(process.env.BUTLER) !== '0';
}

async function hasScheduleInNext2Hours(workspaces) {
  const now = new Date();
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  for (const wsDb of Object.values(workspaces || {})) {
    if (!wsDb) continue;
    try {
      const found = await wsDb.collection('live_schedule').findOne(
        { status: 'scheduled', startAt: { $gte: now, $lte: in2h } },
        { projection: { _id: 1 } }
      );
      if (found) return true;
    } catch {
      // bỏ qua lỗi đọc lịch lúc khởi động
    }
  }
  return false;
}

async function startButler({ authDb, workspaces }) {
  if (!isButlerEnabled()) {
    console.log('Quản gia: TẮT (BUTLER=0).');
    return { inbound: null, enabled: false };
  }

  if (process.env.BUTLER_COUNT_CTX === '1') {
    const ac = require('../analysis_context');
    if (typeof ac.getContext === 'function' && !ac.getContext.__wrappedByButler) {
      const orig = ac.getContext;
      const wrapped = function (...args) {
        global.__butlerCtxCalls = (global.__butlerCtxCalls || 0) + 1;
        return orig.apply(this, args);
      };
      wrapped.__wrappedByButler = true;
      ac.getContext = wrapped;
    }
  }

  await store.ensureButlerIndexes(authDb);

  let keepAliveTimer = null;
  let scheduleKeepAliveTimer = null;
  const renderBase = process.env.RENDER_EXTERNAL_URL
    ? String(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, '')
    : '';

  if (String(process.env.BUTLER_KEEPALIVE) === '1' && renderBase) {
    const healthUrl = `${renderBase}/health`;
    keepAliveTimer = setInterval(() => {
      axios.get(healthUrl, { timeout: 10000 }).catch(() => {});
    }, 10 * 60 * 1000);
    if (keepAliveTimer.unref) keepAliveTimer.unref();
  }

  const syncScheduleKeepAlive = (hasUpcoming) => {
    if (!renderBase || String(process.env.BUTLER_KEEPALIVE) === '1') return;
    if (hasUpcoming && !scheduleKeepAliveTimer) {
      const healthUrl = `${renderBase}/health`;
      scheduleKeepAliveTimer = setInterval(() => {
        axios.get(healthUrl, { timeout: 10000 }).catch(() => {});
      }, 10 * 60 * 1000);
      if (scheduleKeepAliveTimer.unref) scheduleKeepAliveTimer.unref();
    } else if (!hasUpcoming && scheduleKeepAliveTimer) {
      clearInterval(scheduleKeepAliveTimer);
      scheduleKeepAliveTimer = null;
    }
  };

  hasScheduleInNext2Hours(workspaces)
    .then(syncScheduleKeepAlive)
    .catch(() => {});

  const stopOutbox = outbox.startOutbox(authDb);
  const stopWatcher = watcher.startWatcher({ authDb, workspaces });
  const stopLiveWatch = liveWatch.startLiveWatch({
    authDb,
    workspaces,
    onScheduleUpcoming: syncScheduleKeepAlive
  });
  const inbound = createInbound({ authDb, workspaces });

  let stopPolling = null;
  const currentMode = zalo.mode();

  if (currentMode === 'poll') {
    stopPolling = zalo.startPolling((u) => inbound.push(u));
  } else if (currentMode === 'webhook') {
    const secret = String(process.env.ZALO_WEBHOOK_SECRET || '');
    if (secret.length < 8 || secret.length > 256) {
      console.warn('[QUẢN GIA] Chế độ webhook thiếu ZALO_WEBHOOK_SECRET (8 đến 256 ký tự); đường webhook sẽ trả 503.');
    } else if (renderBase) {
      zalo.setWebhook(`${renderBase}/api/butler/zalo/webhook`, secret).catch((e) => {
        console.warn('[QUẢN GIA] Không đặt được webhook Zalo:', e.message);
      });
    }
  }

  const minutesRaw = Number(process.env.BUTLER_WATCH_MINUTES);
  const everyMinutes = Number.isFinite(minutesRaw) ? Math.min(60, Math.max(1, Math.trunc(minutesRaw))) : 5;
  const zaloLabel = !zalo.configured() ? 'chưa cấu hình' : currentMode;
  console.log(`Quản gia: bật, Zalo ${zaloLabel}, canh mỗi ${everyMinutes} phút.`);

  return {
    inbound,
    enabled: true,
    stop: () => {
      if (stopOutbox) stopOutbox();
      if (stopWatcher) stopWatcher();
      if (stopLiveWatch) stopLiveWatch();
      if (stopPolling) stopPolling();
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (scheduleKeepAliveTimer) clearInterval(scheduleKeepAliveTimer);
    }
  };
}

module.exports = {
  isButlerEnabled,
  startButler
};
