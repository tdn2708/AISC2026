/**
 * LÕI XỬ LÝ LỆNH VÀ CÂU HỎI CỦA QUẢN GIA (engine)
 * ==================================================================
 * Dùng chung cho cả trang /butler trên web và tin nhắn Zalo:
 *   - Đọc cùng ngữ cảnh phân tích và danh sách cảnh báo/hộp việc.
 *   - Lệnh ghi (duyệt, bỏ qua, thu thập) luôn qua bước xác nhận 5 phút.
 *   - Câu hỏi tự do gọi chat_engine và giới hạn 20 câu mỗi giờ mỗi người.
 */

const { getContext } = require('../analysis_context');
const { pendingAlerts, buildInboxItems, recordDecision } = require('../work_items');
const realCollector = require('../real_collector');
const { withTimeout } = realCollector;
const chatEngine = require('../chat_engine');
const { liveBriefing } = require('../live/brief');
const { plain, severityWord, fromAlertSeverity, viDate, viTime, stripTitlePrefix } = require('./text');
const { parseCommand } = require('./commands');
const { SEV_RANK, collectIncidents, summarizeContext, buildDigest } = require('./incidents');
const { buildScheduleListText } = require('./live_watch');
const store = require('./store');

const HELP_TEXT = [
  'Lệnh quản gia hiểu:',
  'việc: xem việc đang chờ, có số thứ tự',
  'xem 2: xem kế hoạch của việc số 2',
  'duyệt 2: chấp nhận kế hoạch việc số 2 (hỏi lại trước khi ghi)',
  'bỏ qua 2 vì <lý do>: bỏ qua việc số 2',
  'tình hình: tóm tắt số liệu',
  'live: tình hình livestream',
  'lịch: xem các phiên live đã hẹn',
  'thu thập: lấy đánh giá mới (kho Dữ liệu thật)',
  'im 2 giờ, bật báo: tạm im hoặc bật lại báo',
  'kho thật, kho mô phỏng: đổi kho quản gia canh (trên Zalo)',
  'Câu khác được hiểu là câu hỏi về dữ liệu, ví dụ: khách chê gì nhiều nhất tuần này?'
].join('\n');

const questionBuckets = new Map();
const QUESTION_LIMIT_PER_HOUR = 20;

function allowQuestion(userId) {
  const key = String(userId || 'anon');
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const list = (questionBuckets.get(key) || []).filter((t) => t > hourAgo);
  if (list.length >= QUESTION_LIMIT_PER_HOUR) {
    questionBuckets.set(key, list);
    return false;
  }
  list.push(now);
  if (questionBuckets.size > 2000) questionBuckets.clear();
  questionBuckets.set(key, list);
  return true;
}

function workspaceLabel(ws) {
  return ws === 'demo' ? 'Mô phỏng' : 'Dữ liệu thật';
}

function appUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://aisc-2026.vercel.app').replace(/\/+$/, '');
}

function validLastList(link) {
  if (!link?.lastList?.items?.length || !link.lastList.at) return null;
  const ageMs = Date.now() - new Date(link.lastList.at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 24 * 3600 * 1000) return null;
  return link.lastList;
}


const vndWords = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} tỉ đ` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu đ` : `${Math.round(n / 1000).toLocaleString('vi-VN')} nghìn đ`);

/**
 * Danh sách việc đánh số, dùng chung cho lệnh "việc" và bản tin sáng (để "duyệt 1"
 * sau bản tin trỏ đúng việc). Cảnh báo chờ quyết định trước, rồi việc trong hộp
 * việc; cảnh báo kèm doanh thu rủi ro khi tính được (evidence_profile).
 */
async function buildTaskItems(db, ws, ctx) {
  const alerts = (await pendingAlerts(db, ctx)).slice(0, 5);
  const inboxRaw = await buildInboxItems(db, ws, ctx);
  const inboxSorted = [...inboxRaw].sort((a, b) => (SEV_RANK[b.severity] || 1) - (SEV_RANK[a.severity] || 1));
  let riskById = new Map();
  try {
    const { detectAlertsCached, buildRecommendationsCached } = require('../work_items');
    const decisions = await db.collection('recommendation_log').find({}).toArray();
    const built = buildRecommendationsCached(ctx, {}, {}, detectAlertsCached(ctx, {}), decisions);
    riskById = new Map(built.recommendations.map((r) => {
      const rev = r.dataProfile?.revenue;
      return [r.alertId, rev?.measurable ? (rev.extrapolatedVnd || rev.atRiskVnd || 0) : 0];
    }));
  } catch {
    // thiếu doanh thu thì danh sách vẫn đủ việc
  }

  const combined = [];
  for (const a of alerts) {
    const title = a.title + (a.productName ? ` trên ${a.productName}` : '');
    combined.push({
      kind: 'alert',
      id: a.id,
      severity: fromAlertSeverity(a.severity),
      title,
      why: stripTitlePrefix(title, a.summary || ''),
      riskVnd: riskById.get(a.id) || null,
      to: '/risk'
    });
  }
  for (const it of inboxSorted) {
    if (combined.length >= 8) break;
    combined.push({
      kind: 'inbox',
      id: it.id,
      severity: it.severity || 'medium',
      title: it.title,
      why: stripTitlePrefix(it.title, it.why || ''),
      to: it.actions?.[0]?.to || '/dashboard'
    });
  }
  return combined.slice(0, 8).map((it, idx) => ({ ...it, n: idx + 1 }));
}

async function handle({ authDb, workspaces, user, link: initialLink, text, channel = 'web', workspace }) {
  const cmd = parseCommand(text);
  const link = initialLink || (await store.getLink(authDb, user._id));
  const ws = (workspace || link?.settings?.workspace) === 'demo' ? 'demo' : 'real';
  const db = workspaces[ws] || workspaces.real || workspaces.demo;
  const wsLabel = workspaceLabel(ws);
  const baseAppUrl = appUrl();

  try {
    switch (cmd.type) {
      case 'help': {
        return { text: HELP_TEXT, kind: 'help' };
      }

      case 'tasks': {
        const ctx = await withTimeout(getContext(db), 20000, 'Tính số liệu');
        if (!Array.isArray(ctx.items) || ctx.items.length === 0) {
          return {
            text: `Kho ${wsLabel} chưa có phản hồi nào nên chưa có gì để canh.`,
            kind: 'tasks',
            cards: []
          };
        }

        const items = await buildTaskItems(db, ws, ctx);
        await store.saveLastList(authDb, user._id, {
          workspace: ws,
          at: new Date(),
          items
        });

        if (items.length === 0) {
          const calcAt = ctx.computedAt ? new Date(ctx.computedAt) : new Date();
          return {
            text: `Không có việc nào đang chờ ở kho ${wsLabel}. Số liệu tính lúc ${viTime(calcAt)}.`,
            kind: 'tasks',
            cards: []
          };
        }

        const lines = [
          `Việc đang chờ ở kho ${wsLabel}, ${items.length.toLocaleString('vi-VN')} việc:`,
          ...items.map((it) => `${it.n}. [${severityWord(it.severity)}] ${it.title}${it.riskVnd ? `, rủi ro ${vndWords(it.riskVnd)}` : ''}`),
          'Nhắn "xem <số>" để xem kế hoạch, "duyệt <số>" để chấp nhận.'
        ];
        return {
          text: lines.join('\n'),
          kind: 'tasks',
          cards: [{ type: 'tasks', items }]
        };
      }

      case 'detail': {
        const list = validLastList(link);
        if (!list) {
          return { text: 'Nhắn "việc" để lấy danh sách mới trước.', kind: 'info' };
        }
        const item = list.items.find((x) => Number(x.n) === Number(cmd.n));
        if (!item) {
          return {
            text: `Không có việc số ${cmd.n} trong danh sách gần nhất. Nhắn "việc" để xem lại.`,
            kind: 'info'
          };
        }
        const listWs = list.workspace === 'demo' ? 'demo' : 'real';
        const listDb = workspaces[listWs] || db;

        if (item.kind === 'alert') {
          const ctx = await withTimeout(getContext(listDb), 20000, 'Tính số liệu');
          const alerts = await pendingAlerts(listDb, ctx);
          const found = alerts.find((a) => a.id === item.id);
          const steps = (found?.recommendation?.steps || []).slice(0, 4).map(
            (s, idx) => `${idx + 1}. ${s.text}${s.approvalRole ? ` (cần ${s.approvalRole} duyệt)` : ''}`
          );
          const lines = [
            `Việc ${item.n}: [${severityWord(item.severity)}] ${item.title}`,
            stripTitlePrefix(item.title, found?.summary || item.why || ''),
            ...(steps.length ? ['Kế hoạch đề xuất:', ...steps] : []),
            `Nhắn "duyệt ${item.n}" để chấp nhận hoặc "bỏ qua ${item.n} vì <lý do>".`,
            `${baseAppUrl}/risk`
          ].filter(Boolean);
          return { text: lines.join('\n'), kind: 'detail' };
        }

        const to = String(item.to || '/dashboard');
        const url = `${baseAppUrl}${to.startsWith('/') ? to : '/' + to}`;
        const lines = [
          `Việc ${item.n}: [${severityWord(item.severity)}] ${item.title}`,
          stripTitlePrefix(item.title, item.why || ''),
          url
        ].filter(Boolean);
        return { text: lines.join('\n'), kind: 'detail' };
      }

      case 'accept': {
        const list = validLastList(link);
        if (!list) {
          return { text: 'Nhắn "việc" để lấy danh sách mới trước.', kind: 'info' };
        }
        const item = list.items.find((x) => Number(x.n) === Number(cmd.n));
        if (!item) {
          return {
            text: `Không có việc số ${cmd.n} trong danh sách gần nhất. Nhắn "việc" để xem lại.`,
            kind: 'info'
          };
        }
        if (item.kind !== 'alert') {
          const to = String(item.to || '/dashboard');
          const url = `${baseAppUrl}${to.startsWith('/') ? to : '/' + to}`;
          return { text: `Việc này làm trên web: ${url}`, kind: 'info' };
        }

        const listWs = list.workspace === 'demo' ? 'demo' : 'real';
        const listDb = workspaces[listWs] || db;
        const ctx = await withTimeout(getContext(listDb), 20000, 'Tính số liệu');
        const alerts = await pendingAlerts(listDb, ctx);
        const found = alerts.find((a) => a.id === item.id);
        const steps = found?.recommendation?.steps || [];
        const prompt = `Chấp nhận kế hoạch cho "${item.title}"? Nhắn "có" trong 5 phút để ghi, "thôi" để bỏ.`;

        await store.setPending(authDb, user._id, {
          action: 'accept',
          workspace: listWs,
          prompt,
          args: {
            alertId: item.id,
            title: item.title,
            actionIds: steps.map((s) => s.actionId).filter(Boolean),
            scopeKey: found?.recommendation?.scopeKey || null,
            snapshot: {
              title: found?.title || item.title,
              productName: found?.productName || null,
              severity: found?.severity || 'High'
            }
          }
        });

        return {
          text: prompt,
          kind: 'confirm',
          confirm: { prompt, yes: 'Chấp nhận kế hoạch', no: 'Thôi' }
        };
      }

      case 'dismiss': {
        const list = validLastList(link);
        if (!list) {
          return { text: 'Nhắn "việc" để lấy danh sách mới trước.', kind: 'info' };
        }
        const item = list.items.find((x) => Number(x.n) === Number(cmd.n));
        if (!item) {
          return {
            text: `Không có việc số ${cmd.n} trong danh sách gần nhất. Nhắn "việc" để xem lại.`,
            kind: 'info'
          };
        }
        if (item.kind !== 'alert') {
          const to = String(item.to || '/dashboard');
          const url = `${baseAppUrl}${to.startsWith('/') ? to : '/' + to}`;
          return { text: `Việc này làm trên web: ${url}`, kind: 'info' };
        }
        if (!cmd.reason) {
          return {
            text: `Bỏ qua việc số ${cmd.n} cần nêu lý do. Ví dụ: bỏ qua ${cmd.n} vì đã kiểm lại đơn hàng.`,
            kind: 'info'
          };
        }

        const listWs = list.workspace === 'demo' ? 'demo' : 'real';
        const listDb = workspaces[listWs] || db;
        const ctx = await withTimeout(getContext(listDb), 20000, 'Tính số liệu');
        const alerts = await pendingAlerts(listDb, ctx);
        const found = alerts.find((a) => a.id === item.id);
        const steps = found?.recommendation?.steps || [];
        const prompt = `Bỏ qua "${item.title}" với lý do "${cmd.reason}"? Nhắn "có" để ghi.`;

        await store.setPending(authDb, user._id, {
          action: 'dismiss',
          workspace: listWs,
          prompt,
          args: {
            alertId: item.id,
            title: item.title,
            reason: cmd.reason,
            actionIds: steps.map((s) => s.actionId).filter(Boolean),
            scopeKey: found?.recommendation?.scopeKey || null,
            snapshot: {
              title: found?.title || item.title,
              productName: found?.productName || null,
              severity: found?.severity || 'High'
            }
          }
        });

        return {
          text: prompt,
          kind: 'confirm',
          confirm: { prompt, yes: 'Bỏ qua đề xuất', no: 'Thôi' }
        };
      }

      case 'collect': {
        if (ws !== 'real') {
          return { text: 'Kho mô phỏng không thu thập.', kind: 'info' };
        }
        const prompt = 'Chạy một lượt thu thập đánh giá mới? Mất khoảng 10 đến 20 phút. Nhắn "có" để chạy.';
        await store.setPending(authDb, user._id, {
          action: 'collect',
          workspace: 'real',
          prompt,
          args: {}
        });
        return {
          text: prompt,
          kind: 'confirm',
          confirm: { prompt, yes: 'Chạy thu thập', no: 'Thôi' }
        };
      }

      case 'confirm': {
        const pending = await store.takePending(authDb, user._id);
        if (!pending) {
          return { text: 'Không có lệnh nào đang chờ xác nhận.', kind: 'info' };
        }
        const targetDb = workspaces[pending.workspace] || db;

        if (pending.action === 'accept' || pending.action === 'dismiss') {
          const decision = pending.action === 'accept' ? 'ACCEPTED' : 'DISMISSED';
          const r = await recordDecision(targetDb, {
            ...pending.args,
            decision,
            by: user.name || 'Chủ shop',
            via: channel === 'zalo' ? 'zalo' : 'web'
          });
          if (decision === 'ACCEPTED') {
            return {
              text: `Đã ghi: chấp nhận kế hoạch "${pending.args.title}". Hệ thống nhắc theo dõi lại ngày ${viDate(r.followUpAt)}.`,
              kind: 'recorded'
            };
          }
          return {
            text: `Đã ghi: bỏ qua "${pending.args.title}" (lý do: ${pending.args.reason}).`,
            kind: 'recorded'
          };
        }

        if (pending.action === 'collect') {
          const realDb = workspaces.real || db;
          const r = await realCollector.runOnce(realDb, {
            trigger: 'butler',
            minGapMs: realCollector.MANUAL_GAP_MS
          });
          if (!r.started) {
            const st = await realCollector.collectorStatus(realDb);
            return {
              text: st.running
                ? 'Đang có một lượt thu thập chạy.'
                : 'Vừa thu thập xong trong 30 phút qua, thử lại sau.',
              kind: 'info'
            };
          }
          return {
            text: 'Đã ghi: bắt đầu chạy một lượt thu thập đánh giá mới ở nền.',
            kind: 'recorded'
          };
        }

        return { text: 'Không có lệnh nào đang chờ xác nhận.', kind: 'info' };
      }

      case 'cancel': {
        await store.clearPending(authDb, user._id);
        return { text: 'Đã bỏ, không ghi gì.', kind: 'info' };
      }

      case 'status': {
        const now = new Date();
        const ctx = await withTimeout(getContext(db), 20000, 'Tính số liệu');
        const colStat = ws === 'real' ? await realCollector.collectorStatus(db).catch(() => null) : null;
        const [open, todaySchedules] = await Promise.all([
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
        const digest = buildDigest({
          workspaceLabel: wsLabel,
          ctxSummary: summarizeContext(ctx),
          incidents: open,
          todaySchedules,
          appUrl: baseAppUrl,
          now
        });
        return { text: digest, kind: 'status' };
      }

      case 'mute': {
        const until = new Date(Date.now() + cmd.minutes * 60 * 1000);
        await store.updateSettings(authDb, user._id, { muteUntil: until });
        return {
          text: `Tạm im đến ${viTime(until)} ${viDate(until)}. Nhắn "bật báo" để báo lại.`,
          kind: 'settings'
        };
      }

      case 'unmute': {
        await store.updateSettings(authDb, user._id, { muteUntil: null });
        return { text: 'Đã bật báo lại.', kind: 'settings' };
      }

      case 'workspace': {
        if (channel === 'web') {
          return {
            text: 'Trên web, đổi kho ở ô Kho dữ liệu trên thanh bên.',
            kind: 'info'
          };
        }
        await store.updateSettings(authDb, user._id, { workspace: cmd.workspace });
        return {
          text: `Từ giờ quản gia canh và trả lời theo kho ${workspaceLabel(cmd.workspace)}.`,
          kind: 'settings'
        };
      }

      case 'schedule': {
        const now = new Date();
        const rows = await db
          .collection('live_schedule')
          .find({ status: 'scheduled', startAt: { $gte: now } })
          .sort({ startAt: 1 })
          .limit(5)
          .toArray()
          .catch(() => []);
        return {
          text: buildScheduleListText(rows, { workspaceLabel: wsLabel, appUrl: baseAppUrl, now }),
          kind: 'schedule'
        };
      }

      case 'live': {
        const brief = await liveBriefing(db, ws);
        return {
          text: (brief.facts || []).join('\n') || 'Kho này chưa có phiên livestream nào.',
          kind: 'live',
          facts: brief.facts || []
        };
      }

      case 'link_code': {
        if (channel === 'web') {
          return {
            text: 'Mã này dùng để nhắn cho bot trên Zalo.',
            kind: 'info'
          };
        }
        return {
          text: `Zalo này đã nối với tài khoản ${user.name || 'của bạn'}. Nhắn "việc" để xem danh sách việc đang chờ.`,
          kind: 'info'
        };
      }

      case 'unlink': {
        await store.unlink(authDb, user._id);
        return {
          text: `Đã ngắt Zalo khỏi tài khoản ${user.name || 'này'}.`,
          kind: 'unlink'
        };
      }

      case 'question':
      default: {
        if (!allowQuestion(user._id)) {
          return {
            text: 'Bạn đã hỏi quá 20 câu trong một giờ. Các lệnh như "việc", "tình hình", "duyệt" vẫn dùng được bình thường.',
            kind: 'info'
          };
        }

        const baseCtx = await withTimeout(getContext(db), 20000, 'Tính số liệu');
        let ctx = baseCtx;
        if (chatEngine.routeIntent(cmd.text).intent.id === 'live') {
          try {
            ctx = Object.assign(Object.create(baseCtx), {
              live: await liveBriefing(db, ws)
            });
          } catch (e) {
            console.warn('[QUẢN GIA] Không lấy được dữ liệu livestream cho câu hỏi:', e.message);
          }
        }

        const { messages: recent } = await store.recentMessages(authDb, user._id, { limit: 6 });
        const history = recent.map((m) => ({
          role: m.role === 'butler' ? 'assistant' : 'user',
          text: m.text
        }));

        const result = await chatEngine.ask(ctx, cmd.text, history, {});
        if (channel === 'web') {
          return {
            text: result.text,
            kind: 'answer',
            facts: result.facts || [],
            evidence: result.evidence || [],
            meta: result.meta || {}
          };
        }

        const evLines = (result.evidence || [])
          .slice(0, 2)
          .map((ev) => {
            const snippet = String(ev.text || ev.originalText || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 150);
            return snippet ? `- "${snippet}"` : null;
          })
          .filter(Boolean);

        const zaloText = [
          plain(result.text),
          ...(evLines.length ? ['Dẫn chứng:', ...evLines] : []),
          `Xem đủ số liệu: ${baseAppUrl}/butler`
        ].join('\n');

        return {
          text: zaloText,
          kind: 'answer',
          facts: result.facts || [],
          evidence: result.evidence || [],
          meta: result.meta || {}
        };
      }
    }
  } catch (e) {
    if (/quá \d+ giây/i.test(String(e?.message || ''))) {
      return {
        text: 'Số liệu đang được tính lại, thử lại sau một phút.',
        kind: 'error'
      };
    }
    console.error('[QUẢN GIA]', cmd.type, e.message);
    return {
      text: 'Quản gia gặp lỗi khi làm việc này. Thử lại sau ít phút.',
      kind: 'error'
    };
  }
}

module.exports = {
  HELP_TEXT,
  handle,
  buildTaskItems
};
