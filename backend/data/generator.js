/**
 * BỘ SINH DỮ LIỆU THỬ NGHIỆM CÓ CẤU TRÚC THỐNG KÊ THẬT
 * ==================================================================
 *
 * NÓI RÕ NGAY TỪ ĐẦU: đây là DỮ LIỆU MÔ PHỎNG, không phải dữ liệu thu
 * thập từ sàn thật. Tài liệu và giao diện đều ghi rõ điều đó.
 *
 * Nhưng mô phỏng không có nghĩa là bịa bừa. Bộ sinh này có hai mục tiêu
 * mà một tập dữ liệu ngẫu nhiên đơn giản không đạt được:
 *
 *  1. PHÂN BỐ GIỐNG THẬT. Tài liệu phản biện nói thẳng: "dữ liệu thật
 *     có phân bố lệch, có ngoại lệ, có những chỗ xấu; dữ liệu giả thì
 *     tròn trịa một cách đáng ngờ". Vì vậy ở đây dùng:
 *       - Luật lũy thừa (Zipf) cho độ phổ biến sản phẩm và độ tích cực
 *         của khách hàng — vài sản phẩm bán chạy, đuôi dài bán lẻ tẻ;
 *         phần lớn khách chỉ đánh giá một lần, số ít đánh giá rất nhiều.
 *       - Phân phối điểm sao hình chữ J — đặc trưng đã được ghi nhận
 *         rộng rãi của đánh giá thương mại điện tử: rất nhiều 5 sao,
 *         một nhóm 1 sao, và rất ít 2-3-4 sao.
 *       - Mùa vụ theo thứ trong tuần, theo giờ trong ngày, và theo kỳ
 *         lương (đầu tháng, giữa tháng).
 *       - Tỉ lệ để lại đánh giá thấp so với số đơn, đúng thực tế.
 *
 *  2. CÓ ĐÁP ÁN ĐỂ CHẤM. Các sự cố được cài vào có chủ đích và được ghi
 *     lại trong một bản kê (manifest). Nhờ vậy có thể CHỨNG MINH bằng số
 *     rằng hệ thống phát hiện đúng thứ đã cài, và không bắt nhầm phần
 *     dữ liệu nền. Đây là cách chuẩn để kiểm chứng một hệ thống phát
 *     hiện bất thường khi chưa có dữ liệu sự cố thật đã gán nhãn.
 */

const corpus = require('./corpus');

// ==================================================================
// BỘ SINH SỐ GIẢ NGẪU NHIÊN CÓ HẠT GIỐNG
// ==================================================================

/**
 * Dùng hạt giống cố định để mỗi lần chạy cho ra CÙNG một tập dữ liệu.
 * Quan trọng với việc thuyết trình: con số trên slide phải khớp với con
 * số trên màn hình lúc demo. `Math.random()` không đảm bảo điều đó.
 */
function createRng(seed = 20260911) {
  let a = seed >>> 0;
  return {
    next() {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
    /** Chọn theo trọng số — nền tảng của mọi phân bố lệch ở đây */
    weighted(items, weights) {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    bool(p) { return this.next() < p; },
    /** Phân phối chuẩn qua biến đổi Box-Muller, dùng cho nhiễu quanh giá trị nền */
    normal(mean = 0, sd = 1) {
      const u1 = Math.max(this.next(), 1e-9);
      const u2 = this.next();
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
  };
}

/** Trọng số Zipf: phần tử thứ k có trọng số 1/k^s */
function zipfWeights(n, s = 1.1) {
  return Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, s));
}

// ==================================================================
// DANH MỤC NỀN
// ==================================================================

const PRODUCTS = [
  { name: 'Tai nghe Bluetooth SoundCore Q30', price: 1290000, category: 'Điện tử' },
  { name: 'Điện thoại Samsung Galaxy A55', price: 8990000, category: 'Điện tử' },
  { name: 'Áo thun cotton unisex form rộng', price: 189000, category: 'Thời trang' },
  { name: 'Nồi chiên không dầu Lock&Lock 5.5L', price: 1890000, category: 'Gia dụng' },
  { name: 'Sữa rửa mặt Cerave 473ml', price: 349000, category: 'Mỹ phẩm' },
  { name: 'Bàn phím cơ Akko 3068', price: 1150000, category: 'Điện tử' },
  { name: 'Giày sneaker trắng nam nữ', price: 459000, category: 'Thời trang' },
  { name: 'Máy lọc không khí Xiaomi 4 Lite', price: 2490000, category: 'Gia dụng' },
  { name: 'Kem chống nắng Anessa SPF50', price: 520000, category: 'Mỹ phẩm' },
  { name: 'Balo laptop chống nước 15.6 inch', price: 329000, category: 'Phụ kiện' },
  { name: 'Chuột không dây Logitech M331', price: 385000, category: 'Điện tử' },
  { name: 'Quần jean nam ống đứng', price: 395000, category: 'Thời trang' },
  { name: 'Bình giữ nhiệt Lock&Lock 500ml', price: 259000, category: 'Gia dụng' },
  { name: 'Serum vitamin C Melano CC', price: 289000, category: 'Mỹ phẩm' },
  { name: 'Đèn bàn LED chống cận', price: 215000, category: 'Gia dụng' },
  { name: 'Ốp lưng silicon trong suốt', price: 45000, category: 'Phụ kiện' },
  { name: 'Cáp sạc nhanh Type-C 1m', price: 89000, category: 'Phụ kiện' },
  { name: 'Tất cổ ngắn cotton set 5 đôi', price: 69000, category: 'Thời trang' }
];

const REGIONS = [
  { name: 'TP.HCM', weight: 32 }, { name: 'Hà Nội', weight: 27 },
  { name: 'Đà Nẵng', weight: 9 }, { name: 'Bình Dương', weight: 7 },
  { name: 'Đồng Nai', weight: 5 }, { name: 'Hải Phòng', weight: 5 },
  { name: 'Cần Thơ', weight: 4 }, { name: 'Khánh Hòa', weight: 3 },
  { name: 'Nghệ An', weight: 3 }, { name: 'Lâm Đồng', weight: 2 },
  { name: 'Thừa Thiên Huế', weight: 2 }, { name: 'Bắc Ninh', weight: 1 }
];

const CHANNELS = [
  { name: 'Shopee', weight: 40, reconcilable: true },
  { name: 'Facebook', weight: 20, reconcilable: false },
  { name: 'TikTok', weight: 17, reconcilable: false },
  { name: 'Lazada', weight: 12, reconcilable: true },
  { name: 'CSKH', weight: 11, reconcilable: true }
];

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Thanh', 'Quang', 'Ngọc', 'Thu', 'Hoài', 'Xuân', 'Tuấn'];
const TEN = ['An', 'Bình', 'Cường', 'Dung', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hùng', 'Khoa', 'Lan',
  'Linh', 'Mai', 'Nam', 'Nga', 'Nhung', 'Phong', 'Phúc', 'Quân', 'Quyên', 'Sơn', 'Thảo', 'Trang',
  'Trung', 'Tú', 'Vy', 'Yến', 'Đạt', 'Khánh'];

/** Nguyên nhân thuộc mỗi danh mục, kèm tần suất nền tương đối */
const CAUSE_POOL = [
  { cat: 'Delivery', cause: 'LateDelivery', w: 22 },
  { cat: 'Delivery', cause: 'DamagedInTransit', w: 11 },
  { cat: 'Delivery', cause: 'CourierAttitude', w: 5 },
  { cat: 'Delivery', cause: 'WrongAddress', w: 3 },
  { cat: 'Delivery', cause: 'LostPackage', w: 2 },
  { cat: 'ProductQuality', cause: 'NotAsDescribed', w: 14 },
  { cat: 'ProductQuality', cause: 'TechnicalDefect', w: 12 },
  { cat: 'ProductQuality', cause: 'MissingAccessory', w: 4 },
  { cat: 'ProductQuality', cause: 'SuspectedCounterfeit', w: 3 },
  { cat: 'ProductQuality', cause: 'ExpiredOrStale', w: 2 },
  { cat: 'CustomerService', cause: 'SlowResponse', w: 8 },
  { cat: 'CustomerService', cause: 'BadAttitude', w: 5 },
  { cat: 'CustomerService', cause: 'WrongInformation', w: 4 },
  { cat: 'CustomerService', cause: 'UnresolvedCase', w: 3 },
  { cat: 'Payment', cause: 'GatewayError', w: 4 },
  { cat: 'Payment', cause: 'WrongPromotion', w: 3 },
  { cat: 'Payment', cause: 'DoubleCharge', w: 2 },
  { cat: 'Payment', cause: 'WrongInvoice', w: 1 },
  { cat: 'TechnicalApp', cause: 'AppSlowOrCrash', w: 4 },
  { cat: 'TechnicalApp', cause: 'LoginError', w: 2 },
  { cat: 'TechnicalApp', cause: 'DisplayError', w: 1 },
  { cat: 'TechnicalApp', cause: 'SearchError', w: 1 },
  { cat: 'ReturnRefund', cause: 'SlowRefund', w: 5 },
  { cat: 'ReturnRefund', cause: 'ReturnRejected', w: 3 },
  { cat: 'ReturnRefund', cause: 'ComplexProcess', w: 2 },
  { cat: 'PricePromotion', cause: 'HigherThanExpected', w: 4 },
  { cat: 'PricePromotion', cause: 'MisleadingPromo', w: 2 }
];

// ==================================================================
// SINH VĂN BẢN
// ==================================================================

function fillTemplate(rng, template) {
  return template
    .replace(/\{open\}/g, () => rng.pick(corpus.SLOTS.open))
    .replace(/\{close\}/g, () => rng.pick(corpus.SLOTS.close))
    .replace(/\{intensity\}/g, () => rng.pick(corpus.SLOTS.intensity))
    .replace(/\{duration\}/g, () => rng.pick(corpus.SLOTS.duration))
    .replace(/\{timeRef\}/g, () => rng.pick(corpus.SLOTS.timeRef))
    .replace(/\{positiveClose\}/g, () => rng.pick(corpus.SLOTS.positiveClose))
    .replace(/\{phone\}/g, () => '0' + rng.int(300000000, 989999999))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

/** Viết lại câu theo kiểu teencode — khoảng 18% dữ liệu, như thực tế */
function toTeencode(rng, text) {
  let out = text.toLowerCase();
  for (const [re, rep] of corpus.TEENCODE_MAP) {
    if (rng.bool(0.6)) out = out.replace(re, rep);
  }
  return out;
}

function makeText(rng, kind, cause) {
  let text;
  if (kind === 'complaint') {
    const templates = corpus.COMPLAINT_TEMPLATES[cause];
    text = fillTemplate(rng, rng.pick(templates || corpus.COMPLAINT_TEMPLATES.LateDelivery));
  } else if (kind === 'positive') {
    text = fillTemplate(rng, rng.pick(corpus.POSITIVE_TEMPLATES));
  } else {
    text = fillTemplate(rng, rng.pick(corpus.NEUTRAL_TEMPLATES));
  }
  return rng.bool(0.18) ? toTeencode(rng, text) : text;
}

/**
 * Điểm sao hình chữ J — phân bố đặc trưng của đánh giá thương mại điện tử:
 * người rất hài lòng và người rất bực mới bỏ công đánh giá, nhóm ở giữa
 * thường im lặng.
 */
function makeRating(rng, sentiment) {
  if (sentiment === 'Negative') return rng.weighted([1, 2, 3], [62, 28, 10]);
  if (sentiment === 'Positive') return rng.weighted([5, 4, 3], [74, 22, 4]);
  return rng.weighted([3, 4, 2], [60, 25, 15]);
}

// ==================================================================
// MÙA VỤ
// ==================================================================

/** Hệ số theo thứ trong tuần: cuối tuần mua nhiều hơn */
const DOW_FACTOR = [1.0, 0.92, 0.9, 0.94, 1.05, 1.22, 1.28]; // CN -> T7

/** Hệ số theo kỳ lương: đầu tháng và giữa tháng cao hơn hẳn */
function paydayFactor(dayOfMonth) {
  if (dayOfMonth <= 3) return 1.35;
  if (dayOfMonth >= 14 && dayOfMonth <= 17) return 1.25;
  if (dayOfMonth >= 26 && dayOfMonth <= 28) return 0.82;
  return 1.0;
}

/** Giờ trong ngày: đỉnh buổi tối, đáy rạng sáng */
const HOUR_WEIGHTS = [
  1, 0.5, 0.3, 0.2, 0.3, 0.8, 2, 3.5, 4.5, 5, 5.5, 6,
  5.5, 5, 5.5, 6, 6.5, 7.5, 9, 11, 12, 10, 6, 3
];

function pickHour(rng) {
  return rng.weighted(Array.from({ length: 24 }, (_, i) => i), HOUR_WEIGHTS);
}

// ==================================================================
// BỘ SINH CHÍNH
// ==================================================================

/**
 * @param {object} opts
 *   days          số ngày lịch sử (mặc định 90)
 *   targetReviews số phản hồi mục tiêu (mặc định 6000)
 *   reviewRate    tỉ lệ đơn hàng để lại đánh giá (mặc định 0.09)
 *   seed          hạt giống để tái lập
 */
function generateDataset(opts = {}) {
  const days = opts.days ?? 90;
  const targetReviews = opts.targetReviews ?? 6000;
  const reviewRate = opts.reviewRate ?? 0.09;
  const rng = createRng(opts.seed ?? 20260911);

  const now = opts.now ? new Date(opts.now) : new Date();
  const dayMs = 86400000;
  const startMs = now.getTime() - days * dayMs;

  const feedbacks = [];
  const orders = [];
  const manifest = { incidents: [], generatedAt: new Date().toISOString(), params: { days, targetReviews, reviewRate, seed: opts.seed ?? 20260911 } };

  let orderSeq = 100000;
  const productWeights = zipfWeights(PRODUCTS.length, 1.05);

  // --- Dàn khách hàng với độ tích cực theo luật lũy thừa ---
  const CUSTOMER_COUNT = Math.max(400, Math.round(targetReviews / 3.2));
  const customers = [];
  /**
   * Số mũ Zipf phải hiệu chỉnh cẩn thận, và dễ chỉnh sai theo cả hai chiều.
   * Số mũ CÀNG LỚN thì phần đầu càng nặng: thử 0.75 cho ra khách tích cực
   * nhất 267 đánh giá, thử 1.15 còn tệ hơn với 1170 đánh giá.
   *
   * Một tài khoản 1170 đánh giá trong 90 ngày tự nó đã là bất thường, và
   * sẽ kích hoạt chính bộ phát hiện hành vi tài khoản — tạo báo động giả
   * ngay trong dữ liệu NỀN, tức là làm hỏng phép đo tỉ lệ loại nhầm.
   *
   * Mức 0.35 cho ra: nhiều nhất 26 đánh giá, trung vị 3, phần lớn khách
   * chỉ đánh giá một hai lần — đúng dáng của dữ liệu thật.
   */
  const customerWeights = zipfWeights(CUSTOMER_COUNT, 0.35);
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    customers.push({
      id: 'CUS' + String(100000 + i),
      name: `${rng.pick(HO)} ${rng.pick(DEM)} ${rng.pick(TEN)}`,
      accountAgeDays: Math.max(8, Math.round(rng.normal(420, 260))),
      region: rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight))
    });
  }

  const causeItems = CAUSE_POOL.map((c) => c);
  const causeWeights = CAUSE_POOL.map((c) => c.w);
  const channelNames = CHANNELS.map((c) => c.name);
  const channelWeights = CHANNELS.map((c) => c.weight);

  /** Tạo một đơn hàng và trả về mã đơn */
  const makeOrder = (product, region, deliveredAtMs) => {
    const orderId = 'OD' + orderSeq++;
    orders.push({
      orderId,
      productName: product.name,
      productCategory: product.category,
      region,
      orderedAt: new Date(deliveredAtMs - rng.int(2, 5) * dayMs),
      deliveredAt: new Date(deliveredAtMs),
      amount: Math.round(product.price * (0.9 + rng.next() * 0.25)),
      quantity: rng.weighted([1, 2, 3], [78, 17, 5])
    });
    return orderId;
  };

  /** Sinh một phản hồi nền */
  const pushBackground = (timestampMs) => {
    const customer = rng.weighted(customers, customerWeights);
    const product = rng.weighted(PRODUCTS, productWeights);
    const channel = rng.weighted(channelNames, channelWeights);
    const region = rng.bool(0.85) ? customer.region : rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight));

    // Tỉ lệ nền: đa số tích cực, đúng như dữ liệu đánh giá thật
    const roll = rng.next();
    let kind; let sentiment;
    if (roll < 0.235) { kind = 'complaint'; sentiment = 'Negative'; }
    else if (roll < 0.35) { kind = 'neutral'; sentiment = 'Neutral'; }
    else { kind = 'positive'; sentiment = 'Positive'; }

    const chosen = kind === 'complaint' ? rng.weighted(causeItems, causeWeights) : null;
    const isReconcilable = CHANNELS.find((c) => c.name === channel).reconcilable;
    const deliveredAt = timestampMs - rng.int(4, 72) * 3600000;
    const orderId = isReconcilable && rng.bool(0.72) ? makeOrder(product, region, deliveredAt) : null;

    feedbacks.push({
      source: channel,
      productName: product.name,
      productCategory: product.category,
      region,
      originalText: makeText(rng, kind, chosen ? chosen.cause : null),
      author: customer.name,
      customerId: channel === 'CSKH' ? customer.id : null,
      orderId,
      accountAgeDays: customer.accountAgeDays,
      rating: makeRating(rng, sentiment),
      category: chosen ? chosen.cat : 'Other',
      subCategory: chosen ? chosen.cause : null,
      sentiment,
      timestamp: new Date(timestampMs)
    });
  };

  // ================================================================
  // 1. NỀN — phân bổ theo mùa vụ ngày và giờ
  // ================================================================
  const dayFactors = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startMs + d * dayMs);
    // Xu hướng tăng trưởng nhẹ theo thời gian, cộng nhiễu ngẫu nhiên
    const growth = 0.82 + (d / days) * 0.36;
    const factor = DOW_FACTOR[date.getDay()] * paydayFactor(date.getDate()) * growth *
      Math.max(0.5, rng.normal(1, 0.12));
    dayFactors.push(factor);
  }
  const factorSum = dayFactors.reduce((s, f) => s + f, 0);

  // Chừa khoảng 12% hạn ngạch cho nhiễu và các sự cố cài vào
  const backgroundTarget = Math.round(targetReviews * 0.88);
  for (let d = 0; d < days; d++) {
    const count = Math.round((dayFactors[d] / factorSum) * backgroundTarget);
    for (let i = 0; i < count; i++) {
      const hour = pickHour(rng);
      pushBackground(startMs + d * dayMs + hour * 3600000 + rng.int(0, 3599) * 1000);
    }
  }

  // ================================================================
  // 2. SỰ CỐ CÀI VÀO — có bản kê đáp án để chấm điểm phát hiện
  // ================================================================

  /** Sự cố 1: giao chậm tăng dần 12 ngày gần nhất, tập trung TP.HCM */
  {
    const product = PRODUCTS[0];
    const ids = [];
    for (let d = 11; d >= 0; d--) {
      const count = Math.round(4 + (11 - d) * 3.2);
      for (let k = 0; k < count; k++) {
        const ts = now.getTime() - d * dayMs - rng.int(0, 23) * 3600000;
        const customer = rng.weighted(customers, customerWeights);
        const deliveredAt = ts - rng.int(6, 48) * 3600000;
        const orderId = rng.bool(0.75) ? makeOrder(product, 'TP.HCM', deliveredAt) : null;
        ids.push(feedbacks.length);
        feedbacks.push({
          source: rng.weighted(['Shopee', 'Facebook', 'CSKH'], [55, 25, 20]),
          productName: product.name, productCategory: product.category, region: 'TP.HCM',
          originalText: makeText(rng, 'complaint', 'LateDelivery'),
          author: customer.name, customerId: null, orderId,
          accountAgeDays: customer.accountAgeDays,
          rating: makeRating(rng, 'Negative'),
          category: 'Delivery', subCategory: 'LateDelivery', sentiment: 'Negative',
          timestamp: new Date(ts)
        });
      }
    }
    manifest.incidents.push({
      id: 'INC-01', type: 'SPIKE', label: 'Sự cố giao chậm tăng dần tại TP.HCM',
      expectCategory: 'Delivery', expectCause: 'LateDelivery',
      product: product.name, region: 'TP.HCM',
      windowDays: 12, feedbackCount: ids.length,
      mustBeDetected: true,
      note: 'Tăng đều trong 12 ngày. Hệ thống phải bắt được bằng kiểm định tỉ lệ hai mẫu.'
    });
  }

  /** Sự cố 2: cổng thanh toán sập trong một buổi tối */
  {
    const outageStart = now.getTime() - 4 * dayMs + 19 * 3600000;
    let n = 0;
    for (let i = 0; i < 46; i++) {
      const customer = rng.weighted(customers, customerWeights);
      const product = rng.weighted(PRODUCTS, productWeights);
      feedbacks.push({
        source: rng.weighted(['Shopee', 'CSKH', 'Facebook'], [50, 35, 15]),
        productName: product.name, productCategory: product.category,
        region: customer.region,
        originalText: makeText(rng, 'complaint', 'GatewayError'),
        author: customer.name, customerId: customer.id, orderId: null,
        accountAgeDays: customer.accountAgeDays,
        rating: makeRating(rng, 'Negative'),
        category: 'Payment', subCategory: 'GatewayError', sentiment: 'Negative',
        timestamp: new Date(outageStart + rng.int(0, 5 * 3600) * 1000)
      });
      n++;
    }
    manifest.incidents.push({
      id: 'INC-02', type: 'SPIKE', label: 'Cổng thanh toán lỗi trong một buổi tối',
      expectCategory: 'Payment', expectCause: 'GatewayError',
      windowDays: 5, feedbackCount: n, mustBeDetected: true,
      note: 'Đột biến dốc trong 5 giờ. Danh mục Thanh toán có hệ số tác động nghiệp vụ cao nhất.'
    });
  }

  /** Sự cố 3: một lô sản phẩm lỗi, tăng dần trong 20 ngày */
  {
    const product = PRODUCTS[3];
    let n = 0;
    for (let d = 19; d >= 0; d--) {
      const count = Math.round(1 + (19 - d) * 0.9);
      for (let k = 0; k < count; k++) {
        const customer = rng.weighted(customers, customerWeights);
        const ts = now.getTime() - d * dayMs - rng.int(0, 23) * 3600000;
        const orderId = rng.bool(0.7) ? makeOrder(product, customer.region, ts - rng.int(12, 96) * 3600000) : null;
        feedbacks.push({
          source: rng.weighted(['Shopee', 'Lazada', 'CSKH'], [55, 25, 20]),
          productName: product.name, productCategory: product.category, region: customer.region,
          originalText: makeText(rng, 'complaint', 'TechnicalDefect'),
          author: customer.name, customerId: null, orderId,
          accountAgeDays: customer.accountAgeDays,
          rating: makeRating(rng, 'Negative'),
          category: 'ProductQuality', subCategory: 'TechnicalDefect', sentiment: 'Negative',
          timestamp: new Date(ts)
        });
        n++;
      }
    }
    manifest.incidents.push({
      id: 'INC-03', type: 'SPIKE', label: 'Lô hàng lỗi kỹ thuật',
      expectCategory: 'ProductQuality', expectCause: 'TechnicalDefect',
      product: product.name, windowDays: 20, feedbackCount: n, mustBeDetected: true,
      note: 'Tăng chậm hơn INC-01, kiểm tra khả năng bắt được xu hướng thoai thoải.'
    });
  }

  /** Sự cố 4: chiến dịch đánh giá thuê (seeding) */
  {
    const product = PRODUCTS[6];
    const campaignStart = now.getTime() - 2 * dayMs - 3 * 3600000;
    const ids = [];
    for (let i = 0; i < 34; i++) {
      ids.push(feedbacks.length);
      feedbacks.push({
        source: 'Shopee',
        productName: product.name, productCategory: product.category,
        region: rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight)),
        originalText: rng.pick(corpus.SEEDING_TEMPLATES),
        author: 'user' + rng.int(7000000, 7999999),
        customerId: null, orderId: null,
        accountAgeDays: rng.int(1, 5),
        rating: 5,
        category: 'Other', subCategory: null, sentiment: 'Positive',
        timestamp: new Date(campaignStart + i * rng.int(40, 110) * 1000),
        _plantedAs: 'inauthentic'
      });
    }
    manifest.incidents.push({
      id: 'INC-04', type: 'SEEDING', label: 'Chiến dịch đánh giá thuê 5 sao',
      product: product.name, feedbackCount: ids.length, mustBeDetected: true,
      expectTrustBand: 'LIKELY_INAUTHENTIC',
      note: 'Nội dung na ná nhau, dồn trong dưới một giờ, từ tài khoản dưới 5 ngày tuổi.'
    });
  }

  /** Sự cố 5: chiến dịch hạ uy tín do đối thủ đặt */
  {
    const product = PRODUCTS[7];
    const campaignStart = now.getTime() - 6 * dayMs - 21 * 3600000;
    const ids = [];
    for (let i = 0; i < 21; i++) {
      ids.push(feedbacks.length);
      feedbacks.push({
        source: 'Shopee',
        productName: product.name, productCategory: product.category,
        region: rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight)),
        originalText: rng.pick(corpus.SMEAR_TEMPLATES),
        author: 'acc' + rng.int(8000000, 8999999),
        customerId: null, orderId: null,
        accountAgeDays: rng.int(1, 6),
        rating: 1,
        category: 'ProductQuality', subCategory: 'NotAsDescribed', sentiment: 'Negative',
        timestamp: new Date(campaignStart + i * rng.int(60, 150) * 1000),
        _plantedAs: 'inauthentic'
      });
    }
    manifest.incidents.push({
      id: 'INC-05', type: 'SMEAR', label: 'Chiến dịch hạ uy tín 1 sao',
      product: product.name, feedbackCount: ids.length, mustBeDetected: true,
      expectTrustBand: 'LIKELY_INAUTHENTIC',
      note: 'Nếu không lọc, cụm này sẽ tạo ra cảnh báo chất lượng sản phẩm không có thật.'
    });
  }

  /** Sự cố 6: dịch vụ khách hàng suy giảm chậm và đều suốt 60 ngày */
  {
    let n = 0;
    for (let d = 59; d >= 0; d--) {
      const intensity = (59 - d) / 59;
      const count = rng.bool(0.45 + intensity * 0.5) ? rng.int(1, 3) : 0;
      for (let k = 0; k < count; k++) {
        const customer = rng.weighted(customers, customerWeights);
        feedbacks.push({
          source: rng.weighted(['CSKH', 'Facebook', 'Shopee'], [45, 30, 25]),
          productName: rng.weighted(PRODUCTS, productWeights).name,
          region: customer.region,
          originalText: makeText(rng, 'complaint', 'SlowResponse'),
          author: customer.name, customerId: customer.id, orderId: null,
          accountAgeDays: customer.accountAgeDays,
          rating: makeRating(rng, 'Negative'),
          category: 'CustomerService', subCategory: 'SlowResponse', sentiment: 'Negative',
          timestamp: new Date(now.getTime() - d * dayMs - rng.int(0, 23) * 3600000)
        });
        n++;
      }
    }
    manifest.incidents.push({
      id: 'INC-06', type: 'DRIFT', label: 'Dịch vụ khách hàng suy giảm kéo dài',
      expectCategory: 'CustomerService', expectCause: 'SlowResponse',
      windowDays: 60, feedbackCount: n, mustBeDetected: false,
      note: 'Không ngày nào đủ xấu để gây chú ý. Đây là loại mà biểu đồ EWMA sinh ra để bắt; ' +
            'kiểm định đột biến bỏ sót là đúng thiết kế, nên không đặt là bắt buộc phát hiện.'
    });
  }

  // ================================================================
  // 3. NHIỄU — quảng cáo, bot, đánh giá rỗng nghĩa
  // ================================================================
  const adCount = Math.round(targetReviews * 0.035);
  for (let i = 0; i < adCount; i++) {
    feedbacks.push({
      source: rng.weighted(['Facebook', 'TikTok'], [70, 30]),
      productName: rng.weighted(PRODUCTS, productWeights).name,
      region: rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight)),
      originalText: fillTemplate(rng, rng.pick(corpus.AD_TEMPLATES)),
      author: 'shop_' + rng.int(1000, 9999), customerId: null, orderId: null,
      accountAgeDays: rng.int(5, 400), rating: null,
      category: 'Other', subCategory: null, sentiment: 'Neutral',
      timestamp: new Date(startMs + rng.next() * days * dayMs),
      _plantedAs: 'spam'
    });
  }

  const emptyCount = Math.round(targetReviews * 0.045);
  for (let i = 0; i < emptyCount; i++) {
    const customer = rng.weighted(customers, customerWeights);
    const product = rng.weighted(PRODUCTS, productWeights);
    const ts = startMs + rng.next() * days * dayMs;
    feedbacks.push({
      source: rng.weighted(['Shopee', 'Lazada'], [70, 30]),
      productName: product.name, productCategory: product.category, region: customer.region,
      originalText: rng.pick(corpus.EMPTY_TEMPLATES),
      author: customer.name, customerId: null,
      orderId: rng.bool(0.6) ? makeOrder(product, customer.region, ts - rng.int(12, 72) * 3600000) : null,
      accountAgeDays: customer.accountAgeDays, rating: 5,
      category: 'Other', subCategory: null, sentiment: 'Positive',
      timestamp: new Date(ts),
      _plantedAs: 'spam'
    });
  }

  /** Vài đánh giá viết trước ngày giao — bất nhất với dữ liệu giao dịch */
  {
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const customer = rng.weighted(customers, customerWeights);
      const product = rng.weighted(PRODUCTS, productWeights);
      const reviewTs = now.getTime() - rng.int(3, 30) * dayMs;
      const orderId = makeOrder(product, customer.region, reviewTs + rng.int(36, 120) * 3600000);
      feedbacks.push({
        source: 'Shopee',
        productName: product.name, productCategory: product.category, region: customer.region,
        originalText: makeText(rng, 'positive', null),
        author: customer.name, customerId: null, orderId,
        accountAgeDays: customer.accountAgeDays, rating: 5,
        category: 'Other', subCategory: null, sentiment: 'Positive',
        timestamp: new Date(reviewTs),
        _plantedAs: 'inauthentic'
      });
      n++;
    }
    manifest.incidents.push({
      id: 'INC-07', type: 'TXN_MISMATCH', label: 'Đánh giá viết trước thời điểm giao hàng',
      feedbackCount: n, mustBeDetected: true, expectTrustBand: 'LIKELY_INAUTHENTIC',
      note: 'Đối soát với sổ đơn hàng cho thấy người viết chưa thể nhận được hàng.'
    });
  }

  // ================================================================
  // 4. NỀN GIAO DỊCH KHÔNG CÓ ĐÁNH GIÁ
  // ================================================================
  // Thực tế chỉ một phần nhỏ đơn hàng để lại đánh giá. Nếu mẫu số chỉ
  // gồm đơn có đánh giá thì WCR bị thổi lên hàng chục phần trăm và mất
  // hết ý nghĩa so sánh.
  const reviewedOrders = orders.length;
  const targetOrders = Math.round(reviewedOrders / reviewRate);
  for (let i = reviewedOrders; i < targetOrders; i++) {
    const product = rng.weighted(PRODUCTS, productWeights);
    const dayOffset = rng.next() * days;
    const date = new Date(startMs + dayOffset * dayMs);
    const seasonal = DOW_FACTOR[date.getDay()] * paydayFactor(date.getDate());
    if (rng.next() > seasonal / 1.4) continue; // giữ lại mùa vụ ở mẫu số
    orders.push({
      orderId: 'OD' + orderSeq++,
      productName: product.name,
      productCategory: product.category,
      region: rng.weighted(REGIONS.map((r) => r.name), REGIONS.map((r) => r.weight)),
      orderedAt: new Date(date.getTime() - rng.int(2, 5) * dayMs),
      deliveredAt: date,
      amount: Math.round(product.price * (0.9 + rng.next() * 0.25)),
      quantity: rng.weighted([1, 2, 3], [78, 17, 5])
    });
  }

  // Sắp theo thời gian để dữ liệu trông tự nhiên khi mở bảng
  feedbacks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  manifest.totals = {
    feedbacks: feedbacks.length,
    orders: orders.length,
    products: PRODUCTS.length,
    customers: customers.length,
    regions: REGIONS.length,
    channels: CHANNELS.length,
    days,
    reviewRate: Number((reviewedOrders / orders.length).toFixed(4)),
    plantedSpam: feedbacks.filter((f) => f._plantedAs === 'spam').length,
    plantedInauthentic: feedbacks.filter((f) => f._plantedAs === 'inauthentic').length,
    distinctTexts: new Set(feedbacks.map((f) => f.originalText)).size
  };

  return { feedbacks, orders, manifest, products: PRODUCTS };
}

module.exports = { generateDataset, createRng, PRODUCTS, REGIONS, CHANNELS, CAUSE_POOL };
