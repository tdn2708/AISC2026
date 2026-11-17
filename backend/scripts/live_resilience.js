/**
 * KIỂM CHỊU LỖI LIVESTREAM (kho _test, không đụng prod)
 * ==================================================================
 * Phần 1. Báo sự cố qua Zalo: một phiên mất kết nối quá 1 phút thì nhịp canh
 *         livestream xếp tin "Sự cố phiên live" vào hàng gửi Zalo; nối lại được
 *         thì xếp tin "Đã ổn lại". Chạy nhịp canh thật trên Mongo _test.
 * Phần 2. Khởi động lại giữa giờ live: tắt hẳn máy chủ đang nhận bình luận,
 *         bật máy chủ mới; phiên phải tự nối lại, nhận tiếp được bình luận,
 *         kho không mất bình luận nào đã được nhận.
 *
 * Chạy: cd backend && node scripts/live_resilience.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { MongoClient, ObjectId } = require('mongodb');

const DB = 'customer_radar_ui_test';
const AUTH_DB = 'customer_radar_ui_test_auth';
const PORT = 5078;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(BASE + url, { method, headers: { 'X-Workspace': 'demo', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers }, timeout: 20000 }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function startServer() {
  let logs = '';
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, MONGODB_DB: DB, MONGODB_REAL_DB: 'customer_radar_ui_test_real', AUTO_COLLECT: '0', BUTLER: '0', AUTH_REQUIRED: '0', WRITE_KEY: '', PORT: String(PORT), CONTEXT_WORKER: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => { logs += d; });
  proc.stderr.on('data', (d) => { logs += d; });
  return { proc, logs: () => logs };
}
async function waitReady(srv) {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await req('GET', '/health/live')).status === 200) return; } catch { /* chờ */ }
    await sleep(300);
  }
  throw new Error(`Máy chủ không lên:\n${srv.logs().slice(-2000)}`);
}

async function part1(client) {
  const db = client.db(DB);
  const authDb = client.db(AUTH_DB);
  if (!db.databaseName.includes('_test') || !authDb.databaseName.includes('_test')) throw new Error('Chỉ chạy trên kho _test');
  const hub = require('../services/live/hub');
  const { liveTick } = require('../services/butler/live_watch');
  const userId = new ObjectId();
  const now0 = new Date();
  await authDb.collection('butler_links').insertOne({ userId, chatId: `resil-${Date.now()}`, settings: { workspace: 'demo', live: true }, linkedAt: new Date(now0.getTime() - 3600000), createdAt: now0 });
  const { insertedId } = await db.collection('live_sessions').insertOne({ title: 'Kiểm sự cố', platform: 'manual', products: [], status: 'connecting', ingestKey: 'k', createdAt: now0 });
  const session = await db.collection('live_sessions').findOne({ _id: insertedId });
  const r = await hub.startSession(db, 'demo', session);
  await sleep(300);
  try {
    // Giả lập mất kết nối từ 2 phút trước
    r.status = 'reconnecting';
    r.statusSince = Date.now() - 120000;
    r.error = 'DEVICE_BLOCKED';
    await authDb.collection('meta').deleteOne({ _id: 'butler_live_watch' });
    await liveTick({ authDb, workspaces: { demo: db } });
    const bad = await authDb.collection('butler_outbox').find({ userId, dedupKey: { $regex: '^live_tech\\|' } }).toArray();
    if (bad.length !== 1 || !/mất kết nối/.test(bad[0].text)) throw new Error(`Phần 1: cần 1 tin sự cố, có ${bad.length}`);
    console.log(`ĐẠT [Phần 1a] Tin sự cố đã vào hàng gửi Zalo:\n  ${bad[0].text.replace(/\n/g, '\n  ')}`);
    // Nhịp sau vẫn lỗi: không gửi lặp
    await liveTick({ authDb, workspaces: { demo: db } });
    const again = await authDb.collection('butler_outbox').countDocuments({ userId, dedupKey: { $regex: '^live_tech\\|' } });
    if (again !== 1) throw new Error(`Phần 1: gửi lặp ${again} tin`);
    // Nối lại
    r.status = 'live';
    r.error = null;
    await liveTick({ authDb, workspaces: { demo: db } });
    const ok = await authDb.collection('butler_outbox').find({ userId, dedupKey: { $regex: '^live_tech_ok\\|' } }).toArray();
    if (ok.length !== 1) throw new Error(`Phần 1: cần 1 tin đã ổn lại, có ${ok.length}`);
    console.log(`ĐẠT [Phần 1b] Không gửi lặp; tin đã ổn lại: ${ok[0].text}`);
  } finally {
    await r.stop('Kết thúc kiểm').catch(() => {});
    await authDb.collection('butler_outbox').deleteMany({ userId });
    await authDb.collection('butler_links').deleteMany({ userId });
    await authDb.collection('butler_incidents').deleteMany({ key: { $regex: String(insertedId) } }).catch(() => {});
    await db.collection('live_comments').deleteMany({ sessionId: insertedId });
    await db.collection('live_sessions').deleteOne({ _id: insertedId });
  }
}

async function part2(client) {
  const db = client.db(DB);
  let srv = startServer();
  await waitReady(srv);
  const created = await req('POST', '/api/live/sessions', { platform: 'manual', title: 'Kiểm khởi động lại', useSampleCatalog: true });
  const sid = created.json.session.id;
  const key = created.json.session.ingestKey;
  const mark = `rs${Date.now().toString(36)}`;
  let seq = 0;
  let acked = 0;
  const send = async (n) => {
    const comments = Array.from({ length: n }, () => { seq += 1; return { id: `${mark}-${seq}`, handle: `${mark}-${seq}`, text: `còn size M không ${seq}`, ts: new Date().toISOString() }; });
    const r = await req('POST', `/api/live/sessions/${sid}/comments`, { comments }, { 'X-Ingest-Key': key });
    if (r.status === 200) acked += r.json.accepted;
    return r.status;
  };
  try {
    for (let i = 0; i < 20; i += 1) await send(25);
    // Chờ một nhịp tim để phiên ghi mốc còn hoạt động, rồi tắt hẳn máy chủ (không kịp dọn dẹp)
    await sleep(1500);
    srv.proc.kill('SIGKILL');
    await sleep(1500);
    srv = startServer();
    await waitReady(srv);
    let status = null;
    for (let i = 0; i < 40; i += 1) {
      status = (await req('GET', `/api/live/sessions/${sid}`)).json?.session?.status;
      if (status === 'live') break;
      await sleep(500);
    }
    if (status !== 'live') throw new Error(`Phần 2: phiên không tự nối lại (trạng thái ${status})\n${srv.logs().slice(-1500)}`);
    for (let i = 0; i < 20; i += 1) {
      const st = await send(25);
      if (st !== 200) throw new Error(`Phần 2: sau khởi động lại webhook trả ${st}`);
    }
    // Ghi kho chạy nền; ngay sau khởi động lại lượt ghi đầu phải mở kết nối Atlas mới nên chậm hơn
    let stored = 0;
    for (let i = 0; i < 20; i += 1) {
      await sleep(500);
      stored = await db.collection('live_comments').countDocuments({ sessionId: new ObjectId(sid), 'author.handle': { $regex: `^${mark}` } });
      if (stored === acked) break;
    }
    if (stored !== acked) {
      const have = new Set((await db.collection('live_comments').find({ sessionId: new ObjectId(sid), 'author.handle': { $regex: `^${mark}` } }, { projection: { 'author.handle': 1 } }).toArray()).map((d) => Number(d.author.handle.split('-').pop())));
      const miss = []; for (let i = 1; i <= seq; i += 1) if (!have.has(i)) miss.push(i);
      throw new Error(`Phần 2: kho có ${stored}, đã nhận ${acked}; thiếu số ${miss[0]} đến ${miss[miss.length - 1]} (${miss.length})`);
    }
    console.log(`ĐẠT [Phần 2] Máy chủ bị tắt hẳn giữa phiên; bật lại thì phiên tự nối lại, nhận tiếp được, kho đủ ${stored}/${acked} bình luận`);
  } finally {
    await req('POST', `/api/live/sessions/${sid}/stop`).catch(() => {});
    srv.proc.kill();
    if (db.databaseName.includes('_test')) {
      await db.collection('live_comments').deleteMany({ sessionId: new ObjectId(sid) });
      await db.collection('live_sessions').deleteOne({ _id: new ObjectId(sid) });
    }
  }
}

(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  let failed = null;
  try {
    await part1(client);
    await part2(client);
  } catch (e) {
    failed = e.message;
  } finally {
    await client.close();
  }
  if (failed) { console.log(`KHÔNG ĐẠT: ${failed}`); process.exit(1); }
  console.log('ĐẠT: livestream chịu lỗi và báo sự cố qua Zalo');
  process.exit(0);
})();
