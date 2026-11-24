/**
 * KIỂM THỬ ĐẦU CUỐI QUẢN GIA (butler_e2e.js)
 * ==================================================================
 * Kiểm tự động 11 bước từ đăng ký tài khoản thử, lấy mã nối Zalo, nhắn qua
 * máy Zalo giả lập, xem việc, duyệt đề xuất 2 bước, chống trùng message_id,
 * vòng canh lần đầu, thử lại khi lỗi mạng tới lịch sử chung web và Zalo.
 */

const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');
const { createMockZaloApp } = require('./mock_zalo');

const http = axios.create({
  proxy: false,
  timeout: 25000,
  validateStatus: () => true
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pass(step, detail = '') {
  console.log(`ĐẠT [Bước ${step}]${detail ? ' ' + detail : ''}`);
}

function fail(step, reason) {
  console.error(`LỖI: [Bước ${step}] ${reason}`);
  process.exitCode = 1;
  throw new Error(`Bước ${step}: ${reason}`);
}

async function waitForSent(mockUrl, predicate, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await http.get(`${mockUrl}/_sent`);
    const list = r.data?.sent || [];
    const found = list.find(predicate);
    if (found) return { found, list };
    await sleep(250);
  }
  const r = await http.get(`${mockUrl}/_sent`);
  return { found: null, list: r.data?.sent || [] };
}

async function ensureEnvironment() {
  const mockPort = Number(process.env.MOCK_ZALO_PORT) || 5055;
  const mockUrl = `http://127.0.0.1:${mockPort}`;
  let mockServer = null;

  try {
    const r = await http.get(`${mockUrl}/_sent`, { timeout: 1500 });
    if (r.status !== 200) throw new Error('not running');
  } catch {
    mockServer = await new Promise((resolve) => {
      const s = createMockZaloApp().listen(mockPort, '127.0.0.1', () => resolve(s));
    });
  }

  let apiPort = Number(process.env.PORT) || 5000;
  let apiUrl = `http://127.0.0.1:${apiPort}`;
  let spawnedServer = null;

  let hasButler = false;
  let serverLogs = '';
  try {
    const probe = await http.post(`${apiUrl}/api/butler/zalo/webhook`, {}, { timeout: 2000 });
    if (probe.data && probe.data.error === 'Chế độ webhook đang tắt.') {
      hasButler = true;
    }
  } catch {
    hasButler = false;
  }

  if (!hasButler) {
    // Nếu cổng 5000 đang có tiến trình cũ chưa có /api/butler thì khởi chạy trên cổng 5051
    try {
      const h = await http.get(`${apiUrl}/health`, { timeout: 1500 });
      if (h.status === 200) apiPort = 5051;
    } catch {
      // cổng 5000 đang trống
    }
    apiUrl = `http://127.0.0.1:${apiPort}`;
    const backendDir = path.join(__dirname, '..');
    spawnedServer = spawn(process.execPath, ['server.js'], {
      cwd: backendDir,
      env: {
        ...process.env,
        MONGODB_DB: 'customer_radar_ui_test',
        MONGODB_REAL_DB: 'customer_radar_ui_test_real',
        AUTO_COLLECT: '0',
        PORT: String(apiPort),
        ZALO_API_BASE: mockUrl,
        ZALO_BOT_TOKEN: '123456:testtokenabcdef',
        ZALO_MODE: 'poll',
        BUTLER_FAST_RETRY: '1',
        BUTLER_WATCH_MINUTES: '1',
        BUTLER_WATCH_FIRST_DELAY_SEC: '5',
        BUTLER_LIVE_WATCH_SEC: '5',
        PUBLIC_APP_URL: 'http://localhost:5199'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    spawnedServer.stdout.on('data', (d) => { serverLogs += d.toString(); });
    spawnedServer.stderr.on('data', (d) => { serverLogs += d.toString(); });

    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      try {
        const h = await http.get(`${apiUrl}/health`, { timeout: 2000 });
        if (h.status === 200 && serverLogs.includes('Quản gia:')) {
          ready = true;
          break;
        }
      } catch {
        // chờ máy chủ khởi động
      }
      await sleep(300);
    }
    if (!ready) {
      if (spawnedServer) spawnedServer.kill();
      if (mockServer) mockServer.close();
      throw new Error(`Máy chủ thử nghiệm không khởi động kịp:\n${serverLogs}`);
    }
  }

  return {
    mockUrl,
    apiUrl,
    getServerLogs: () => typeof serverLogs === 'string' ? serverLogs : '',
    cleanupProcesses: async () => {
      if (spawnedServer) spawnedServer.kill();
      if (mockServer) await new Promise((r) => mockServer.close(r));
    }
  };
}

async function main() {
  const { mockUrl, apiUrl, cleanupProcesses } = await ensureEnvironment();
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const demoDbName = process.env.MONGODB_DB || 'customer_radar_ui_test';
  const authDbName = process.env.MONGODB_AUTH_DB || `${demoDbName}_auth`;
  const demoDb = client.db(demoDbName);
  const authDb = client.db(authDbName);

  const writeKey = process.env.WRITE_KEY || '';
  const baseHeaders = (token, ws = 'demo') => ({
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(writeKey ? { 'X-Write-Key': writeKey } : {}),
    'X-Workspace': ws
  });

  let testUserId = null;
  let restoredDecision = null;
  let decidedAlertId = null;
  let createdScheduleId = null;
  let createdSessionId = null;

  try {
    await http.post(`${mockUrl}/_reset`);

    // Bước 1: Đăng ký tài khoản thử mới trên database test
    const nowTag = Date.now();
    const email = `butler-e2e-${nowTag}@example.com`;
    const userName = `Chủ Shop E2E ${nowTag}`;
    const signup = await http.post(
      `${apiUrl}/api/auth/signup`,
      {
        name: userName,
        shop: 'Shop Thử E2E',
        email,
        password: 'matkhau2026',
        acceptTerms: true
      },
      { headers: baseHeaders(null) }
    );
    if (signup.status !== 201 || !signup.data?.token || !signup.data?.user?.id) {
      fail(1, `Đăng ký thất bại: status=${signup.status} body=${JSON.stringify(signup.data)}`);
    }
    testUserId = new ObjectId(String(signup.data.user.id));
    // Tài khoản thử là thành viên nhóm (dùng kho mô phỏng chung, services/tenants.js) có gói
    // Shop có live (lệnh Quản gia, phiên live). Đăng nhập lại để phiên mang quyền mới.
    await authDb.collection('users').updateOne(
      { _id: testUserId },
      { $set: { sharedWorkspaces: true, plan: 'live', planUntil: new Date(Date.now() + 86400000) } }
    );
    const relogin = await http.post(`${apiUrl}/api/auth/login`, { email, password: 'matkhau2026' }, { headers: baseHeaders(null) });
    if (relogin.status !== 200 || !relogin.data?.token) fail(1, `Đăng nhập lại thất bại: status=${relogin.status}`);
    const token = relogin.data.token;
    pass(1, `Đã đăng ký ${email}`);

    // Bước 2: POST /api/butler/link-code -> có mã 6 số; tài khoản mẫu trả 403
    const demoLogin = await http.post(
      `${apiUrl}/api/auth/login`,
      { email: 'demo@customerradar.vn', password: 'demo2026' },
      { headers: baseHeaders(null) }
    );
    if (demoLogin.status !== 200 || !demoLogin.data?.token) {
      fail(2, 'Không đăng nhập được tài khoản mẫu');
    }
    const demoCodeRes = await http.post(
      `${apiUrl}/api/butler/link-code`,
      {},
      { headers: baseHeaders(demoLogin.data.token) }
    );
    if (demoCodeRes.status !== 403) {
      fail(2, `Tài khoản mẫu phải trả 403, nhận được ${demoCodeRes.status}`);
    }

    const codeRes = await http.post(
      `${apiUrl}/api/butler/link-code`,
      {},
      { headers: baseHeaders(token) }
    );
    if (codeRes.status !== 200 || !/^\d{6}$/.test(String(codeRes.data?.code || ''))) {
      fail(2, `Không lấy được mã 6 số: status=${codeRes.status} body=${JSON.stringify(codeRes.data)}`);
    }
    const linkCode = codeRes.data.code;
    pass(2, `Đã tạo mã 6 số, tài khoản mẫu trả 403 đúng quy định`);

    // Bước 3: /_say chat_id 9001 gửi "xin chào" khi chưa nối -> hướng dẫn nối, không lộ số liệu
    const chatId = '9001';
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'xin chào', name: 'Chủ Shop Zalo' });
    const step3 = await waitForSent(mockUrl, (m) => m.chat_id === chatId && m.text.includes('Nối Zalo'));
    if (!step3.found || /\d+\.\d+|\bWCR\b|phản hồi được tính/i.test(step3.found.text)) {
      fail(3, `Tin trả lời khi chưa nối không đúng: ${JSON.stringify(step3.found)}`);
    }
    pass(3, `Chưa nối trả lời hướng dẫn, không chứa số liệu`);

    // Bước 4: /_say gửi mã -> "Đã nối Zalo ..."; /api/butler/status có link.linked: true
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: linkCode, name: 'Chủ Shop Zalo' });
    const step4 = await waitForSent(mockUrl, (m) => m.chat_id === chatId && m.text.includes('Đã nối Zalo'));
    if (!step4.found) {
      fail(4, 'Không nhận được tin xác nhận Đã nối Zalo');
    }
    const st4 = await http.get(`${apiUrl}/api/butler/status`, { headers: baseHeaders(token) });
    if (st4.status !== 200 || st4.data?.link?.linked !== true) {
      fail(4, `Trạng thái link.linked không phải true: ${JSON.stringify(st4.data?.link)}`);
    }
    pass(4, `Đã nối Zalo thành công và status báo link.linked = true`);

    // Bước 5: Chuyển sang kho mô phỏng và gửi "việc" -> có danh sách đánh số
    const beforeSwitchCount = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'kho mô phỏng', name: 'Chủ Shop Zalo' });
    const sw = await waitForSent(
      mockUrl,
      (m, i) => i >= beforeSwitchCount && m.chat_id === chatId && m.text.includes('Mô phỏng')
    );
    if (!sw.found) {
      fail(5, 'Không đổi được sang kho Mô phỏng qua Zalo');
    }

    const beforeTasksCount = sw.list.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'việc', name: 'Chủ Shop Zalo' });
    const step5 = await waitForSent(
      mockUrl,
      (m, i) => i >= beforeTasksCount && m.chat_id === chatId && /1\.\s*\[/.test(m.text),
      30000
    );
    if (!step5.found) {
      fail(5, `Không nhận được danh sách việc đánh số: ${JSON.stringify(step5.list.slice(beforeTasksCount))}`);
    }
    pass(5, `Lệnh "việc" trả danh sách đánh số`);

    // Bước 6: "xem 1" -> kế hoạch; "duyệt 1" -> hỏi xác nhận; "có" -> "Đã ghi" và kiểm recommendation_log
    const linkDocBeforeDecision = await authDb.collection('butler_links').findOne({ userId: testUserId });
    decidedAlertId = linkDocBeforeDecision?.lastList?.items?.[0]?.id || null;
    if (decidedAlertId) {
      restoredDecision = await demoDb.collection('recommendation_log').findOne({ alertId: decidedAlertId });
    }

    const idx6a = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'xem 1', name: 'Chủ Shop Zalo' });
    const step6a = await waitForSent(
      mockUrl,
      (m, i) => i >= idx6a && m.chat_id === chatId && m.text.includes('Việc 1:')
    );
    if (!step6a.found) fail(6, 'Lệnh "xem 1" không trả chi tiết kế hoạch');

    const idx6b = step6a.list.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'duyệt 1', name: 'Chủ Shop Zalo' });
    const step6b = await waitForSent(
      mockUrl,
      (m, i) => i >= idx6b && m.chat_id === chatId && m.text.includes('Chấp nhận kế hoạch cho')
    );
    if (!step6b.found) fail(6, 'Lệnh "duyệt 1" không hỏi xác nhận');

    const idx6c = step6b.list.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'có', name: 'Chủ Shop Zalo' });
    const step6c = await waitForSent(
      mockUrl,
      (m, i) => i >= idx6c && m.chat_id === chatId && m.text.startsWith('Đã ghi:')
    );
    if (!step6c.found) fail(6, 'Lệnh "có" không trả lời "Đã ghi:"');

    const loggedDecision = await demoDb.collection('recommendation_log').findOne({
      ...(decidedAlertId ? { alertId: decidedAlertId } : {}),
      via: 'zalo',
      by: userName
    });
    if (!loggedDecision) {
      fail(6, 'Không tìm thấy bản ghi via="zalo", by=tên tài khoản thử trong recommendation_log');
    }
    pass(6, `Đã xem kế hoạch, duyệt 2 bước và ghi recommendation_log (via=zalo)`);

    // Bước 7: Gửi lại cùng message_id hai lần -> chỉ một tin trả lời
    const fixedMsgId = `dup-test-${Date.now()}`;
    const idx7 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'giúp', message_id: fixedMsgId });
    await http.post(`${mockUrl}/_say`, { chat_id: chatId, text: 'giúp', message_id: fixedMsgId });
    const step7 = await waitForSent(
      mockUrl,
      (m, i) => i >= idx7 && m.chat_id === chatId && m.text.includes('Lệnh quản gia hiểu:')
    );
    if (!step7.found) fail(7, 'Không nhận được trả lời cho tin đầu tiên');
    await sleep(1200);
    const after7 = (await http.get(`${mockUrl}/_sent`)).data.sent.slice(idx7);
    const helpReplies = after7.filter((m) => m.chat_id === chatId && m.text.includes('Lệnh quản gia hiểu:'));
    if (helpReplies.length !== 1) {
      fail(7, `Gửi trùng message_id nhưng nhận ${helpReplies.length} tin trả lời`);
    }
    pass(7, `Chống trùng message_id: chỉ trả lời đúng 1 lần`);

    // Bước 8: Chờ một nhịp canh -> có tin "Quản gia đã bắt đầu canh kho ..."
    const step8 = await waitForSent(
      mockUrl,
      (m) => m.chat_id === chatId && m.text.includes('Quản gia đã bắt đầu canh kho'),
      68000
    );
    if (!step8.found) {
      fail(8, 'Chưa nhận được tin "Quản gia đã bắt đầu canh kho ..." sau nhịp canh');
    }
    pass(8, `Nhịp canh đầu tiên gửi tin mở đầu, không bắn dồn sự cố cũ`);

    // Bước 9: POST /_fail {n: 3} rồi gửi "tình hình" -> tin vẫn tới sau khi thử lại (tries > 0, status: 'sent')
    await http.post(`${mockUrl}/_fail`, { n: 3 });
    const idx9 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const statusMsgId = `status-retry-${Date.now()}`;
    await http.post(`${mockUrl}/_say`, {
      chat_id: chatId,
      text: 'tình hình',
      message_id: statusMsgId
    });
    const step9 = await waitForSent(
      mockUrl,
      (m, i) => i >= idx9 && m.chat_id === chatId && /Bản tin (sáng|trưa|chiều|tối) /.test(m.text),
      25000
    );
    if (!step9.found) {
      fail(9, 'Tin "tình hình" không tới được sau khi giả lập lỗi 3 lần');
    }
    // Máy Zalo giả ghi nhận tin ngay khi nhận; máy chủ ghi status 'sent' sau một vòng tới Atlas,
    // nên chờ tối đa 8 giây thay vì đọc ngay (lần chạy 23/11 bắt được lúc còn 'sending')
    let outboxDoc = null;
    for (let i = 0; i < 16; i += 1) {
      outboxDoc = await authDb.collection('butler_outbox').findOne({ dedupKey: `reply|${statusMsgId}` });
      if (outboxDoc?.status === 'sent') break;
      await sleep(500);
    }
    if (!outboxDoc || outboxDoc.status !== 'sent' || !(outboxDoc.tries > 0)) {
      fail(9, `Bản ghi outbox không đúng kỳ vọng: ${JSON.stringify(outboxDoc)}`);
    }
    pass(9, `Outbox tự thử lại sau 3 lỗi liên tiếp (tries=${outboxDoc.tries}, status=${outboxDoc.status})`);

    // Bước 10: POST /api/butler/command {text:'tình hình'} từ web -> /api/butler/messages có cả web và Zalo
    const webCmd = await http.post(
      `${apiUrl}/api/butler/command`,
      { text: 'tình hình' },
      { headers: baseHeaders(token, 'demo') }
    );
    if (webCmd.status !== 200 || !webCmd.data?.reply?.text) {
      fail(10, `Gửi lệnh từ web thất bại: status=${webCmd.status}`);
    }
    const histRes = await http.get(`${apiUrl}/api/butler/messages?limit=30`, {
      headers: baseHeaders(token, 'demo')
    });
    const msgs = histRes.data?.messages || [];
    const hasWeb = msgs.some((m) => m.channel === 'web');
    const hasZalo = msgs.some((m) => m.channel === 'zalo');
    if (!hasWeb || !hasZalo) {
      fail(10, `Lịch sử thiếu kênh (hasWeb=${hasWeb}, hasZalo=${hasZalo})`);
    }
    pass(10, `Lịch sử /api/butler/messages có đủ cả tin web và tin Zalo (${msgs.length} tin)`);

    // Bước 12: POST lịch với startAt = now + 20 phút, remindBeforeMin: 30 -> trong 20s nhận tin nhắc có "Còn" và tên lịch; chờ 2 nhịp không nhận lần hai
    const schedTitle = `Hẹn Megalive E2E ${Date.now()}`;
    const idx12 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const createSched = await http.post(
      `${apiUrl}/api/live/schedule`,
      {
        title: schedTitle,
        platform: 'simulator',
        startAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        durationMin: 120,
        remindBeforeMin: 30,
        note: 'Kiểm thử nhắc lịch tự động'
      },
      { headers: baseHeaders(token, 'demo') }
    );
    if (createSched.status !== 201 || !createSched.data?.item?.id) {
      fail(12, `Tạo lịch thất bại: status=${createSched.status} body=${JSON.stringify(createSched.data)}`);
    }
    createdScheduleId = createSched.data.item.id;

    const step12 = await waitForSent(
      mockUrl,
      (m, i) =>
        i >= idx12 &&
        m.chat_id === chatId &&
        m.text.includes('Còn') &&
        m.text.includes(schedTitle),
      20000
    );
    if (!step12.found) {
      fail(12, 'Trong 20 giây không nhận được tin nhắc trước giờ hẹn');
    }
    await sleep(11000); // chờ thêm 2 nhịp (2 * 5s)
    const sentAfter12 = (await http.get(`${mockUrl}/_sent`)).data.sent.slice(idx12);
    const remindMatches = sentAfter12.filter(
      (m) => m.chat_id === chatId && m.text.includes('Còn') && m.text.includes(schedTitle)
    );
    if (remindMatches.length !== 1) {
      fail(12, `Tin nhắc lịch bị gửi lặp: nhận ${remindMatches.length} lần`);
    }
    pass(12, 'Nhận đúng 1 tin nhắc trước giờ hẹn, không gửi lặp sau 2 nhịp');

    // Bước 13: Mở phiên simulator tốc độ 4 -> trong 20s nhận tin "đã bắt đầu"; GET lịch thấy status = 'done' và có sessionId
    const idx13 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const startLiveRes = await http.post(
      `${apiUrl}/api/live/sessions`,
      {
        platform: 'simulator',
        title: schedTitle,
        speed: 4
      },
      { headers: baseHeaders(token, 'demo') }
    );
    if (startLiveRes.status !== 201 || !startLiveRes.data?.session?.id) {
      fail(13, `Mở phiên simulator thất bại: status=${startLiveRes.status}`);
    }
    createdSessionId = startLiveRes.data.session.id;

    const step13 = await waitForSent(
      mockUrl,
      (m, i) =>
        i >= idx13 &&
        m.chat_id === chatId &&
        m.text.includes('đã bắt đầu') &&
        m.text.includes(schedTitle),
      20000
    );
    if (!step13.found) {
      fail(13, 'Trong 20 giây không nhận được tin báo phiên live đã bắt đầu');
    }

    const getSchedRes = await http.get(`${apiUrl}/api/live/schedule`, {
      headers: baseHeaders(token, 'demo')
    });
    const linkedSched = (getSchedRes.data?.items || []).find((x) => x.id === createdScheduleId);
    if (!linkedSched || linkedSched.status !== 'done' || linkedSched.sessionId !== createdSessionId) {
      fail(13, `Lịch chưa tự gắn với phiên vừa mở: ${JSON.stringify(linkedSched)}`);
    }
    pass(13, 'Nhận tin phiên live đã bắt đầu và lịch tự chuyển sang done kèm sessionId');

    // Bước 14: Chờ tối đa 60s xem trình mô phỏng có sinh việc mức cao không
    const idx14 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const step14 = await waitForSent(
      mockUrl,
      (m, i) => i >= idx14 && m.chat_id === chatId && m.text.includes('Việc gấp trong phiên'),
      60000
    );
    if (step14.found) {
      pass(14, 'Nhận tin "Việc gấp trong phiên" từ vòng canh live');
    } else {
      console.log('BỎ QUA [Bước 14] (mô phỏng chưa sinh việc gấp)');
    }

    // Bước 15: Dừng phiên (POST /stop) -> trong 20s nhận tin "đã kết thúc" có "Bình luận:"; chờ thêm 2 nhịp không nhận lần hai
    const idx15 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const stopRes = await http.post(
      `${apiUrl}/api/live/sessions/${createdSessionId}/stop`,
      {},
      { headers: baseHeaders(token, 'demo') }
    );
    if (stopRes.status !== 200) {
      fail(15, `Dừng phiên thất bại: status=${stopRes.status}`);
    }

    const step15 = await waitForSent(
      mockUrl,
      (m, i) =>
        i >= idx15 &&
        m.chat_id === chatId &&
        m.text.includes('đã kết thúc') &&
        m.text.includes('Bình luận:'),
      20000
    );
    if (!step15.found) {
      fail(15, 'Trong 20 giây không nhận được báo cáo cuối phiên live');
    }
    await sleep(11000);
    const sentAfter15 = (await http.get(`${mockUrl}/_sent`)).data.sent.slice(idx15);
    const endMatches = sentAfter15.filter(
      (m) => m.chat_id === chatId && m.text.includes('đã kết thúc') && m.text.includes(schedTitle)
    );
    if (endMatches.length !== 1) {
      fail(15, `Báo cáo cuối phiên bị gửi lặp: nhận ${endMatches.length} lần`);
    }
    pass(15, 'Nhận đúng 1 báo cáo cuối phiên có "Bình luận:", không gửi lặp sau 2 nhịp');

    // Bước 16: Nhắn "lịch" qua Zalo giả -> trả lời đúng
    const idx16 = (await http.get(`${mockUrl}/_sent`)).data.sent.length;
    const schedCmdMsgId = `sched-cmd-${Date.now()}`;
    await http.post(`${mockUrl}/_say`, {
      chat_id: chatId,
      text: 'lịch',
      message_id: schedCmdMsgId
    });
    const step16 = await waitForSent(
      mockUrl,
      (m, i) =>
        i >= idx16 &&
        m.chat_id === chatId &&
        (m.text.includes('Chưa có phiên live nào được hẹn') || m.text.includes('Lịch live sắp tới')),
      15000
    );
    if (!step16.found) {
      fail(16, 'Lệnh "lịch" qua Zalo không trả lời đúng');
    }
    pass(16, 'Lệnh "lịch" qua Zalo trả lời đúng');

    // Bước 11: Dọn tài khoản thử, phiên mô phỏng, lịch thử và các bản ghi butler chỉ trong database có tên chứa _test
    if (!authDb.databaseName.includes('_test') || !demoDb.databaseName.includes('_test')) {
      fail(11, `Tên database không chứa _test (${authDb.databaseName}, ${demoDb.databaseName}), dừng xóa!`);
    }

    if (createdSessionId) {
      await http.delete(`${apiUrl}/api/live/sessions/${createdSessionId}`, {
        headers: baseHeaders(token, 'demo')
      });
      createdSessionId = null;
    }
    if (createdScheduleId) {
      await demoDb.collection('live_schedule').deleteOne({ _id: new ObjectId(createdScheduleId) });
      createdScheduleId = null;
    }

    if (decidedAlertId) {
      if (restoredDecision) {
        const { _id, ...rest } = restoredDecision;
        await demoDb.collection('recommendation_log').replaceOne({ alertId: decidedAlertId }, rest, { upsert: true });
      } else {
        await demoDb.collection('recommendation_log').deleteOne({ alertId: decidedAlertId, by: userName });
      }
    }

    await Promise.all([
      authDb.collection('users').deleteOne({ _id: testUserId }),
      authDb.collection('auth_sessions').deleteMany({ userId: testUserId }),
      authDb.collection('butler_links').deleteMany({ userId: testUserId }),
      authDb.collection('butler_link_codes').deleteMany({ userId: testUserId }),
      authDb.collection('butler_messages').deleteMany({ userId: testUserId }),
      authDb.collection('butler_outbox').deleteMany({ $or: [{ userId: testUserId }, { chatId }] }),
      authDb.collection('butler_pending').deleteOne({ _id: String(testUserId) }),
      authDb.collection('butler_inbound').deleteMany({ _id: { $in: [fixedMsgId, statusMsgId, schedCmdMsgId] } })
    ]);
    testUserId = null;
    pass(11, `Đã dọn sạch dữ liệu thử trong ${authDb.databaseName} và ${demoDb.databaseName}`);
  } finally {
    if (demoDb.databaseName.includes('_test')) {
      if (createdSessionId) {
        await Promise.allSettled([
          demoDb.collection('live_comments').deleteMany({ sessionId: new ObjectId(createdSessionId) }),
          demoDb.collection('live_sessions').deleteOne({ _id: new ObjectId(createdSessionId) })
        ]);
      }
      if (createdScheduleId) {
        await demoDb.collection('live_schedule').deleteOne({ _id: new ObjectId(createdScheduleId) }).catch(() => {});
      }
    }
    if (testUserId && authDb.databaseName.includes('_test')) {
      await Promise.allSettled([
        authDb.collection('users').deleteOne({ _id: testUserId }),
        authDb.collection('auth_sessions').deleteMany({ userId: testUserId }),
        authDb.collection('butler_links').deleteMany({ userId: testUserId }),
        authDb.collection('butler_link_codes').deleteMany({ userId: testUserId }),
        authDb.collection('butler_messages').deleteMany({ userId: testUserId }),
        authDb.collection('butler_outbox').deleteMany({ userId: testUserId }),
        authDb.collection('butler_pending').deleteOne({ _id: String(testUserId) })
      ]);
    }
    await client.close();
    await cleanupProcesses();
  }
}

main().catch((e) => {
  console.error('Kịch bản E2E dừng vì lỗi:', e.message);
  process.exit(1);
});
