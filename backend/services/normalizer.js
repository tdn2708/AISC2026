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
  // "Chê" bị phủ định là lời KHEN. Cụm dài được khớp trước "chê" đứng riêng,
  // nên "không có gì để chê" không còn bị dịch thành "... không hài lòng".
  'không có gì để chê': 'rất hài lòng',
  'không có gì để chê trách': 'rất hài lòng',
  'chẳng có gì để chê': 'rất hài lòng',
  'không có gì phải chê': 'rất hài lòng',
  'chẳng có gì phải chê': 'rất hài lòng',
  'không có gì chê': 'rất hài lòng',
  'không có gì để phàn nàn': 'rất hài lòng',
  'chẳng có gì để phàn nàn': 'rất hài lòng',
  'không chê vào đâu được': 'rất hài lòng',
  'không chê vào đâu': 'rất hài lòng',
  'không chê được': 'rất hài lòng',
  'chẳng chê được': 'rất hài lòng',
  'không thể chê': 'rất hài lòng',
  'hết chỗ chê': 'rất tốt',
  'miễn chê': 'rất tốt',
  'khỏi chê': 'rất tốt',
  'không chê': 'hài lòng',
  'chẳng chê': 'hài lòng',
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
  // "kt" trong phản hồi TMĐT gần như luôn là "kiểm tra" ("kt hàng"); dịch
  // thành "không tốt" từng đảo ngược cảm xúc của cả câu
  kh: 'không', khg: 'không', kp: 'không phải', kt: 'kiểm tra',
  dc: 'được', đc: 'được', duoc: 'được', dk: 'được', đk: 'được',
  r: 'rồi', roi: 'rồi', rui: 'rồi', ròi: 'rồi',
  vs: 'với', vói: 'với', v: 'với',
  m: 'mình', mk: 'mình', mih: 'mình', tui: 'tôi', t: 'tôi',
  // Không có "ban" -> "bạn": "ban" là từ thật (ban đầu, ban ngày, ban quản lý)
  b: 'bạn', bn: 'bạn',
  sp: 'sản phẩm', sanpham: 'sản phẩm',
  sốp: 'shop', sop: 'shop',
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
  // Không có "qua" -> "quá": "qua" là từ thật (hôm qua, đi qua, đá qua đá lại)
  wa: 'quá', woa: 'quá', qá: 'quá',
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
// Chỉ nối khi mảnh bên trái là MỘT chữ cái đứng riêng ("s.ản", "l-ừa",
// "c.h.ấ.t"). Bản cũ nối mọi cặp chữ quanh dấu chấm, nên câu gõ thiếu
// khoảng trắng sau dấu chấm ("sp tốt.giao chậm") bị dính thành "tốtgiao".
const OBFUSCATION_PATTERN = /(?<![\p{L}\p{M}])(\p{L}\p{M}*)[.\-_*]+(?=\p{L})/gu;
// Dấu câu kẹp giữa hai từ mà thiếu khoảng trắng: tách ra thành hai từ
const MISSING_SPACE_PATTERN = /(\p{L}\p{M}*)([.,!?;:]+)(?=\p{L})/gu;

/**
 * Đưa văn bản về một dạng mã hóa duy nhất trước mọi bước khác.
 *
 * Cùng một chữ tiếng Việt có thể đến dưới hai dạng Unicode: dựng sẵn (NFC,
 * "ộ" là một ký tự) hoặc tổ hợp (NFD, "o" + dấu mũ + dấu nặng) — bàn phím
 * macOS/iOS, một số chế độ của Unikey và văn bản dán từ PDF cho ra dạng tổ
 * hợp. Không đưa về NFC thì mọi so khớp từ điển, từ khóa luật và ý định đều
 * trượt dù mắt người thấy hai chuỗi giống hệt nhau. Ký tự vô hình (zero-width)
 * cũng bị gỡ vì chúng là một cách né bộ lọc.
 */
function canonicalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[  -   　]/g, ' ');
}

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
  // `\b` của JS không coi "đ" là chữ nên "\bđơn" không bao giờ khớp sau một
  // khoảng trắng; dùng ranh giới Unicode. Mã đơn phải có ít nhất một chữ số,
  // nếu không "order received" cũng bị che thành mã đơn.
  { type: 'orderId', re: /(?<![\p{L}\p{N}])(?:mã đơn|ma don|đơn|don|order)[\s:#]*(?=[A-Z]*\d)[A-Z0-9]{6,}(?![\p{L}\p{N}])/giu, token: '[MÃ ĐƠN]' },
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
  let masked = canonicalize(text);
  const found = [];
  for (const p of PII_PATTERNS) {
    p.re.lastIndex = 0;
    if (p.re.test(masked)) {
      found.push(p.type);
      masked = masked.replace(p.re, p.token);
    }
    p.re.lastIndex = 0;
  }
  return { text: masked, piiTypes: found };
}

/** Bỏ dấu thanh (giữ mũ/móc/trăng): "ệ" -> "ê", "á" -> "a" */
function stripTone(ch) {
  return ch.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
}

const TONED_VOWEL_THEN_SAME = /([àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ])([aăâeêioôơuưy])\2*/giu;

/**
 * "chậmmmm quáaaa tệêêê" -> "chậm quá tệ": ký tự lặp kéo dài là dấu vết văn nói.
 * Lặp từ 3 lần trở lên rút về MỘT ký tự (bản cũ giữ hai, để lại "chậmm" không
 * khớp được từ khóa nào), rồi gỡ nguyên âm kéo dài sau nguyên âm mang thanh
 * cùng gốc ("quáa" -> "quá"). Tiếng Việt không có âm tiết nào mà nguyên âm
 * mang thanh đứng trước chính nguyên âm gốc của nó, nên bước này không làm
 * hỏng từ thật.
 */
function collapseRepeats(text) {
  return String(text || '')
    .replace(/(\p{L})\1{2,}/gu, '$1')
    .replace(TONED_VOWEL_THEN_SAME, (m, toned, plain) =>
      stripTone(toned).toLowerCase() === plain.toLowerCase() ? toned : m
    );
}

// ==================================================================
// ÂM TIẾT TIẾNG VIỆT VÀ TELEX CHƯA ĐƯỢC CHUYỂN
// ==================================================================

/**
 * Cấu trúc âm tiết: phụ âm đầu? + vần (nguyên âm chính) + phụ âm cuối?
 * Đủ chặt để phân biệt "ngon", "chậm" (âm tiết thật) với "hhhh", "frê",
 * "gôd" (không phải tiếng Việt). Kiểm tra trên dạng đã bỏ dấu thanh.
 */
const ONSETS = ['ngh', 'ng', 'gh', 'gi', 'kh', 'nh', 'ph', 'th', 'tr', 'ch', 'qu',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];
const NUCLEI = ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y',
  'ai', 'ao', 'au', 'ay', 'âu', 'ây', 'eo', 'êu', 'ia', 'iê', 'iu', 'oa', 'oă', 'oe', 'oi', 'ôi',
  'ơi', 'oo', 'ua', 'uâ', 'uê', 'ui', 'uô', 'uơ', 'uy', 'ưa', 'ưi', 'ưu', 'ươ', 'yê',
  'iêu', 'yêu', 'oai', 'oay', 'oeo', 'uây', 'uôi', 'uya', 'uyê', 'uyu', 'ươi', 'ươu'];
const CODAS = ['ch', 'ng', 'nh', 'c', 'm', 'n', 'p', 't'];
const byLengthDesc = (arr) => [...arr].sort((a, b) => b.length - a.length).join('|');
const SYLLABLE_RE = new RegExp(`^(${byLengthDesc(ONSETS)})?(${byLengthDesc(NUCLEI)})(${byLengthDesc(CODAS)})?$`);

/** "chậm", "ngon", "khỏe" -> true; "hhhh", "chaamj", "good" -> false */
function isVietSyllable(word) {
  return SYLLABLE_RE.test(stripTone(String(word || '').toLowerCase()));
}

const TELEX_TONES = { s: '́', f: '̀', r: '̉', x: '̃', j: '̣' };
const TELEX_VOWELS = [[/uow/g, 'ươ'], [/aa/g, 'â'], [/aw/g, 'ă'], [/ee/g, 'ê'], [/oo/g, 'ô'], [/ow/g, 'ơ'], [/uw/g, 'ư'], [/w/g, 'ư']];

/** Đặt dấu thanh theo kiểu cũ (hóa, khỏe, thủy) — cùng kiểu với từ khóa trong taxonomy */
function placeTone(onset, nucleus, coda, tone) {
  if (!tone) return onset + nucleus + coda;
  let i;
  if (nucleus.includes('ươ')) i = nucleus.indexOf('ơ');
  else if (/[ăâêôơư]/.test(nucleus)) i = Math.max(...[...'ăâêôơư'].map((c) => nucleus.lastIndexOf(c)));
  else if (coda) i = nucleus.length - 1;
  else if (nucleus.length === 3) i = 1;
  else i = 0;
  const marked = (nucleus[i] + TELEX_TONES[tone]).normalize('NFC');
  return onset + nucleus.slice(0, i) + marked + nucleus.slice(i + 1) + coda;
}

/**
 * Khôi phục một từ gõ Telex mà bộ gõ không chuyển được.
 *
 * Trường hợp hay gặp nhất: Unikey bật "tự động khôi phục phím với từ sai".
 * Người dùng gõ "chậm" rồi kéo dài thành "chậmmmm" — Unikey thấy "chậmm"
 * không phải từ đúng nên trả lại nguyên phím đã gõ: "chaamjmmmm". Không khôi
 * phục thì câu chê này mất hẳn từ mang nghĩa, và từng bị luật lọc rác chặn.
 *
 * Chỉ khôi phục khi có ít nhất HAI dấu hiệu Telex (dấu thanh s/f/r/x/j sau
 * nguyên âm, "dd", nguyên âm đôi aa/ee/oo/aw/ow/uw, hoặc ký tự kéo dài) VÀ
 * kết quả là một âm tiết tiếng Việt hợp lệ — nhờ vậy "max", "box", "bus",
 * "good", "free" không bị đổi.
 *
 * @returns {string|null} âm tiết đã khôi phục, hoặc null nếu không phải Telex
 */
function restoreTelex(token) {
  const raw = String(token || '').toLowerCase();
  if (!/^[a-z]+$/.test(raw)) return null;

  let t = raw.replace(/([a-z])\1{2,}/g, '$1');
  const elongated = t !== raw;
  const firstVowel = t.search(/[aeiouy]/);
  if (firstVowel < 0) return null;

  // Dấu thanh: s/f/r/x/j đứng sau nguyên âm đầu tiên (không bao giờ là phụ âm cuối)
  let tone = null;
  const tail = t.slice(firstVowel + 1).replace(/[sfrxj]/g, (c) => {
    tone = c;
    return '';
  });
  t = (t.slice(0, firstVowel + 1) + tail).replace(/([^aeiouy])\1+$/, '$1');

  let modifiers = 0;
  if (t.startsWith('dd')) {
    t = 'đ' + t.slice(2);
    modifiers += 2;
  }
  for (const [re, rep] of TELEX_VOWELS) {
    t = t.replace(re, () => {
      modifiers += 1;
      return rep;
    });
  }

  const strong = Boolean(tone) || raw.startsWith('dd') || elongated;
  const signals = modifiers + (tone ? 1 : 0) + (elongated ? 1 : 0);
  if (!strong || signals < 2) return null;

  const m = t.match(SYLLABLE_RE);
  if (!m) return null;
  return placeTone(m[1] || '', m[2], m[3] || '', tone);
}

/** Tách dấu câu hai đầu một token: "chậmmm!!" -> ['', 'chậmmm', '!!'] */
const EDGE_PUNCT = /^(\p{P}*)(.*?)(\p{P}*)$/u;

/**
 * Hiểu một token có ký tự kéo dài: rút gọn (và khôi phục Telex nếu cần) rồi
 * xem kết quả có phải một từ thật không. "ngonnnn" -> "ngon", "chaamjmmmm" ->
 * "chậm", "okkkk" -> "ok" là từ thật; "hhhhhh" thì không.
 */
function resolveElongated(core) {
  const lower = core.toLowerCase();
  const collapsed = collapseRepeats(lower);
  if (isVietSyllable(collapsed) || SINGLE_WORD.has(collapsed)) return collapsed;
  return restoreTelex(lower);
}

/**
 * GÕ PHÍM BỪA, không phải nhấn mạnh cảm xúc.
 *
 * Luật cũ chặn mọi văn bản có một chữ cái lặp từ 6 lần trở lên, nên
 * "ngonnnnnnn quá shop ơi" hay "giao chậmmmmmm" — những câu mang cảm xúc
 * rất rõ — bị loại như rác. Giờ chỉ những chuỗi lặp KHÔNG rút gọn được về
 * một từ thật mới tính là rác, và chúng phải chiếm phần lớn nội dung.
 */
function keyboardMash(rawText) {
  const tokens = canonicalize(rawText).split(/\s+/).filter(Boolean);
  let letters = 0;
  let junk = 0;
  for (const token of tokens) {
    const core = token.match(EDGE_PUNCT)[2];
    const n = (core.match(/\p{L}/gu) || []).length;
    letters += n;
    if (/(\p{L})\1{5,}/u.test(core) && !resolveElongated(core)) junk += n;
  }
  return letters > 0 && junk / letters >= 0.5;
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
/**
 * Cụm nhiều từ gộp vào MỘT biểu thức, dựng một lần lúc nạp module (bản cũ
 * dựng lại ~100 biểu thức cho mỗi câu — điểm nóng số một khi Trust Layer
 * chạy trên cả kho). Cụm dài đứng trước trong phép "hoặc" nên được ưu tiên.
 * Ranh giới dùng lớp ký tự Unicode thay cho khoảng trắng, để cụm đứng sát
 * dấu câu ("ship kiến, chờ mãi") hay lặp liền nhau vẫn khớp.
 */
const MULTI_WORD_KEYS = Object.keys(SLANG_DICTIONARY)
  .filter((k) => k.includes(' '))
  .sort((a, b) => b.length - a.length);
const MULTI_WORD_RE = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])(?:${MULTI_WORD_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{M}\\p{N}])`,
  'gu'
);
const SINGLE_WORD = new Map(
  Object.entries(SLANG_DICTIONARY).filter(([k]) => !k.includes(' '))
);
// Một chữ cái đứng sau các từ này là ký hiệu, không phải teencode: "size m",
// "vitamin c" không được thành "size mình", "vitamin chị"
const LETTER_CONTEXT = new Set(['size', 'sz', 'cỡ', 'vitamin', 'loại', 'hạng']);

function translateSlang(text) {
  let hits = 0;
  // Danh sách từng cặp đã thay, để giao diện trình diễn cho thấy bước này làm gì
  const replacements = [];
  const seenPhrases = new Set();

  const lowered = String(text || '').toLowerCase();
  const afterPhrases = lowered.replace(MULTI_WORD_RE, (phrase) => {
    // Đếm mỗi cụm một lần, giữ đúng ý nghĩa của slangHits như bản cũ
    if (!seenPhrases.has(phrase)) {
      seenPhrases.add(phrase);
      hits += 1;
      replacements.push({ from: phrase, to: SLANG_DICTIONARY[phrase] });
    }
    return SLANG_DICTIONARY[phrase];
  });

  let prevCore = '';
  const out = afterPhrases
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      // Giữ dấu câu ở hai đầu token: "k," -> "không," chứ không nuốt mất dấu phẩy
      const [, lead, core, trail] = token.match(EDGE_PUNCT);
      const replacement = SINGLE_WORD.get(core);
      const skip = core.length === 1 && LETTER_CONTEXT.has(prevCore);
      prevCore = core;
      if (replacement === undefined || skip) return token;
      hits += 1;
      replacements.push({ from: core, to: replacement });
      return `${lead}${replacement}${trail}`;
    })
    .join(' ');

  return { text: out, hits, replacements };
}

/**
 * Pipeline tiền xử lý đầy đủ.
 *
 * @param {string} raw văn bản gốc
 * @param {{ skipSlang?: boolean }} opts skipSlang=true để chạy nhánh
 *        đối chứng trong thí nghiệm ablation
 */
function normalize(raw, opts = {}) {
  const original = String(raw ?? '');

  // 1) PII trước tiên — không để dữ liệu cá nhân đi tiếp vào pipeline
  const { text: maskedText, piiTypes } = maskPII(stripHtml(canonicalize(original)));

  // 2) Gỡ nhiễu kỹ thuật
  let text = maskedText.replace(OBFUSCATION_PATTERN, '$1');
  text = text.replace(MISSING_SPACE_PATTERN, '$1$2 ');
  text = replaceEmoji(text);
  text = text.replace(/\s+/g, ' ').trim();

  // Từ kéo dài ("ngonnnn") và Telex chưa chuyển ("chaamjmmmm") -> từ thật.
  // Kéo dài một từ CÓ NGHĨA là dấu hiệu nhấn mạnh cảm xúc, không phải nhiễu:
  // đếm lại để tầng lọc rác không coi câu ngắn kiểu "ngonnnn" là rỗng nghĩa.
  const emphasized = [];
  text = text
    .split(' ')
    .map((token) => {
      const [, lead, core, trail] = token.match(EDGE_PUNCT);
      if (!core) return token;
      let resolved = null;
      if (/(\p{L})\1{2,}/u.test(core)) {
        resolved = resolveElongated(core);
        if (resolved) emphasized.push({ from: core, to: resolved });
      } else if (!SINGLE_WORD.has(core.toLowerCase())) {
        resolved = restoreTelex(core);
        if (resolved) emphasized.push({ from: core, to: resolved, telex: true });
      }
      return resolved ? `${lead}${resolved}${trail}` : token;
    })
    .join(' ');
  text = collapseRepeats(text);

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
    // Từ được kéo dài/gõ Telex đã khôi phục — tín hiệu cảm xúc của người viết
    emphasis: emphasized.filter((e) => !e.telex).length,
    restoredWords: emphasized,
    // Số âm tiết xấp xỉ: tiếng Việt tách âm tiết theo khoảng trắng
    syllables: text ? text.split(/\s+/).filter(Boolean).length : 0
  };
}

/** Dấu hiệu spam thô, tầng T1 của Trust Layer dùng lại kết quả này */
// Bản KHÔNG có cờ g của mẫu số điện thoại. Gọi .test() trên biểu thức có cờ g
// sẽ nhớ lastIndex giữa các lần gọi, nên cùng một câu quảng cáo lúc bị bắt
// lúc lọt (true, false, true, false...) tùy câu nào chạy trước nó.
const PHONE_TEST = new RegExp(PII_PATTERNS[0].re.source);

function spamSignals(rawText) {
  const text = canonicalize(rawText);
  return {
    hasContact: SPAM_MARKERS.contact.test(text),
    hasCommerce: SPAM_MARKERS.commerce.test(text),
    hasUrl: SPAM_MARKERS.url.test(text),
    hasPromoCode: SPAM_MARKERS.promoCode.test(text),
    hasPhone: PHONE_TEST.test(text)
  };
}

const DICTIONARY_SIZE = Object.keys(SLANG_DICTIONARY).length;

module.exports = {
  SLANG_DICTIONARY,
  DICTIONARY_SIZE,
  normalize,
  canonicalize,
  maskPII,
  stripHtml,
  translateSlang,
  collapseRepeats,
  isVietSyllable,
  restoreTelex,
  keyboardMash,
  spamSignals
};
