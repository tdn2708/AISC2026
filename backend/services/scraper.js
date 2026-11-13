/**
 * THU THẬP DỮ LIỆU
 * ==================================================================
 * LƯU Ý PHÁP LÝ — đây là ranh giới có chủ đích, không phải hạn chế bị
 * buộc phải chấp nhận:
 *
 * Mô hình dữ liệu CHÍNH của hệ thống là first-party: doanh nghiệp cấp
 * quyền truy cập gian hàng / fanpage CỦA CHÍNH HỌ qua API chính thức.
 * Lựa chọn này đổi lấy ba thứ: hợp pháp và bền vững; có order_id nên
 * tính được Tỉ lệ Khiếu nại thật; và đối soát được review với đơn hàng
 * thật — tín hiệu chống đánh giá ảo mạnh nhất có thể có.
 *
 * Về vai trò xử lý dữ liệu theo Nghị định 13/2023/NĐ-CP: doanh nghiệp
 * là Bên Kiểm soát dữ liệu, Customer Radar là Bên Xử lý dữ liệu theo
 * hợp đồng.
 *
 * Quét dữ liệu công khai (module này) chỉ được dùng trong phạm vi hẹp:
 * dữ liệu công khai, phục vụ đối sánh cạnh tranh, có giới hạn tần suất,
 * tuân thủ robots.txt, và KHÔNG lưu thông tin cá nhân.
 */

const puppeteer = require('puppeteer');
const { leafFromBreadcrumbs } = require('./product_group');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_MODEL, LLM_TIMEOUT_MS } = require('./ai_analyzer');
const { canonicalize, maskPII } = require('./normalizer');
const { checkUrlSyntax, assertPublicUrl, browserScrapeEnabled, UnsafeUrlError } = require('./url_guard');

/** Giới hạn tần suất: tối thiểu 5 giây giữa hai lần truy cập cùng tên miền */
const MIN_INTERVAL_MS = 5000;
const lastFetchByHost = new Map();

async function respectRateLimit(host) {
  const last = lastFetchByHost.get(host) || 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchByHost.set(host, Date.now());
}

/** Kiểm tra robots.txt trước khi truy cập, và tôn trọng kết quả */
async function isAllowedByRobots(page, targetUrl) {
  try {
    const { origin, pathname } = new URL(targetUrl);
    const res = await page.goto(`${origin}/robots.txt`, { timeout: 10000 });
    if (!res || !res.ok()) return true; // không có robots.txt thì mặc định cho phép

    const body = await res.text();
    const lines = body.split('\n').map((l) => l.trim());

    let appliesToUs = false;
    const disallowed = [];
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || rest.length === 0) continue;
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (key === 'user-agent') appliesToUs = value === '*';
      else if (key === 'disallow' && appliesToUs && value) disallowed.push(value);
    }

    return !disallowed.some((rule) => pathname.startsWith(rule));
  } catch {
    return true;
  }
}

/**
 * Kiểm tra cú pháp đường dẫn (không cần mạng): chỉ http/https, cổng 80/443, không
 * địa chỉ nội bộ. Việc phân giải tên miền và chặn IP nội bộ nằm ở `assertPublicUrl`
 * (services/url_guard.js), được gọi ngay trước khi mở trang.
 */
function validateTargetUrl(raw) {
  return checkUrlSyntax(raw);
}

/** Số sao hợp lệ 1–5, ngược lại null. `Number(null)` là 0 nên không được dùng thẳng. */
function parseRating(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
}

/** Ngày mô hình trích ra: sai định dạng hoặc ở tương lai thì dùng thời điểm hiện tại */
function parseReviewDate(v) {
  const d = v ? new Date(v) : null;
  const now = new Date();
  if (!d || Number.isNaN(d.getTime()) || d > now) return now;
  return d;
}

const MAX_SCROLL_STEPS = 60;

/**
 * KẾT NỐI TIKI QUA API ĐÁNH GIÁ CÔNG KHAI.
 *
 * Không cần trình duyệt không giao diện (Puppeteer cần ~300 MB RAM, máy chủ
 * miễn phí không chạy nổi) và không cần mô hình ngôn ngữ để "đọc" trang: Tiki
 * trả thẳng JSON có tên người viết, số sao, ngày. robots.txt của Tiki chỉ chặn
 * /api/v2/me/ và /api/v2/reviews/writable — API đọc đánh giá được phép.
 * Lịch sự với máy chủ: tối đa TIKI_MAX_PAGES trang, nghỉ giữa các lần gọi.
 */
const TIKI_MAX_PAGES = 5;
const TIKI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CustomerRadar/1.0; +https://aisc-2026.vercel.app)',
  Accept: 'application/json'
};

function tikiProductIds(u) {
  if (!/(^|\.)tiki\.vn$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/-p(\d+)\.html$/i) || u.pathname.match(/^\/p\/(\d+)/i);
  return m ? { productId: m[1], spid: u.searchParams.get('spid') } : null;
}

/** "2024-07-23 15:20:59" (giờ Việt Nam, không ghi múi giờ) -> Date */
function parseTikiLocalTime(v) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v.replace(' ', 'T') + '+07:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Dữ kiện do SÀN và CHÍNH KHÁCH HÀNG cung cấp kèm mỗi đánh giá — không do AI
 * suy ra. Đây là phần trả lời câu hỏi "lấy gì chứng thực độ tin cậy":
 *  - verifiedPurchase / purchasedAt / deliveredAt: Tiki xác nhận người viết đã mua
 *    và mốc giao hàng, dùng để đối soát thay cho sổ đơn của doanh nghiệp
 *  - customerRatings: câu khách TỰ chọn ("Giao trễ hẹn", "Cẩn thận"...), dùng để
 *    đối chiếu với nhãn AI gán
 *  - replies: nhà bán / Tiki Care đã phản hồi chưa
 */
function tikiPlatformFacts(r, productId) {
  const by = r.created_by || {};
  const replies = Array.isArray(r.comments) ? r.comments : [];
  return {
    platform: 'Tiki',
    reviewId: r.id ?? null,
    productId: Number(productId) || null,
    spid: r.spid ?? null,
    seller: r.seller?.name || null,
    verifiedPurchase: by.purchased === true,
    purchasedAt: by.purchased_at ? new Date(by.purchased_at * 1000) : null,
    deliveredAt: parseTikiLocalTime(r.timeline?.delivery_date),
    usedFor: r.timeline?.content || null,
    customerRatings: Array.isArray(r.delivery_rating)
      ? r.delivery_rating.map((q) => ({ question: String(q.question || ''), option: String(q.option || '') }))
      : [],
    accountCreatedAt: parseTikiLocalTime(by.created_time),
    accountTotalReviews: Number.isFinite(by.contribute_info?.summary?.total_review)
      ? by.contribute_info.summary.total_review
      : null,
    replies: replies.map((c) => ({
      by: c.commentator === 'tikicare' ? 'Tiki Care' : c.commentator === 'seller' ? 'Nhà bán' : 'Khác',
      at: c.create_at ? new Date(c.create_at * 1000) : null
    })),
    rawCustomerId: by.id ?? r.customer_id ?? null
  };
}

/**
 * @param {URL} u đường dẫn sản phẩm Tiki
 * @param {{ sort?: string, maxPages?: number }} opts sort mặc định "hữu ích nhất";
 *        bộ thu thập hàng loạt dùng 'id|desc' (mới nhất) để có dữ liệu gần đây
 */
async function fetchTikiReviews(u, opts = {}) {
  const axios = require('axios');
  const { productId, spid } = tikiProductIds(u);
  const q = spid ? `&spid=${encodeURIComponent(spid)}` : '';
  const sort = opts.sort || 'score|desc,id|desc,stars|all';
  const maxPages = opts.maxPages || TIKI_MAX_PAGES;

  let productName = null;
  let productCategory = null;
  try {
    const { data } = await axios.get(`https://tiki.vn/api/v2/products/${productId}?${q.slice(1)}`, { headers: TIKI_HEADERS, timeout: 15000 });
    productName = data?.name || null;
    // Danh mục lá của sàn (breadcrumb: Điện Gia Dụng > ... > Nồi chiên > tên sản phẩm): mảng hàng cho lớp điểm đau
    productCategory = leafFromBreadcrumbs(data?.breadcrumbs, productName);
  } catch {
    // không lấy được tên thì route dùng đoạn cuối đường dẫn
  }

  const reviews = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await axios.get(
      `https://tiki.vn/api/v2/reviews?product_id=${productId}${q}&page=${page}&limit=20&include=comments,contribute_info&sort=${encodeURIComponent(sort)}`,
      { headers: TIKI_HEADERS, timeout: 15000 }
    );
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const r of rows) {
      // Chỉ lấy đánh giá có nội dung viết. Phần tiêu đề ("Cực kì hài lòng") do
      // Tiki tự sinh theo số sao, không mang thông tin để phân tích.
      const text = String(r.content || '').trim();
      if (!text) continue;
      const timestamp = parseReviewDate(r.created_at ? new Date(r.created_at * 1000) : null);
      const facts = tikiPlatformFacts(r, productId);
      reviews.push({
        source: 'Tiki',
        rawText: canonicalize(text).slice(0, 5000),
        author: r.created_by?.name ? canonicalize(r.created_by.name).trim().slice(0, 100) : 'Ẩn danh',
        rating: parseRating(r.rating),
        accountAgeDays: facts.accountCreatedAt && timestamp
          ? Math.max(0, Math.round((timestamp - facts.accountCreatedAt) / 86400000))
          : null,
        orderId: null,
        productName,
        productCategory,
        timestamp,
        platformFacts: facts
      });
    }
    const last = data?.paging?.last_page ?? page;
    if (page >= last || rows.length === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  console.log(`[SCRAPER] Tiki: ${reviews.length} đánh giá có nội dung từ sản phẩm ${productId}`);
  return reviews;
}

const scrapeShopeeReviews = async (productUrl) => {
  // Cú pháp rồi phân giải tên miền: mọi địa chỉ trả về phải là địa chỉ công khai
  const target = await assertPublicUrl(productUrl);
  const { hostname, href } = target;
  productUrl = href;
  await respectRateLimit(hostname);

  if (tikiProductIds(target)) {
    try {
      return await fetchTikiReviews(target);
    } catch (e) {
      console.error('[SCRAPER] Lỗi khi gọi API đánh giá Tiki:', e.message);
      return [];
    }
  }

  // Trình duyệt không giao diện tốn khoảng 300 MB RAM và mở được mọi trang: chỉ bật
  // khi chủ máy chủ cho phép (Render 512 MB để tắt). Mặc định chỉ nhận đường dẫn Tiki.
  if (!browserScrapeEnabled()) {
    const err = new UnsafeUrlError('Máy chủ này chỉ thu thập đường dẫn sản phẩm Tiki. Trang khác cần bật trình duyệt thu thập (ALLOW_BROWSER_SCRAPE=1) và chỉ nên chạy trên máy cục bộ.');
    err.status = 422;
    throw err;
  }

  let rawText = '';
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();
    // Mọi yêu cầu của trang, kể cả chuyển hướng, cũng phải tới địa chỉ công khai
    await page.setRequestInterception(true);
    const checked = new Map();
    page.on('request', (request) => {
      const u = request.url();
      if (/^(data|blob|about):/i.test(u)) return request.continue();
      let verdict = checked.get(new URL(u).host);
      if (!verdict) {
        verdict = assertPublicUrl(u).then(() => true, () => false);
        checked.set(new URL(u).host, verdict);
      }
      verdict.then((ok) => (ok ? request.continue() : request.abort('blockedbyclient'))).catch(() => request.abort());
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const allowed = await isAllowedByRobots(page, productUrl);
    if (!allowed) {
      console.warn(`[SCRAPER] robots.txt của ${hostname} không cho phép đường dẫn này. Dừng lại.`);
      await browser.close();
      return [];
    }

    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Cuộn trang để kích hoạt tải chậm (lazy-load) phần bình luận
    // Có trần số bước: trang cuộn vô hạn tự dài ra mãi, điều kiện "chạm đáy"
    // không bao giờ đúng và request treo tới khi puppeteer hết thời gian chờ
    await page.evaluate(async (maxSteps) => {
      await new Promise((resolve) => {
        let total = 0;
        let steps = 0;
        const step = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          steps += 1;
          if (steps >= maxSteps || total >= document.body.scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    }, MAX_SCROLL_STEPS);

    await new Promise((r) => setTimeout(r, 2000));
    rawText = await page.evaluate(() => document.body.innerText);
    console.log(`[SCRAPER] Đã lấy ${rawText.length} ký tự từ ${hostname}`);
  } catch (error) {
    console.error('[SCRAPER] Lỗi khi truy cập trang:', error.message);
  } finally {
    if (browser) await browser.close();
  }

  // Trang bị chặn hoặc không có nội dung => trả về rỗng.
  // KHÔNG sinh dữ liệu giả để lấp chỗ trống: bịa review rồi đưa vào cùng
  // một kho với dữ liệu thật là đúng thứ mà cả Trust Layer sinh ra để
  // ngăn chặn. Thà báo "không lấy được dữ liệu" còn hơn.
  if (!rawText || rawText.length < 200) {
    console.warn('[SCRAPER] Không lấy được nội dung. Trả về rỗng thay vì sinh dữ liệu giả.');
    return [];
  }

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('Thiếu GEMINI_API_KEY');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL }, { timeout: LLM_TIMEOUT_MS });

    // Che PII trước khi gửi đi và trước khi lưu — đúng cam kết "KHÔNG lưu
    // thông tin cá nhân" ở đầu tệp
    const safeText = maskPII(rawText.substring(0, 30000)).text;
    const prompt = `Dưới đây là văn bản lấy trực tiếp từ trang: ${productUrl}
---
${safeText}
---
TRÍCH XUẤT các bình luận / đánh giá của người dùng có THẬT trong văn bản trên.
Chỉ lấy nội dung thực sự xuất hiện; TUYỆT ĐỐI KHÔNG tự sáng tác thêm đánh giá.
Nếu không tìm thấy bình luận nào, trả về mảng rỗng [].

Hôm nay là ${new Date().toISOString().split('T')[0]}. Nếu thời gian hiển thị
dạng tương đối ("5 ngày trước"), hãy quy đổi ra ngày cụ thể YYYY-MM-DD.

Trả về DUY NHẤT mảng JSON, không kèm giải thích:
[{ "rawText": "...", "author": "...", "date": "YYYY-MM-DD", "rating": <1-5 hoặc null> }]`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

    const extracted = JSON.parse(text);
    if (!Array.isArray(extracted)) return [];

    const domain = hostname.replace('www.', '').split('.')[0];
    const sourceName = domain.charAt(0).toUpperCase() + domain.slice(1);

    return extracted
      .filter((r) => r && r.rawText && String(r.rawText).trim())
      .map((r) => ({
        source: sourceName || 'Web',
        rawText: canonicalize(r.rawText).trim().slice(0, 5000),
        author: r.author ? canonicalize(r.author).trim().slice(0, 100) : 'Ẩn danh',
        rating: parseRating(r.rating),
        // Không suy ra được từ trang công khai; để null thay vì đoán bừa.
        // Trust Layer sẽ xếp các phản hồi này vào hạng P3/P4 vì thiếu
        // thông tin đối soát — đúng với mức tin cậy thật của chúng.
        accountAgeDays: null,
        orderId: null,
        timestamp: parseReviewDate(r.date)
      }));
  } catch (error) {
    console.error('[SCRAPER] Lỗi khi trích xuất bình luận:', error.message);
    return [];
  }
};

module.exports = { scrapeShopeeReviews, validateTargetUrl, assertPublicUrl, parseRating, parseReviewDate, fetchTikiReviews, tikiProductIds };
