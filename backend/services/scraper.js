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
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_MODEL } = require('./ai_analyzer');

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

const scrapeShopeeReviews = async (productUrl) => {
  const { hostname } = new URL(productUrl);
  await respectRateLimit(hostname);

  let rawText = '';
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();
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
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const step = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });

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
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const safeText = rawText.substring(0, 30000);
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
        rawText: String(r.rawText).trim(),
        author: r.author || 'Ẩn danh',
        rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
        // Không suy ra được từ trang công khai; để null thay vì đoán bừa.
        // Trust Layer sẽ xếp các phản hồi này vào hạng P3/P4 vì thiếu
        // thông tin đối soát — đúng với mức tin cậy thật của chúng.
        accountAgeDays: null,
        orderId: null,
        timestamp: r.date && !isNaN(new Date(r.date).getTime()) ? new Date(r.date) : new Date()
      }));
  } catch (error) {
    console.error('[SCRAPER] Lỗi khi trích xuất bình luận:', error.message);
    return [];
  }
};

module.exports = { scrapeShopeeReviews };
