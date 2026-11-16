/**
 * KIỂM THỬ TẢI VÀ ĐỘ BỀN QUẢN GIA (butler_load.js)
 * ==================================================================
 * Đo 4 mục trong phần 8.4 của kế hoạch:
 *   1. 300 tin /_say từ 30 chat trong 5 giây + thăm dò /health và /api/nav/status mỗi 200 ms.
 *   2. Chế độ webhook: 200 POST song song có secret đúng (p95 < 50 ms), 20 POST sai secret (403),
 *      vượt 120 lượt/phút/IP (429).
 *   3. Độ tăng bộ nhớ RSS của máy chủ trước và sau tải (< 30 MB).
 *   4. Công tắc khẩn cấp BUTLER=0: tắt phần nền, /api/butler/status trả enabled: false, web bình thường.
 */

const { spawn } = require('child_process');
const httpModule = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const { MongoClient } = require('mongodb');
const { createMockZaloApp } = require('./mock_zalo');

const http = axios.create({
  proxy: false,
  timeout: 20000,
  httpAgent: new httpModule.Agent({ keepAlive: true, maxSockets: 256 }),
  validateStatus: () => true
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

async function startServerInstance(port, extraEnv = {}) {
  const backendDir = path.join(__dirname, '..');
  let logs = '';
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      MONGODB_DB: 'customer_radar_ui_test',
      MONGODB_REAL_DB: 'customer_radar_ui_test_real',
      AUTO_COLLECT: '0',
      BUTLER_FAST_RETRY: '1',
      PORT: String(port),
      PUBLIC_APP_URL: 'http://localhost:5199',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => { logs += d.toString(); });
  proc.stderr.on('data', (d) => { logs += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    try {
      const h = await http.get(`${baseUrl}/health`, { timeout: 2000 });
      if (h.status === 200 && logs.includes('Quản gia:')) {
        ready = true;
        break;
      }
    } catch {
      // chờ khởi động
    }
    await sleep(300);
  }
  if (!ready) {
    proc.kill();
    throw new Error(`Không khởi động được máy chủ ở cổng ${port}:\n${logs}`);
  }
  return {
    baseUrl,
    getLogs: () => logs,
    stop: async () => {
      proc.kill();
      await sleep(400);
    }
  };
}

async function main() {
  const mockPort = 5056;
  const mockUrl = `http://127.0.0.1:${mockPort}`;
  const mockServer = await new Promise((resolve) => {
    const s = createMockZaloApp().listen(mockPort, '127.0.0.1', () => resolve(s));
  });

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const demoDbName = 'customer_radar_ui_test';
  const authDb = client.db(`${demoDbName}_auth`);
  const writeKey = process.env.WRITE_KEY || '';

  const createdChatIds = [];

  try {
    // ==================================================================
    // MỤC 1 & 3: 300 TIN TỪ 30 CHAT TRONG 5 GIÂY + ĐO /health, /nav/status, RSS
    // ==================================================================
    const pollSrv = await startServerInstance(5052, {
      ZALO_API_BASE: mockUrl,
      ZALO_BOT_TOKEN: '123456:testtokenabcdef',
      ZALO_MODE: 'poll',
      BUTLER_WATCH_MINUTES: '60',
      BUTLER_WATCH_FIRST_DELAY_SEC: '3600'
    });

    try {
      const login = await http.post(`${pollSrv.baseUrl}/api/auth/login`, {
        email: 'demo@customerradar.vn',
        password: 'demo2026'
      });
      if (login.status !== 200 || !login.data?.token) {
        throw new Error('Không đăng nhập được tài khoản mẫu');
      }
      const token = login.data.token;
      const authHeaders = {
        Authorization: `Bearer ${token}`,
        ...(writeKey ? { 'X-Write-Key': writeKey } : {}),
        'X-Workspace': 'demo'
      };

      // Làm nóng ngữ cảnh trước khi bấm giờ tải
      for (let w = 0; w < 40; w += 1) {
        if (pollSrv.getLogs().includes('Đã nạp sẵn ngữ cảnh kho real')) break;
        await sleep(300);
      }
      await http.get(`${pollSrv.baseUrl}/api/nav/status`, { headers: authHeaders });
      await http.get(`${pollSrv.baseUrl}/health`);

      const statusBefore = await http.get(`${pollSrv.baseUrl}/api/butler/status`, { headers: authHeaders });
      const rssBefore = statusBefore.data?.rssMb ?? 0;

      // Phân phối 300 tin trên 30 chat:
      // - 5 chat đầu gửi 25 tin mỗi chat (vượt ngưỡng 20/phút -> 20 trả lời + 1 câu "Nhắn chậm lại")
      // - 25 chat tiếp theo gửi 7 tin mỗi chat (nằm trong ngưỡng 20/phút -> 7 trả lời)
      // Tổng: 5 * 25 + 25 * 7 = 125 + 175 = 300 tin trên 30 chat.
      const chatPlan = [];
      for (let c = 1; c <= 30; c += 1) {
        const cid = `load_chat_${c}_${Date.now()}`;
        createdChatIds.push(cid);
        const count = c <= 5 ? 25 : 7;
        chatPlan.push({ chatId: cid, count });
      }

      const allMessages = [];
      const maxLen = 25;
      for (let i = 0; i < maxLen; i += 1) {
        for (const p of chatPlan) {
          if (i < p.count) {
            allMessages.push({
              chat_id: p.chatId,
              text: 'xin chào',
              message_id: `load_${p.chatId}_${i + 1}`
            });
          }
        }
      }

      let probeRunning = true;
      const healthTimes = [];
      const navTimes = [];
      let status5xx = 0;

      const probeLoop = (async () => {
        while (probeRunning) {
          const t0 = performance.now();
          const [hRes, nRes] = await Promise.all([
            http.get(`${pollSrv.baseUrl}/health`).then((r) => ({ r, ms: performance.now() - t0 })),
            http.get(`${pollSrv.baseUrl}/api/nav/status`, { headers: authHeaders }).then((r) => ({ r, ms: performance.now() - t0 }))
          ]);
          healthTimes.push(hRes.ms);
          navTimes.push(nRes.ms);
          if (hRes.r.status >= 500 || nRes.r.status >= 500) status5xx += 1;
          await sleep(200);
        }
      })();

      await http.post(`${mockUrl}/_reset`);
      const sendStart = Date.now();
      // Gửi 300 tin rải trong khoảng ~4,5 giây (mỗi lô 6 tin cách nhau 90 ms)
      for (let i = 0; i < allMessages.length; i += 6) {
        const batch = allMessages.slice(i, i + 6);
        await Promise.all(batch.map((m) => http.post(`${mockUrl}/_say`, m)));
        await sleep(85);
      }
      const sendDurationMs = Date.now() - sendStart;

      // Chờ toàn bộ tin trả lời hợp lệ đi ra mock_zalo (5 * 21 + 25 * 7 = 280 tin)
      const expectedTotalReplies = chatPlan.reduce((s, p) => s + (p.count > 20 ? 21 : p.count), 0);
      const waitT0 = Date.now();
      let sentList = [];
      while (Date.now() - waitT0 < 90000) {
        const r = await http.get(`${mockUrl}/_sent`);
        sentList = r.data?.sent || [];
        if (sentList.length >= expectedTotalReplies) break;
        await sleep(300);
      }
      await sleep(800);
      sentList = (await http.get(`${mockUrl}/_sent`)).data?.sent || [];

      probeRunning = false;
      await probeLoop;

      const maxHealthMs = Number(Math.max(...healthTimes, 0).toFixed(2));
      const p95HealthMs = percentile(healthTimes, 95);
      const p95NavMs = percentile(navTimes, 95);

      let perChatOk = true;
      let perChatErr = '';
      for (const p of chatPlan) {
        const msgs = sentList.filter((m) => m.chat_id === p.chatId);
        const slowWarnings = msgs.filter((m) => m.text.includes('Nhắn chậm lại'));
        const normalReplies = msgs.filter((m) => !m.text.includes('Nhắn chậm lại'));
        const expectedNormal = Math.min(p.count, 20);
        const expectedSlow = p.count > 20 ? 1 : 0;
        if (normalReplies.length !== expectedNormal || slowWarnings.length !== expectedSlow) {
          perChatOk = false;
          perChatErr = `chat=${p.chatId} gửi=${p.count} nhận thường=${normalReplies.length}/${expectedNormal} nhắc chậm=${slowWarnings.length}/${expectedSlow}`;
          break;
        }
      }

      const statusAfter = await http.get(`${pollSrv.baseUrl}/api/butler/status`, { headers: authHeaders });
      const rssAfter = statusAfter.data?.rssMb ?? 0;
      const rssDelta = Number((rssAfter - rssBefore).toFixed(2));

      if (status5xx > 0 || maxHealthMs >= 500 || !perChatOk) {
        throw new Error(
          `Mục 1 không đạt: 5xx=${status5xx}, maxHealthMs=${maxHealthMs}, perChatOk=${perChatOk} (${perChatErr})`
        );
      }
      console.log(
        `ĐẠT [Mục 1 - Tải 300 tin / 30 chat] gửi trong ${sendDurationMs} ms, tổng tin trả lời=${sentList.length}/${expectedTotalReplies}, 5xx=0, /health p95=${p95HealthMs} ms (max=${maxHealthMs} ms < 500 ms), /nav/status p95=${p95NavMs} ms`
      );

      if (rssDelta >= 30) {
        throw new Error(`Mục 3 không đạt: RSS tăng ${rssDelta} MB (>= 30 MB)`);
      }
      console.log(
        `ĐẠT [Mục 3 - Bộ nhớ RSS] trước=${rssBefore} MB, sau=${rssAfter} MB, chênh lệch=${rssDelta >= 0 ? '+' : ''}${rssDelta} MB (< 30 MB)`
      );
    } finally {
      await pollSrv.stop();
    }

    // ==================================================================
    // MỤC 2: CHẾ ĐỘ WEBHOOK (200 POST song song < 50ms p95, 20 sai secret -> 403, >120/IP -> 429)
    // ==================================================================
    const secret32 = '0123456789abcdef0123456789abcdef';
    const webhookSrv = await startServerInstance(5053, {
      ZALO_API_BASE: mockUrl,
      ZALO_BOT_TOKEN: '123456:testtokenabcdef',
      ZALO_MODE: 'webhook',
      ZALO_WEBHOOK_SECRET: secret32,
      BUTLER_WATCH_MINUTES: '60',
      BUTLER_WATCH_FIRST_DELAY_SEC: '3600'
    });

    try {
      // Chờ máy chủ nạp xong ngữ cảnh nền lúc khởi động và làm ấm nhóm kết nối
      for (let w = 0; w < 40; w += 1) {
        if (webhookSrv.getLogs().includes('Đã nạp sẵn ngữ cảnh kho real')) break;
        await sleep(300);
      }

      const whAgent = new httpModule.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 256 });
      const fastWebhookPost = (port, payloadStr, headers) =>
        new Promise((resolve, reject) => {
          let tSent = performance.now();
          const req = httpModule.request(
            {
              hostname: '127.0.0.1',
              port,
              path: '/api/butler/zalo/webhook',
              method: 'POST',
              agent: whAgent,
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadStr),
                ...headers
              }
            },
            (res) => {
              res.resume();
              res.on('end', () => {
                resolve({ status: res.statusCode, ms: performance.now() - tSent });
              });
            }
          );
          req.on('error', reject);
          req.on('finish', () => {
            tSent = performance.now();
          });
          req.end(payloadStr);
        });

      // Làm ấm kết nối TCP keep-alive trước khi đo 200 request song song
      const warmPayload = JSON.stringify({ ok: true, result: null });
      await Promise.all(
        Array.from({ length: 20 }, (_, k) =>
          fastWebhookPost(5053, warmPayload, {
            'X-Bot-Api-Secret-Token': secret32,
            'X-Forwarded-For': `10.99.0.${k + 1}`
          })
        )
      );

      // 200 POST song song có secret đúng (20 luồng song song x 10 request, chia 5 IP)
      const payloads200 = Array.from({ length: 200 }, (_, idx) =>
        JSON.stringify({
          ok: true,
          result: {
            event_name: 'message.text.received',
            message: {
              message_id: `wh_par_${idx}_${Date.now()}`,
              date: Date.now(),
              text: 'xin chào',
              from: { id: `wh_u_${idx}`, display_name: 'Test' },
              chat: { id: `wh_c_${idx % 20}` }
            }
          }
        })
      );

      const parallel200 = new Array(200);
      let nextIdx = 0;
      await Promise.all(
        Array.from({ length: 20 }, async () => {
          while (nextIdx < 200) {
            const idx = nextIdx;
            nextIdx += 1;
            parallel200[idx] = await fastWebhookPost(5053, payloads200[idx], {
              'X-Bot-Api-Secret-Token': secret32,
              'X-Forwarded-For': `10.10.0.${(idx % 5) + 1}`
            });
          }
        })
      );
      whAgent.destroy();

      const ok200Count = parallel200.filter((x) => x.status === 200).length;
      const whP95 = percentile(parallel200.map((x) => x.ms), 95);
      const whMax = Number(Math.max(...parallel200.map((x) => x.ms)).toFixed(2));

      // 20 POST sai secret -> 403
      const wrong20 = await Promise.all(
        Array.from({ length: 20 }, (_, idx) =>
          http.post(
            `${webhookSrv.baseUrl}/api/butler/zalo/webhook`,
            { ok: true, result: null },
            {
              headers: {
                'X-Bot-Api-Secret-Token': `wrong-secret-${idx}`,
                'X-Forwarded-For': '10.20.0.1'
              }
            }
          )
        )
      );
      const all403 = wrong20.every((r) => r.status === 403);

      // Quá 120/phút/IP -> 429 (bắn 130 POST từ cùng một IP 10.30.0.1)
      const burstStatuses = [];
      for (let i = 0; i < 130; i += 1) {
        const r = await http.post(
          `${webhookSrv.baseUrl}/api/butler/zalo/webhook`,
          { ok: true, result: null },
          {
            headers: {
              'X-Bot-Api-Secret-Token': secret32,
              'X-Forwarded-For': '10.30.0.1'
            }
          }
        );
        burstStatuses.push(r.status);
      }
      const first120Ok = burstStatuses.slice(0, 120).every((s) => s === 200);
      const over120is429 = burstStatuses.slice(120).every((s) => s === 429);

      if (ok200Count !== 200 || whP95 >= 50 || !all403 || !first120Ok || !over120is429) {
        throw new Error(
          `Mục 2 không đạt: ok200=${ok200Count}/200, p95=${whP95}ms, all403=${all403}, first120Ok=${first120Ok}, over120is429=${over120is429}`
        );
      }
      console.log(
        `ĐẠT [Mục 2 - Webhook] 200 POST song song đạt 200/200 (p95=${whP95} ms < 50 ms, max=${whMax} ms); 20 POST sai secret trả 403; vượt 120 lượt/phút/IP trả 429`
      );
    } finally {
      await webhookSrv.stop();
    }

    // ==================================================================
    // MỤC 4: BUTLER=0 TẮT TOÀN BỘ PHẦN NỀN, WEB CHẠY BÌNH THƯỜNG
    // ==================================================================
    const offSrv = await startServerInstance(5054, {
      BUTLER: '0',
      ZALO_API_BASE: mockUrl,
      ZALO_BOT_TOKEN: '123456:testtokenabcdef',
      ZALO_MODE: 'poll'
    });

    try {
      const login = await http.post(`${offSrv.baseUrl}/api/auth/login`, {
        email: 'demo@customerradar.vn',
        password: 'demo2026'
      });
      const token = login.data.token;
      const authHeaders = { Authorization: `Bearer ${token}`, 'X-Workspace': 'demo' };

      const [stRes, navRes] = await Promise.all([
        http.get(`${offSrv.baseUrl}/api/butler/status`, { headers: authHeaders }),
        http.get(`${offSrv.baseUrl}/api/nav/status`, { headers: authHeaders })
      ]);
      const logs = offSrv.getLogs();

      if (
        stRes.status !== 200 ||
        stRes.data?.enabled !== false ||
        navRes.status !== 200 ||
        !logs.includes('Quản gia: TẮT (BUTLER=0).')
      ) {
        throw new Error(
          `Mục 4 không đạt: status=${stRes.status}, enabled=${stRes.data?.enabled}, nav=${navRes.status}`
        );
      }
      console.log(
        'ĐẠT [Mục 4 - BUTLER=0] không chạy poll hay vòng canh, /api/butler/status trả enabled=false, /api/nav/status trả 200'
      );
    } finally {
      await offSrv.stop();
    }
  } finally {
    if (authDb.databaseName.includes('_test')) {
      await Promise.allSettled([
        authDb.collection('butler_outbox').deleteMany({
          $or: [
            { chatId: { $in: createdChatIds } },
            { chatId: { $regex: /^wh_c_/ } }
          ]
        }),
        authDb.collection('butler_inbound').deleteMany({
          _id: { $regex: /^(load_|wh_par_)/ }
        })
      ]);
    }
    await client.close();
    await new Promise((r) => mockServer.close(r));
  }
}

main().catch((e) => {
  console.error('LỖI KIỂM THỬ TẢI:', e.message);
  process.exit(1);
});
