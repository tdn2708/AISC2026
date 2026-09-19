require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

if (!process.env.MONGODB_URI) {
  console.error('Thiếu MONGODB_URI trong .env — không thể khởi động.');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

/**
 * Chỉ mục cần thiết cho các truy vấn hay dùng. Tạo lúc khởi động để
 * không phải nhớ chạy tay sau mỗi lần triển khai mới.
 */
async function ensureIndexes(db) {
  await Promise.all([
    db.collection('feedbacks').createIndex({ timestamp: -1 }),
    db.collection('feedbacks').createIndex({ productName: 1, timestamp: -1 }),
    db.collection('feedbacks').createIndex({ source: 1, timestamp: -1 }),
    db.collection('transactions').createIndex({ orderId: 1 }, { unique: true }),
    db.collection('review_labels').createIndex({ feedbackId: 1 }, { unique: true }),
    db.collection('recommendation_log').createIndex({ alertId: 1 }, { unique: true })
  ]);
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
      console.error('[LỖI CHƯA XỬ LÝ]', err);
      res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
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
