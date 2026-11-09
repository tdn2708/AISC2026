/**
 * PHÂN LOẠI BÌNH LUẬN LIVESTREAM
 * ==================================================================
 * Bình luận trong phiên live bán hàng khác hẳn đánh giá trên sàn: ngắn, gõ
 * không dấu, viết tắt kiểu "bn", "ib", "chốt M2", và đến hàng chục câu mỗi
 * giây vào lúc cao điểm. Người đứng live cần biết NGAY câu nào là khách muốn
 * mua, câu nào đang hỏi, câu nào đang phàn nàn, nên lớp này chạy bằng luật,
 * không gọi mô hình ngôn ngữ cho từng câu: nhanh, miễn phí, chạy được cả khi
 * mất mạng tới nhà cung cấp LLM, và giải thích được vì sao câu bị xếp loại.
 *
 * Ý định (theo thứ tự ưu tiên khi một câu khớp nhiều loại):
 *   complaint  khiếu nại, phàn nàn (cần xử lý trước, kẻo lan trong phiên live)
 *   question   hỏi về sản phẩm, giá, size, giao hàng…
 *   order      muốn chốt đơn
 *   praise     khen
 *   chatter    chào hỏi, thả tim, bình luận không có nội dung xử lý
 *
 * So khớp trên chữ đã bỏ dấu và viết thường, để "gia bao nhieu" và "giá bao
 * nhiêu" là một. Ranh giới từ dùng lookaround thay cho \b vì \b của JS không
 * hiểu chữ tiếng Việt.
 */

const { maskPII, canonicalize } = require('../normalizer');

const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Tạo regex "nguyên từ" trên chữ đã bỏ dấu */
const words = (list) => new RegExp(`(?<![a-z0-9])(?:${list.join('|')})(?![a-z0-9])`);

// ------------------------------------------------------------------
// Từ điển
// ------------------------------------------------------------------

const COMPLAINT = words([
  'chua (nhan|giao|thay|ve|toi|den)( duoc)?( hang| don)?',
  'giao (cham|lau|tre)', 'lau qua', 'cham qua', 'doi (mai|lau)',
  'lua( dao)?', 'bung', 'phot', 'report', 'to cao',
  'hang loi', 'bi loi', 'loi roi', 'hong roi', 'bi hong', 'rach', 'bong keo', 'bi xu', 'xu (long|roi)', 'phai mau', 'bi phai',
  'sai (size|mau|hang|san pham|sp)', 'giao (sai|nham)', 'gui nham',
  'khac (hinh|anh|mo ta|quang cao)', 'khong giong (hinh|anh|mo ta)',
  'hoan tien', 'tra hang', 'doi hang', 'boom hang',
  'te qua', 'qua te', 'chan', 'that vong', 'kem chat luong',
  'khong ai (tra loi|rep|phan hoi)', 'nhan tin khong (ai )?(tra loi|rep)', 'seen khong rep',
  '(khong|chua|ko|k) (tra loi|rep|phan hoi)( tin nhan| inbox| ib)?',
  'don (hom truoc|tuan truoc|lan truoc|cu)'
]);

/** Từ hỏi; dấu "?" xử lý riêng */
const QUESTION_WORD = words([
  'bao nhieu', 'bn', 'nhieu', 'bao lau', 'khi nao', 'bao gio', 'may ngay', 'may kg', 'may',
  'gi', 'j', 'sao', 'the nao', 'nhu nao', 'ntn', 'o dau', 'dau', 'nao',
  'khong', 'ko', 'k', 'hok', 'hong', 'kh', 'hem', 'chua', 'nhi', 'a',
  'co (size|mau|ship|freeship|bao hanh|ma|voucher|tang)',
  'con (hang|size|mau|khong|ko|k|sz)', 'het (hang|size|mau)( chua)?',
  'tu van', 'xin (gia|link|size)', 'gia sao', 'link', 'gio (hang )?so'
]);

/** Câu "có/không" kiểu "còn size M không", "có ship HN ko" */
const YES_NO = /(?<![a-z0-9])(co|con|duoc|het)(?![a-z0-9]).*(?<![a-z0-9])(khong|ko|k|hok|hong|kh|hem|chua)(?![a-z0-9])\s*[?.!]*\s*$/;

const ORDER = words([
  'chot( don)?', 'lay', 'dat( hang)?', 'mua', 'order', 'oder', 'cho (em|e|minh|m|chi|c|anh|a|toi|t)',
  'ib', 'inbox', 'coc', 'len don', 'gom don', 'dat coc', 'em lay', 'e lay', 'minh lay'
]);

const PRAISE = words([
  'dep( qua| the| ghe| xiu)?', 'xinh( qua| xiu)?', 'xin( qua| xo)?', 'ung( qua)?', 'thich( qua)?', 'tuyet( voi)?',
  'chat luong', 'xuat sac', 'dinh( cao)?', 'iu shop', 'yeu shop', 'ung ho shop', 'uy tin',
  'da nhan (hang|duoc)', 'hang dep', 'ok shop', 'oke shop', 'mlem', 'ngon', 're qua', 'hoi re'
]);

const CHATTER = words([
  'hi', 'hello', 'helo', 'alo', 'chao( shop| ca nha| moi nguoi)?', 'xin chao', 'tim', 'tha tim', 'follow', 'fl',
  'len', 'len di', 'day', 'hong', 'ok', 'oke', 'okela', 'uk', 'u', 'haha', 'hihi', 'kk+'
]);

// ------------------------------------------------------------------
// Chủ đề câu hỏi
// ------------------------------------------------------------------

/** Thứ tự = ưu tiên: một câu hỏi "size M giá bao nhiêu" là hỏi giá */
const TOPICS = [
  ['promo', 'Khuyến mãi', words(['ma (giam|live|khuyen mai|freeship|uu dai)( gia)?', 'voucher', 'khuyen mai', 'km', 'sale', 'giam gia', 'giam', 'tang( kem)?', 'qua tang', 'flash sale', 'deal', 'combo', 'freeship', 'free ship'])],
  ['price', 'Giá', words(['(?<!giam )gia', 'bao nhieu', 'bn', 'nhieu tien', 'bao nhieu tien', 'nhiu', 'xin gia', 'gia sao', 'tien', '\\d+k'])],
  ['warranty', 'Bảo hành, đổi trả', words(['bao hanh', 'doi tra', 'doi (size|mau|hang)', 'doi duoc', 'tra hang', 'hoan', 'loi thi( sao)?', 'bao lau duoc'])],
  ['stock', 'Còn hàng', words(['con hang', 'het hang', 'con khong', 'con ko', 'con k', 'con size', 'con mau', 'con sz', 'het size', 'het mau', 'con (s|m|l|xl|xxl)', 'co hang( lai)?', 've hang'])],
  ['size', 'Size, số đo', words(['size', 'sz', 'sai', 'co nao', 'mac (vua|duoc)', 'vua khong', '\\d+ ?kg', '\\dm\\d*', 'cao \\d+', 'nang \\d+', 'chieu dai', 'rong', 'kich thuoc', 'so do'])],
  ['shipping', 'Giao hàng', words(['ship', 'giao', 'van chuyen', 'phi ship', 'bao lau', 'may ngay', 'khi nao (co|nhan|toi|den)', 'hoa toc', 'now', 'grab', 'cod', 'tinh', 'ha noi', 'hn', 'hcm', 'sg', 'sai gon', 'da nang'])],
  ['material', 'Chất liệu', words(['chat lieu', 'bi xu', 'xu', 'phai mau', 'bi phai', 'co gian', 'mong', 'day dan', 'nong khong', 'thoang', 'vai( gi)?', 'cotton', 'thun', 'len', 'da (that|bo|pu)', 'nhua', 'inox', 'kim loai', 'thanh phan', 'xuat xu', 'made in', 'san xuat'])],
  ['color', 'Màu', words(['mau', 'den', 'trang', 'do', 'xanh', 'hong', 'be', 'kem', 'nau', 'xam', 'vang', 'tim', 'cam', 'ghi'])],
  ['payment', 'Thanh toán', words(['thanh toan', 'chuyen khoan', 'ck', 'tra gop', 'stk', 'tien mat', 'quet ma', 'vi', 'momo', 'zalopay'])],
  ['authenticity', 'Chính hãng', words(['chinh hang', 'auth', 'real', 'fake', 'hang that', 'hang gia', 'nhai', 'rep 1:1', 'tem', 'bill', 'hoa don'])],
  ['howToOrder', 'Cách đặt', words(['dat (sao|nhu nao|the nao|o dau)', 'mua (sao|o dau|nhu nao)', 'link( dau| o dau)?', 'gio (hang )?(so )?\\d*', 'chot (sao|nhu nao)', 'ib (sao|o dau)'])],
  ['usage', 'Cách dùng', words(['dung (sao|the nao|nhu nao)', 'su dung', 'cach dung', 'giat', 'bao quan', 'dung duoc (cho|khong)', 'phu hop', 'hop (voi|khong)', 'da (dau|kho|nhay cam)'])]
];

const TOPIC_LABEL = Object.fromEntries(TOPICS.map(([k, label]) => [k, label]));
TOPIC_LABEL.other = 'Câu hỏi khác';

// ------------------------------------------------------------------
// Biến thể và số lượng
// ------------------------------------------------------------------

const SIZE_RE = /(?<![a-z0-9])(?:size|sz|sai)?\s*(xxxl|xxl|xl|xs|s|m|l|2xl|3xl|[3-4]\d)(?:\s*x?\s*(\d{1,2}))?(?![a-z0-9])/;
const COLORS = ['đen', 'trắng', 'đỏ', 'xanh dương', 'xanh lá', 'xanh', 'hồng', 'be', 'kem', 'nâu', 'xám', 'vàng', 'tím', 'cam', 'ghi', 'bạc'];
const COLOR_FOLDED = COLORS.map((c) => [c, fold(c)]);
const QTY_RE = /(?<![a-z0-9])(?:x|lay|chot|mua|dat|order|cho (?:em|e|minh|m|chi|c|anh|a))\s*(\d{1,2})(?![0-9])|(?<![0-9])(\d{1,2})\s*(?:cai|chiec|bo|hop|doi|sp|san pham|cay|lo|chai|goi)(?![a-z])/;
const BODY_RE = /(\d)\s*m\s*(\d{1,2})|(1[4-9]\d)\s*cm/;
const WEIGHT_RE = /(\d{2,3})\s*(?:kg|ky|ki|can)(?![a-z])/;

function extractVariant(folded) {
  const variant = {};
  // Size chỉ tính khi có chữ "size/sz" hoặc là mã size đứng riêng cạnh từ chốt
  const sm = folded.match(/(?<![a-z0-9])(?:size|sz)\s*(xxxl|xxl|xl|xs|s|m|l|2xl|3xl|[2-4]\d)(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(xxxl|xxl|xl|xs|2xl|3xl)(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(?:chot|lay|con|mac)\s+(?:\d\s+)?(s|m|l)(?:\s*\d)?(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(?:chot|lay)(?:\s+[a-z]+){0,2}\s+(s|m|l)\s*$/) ||
    folded.match(/(?<![a-z0-9])(xxl|xl|xs|s|m|l)(\d)(?![a-z0-9])/);
  if (sm) variant.size = sm[1].toUpperCase();
  const color = COLOR_FOLDED.find(([, f]) => new RegExp(`(?<![a-z])${f}(?![a-z])`).test(folded));
  if (color) variant.color = color[0];
  return variant;
}

function extractQuantity(folded) {
  const m = folded.match(QTY_RE);
  if (m) return Number(m[1] || m[2]);
  const code = folded.match(/(?<![a-z0-9])(?:s|m|l|xl)(\d)(?![a-z0-9])/);
  if (code) return Number(code[1]);
  return null;
}

function extractBody(folded) {
  const out = {};
  const h = folded.match(BODY_RE);
  if (h) out.heightCm = h[3] ? Number(h[3]) : Number(h[1]) * 100 + Number(h[2].padEnd(2, '0'));
  const w = folded.match(WEIGHT_RE) || folded.match(/(?<![a-z])nang\s*(\d{2,3})(?![0-9])/);
  if (w) out.weightKg = Number(w[1]);
  return Object.keys(out).length ? out : null;
}

// ------------------------------------------------------------------
// Nhận diện sản phẩm
// ------------------------------------------------------------------

/**
 * Sản phẩm được nhắc trong câu: theo số giỏ hàng ("giỏ 3", "số 3", "sp3",
 * "mã 3" — người bán live hay đánh số sản phẩm), rồi theo từ khóa người bán
 * khai báo, cuối cùng theo tên. Trả về id hoặc null.
 */
function matchProduct(folded, products = []) {
  if (!products.length) return null;
  const num = folded.match(/(?<![a-z0-9])(?:gio(?: hang)?|so|sp|ma|mau so|link)\s*(?:so\s*)?(\d{1,3})(?![0-9])/);
  if (num) {
    const p = products.find((x) => String(x.code ?? '') === num[1]);
    if (p) return p.id;
  }
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const keys = [...(p.keywords || []), p.name].filter(Boolean).map(fold);
    for (const k of keys) {
      const kk = k.trim();
      if (kk.length < 2) continue;
      if (new RegExp(`(?<![a-z0-9])${kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(folded) && kk.length > bestScore) {
        best = p.id;
        bestScore = kk.length;
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------
// Phân loại
// ------------------------------------------------------------------

/**
 * @param {string} rawText
 * @param {{products?: Array}} opts
 * @returns {{
 *   text: string, piiTypes: string[], hasPhone: boolean,
 *   intent: 'complaint'|'question'|'order'|'praise'|'chatter',
 *   topic: string|null, topicLabel: string|null, sentiment: 'Positive'|'Negative'|'Neutral',
 *   productId: string|null, variant: object, quantity: number|null, body: object|null,
 *   reasons: string[]
 * }}
 */
function classifyComment(rawText, { products = [] } = {}) {
  const canon = canonicalize(String(rawText || '')).replace(/\s+/g, ' ').trim();
  const { text, piiTypes } = maskPII(canon);
  const hasPhone = piiTypes.includes('phone');
  // Bỏ dấu, gộp ký tự kéo dài ("đẹpppp" -> "dep"), để luật khớp được
  const folded = fold(text).replace(/([a-z])\1{2,}/g, '$1').replace(/\[sdt\]/g, ' ');
  const reasons = [];

  // "có bị xù không" là hỏi trước khi mua, không phải khiếu nại
  const hypothetical = /(?<![a-z])co (bi|hay bi|de bi)(?![a-z])/.test(folded) && YES_NO.test(folded);
  const isComplaint = COMPLAINT.test(folded) && !hypothetical;
  const hasQMark = /\?/.test(text);
  const isQuestion = hasQMark || YES_NO.test(folded) || QUESTION_WORD.test(folded.replace(/(?<![a-z])(chot|lay)\s+\w+\s+(khong|ko|k)\s*$/, ''));
  const orderWord = ORDER.test(folded);
  const sizeCode = /(?<![a-z0-9])(?:s|m|l|xl|xxl)\d(?![a-z0-9])/.test(folded);
  const isOrder = orderWord || sizeCode || /^\s*\+\s*\d/.test(folded) || hasPhone;
  const isPraise = PRAISE.test(folded);
  const letters = folded.replace(/[^a-z]/g, '');

  let intent;
  if (isComplaint) {
    intent = 'complaint';
    reasons.push('Có từ phàn nàn');
  } else if (isQuestion && !(isOrder && !hasQMark && /(?<![a-z])(chot|lay|dat|coc)(?![a-z])/.test(folded) && !/(?<![a-z])(sao|nao|dau|bao nhieu|bn)(?![a-z])/.test(folded))) {
    intent = 'question';
    reasons.push(hasQMark ? 'Có dấu hỏi' : 'Có từ hỏi');
  } else if (isOrder) {
    intent = 'order';
    reasons.push(hasPhone ? 'Để lại số điện thoại' : sizeCode ? 'Mã size kèm số lượng' : 'Có từ chốt đơn');
  } else if (isPraise) {
    intent = 'praise';
    reasons.push('Có lời khen');
  } else {
    intent = 'chatter';
    reasons.push(letters.length === 0 ? 'Chỉ có biểu tượng' : CHATTER.test(folded) ? 'Chào hỏi, tương tác' : 'Không có yêu cầu cần xử lý');
  }

  let topic = null;
  if (intent === 'question') {
    const hit = TOPICS.find(([, , re]) => re.test(folded));
    topic = hit ? hit[0] : 'other';
  }

  const sentiment = intent === 'complaint' ? 'Negative' : intent === 'praise' ? 'Positive' : 'Neutral';
  const variant = extractVariant(folded);
  return {
    text,
    piiTypes,
    hasPhone,
    intent,
    topic,
    topicLabel: topic ? TOPIC_LABEL[topic] : null,
    sentiment,
    productId: matchProduct(folded, products),
    variant,
    quantity: intent === 'order' ? extractQuantity(folded) || 1 : null,
    body: intent === 'question' || intent === 'order' ? extractBody(folded) : null,
    reasons
  };
}

const INTENT_LABEL = {
  complaint: 'Khiếu nại',
  question: 'Câu hỏi',
  order: 'Chốt đơn',
  praise: 'Khen',
  chatter: 'Tương tác'
};

module.exports = { classifyComment, matchProduct, fold, TOPIC_LABEL, INTENT_LABEL, TOPICS: TOPICS.map(([k, l]) => ({ key: k, label: l })) };
