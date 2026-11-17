/**
 * ĐO TẢI LIVESTREAM GIỜ CAO ĐIỂM
 * ==================================================================
 * Chạy một máy chủ riêng trên kho _test (không đụng prod), mở một phiên
 * nhập qua webhook như shop nối hệ thống của họ vào, rồi:
 *   1. Nhịp đều: RATE bình luận/giây trong STEADY_SEC giây
 *   2. Dồn dập: BURST_RATE bình luận/giây trong BURST_SEC giây
 *   3. VIEWERS màn hình cùng xem luồng sự kiện (SSE), 2 trang tổng quan hỏi số liệu
 *
 * Đạt khi: không lỗi HTTP, mọi màn hình nhận đủ bình luận, kho lưu đủ,
 * độ trễ hiển thị p95 dưới ngưỡng, máy chủ không khựng, RSS không phình,
 * và phân loại tại chỗ đúng trên bộ câu có đáp án.
 *
 * Chạy: cd backend && node scripts/live_load.js
 * Tham số: RATE=200 BURST_RATE=500 STEADY_SEC=60 BURST_SEC=10 VIEWERS=20
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { MongoClient } = require('mongodb');

const PORT = Number(process.env.LOAD_PORT || 5077);
const RATE = Number(process.env.RATE || 200);
const BURST_RATE = Number(process.env.BURST_RATE || 500);
const STEADY_SEC = Number(process.env.STEADY_SEC || 60);
const BURST_SEC = Number(process.env.BURST_SEC || 10);
const VIEWERS = Number(process.env.VIEWERS || 20);
const TICK_MS = 100;
const DB_NAME = 'customer_radar_ui_test';
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]);
};
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const t0 = Date.now();
    const req = http.request(BASE + url, {
      method, agent,
      headers: { 'X-Workspace': 'demo', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers },
      timeout: 20000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(text); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, json, ms: Date.now() - t0 });
      });
    });
    req.on('timeout', () => req.destroy(new Error('quá thời gian')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Câu mẫu có đáp án: kiểm tra phân loại tại chỗ khi đang tải nặng
const LABELLED = [
  ['giá bao nhiêu vậy shop', 'question'],
  ['còn size M không shop', 'question'],
  ['chốt 2 cái màu đen size L', 'order'],
  ['lấy em 1 cái giỏ 3', 'order'],
  ['hàng nhận về bị rách, shop lừa đảo', 'complaint'],
  ['đơn hôm trước giao thiếu, nhắn mãi không ai trả lời', 'complaint'],
  ['áo đẹp quá shop ơi', 'praise'],
  ['xin chào cả nhà', 'chatter'],
  ['ship về Hà Nội mấy ngày', 'question'],
  ['cho mình 3 cái nhé', 'order']
];

function startServer() {
  let logs = '';
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      MONGODB_DB: DB_NAME,
      MONGODB_REAL_DB: 'customer_radar_ui_test_real',
      AUTO_COLLECT: '0', BUTLER: '0', AUTH_REQUIRED: '0', WRITE_KEY: '',
      PORT: String(PORT), NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => { logs += d; });
  proc.stderr.on('data', (d) => { logs += d; });
  return { proc, logs: () => logs };
}

async function waitReady() {
  for (let i = 0; i < 100; i += 1) {
    try { const r = await request('GET', '/health'); if (r.status === 200) return; } catch { /* chờ */ }
    await sleep(300);
  }
  throw new Error('Máy chủ không khởi động');
}

/** Một màn hình xem: đếm bình luận nhận được và độ trễ từ lúc gửi */
function openViewer(sessionId, mark, state) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}/api/live/sessions/${sessionId}/stream?workspace=demo`, { headers: { Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`SSE ${res.statusCode}`));
      let buf = '';
      const v = { got: 0, lags: [], close: () => req.destroy() };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (!ev || !data) continue;
          if (ev !== 'comment' && ev !== 'comments') continue;
          const list = ev === 'comments' ? JSON.parse(data) : [JSON.parse(data)];
          const now = Date.now();
          for (const c of list) {
            if (!String(c.author?.handle || '').startsWith(mark)) continue;
            v.got += 1;
            if (v.got % 5 === 0) v.lags.push(now - new Date(c.ts).getTime());
            if (c.author.handle.endsWith('-L')) state.labels.push({ text: c.text, intent: c.intent });
          }
        }
      });
      resolve(v);
    });
    req.on('error', reject);
  });
}

async function main() {
  const srv = startServer();
  const fail = [];
  try {
    await waitReady();
    console.log(`Máy chủ thử ở ${BASE}, kho ${DB_NAME}`);

    const created = await request('POST', '/api/live/sessions', { platform: 'manual', title: 'Đo tải giờ cao điểm', useSampleCatalog: true });
    if (created.status !== 201) throw new Error(`Không mở được phiên: ${created.status} ${JSON.stringify(created.json)}`);
    const sid = created.json.session.id || created.json.session._id;
    const sessDoc = await (async () => {
      const c = await MongoClient.connect(process.env.MONGODB_URI);
      const s = await c.db(DB_NAME).collection('live_sessions').findOne({ _id: new (require('mongodb').ObjectId)(sid) });
      await c.close();
      return s;
    })();
    const key = sessDoc.ingestKey;
    const mark = `ld${Date.now().toString(36)}`;
    const state = { labels: [] };

    const viewers = [];
    for (let i = 0; i < VIEWERS; i += 1) viewers.push(await openViewer(sid, mark, state));
    console.log(`Đã mở ${VIEWERS} màn hình xem`);

    const postLat = [];
    const healthLat = [];
    const dashLat = [];
    let errors = 0;
    let sent = 0;
    let accepted = 0;
    let seq = 0;
    let stopPolling = false;

    const rssOf = async (reset) => (await request('GET', `/health/live${reset ? '?reset=1' : ''}`).catch(() => null))?.json || {};
    const startHealth = await rssOf(true);
    const rssStart = startHealth.rssMb ?? null;
    const errDetail = [];

    // Trang tổng quan và thăm dò máy chủ chạy song song
    const pollers = [
      (async () => { while (!stopPolling) { const r = await request('GET', '/health/live').catch(() => null); if (r) healthLat.push(r.ms); await sleep(200); } })(),
      (async () => { while (!stopPolling) { const r = await request('GET', `/api/live/sessions/${sid}`).catch(() => null); if (!r || r.status >= 400) errors += 1; else dashLat.push(r.ms); await sleep(1000); } })(),
      (async () => { while (!stopPolling) { const r = await request('GET', '/api/live/overview').catch(() => null); if (!r || r.status >= 400) errors += 1; else dashLat.push(r.ms); await sleep(1500); } })()
    ];

    const inflight = new Set();
    async function phase(rate, seconds, name) {
      const perTick = Math.max(1, Math.round((rate * TICK_MS) / 1000));
      const ticks = Math.round((seconds * 1000) / TICK_MS);
      const t0 = Date.now();
      for (let k = 0; k < ticks; k += 1) {
        const comments = [];
        for (let j = 0; j < perTick; j += 1) {
          seq += 1;
          const labelled = seq % 25 === 0 ? LABELLED[(seq / 25) % LABELLED.length] : null;
          comments.push({
            id: `${mark}-${seq}`,
            handle: `${mark}-${seq}${labelled ? '-L' : ''}`,
            text: labelled ? labelled[0] : `Khách ${seq % 97} hỏi còn size ${['S', 'M', 'L'][seq % 3]} không shop`,
            ts: new Date().toISOString()
          });
        }
        sent += comments.length;
        const p = request('POST', `/api/live/sessions/${sid}/comments`, { comments }, { 'X-Ingest-Key': key })
          .then((r) => { postLat.push(r.ms); if (r.status !== 200) { errors += 1; errDetail.push(`POST ${r.status} ${JSON.stringify(r.json)}`); } else accepted += r.json.accepted; })
          .catch((e) => { errors += 1; errDetail.push(`POST ${e.message}`); })
          .finally(() => inflight.delete(p));
        inflight.add(p);
        const wait = t0 + (k + 1) * TICK_MS - Date.now();
        if (wait > 0) await sleep(wait);
      }
      console.log(`${name}: gửi ${sent} bình luận, đang chờ ${inflight.size} yêu cầu`);
    }

    await phase(RATE, STEADY_SEC, `Nhịp đều ${RATE}/giây`);
    await phase(BURST_RATE, BURST_SEC, `Dồn dập ${BURST_RATE}/giây`);
    await Promise.all(inflight);
    await sleep(4000); // đợi lượt ghi và luồng sự kiện cuối
    stopPolling = true;
    await Promise.all(pollers);
    const endHealth = await rssOf(false);
    const rssEnd = endHealth.rssMb ?? null;

    const c = await MongoClient.connect(process.env.MONGODB_URI);
    const stored = await c.db(DB_NAME).collection('live_comments').countDocuments({ sessionId: sessDoc._id, 'author.handle': { $regex: `^${mark}` } });
    await c.close();

    const minGot = Math.min(...viewers.map((v) => v.got));
    const lags = viewers.flatMap((v) => v.lags);
    viewers.forEach((v) => v.close());

    const labelled = state.labels.slice(0, 200);
    const exp = new Map(LABELLED);
    const right = labelled.filter((l) => exp.get(l.text) === l.intent).length;

    const res = {
      sent, accepted, stored, errors,
      viewersMinReceived: minGot,
      postP50: pct(postLat, 50), postP95: pct(postLat, 95), postP99: pct(postLat, 99),
      lagP50: pct(lags, 50), lagP95: pct(lags, 95), lagMax: pct(lags, 100),
      healthP95: pct(healthLat, 95), healthMax: pct(healthLat, 100),
      dashP95: pct(dashLat, 95),
      cpuMsPerComment: endHealth.cpuMs != null ? Number(((endHealth.cpuMs - startHealth.cpuMs) / Math.max(1, sent)).toFixed(3)) : null,
      rssStart, rssEnd, loopP99: endHealth.loop?.p99Ms, loopMax: endHealth.loop?.maxMs,
      errDetail: errDetail.slice(0, 5),
      labelledChecked: labelled.length, labelledRight: right
    };
    console.log(JSON.stringify(res, null, 2));

    const LAG_P95 = Number(process.env.LAG_P95_MS || 1500);
    if (errors) fail.push(`${errors} yêu cầu lỗi`);
    if (accepted !== sent) fail.push(`nhận ${accepted}/${sent}`);
    if (stored !== sent) fail.push(`kho lưu ${stored}/${sent}`);
    if (minGot !== sent) fail.push(`có màn hình chỉ nhận ${minGot}/${sent}`);
    if (res.lagP95 > LAG_P95) fail.push(`độ trễ hiển thị p95 ${res.lagP95} ms > ${LAG_P95}`);
    if (res.healthP95 > 250) fail.push(`máy chủ khựng: /health/live p95 ${res.healthP95} ms`);
    if (res.loopP99 > 200) fail.push(`event loop khựng p99 ${res.loopP99} ms`);
    if (rssStart != null && rssEnd != null && rssEnd - rssStart > 150) fail.push(`RSS tăng ${(rssEnd - rssStart).toFixed(0)} MB`);
    if (labelled.length && right / labelled.length < 0.9) fail.push(`phân loại đúng ${right}/${labelled.length}`);

    // Dọn phiên thử
    await request('POST', `/api/live/sessions/${sid}/stop`).catch(() => {});
    const c2 = await MongoClient.connect(process.env.MONGODB_URI);
    const db = c2.db(DB_NAME);
    if (db.databaseName.includes('_test')) {
      await db.collection('live_comments').deleteMany({ sessionId: sessDoc._id });
      await db.collection('live_sessions').deleteOne({ _id: sessDoc._id });
    }
    await c2.close();
  } catch (e) {
    fail.push(e.message);
    console.error(srv.logs().slice(-3000));
  } finally {
    srv.proc.kill();
    agent.destroy();
  }
  if (fail.length) {
    console.log(`KHÔNG ĐẠT: ${fail.join('; ')}`);
    process.exit(1);
  }
  console.log('ĐẠT: livestream chịu được tải giờ cao điểm');
  process.exit(0);
}

main();
