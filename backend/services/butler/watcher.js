/**
 * VÒNG CANH NỀN CỦA QUẢN GIA (watcher)
 * ==================================================================
 * Định kỳ mỗi BUTLER_WATCH_MINUTES phút kiểm tra các kho có người đang nối Zalo,
 * gom sự cố đang mở vào butler_incidents, và đẩy tin báo hoặc bản tin sáng
 * vào hàng đợi butler_outbox. Dùng khóa trong MongoDB (meta._id='butler_watch')
 * để hai tiến trình không chạy trùng.
 */

const crypto = require('crypto');
const { getContext } = require('../analysis_context');
const { withTimeout, collectorStatus } = require('../real_collector');
const { vnParts } = require('./text');
const { SEV_RANK, collectIncidents, shouldNotify, buildAlertMessage, summarizeContext, buildDigest } = require('./incidents');
const outbox = require('./outbox');
const store = require('./store');

const STATE_ID = 'butler_watch';
const LOCK_TTL_MS = 10 * 60 * 1000;

function workspaceLabel(ws) {
  return ws === 'demo' ? 'Mô phỏng' : 'Dữ liệu thật';
}

function appUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://aisc-2026.vercel.app').replace(/\/+$/, '');
}

function toListEntry(it, idx) {
  const isAlert = String(it.key || '').startsWith('alert|');
  const id = String(it.key || '').replace(/^(?:alert|inbox)\|/, '');
  return {
    n: idx + 1,
    kind: isAlert ? 'alert' : 'inbox',
    id,
    title: it.title,
    why: it.why || '',
    severity: it.severity,
    to: it.to || (isAlert ? '/risk' : '/dashboard')
  };
}

/** Phép cập nhật khi sự cố đã hết: đặt resolvedAt, xóa notified cũ và tăng chu kỳ */
function resolveUpdate(now = new Date()) {
  return {
    $set: { resolvedAt: now, notified: [] },
    $inc: { cycle: 1 }
  };
}

async function runTickInner({ authDb, workspaces, now = new Date() }) {
  const t0 = Date.now();
  const meta = authDb.collection('meta');
  await meta.updateOne({ _id: STATE_ID }, { $setOnInsert: { running: false } }, { upsert: true });

  const lock = await meta.findOneAndUpdate(
    {
      _id: STATE_ID,
      $or: [
        { running: { $ne: true } },
        { lockedAt: { $lt: new Date(now.getTime() - LOCK_TTL_MS) } }
      ]
    },
    { $set: { running: true, lockedAt: now } },
    { returnDocument: 'after' }
  );
  if (!lock) return { skipped: true, reason: 'locked' };

  let lastError = null;
  let totalOpen = 0;

  try {
    const links = await authDb
      .collection('butler_links')
      .find({ chatId: { $type: 'string' } })
      .toArray();

    if (links.length === 0) {
      await meta.updateOne(
        { _id: STATE_ID },
        {
          $set: {
            running: false,
            lastRunAt: now,
            lastOkAt: now,
            lastError: null,
            lastMs: Date.now() - t0
          }
        }
      );
      return { skipped: true, reason: 'no_links' };
    }

    const neededWorkspaces = new Set(
      links.map((l) => require('../tenants').keyFor(l.userId, l.settings?.workspace === 'demo' ? 'demo' : 'real'))
    );

    const openByWs = {};
    const summaryByWs = {};
    const schedulesByWs = {};
    const incCol = authDb.collection('butler_incidents');

    const ctxByWs = {};
    // Giá trị 30 ngày cho bản tin sáng: chỉ tính khi tới giờ gửi, mỗi kho một lần mỗi nhịp
    const valueMemo = {};
    const tasksMemo = {};
    const tasksFor = (ws) => {
      if (!ctxByWs[ws]) return Promise.resolve([]);
      if (!tasksMemo[ws]) tasksMemo[ws] = require('./engine').buildTaskItems(ctxByWs[ws].db, ws, ctxByWs[ws].ctx).catch(() => []);
      return tasksMemo[ws];
    };
    const valueFor = (ws) => {
      if (!ctxByWs[ws]) return Promise.resolve(null);
      if (!valueMemo[ws]) valueMemo[ws] = require('../value_summary').valueForContext(ctxByWs[ws].db, ctxByWs[ws].ctx).catch(() => null);
      return valueMemo[ws];
    };
    for (const ws of neededWorkspaces) {
      const db = workspaces[ws];
      if (!db) continue;
      try {
        const ctx = await withTimeout(getContext(db), 60000, `Nạp ngữ cảnh kho ${ws}`);
        summaryByWs[ws] = summarizeContext(ctx);
        ctxByWs[ws] = { db, ctx };
        const colStat = ws === 'real' ? await collectorStatus(db).catch(() => null) : null;
        const [list, todayScheds] = await Promise.all([
          collectIncidents(db, ws, ctx, { collectorStatus: colStat }),
          db
            .collection('live_schedule')
            .find({
              status: 'scheduled',
              startAt: {
                $gte: new Date(now.getTime() - 24 * 3600 * 1000),
                $lte: new Date(now.getTime() + 24 * 3600 * 1000)
              }
            })
            .sort({ startAt: 1 })
            .limit(10)
            .toArray()
            .catch(() => [])
        ]);
        schedulesByWs[ws] = todayScheds;

        if (list.length > 0) {
          const ops = list.map((item) => ({
            updateOne: {
              filter: { _id: `${ws}|${item.key}` },
              update: {
                $set: {
                  workspace: ws,
                  key: item.key,
                  kind: item.kind,
                  severity: item.severity,
                  title: item.title,
                  why: item.why || '',
                  to: item.to || '/dashboard',
                  lastSeenAt: now,
                  resolvedAt: null
                },
                $setOnInsert: {
                  firstSeenAt: now,
                  notified: []
                }
              },
              upsert: true
            }
          }));
          await incCol.bulkWrite(ops, { ordered: false });
        }

        if (list.partial !== true) {
          const activeIds = list.map((item) => `${ws}|${item.key}`);
          await incCol.updateMany(
            {
              workspace: ws,
              resolvedAt: null,
              ...(activeIds.length ? { _id: { $nin: activeIds } } : {})
            },
            resolveUpdate(now)
          );
        }

        const openDocs = await incCol
          .find({ workspace: ws, resolvedAt: null })
          .toArray();
        openDocs.sort((a, b) => (SEV_RANK[b.severity] || 1) - (SEV_RANK[a.severity] || 1));
        openByWs[ws] = openDocs;
        totalOpen += openDocs.length;
      } catch (wsErr) {
        lastError = wsErr.message;
        console.warn(`[QUẢN GIA] Lỗi canh kho ${ws}:`, wsErr.message);
      }
    }

    const baseAppUrl = appUrl();
    const { hour: vnHour, ymd: vnYmd } = vnParts(now);

    for (const link of links) {
      const ws = require('../tenants').keyFor(link.userId, link.settings?.workspace === 'demo' ? 'demo' : 'real');
      const open = openByWs[ws];
      if (!open) continue;

      const wsLabel = workspaceLabel(ws);
      const isMuted = Boolean(
        link.settings?.muteUntil && new Date(link.settings.muteUntil).getTime() > now.getTime()
      );
      const started = Boolean(link.watchStarted && link.watchStarted[ws]);

      if (!started) {
        // Lần đầu tiên canh kho này cho người dùng: không bắn dồn từng sự cố cũ
        const listItems = open.slice(0, 8).map(toListEntry);
        await authDb.collection('butler_links').updateOne(
          { _id: link._id },
          {
            $set: {
              [`watchStarted.${ws}`]: now,
              lastList: { workspace: ws, at: now, items: listItems },
              updatedAt: now
            }
          }
        );

        if (open.length > 0) {
          const markOps = open.map((inc) => ({
            updateOne: {
              filter: { _id: inc._id },
              update: {
                $push: {
                  notified: { userId: link.userId, severity: inc.severity, at: now }
                }
              }
            }
          }));
          await incCol.bulkWrite(markOps, { ordered: false });
        }

        if (!isMuted) {
          const text = `Quản gia đã bắt đầu canh kho ${wsLabel}. Đang có ${open.length.toLocaleString('vi-VN')} việc chờ, nhắn "việc" để xem.`;
          await outbox.enqueue(authDb, {
            dedupKey: `watch_start|${link.userId}|${ws}`,
            userId: link.userId,
            chatId: link.chatId,
            kind: 'alert',
            text
          });
        }
        continue;
      }

      const pick = open
        .filter((inc) => shouldNotify(inc, link, now))
        .sort((a, b) => (SEV_RANK[b.severity] || 1) - (SEV_RANK[a.severity] || 1));

      if (pick.length > 0) {
        const text = buildAlertMessage(pick, { workspaceLabel: wsLabel, appUrl: baseAppUrl });
        const listItems = pick.slice(0, 8).map(toListEntry);
        await authDb.collection('butler_links').updateOne(
          { _id: link._id },
          {
            $set: {
              lastList: { workspace: ws, at: now, items: listItems },
              updatedAt: now
            }
          }
        );

        const sig = crypto
          .createHash('sha1')
          .update(pick.map((i) => `${i._id}:${i.severity}:${i.cycle || 0}`).sort().join(','))
          .digest('hex');

        await outbox.enqueue(authDb, {
          dedupKey: `alert|${link.userId}|${sig}`,
          userId: link.userId,
          chatId: link.chatId,
          kind: 'alert',
          text
        });

        const notifyOps = pick.map((inc) => ({
          updateOne: {
            filter: { _id: inc._id },
            update: {
              $push: {
                notified: { userId: link.userId, severity: inc.severity, at: now }
              }
            }
          }
        }));
        await incCol.bulkWrite(notifyOps, { ordered: false });
      }

      // Bản tin sáng
      const digestEnabled = link.settings?.digest !== false;
      const digestHour = Number.isInteger(link.settings?.digestHour) ? link.settings.digestHour : 8;
      if (digestEnabled && vnHour >= digestHour && link.lastDigestOn !== vnYmd && !isMuted) {
        // Bản tin là danh sách việc đánh số: lưu như lệnh "việc" để "duyệt 1" chạy ngay
        const tasks = await tasksFor(ws);
        if (tasks.length) await store.saveLastList(authDb, link.userId, { workspace: ws, at: now, items: tasks }).catch(() => {});
        const digestText = buildDigest({
          workspaceLabel: wsLabel,
          ctxSummary: { ...(summaryByWs[ws] || {}), value: await valueFor(ws) },
          tasks,
          incidents: open,
          todaySchedules: schedulesByWs[ws] || [],
          appUrl: baseAppUrl,
          now
        });
        await outbox.enqueue(authDb, {
          dedupKey: `digest|${link.userId}|${vnYmd}`,
          userId: link.userId,
          chatId: link.chatId,
          kind: 'digest',
          text: digestText
        });
        await authDb.collection('butler_links').updateOne(
          { _id: link._id },
          { $set: { lastDigestOn: vnYmd, updatedAt: now } }
        );
      }
    }

    await meta.updateOne(
      { _id: STATE_ID },
      {
        $set: {
          running: false,
          lastRunAt: now,
          ...(lastError ? {} : { lastOkAt: now }),
          lastError,
          lastMs: Date.now() - t0,
          lastIncidents: totalOpen
        }
      }
    );
    return { skipped: false, incidents: totalOpen, lastError };
  } catch (err) {
    await meta
      .updateOne(
        { _id: STATE_ID },
        {
          $set: {
            running: false,
            lastRunAt: now,
            lastError: err.message,
            lastMs: Date.now() - t0
          }
        }
      )
      .catch(() => {});
    return { skipped: false, error: err.message };
  }
}

/** Một nhịp canh bọc giới hạn thời gian 120 giây, không ném lỗi ra ngoài */
async function tick(args) {
  try {
    return await withTimeout(runTickInner(args), 120000, 'Nhịp canh quản gia');
  } catch (e) {
    console.warn('[QUẢN GIA] Nhịp canh quá hạn hoặc lỗi:', e.message);
    if (args?.authDb) {
      await args.authDb
        .collection('meta')
        .updateOne({ _id: STATE_ID }, { $set: { running: false, lastError: e.message } })
        .catch(() => {});
    }
    return { error: e.message };
  }
}

/** Đọc trạng thái vòng canh cho giao diện (ẩn trường khóa nội bộ) */
async function watchStatus(authDb) {
  const m = (await authDb.collection('meta').findOne({ _id: STATE_ID })) || {};
  const minutesRaw = Number(process.env.BUTLER_WATCH_MINUTES);
  const everyMinutes = Number.isFinite(minutesRaw) ? Math.min(60, Math.max(1, Math.trunc(minutesRaw))) : 5;
  return {
    everyMinutes,
    lastRunAt: m.lastRunAt || null,
    lastOkAt: m.lastOkAt || null,
    lastError: m.lastError || null,
    lastMs: m.lastMs ?? null,
    lastIncidents: m.lastIncidents ?? 0
  };
}

/** Bật bộ hẹn giờ canh định kỳ */
function startWatcher({ authDb, workspaces }) {
  const minutesRaw = Number(process.env.BUTLER_WATCH_MINUTES);
  const everyMinutes = Number.isFinite(minutesRaw) ? Math.min(60, Math.max(1, Math.trunc(minutesRaw))) : 5;
  const firstDelayRaw = Number(process.env.BUTLER_WATCH_FIRST_DELAY_SEC);
  const firstDelaySec = Number.isFinite(firstDelayRaw) && firstDelayRaw >= 1 ? firstDelayRaw : 180;

  const firstTimer = setTimeout(() => {
    tick({ authDb, workspaces });
  }, firstDelaySec * 1000);
  if (firstTimer.unref) firstTimer.unref();

  const intervalTimer = setInterval(() => {
    tick({ authDb, workspaces });
  }, everyMinutes * 60 * 1000);
  if (intervalTimer.unref) intervalTimer.unref();

  return () => {
    clearTimeout(firstTimer);
    clearInterval(intervalTimer);
  };
}

module.exports = {
  tick,
  watchStatus,
  startWatcher,
  resolveUpdate
};
