/**
 * LỚP BIẾN THỂ CHO VĂN BẢN SINH RA
 * ==================================================================
 * Kho khung câu (`corpus.js`) cho ra khoảng 4 nghìn câu khác nhau trên 12
 * nghìn phản hồi: trung bình mỗi câu lặp ba lần, trong khi dữ liệu thật gần
 * như không có hai đánh giá trùng nguyên văn. Phần lặp nặng nhất là lời khen
 * (22 khung câu cho gần hai phần ba dữ liệu).
 *
 * Lớp này không sửa kho khung câu (kho đó được đối chiếu với tập kiểm thử của
 * mô hình để chống rò rỉ), mà ghép thêm những thứ người mua thật hay viết:
 *  - chi tiết theo loại sản phẩm (vải, size, pin, mùi, kết cấu...)
 *  - bối cảnh mua (mua tặng ai, săn sale, mua lần mấy)
 *  - câu khen chê lẫn lộn ("hàng ổn nhưng giao chậm")
 *  - dấu vết gõ phím trên điện thoại: emoji, không dấu, kéo dài chữ, viết thường
 * Nhãn (danh mục, nguyên nhân, cảm xúc) vẫn do bộ sinh quyết định như cũ, lớp
 * này chỉ đổi cách diễn đạt.
 */

const DETAIL = {
  'Điện tử': {
    pos: ['pin dùng cả ngày vẫn còn', 'kết nối nhanh, không bị rớt', 'âm thanh ổn so với tầm giá', 'máy chạy mượt',
      'cầm chắc tay, hoàn thiện tốt', 'hàng nguyên seal, check mã chính hãng ok', 'bảo hành điện tử kích hoạt luôn'],
    neg: ['dùng được mấy hôm', 'mới sạc lần đầu', 'hàng ghi chính hãng', 'mua về dùng thử']
  },
  'Thời trang': {
    pos: ['vải mát, mặc không bí', 'form chuẩn, mặc lên đẹp', 'màu ngoài đời đẹp hơn ảnh', 'đường may chắc chắn',
      'giặt máy không bị phai', 'size {size} mặc vừa in', 'chất vải dày dặn hơn mình nghĩ'],
    neg: ['mình mặc size {size}', 'mới giặt một lần', 'đặt màu đen', 'mua cho cả nhà']
  },
  'Gia dụng': {
    pos: ['dùng {weeks} tuần rồi vẫn ổn', 'lắp đặt dễ, có hướng dẫn tiếng Việt', 'chạy êm, không ồn', 'tiết kiệm điện hơn đồ cũ',
      'vệ sinh dễ', 'kích thước gọn, để bếp vừa'],
    neg: ['mới dùng được {weeks} tuần', 'cắm điện lần đầu', 'mua cho mẹ dùng', 'đặt đợt sale']
  },
  'Mỹ phẩm': {
    pos: ['da {skin} dùng không bị kích ứng', 'mùi dễ chịu, không nồng', 'thấm nhanh, không bết', 'date còn xa, tem phụ đầy đủ',
      'dùng {weeks} tuần thấy da đều màu hơn', 'chai to dùng lâu'],
    neg: ['da mình {skin}', 'mới dùng vài lần', 'mua theo review trên mạng', 'đã check mã vạch']
  },
  'Phụ kiện': {
    pos: ['chắc chắn, cầm đầm tay', 'vừa khít máy', 'sạc nhanh đúng như quảng cáo', 'gọn nhẹ, mang đi làm tiện',
      'giá rẻ mà xài ổn'],
    neg: ['mua kèm điện thoại', 'mới dùng mấy ngày', 'đặt hai cái']
  }
};

const CONTEXT = ['mua tặng {who}', 'săn được đợt sale {sale}', 'lần thứ {n} mua ở shop', 'mua theo lời bạn giới thiệu',
  'đặt tối hôm trước sáng hôm sau đã có', 'được giảm thêm voucher', 'đặt cho {who} dùng'];

const FILL = {
  who: ['mẹ', 'bố', 'người yêu', 'em gái', 'đồng nghiệp', 'vợ', 'chồng', 'bạn thân'],
  sale: ['9.9', '10.10', '11.11', 'cuối tháng', 'flash sale', 'giữa tháng'],
  n: ['hai', 'ba', 'tư', 'mấy'],
  size: ['S', 'M', 'L', 'XL', '39', '40', '42'],
  weeks: ['hai', 'ba', 'bốn', 'sáu'],
  skin: ['dầu', 'khô', 'nhạy cảm', 'hỗn hợp']
};

const BUT = ['nhưng', 'có điều', 'mỗi tội', 'tiếc là', 'nhưng mà'];
const EMOJI = {
  Positive: ['👍', '🥰', '❤️', '😍', '👌', '🔥', '💯'],
  Neutral: ['🙂', '😐', '🤔'],
  Negative: ['😡', '😤', '😞', '👎', '😩', '🙄']
};

const fill = (rng, s) => s.replace(/\{(\w+)\}/g, (_, k) => rng.pick(FILL[k] || ['']));

/** Bối cảnh mua không trùng ý với câu gốc (câu gốc có thể đã nói "lần thứ ba mua ở shop") */
const pickContext = (rng, text) => {
  const lower = text.toLowerCase();
  const options = CONTEXT.filter((c) => !lower.includes(c.split(' ').slice(0, 2).join(' ')));
  return fill(rng, rng.pick(options.length ? options : CONTEXT));
};

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s) => (s && !/^[A-ZĐ]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const stripEnd = (s) => s.replace(/[\s.,!]+$/, '');

/** Bỏ dấu tiếng Việt — kiểu gõ vội trên điện thoại không bật bộ gõ */
const unaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Kéo dài nguyên âm cuối của một từ cảm xúc: "quá" → "quáaa" */
function elongate(rng, s) {
  const words = s.split(' ');
  const idx = words.findIndex((w) => /^(quá|lắm|tốt|đẹp|ngon|chán|tệ|thích|ưng|ok)[,.!]?$/i.test(w));
  if (idx === -1) return s;
  words[idx] = words[idx].replace(/([aeiouyáàảãạâấầẩẫậăắằẳẵặéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵk])([,.!]?)$/i,
    (_, ch, p) => ch + ch.repeat(rng.int(1, 3)) + p);
  return words.join(' ');
}

/**
 * Thêm biến thể cho một câu đã sinh.
 * @param rng      bộ số ngẫu nhiên có hạt giống của bộ sinh
 * @param text     câu gốc từ khung câu
 * @param kind     'complaint' | 'positive' | 'neutral'
 * @param category nhóm hàng của sản phẩm (để chọn chi tiết phù hợp)
 */
function vary(rng, text, kind, category) {
  const detail = DETAIL[category] || DETAIL['Phụ kiện'];
  let out = stripEnd(text);

  if (kind === 'positive') {
    const parts = [out];
    if (rng.bool(0.65)) parts.push(fill(rng, rng.pick(detail.pos)));
    if (rng.bool(0.3)) parts.push(fill(rng, rng.pick(detail.pos)));
    if (rng.bool(0.3)) parts.unshift(pickContext(rng, out));
    // Người viết ngắn thì chỉ một hai ý, người viết dài thì đảo thứ tự tự nhiên
    if (parts.length > 2 && rng.bool(0.4)) parts.push(parts.splice(1, 1)[0]);
    const sep = rng.bool(0.7) ? ', ' : '. ';
    out = [...new Set(parts)].map((p, i) => (i && sep === ', ' ? lowerFirst(p) : capitalize(p))).join(sep);
  } else if (kind === 'complaint') {
    const r = rng.next();
    if (r < 0.22) {
      // Khen một ý rồi mới chê — kiểu đánh giá 2-3 sao rất phổ biến
      out = `${capitalize(fill(rng, rng.pick(detail.pos)))} ${rng.pick(BUT)} ${lowerFirst(out)}`;
    } else if (r < 0.45) {
      out = `${capitalize(fill(rng, rng.pick(detail.neg)))}, ${lowerFirst(out)}`;
    } else if (r < 0.55) {
      out = `${capitalize(pickContext(rng, out))}, ${lowerFirst(out)}`;
    }
  } else if (rng.bool(0.3) && !/thất vọng|không dám|giải quyết|xem lại/.test(out)) {
    // Câu trung tính chỉ ghép thêm một ý mô tả khi bản thân câu không kết bằng lời chê
    out = `${capitalize(out)}, ${lowerFirst(fill(rng, rng.pick(detail.pos)))}`;
  }

  // Dấu vết gõ phím
  const sentiment = kind === 'complaint' ? 'Negative' : kind === 'positive' ? 'Positive' : 'Neutral';
  if (rng.bool(0.04)) out = elongate(rng, out);
  if (rng.bool(0.05)) out = unaccent(out).toLowerCase();
  else if (rng.bool(0.12)) out = out.toLowerCase();

  const end = rng.next();
  if (end < 0.18) out += ' ' + rng.pick(EMOJI[sentiment]) + (rng.bool(0.3) ? rng.pick(EMOJI[sentiment]) : '');
  else if (end < 0.3) out += kind === 'complaint' ? '!!' : '!';
  else if (end < 0.38) out += '...';
  else if (end < 0.7) out += '.';
  return out;
}

/** Tên hiển thị theo kênh: sàn và TikTok dùng tên tài khoản, Facebook và tổng đài dùng họ tên */
const HANDLE_SUFFIX = ['', '', '92', '95', '98', '01', '_hcm', '_hn', '.vn', '2k', '88', '_official'];
function makeHandle(rng, fullName) {
  const parts = unaccent(fullName).toLowerCase().split(' ');
  const given = parts[parts.length - 1];
  const family = parts[0];
  const middle = parts[1] || '';
  const style = rng.int(0, 4);
  const base = style === 0 ? `${given}${family}`
    : style === 1 ? `${family}.${given}`
      : style === 2 ? `${middle}${given}`
        : style === 3 ? `${given}_${middle}`
          : `${given}${family[0]}${middle[0] || ''}`;
  return base + rng.pick(HANDLE_SUFFIX);
}

// Không che tên kiểu "h*****2" như Shopee làm với đánh giá ẩn danh: tên che
// trùng nhau rất nhiều, và bộ phát hiện hành vi tài khoản sẽ tưởng đó là một
// tài khoản đánh giá hàng trăm lần.
function displayName(customer, channel) {
  return channel === 'Shopee' || channel === 'TikTok' ? customer.handle : customer.name;
}

module.exports = { vary, makeHandle, displayName, unaccent };
