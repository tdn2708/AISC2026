/**
 * ĐƯA PHẢN HỒI THU THẬP ĐƯỢC VÀO KHO
 * ==================================================================
 * Dùng chung cho POST /scrape (một đường dẫn) và bộ thu thập hàng loạt
 * (scripts/collect_real.js), để hai đường cùng che thông tin cá nhân, cùng
 * giữ dữ kiện sàn xác nhận và cùng chống trùng theo một cách.
 */

const crypto = require('crypto');
const normalizer = require('./normalizer');
const taxonomy = require('./taxonomy');
const { saltReady } = require('./pii_salt');

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/**
 * Khóa chống trùng. Có mã đánh giá của sàn thì dùng mã đó — ổn định tuyệt đối,
 * kể cả khi nội dung bị sửa hay tên hiển thị đã che. Không có thì ghép nguồn,
 * sản phẩm, tác giả, ngày và nội dung như trước.
 */
function dedupKey(doc) {
  const reviewId = doc.platformFacts?.reviewId;
  if (reviewId != null) return sha1(`${doc.source}|review|${reviewId}`);
  const day = doc.timestamp instanceof Date && !Number.isNaN(doc.timestamp.getTime())
    ? doc.timestamp.toISOString().slice(0, 10)
    : '';
  const text = normalizer.canonicalize(doc.originalText).toLowerCase().replace(/\s+/g, ' ').trim();
  return sha1([doc.source, doc.productName, doc.author, day, text].join('\u0001'));
}

/**
 * Che tên người mua (Nghị định 13/2023): giữ chữ đầu, các chữ sau còn chữ cái
 * đầu. "Quang Duy Ha" -> "Quang D. H."; tên một chữ -> "Q***".
 */
function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Ẩn danh';
  if (parts.length === 1) return `${parts[0][0]}***`;
  return [parts[0], ...parts.slice(1).map((p) => `${p[0].toUpperCase()}.`)].join(' ');
}

/**
 * Mã khách ẩn danh, ổn định giữa các lần thu thập: băm mã khách của sàn kèm
 * một chuỗi bí mật, nên không suy ngược được ra tài khoản thật. Bộ phát hiện
 * hành vi tài khoản gom theo mã này thay vì tên đã che (tên che dễ trùng).
 *
 * Chưa có muối bí mật thì KHÔNG lưu mã khách (trả null): mã khách của sàn là
 * số tuần tự, băm với muối công khai thì thử ngược ra được ngay. Dữ liệu vẫn
 * vào kho và vẫn được phân tích, chỉ thiếu bước gom theo tài khoản.
 */
function pseudoCustomerId(platform, rawId) {
  if (rawId == null || !saltReady()) return null;
  const salt = process.env.PII_SALT;
  return `${String(platform).toLowerCase()}:${sha1(`${salt}|${platform}|${rawId}`).slice(0, 12)}`;
}

/**
 * Ghép kết quả thu thập với nhãn AI thành bản ghi phản hồi.
 * @param {Array} rawReviews kết quả của trình thu thập
 * @param {Array} aiResults nhãn AI, cùng thứ tự với rawReviews
 * @param {{ fallbackProduct?: string, collectedVia: string, sourceUrl?: string }} meta
 */
function buildFeedbackDocs(rawReviews, aiResults, meta) {
  const collectedAt = new Date();
  return rawReviews.map((review, index) => {
    const ai = aiResults[index] || {};
    const category = taxonomy.normalizeCategory(ai.category);
    const facts = review.platformFacts || null;
    const { rawCustomerId, ...publicFacts } = facts || {};
    return {
      source: review.source,
      // Che số điện thoại, email... như normalizer làm cho văn bản đưa vào mô hình: không lưu thông tin cá nhân
      originalText: normalizer.maskPII(review.rawText).text,
      author: facts ? maskName(review.author) : review.author,
      customerId: facts ? pseudoCustomerId(facts.platform, rawCustomerId) : null,
      timestamp: review.timestamp,
      productName: review.productName || meta.fallbackProduct || 'Sản phẩm chưa xác định',
      accountAgeDays: review.accountAgeDays ?? null,
      rating: review.rating ?? null,
      orderId: review.orderId ?? null,
      // Dữ kiện sàn xác nhận nằm ở cấp trên cùng để Trust Layer đọc trực tiếp
      verifiedPurchase: facts ? facts.verifiedPurchase === true : false,
      deliveredAt: facts?.deliveredAt || null,
      platformFacts: facts ? publicFacts : null,
      category,
      subCategory: taxonomy.normalizeCause(category, ai.subCategory),
      sentiment: ai.sentiment || 'Neutral',
      aiSummary: ai.aiSummary || null,
      entities: ai.entities || null,
      // Giữ đủ khía cạnh: mô hình đa nhãn có thể nêu nhiều vấn đề trong một phản hồi,
      // `category` chỉ là danh mục chính dùng để đếm chỉ số
      aspects: Array.isArray(ai.aspects) ? ai.aspects : [],
      // Nhãn do đâu gán (visobert / llm / rules / cascade) — để biết độ tin của nhãn
      labelledBy: ai.labelledBy || null,
      // Mỉa mai và các phiếu bầu nhãn (label_cascade.js); câu bất đồng chờ người duyệt
      ...(ai.sarcasm ? { sarcasm: ai.sarcasm } : {}),
      ...(ai.labelVotes ? { labelVotes: ai.labelVotes } : {}),
      needsReview: Boolean(ai.needsReview),
      collectedAt,
      collectedVia: meta.collectedVia,
      sourceUrl: meta.sourceUrl || null
    };
  });
}

/**
 * Ghi theo khóa chống trùng thay vì insertMany: cào lại cùng trang từng chèn
 * nguyên bản sao của mọi bình luận, và chính các bản sao cùng thời điểm đó bị
 * Trust Layer bắt thành "cụm đánh giá ảo".
 * @returns {Promise<{ inserted: number, duplicates: number }>}
 */
async function saveFeedbacks(db, docs) {
  if (!docs.length) return { inserted: 0, duplicates: 0 };
  for (const doc of docs) doc.dedupKey = dedupKey(doc);
  const write = await db.collection('feedbacks').bulkWrite(
    docs.map((doc) => ({
      updateOne: { filter: { dedupKey: doc.dedupKey }, update: { $setOnInsert: doc }, upsert: true }
    })),
    { ordered: false }
  );
  return { inserted: write.upsertedCount, duplicates: docs.length - write.upsertedCount };
}

module.exports = { dedupKey, maskName, pseudoCustomerId, buildFeedbackDocs, saveFeedbacks };
