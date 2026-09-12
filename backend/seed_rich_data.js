/**
 * SINH DỮ LIỆU THỬ NGHIỆM CÓ CẤU TRÚC THẬT
 * ==================================================================
 * Khác với seed cũ (chỉ rải ngẫu nhiên các câu mẫu), bộ sinh này dựng
 * lại đúng những hiện tượng mà Trust Layer sinh ra để đối phó:
 *
 *   - nền phản hồi thật, phân bố lệch, có ngoại lệ;
 *   - MỘT ĐỢT ĐÁNH GIÁ TĂNG CƯỜNG (seeding): 5 sao, nội dung na ná
 *     nhau, đăng dồn trong một buổi tối, từ tài khoản mới lập;
 *   - MỘT ĐỢT ĐÁNH GIÁ HẠ UY TÍN do đối thủ đặt: 1 sao, thành cụm;
 *   - bình luận quảng cáo và bot có số điện thoại, đường dẫn;
 *   - đánh giá rỗng nghĩa (một chữ "ok") để nhận xu;
 *   - MỘT SỰ CỐ GIAO HÀNG CÓ THẬT, tăng dần trong 6 ngày gần nhất —
 *     đây là thứ hệ thống PHẢI phát hiện được;
 *   - dữ liệu giao dịch (mẫu số của WCR) đi kèm.
 *
 * Chạy: node seed_realistic_data.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const PRODUCTS = [
  'Tai nghe Sony WH-1000XM5',
  'Điện thoại Samsung Galaxy S24',
  'Máy lọc không khí Xiaomi',
  'Nồi chiên không dầu Lock&Lock',
  'Áo khoác gió Uniqlo'
];

const REGIONS = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Bình Dương'];

const REAL_CUSTOMERS = [
  'Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Thị Cẩm', 'Phạm Hoàng Duy', 'Đỗ Thu Hà',
  'Vũ Đình Khoa', 'Bùi Ngọc Lan', 'Hoàng Văn Nam', 'Đặng Thị Oanh', 'Ngô Tấn Phát',
  'Lý Thanh Quyên', 'Trương Bá Sơn', 'Mai Thị Trang', 'Phan Anh Tuấn', 'Cao Diệu Vy'
];

/** Phản hồi tiêu cực thật, viết như người Việt viết trên sàn */
const NEGATIVE_TEMPLATES = [
  { text: 'Giao chậm quá shop ơi, đặt 5 ngày rồi mà vẫn chưa thấy hàng đâu', cat: 'Delivery', sub: 'LateDelivery' },
  { text: 'Đơn hàng bị giao trễ gần một tuần, gọi hỏi thì không ai nghe máy', cat: 'Delivery', sub: 'LateDelivery' },
  { text: 'Hộp bị móp hết một góc, bên trong cũng bị xước, đóng gói ẩu quá', cat: 'Delivery', sub: 'DamagedInTransit' },
  { text: 'Nhận hàng thì thùng rách nát, chắc quăng quật dọc đường rồi', cat: 'Delivery', sub: 'DamagedInTransit' },
  { text: 'Shipper thái độ cộc lốc, ném hàng trước cửa rồi đi thẳng', cat: 'Delivery', sub: 'CourierAttitude' },
  { text: 'Máy dùng được 3 ngày là chết máy luôn, không lên nguồn được nữa', cat: 'ProductQuality', sub: 'TechnicalDefect' },
  { text: 'Pin tụt nhanh kinh khủng, không giống như quảng cáo chút nào', cat: 'ProductQuality', sub: 'TechnicalDefect' },
  { text: 'Màu ngoài đời khác hẳn ảnh trên trang, không đúng mô tả gì cả', cat: 'ProductQuality', sub: 'NotAsDescribed' },
  { text: 'Mở hộp ra thiếu cáp sạc, shop kiểm hàng kiểu gì vậy', cat: 'ProductQuality', sub: 'MissingAccessory' },
  { text: 'Nhắn tin cho shop 2 ngày không rep, gọi tổng đài cũng không ai nghe máy', cat: 'CustomerService', sub: 'SlowResponse' },
  { text: 'Nhân viên tư vấn sai thông tin bảo hành, giờ đòi đổi thì không cho', cat: 'CustomerService', sub: 'WrongInformation' },
  { text: 'Thái độ nhân viên lồi lõm, nói chuyện cộc lốc với khách', cat: 'CustomerService', sub: 'BadAttitude' },
  { text: 'Thanh toán bị trừ tiền hai lần mà đơn vẫn báo chưa thanh toán', cat: 'Payment', sub: 'DoubleCharge' },
  { text: 'Không thanh toán được, cổng thanh toán báo lỗi suốt buổi tối', cat: 'Payment', sub: 'GatewayError' },
  { text: 'Mã giảm giá lỗi, không áp mã được dù còn hạn sử dụng', cat: 'Payment', sub: 'WrongPromotion' },
  { text: 'App lag quá, mỗi lần mở là văng app ra ngoài luôn', cat: 'TechnicalApp', sub: 'AppSlowOrCrash' },
  { text: 'Không đăng nhập được vào tài khoản mấy hôm nay rồi', cat: 'TechnicalApp', sub: 'LoginError' },
  { text: 'Đợi hoàn tiền hơn 2 tuần rồi mà chưa thấy tiền về', cat: 'ReturnRefund', sub: 'SlowRefund' },
  { text: 'Shop từ chối trả hàng dù còn nguyên seal, thủ tục rườm rà quá', cat: 'ReturnRefund', sub: 'ReturnRejected' },
  { text: 'Giá cao hơn hẳn chỗ khác mà chất lượng thì không đáng tiền', cat: 'PricePromotion', sub: 'HigherThanExpected' }
];

const POSITIVE_TEMPLATES = [
  { text: 'Giao hàng nhanh, đóng gói cẩn thận, sản phẩm đúng như mô tả', cat: 'Delivery', sub: null },
  { text: 'Dùng rất ổn so với tầm giá này, mình sẽ ủng hộ shop tiếp', cat: 'ProductQuality', sub: null },
  { text: 'Nhân viên tư vấn nhiệt tình, giải đáp rõ ràng từng thắc mắc', cat: 'CustomerService', sub: null },
  { text: 'Shipper dễ thương, gọi trước khi giao, hàng nguyên vẹn', cat: 'Delivery', sub: null },
  { text: 'Chất lượng tốt hơn mình nghĩ, đáng đồng tiền bát gạo', cat: 'ProductQuality', sub: null },
  { text: 'Đặt tối hôm trước sáng hôm sau đã nhận được hàng rồi', cat: 'Delivery', sub: null }
];

const NEUTRAL_TEMPLATES = [
  { text: 'Hàng cũng tạm được, không có gì đặc biệt để nói thêm', cat: 'ProductQuality', sub: null },
  { text: 'Giao đúng hẹn, sản phẩm bình thường, đúng như giá tiền', cat: 'Delivery', sub: null },
  { text: 'Màu hơi khác ảnh một chút nhưng vẫn chấp nhận được', cat: 'ProductQuality', sub: 'NotAsDescribed' }
];

const AD_TEMPLATES = [
  'Cần tuyển CTV bán hàng online sỉ lẻ toàn quốc, hoa hồng cao, inbox mình 0912345678',
  'Vay nhanh trong ngày, lãi suất thấp, giải ngân 30 phút, liên hệ zalo 0987654321',
  'Xả kho giá sốc, ib mình nhận mã giảm giá SALE50K, freeship toàn quốc nhé',
  'Việc nhẹ lương cao làm tại nhà, thu nhập 500k/ngày, lh 0356789123 để biết thêm'
];

const SEEDING_TEMPLATES = [
  'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ ủng hộ tiếp',
  'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói kỹ, mình rất hài lòng sẽ ủng hộ tiếp',
  'Sản phẩm tốt lắm, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ mua tiếp'
];

const SMEAR_TEMPLATES = [
  'Hàng kém chất lượng, shop lừa đảo, mọi người đừng mua ở đây, phí tiền',
  'Hàng kém chất lượng, shop lừa đảo, mọi người tránh xa shop này ra, phí tiền',
  'Hàng quá kém chất lượng, shop lừa đảo, mọi người đừng mua của shop này, phí tiền'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const hoursAgo = (h) => new Date(Date.now() - h * 3600000);

function buildDataset() {
  const feedbacks = [];
  const orders = [];
  let orderSeq = 1000;

  const makeOrder = (productName, deliveredDaysAgo) => {
    const orderId = 'OD' + orderSeq++;
    orders.push({
      orderId,
      productName,
      region: pick(REGIONS),
      orderedAt: daysAgo(deliveredDaysAgo + 3),
      deliveredAt: daysAgo(deliveredDaysAgo),
      amount: 200000 + Math.floor(Math.random() * 4000000)
    });
    return orderId;
  };

  // ------------------------------------------------------------------
  // 1) NỀN PHẢN HỒI THẬT — 60 ngày, phân bố lệch về phía tích cực
  // ------------------------------------------------------------------
  for (let i = 0; i < 420; i++) {
    const ageDays = Math.random() * 60;
    const roll = Math.random();
    let tpl;
    let sentiment;
    let rating;

    if (roll < 0.28) {
      tpl = pick(NEGATIVE_TEMPLATES);
      sentiment = 'Negative';
      rating = Math.random() < 0.6 ? 1 : 2;
    } else if (roll < 0.45) {
      tpl = pick(NEUTRAL_TEMPLATES);
      sentiment = 'Neutral';
      rating = 3;
    } else {
      tpl = pick(POSITIVE_TEMPLATES);
      sentiment = 'Positive';
      rating = Math.random() < 0.7 ? 5 : 4;
    }

    const product = pick(PRODUCTS);
    const sourceRoll = Math.random();
    let source;
    let orderId = null;
    if (sourceRoll < 0.4) {
      source = 'Shopee';
      orderId = makeOrder(product, Math.min(59, ageDays + 2));
    } else if (sourceRoll < 0.55) {
      source = 'TikTok';
    } else if (sourceRoll < 0.75) {
      source = 'Facebook';
    } else if (sourceRoll < 0.9) {
      source = 'CSKH';
    } else {
      source = 'Lazada';
    }

    feedbacks.push({
      source,
      productName: product,
      region: pick(REGIONS),
      originalText: tpl.text,
      author: pick(REAL_CUSTOMERS),
      customerId: source === 'CSKH' ? 'CUS' + Math.floor(Math.random() * 900 + 100) : null,
      orderId,
      accountAgeDays: 60 + Math.floor(Math.random() * 900),
      rating,
      category: tpl.cat,
      subCategory: tpl.sub,
      sentiment,
      timestamp: daysAgo(ageDays)
    });
  }

  // ------------------------------------------------------------------
  // 2) SỰ CỐ GIAO HÀNG CÓ THẬT — tăng dần 6 ngày gần nhất, khu vực TP.HCM
  //    Đây là thứ hệ thống PHẢI phát hiện, và phát hiện SỚM
  // ------------------------------------------------------------------
  const incidentProduct = PRODUCTS[0];
  for (let d = 6; d >= 0; d--) {
    const count = Math.round(3 + (6 - d) * 2.5); // 3 -> 18 phản hồi/ngày
    for (let k = 0; k < count; k++) {
      const tpl = Math.random() < 0.7
        ? NEGATIVE_TEMPLATES[0] // giao chậm
        : NEGATIVE_TEMPLATES[1];
      feedbacks.push({
        source: Math.random() < 0.6 ? 'Shopee' : 'Facebook',
        productName: incidentProduct,
        region: 'TP.HCM',
        originalText: tpl.text,
        author: pick(REAL_CUSTOMERS),
        orderId: Math.random() < 0.6 ? makeOrder(incidentProduct, d + 1) : null,
        accountAgeDays: 90 + Math.floor(Math.random() * 800),
        rating: 1,
        category: tpl.cat,
        subCategory: tpl.sub,
        sentiment: 'Negative',
        timestamp: new Date(Date.now() - (d * 86400000 + Math.random() * 86400000))
      });
    }
  }

  // ------------------------------------------------------------------
  // 3) ĐỢT ĐÁNH GIÁ TĂNG CƯỜNG (seeding) — 12 đánh giá 5 sao, nội dung
  //    na ná nhau, dồn trong 45 phút, tài khoản tạo dưới 3 ngày
  // ------------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    feedbacks.push({
      source: 'Shopee',
      productName: PRODUCTS[1],
      region: pick(REGIONS),
      originalText: pick(SEEDING_TEMPLATES),
      author: 'user' + (750000 + i),
      accountAgeDays: 1 + Math.floor(Math.random() * 3),
      rating: 5,
      category: 'ProductQuality',
      subCategory: null,
      sentiment: 'Positive',
      timestamp: hoursAgo(30 + i * 0.06)
    });
  }

  // ------------------------------------------------------------------
  // 4) ĐỢT ĐÁNH GIÁ HẠ UY TÍN do đối thủ đặt — 9 đánh giá 1 sao thành cụm.
  //    Nếu không lọc, cụm này sẽ khiến hệ thống khuyên doanh nghiệp đổi
  //    nhà vận chuyển vì một vấn đề không có thật.
  // ------------------------------------------------------------------
  for (let i = 0; i < 9; i++) {
    feedbacks.push({
      source: 'Shopee',
      productName: PRODUCTS[2],
      region: pick(REGIONS),
      originalText: pick(SMEAR_TEMPLATES),
      author: 'acc' + (880000 + i),
      accountAgeDays: 1 + Math.floor(Math.random() * 4),
      rating: 1,
      category: 'ProductQuality',
      subCategory: 'NotAsDescribed',
      sentiment: 'Negative',
      timestamp: hoursAgo(52 + i * 0.07)
    });
  }

  // ------------------------------------------------------------------
  // 5) QUẢNG CÁO / BOT — 22 bình luận trên fanpage
  // ------------------------------------------------------------------
  for (let i = 0; i < 22; i++) {
    feedbacks.push({
      source: 'Facebook',
      productName: pick(PRODUCTS),
      region: pick(REGIONS),
      originalText: pick(AD_TEMPLATES),
      author: 'shop_online_' + i,
      accountAgeDays: 10 + Math.floor(Math.random() * 300),
      rating: null,
      category: 'Other',
      subCategory: null,
      sentiment: 'Neutral',
      timestamp: daysAgo(Math.random() * 30)
    });
  }

  // ------------------------------------------------------------------
  // 6) ĐÁNH GIÁ RỖNG NGHĨA — nhận xu của sàn
  // ------------------------------------------------------------------
  const emptyTexts = ['ok', 'oke', 'tốt', '5 sao', 'đẹp', 'ok shop', 'good'];
  for (let i = 0; i < 26; i++) {
    feedbacks.push({
      source: Math.random() < 0.7 ? 'Shopee' : 'Lazada',
      productName: pick(PRODUCTS),
      region: pick(REGIONS),
      originalText: pick(emptyTexts),
      author: 'kh' + Math.floor(Math.random() * 9000),
      accountAgeDays: 20 + Math.floor(Math.random() * 500),
      rating: 5,
      category: 'Other',
      subCategory: null,
      sentiment: 'Positive',
      timestamp: daysAgo(Math.random() * 45)
    });
  }

  // ------------------------------------------------------------------
  // 7) MỘT SỐ ĐÁNH GIÁ VIẾT TRƯỚC NGÀY GIAO HÀNG — bất nhất giao dịch
  // ------------------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const product = pick(PRODUCTS);
    const orderId = 'OD' + orderSeq++;
    orders.push({
      orderId,
      productName: product,
      region: pick(REGIONS),
      orderedAt: daysAgo(6),
      deliveredAt: daysAgo(1), // giao hôm qua
      amount: 500000
    });
    feedbacks.push({
      source: 'Shopee',
      productName: product,
      region: pick(REGIONS),
      originalText: 'Hàng tốt lắm, giao nhanh, chất lượng vượt mong đợi, sẽ ủng hộ shop dài dài',
      author: pick(REAL_CUSTOMERS),
      orderId,
      accountAgeDays: 300,
      rating: 5,
      category: 'ProductQuality',
      subCategory: null,
      sentiment: 'Positive',
      timestamp: daysAgo(4) // viết TRƯỚC khi giao 3 ngày
    });
  }

  // ------------------------------------------------------------------
  // 8) NỀN GIAO DỊCH KHÔNG CÓ PHẢN HỒI.
  //    Thực tế chỉ khoảng 2-5% đơn hàng để lại đánh giá. Nếu mẫu số chỉ
  //    gồm những đơn có review thì WCR sẽ bị thổi lên hàng chục phần
  //    trăm và mất hết ý nghĩa. Sinh thêm nền giao dịch cho đúng tỉ lệ.
  // ------------------------------------------------------------------
  const reviewedOrders = orders.length;
  const targetOrders = Math.round(reviewedOrders / 0.04); // ~4% đơn có đánh giá
  for (let i = orders.length; i < targetOrders; i++) {
    const ageDays = Math.random() * 60;
    orders.push({
      orderId: 'OD' + orderSeq++,
      productName: pick(PRODUCTS),
      region: pick(REGIONS),
      orderedAt: daysAgo(ageDays + 3),
      deliveredAt: daysAgo(ageDays),
      amount: 200000 + Math.floor(Math.random() * 4000000)
    });
  }

  return { feedbacks, orders };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('customer_radar');

    const { feedbacks, orders } = buildDataset();

    await db.collection('feedbacks').deleteMany({});
    await db.collection('transactions').deleteMany({});
    await db.collection('predictions').deleteMany({});
    await db.collection('review_labels').deleteMany({});
    await db.collection('recommendation_log').deleteMany({});

    await db.collection('feedbacks').insertMany(feedbacks);
    await db.collection('transactions').insertMany(orders);

    // Chỉ mục cho các truy vấn hay dùng
    await db.collection('feedbacks').createIndex({ timestamp: -1 });
    await db.collection('feedbacks').createIndex({ productName: 1, timestamp: -1 });
    await db.collection('transactions').createIndex({ orderId: 1 }, { unique: true });

    console.log(`Đã nạp ${feedbacks.length} phản hồi và ${orders.length} giao dịch.`);
    console.log('Trong đó có chủ đích:');
    console.log('  - 12 đánh giá tăng cường (seeding), tài khoản dưới 3 ngày tuổi');
    console.log('  - 9 đánh giá hạ uy tín thành cụm');
    console.log('  - 22 bình luận quảng cáo/bot');
    console.log('  - 26 đánh giá rỗng nghĩa');
    console.log('  - 4 đánh giá viết trước thời điểm giao hàng');
    console.log('  - 1 sự cố giao hàng THẬT tăng dần trong 6 ngày gần nhất tại TP.HCM');
  } catch (e) {
    console.error('Lỗi khi nạp dữ liệu:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) main();

module.exports = { buildDataset };
