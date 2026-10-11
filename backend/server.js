require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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

const client = new MongoClient(process.env.MONGODB_URI);

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason, promise) => {
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
    ['review_labels', { feedbackId: 1 }, { unique: true }],
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
    const db = client.db('customer_radar');
    console.log('Đã kết nối MongoDB.');

    await ensureIndexes(db);
    console.log('Đã kiểm tra chỉ mục.');

    app.use((req, res, next) => {
      req.db = db;
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

    /** Kiểm tra sức khỏe dịch vụ, dùng cho giám sát triển khai */
    app.get('/health', async (req, res) => {
      try {
        await db.command({ ping: 1 });
        res.json({ ok: true, db: 'connected', at: new Date().toISOString() });
      } catch (e) {
        res.status(503).json({ ok: false, db: 'disconnected', error: e.message });
      }
    });

    app.use('/api', require('./routes/api'));

    app.use((req, res) => {
      res.status(404).json({ error: `Không tìm thấy endpoint: ${req.method} ${req.path}` });
    });

    // Bắt lỗi cuối đường: không để một lỗi chưa xử lý làm sập tiến trình
    app.use((err, req, res, _next) => {
      // JSON hỏng (400) và thân quá lớn (413) là lỗi của request, không phải của máy chủ
      const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
      if (status >= 500) console.error('[LỖI CHƯA XỬ LÝ]', err);
      const message =
        err.type === 'entity.parse.failed' ? 'Thân request không phải JSON hợp lệ'
          : err.type === 'entity.too.large' ? 'Thân request vượt quá 2MB'
            : err.message || 'Lỗi máy chủ';
      res.status(status).json({ error: message });
    });

    app.listen(PORT, () => {
      console.log(`Máy chủ đang chạy tại cổng ${PORT}`);
    });
  } catch (e) {
    console.error('Không kết nối được MongoDB:', e.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nĐang đóng kết nối MongoDB...');
  await client.close();
  process.exit(0);
});

startServer();
