/**
 * TAXONOMY NHÃN PHÂN CẤP (Level 1 -> Level 2)
 * ------------------------------------------------------------------
 * Nguyên tắc phân nhánh: theo BỘ PHẬN CÓ THỂ HÀNH ĐỘNG ĐỂ KHẮC PHỤC,
 * không theo đối tượng được nhắc tới trong câu.
 *
 * Hệ quả quan trọng: "hư hỏng khi vận chuyển" thuộc nhánh Giao hàng
 * (Delivery), KHÔNG thuộc Chất lượng sản phẩm — vì nguyên nhân gốc và
 * bộ phận chịu trách nhiệm nằm ở khâu vận chuyển.
 */

const TAXONOMY = {
  Delivery: {
    label: 'Giao hàng',
    owner: 'Vận hành / Logistics',
    impact: 0.55,
    causes: {
      LateDelivery:         { label: 'Giao chậm',                   keywords: ['giao trễ', 'ship chậm', 'chờ mãi', 'mấy ngày rồi chưa', 'chưa thấy', 'chưa nhận được hàng', 'giữ hàng', 'bao giờ mới', 'vẫn chưa tới', 'tăm hơi', 'chưa giao', 'quá hẹn', 'trễ hẹn'] },
      LostPackage:          { label: 'Thất lạc',                    keywords: ['thất lạc', 'mất hàng', 'không nhận được', 'mất đơn', 'không có hàng'] },
      DamagedInTransit:     { label: 'Hư hỏng khi vận chuyển',      keywords: ['móp', 'bẹp', 'hộp nát', 'rách nát', 'vỡ khi nhận', 'đóng gói ẩu', 'bể khi giao', 'nát bươm', 'thùng carton', 'quăng quật', 'dập nát', 'không còn nguyên', 'bẹp dúm'] },
      WrongAddress:         { label: 'Sai địa chỉ',                 keywords: ['sai địa chỉ', 'giao nhầm', 'nhầm nhà', 'giao sai người', 'đưa nhầm', 'nhà người khác', 'tòa đối diện', 'nhầm địa chỉ'] },
      CourierAttitude:      { label: 'Thái độ nhân viên giao hàng', keywords: ['shipper', 'tài xế', 'người giao hàng', 'ném hàng'] }
    }
  },
  ProductQuality: {
    label: 'Chất lượng sản phẩm',
    owner: 'Sản phẩm / QC',
    impact: 0.70,
    causes: {
      NotAsDescribed:       { label: 'Không đúng mô tả',            keywords: ['không giống', 'khác ảnh', 'không đúng mô tả', 'khác quảng cáo', 'khác hình', 'size ghi', 'mặc vào chật', 'không như mô tả'] },
      TechnicalDefect:      { label: 'Lỗi kỹ thuật',                keywords: ['hỏng', 'không lên nguồn', 'chết máy', 'không hoạt động', 'tụt pin', 'lỗi phần cứng', 'yếu pin', 'hết pin nhanh', 'cục gạch', 'đèn báo', 'không nhận sạc', 'chập chờn', 'dùng được mấy hôm', 'dùng được đúng'] },
      ExpiredOrStale:       { label: 'Hết hạn / kém tươi',          keywords: ['hết hạn', 'mốc', 'ôi thiu', 'không tươi', 'cận date', 'quá date', 'quá hạn', 'héo', 'úa', 'hư thối', 'có mùi'] },
      MissingAccessory:     { label: 'Thiếu phụ kiện',              keywords: ['thiếu phụ kiện', 'thiếu cáp', 'thiếu sạc', 'thiếu quà', 'không có dây', 'chẳng có dây', 'thiếu đồ', 'không kèm', 'thiếu món', 'chẳng thấy'] },
      SuspectedCounterfeit: { label: 'Nghi ngờ hàng giả',           keywords: ['hàng giả', 'hàng nhái', 'hàng dựng', 'không chính hãng'] }
    }
  },
  CustomerService: {
    label: 'Dịch vụ khách hàng',
    owner: 'CSKH',
    impact: 0.45,
    causes: {
      SlowResponse:         { label: 'Phản hồi chậm',               keywords: ['không trả lời', 'không rep', 'gọi không nghe máy', 'chờ phản hồi', 'không ai bắt máy', 'không phản hồi', 'không rep gì'] },
      BadAttitude:          { label: 'Thái độ phục vụ',             keywords: ['thái độ', 'hống hách', 'lồi lõm', 'mất lịch sự', 'khó chịu ra mặt', 'cáu gắt', 'xấc'] },
      WrongInformation:     { label: 'Tư vấn sai thông tin',        keywords: ['tư vấn sai', 'sai thông tin', 'nói một đằng', 'lúc mua thì bảo', 'giờ lại nói', 'nói khác'] },
      UnresolvedCase:       { label: 'Không giải quyết dứt điểm',   keywords: ['chưa giải quyết', 'đá qua đá lại', 'vẫn chưa xong', 'không ai xử lý'] }
    }
  },
  Payment: {
    label: 'Thanh toán',
    owner: 'Tài chính / Kỹ thuật',
    impact: 0.90,
    causes: {
      GatewayError:         { label: 'Lỗi cổng thanh toán',         keywords: ['lỗi thanh toán', 'không thanh toán được', 'cổng thanh toán', 'giao dịch thất bại', 'thanh toán trục trặc', 'cổng cứ treo', 'không đặt được hàng', 'thẻ khác cũng không', /thanh toán[^.,;]{0,15}(lỗi|không được|thất bại|trục trặc)/] },
      DoubleCharge:         { label: 'Trừ tiền hai lần',            keywords: ['trừ hai lần', 'trừ 2 lần', 'trừ tiền thừa', 'mất tiền oan', 'trừ tiền hai'] },
      WrongPromotion:       { label: 'Sai khuyến mãi',              keywords: ['không áp mã', 'mã giảm giá lỗi', 'voucher không dùng được', 'chẳng thấy trừ', 'không được giảm', 'mã hết hạn'] },
      WrongInvoice:         { label: 'Sai hóa đơn',                 keywords: ['sai hóa đơn', 'hóa đơn lỗi', 'xuất vat', 'sai số tiền', 'hóa đơn xuất ra', 'sai mã số thuế', 'sai tên công ty'] }
    }
  },
  TechnicalApp: {
    label: 'Kỹ thuật / Ứng dụng',
    owner: 'Kỹ thuật / IT',
    impact: 0.60,
    causes: {
      AppSlowOrCrash:       { label: 'Ứng dụng chậm hoặc treo',     keywords: ['app lag', 'app chậm', 'lag', 'treo app', 'văng app', 'đơ app', 'giật lag', 'muốn xỉu'] },
      LoginError:           { label: 'Lỗi đăng nhập',               keywords: ['không đăng nhập', 'lỗi đăng nhập', 'không vào được tài khoản', 'báo sai mật khẩu', 'đăng nhập không được'] },
      DisplayError:         { label: 'Lỗi hiển thị',                keywords: ['lỗi hiển thị', 'giao diện lỗi', 'ảnh không hiện', 'ô trắng', 'không hiện', 'mất chữ', 'vỡ giao diện'] },
      SearchError:          { label: 'Lỗi tìm kiếm',                keywords: ['tìm không ra', 'lỗi tìm kiếm', 'search không được', 'ô tìm kiếm', 'chẳng ra kết quả', 'không tìm thấy sản phẩm'] }
    }
  },
  ReturnRefund: {
    label: 'Đổi trả & Hoàn tiền',
    owner: 'CSKH / Tài chính',
    impact: 0.75,
    causes: {
      SlowRefund:           { label: 'Hoàn tiền chậm',              keywords: ['hoàn tiền chậm', 'chưa hoàn tiền', 'đợi hoàn tiền', 'chưa thấy tiền'] },
      ReturnRejected:       { label: 'Từ chối đổi trả',             keywords: ['không cho đổi', 'từ chối trả hàng', 'không đổi trả', 'không chịu đổi'] },
      ComplexProcess:       { label: 'Quy trình phức tạp',          keywords: ['thủ tục rườm rà', 'quy trình phức tạp', 'nhiều bước quá', 'qua năm bước', 'rắc rối quá', 'rườm rà'] }
    }
  },
  PricePromotion: {
    label: 'Giá & Khuyến mãi',
    owner: 'Kinh doanh / Marketing',
    impact: 0.30,
    causes: {
      HigherThanExpected:   { label: 'Giá cao hơn kỳ vọng',         keywords: ['giá cao', 'đắt', 'giá chát', 'không đáng tiền', 'bên kia bán rẻ hơn', 'rẻ hơn cả', 'chặt chém', 'mắc quá'] },
      MisleadingPromo:      { label: 'Khuyến mãi gây hiểu nhầm',    keywords: ['quảng cáo sai', 'sale ảo', 'khuyến mãi ảo', 'nâng giá rồi giảm', 'đội giá', 'giảm sâu', 'treo biển giảm'] }
    }
  }
};

/**
 * Ánh xạ nhãn cũ (bản v1 + dữ liệu seed cũ) sang taxonomy chuẩn, để dữ
 * liệu lịch sử đang nằm trong MongoDB không mất nghĩa sau khi nâng cấp.
 */
const LEGACY_CATEGORY_MAP = {
  Delivery: 'Delivery',
  'Giao hàng': 'Delivery',
  'Product Quality': 'ProductQuality',
  Product: 'ProductQuality',
  'Chất lượng sản phẩm': 'ProductQuality',
  'Customer Service': 'CustomerService',
  'Dịch vụ khách hàng': 'CustomerService',
  Payment: 'Payment',
  'Thanh toán': 'Payment',
  'Technical Issue': 'TechnicalApp',
  Software: 'TechnicalApp',
  App: 'TechnicalApp',
  Refund: 'ReturnRefund',
  Return: 'ReturnRefund',
  Pricing: 'PricePromotion',
  Price: 'PricePromotion',
  Other: 'Other'
};

const LEGACY_CAUSE_MAP = {
  'Late Delivery': 'LateDelivery',
  Damaged: 'DamagedInTransit',
  Defective: 'TechnicalDefect',
  Battery: 'TechnicalDefect',
  Overheating: 'TechnicalDefect',
  Camera: 'TechnicalDefect',
  Unresponsive: 'SlowResponse',
  Misinformation: 'WrongInformation',
  'Bad Attitude': 'BadAttitude',
  'Wrong Info': 'WrongInformation',
  'App Error': 'AppSlowOrCrash',
  Bug: 'AppSlowOrCrash',
  Expensive: 'HigherThanExpected'
};

const CATEGORY_KEYS = Object.keys(TAXONOMY);

const CAUSE_COUNT = CATEGORY_KEYS.reduce(
  (sum, key) => sum + Object.keys(TAXONOMY[key].causes).length,
  0
);

/** Bề mặt kiểm định: dùng cho hiệu chỉnh đa kiểm định Benjamini-Hochberg */
const TEST_SURFACE = { categories: CATEGORY_KEYS.length, causes: CAUSE_COUNT };

function normalizeCategory(raw) {
  if (!raw) return 'Other';
  if (TAXONOMY[raw]) return raw;
  return LEGACY_CATEGORY_MAP[raw] || 'Other';
}

function normalizeCause(categoryKey, rawCause) {
  if (!rawCause) return null;
  const cat = TAXONOMY[categoryKey];
  if (cat && cat.causes[rawCause]) return rawCause;
  const mapped = LEGACY_CAUSE_MAP[rawCause];
  if (mapped && cat && cat.causes[mapped]) return mapped;
  if (!cat) return null;
  const hit = Object.entries(cat.causes).find(
    ([, v]) => v.label.toLowerCase() === String(rawCause).toLowerCase()
  );
  return hit ? hit[0] : null;
}

function categoryLabel(key) {
  return TAXONOMY[key] ? TAXONOMY[key].label : 'Khác';
}

function causeLabel(categoryKey, causeKey) {
  const cat = TAXONOMY[categoryKey];
  if (!cat || !causeKey || !cat.causes[causeKey]) return null;
  return cat.causes[causeKey].label;
}

function categoryImpact(key) {
  return TAXONOMY[key] ? TAXONOMY[key].impact : 0.25;
}

function categoryOwner(key) {
  return TAXONOMY[key] ? TAXONOMY[key].owner : 'Chưa phân công';
}

/**
 * Phân loại bằng luật từ khóa.
 * Đây là baseline B1 trong khung thực nghiệm, đồng thời là lưới an toàn
 * khi LLM lỗi hoặc trả về nhãn nằm ngoài taxonomy. Mô hình ViSoBERT tinh
 * chỉnh thay lớp này khi dịch vụ nlp_service sẵn sàng; giữ luật lại để đối chứng baseline.
 */
/**
 * DẤU HIỆU PHỦ ĐỊNH VÀ GIẢ ĐỊNH.
 *
 * Bộ khớp từ khóa thuần túy đọc "không hề bị móp méo" thành một khiếu
 * nại về hư hỏng, và "sợ hàng hỏng nhưng nhận về nguyên vẹn" thành một
 * khiếu nại về lỗi kỹ thuật. Cả hai đều là lời KHEN.
 *
 * Đây là giới hạn cố hữu của phương pháp từ khóa, và cũng chính là lý
 * do cần mô hình ngôn ngữ hiểu ngữ cảnh. Lớp luật dưới đây chỉ vá được
 * dạng phủ định trực tiếp, không vá được mỉa mai hay phủ định xa.
 */
const NEGATION_CUES = [
  'không hề', 'chẳng hề', 'không bị', 'chẳng bị', 'không có gì',
  'đâu có', 'chả thấy', 'không thấy', 'nguyên vẹn'
];

/** Dấu hiệu giả định: điều được nhắc tới là nỗi lo, không phải sự việc đã xảy ra */
const HYPOTHETICAL_CUES = ['sợ ', 'lo ', 'tưởng ', 'nghĩ là ', 'nghe nói '];

const NEGATION_WINDOW = 18; // số ký tự nhìn ngược lại trước vị trí từ khóa

/**
 * Kiểm tra một lần khớp từ khóa có bị phủ định hoặc chỉ là giả định không.
 * @param {string} text văn bản đã chuẩn hóa
 * @param {number} pos vị trí bắt đầu của từ khóa khớp được
 */
function isNegatedAt(text, pos) {
  const before = text.slice(Math.max(0, pos - NEGATION_WINDOW), pos);
  for (const cue of NEGATION_CUES) if (before.includes(cue)) return true;
  for (const cue of HYPOTHETICAL_CUES) if (before.includes(cue)) return true;
  return false;
}

/**
 * Mục từ khóa có thể là chuỗi hoặc biểu thức chính quy.
 * Trả về `true` chỉ khi có ít nhất một lần khớp KHÔNG bị phủ định.
 */
function keywordHit(kw, text) {
  if (kw instanceof RegExp) {
    const re = new RegExp(kw.source, kw.flags.replace('g', '') + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!isNegatedAt(text, m.index)) return true;
    }
    return false;
  }

  let from = 0;
  let pos = text.indexOf(kw, from);
  while (pos !== -1) {
    if (!isNegatedAt(text, pos)) return true;
    from = pos + 1;
    pos = text.indexOf(kw, from);
  }
  return false;
}

function classifyByRules(normalizedText) {
  const text = (normalizedText || '').toLowerCase();
  const matches = [];

  for (const catKey of CATEGORY_KEYS) {
    for (const [causeKey, cause] of Object.entries(TAXONOMY[catKey].causes)) {
      let hits = 0;
      const matchedKeywords = [];
      for (const kw of cause.keywords) {
        if (keywordHit(kw, text)) {
          hits += 1;
          matchedKeywords.push(kw instanceof RegExp ? kw.source : kw);
        }
      }
      if (hits > 0) {
        matches.push({
          category: catKey,
          cause: causeKey,
          confidence: Math.min(0.5 + hits * 0.15, 0.95),
          // Truy vết: nhãn luật nào cũng chỉ ra được từ khóa đã sinh ra nó
          keywords: matchedKeywords
        });
      }
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/** Dạng phẳng cho API /taxonomy và cho cây taxonomy trên giao diện */
function flatTaxonomy() {
  return CATEGORY_KEYS.map((key) => ({
    key,
    label: TAXONOMY[key].label,
    owner: TAXONOMY[key].owner,
    impact: TAXONOMY[key].impact,
    causes: Object.entries(TAXONOMY[key].causes).map(([ck, cv]) => ({
      key: ck,
      label: cv.label
    }))
  }));
}

module.exports = {
  TAXONOMY,
  CATEGORY_KEYS,
  CAUSE_COUNT,
  TEST_SURFACE,
  normalizeCategory,
  normalizeCause,
  categoryLabel,
  causeLabel,
  categoryImpact,
  categoryOwner,
  classifyByRules,
  flatTaxonomy
};
