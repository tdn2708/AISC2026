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
const { createInbound } = require('./inbound');
const zalo = require('./zalo');

function isButlerEnabled() {
  return String(process.env.BUTLER) !== '0';
}

async function startButler({ authDb, workspaces }) {
  if (!isButlerEnabled()) {
    console.log('Quản gia: TẮT (BUTLER=0).');
    return { inbound: null, enabled: false };
  }

  await store.ensureButlerIndexes(authDb);

  const stopOutbox = outbox.startOutbox(authDb);
  const stopWatcher = watcher.startWatcher({ authDb, workspaces });
  const inbound = createInbound({ authDb, workspaces });

  let stopPolling = null;
  const currentMode = zalo.mode();

  if (currentMode === 'poll') {
    stopPolling = zalo.startPolling((u) => inbound.push(u));
  } else if (currentMode === 'webhook') {
    const secret = String(process.env.ZALO_WEBHOOK_SECRET || '');
    if (secret.length < 8 || secret.length > 256) {
      console.warn('[QUẢN GIA] Chế độ webhook thiếu ZALO_WEBHOOK_SECRET (8 đến 256 ký tự); đường webhook sẽ trả 503.');
    } else if (process.env.RENDER_EXTERNAL_URL) {
      const base = String(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, '');
      zalo.setWebhook(`${base}/api/butler/zalo/webhook`, secret).catch((e) => {
        console.warn('[QUẢN GIA] Không đặt được webhook Zalo:', e.message);
      });
    }
  }

  let keepAliveTimer = null;
  if (String(process.env.BUTLER_KEEPALIVE) === '1' && process.env.RENDER_EXTERNAL_URL) {
    const healthUrl = `${String(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, '')}/health`;
    keepAliveTimer = setInterval(() => {
      axios.get(healthUrl, { timeout: 10000 }).catch(() => {});
    }, 10 * 60 * 1000);
    if (keepAliveTimer.unref) keepAliveTimer.unref();
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
      if (stopPolling) stopPolling();
      if (keepAliveTimer) clearInterval(keepAliveTimer);
    }
  };
}

module.exports = {
  isButlerEnabled,
  startButler
};
