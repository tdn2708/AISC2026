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
const linear = require('./linear_model');

// 9 intent của bộ nhãn livestream -> 5 intent hàng đợi và trợ lý hành động dùng
const TO5 = { ORDER: 'order', QUESTION: 'question', REQUEST: 'question', NEGOTIATE: 'question', COMPLAINT: 'complaint', PRAISE: 'praise', GIVEAWAY: 'chatter', SOCIAL: 'chatter', OTHER: 'chatter' };
// LIVE_MODEL=0 tắt mô hình, chỉ dùng luật (so sánh, hoặc khi nghi mô hình sai)
// Nhãn khía cạnh của mô hình -> chủ đề câu hỏi của hệ thống (thứ tự = ưu tiên, giống TOPICS)
const ASPECT_TOPIC = [['PROMOTION', 'promo'], ['PRICE', 'price'], ['STOCK', 'stock'], ['SIZE_FIT', 'size'], ['SHIPPING', 'shipping'],
  ['SPEC_MATERIAL', 'material'], ['VARIANT', 'color'], ['ORDER_PROCESS', 'howToOrder'], ['QUALITY_TRUST', 'authenticity'], ['USAGE', 'usage']];
// Ngưỡng chọn trên dev 23/11 theo macro-F1 (0,5: 0,749; 0,6: 0,724; 0,8: 0,740)
// Chủ đề của luật -> khía cạnh tương ứng của mô hình (để biết hai bên có đồng ý không)
const TOPIC_ASPECT = { promo: 'PROMOTION', price: 'PRICE', stock: 'STOCK', size: 'SIZE_FIT', shipping: 'SHIPPING', material: 'SPEC_MATERIAL',
  color: 'VARIANT', howToOrder: 'ORDER_PROCESS', payment: 'ORDER_PROCESS', authenticity: 'QUALITY_TRUST', warranty: 'QUALITY_TRUST', usage: 'USAGE' };
const COMPLAINT_MIN =Number(process.env.LIVE_COMPLAINT_MIN) || 0.5;
// Chọn trên dev 23/11 theo macro-F1: 0,45 -> 0,752; 0 -> 0,749; 0,55 -> 0,731
const LOW_CONF = process.env.LIVE_LOW_CONF !== undefined ? Number(process.env.LIVE_LOW_CONF) : 0.45;
const modelEnabled = () => process.env.LIVE_MODEL !== '0' && linear.available();

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
  // "chưa đến chợ đã hết tiền" không phải khiếu nại: "chưa thấy/về/tới/đến" phải đi với hàng, đơn
  'chua (nhan|giao)( duoc)?( hang| don)?', 'chua (thay|ve|toi|den)( duoc)? (hang|don)', '(hang|don)( [a-z]+){0,4} chua (thay|ve|toi|den)',
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

/**
 * Từ hỏi; dấu "?" xử lý riêng. Các từ phủ định ("không", "ko", "chưa") chỉ là
 * dấu hỏi khi đứng CUỐI câu (FINAL_Q): "còn size M không" là hỏi, còn
 * "không thì đi ngủ", "nó ko thể tin đc" thì không (đo trên bình luận thật 23/11).
 * "mấy" phải đi với đơn vị ("mấy ngày", "mấy kg"), vì bỏ dấu thì "máy" cũng là "may".
 */
const QUESTION_WORD = words([
  'bao nhieu', 'bn', 'bao lau', 'khi nao', 'luc nao', 'hom nao', 'bao gio',
  'may (ngay|hom|kg|ky|ki|gio|tieng|phut|tuan|thang|nam|lan|tuoi|cai|chiec|bo|size|sz|mau|cm|so|tien|k|lit|met|phan|loai|ngan|tram|trieu|cu|goi|hop|chai|lo|hu|vien|lang|nguoi|ong|tep|cay|vi|thang|ngan|dong)',
  'gia nhieu', 'nhieu tien',
  'gi', 'j', '(?<!(khong|ko|k|co|chang|cha) )sao(?! (dau|ke))', 'the nao', 'nhu nao', 'ntn', 'o dau', 'dau (roi|r|vay|v|z|ha|ta)', 'link dau',
  '(size|sz|mau|cai|loai|bo|sp|san pham|so|con|mau so|gio|hop|chai|cuon|ben|khung) nao',
  'co (size|mau|ship|freeship|bao hanh|ma|voucher|tang)',
  'con (hang|size|mau|khong|ko|k|sz)', 'het (hang|size|mau)( chua)?',
  'tu van', 'xin (gia|link|size)', 'gia sao', 'link', 'gio (hang )?so',
  '(check|kiem tra|xem|coi) (giup|dum|ho|gium|lai)', 'phai (khong|ko|k|hong|hem)'
]);

// Từ xưng hô hay đứng sau tiểu từ hỏi: "còn không shop", "ship ko chị", "được không ạ"
const ADDRESS = '(?:\\s+(?:a|ah|ad|ak|z|vay|v|shop|sop|s|ban|b|chi|c|em|e|anh|oi|nha|nhe|ha|ta|mn|mng|ae|ac|moi nguoi|ca nha|admin))*';

/** Tiểu từ hỏi ở cuối câu */
// Phải có chữ đứng trước: "chưa", "ko" trơ trọi là câu đáp, không phải câu hỏi.
// "mô", "rứa" là tiểu từ hỏi miền Trung ("mấy mô", "răng rứa").
const FINAL_Q = new RegExp(`(?<=[a-z0-9][^a-z0-9]*\\s)(khong|ko|k|kh|hok|hong|hem|chua|nhi|ha|nhe chua|mo|rua)${ADDRESS}\\s*[?.!]*\\s*$`);

/** "hả" (có dấu) gần cuối câu, có thể kèm tên người: "thua luôn hả mẫn" */
const HA_TAG = /(?<!\p{L})hả(\s+\p{L}+)?\s*[?.!]*\s*$/u;

/** Tiểu từ hỏi cuối một vế câu: "uống đc ko shop, vì mình mua cho mẹ" */
const CLAUSE_Q = new RegExp(`(?<=[a-z0-9]+\\s+[a-z0-9]+\\s+)(khong|ko|k|kh|hok|hong|hem)${ADDRESS}\\s*[,;]`);

/** Tin có đường link, mời vào nhóm: quảng cáo của kênh hoặc người lạ, không phải khách hỏi mua */
const PROMO = /(https?:\/\/|www\.|zalo\.me|t\.me\/|\.com\b|\.vn\/|bit\.ly)/i;

/** "nào/nhiêu" cuối câu: "box nào v", "bộ này nhiêu", trừ lời giục "chốt nào", "lên nào" */
const FINAL_WH = new RegExp(`(?<![a-z0-9])(?<!(chot|len|di|vao|bat dau|xem|toi|nao|ra|nhanh|cam on|on|rat|qua|that) )(nao|nhieu|nhiu)${ADDRESS}\\s*[?.!]*\\s*$`);

/** Câu "có/không" kiểu "còn size M không", "có ship HN ko" */
const YES_NO = new RegExp(`(?<![a-z0-9])(co|con|duoc|het)(?![a-z0-9]).*(?<![a-z0-9])(khong|ko|k|hok|hong|kh|hem|chua)${ADDRESS}\\s*[?.!]*\\s*$`);

// ------------------------------------------------------------------
// Từ trùng khi bỏ dấu
// ------------------------------------------------------------------

/**
 * Bỏ dấu thì nhiều từ khác nghĩa thành một: "chán"/"chẵn"/"chăn" đều là "chan",
 * "đen"/"đến" là "den", "máy"/"mấy" là "may". Khi bình luận GÕ CÓ DẤU, từ trong
 * bảng này chỉ được tính nếu viết đúng một trong các dạng có dấu liệt kê. Bình
 * luận gõ không dấu thì vẫn so như cũ (không phân biệt được).
 */
const ACCENTED = {
  // khiếu nại
  chan: ['chán'], bung: ['bùng'], phot: ['phốt'], lua: ['lừa'], dao: ['đảo'], rach: ['rách'], te: ['tệ'],
  chua: ['chưa'], nhan: ['nhận', 'nhắn'], thay: ['thấy'], ve: ['về'], toi: ['tới', 'tôi'], den: ['đen', 'đến'],
  cham: ['chậm'], tre: ['trễ'], lau: ['lâu'], loi: ['lỗi', 'lời'], hong: ['hỏng', 'hồng', 'hông', 'hong'], xu: ['xù'], phai: ['phai', 'phải'],
  hoan: ['hoàn'], tien: ['tiền'], tra: ['trả'], doi: ['đổi', 'đợi'], nham: ['nhầm'], khac: ['khác'], giong: ['giống'],
  that: ['thất', 'thật'], vong: ['vọng'], kem: ['kém', 'kem'],
  // hỏi
  may: ['mấy'], dau: ['đâu', 'dầu'], nao: ['nào'], gi: ['gì'], sao: ['sao'], khong: ['không'], nhi: ['nhỉ'], nhieu: ['nhiêu'],
  ha: ['hả', 'hà'], bao: ['bao', 'bảo', 'báo'], mo: ['mô'], rua: ['rứa'], gio: ['giờ', 'giỏ'], con: ['còn'], co: ['có', 'cỡ'], het: ['hết'], duoc: ['được'], gia: ['giá'], xin: ['xin', 'xinh'],
  // chủ đề
  sai: [], rong: ['rộng'], len: ['len', 'lên'], da: ['da'], tang: ['tặng'], ma: ['mã'], mac: ['mặc'], mong: ['mỏng'], vi: ['ví'], tinh: ['tỉnh'], mau: ['màu', 'mẫu'], trang: ['trắng'],
  do: ['đỏ', 'do'], tim: ['tím'], vang: ['vàng'], nau: ['nâu'], xam: ['xám'], cam: ['cam'], be: ['be'], ghi: ['ghi'], xanh: ['xanh'],
  ship: ['ship'], giao: ['giao'], nang: ['nặng'], cao: ['cao'], vai: ['vải'], thun: ['thun'],
  // chốt đơn, khen
  lay: ['lấy'], dat: ['đặt'], mua: ['mua'], coc: ['cọc'], cho: ['cho'], chot: ['chốt'],
  dep: ['đẹp'], ung: ['ưng'], thich: ['thích'], tuyet: ['tuyệt'], dinh: ['đỉnh'], ngon: ['ngon'], re: ['rẻ'], hoi: ['hơi'],
  qua: ['quá', 'quà', 'qua'],
  uong: ['uống'], boi: ['bôi'], thoa: ['thoa'], tac: ['tác'], dung: ['dụng', 'dùng'], tri: ['trị'], bau: ['bầu'], hieu: ['hiệu']
};

/** Từ màu xét dấu chặt hơn: "đến" không phải "đen", "lên" không phải vải len */
const COLOR_ACCENTS = { den: ['đen'], hong: ['hồng'], do: ['đỏ'] };
const MATERIAL_ACCENTS = { len: ['len'] };

/** Bình luận có gõ dấu không: ít nhất 2 từ có dấu, hoặc một nửa số từ */
function isAccented(lower) {
  const toks = lower.split(/[^\p{L}\d]+/u).filter(Boolean);
  if (!toks.length) return false;
  const marked = toks.filter((t) => /\P{ASCII}/u.test(t)).length;
  return marked >= 2 || marked / toks.length >= 0.5;
}

/**
 * Regex (trên chữ bỏ dấu) có khớp không, có xét dấu. `ctx.folded` và
 * `ctx.lower` dài bằng nhau từng ký tự, nên vị trí khớp trên bản bỏ dấu đọc
 * được từ gốc có dấu ở cùng chỗ.
 */
const GLOBAL_RE = new WeakMap();

function hit(re, ctx, over = null) {
  if (!ctx.accented) return re.test(ctx.folded);
  let g = GLOBAL_RE.get(re);
  if (!g) {
    g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    GLOBAL_RE.set(re, g);
  }
  for (const m of ctx.folded.matchAll(g)) {
    if (accentOk(m.index, m[0], ctx, over)) return true;
  }
  return false;
}

function accentOk(start, matched, ctx, over) {
  const tok = /[a-z]+/g;
  let t;
  while ((t = tok.exec(matched))) {
    const allowed = (over && over[t[0]]) || ACCENTED[t[0]];
    if (!allowed) continue;
    const at = start + t.index;
    // chỉ xét nguyên từ: "chan" trong "chanh" không phải từ "chan"
    const orig = ctx.lower.slice(at, at + t[0].length);
    if (!allowed.includes(orig)) return false;
  }
  return true;
}

/** Bỏ dấu từng ký tự, giữ nguyên độ dài chuỗi để vị trí khớp hai bản trùng nhau */
function foldSameLength(lower) {
  let out = '';
  for (const ch of lower) {
    if (ch === 'đ') { out += 'd'; continue; }
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

const ORDER = words([
  'chot( don)?(?! (loi|lo))', 'lay(?! (loi|lai|von))', 'dat( hang)?', 'mua', 'order', 'oder', 'cho (em|e|minh|m|chi|c|anh|a|toi|t)(?! (\\d+ |mot )?(like|tim|follow|fl|share|sub|dang ky|xin))',
  'ib', 'inbox', 'coc', 'len don', 'gom don', 'dat coc', 'em lay', 'e lay', 'minh lay'
]);

const PRAISE = words([
  'dep( qua| the| ghe| xiu)?', 'xinh( qua| xiu)?', 'xin (qua|xo)', 'ung( qua)?', 'thich( qua)?', 'tuyet( voi)?',
  'chat luong', 'xuat sac', 'dinh( cao)?', 'iu shop', 'yeu shop', 'ung ho shop', 'uy tin',
  'da nhan (hang|duoc)', 'hang dep', 'ok shop', 'oke shop', 'mlem', 'ngon', 're qua', 'hoi re'
]);

/** Từ chốt đơn đứng ngay sau phủ định */
const NEG_ORDER = words(['(khong|ko|k|kh|chang|cha|chua|hong|hem|dung|dung co) (can |muon |dinh |noi )?(mua|lay|chot|dat|order)']);

/** Từ khen đứng ngay sau phủ định */
const NEG_PRAISE = words(['(khong|ko|k|kh|chang|cha|chua|hong|hem|kem) (con |duoc |qua |lam |thay )?(dep|xinh|ung|thich|tuyet|ngon|chat luong|uy tin|re)']);

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
  ['price', 'Giá', words(['(?<!giam )gia', 'bao nhieu(?! (tuoi|nam|lan|nguoi|km|cm|met|tap))', 'bn', 'nhieu(?=(\\s+(a|v|vay|z|shop|s))*\\s*[?.!]*$)', 'nhieu tien', 'bao nhieu tien', 'nhiu', 'xin gia', 'gia sao', 'tien', '\\d+k'])],
  ['warranty', 'Bảo hành, đổi trả', words(['bao hanh', 'doi tra', 'doi (size|mau|hang)', 'doi duoc', 'tra hang', 'hoan', 'loi thi( sao)?', 'bao lau duoc'])],
  ['stock', 'Còn hàng', words(['con hang', 'het hang', 'con khong', 'con ko', 'con k', 'con size', 'con mau', 'con sz', 'het size', 'het mau', 'con (s|m|l|xl|xxl)', 'co hang( lai)?', 've hang'])],
  ['size', 'Size, số đo', words(['size', 'sz', 'sai', 'co nao', 'mac (vua|duoc)', 'vua khong', '\\d+ ?kg', '\\dm\\d*', 'cao \\d+', 'nang \\d+', 'chieu dai', 'rong', 'kich thuoc', 'so do'])],
  // Cách dùng, công dụng (đứng trước giao hàng: "uống bao lâu thì đỡ" không phải hỏi giao hàng)
  ['usage', 'Cách dùng, công dụng', words(['dung (sao|the nao|nhu nao)', 'su dung', 'cach dung', 'giat', 'bao quan', 'dung duoc (cho|khong)', 'phu hop', 'hop (voi|khong)', 'da (dau|kho|nhay cam)',
    'uong', 'boi', 'thoa', 'tac dun?g?', 'cong dung', 'tri (benh|dau|ho|mat ngu)?', 'chua (benh|tri)', 'hieu qua', 'de (lau|duoc)', 'han su dung', 'hsd', 'tre (em|nho|con)', 'ba bau', 'mang thai'])],
  ['shipping', 'Giao hàng', words(['ship', 'giao', 'van chuyen', 'phi ship', 'bao lau', 'may ngay', 'khi nao (co|nhan|toi|den)', 'hoa toc', 'now', 'grab', 'cod', 'tinh', 'ha noi', 'hn', 'hcm', 'sg', 'sai gon', 'da nang'])],
  ['material', 'Chất liệu', words(['chat lieu', 'bi xu', 'xu', 'phai mau', 'bi phai', 'co gian', 'mong', 'day dan', 'nong khong', 'thoang', 'vai( gi)?', 'cotton', 'thun', 'len', 'da (that|bo|pu)', 'nhua', 'inox', 'kim loai', 'thanh phan', 'xuat xu', 'made in', 'san xuat'])],
  ['color', 'Màu', words(['mau', 'den', 'trang', 'do', 'xanh', 'hong', 'be', 'kem', 'nau', 'xam', 'vang', 'tim', 'cam', 'ghi'])],
  ['payment', 'Thanh toán', words(['thanh toan', 'chuyen khoan', 'ck', 'tra gop', 'stk', 'tien mat', 'quet ma', 'vi', 'momo', 'zalopay'])],
  ['authenticity', 'Chính hãng', words(['chinh hang', 'auth', 'real', 'fake', 'hang that', 'hang gia', 'nhai', 'rep 1:1', 'tem', 'bill', 'hoa don'])],
  ['howToOrder', 'Cách đặt', words(['dat (sao|nhu nao|the nao|o dau)', 'mua (sao|o dau|nhu nao)', 'link( dau| o dau)?', 'gio (hang )?(so )?\\d*', 'chot (sao|nhu nao)', 'ib (sao|o dau)'])]
];

const TOPIC_LABEL = Object.fromEntries(TOPICS.map(([k, label]) => [k, label]));
TOPIC_LABEL.other = 'Câu hỏi khác';

// ------------------------------------------------------------------
// Biến thể và số lượng
// ------------------------------------------------------------------

const COLORS = ['đen', 'trắng', 'đỏ', 'xanh dương', 'xanh lá', 'xanh', 'hồng', 'be', 'kem', 'nâu', 'xám', 'vàng', 'tím', 'cam', 'ghi', 'bạc'];
const COLOR_FOLDED = COLORS.map((c) => [c, fold(c)]);
const QTY_RE = /(?<![a-z0-9])(?:x|lay|chot|mua|dat|order|cho (?:em|e|minh|m|chi|c|anh|a))\s*(\d{1,2})(?![0-9])|(?<![0-9])(\d{1,2})\s*(?:cai|chiec|bo|hop|doi|sp|san pham|cay|lo|chai|goi)(?![a-z])/;
const BODY_RE = /(\d)\s*m\s*(\d{1,2})|(1[4-9]\d)\s*cm/;
const WEIGHT_RE = /(\d{2,3})\s*(?:kg|ky|ki|can)(?![a-z])/;

function extractVariant(folded, ctx = null) {
  const variant = {};
  // Size chỉ tính khi có chữ "size/sz" hoặc là mã size đứng riêng cạnh từ chốt
  const sm = folded.match(/(?<![a-z0-9])(?:size|sz)\s*(xxxl|xxl|xl|xs|s|m|l|2xl|3xl|[2-4]\d)(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(xxxl|xxl|xl|xs|2xl|3xl)(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(?:chot|lay|con|mac)\s+(?:\d\s+)?(s|m|l)(?:\s*\d)?(?![a-z0-9])/) ||
    folded.match(/(?<![a-z0-9])(?:chot|lay)(?:\s+[a-z]+){0,2}\s+(s|m|l)\s*$/) ||
    folded.match(/(?<![a-z0-9])(xxl|xl|xs|s|m|l)(\d)(?![a-z0-9])/);
  if (sm) variant.size = sm[1].toUpperCase();
  // Câu gõ có dấu: so màu trên chữ có dấu ("đến giờ" không phải màu đen, "cảm ơn" không phải màu cam)
  const color = ctx?.accented
    ? COLORS.find((c) => new RegExp(`(?<!\\p{L})${c}(?!\\p{L})`, 'u').test(ctx.lower))
    : COLOR_FOLDED.find(([, f]) => new RegExp(`(?<![a-z])${f}(?![a-z])`).test(folded))?.[0];
  if (color) variant.color = color;
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
/**
 * Bộ nhớ đệm theo nội dung: khách live gõ lặp rất nhiều ("198", "chốt", biểu tượng; 6.210 bình luận thật
 * thu 23/11 chỉ có 2.662 câu khác nhau). Mỗi danh mục sản phẩm một bộ đệm (sản phẩm ảnh hưởng kết quả),
 * tối đa CACHE_MAX câu, bỏ câu cũ nhất. Trả bản sao để nơi gọi sửa không làm hỏng bộ đệm.
 */
const CACHE_MAX = 5000;
const NO_PRODUCTS = [];
const caches = new WeakMap();
function copyResult(r) {
  return { ...r, piiTypes: [...r.piiTypes], variant: { ...r.variant }, body: r.body ? { ...r.body } : null, reasons: [...r.reasons], model: r.model ? { ...r.model, aspects: [...r.model.aspects], aspectProbs: { ...r.model.aspectProbs } } : null };
}
function classifyComment(rawText, { products = NO_PRODUCTS } = {}) {
  if (process.env.LIVE_CLASSIFY_CACHE === '0') return classifyUncached(rawText, { products });
  const list = products && products.length ? products : NO_PRODUCTS;
  let cache = caches.get(list);
  if (!cache) { cache = new Map(); caches.set(list, cache); }
  const key = `${process.env.LIVE_MODEL === '0' ? 'r' : 'm'}|${String(rawText ?? '')}`;
  let r = cache.get(key);
  if (!r) {
    r = classifyUncached(rawText, { products: list });
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, r);
  }
  return copyResult(r);
}

function classifyUncached(rawText, { products = [] } = {}) {
  const canon = canonicalize(String(rawText || '')).replace(/\s+/g, ' ').trim();
  const { text, piiTypes } = maskPII(canon);
  const hasPhone = piiTypes.includes('phone');
  // Viết thường, gộp ký tự kéo dài ("đẹpppp" -> "đẹp"), rồi bỏ dấu từng ký tự:
  // hai bản dài bằng nhau nên đọc lại được dấu ở đúng chỗ luật khớp
  const lower = text.toLowerCase().normalize('NFC').replace(/[̀-ͯ]/g, '')
    .replace(/(\p{L})\1{2,}/gu, '$1').replace(/\[sđt\]|\[sdt\]/g, (m) => ' '.repeat(m.length));
  const folded = foldSameLength(lower);
  const ctx = { lower, folded, accented: isAccented(lower) };
  const reasons = [];

  // "có bị xù không" là hỏi trước khi mua, không phải khiếu nại
  const hypothetical = /(?<![a-z])co (bi|hay bi|de bi)(?![a-z])/.test(folded) && hit(YES_NO, ctx);
  const isComplaint = hit(COMPLAINT, ctx) && !hypothetical;
  // "???" kiểu bày tỏ ngạc nhiên: dấu hỏi chỉ tính khi câu có ít nhất 2 chữ cái
  // (phiên YouTube thật 23/11: 13 lần "???" thành "13 người cùng hỏi")
  const hasQMark = /\?/.test(text) && folded.replace(/[^a-z]/g, '').length >= 2;
  const qCtx = { ...ctx, folded: folded.replace(/(?<![a-z])(chot|lay)\s+\w+\s+(khong|ko|k)\s*$/, '') };
  const isQuestion = hasQMark || hit(YES_NO, ctx) || hit(QUESTION_WORD, qCtx) || hit(FINAL_Q, qCtx) || hit(FINAL_WH, ctx) || hit(CLAUSE_Q, ctx) || HA_TAG.test(lower);
  const isPromo = PROMO.test(text);
  // "ko, mình không mua", "không lấy 2 đâu": từ chốt bị phủ định thì không phải chốt đơn
  const orderWord = hit(ORDER, ctx) && !hit(NEG_ORDER, ctx, { dung: ['đừng'] });
  const sizeCode = /(?<![a-z0-9])(?:s|m|l|xl|xxl)\d(?![a-z0-9])/.test(folded);
  const isOrder = orderWord || sizeCode || /^\s*\+\s*\d/.test(folded) || hasPhone;
  // "ăn ko ngon", "không đẹp": lời khen bị phủ định thì không phải khen
  const isPraise = hit(PRAISE, ctx) && !hit(NEG_PRAISE, ctx);
  const letters = folded.replace(/[^a-z]/g, '');

  let intent;
  if (isPromo && !isComplaint) {
    intent = 'chatter';
    reasons.push('Có đường link, lời mời vào nhóm');
  } else if (isComplaint) {
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

  // Mô hình học từ 8 nghìn bình luận bán hàng thật quyết định intent (linear_model.js);
  // luật giữ phần chắc chắn: để lại số điện thoại là chốt, link mời nhóm là quảng cáo
  const ruleIntent = intent;
  const ml = modelEnabled() ? linear.predict(text) : null;
  let model = null;
  if (ml) {
    const p5 = { order: 0, question: 0, complaint: 0, praise: 0, chatter: 0 };
    for (const [k, v] of Object.entries(ml.probs)) p5[TO5[k]] += v;
    const mi = Object.keys(p5).reduce((a, b) => (p5[b] > p5[a] ? b : a));
    model = { intent: mi, label: ml.intent, confidence: Number(p5[mi].toFixed(3)), aspects: ml.aspects, aspectProbs: ml.aspectProbs };
    const strat = process.env.LIVE_COMBINE || 'model+rules+complaint';
    let chosen = mi;
    if (strat !== 'model') {
      if (hasPhone) chosen = 'order';
      else if (isPromo && !isComplaint) chosen = 'chatter';
      else if (strat.includes('complaint') && ruleIntent === 'complaint') chosen = 'complaint';
      // Phủ quyết của luật: chốt bị phủ định ("không lấy", "đừng nói chốt", "chốt lời"),
      // câu không có chữ ("???") không phải câu hỏi
      else if (process.env.LIVE_VETO !== '0' && chosen === 'order' && !hasPhone && ruleIntent !== 'order' && (hit(NEG_ORDER, ctx, { dung: ['đừng'] }) || /(?<![a-z])(chot loi|lay loi|lay lai|chot lo)(?![a-z])/.test(folded))) chosen = ruleIntent;
      else if (process.env.LIVE_VETO !== '0' && chosen === 'question' && letters.length < 2) chosen = 'chatter';
      // Khiếu nại đẩy lên đầu hàng đợi và có thể báo "khiếu nại dồn dập": mô hình chưa chắc thì theo luật
      else if (chosen === 'complaint' && ruleIntent !== 'complaint' && p5.complaint < COMPLAINT_MIN) chosen = ruleIntent;
      // Mô hình phân vân mà luật thấy là trò chuyện thì giữ trò chuyện (bớt nhiễu hàng đợi ở phiên khác loại)
      else if (chosen !== 'chatter' && ruleIntent === 'chatter' && p5[chosen] < LOW_CONF) chosen = 'chatter';
    }
    if (strat === 'rules') chosen = ruleIntent;
    if (chosen !== intent) {
      intent = chosen;
      reasons.length = 0;
      reasons.push(`Mô hình: ${INTENT_LABEL[intent].toLowerCase()} (${Math.round(p5[intent] * 100)}%)`);
    }
  }

  let topic = null;
  if (intent === 'question') {
    const found = TOPICS.find(([key, , re]) => hit(re, ctx, key === 'color' ? COLOR_ACCENTS : key === 'material' ? MATERIAL_ACCENTS : null));
    topic = found ? found[0] : 'other';
    // Chủ đề lấy theo mô hình (dev 23/11: đúng 76% câu hỏi, luật 55%). Mô hình gộp "cách đặt" với
    // "thanh toán" và "chính hãng" với "bảo hành": hai bên cùng nhóm thì giữ chủ đề chi tiết của luật,
    // vì gợi ý trả lời đọc đúng chính sách thanh toán, bảo hành shop khai báo
    if (model && process.env.LIVE_TOPIC !== 'rule') {
      const mt = process.env.LIVE_TOPIC_PICK !== 'prob' // thứ tự ưu tiên (dev: 0,761) tốt hơn chọn theo xác suất (0,756)
        ? ASPECT_TOPIC.find(([a]) => model.aspects.includes(a))?.[1] || 'other'
        : ASPECT_TOPIC.filter(([a]) => model.aspects.includes(a)).sort((x, y) => model.aspectProbs[y[0]] - model.aspectProbs[x[0]])[0]?.[1] || 'other';
      const finer = (mt === 'howToOrder' && topic === 'payment') || (mt === 'authenticity' && topic === 'warranty');
      // Giữ chủ đề của luật khi mô hình không có chủ đề, hoặc khi khía cạnh ứng với chủ đề luật cũng nằm
      // trong các khía cạnh mô hình đoán (hai bên đồng ý; "hàng có chính hãng không" là chính hãng, không phải còn hàng)
      const agree = process.env.LIVE_TOPIC_AGREE !== '0' && topic !== 'other' && model.aspects.includes(TOPIC_ASPECT[topic]);
      const keepRule = process.env.LIVE_TOPIC !== 'model' && ((mt === 'other' && topic !== 'other') || agree);
      if (!finer && !keepRule) topic = mt;
    }
  }

  const sentiment = intent === 'complaint' ? 'Negative' : intent === 'praise' ? 'Positive' : 'Neutral';
  const variant = extractVariant(folded, ctx);
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
    reasons,
    // Ý kiến của mô hình (để soi lại và giải thích); null khi tắt mô hình
    model
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
