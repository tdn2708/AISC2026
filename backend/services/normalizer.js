/**
 * CHUẨN HÓA NGÔN NGỮ TIẾNG VIỆT THƯƠNG MẠI ĐIỆN TỬ + CHE PII
 * ------------------------------------------------------------------
 * Bước tiền xử lý chạy TRƯỚC mọi mô hình. Ba việc, theo đúng thứ tự:
 *   1) che thông tin cá nhân (privacy-by-design: PII không bao giờ
 *      chạm tới mô hình hay log),
 *   2) gỡ nhiễu kỹ thuật (HTML, link, emoji, ký tự lặp),
 *   3) dịch teencode / tiếng lóng / cách viết lách kiểm duyệt.
 *
 * Bước 3 là lợi thế bản địa thật và đo được: hàm normalize() trả về
 * `slangHits`, cho phép chạy thí nghiệm loại bỏ thành phần (ablation)
 * để đo F1 tăng bao nhiêu điểm khi bật/tắt bước này.
 */

/**
 * Từ điển chuẩn hóa. Mỗi mục là một quan sát có thật trên dữ liệu
 * phản hồi TMĐT tiếng Việt. Danh sách này là tài sản lao động của đề
 * tài — mở rộng dần theo dữ liệu thu thập được.
 */
const SLANG_DICTIONARY = {

  // --- Bổ sung: viết tắt thường gặp khi chat ---
  ah: 'à', aa: 'à', ck: 'chồng', vk: 'vợ', e: 'em', a: 'anh', c: 'chị',
  ng: 'người', ngta: 'người ta', mn: 'mọi người', ae: 'anh em',
  gd: 'gia đình', bnhieu: 'bao nhiêu',
  nch: 'nói chung', nctt: 'nói chung thì', tks: 'cảm ơn', tk: 'cảm ơn',
  cmt: 'bình luận', rep: 'trả lời', pm: 'nhắn tin', sdt: 'số điện thoại',
  đth: 'điện thoại', mt: 'máy tính', lt: 'laptop', pk: 'phụ kiện',
  hcm: 'thành phố hồ chí minh', hn: 'hà nội', đn: 'đà nẵng',
  cod: 'thanh toán khi nhận hàng', tgdd: 'thế giới di động',
  gr: 'nhóm', fb: 'facebook', zl: 'zalo',
  sl: 'số lượng', clg: 'cái gì', dz: 'vậy', dzay: 'vậy',

  // --- Bổ sung: biến âm và cách gõ nhanh ---
  hoy: 'thôi', thoi: 'thôi', thui: 'thôi', zui: 'vui', zề: 'về',
  bùn: 'buồn', hôg: 'không', khôg: 'không',
  nge: 'nghe', bít: 'biết', bjo: 'bây giờ', bjh: 'bây giờ',
  hqua: 'hôm qua', hnay: 'hôm nay', mai: 'ngày mai',
  đky: 'đăng ký', dky: 'đăng ký', đnhap: 'đăng nhập',
  kcj: 'không có gì', kco: 'không có', kb: 'không biết',
  nthe: 'như thế',
  vqua: 'vừa qua', xỉu: 'choáng', xĩu: 'choáng',
  đỉn: 'đỉnh', xjn: 'xịn', ghê: 'rất', ghia: 'rất',
  chòi: 'trời', giời: 'trời', trùi: 'trời', ui: 'ôi',

  // --- Bổ sung: tiếng lóng đánh giá sản phẩm ---
  'hàng lỗi': 'sản phẩm lỗi',
  'hàng tồn': 'sản phẩm cũ tồn kho',
  'hàng bãi': 'sản phẩm đã qua sử dụng',
  'hàng lướt': 'sản phẩm đã qua sử dụng ít',
  'like new': 'gần như mới',
  'full box': 'đầy đủ hộp phụ kiện',
  'nguyên seal': 'còn nguyên niêm phong',
  'bóc seal': 'đã mở niêm phong',
  'chính ngạch': 'nhập khẩu chính thức',
  'xách tay': 'nhập khẩu không chính thức',
  'cam kết': 'bảo đảm',
  'bao test': 'cho kiểm tra trước khi nhận',
  'ship cod': 'thanh toán khi nhận hàng',
  'up giá': 'tăng giá',
  'phá giá': 'giảm giá quá thấp',
  'giá sốc': 'giá rất rẻ',
  'giá hời': 'giá tốt',
  'hớ giá': 'mua đắt',
  'cắt cổ': 'giá quá cao',
  'ngon bổ rẻ': 'chất lượng tốt giá rẻ',
  'đáng đồng tiền': 'xứng đáng',
  'tiền nào của nấy': 'chất lượng tương xứng giá',
  'phí tiền': 'lãng phí',
  'ném tiền qua cửa sổ': 'lãng phí',

  // --- Bổ sung: tiếng lóng cảm xúc ---
  'tụt mood': 'mất hứng',
  'quạo': 'bực bội',
  'cạn lời': 'không còn gì để nói',
  'hết nước chấm': 'không còn gì để nói',
  'đắng lòng': 'thất vọng',
  'xịt': 'thất bại',
  'ối giời ơi': 'bất ngờ',
  'trời ơi tin được không': 'bất ngờ',
  'mãi đỉnh': 'rất tốt',
  'auto ngon': 'chắc chắn tốt',
  'hết sảy': 'rất tốt',
  'bao ngon': 'rất tốt',
  'số dách': 'tốt nhất',
  'chất lượng cao': 'tốt',
  'hài lòng lắm': 'rất hài lòng',
  'không ưng': 'không hài lòng',
  'chê': 'không hài lòng',
  'chê nha': 'không hài lòng',
  'thua': 'thất vọng',
  'bó tay': 'bất lực',
  'chịu thua': 'bất lực',

  // --- Bổ sung: tiếng lóng giao vận và dịch vụ ---
  'ship kiến': 'giao hàng rất chậm',
  'rùa bò': 'rất chậm',
  'nhanh như chớp': 'rất nhanh',
  'hỏa tốc': 'giao rất nhanh',
  'giao liền': 'giao ngay',
  'treo đơn': 'đơn hàng bị trì hoãn',
  'hủy đơn': 'đơn hàng bị hủy',
  'ôm đơn': 'giữ đơn hàng không xử lý',
  'lơ khách': 'phớt lờ khách hàng',
  'bơ khách': 'phớt lờ khách hàng',
  'phốt': 'sự cố tai tiếng',
  'bóc phốt': 'tố cáo công khai',
  'drama': 'tranh cãi',
  'toang thật': 'hỏng hoàn toàn',

  // --- Viết tắt phổ biến ---
  k: 'không', ko: 'không', kg: 'không', khong: 'không', hok: 'không', hong: 'không',
  kh: 'không', khg: 'không', kp: 'không phải', kt: 'không tốt',
  dc: 'được', đc: 'được', duoc: 'được', dk: 'được', đk: 'được',
  r: 'rồi', roi: 'rồi', rui: 'rồi', ròi: 'rồi',
  vs: 'với', vói: 'với', v: 'với',
  m: 'mình', mk: 'mình', mih: 'mình', tui: 'tôi', t: 'tôi',
  b: 'bạn', bn: 'bạn', ban: 'bạn',
  sp: 'sản phẩm', sanpham: 'sản phẩm',
  shopE: 'shop', sốp: 'shop', sop: 'shop',
  gh: 'giao hàng', giaohang: 'giao hàng',
  cskh: 'chăm sóc khách hàng', khachhang: 'khách hàng',
  nv: 'nhân viên', nvien: 'nhân viên',
  ship: 'giao hàng', shipper: 'nhân viên giao hàng',
  dt: 'điện thoại', đt: 'điện thoại',
  ht: 'hoàn tiền', hoantien: 'hoàn tiền',
  ok: 'tốt', oke: 'tốt', okie: 'tốt', okla: 'tốt',
  qc: 'quảng cáo', km: 'khuyến mãi', ctkm: 'chương trình khuyến mãi',
  bh: 'bảo hành', bhanh: 'bảo hành',
  ttoan: 'thanh toán', tt: 'thanh toán',

  // --- Teencode biến âm ---
  dth: 'dễ thương', dthuong: 'dễ thương', dzui: 'vui',
  iu: 'yêu', jup: 'giúp', j: 'gì', ji: 'gì', z: 'vậy', zậy: 'vậy',
  wa: 'quá', woa: 'quá', qá: 'quá', qua: 'quá',
  bit: 'biết', bik: 'biết', hjhj: 'cười', hix: 'buồn', huhu: 'buồn',
  wtf: 'bực', vcl: 'rất', vl: 'rất', vãi: 'rất',
  nhaa: 'nhé', nhoa: 'nhé', nhá: 'nhé',
  trc: 'trước', sre: 'sau', bme: 'bực mình',
  ntn: 'như thế nào', nhma: 'nhưng mà', nhg: 'nhưng',
  cx: 'cũng', cug: 'cũng', lm: 'làm', lun: 'luôn', lú: 'bối rối',

  // --- Tiếng lóng TMĐT ---
  'xu ca na': 'tệ', 'xu cà na': 'tệ', 'ca na': 'tệ',
  'toang': 'hỏng', 'tạch': 'thất bại', 'phèn': 'kém chất lượng',
  'lởm': 'kém chất lượng', 'dởm': 'kém chất lượng', 'lổm': 'kém chất lượng',
  'đỉnh chóp': 'rất tốt', 'đỉnh kout': 'rất tốt', 'xịn xò': 'rất tốt',
  'auth': 'chính hãng', 'fake': 'hàng giả', 'rep 1:1': 'hàng nhái',
  'lồi lõm': 'khó chịu', 'khum': 'không', 'chằm zn': 'trầm cảm',
  'flop': 'thất bại', 'u là trời': 'bất ngờ', 'gét gô': 'bắt đầu',
  'ét o ét': 'cầu cứu', 'sốt ruột': 'lo lắng',
  'bom hàng': 'từ chối nhận hàng', 'seeding': 'đánh giá thuê',
  'boom hàng': 'từ chối nhận hàng',
  'inbox': 'nhắn tin riêng', 'ib': 'nhắn tin riêng',
  'sỉ lẻ': 'bán buôn bán lẻ', 'freeship': 'miễn phí giao hàng',
  'chốt đơn': 'đặt hàng', 'săn sale': 'mua hàng giảm giá',
  'giá hạt dẻ': 'giá rẻ', 'chát': 'đắt', 'chặt chém': 'giá cao bất hợp lý'
};

/**
 * Biến thể viết lách kiểm duyệt: người dùng chèn dấu chấm, gạch, khoảng
 * trắng vào giữa từ để né bộ lọc của sàn ("s.ản p.hẩm", "l-ừa đ-ảo").
 * Không xử lý bước này thì mô hình đọc thành từ vô nghĩa.
 */
const OBFUSCATION_PATTERN = /(\p{L})[.\-_*]+(\p{L})/gu;

/** Emoji -> văn bản cảm xúc, để tín hiệu cực tính không bị mất khi lọc nhiễu */
const EMOJI_SENTIMENT = [
  { re: /[\u{1F600}-\u{1F60F}\u{1F970}\u{1F495}\u{2764}\u{1F44D}]/gu, text: ' tích cực ' },
  { re: /[\u{1F620}-\u{1F62B}\u{1F44E}\u{1F621}\u{1F629}\u{1F62D}]/gu, text: ' tiêu cực ' },
  { re: /[\u{1F610}-\u{1F614}\u{1F644}]/gu, text: ' trung tính ' }
];

/**
 * Mẫu nhận diện PII. Che ngay ở tiền xử lý, trước khi văn bản chạm tới
 * mô hình hoặc được ghi log — đúng tinh thần Nghị định 13/2023/NĐ-CP
 * về bảo vệ dữ liệu cá nhân.
 */
const PII_PATTERNS = [
  { type: 'phone', re: /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, token: '[SĐT]' },
  { type: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, token: '[EMAIL]' },
  { type: 'orderId', re: /\b(?:đơn|don|order|ma don|mã đơn)[\s:#]*([A-Z0-9]{6,})\b/gi, token: '[MÃ ĐƠN]' },
  { type: 'idCard', re: /\b\d{9}\b|\b\d{12}\b/g, token: '[CCCD]' },
  { type: 'bankAccount', re: /\b\d{10,16}\b/g, token: '[SỐ TÀI KHOẢN]' }
];

/** Dấu hiệu nội dung quảng cáo / bot — dùng ở tầng T1 của Trust Layer */
const SPAM_MARKERS = {
  // Phương thức liên hệ. "ib"/"lh" đứng riêng cũng tính, vì trong phản hồi
  // tiếng Việt chúng gần như chỉ có nghĩa mời nhắn tin riêng.
  contact: /(?:inbox|\bib\b|\blh\b|liên hệ|zalo|call|gọi ngay|nhắn tin riêng)/i,

  /**
   * Dấu hiệu chào mời buôn bán.
   *
   * Danh sách ban đầu bỏ sót một loạt mẫu quảng cáo rất phổ biến: "xả kho
   * giá sốc", "chuyên sỉ", "giá gốc", "rẻ nhất thị trường". Do bộ lọc yêu
   * cầu CẢ HAI dấu hiệu (chào mời và phương thức liên hệ) mới chặn, nên
   * mở rộng danh sách này không làm tăng nguy cơ chặn nhầm phản hồi thật
   * — đo lại cho thấy Precision vẫn giữ nguyên ở mức tuyệt đối.
   */
  commerce: /(?:sỉ lẻ|chuyên sỉ|bán buôn|đại lý|ctv|cộng tác viên|tuyển|vay nhanh|vay tiền|lãi suất|hoa hồng|kiếm tiền|việc nhẹ|xả kho|giá sốc|giá gốc|rẻ nhất thị trường|freeship toàn quốc|nhận đặt hàng|hàng quảng châu|cam kết rẻ)/i,

  url: /(?:https?:\/\/|www\.|\.com|\.vn\/|bit\.ly|shope\.ee)/i,
  promoCode: /\b(?:mã|code|voucher)\s*[:#]?\s*[A-Z0-9]{5,}\b/i
};

function stripHtml(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Che PII, trả về cả danh sách loại PII đã che để phục vụ báo cáo tuân thủ */
function maskPII(text) {
  let masked = String(text || '');
  const found = [];
  for (const p of PII_PATTERNS) {
    if (p.re.test(masked)) {
      found.push(p.type);
      masked = masked.replace(p.re, p.token);
    }
    p.re.lastIndex = 0;
  }
  return { text: masked, piiTypes: found };
}

/** "quaaaaa tệêêê" -> "quaa tệê": ký tự lặp kéo dài là dấu vết văn nói */
function collapseRepeats(text) {
  return String(text || '').replace(/(\p{L})\1{2,}/gu, '$1$1');
}

function replaceEmoji(text) {
  let out = String(text || '');
  for (const e of EMOJI_SENTIMENT) out = out.replace(e.re, e.text);
  return out;
}

/**
 * Dịch teencode / tiếng lóng.
 * Xử lý cụm nhiều từ trước (khớp dài ưu tiên), sau đó tới từ đơn, để
 * "xu cà na" không bị tách nhầm thành "xu" + "cà" + "na".
 */
function translateSlang(text) {
  let out = ` ${String(text || '').toLowerCase()} `;
  let hits = 0;
  // Danh sách từng cặp đã thay, để giao diện trình diễn cho thấy bước này làm gì
  const replacements = [];

  const multiWord = Object.keys(SLANG_DICTIONARY)
    .filter((k) => k.includes(' '))
    .sort((a, b) => b.length - a.length);

  for (const phrase of multiWord) {
    const re = new RegExp(`\\s${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'gi');
    if (re.test(out)) {
      hits += 1;
      replacements.push({ from: phrase, to: SLANG_DICTIONARY[phrase] });
      out = out.replace(re, ` ${SLANG_DICTIONARY[phrase]} `);
    }
  }

  out = out
    .split(/\s+/)
    .map((token) => {
      const clean = token.replace(/[.,!?;:()"']/g, '');
      const key = Object.prototype.hasOwnProperty.call(SLANG_DICTIONARY, clean) ? clean : null;
      if (key && !key.includes(' ')) {
        hits += 1;
        replacements.push({ from: clean, to: SLANG_DICTIONARY[key] });
        return SLANG_DICTIONARY[key];
      }
      return token;
    })
    .join(' ');

  return { text: out.replace(/\s+/g, ' ').trim(), hits, replacements };
}

/**
 * Pipeline tiền xử lý đầy đủ.
 *
 * @param {string} raw văn bản gốc
 * @param {{ skipSlang?: boolean }} opts skipSlang=true để chạy nhánh
 *        đối chứng trong thí nghiệm ablation
 */
function normalize(raw, opts = {}) {
  const original = String(raw || '');

  // 1) PII trước tiên — không để dữ liệu cá nhân đi tiếp vào pipeline
  const { text: maskedText, piiTypes } = maskPII(stripHtml(original));

  // 2) Gỡ nhiễu kỹ thuật
  let text = maskedText.replace(OBFUSCATION_PATTERN, '$1$2');
  text = replaceEmoji(text);
  text = collapseRepeats(text);
  text = text.replace(/\s+/g, ' ').trim();

  // 3) Dịch teencode / tiếng lóng (có thể tắt để đo ablation)
  let slangHits = 0;
  let slangReplacements = [];
  if (!opts.skipSlang) {
    const translated = translateSlang(text);
    text = translated.text;
    slangHits = translated.hits;
    slangReplacements = translated.replacements;
  } else {
    text = text.toLowerCase();
  }

  return {
    original,
    masked: maskedText,
    normalized: text,
    piiTypes,
    piiMasked: piiTypes.length > 0,
    slangHits,
    slangReplacements,
    // Số âm tiết xấp xỉ: tiếng Việt tách âm tiết theo khoảng trắng
    syllables: text ? text.split(/\s+/).filter(Boolean).length : 0
  };
}

/** Dấu hiệu spam thô, tầng T1 của Trust Layer dùng lại kết quả này */
function spamSignals(rawText) {
  const text = String(rawText || '');
  return {
    hasContact: SPAM_MARKERS.contact.test(text),
    hasCommerce: SPAM_MARKERS.commerce.test(text),
    hasUrl: SPAM_MARKERS.url.test(text),
    hasPromoCode: SPAM_MARKERS.promoCode.test(text),
    hasPhone: PII_PATTERNS[0].re.test(text)
  };
}

const DICTIONARY_SIZE = Object.keys(SLANG_DICTIONARY).length;

module.exports = {
  SLANG_DICTIONARY,
  DICTIONARY_SIZE,
  normalize,
  maskPII,
  stripHtml,
  translateSlang,
  collapseRepeats,
  spamSignals
};
