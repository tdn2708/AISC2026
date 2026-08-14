const { MongoClient } = require('mongodb');
require('dotenv').config(); // Make sure we read the env file

const seedData = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://dangkhoa200388:Khoa200388@cluster0.b739v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('customer_radar');
    const col = db.collection('feedbacks');

    // Clear existing data
    await col.deleteMany({});
    console.log('Cleared old feedbacks.');

    // Helper to generate a random date within the last N days
    const getRandomDate = (daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      return date;
    };

    const products = ['iPhone 15 Pro Max', 'Samsung Galaxy S24', 'MacBook Air M3', 'Sony WH-1000XM5'];
    const sources = ['Facebook', 'Shopee', 'TikTok', 'Web'];

    const mockData = [
      // iPhone 15 Pro Max
      { source: 'Shopee', productName: 'iPhone 15 Pro Max', originalText: 'Giao hàng quá chậm, bưu kiện bị móp méo', category: 'Delivery', subCategory: 'Late Delivery', sentiment: 'Negative', severity: 'High', riskFlag: true, aiSummary: 'Khách hàng phàn nàn về tốc độ giao hàng và chất lượng đóng gói.', timestamp: getRandomDate(5) },
      { source: 'Facebook', productName: 'iPhone 15 Pro Max', originalText: 'Sản phẩm xài mượt, camera rất đẹp. Tuyệt vời!', category: 'Product Quality', subCategory: 'Camera', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Khách hàng khen ngợi camera và hiệu năng.', timestamp: getRandomDate(10) },
      { source: 'TikTok', productName: 'iPhone 15 Pro Max', originalText: 'Máy thỉnh thoảng bị nóng khi chơi game nặng.', category: 'Product Quality', subCategory: 'Overheating', sentiment: 'Neutral', severity: 'Medium', riskFlag: false, aiSummary: 'Phản ánh tình trạng nóng máy khi tải nặng.', timestamp: getRandomDate(15) },
      { source: 'Web', productName: 'iPhone 15 Pro Max', originalText: 'Hỗ trợ bảo hành cực kì tệ, gọi tổng đài không ai bắt máy.', category: 'Customer Service', subCategory: 'Unresponsive', sentiment: 'Negative', severity: 'Critical', riskFlag: true, aiSummary: 'Khách tức giận vì tổng đài không hỗ trợ bảo hành.', timestamp: getRandomDate(3) },
      { source: 'Shopee', productName: 'iPhone 15 Pro Max', originalText: 'Giá hơi chát nhưng bù lại chất lượng rất đáng tiền.', category: 'Pricing', subCategory: 'Expensive', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Khách hàng hài lòng với chất lượng dù giá cao.', timestamp: getRandomDate(20) },

      // Samsung Galaxy S24
      { source: 'TikTok', productName: 'Samsung Galaxy S24', originalText: 'Sản phẩm dùng tốt, nhưng app ngân hàng thỉnh thoảng bị lỗi.', category: 'Software', subCategory: 'App Error', sentiment: 'Neutral', severity: 'Medium', riskFlag: false, aiSummary: 'Lỗi tương thích phần mềm.', timestamp: getRandomDate(2) },
      { source: 'Facebook', productName: 'Samsung Galaxy S24', originalText: 'Hàng bị vỡ màn hình khi mở hộp, yêu cầu hoàn tiền gấp!', category: 'Product Quality', subCategory: 'Damaged', sentiment: 'Negative', severity: 'Critical', riskFlag: true, aiSummary: 'Hàng hỏng hóc nghiêm trọng, khách đòi hoàn tiền.', timestamp: getRandomDate(1) },
      { source: 'Shopee', productName: 'Samsung Galaxy S24', originalText: 'Giao hỏa tốc 2h nhận được luôn, shop đóng gói cẩn thận', category: 'Delivery', subCategory: 'Fast Delivery', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Khen ngợi tốc độ giao hàng hỏa tốc.', timestamp: getRandomDate(12) },
      { source: 'Web', productName: 'Samsung Galaxy S24', originalText: 'Pin tụt nhanh quá, không như quảng cáo.', category: 'Product Quality', subCategory: 'Battery', sentiment: 'Negative', severity: 'High', riskFlag: true, aiSummary: 'Phàn nàn về thời lượng pin.', timestamp: getRandomDate(25) },
      
      // MacBook Air M3
      { source: 'Facebook', productName: 'MacBook Air M3', originalText: 'Máy nhẹ, pin trâu, code cực sướng.', category: 'Product Quality', subCategory: 'Performance', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Đánh giá cao hiệu năng và pin.', timestamp: getRandomDate(8) },
      { source: 'Shopee', productName: 'MacBook Air M3', originalText: 'Shop tư vấn sai cấu hình, tôi muốn đổi trả.', category: 'Customer Service', subCategory: 'Misinformation', sentiment: 'Negative', severity: 'High', riskFlag: true, aiSummary: 'Nhân viên tư vấn sai, khách yêu cầu đổi trả.', timestamp: getRandomDate(4) },
      { source: 'Web', productName: 'MacBook Air M3', originalText: 'Màu midnight dễ bám vân tay ghê.', category: 'Product Quality', subCategory: 'Design', sentiment: 'Neutral', severity: 'Medium', riskFlag: false, aiSummary: 'Nhận xét về bề mặt dễ bám vân tay.', timestamp: getRandomDate(18) },
      
      // Sony WH-1000XM5
      { source: 'TikTok', productName: 'Sony WH-1000XM5', originalText: 'Chống ồn đỉnh chóp, đeo cả ngày không đau tai.', category: 'Product Quality', subCategory: 'Comfort', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Khen ngợi tính năng chống ồn và cảm giác đeo.', timestamp: getRandomDate(7) },
      { source: 'Shopee', productName: 'Sony WH-1000XM5', originalText: 'Bị hỏng một bên tai nghe sau 1 tuần sử dụng, cần bảo hành.', category: 'Product Quality', subCategory: 'Defective', sentiment: 'Negative', severity: 'Critical', riskFlag: true, aiSummary: 'Sản phẩm lỗi phần cứng, cần hỗ trợ gấp.', timestamp: getRandomDate(2) },
      { source: 'Facebook', productName: 'Sony WH-1000XM5', originalText: 'Giá đang sale quá rẻ, giao hàng đóng gói rất kỹ.', category: 'Pricing', subCategory: 'Discount', sentiment: 'Positive', severity: 'Low', riskFlag: false, aiSummary: 'Hài lòng về giá và đóng gói.', timestamp: getRandomDate(14) }
    ];

    await col.insertMany(mockData);
    console.log(`Inserted ${mockData.length} records successfully!`);

  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await client.close();
  }
};

seedData();
