const { MongoClient } = require('mongodb');
require('dotenv').config();

const seedMassiveData = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    return;
  }
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('customer_radar');
    const col = db.collection('feedbacks');

    await col.deleteMany({});
    console.log('Cleared old feedbacks.');

    const getRandomDate = (daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      return date;
    };

    const products = ['iPhone 15 Pro Max', 'Samsung Galaxy S24', 'MacBook Air M3', 'Sony WH-1000XM5', 'Dyson V15 Detect', 'Nintendo Switch OLED'];
    const sources = ['Facebook', 'Shopee', 'TikTok', 'Web', 'Lazada'];
    const authors = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Hoàng C', 'Phạm Minh D', 'Hoàng Ngọc E', 'Đinh Hữu F', 'Bùi Xuân G', 'Anonymous', 'User123', 'TechReviewer', 'MuaSamMoiNgay'];

    const templates = [
      {
        sentiment: 'Positive', severity: 'Low', riskFlag: false,
        categories: [
          { cat: 'Product Quality', sub: 'Performance', texts: ['Sản phẩm dùng cực kỳ mượt mà, vượt ngoài mong đợi.', 'Chất lượng quá tốt so với tầm giá.', 'Máy chạy siêu nhanh, không có độ trễ.', 'Hiệu năng đỉnh cao, thiết kế sang trọng.'] },
          { cat: 'Delivery', sub: 'Fast Delivery', texts: ['Giao hàng siêu tốc, đóng gói cực kỳ cẩn thận.', 'Mới đặt hôm qua hôm nay đã nhận được hàng.', 'Shipper nhiệt tình, hộp nguyên vẹn.'] },
          { cat: 'Customer Service', sub: 'Helpful', texts: ['Nhân viên tư vấn rất nhiệt tình và chu đáo.', 'Shop hỗ trợ kỹ thuật rất nhanh chóng.', 'Dịch vụ sau bán hàng 10 điểm.'] }
        ]
      },
      {
        sentiment: 'Negative', severity: 'High', riskFlag: true,
        categories: [
          { cat: 'Product Quality', sub: 'Defective', texts: ['Vừa khui hộp đã thấy trầy xước, yêu cầu đổi trả.', 'Sản phẩm không hoạt động, cắm điện không lên.', 'Dùng được 3 ngày thì hỏng màn hình, quá thất vọng.', 'Pin tụt nhanh như tụt quần, quảng cáo sai sự thật.'] },
          { cat: 'Delivery', sub: 'Damaged', texts: ['Giao hàng làm móp hết hộp, ảnh hưởng bên trong.', 'Hàng bị vỡ nát khi nhận, thái độ shipper rất tệ.'] },
          { cat: 'Customer Service', sub: 'Unresponsive', texts: ['Nhắn tin shop không trả lời, gọi tổng đài không ai nghe máy.', 'Bảo hành quá chậm, giam máy của tôi hơn tháng trời.', 'Thái độ nhân viên vô cùng hống hách.'] }
        ]
      },
      {
        sentiment: 'Neutral', severity: 'Medium', riskFlag: false,
        categories: [
          { cat: 'Pricing', sub: 'Expensive', texts: ['Giá hơi cao nhưng chất lượng tạm ổn.', 'Mua đúng lúc không sale nên thấy hơi đắt.', 'Cũng được, tiền nào của nấy.'] },
          { cat: 'Product Quality', sub: 'Design', texts: ['Thiết kế bình thường, không có gì nổi bật.', 'Màu sắc ngoài đời hơi khác so với trong ảnh.', 'Chất liệu bám vân tay hơi nhiều nhưng lau là sạch.'] },
          { cat: 'Software', sub: 'Bug', texts: ['Lâu lâu bị văng app nhưng khởi động lại thì dùng bình thường.', 'Cần cập nhật phần mềm mượt hơn.'] }
        ]
      }
    ];

    const generateFeedback = () => {
      const templateGroup = templates[Math.floor(Math.random() * templates.length)];
      const categoryGroup = templateGroup.categories[Math.floor(Math.random() * templateGroup.categories.length)];
      const text = categoryGroup.texts[Math.floor(Math.random() * categoryGroup.texts.length)];
      
      let aiSummary = '';
      if (templateGroup.sentiment === 'Positive') aiSummary = 'Khách hàng đánh giá rất cao về ' + categoryGroup.cat.toLowerCase() + '.';
      else if (templateGroup.sentiment === 'Negative') aiSummary = 'Khách hàng phàn nàn và bức xúc về vấn đề ' + categoryGroup.sub.toLowerCase() + '.';
      else aiSummary = 'Khách hàng nhận xét trung lập về ' + categoryGroup.cat.toLowerCase() + '.';

      // Add critical severity 30% of the time for negative feedbacks
      let severity = templateGroup.severity;
      if (templateGroup.sentiment === 'Negative' && Math.random() < 0.3) {
        severity = 'Critical';
      }

      return {
        source: sources[Math.floor(Math.random() * sources.length)],
        productName: products[Math.floor(Math.random() * products.length)],
        author: authors[Math.floor(Math.random() * authors.length)],
        originalText: text,
        category: categoryGroup.cat,
        subCategory: categoryGroup.sub,
        sentiment: templateGroup.sentiment,
        severity: severity,
        riskFlag: templateGroup.riskFlag,
        aiSummary: aiSummary,
        timestamp: getRandomDate(60) // within last 60 days
      };
    };

    const massiveData = [];
    for (let i = 0; i < 200; i++) {
      massiveData.push(generateFeedback());
    }

    await col.insertMany(massiveData);
    console.log(`Successfully generated and inserted ${massiveData.length} records!`);

  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await client.close();
  }
};

seedMassiveData();
