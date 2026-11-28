require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { errorResponse } = require('./services/http_errors');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS chỉ cho trang của nhóm + localhost; header trình duyệt xin gửi (X-Workspace,
// X-Write-Key) vẫn được phản chiếu như trước. Khóa ghi: services/api_access.js
const { corsOptions, writeGuard } = require('./services/api_access');
app.use(cors(corsOptions()));
app.use(writeGuard());
if (process.env.WRITE_KEY) console.log('Khóa ghi: đang bật (cần header X-Write-Key).');
// Render đứng sau một proxy: lấy IP thật của người gọi cho giới hạn tần suất
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
// Express 5 để req.body là undefined khi request không có thân JSON; mọi route
// viết `const { x } = req.body` khi đó ném TypeError thành lỗi 500
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

if (!process.env.MONGODB_URI) {
  console.error('Thiếu MONGODB_URI trong .env — không thể khởi động.');
  process.exit(1);
}

/**
 * Nhóm kết nối: mỗi lần nạp ngữ cảnh mở song song 5-9 truy vấn, cộng luồng ghi
 * bình luận livestream và các request thường. Giữ sẵn vài kết nối để request
 * đầu sau lúc rảnh không phải bắt tay TLS lại với Atlas; chặn trên ở 20 vì gói
 * Atlas miễn phí giới hạn 500 kết nối cho cả cụm.
 */
const client = new MongoClient(process.env.MONGODB_URI, {
  appName: 'customer-radar',
  maxPoolSize: 20,
  minPoolSize: 2,
  maxIdleTimeMS: 5 * 60 * 1000,
  serverSelectionTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true
});

process.on('uncaughtException', (err) => {
  try { require('./services/process_health').recordError('uncaught', err && err.message); } catch { /* bỏ qua */ }
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  try { require('./services/process_health').recordError('unhandled', reason && reason.message ? reason.message : String(reason).slice(0, 120)); } catch { /* bỏ qua */ }
  console.error('[UNHANDLED REJECTION]', reason);
});

/**
 * Chỉ mục cần thiết cho các truy vấn hay dùng. Tạo lúc khởi động để
 * không phải nhớ chạy tay sau mỗi lần triển khai mới.
 */
async function ensureIndexes(db) {
  const specs = [
    ['feedbacks', { timestamp: -1 }],
    ['feedbacks', { productName: 1, timestamp: -1 }],
    ['feedbacks', { source: 1, timestamp: -1 }],
    // Khóa chống trùng cho phản hồi thu thập (POST /scrape). Chỉ áp cho bản
    // ghi CÓ khóa, nên dữ liệu seed cũ không có trường này không bị ảnh hưởng.
    ['feedbacks', { dedupKey: 1 }, { unique: true, partialFilterExpression: { dedupKey: { $type: 'string' } } }],
    ['transactions', { orderId: 1 }, { unique: true }],
    ['order_cancellations', { orderId: 1 }, { unique: true }],
    ['order_cancellations', { orderedAt: 1 }],
    ['order_cancellations', { modelCode: 1 }],
    ['review_labels', { feedbackId: 1 }, { unique: true }],
    // Nhãn người duyệt và nhãn mô hình thầy: ghi theo feedbackId (upsert)
    ['audit_labels', { feedbackId: 1 }, { unique: true }],
    ['teacher_labels', { feedbackId: 1 }],
    // Livestream: Hộp việc hôm nay đếm đơn chưa lên và khiếu nại chưa đưa theo phiên
    ['live_comments', { sessionId: 1, intent: 1, orderStatus: 1 }],
    ['live_comments', { sessionId: 1, intent: 1, pushedToFeedback: 1 }],
    ['recommendation_log', { alertId: 1 }, { unique: true }]
  ];
  // Một chỉ mục tạo hỏng (ví dụ dữ liệu cũ đang trùng khóa) chỉ được cảnh báo,
  // không được kéo sập cả máy chủ lúc khởi động như bản cũ
  const results = await Promise.allSettled(
    specs.map(([coll, keys, opts]) => db.collection(coll).createIndex(keys, opts))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[INDEX] Không tạo được chỉ mục ${specs[i][0]} ${JSON.stringify(specs[i][1])}:`, r.reason.message);
    }
  });
}

async function startServer() {
  try {
    await client.connect();
    // Đặt MONGODB_DB khác để chạy thử trên một database riêng mà không đụng
    // vào dữ liệu đang phục vụ web (cùng cụm Atlas)
    const db = client.db(process.env.MONGODB_DB || 'customer_radar');
    /**
     * Hai kho chạy song song trên cùng cụm Atlas:
     *  - demo: dữ liệu mô phỏng có cài sẵn sự cố (để chứng minh hệ thống bắt được)
     *  - real: chỉ dữ liệu thật thu thập từ sàn, không trộn một bản ghi mô phỏng nào
     * Giao diện chọn kho bằng header X-Workspace; không gửi thì là kho demo như trước.
     */
    const workspaces = {
      demo: db,
      real: client.db(process.env.MONGODB_REAL_DB || 'customer_radar_real')
    };
    console.log('Đã kết nối MongoDB.');

    await Promise.all(Object.values(workspaces).map(ensureIndexes));
    console.log('Đã kiểm tra chỉ mục.');

    // Tài khoản: database riêng, không thuộc kho nào (`npm run seed` không đụng tới).
    // Mặc định theo tên kho demo, nên chạy thử với MONGODB_DB=..._test thì tài
    // khoản cũng nằm trong ..._test_auth, không lẫn vào bản đang phục vụ.
    const auth = require('./services/auth');
    const authDb = client.db(process.env.MONGODB_AUTH_DB || `${db.databaseName}_auth`);
    await auth.ensureAuthIndexes(authDb);
    if (await auth.ensureDemoAccount(authDb)) console.log('Đã tạo tài khoản mẫu cho người xem thử.');
    const adminInfo = await auth.ensureAdminAccount(authDb);
    if (adminInfo) console.log(`Tài khoản quản trị: sẵn sàng (${adminInfo.email}).`);
    else if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) console.log('Tài khoản quản trị: cấu hình chưa hợp lệ nên chưa tạo (xem cảnh báo ngay trên).');
    else console.log('Tài khoản quản trị: chưa cấu hình ADMIN_EMAIL, ADMIN_PASSWORD.');
    console.log(`Tài khoản: database ${authDb.databaseName}.`);

    // Kho riêng từng shop (services/tenants.js): tài khoản mẫu giữ hai kho chung, tài khoản khác có kho thật riêng
    const tenants = require('./services/tenants');
    const demoUser = await authDb.collection('users').findOne({ email: auth.DEMO_ACCOUNT.email }, { projection: { _id: 1 } });
    tenants.init({ client, workspaces, authDb, ensureIndexes, demoUserId: demoUser?._id });
    const tenantCount = await tenants.registerExisting();
    console.log(`Kho riêng của shop: ${tenantCount} kho đã có.`);

    // Muối băm mã khách: từ biến môi trường, không có thì từ kho thật (services/pii_salt.js)
    const saltSource = await require('./services/pii_salt').loadSalt(workspaces.real);
    console.log(saltSource ? `Muối băm mã khách: đã nạp (nguồn ${saltSource === 'env' ? 'biến môi trường' : 'database'}).` : 'Muối băm mã khách: CHƯA CÓ, các đường ghi dữ liệu thật sẽ từ chối.');

    app.use((req, res, next) => {
      const ws = String(req.get('X-Workspace') || req.query.workspace || 'demo').toLowerCase();
      // Chỉ 'demo' hoặc 'real': sổ kho còn chứa kho riêng của từng shop (khóa 't_...'), header không được chọn chúng
      req.workspace = ws === 'real' ? 'real' : 'demo';
      req.db = workspaces[req.workspace];
      next();
    });

    app.get('/', (req, res) => {
      res.json({
        service: 'Customer Radar API',
        status: 'running',
        endpoints: [
          'GET  /api/stats',
          'GET  /api/feedbacks',
          'GET  /api/trust/health',
          'GET  /api/trust/clusters',
          'GET  /api/trust/queue',
          'GET  /api/trust/impact',
          'POST /api/trust/label',
          'GET  /api/alerts',
          'GET  /api/recommendations',
          'POST /api/recommendations/decision',
          'GET  /api/taxonomy',
          'POST /api/analyze',
          'GET  /api/nlp/status'
        ]
      });
    });

    // Đếm yêu cầu lỗi 5xx để quản gia báo Zalo khi lỗi dồn dập (process_health)
    app.use((req, res, next) => {
      res.on('finish', () => {
        if (res.statusCode >= 500) require('./services/process_health').recordError('http', `${req.method} ${req.baseUrl || ''}${req.path}`);
      });
      next();
    });

    /** Kiểm tra sức khỏe dịch vụ, dùng cho giám sát triển khai */
    app.get('/health', async (req, res) => {
      try {
        await db.command({ ping: 1 });
        res.json({ ok: true, db: 'connected', at: new Date().toISOString() });
      } catch (e) {
        res.status(503).json({ ok: false, db: 'disconnected', error: e.message });
      }
    });

    /** Sức khỏe tiến trình, không hỏi cơ sở dữ liệu: bộ nhớ và độ khựng event loop */
    app.get('/health/live', (req, res) => {
      res.json({ ok: true, ...require('./services/process_health').snapshot({ reset: req.query.reset === '1' }) });
    });

    // Livestream: phiên live, bình luận thời gian thực (SSE), hàng đợi trả lời
    // Đăng ký, đăng nhập, phiên (routes/auth.js)
    app.use('/api/auth', require('./routes/auth')(authDb));
    // Từ đây mọi API dữ liệu cần phiên đăng nhập (ngoại lệ và lý do: services/auth.js requireSession)
    app.use('/api', auth.requireSession(authDb));
    // Sau khi biết tài khoản: kho thật của shop là kho riêng, kho mô phỏng chung chỉ đọc
    app.use('/api', tenants.middleware());
    // Gói và thanh toán (routes/billing.js); phần quản trị xác nhận tiền nằm dưới /api/admin/billing
    const billingRoutes = require('./routes/billing')({ authDb });
    app.use('/api/billing', billingRoutes.shop);
    app.use('/api/admin/billing', auth.requireAdmin, billingRoutes.admin);
    if (String(process.env.AUTH_REQUIRED) === '0') console.log('Đăng nhập: TẮT kiểm phiên (AUTH_REQUIRED=0).');
    app.use('/api/admin', auth.requireAdmin, require('./routes/admin')({ authDb, workspaces }));
    app.use('/api/live/schedule', require('./routes/live_schedule'));
    app.use('/api/live', require('./routes/live'));
    let butler = { inbound: null };
    app.use('/api/butler', require('./routes/butler')({ authDb, workspaces, getInbound: () => butler.inbound }));
    app.use('/api', require('./routes/api'));

    app.use((req, res) => {
      res.status(404).json({ error: `Không tìm thấy endpoint: ${req.method} ${req.path}` });
    });

    // Bắt lỗi cuối đường: không để một lỗi chưa xử lý làm sập tiến trình
    app.use((err, req, res, _next) => {
      // JSON hỏng (400) và thân quá lớn (413) là lỗi của request, không phải của máy chủ
      // Lỗi 5xx: chi tiết chỉ ghi vào log, trả câu chung để không lộ tên kho, đường dẫn hay câu truy vấn
      const { status, message } = errorResponse(err);
      if (status >= 500) console.error('[LỖI CHƯA XỬ LÝ]', err);
      res.status(status).json({ error: message });
    });

    app.listen(PORT, () => {
      console.log(`Máy chủ đang chạy tại cổng ${PORT}`);

      // Nạp sẵn dữ liệu + Trust Layer ngay khi khởi động. Không có bước này,
      // người mở trang ĐẦU TIÊN sau mỗi lần triển khai hay Render đánh thức máy
      // chủ phải tự chờ toàn bộ việc đó (đo trên Render: ~18 giây). Request đến
      // trong lúc đang nạp sẽ dùng chung lần nạp này, không nạp lại.
      // Nạp lần lượt (không song song): Trust Layer chạy đồng bộ, hai kho cùng
      // tính một lúc chỉ làm cả hai chậm gấp đôi trên CPU yếu của Render
      const { getContext } = require('./services/analysis_context');
      (async () => {
        for (const [name, wsDb] of Object.entries(workspaces)) {
          const t0 = Date.now();
          try {
            await getContext(wsDb);
            console.log(`Đã nạp sẵn ngữ cảnh kho ${name} (${Date.now() - t0} ms).`);
          } catch (e) {
            console.warn(`Không nạp sẵn được kho ${name}, sẽ nạp ở request đầu tiên:`, e.message);
          }
        }
      })();

      // Kho thật tự thu thập đánh giá mới mỗi 24 giờ, ngay trong máy chủ này.
      // Không cần workflow hay máy nào khác; Render ngủ thì thức dậy là bù.
      if (workspaces.real.databaseName !== workspaces.demo.databaseName) {
        require('./services/real_collector').startAutoCollect(workspaces);
      }
      // Phiên live đang chạy dở trước lần khởi động này (Render triển khai, tự khởi
      // động lại): nối lại ngay để không đứt giữa giờ live
      require('./services/live/hub').autoResume(workspaces)
        .then((list) => { if (list.length) console.log(`[LIVE] Tự nối lại ${list.length} phiên: ${list.map((x) => x.title).join(', ')}`); })
        .catch((e) => console.warn('[LIVE] Tự nối lại lỗi:', e.message));
      // Theo dõi kênh của shop: tự mở phiên khi kênh lên live (services/live/follow.js)
      require('./services/live/follow').startFollowing(workspaces);
      require('./services/butler').startButler({ authDb, workspaces })
        .then((b) => { butler = b; })
        .catch((e) => console.warn('[QUẢN GIA] Không bật được:', e.message));
    });
  } catch (e) {
    console.error('Không kết nối được MongoDB:', e.message);
    process.exit(1);
  }
}

// Render gửi SIGTERM khi triển khai bản mới: ghi nốt bình luận live đang chờ rồi mới tắt
async function shutdown(signal) {
  console.log(`${signal}: ghi nốt bình luận live, đóng kết nối MongoDB...`);
  try { await require('./services/live/hub').flushAll(8000); } catch { /* vẫn tắt */ }
  await client.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
