/**
 * MÔ PHỎNG MỘT PHIÊN MEGALIVE (chỉ dùng cho kho demo)
 * ==================================================================
 * Phát bình luận giả theo nhịp của một phiên megalive 11.11 bán thời trang:
 * mỗi sản phẩm được giới thiệu khoảng 75 giây, 20 giây đầu là lúc "mở flash
 * sale" nên bình luận dồn dập (chủ yếu hỏi giá, size, chốt đơn), sau đó thưa
 * dần. Lác đác có khiếu nại về đơn cũ, đúng như phiên live thật.
 *
 * Dữ liệu sinh ra được gắn cờ `simulated` ở cấp phiên, không bao giờ lẫn vào
 * kho thật và không được xuất cho huấn luyện trừ khi người dùng chủ động chọn.
 * Mục đích duy nhất: trình diễn giao diện khi không có phiên live thật nào
 * đang phát vào đúng lúc chấm thi.
 */

/** Bộ sinh số giả ngẫu nhiên có hạt giống: cùng hạt giống ra cùng phiên */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Danh mục mẫu cho phiên megalive 11.11 của một shop thời trang */
const MEGALIVE_CATALOG = [
  {
    id: 'ao-thun', code: '1', name: 'Áo thun cotton basic', price: 199000, salePrice: 129000,
    sizes: ['S', 'M', 'L', 'XL'], colors: ['đen', 'trắng', 'be'], stock: { S: 40, M: 85, L: 60, XL: 25 },
    material: '100% cotton 250gsm, dày dặn, không xù', keywords: ['áo thun', 'ao thun', 'áo phông', 'thun'],
    sizeGuide: [{ size: 'S', maxKg: 50, maxCm: 160 }, { size: 'M', maxKg: 60, maxCm: 168 }, { size: 'L', maxKg: 70, maxCm: 175 }, { size: 'XL', maxKg: 82, maxCm: 185 }]
  },
  {
    id: 'quan-jean', code: '2', name: 'Quần jean ống rộng', price: 459000, salePrice: 299000,
    sizes: ['S', 'M', 'L', 'XL'], colors: ['xanh', 'đen'], stock: { S: 20, M: 35, L: 18, XL: 0 },
    material: 'Denim cotton co giãn nhẹ, không phai màu', keywords: ['quần jean', 'quan jean', 'jean', 'quần bò', 'quần'],
    sizeGuide: [{ size: 'S', maxKg: 48, maxCm: 158 }, { size: 'M', maxKg: 56, maxCm: 165 }, { size: 'L', maxKg: 64, maxCm: 172 }, { size: 'XL', maxKg: 75, maxCm: 180 }]
  },
  {
    id: 'ao-khoac', code: '3', name: 'Áo khoác gió 2 lớp', price: 399000, salePrice: 259000,
    sizes: ['M', 'L', 'XL'], colors: ['đen', 'xám', 'kem'], stock: { M: 30, L: 30, XL: 12 },
    material: 'Vải gió chống nước nhẹ, lót lưới thoáng', keywords: ['áo khoác', 'ao khoac', 'khoác', 'áo gió'],
    sizeGuide: [{ size: 'M', maxKg: 58, maxCm: 165 }, { size: 'L', maxKg: 70, maxCm: 175 }, { size: 'XL', maxKg: 85, maxCm: 185 }]
  },
  {
    id: 'vay-hoa', code: '4', name: 'Váy hoa nhí dáng dài', price: 349000, salePrice: 219000,
    sizes: ['S', 'M', 'L'], colors: ['hồng', 'xanh'], stock: { S: 15, M: 22, L: 9 },
    material: 'Voan lụa 2 lớp, không xuyên thấu', keywords: ['váy', 'vay', 'đầm', 'váy hoa'],
    sizeGuide: [{ size: 'S', maxKg: 47, maxCm: 158 }, { size: 'M', maxKg: 54, maxCm: 165 }, { size: 'L', maxKg: 62, maxCm: 172 }]
  },
  {
    id: 'tui-tote', code: '5', name: 'Túi tote canvas', price: 159000, salePrice: 99000,
    sizes: [], colors: ['kem', 'đen'], stock: 120,
    material: 'Canvas dày 16oz, có khóa kéo và ngăn trong', keywords: ['túi', 'tui', 'tote', 'túi tote']
  }
];

const MEGALIVE_POLICY = {
  shipping: 'Freeship toàn quốc cho đơn trong live 11.11. Nội thành Hà Nội, TP.HCM nhận trong 1-2 ngày, các tỉnh 3-5 ngày ạ.',
  payment: 'Shop nhận COD (kiểm tra hàng rồi mới trả tiền) và chuyển khoản ạ.',
  returns: 'Shop hỗ trợ đổi size, đổi màu trong 7 ngày, hàng lỗi đổi mới miễn phí ạ.',
  promo: 'Nhập mã LIVE1111 giảm thêm 11%, tối đa 50.000đ.',
  authenticity: 'Hàng do xưởng của shop sản xuất, có tem mác và hóa đơn đầy đủ ạ.',
  howToOrder: 'Bạn bấm giỏ hàng góc trái màn hình, chọn đúng số sản phẩm rồi đặt, hoặc bình luận "chốt + size + màu" để shop giữ hàng.',
  complaint: ''
};

const NAMES = ['linh', 'trang', 'huong', 'ngoc', 'thao', 'mai', 'vy', 'anh', 'tuan', 'minh', 'khanh', 'phuong', 'ha', 'nhung', 'quynh', 'duy', 'long', 'hien', 'yen', 'my', 'tam', 'thu', 'hoa', 'lan', 'giang'];
const LAST = ['nguyen', 'tran', 'le', 'pham', 'hoang', 'vu', 'dang', 'bui', 'do', 'ngo'];
const CITIES = ['Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng', 'Nghệ An', 'Bình Dương', 'Huế', 'Quảng Ninh', 'Gia Lai', 'Cà Mau'];

/**
 * Mẫu bình luận. {p} tên gọi ngắn của sản phẩm, {n} số giỏ hàng, {s} size,
 * {c} màu, {h}{w} chiều cao, cân nặng, {city} tỉnh, {q} số lượng.
 * Có cả kiểu gõ không dấu, viết tắt như bình luận live thật.
 */
const TEMPLATES = {
  question: [
    'giá bao nhiêu shop', 'gia bn v shop', '{p} bao nhiêu tiền ạ', 'giỏ {n} giá sao ạ', 'xin giá {p}', 'giá live bn shop ơi',
    'còn size {s} không', 'con size {s} ko shop', '{p} màu {c} còn không ạ', 'size {s} còn k', 'giỏ {n} còn hàng không',
    '{h} {w} mặc size gì ạ', 'em {h} {w} mặc {p} size nào', 'cao {h} nang {w} mac sz j', 'mình {w} mặc {s} được không',
    'ship về {city} mất mấy ngày', 'có freeship không shop', 'ship {city} bao lâu ạ', 'có cod không ạ',
    '{p} chất liệu gì vậy', 'vải gì vậy shop', 'có bị xù không', '{p} có màu gì', 'có màu {c} không ạ',
    'có mã giảm giá không', 'mã live là gì shop', 'đổi size được không ạ', 'lỗi thì đổi được không',
    'link đâu shop', 'đặt ở đâu vậy shop', 'hàng có chính hãng không', 'có hóa đơn không ạ'
  ],
  order: [
    'chốt {s}{q}', 'chot {s}{q}', 'chốt 1 {c} size {s}', 'lấy {q} cái {p}', 'em lấy {p} size {s} màu {c}', 'chốt đơn {p} {s}',
    'cho em {q} {p} {c}', 'chốt {c} {s}', '+1', 'lấy 1 {s} nha shop', 'em chốt giỏ {n} size {s}', 'chốt {q} {p} sdt 09{d}'
  ],
  complaint: [
    'đơn hôm trước chưa nhận được hàng', 'shop ơi đặt 5 ngày rồi chưa giao', 'nhắn tin không ai trả lời',
    'hàng giao sai size rồi shop', 'áo đợt trước bị lỗi đường may', 'giao chậm quá shop ơi', 'quần nhận về khác hình'
  ],
  praise: [
    'đẹp quá', 'xinh quáaaa', '{p} đẹp ghê', 'mặc lên form đẹp thật', 'đã nhận hàng đợt trước, ưng lắm', 'uy tín nha mọi người',
    'chất vải xịn', 'iu shop', 'giá rẻ quá'
  ],
  chatter: ['❤️❤️❤️', 'hi shop', 'chào cả nhà', '🔥🔥', 'thả tim nè', 'lên lên', 'hello', '👍', 'xem nè', 'đông vui quá']
};

function createSimulator({ products = MEGALIVE_CATALOG, speed = 1, seed = Date.now() } = {}) {
  const rand = mulberry32(Number(seed) || 1);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const phaseMs = 75000 / speed;
  const users = Array.from({ length: 900 }, (_, i) => {
    const first = pick(NAMES);
    const last = pick(LAST);
    return { handle: `${first}${pick(['.', '_', ''])}${last}${rand() < 0.6 ? Math.floor(rand() * 2000) : ''}`, nickname: `${first[0].toUpperCase()}${first.slice(1)} ${last[0].toUpperCase()}${last.slice(1)}`, id: i };
  });
  let stopped = false;
  let timer = null;
  let viewerTimer = null;
  let phase = -1;
  let phaseStart = 0;
  let viewers = 1800 + Math.floor(rand() * 600);
  let likes = 0;
  let seq = 0;
  // Mỗi lần chạy một mã riêng: nối lại phiên sau khi máy chủ khởi động lại
  // không được sinh lại đúng các mã tin nhắn cũ (sẽ bị coi là trùng và bỏ)
  const run = Date.now().toString(36);

  function fill(tpl, p) {
    const sizes = p.sizes?.length ? p.sizes : ['M'];
    const h = 150 + Math.floor(rand() * 30);
    return tpl
      .replace('{p}', p.keywords?.[0] || p.name)
      .replace('{n}', p.code)
      .replace(/\{s\}/g, pick(sizes))
      .replace('{c}', pick(p.colors?.length ? p.colors : ['đen']))
      .replace('{h}', rand() < 0.5 ? `1m${String(h).slice(1)}` : `${h}cm`)
      .replace('{w}', `${Math.round(42 + rand() * 30)}kg`)
      .replace('{city}', pick(CITIES))
      .replace('{q}', String(1 + Math.floor(rand() * rand() * 3)))
      .replace('{d}', String(10000000 + Math.floor(rand() * 89999999)));
  }

  function nextComment(now) {
    const inPhase = (now - phaseStart) / phaseMs;
    const p = products[phase % products.length];
    // Đầu mỗi lượt sản phẩm: hỏi giá, size; giữa lượt: chốt đơn; cuối lượt: tương tác
    const w = inPhase < 0.25
      ? { question: 0.45, order: 0.25, praise: 0.08, chatter: 0.19, complaint: 0.03 }
      : inPhase < 0.7
        ? { question: 0.3, order: 0.38, praise: 0.1, chatter: 0.19, complaint: 0.03 }
        : { question: 0.25, order: 0.15, praise: 0.15, chatter: 0.42, complaint: 0.03 };
    // Tình huống thật hay gặp, để trợ lý hành động có việc mà gợi ý:
    //  - cứ 3 lượt sản phẩm có một đợt khách cũ vào khiếu nại đơn trước
    //  - cứ 4 lượt có một lượt khách hỏi dồn một sản phẩm chưa được giới thiệu
    if (phase % 3 === 2 && inPhase < 0.5) {
      w.complaint = 0.1;
      w.chatter -= 0.07;
    }
    let r = rand();
    let intent = 'chatter';
    for (const [k, v] of Object.entries(w)) {
      if ((r -= v) <= 0) { intent = k; break; }
    }
    // Thỉnh thoảng khách hỏi về sản phẩm khác, không phải sản phẩm đang giới thiệu
    const crowdAsk = phase % 4 === 1 && inPhase > 0.3 && intent === 'question' && rand() < 0.5;
    const target = crowdAsk ? products[(phase + 3) % products.length] : rand() < 0.12 ? pick(products) : p;
    const u = pick(users);
    seq += 1;
    return {
      type: 'comment',
      platformMsgId: `sim-${seed}-${run}-${seq}`,
      author: { handle: u.handle, nickname: u.nickname, platformUserId: `sim-${u.id}` },
      // Khách hỏi sản phẩm khác thì phải nhắc tên hoặc số giỏ, không thì không ai biết
      text: fill(pick(crowdAsk ? TEMPLATES.question.filter((t) => /{p}|{n}/.test(t)) : TEMPLATES[intent]), target),
      ts: new Date(now)
    };
  }

  return {
    platform: 'simulator',
    target: 'megalive-1111',
    simulated: true,
    async start(emit) {
      emit({ type: 'connected', info: { title: 'Megalive 11.11 (mô phỏng)' } });
      const tick = () => {
        if (stopped) return;
        const now = Date.now();
        if (phase < 0 || now - phaseStart >= phaseMs) {
          phase += 1;
          phaseStart = now;
          emit({ type: 'product', productId: products[phase % products.length].id });
        }
        emit(nextComment(now));
        const inPhase = (now - phaseStart) / phaseMs;
        // Nhịp: flash sale 20% đầu lượt ~4 câu/giây, sau đó ~1,5 câu/giây
        const rate = (inPhase < 0.2 ? 4 : inPhase < 0.6 ? 2 : 1.2) * speed;
        const wait = (-Math.log(1 - rand()) / rate) * 1000;
        timer = setTimeout(tick, Math.max(40, Math.min(4000, wait)));
      };
      tick();
      const drift = () => {
        if (stopped) return;
        const inPhase = (Date.now() - phaseStart) / phaseMs;
        viewers = Math.max(500, Math.round(viewers * (1 + (inPhase < 0.3 ? 0.04 : -0.012) + (rand() - 0.5) * 0.02)));
        likes += Math.floor(viewers * (0.05 + rand() * 0.1));
        emit({ type: 'viewers', count: viewers });
        emit({ type: 'likes', total: likes });
        viewerTimer = setTimeout(drift, 3000);
      };
      drift();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(viewerTimer);
    }
  };
}

module.exports = { createSimulator, MEGALIVE_CATALOG, MEGALIVE_POLICY };
