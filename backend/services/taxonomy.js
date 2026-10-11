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
      DamagedInTransit:     { label: 'Hư hỏng khi vận chuyển',      keywords: ['móp', 'bẹp', 'hộp nát', 'rách nát', 'vỡ khi nhận', 'đóng gói ẩu', 'bể khi giao', 'nát bươm', 'quăng quật', 'dập nát', 'không còn nguyên', 'bẹp dúm'], mentions: [{ terms: ['thùng carton'], cues: 'damage' }] },
      WrongAddress:         { label: 'Sai địa chỉ',                 keywords: ['sai địa chỉ', 'giao nhầm', 'nhầm nhà', 'giao sai người', 'đưa nhầm', 'nhà người khác', 'tòa đối diện', 'nhầm địa chỉ'] },
      CourierAttitude:      { label: 'Thái độ nhân viên giao hàng', keywords: ['ném hàng'], mentions: [{ terms: ['shipper', 'tài xế', 'người giao hàng'], cues: 'attitude' }] }
    }
  },
  ProductQuality: {
    label: 'Chất lượng sản phẩm',
    owner: 'Sản phẩm / QC',
    impact: 0.70,
    causes: {
      NotAsDescribed:       { label: 'Không đúng mô tả',            keywords: ['không giống', 'khác ảnh', 'không đúng mô tả', 'khác quảng cáo', 'khác hình', 'size ghi', 'mặc vào chật', 'không như mô tả'] },
      TechnicalDefect:      { label: 'Lỗi kỹ thuật',                keywords: ['hỏng', 'không lên nguồn', 'chết máy', 'không hoạt động', 'tụt pin', 'lỗi phần cứng', 'yếu pin', 'hết pin nhanh', 'cục gạch', 'không nhận sạc', 'chập chờn', 'dùng được mấy hôm', 'dùng được đúng'], mentions: [{ terms: ['đèn báo'], cues: 'device' }] },
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
      GatewayError:         { label: 'Lỗi cổng thanh toán',         keywords: ['lỗi thanh toán', 'không thanh toán được', 'giao dịch thất bại', 'thanh toán trục trặc', 'cổng cứ treo', 'không đặt được hàng', 'thẻ khác cũng không', /thanh toán[^.,;]{0,15}(lỗi|không được|thất bại|trục trặc)/], mentions: [{ terms: ['cổng thanh toán'], cues: 'payment' }] },
      DoubleCharge:         { label: 'Trừ tiền hai lần',            keywords: ['trừ hai lần', 'trừ 2 lần', 'trừ tiền thừa', 'mất tiền oan', 'trừ tiền hai'] },
      WrongPromotion:       { label: 'Sai khuyến mãi',              keywords: ['không áp mã', 'mã giảm giá lỗi', 'voucher không dùng được', 'chẳng thấy trừ', 'không được giảm', 'mã hết hạn'] },
      WrongInvoice:         { label: 'Sai hóa đơn',                 keywords: ['sai hóa đơn', 'hóa đơn lỗi', 'sai số tiền', 'sai mã số thuế', 'sai tên công ty'], mentions: [{ terms: ['xuất vat', 'hóa đơn xuất ra'], cues: 'invoice' }] }
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
      ComplexProcess:       { label: 'Quy trình phức tạp',          keywords: ['thủ tục rườm rà', 'quy trình phức tạp', 'nhiều bước quá', 'rắc rối quá', 'rườm rà'] }
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
  // Phủ định đứng NGAY trước từ khóa: "không lag", "chưa hỏng", "không nói
  // khác gì". Không dùng "không" bất kỳ trong cửa sổ, vì "không nhận được
  // hàng, hộp móp" thì "móp" vẫn là lời chê thật.
  return IMMEDIATE_NEGATION.test(before);
}

const IMMEDIATE_NEGATION = /(?:^|\s)(?:không|chẳng|chả|chưa|đâu có)(?:\s+(?:bị|có|hề|thấy|còn))?\s*$/;

/**
 * Từ khóa đứng ngay trước một lời khen thì không phải lời chê: "thái độ rất
 * tốt", "thái độ phục vụ chuyên nghiệp". Cho phép xen tối đa hai từ, nhưng
 * từ xen không được là từ phủ định ("thái độ không tốt" vẫn là chê).
 */
const PRAISE_AFTER = /^(?:\s+(?!(?:không|chẳng|chả|chưa)(?![\p{L}]))[\p{L}]+){0,2}?\s+(?:(?:rất|cực|khá|quá|siêu|luôn|cũng|vô cùng)\s+)?(?:tốt|thân thiện|nhiệt tình|vui vẻ|lịch sự|dễ thương|chuyên nghiệp|ổn|tuyệt|chu đáo|niềm nở|cẩn thận|hài lòng)(?![\p{L}])/u;

function praiseFollows(text, end) {
  return PRAISE_AFTER.test(text.slice(end, end + 48));
}

/**
 * TỪ CHÊ dùng để xác nhận một DANH TỪ KHÍA CẠNH (mentions). Nhắc tới
 * "shipper" hay "cổng thanh toán" chưa phải khiếu nại — "shipper thân thiện"
 * là lời khen. Danh từ chỉ thành khiếu nại khi cùng mệnh đề có lời chê
 * đúng loại, và lời chê đó không bị phủ định ("shipper không hề cáu gắt").
 */
const MENTION_CUES = {
  attitude: ['thái độ', 'cáu', 'gắt', 'quát', 'chửi', 'hỗn', 'láo', 'thô lỗ', 'mất lịch sự', 'bất lịch sự',
    'khó chịu', 'bực bội', 'hống hách', 'cọc', 'xấc', 'ném', 'quăng', 'vứt', 'không nghe máy', 'không gọi',
    'bắt chờ', 'đòi thêm', 'tự ý', 'lừa', 'kém', 'tệ'],
  damage: ['móp', 'bẹp', 'rách', 'nát', 'ướt', 'vỡ', 'bể', 'dập', 'thủng', 'méo', 'hư'],
  device: ['nhấp nháy', 'không sáng', 'không lên', 'chớp', 'lỗi', 'tắt ngúm', 'báo đỏ'],
  payment: ['lỗi', 'treo', 'đơ', 'trục trặc', 'thất bại', 'không vào được', 'không được', 'chậm', 'văng', 'quay mãi'],
  invoice: ['sai', 'lỗi', 'nhầm', 'thiếu', 'chưa', 'không xuất', 'mãi', 'chậm', 'trễ']
};

/** Ranh giới mệnh đề quanh vị trí pos: dấu câu hoặc "nhưng" */
function clauseAround(text, pos) {
  const DELIM = /[.,;!?\n]|\snhưng\s/g;
  let start = 0;
  let end = text.length;
  let m;
  while ((m = DELIM.exec(text)) !== null) {
    if (m.index < pos) start = m.index + m[0].length;
    else {
      end = m.index;
      break;
    }
  }
  return [start, end];
}

/** Khớp một nhóm danh từ khía cạnh; trả nhãn truy vết "danh từ+từ chê" hoặc null */
function mentionHit(group, text) {
  const cues = MENTION_CUES[group.cues] || [];
  for (const term of group.terms) {
    for (const form of keywordForms(term)) {
      for (let pos = text.indexOf(form); pos !== -1; pos = text.indexOf(form, pos + 1)) {
        if (isNegatedAt(text, pos)) continue;
        const [cs, ce] = clauseAround(text, pos);
        for (const cue of cues) {
          for (const cueForm of keywordForms(cue)) {
            for (let c = text.indexOf(cueForm, cs); c !== -1 && c + cueForm.length <= ce; c = text.indexOf(cueForm, c + 1)) {
              const insideTerm = c >= pos && c < pos + form.length;
              if (insideTerm || isNegatedAt(text, c) || praiseFollows(text, c + cueForm.length)) continue;
              return `${term}+${cue}`;
            }
          }
        }
      }
    }
  }
  return null;
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
      if (!isNegatedAt(text, m.index) && !praiseFollows(text, m.index + m[0].length)) return true;
    }
    return false;
  }

  for (const form of keywordForms(kw)) {
    let from = 0;
    let pos = text.indexOf(form, from);
    while (pos !== -1) {
      if (!isNegatedAt(text, pos) && !praiseFollows(text, pos + form.length)) return true;
      from = pos + 1;
      pos = text.indexOf(form, from);
    }
  }
  return false;
}

/**
 * Luật chạy trên văn bản ĐÃ chuẩn hóa, nên từ khóa chứa teencode sẽ không bao
 * giờ khớp: "ship chậm" trong câu đã bị dịch thành "giao hàng chậm". Mỗi từ
 * khóa vì vậy được so ở cả dạng gốc lẫn dạng đã qua cùng bộ dịch teencode.
 */
const keywordFormCache = new Map();
function keywordForms(kw) {
  let forms = keywordFormCache.get(kw);
  if (!forms) {
    const { translateSlang } = require('./normalizer');
    const translated = translateSlang(kw).text;
    forms = translated && translated !== kw ? [kw, translated] : [kw];
    keywordFormCache.set(kw, forms);
  }
  return forms;
}

function classifyByRules(normalizedText) {
  const text = String(normalizedText || '').normalize('NFC').toLowerCase();
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
      for (const group of cause.mentions || []) {
        const label = mentionHit(group, text);
        if (label) {
          hits += 1;
          matchedKeywords.push(label);
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
  keywordForms,
  flatTaxonomy
};
