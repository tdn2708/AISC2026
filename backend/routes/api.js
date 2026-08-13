const express = require('express');
const router = express.Router();
const { scrapeShopeeReviews } = require('../services/scraper');
const { analyzeFeedbackBatch } = require('../services/ai_analyzer');

const buildFilterQuery = (req) => {
  const { source, time } = req.query;
  let query = {};
  if (source && source !== 'All') query.source = source;
  if (time && time !== 'All') {
    const now = new Date();
    let startDate;
    let endDate;
    
    if (time.startsWith('Custom:')) {
      const parts = time.split(':');
      if (parts.length === 3) {
        startDate = new Date(parts[1]);
        startDate.setHours(0,0,0,0);
        endDate = new Date(parts[2]);
        endDate.setHours(23,59,59,999);
      }
    } else if (time === 'Today') {
      startDate = new Date(now.setHours(0,0,0,0));
    } else if (time === 'This Week') { 
      startDate = new Date(); startDate.setDate(now.getDate() - 7); 
    } else if (time === 'This Month') { 
      startDate = new Date(); startDate.setMonth(now.getMonth() - 1); 
    }
    
    if (startDate) {
      query.timestamp = { $gte: startDate };
      if (endDate) {
        query.timestamp.$lte = endDate;
      }
    }
  }
  return query;
};

router.get('/feedbacks', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    const feedbacks = await req.db.collection('feedbacks').find(query).sort({ timestamp: -1 }).toArray();
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/segments', async (req, res) => {
  try {
    const rawFeedbacks = await req.db.collection('feedbacks').find().toArray();
    
    // Process segments in JS for simplicity
    const userMap = {};
    rawFeedbacks.forEach(fb => {
      const author = fb.author || 'Anonymous';
      if (!userMap[author]) {
        userMap[author] = { author, total: 0, positive: 0, negative: 0, neutral: 0, critical: 0, latestFeedback: fb.timestamp };
      }
      userMap[author].total += 1;
      if (fb.sentiment === 'Positive') userMap[author].positive += 1;
      if (fb.sentiment === 'Negative') userMap[author].negative += 1;
      if (fb.sentiment === 'Neutral') userMap[author].neutral += 1;
      if (fb.severity === 'Critical') userMap[author].critical += 1;
      
      if (new Date(fb.timestamp) > new Date(userMap[author].latestFeedback)) {
        userMap[author].latestFeedback = fb.timestamp;
      }
    });

    const segments = {
      promoters: [],
      atRisk: [],
      passives: []
    };

    Object.values(userMap).forEach(user => {
      if (user.critical > 0 || user.negative > 0) {
        user.segment = 'At-Risk';
        segments.atRisk.push(user);
      } else if (user.positive >= user.neutral) {
        user.segment = 'Promoter';
        segments.promoters.push(user);
      } else {
        user.segment = 'Passive';
        segments.passives.push(user);
      }
    });

    res.json(segments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    const total = await req.db.collection('feedbacks').countDocuments(query);
    res.json({
      totalComplaints: total,
      complaintRate: total > 0 ? "1.5%" : "0%",
      avgResolutionTime: total > 0 ? "4.5 hrs" : "0 hrs"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    const data = await req.db.collection('feedbacks').aggregate([
      { $match: query },
      { $group: { _id: "$category", value: { $sum: 1 } } },
      { $project: { name: "$_id", value: 1, _id: 0 } },
      { $sort: { value: -1 } }
    ]).toArray();
    
    const colorMap = {
      'Delivery': 'var(--accent-blue)',
      'Product Quality': 'var(--accent-purple)',
      'Customer Service': 'var(--accent-cyan)',
      'Payment': 'var(--accent-indigo)',
      'Technical Issue': '#f59e0b',
      'Refund': '#ef4444',
      'Other': '#94a3b8'
    };
    const formattedData = data.map(item => ({
      ...item,
      fill: colorMap[item.name] || colorMap['Other']
    }));
    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sentiment', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    const data = await req.db.collection('feedbacks').aggregate([
      { $match: query },
      { $group: { _id: "$sentiment", value: { $sum: 1 } } },
      { $project: { name: "$_id", value: 1, _id: 0 } }
    ]).toArray();
    
    const colorMap = {
      'Negative': 'var(--risk-critical)',
      'Neutral': 'var(--risk-medium)',
      'Positive': 'var(--risk-low)'
    };
    const formattedData = data.map(item => ({
      ...item,
      fill: colorMap[item.name] || '#ccc'
    }));
    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    // Sort oldest first to build timeline
    const feedbacks = await req.db.collection('feedbacks').find(query).sort({ timestamp: 1 }).toArray();
    
    const NUM_POINTS = 6;

    if (feedbacks.length === 0) {
      return res.json(Array.from({length: NUM_POINTS}).map(() => ({
        name: '--/--', complaints: 0, satisfaction: 0
      })));
    }

    let startTime = new Date(feedbacks[0].timestamp).getTime();
    let endTime = new Date(feedbacks[feedbacks.length - 1].timestamp).getTime();
    
    // Nếu tất cả dữ liệu thu thập cùng một tích tắc, nới rộng trục thời gian ra 1 tiếng
    if (endTime - startTime < 1000) {
       startTime -= 30 * 60 * 1000;
       endTime += 30 * 60 * 1000;
    }
    
    const binDuration = (endTime - startTime) / NUM_POINTS;
    
    const trendData = Array.from({length: NUM_POINTS}).map((_, i) => {
      const binCenter = new Date(startTime + (i + 0.5) * binDuration);
      const day = String(binCenter.getDate()).padStart(2, '0');
      const month = String(binCenter.getMonth() + 1).padStart(2, '0');
      const hours = String(binCenter.getHours()).padStart(2, '0');
      const minutes = String(binCenter.getMinutes()).padStart(2, '0');
      return {
        name: `${day}/${month} ${hours}:${minutes}`,
        complaints: 0,
        satisfaction: 0
      };
    });

    feedbacks.forEach(fb => {
      const fbTime = new Date(fb.timestamp).getTime();
      let binIndex = Math.floor((fbTime - startTime) / binDuration);
      
      if (binIndex >= NUM_POINTS) binIndex = NUM_POINTS - 1;
      if (binIndex < 0) binIndex = 0;
      
      if (fb.sentiment === 'Negative') trendData[binIndex].complaints += 1;
      if (fb.sentiment === 'Positive') trendData[binIndex].satisfaction += 1;
    });

    res.json(trendData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/risks', async (req, res) => {
  try {
    const query = buildFilterQuery(req);
    query.severity = { $in: ['High', 'Critical'] };
    query.riskFlag = true;

    const highRisks = await req.db.collection('feedbacks')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    if(highRisks.length === 0) {
       return res.json([]); 
    }
    
    const alerts = highRisks.map(risk => ({
      id: risk._id,
      issue: risk.category + (risk.subCategory ? ` - ${risk.subCategory}` : ''),
      increase: "Tăng đột biến", 
      riskLevel: risk.severity.toUpperCase(),
      insight: risk.aiSummary || `Phát hiện vấn đề nghiêm trọng từ nguồn: ${risk.source}`,
      recommendations: ["Chuyển tiếp báo cáo cho bộ phận liên quan để xử lý ngay lập tức."]
    }));
    
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    // Bước 1: Cào dữ liệu thô
    const rawReviews = await scrapeShopeeReviews(url);
    
    // Bước 2: Dùng AI phân tích toàn bộ mảng trong 1 lần gọi (Batch)
    const rawTexts = rawReviews.map(r => r.rawText);
    const aiResults = await analyzeFeedbackBatch(rawTexts);
    
    const analyzedData = rawReviews.map((review, index) => ({
      source: review.source,
      originalText: review.rawText,
      author: review.author,
      timestamp: review.timestamp,
      ...(aiResults[index] || {}) // Merge category, sentiment, severity, riskFlag, aiSummary
    }));

    // Bước 3: Lưu vào MongoDB (append thay vì xóa cũ)
    const col = req.db.collection('feedbacks');
    await col.insertMany(analyzedData);

    // Bước 4: Xóa sạch bộ nhớ đệm AI (predictions cache) để Dashboard buộc phải phân tích lại data mới
    await req.db.collection('predictions').deleteMany({});

    res.json({ 
      message: "Scrape & Batch AI Analysis thành công!", 
      count: analyzedData.length,
      data: analyzedData 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const col = req.db.collection('feedbacks');
    await col.deleteMany({});
    
    const sampleData = [
      { source: 'Facebook', originalText: 'Giao hàng quá chậm, bưu kiện bị móp méo', category: 'Delivery', subCategory: 'Late Delivery', sentiment: 'Negative', severity: 'High', riskFlag: true, aiSummary: 'Khách hàng phàn nàn về tốc độ giao hàng và chất lượng đóng gói.', timestamp: new Date() },
      { source: 'TikTok', originalText: 'Sản phẩm dùng tốt, nhưng app thỉnh thoảng bị lỗi thanh toán', category: 'Payment', subCategory: 'App Error', sentiment: 'Neutral', severity: 'Medium', riskFlag: false, aiSummary: 'Lỗi thanh toán trên ứng dụng.', timestamp: new Date() },
      { source: 'Other', originalText: 'Sản phẩm tuyệt vời, sẽ mua lại', category: 'Product Quality', subCategory: 'Good Quality', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Khen ngợi chất lượng sản phẩm.', timestamp: new Date() },
      { source: 'Facebook', originalText: 'Hàng bị vỡ khi mở hộp, yêu cầu hoàn tiền gấp!', category: 'Product Quality', subCategory: 'Damaged', sentiment: 'Negative', severity: 'Critical', riskFlag: true, aiSummary: 'Hàng hỏng hóc nghiêm trọng, khách đòi hoàn tiền.', timestamp: new Date() },
    ];
    
    await col.insertMany(sampleData);
    res.json({ message: "Seed data thành công bằng Native Driver!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 8. AI PREDICTION ENDPOINTS (CACHING STRATEGY)
// ==========================================

// Lấy dự đoán đã lưu sẵn (Độ trễ 0s)
router.get('/predict', async (req, res) => {
  try {
    const { source = 'All', time = 'All' } = req.query;
    
    const cachedPrediction = await req.db.collection('predictions').findOne(
      { source, time }, 
      { sort: { timestamp: -1 } }
    );
    
    if (cachedPrediction) {
      return res.json({ success: true, data: cachedPrediction.data, cached: true });
    }
    
    // Nếu chưa có cache, báo lỗi nhẹ để Frontend gọi Refresh
    res.json({ success: true, data: null, message: "No cached prediction found" });
  } catch (error) {
    console.error('Lỗi khi lấy cache dự báo:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Chạy AI phân tích dữ liệu mới và lưu lại
router.post('/predict/refresh', async (req, res) => {
  try {
    const { source = 'All', time = 'All' } = req.body;
    
    // Tạo giả lập req.query để tái sử dụng buildFilterQuery
    const mockReq = { query: { source, time } };
    const query = buildFilterQuery(mockReq);

    const { generatePrediction } = require('../services/ai_analyzer');
    // Lấy toàn bộ feedback thỏa mãn filter (giới hạn an toàn ở mức 500 để không vượt quá context window)
    const feedbacks = await req.db.collection('feedbacks').find(query).sort({ timestamp: -1 }).limit(500).toArray();
    
    if (feedbacks.length === 0) {
      return res.status(400).json({ success: false, message: 'Chưa có dữ liệu để phân tích cho bộ lọc này.' });
    }

    const prediction = await generatePrediction(feedbacks, time);

    // Xóa cache cũ cho đúng bộ lọc này và lưu cache mới
    await req.db.collection('predictions').deleteMany({ source, time });
    await req.db.collection('predictions').insertOne({
      source,
      time,
      timestamp: new Date(),
      data: prediction
    });

    res.json({ success: true, data: prediction, cached: false });
  } catch (error) {
    console.error('Lỗi khi refresh dự báo:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ==========================================
// 9. AI COPILOT CHAT ENDPOINT
// ==========================================
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const { chatWithData } = require('../services/ai_analyzer');
    // Fetch up to 50 latest feedbacks to provide context
    const feedbacks = await req.db.collection('feedbacks').find().sort({ timestamp: -1 }).limit(50).toArray();
    
    const aiResponse = await chatWithData(message, feedbacks);

    res.json({ success: true, text: aiResponse });
  } catch (error) {
    console.error('Lỗi khi chat AI:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
