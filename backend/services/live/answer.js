/**
 * GỢI Ý TRẢ LỜI CHO NGƯỜI ĐỨNG LIVE
 * ==================================================================
 * Mọi câu gợi ý chỉ dùng thông tin shop đã khai báo cho phiên live: danh mục
 * sản phẩm (giá, size, màu, tồn kho, bảng size) và chính sách (giao hàng,
 * thanh toán, đổi trả, khuyến mãi). Thiếu thông tin thì câu trả lời nói thẳng
 * là shop kiểm tra rồi báo lại, và được đánh dấu `grounded: false` để người
 * đứng live biết đừng đọc nguyên văn. Không bao giờ bịa giá hay tồn kho: trả
 * lời sai giá trong lúc live là mất đơn, có khi thành khiếu nại.
 *
 * Bản mẫu chạy tức thì, không tốn lượt LLM. Nút "Viết lại tự nhiên hơn" trên
 * giao diện mới gọi LLM, và prompt chỉ đưa đúng các dữ kiện bản mẫu đã dùng.
 */

const { TOPIC_LABEL } = require('./intent');

const vnd = (n) => (Number.isFinite(Number(n)) && n !== null && n !== '' ? `${Number(n).toLocaleString('vi-VN')}đ` : null);

const at = (handle) => (handle ? `@${handle} ` : '');

/** "Dạ " + câu chính sách: hạ chữ đầu ("Bạn bấm" -> "bạn bấm"), giữ từ viết tắt ("COD") */
const lowerFirst = (t) => (t && !/^[A-ZĐ]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

/** Tồn kho của một biến thể; trả null nếu shop không khai báo */
function stockOf(product, variant = {}) {
  const s = product?.stock;
  if (s == null) return null;
  if (typeof s === 'number') return s;
  if (typeof s === 'object') {
    if (variant.size && s[variant.size] != null) return Number(s[variant.size]);
    if (variant.color && s[variant.color] != null) return Number(s[variant.color]);
    const total = Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
    return Number.isFinite(total) ? total : null;
  }
  return null;
}

/**
 * Chọn size theo bảng size shop khai báo: size nhỏ nhất mà cân nặng và chiều
 * cao của khách đều nằm trong giới hạn. Bảng dạng [{size, maxKg, maxCm}].
 */
function recommendSize(product, body) {
  const guide = Array.isArray(product?.sizeGuide) ? product.sizeGuide : [];
  if (!guide.length || !body) return null;
  const fit = guide.find((g) =>
    (body.weightKg == null || g.maxKg == null || body.weightKg <= g.maxKg) &&
    (body.heightCm == null || g.maxCm == null || body.heightCm <= g.maxCm)
  );
  return fit ? fit.size : guide[guide.length - 1].size;
}

/** Sản phẩm của câu hỏi: sản phẩm khách nhắc, không có thì sản phẩm đang giới thiệu */
function productFor(comment, session) {
  const list = session?.products || [];
  const id = comment.productId || session?.currentProductId;
  return list.find((p) => p.id === id) || null;
}

/**
 * @param {object} comment  bình luận đã phân loại (intent, topic, variant, body, author)
 * @param {object} session  { products, policy, currentProductId }
 * @returns {{ text: string, grounded: boolean, facts: object }}
 */
function suggestAnswer(comment, session = {}) {
  const policy = session.policy || {};
  const p = productFor(comment, session);
  const name = p ? p.name : null;
  const who = at(comment.author?.handle);
  const facts = { product: name, topic: comment.topic };
  const unknown = (what) => ({
    text: `${who}Dạ shop kiểm tra ${what} rồi báo bạn ngay nha.`.trim(),
    grounded: false,
    facts
  });

  if (comment.intent === 'complaint') {
    facts.policy = policy.complaint || null;
    return {
      text: `${who}Dạ shop xin lỗi bạn ạ. Bạn nhắn mã đơn vào tin nhắn của shop, shop kiểm tra và xử lý cho bạn ngay sau live nha.${policy.complaint ? ` ${policy.complaint}` : ''}`.trim(),
      grounded: true,
      facts
    };
  }

  if (comment.intent === 'order') {
    const v = [comment.variant?.size && `size ${comment.variant.size}`, comment.variant?.color].filter(Boolean).join(', ');
    const left = p ? stockOf(p, comment.variant) : null;
    facts.stock = left;
    if (left === 0) return { text: `${who}Dạ ${name}${v ? ` ${v}` : ''} vừa hết rồi ạ, bạn chọn màu hoặc size khác giúp shop nha.`, grounded: true, facts };
    return {
      text: `${who}Dạ shop giữ ${comment.quantity || 1} ${name || 'sản phẩm'}${v ? ` (${v})` : ''} cho bạn rồi nha.${policy.howToOrder ? ` ${policy.howToOrder}` : ''}`.trim(),
      grounded: Boolean(p),
      facts
    };
  }

  switch (comment.topic) {
    case 'price': {
      if (!p || (p.price == null && p.salePrice == null)) return unknown(p ? `giá ${name}` : 'sản phẩm bạn hỏi');
      const sale = vnd(p.salePrice);
      const base = vnd(p.price);
      facts.price = p.price;
      facts.salePrice = p.salePrice;
      const promo = policy.promo ? ` ${policy.promo}` : '';
      return {
        text: sale && base && p.salePrice < p.price
          ? `${who}Dạ ${name} giá live chỉ còn ${sale} (giá gốc ${base}) ạ.${promo}`
          : `${who}Dạ ${name} giá ${sale || base} ạ.${promo}`,
        grounded: true,
        facts
      };
    }
    case 'size': {
      if (!p) return unknown('size cho bạn');
      const rec = recommendSize(p, comment.body);
      facts.sizes = p.sizes || [];
      facts.sizeGuide = p.sizeGuide || [];
      if (rec) {
        const b = comment.body;
        const desc = [b.heightCm && `cao ${String(b.heightCm / 100).replace('.', 'm')}`, b.weightKg && `${b.weightKg}kg`].filter(Boolean).join(' ');
        return { text: `${who}Dạ ${desc ? `bạn ${desc} ` : ''}mặc ${name} size ${rec} là vừa đẹp ạ.`, grounded: true, facts: { ...facts, recommended: rec } };
      }
      if (p.sizes?.length) return { text: `${who}Dạ ${name} có size ${p.sizes.join(', ')} ạ. Bạn cho shop xin chiều cao, cân nặng để shop tư vấn size chuẩn nha.`, grounded: true, facts };
      return unknown(`size của ${name}`);
    }
    case 'stock': {
      if (!p) return unknown('hàng');
      const left = stockOf(p, comment.variant);
      facts.stock = left;
      if (left == null) return unknown(`tồn kho ${name}`);
      const v = [comment.variant?.size && `size ${comment.variant.size}`, comment.variant?.color].filter(Boolean).join(', ');
      if (left === 0) return { text: `${who}Dạ ${name}${v ? ` ${v}` : ''} hết hàng rồi ạ, bạn tham khảo màu hoặc size khác nha.`, grounded: true, facts };
      return { text: `${who}Dạ ${name}${v ? ` ${v}` : ''} vẫn còn ${left <= 10 ? `${left} cái cuối` : 'hàng'} ạ, bạn chốt sớm giúp shop nha.`, grounded: true, facts };
    }
    case 'color': {
      if (!p?.colors?.length) return unknown(p ? `màu của ${name}` : 'màu');
      facts.colors = p.colors;
      return { text: `${who}Dạ ${name} có màu ${p.colors.join(', ')} ạ.`, grounded: true, facts };
    }
    case 'material': {
      if (!p?.material) return unknown(p ? `chất liệu ${name}` : 'chất liệu');
      facts.material = p.material;
      return { text: `${who}Dạ ${name}: ${p.material} ạ.`, grounded: true, facts };
    }
    case 'usage': {
      if (!p?.usage) return unknown(p ? `cách dùng ${name}` : 'cách dùng');
      facts.usage = p.usage;
      return { text: `${who}Dạ ${lowerFirst(p.usage)}`, grounded: true, facts };
    }
    default: {
      const map = { shipping: 'shipping', payment: 'payment', warranty: 'returns', promo: 'promo', authenticity: 'authenticity', howToOrder: 'howToOrder' };
      const key = map[comment.topic];
      if (key && policy[key]) {
        facts[key] = policy[key];
        return { text: `${who}Dạ ${lowerFirst(policy[key])}`, grounded: true, facts };
      }
      return unknown(comment.topic && comment.topic !== 'other' ? TOPIC_LABEL[comment.topic]?.toLowerCase() || 'thông tin' : 'câu hỏi của bạn');
    }
  }
}

/**
 * Prompt cho LLM viết lại câu gợi ý. Chỉ đưa câu khách hỏi và dữ kiện bản
 * mẫu đã dùng; cấm thêm số liệu mới.
 */
function buildRewritePrompt(comment, draft, session = {}) {
  return `Bạn là trợ lý của người bán hàng đang livestream trên ${session.platformLabel || 'TikTok'}.
Viết lại câu trả lời cho bình luận của khách sao cho tự nhiên, thân thiện, ngắn (tối đa 2 câu, dưới 45 từ), xưng "shop", gọi khách là "bạn".

QUY TẮC BẮT BUỘC:
1. Chỉ dùng dữ kiện trong mục DỮ KIỆN. Không thêm giá, tồn kho, thời gian giao, khuyến mãi nào khác.
2. Nếu dữ kiện không đủ để trả lời, nói shop sẽ kiểm tra và báo lại.
3. Không dùng emoji quá 1 cái. Không markdown. Chỉ trả về câu trả lời.

BÌNH LUẬN: "${String(comment.text || '').slice(0, 300)}"
BẢN NHÁP: "${draft.text}"
DỮ KIỆN: ${JSON.stringify(draft.facts)}`;
}

module.exports = { suggestAnswer, buildRewritePrompt, recommendSize, stockOf, productFor };
