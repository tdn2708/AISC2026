/**
 * KIỂM TRA ĐỐI CHIẾU YÊU CẦU
 * ==================================================================
 * Đối chiếu mã nguồn với DANH SÁCH KIỂM TRA TRƯỚC KHI NỘP trong tài
 * liệu phản biện, và với các lỗ hổng A1–A4, B1–B4, C1–C8.
 *
 * Vì sao cần tệp này: một yêu cầu được "làm xong" rồi lặng lẽ hỏng lại
 * trong lần sửa sau là chuyện thường gặp. Kiểm tra tự động biến danh
 * sách kiểm tra giấy thành thứ chạy được.
 *
 * Chạy: npm run check
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');

let pass = 0;
let fail = 0;
const failures = [];

function req(id, description, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ĐẠT   [${id}] ${description}`);
  } catch (e) {
    fail += 1;
    failures.push({ id, description, reason: e.message });
    console.error(`  THIẾU [${id}] ${description}\n        ${e.message}`);
  }
}

const readFile = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error(`Không tìm thấy tệp: ${rel}`);
  return fs.readFileSync(p, 'utf8');
};
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/**
 * Loại bỏ chú thích trước khi kiểm tra nội dung MÃ.
 *
 * Cần thiết vì các chú thích trong dự án cố tình trích lại đoạn mã sai
 * của bản cũ để giải thích vì sao phải sửa — ví dụ "Bản trước ghi `|| 15`".
 * Nếu kiểm tra soi cả chú thích thì nó sẽ báo lỗi ở chính đoạn văn giải
 * thích rằng lỗi đó đã được sửa, tức là báo động giả vĩnh viễn.
 */
const readCode = (rel) =>
  readFile(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // chú thích khối
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')  // chú thích dòng, chừa lại "://" trong URL
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' '); // chú thích JSX

// ==================================================================
console.log('\nNHÓM A — LỖ HỔNG CHÍ MẠNG');
// ==================================================================

req('A1', 'Có tầng kiểm soát tin cậy dữ liệu độc lập với đủ 5 nhóm tín hiệu', () => {
  const trust = require('../services/trust_layer');
  assert.ok(trust.runTrustLayer, 'thiếu runTrustLayer');
  assert.ok(trust.PROVENANCE_TIERS.P1 && trust.PROVENANCE_TIERS.P5, 'thiếu phân hạng nguồn P1-P5');
  assert.strictEqual(trust.PROVENANCE_TIERS.P1.weight, 1.0, 'trọng số P1 phải là 1.00');
  assert.strictEqual(trust.PROVENANCE_TIERS.P5.weight, 0.15, 'trọng số P5 phải là 0.15');

  for (const fn of ['detectNearDuplicateClusters', 'detectBursts', 'detectAccountAnomalies',
    'starTextMismatch', 'transactionMismatch']) {
    assert.ok(typeof trust[fn] === 'function', `thiếu nhóm tín hiệu: ${fn}`);
  }
  assert.ok(trust.AUTHENTICITY_BANDS.reject === 0.7, 'ngưỡng loại phải là A >= 0.70');
  assert.ok(trust.AUTHENTICITY_BANDS.gray === 0.4, 'ngưỡng vùng xám phải là A >= 0.40');
});

req('A1b', 'Phản hồi hạng P5 không được kích hoạt cảnh báo mức cao', () => {
  const trust = require('../services/trust_layer');
  const p5 = trust.assignProvenanceTier({ source: 'Facebook', author: 'Anonymous' });
  assert.strictEqual(p5.tier, 'P5');
  assert.strictEqual(p5.canTriggerHighAlert, false, 'P5 phải bị chặn khỏi cảnh báo High/Critical');
});

req('A2', 'WCR chỉ tính trên kênh đối soát được, có mẫu số và độ phủ', () => {
  const metrics = require('../services/metrics');
  const noTxn = metrics.weightedComplaintRate([], 0);
  assert.strictEqual(noTxn.available, false, 'thiếu mẫu số phải báo không khả dụng');
  assert.strictEqual(noTxn.value, null, 'không được trả ra con số khi thiếu mẫu số');
  assert.ok(noTxn.reason, 'phải nêu lý do');
  assert.ok(metrics.shareOfNegative, 'thiếu chỉ số thay thế Share of Negative');
  assert.ok(metrics.negativeVelocity, 'thiếu chỉ số thay thế Negative Velocity');
  assert.deepStrictEqual(metrics.RECONCILABLE_TIERS, ['P1', 'P2'], 'WCR phải giới hạn ở P1/P2');
});

req('A2b', 'Có nguồn dữ liệu giao dịch làm mẫu số', () => {
  const api = readFile('backend/routes/api.js');
  assert.ok(api.includes("'/transactions'"), 'thiếu endpoint nạp dữ liệu giao dịch');
  assert.ok(api.includes("collection('transactions')"), 'thiếu collection transactions');
});

req('A3', 'Có khung đánh giá mô hình với số đo thật', () => {
  assert.ok(exists('backend/evaluation/run_evaluation.js'), 'thiếu bộ chạy đánh giá');
  assert.ok(exists('backend/evaluation/gold_dataset.js'), 'thiếu tập chuẩn');
  assert.ok(exists('backend/evaluation/metrics.js'), 'thiếu chỉ số đánh giá');
  assert.ok(exists('backend/evaluation/results.json'), 'chưa chạy npm run eval để sinh kết quả');

  const results = JSON.parse(readFile('backend/evaluation/results.json'));
  assert.ok(results.models.length >= 3, 'phải có ít nhất 3 mô hình đối chứng');
  const b1 = results.models.find((m) => m.id === 'B1');
  assert.ok(b1 && typeof b1.categoryMacroF1 === 'number', 'B1 phải có số F1 đo được');
});

req('A3b', 'Kết quả đánh giá nêu rõ giới hạn, không tuyên bố vượt thực tế', () => {
  const results = JSON.parse(readFile('backend/evaluation/results.json'));
  assert.strictEqual(results.dataset.isPublishedBenchmark, false, 'phải ghi rõ chưa phải benchmark đã công bố');
  assert.strictEqual(results.dataset.cohensKappa, null, 'chưa gán đôi thì kappa phải là null');
  const m = results.models.find((x) => x.id === 'M');
  assert.strictEqual(m.available, false, 'mô hình đề xuất chưa huấn luyện thì không được có số');
});

req('A3c', 'Có kiểm tra rò rỉ tập kiểm tra', () => {
  const { auditLeakage } = require('../evaluation/contamination');
  const { ASPECT_DEV, ASPECT_TEST } = require('../evaluation/gold_dataset');
  const audit = auditLeakage(ASPECT_DEV, ASPECT_TEST);
  assert.strictEqual(audit.clean, true, `phát hiện ${audit.leakedCount} từ khóa rò rỉ`);
});

req('A4', 'Có tài liệu tham khảo đủ 10 mục, gồm phát hiện đánh giá giả và SA2SL', () => {
  const refs = readFile('docs/TAI-LIEU-THAM-KHAO.md');
  assert.ok(/Jindal/i.test(refs) && /opinion spam/i.test(refs), 'thiếu công trình nền về opinion spam');
  assert.ok(refs.includes('Mukherjee'), 'thiếu công trình về nhóm đánh giá thuê');
  assert.ok(refs.includes('SA2SL') && refs.includes('2105.15079'), 'thiếu trích dẫn SA2SL');
  assert.ok(refs.includes('UIT-ViSFD'), 'thiếu nhắc tới UIT-ViSFD');
  assert.ok(refs.includes('Benjamini'), 'thiếu nguồn cho hiệu chỉnh đa kiểm định');
  for (let i = 1; i <= 10; i++) {
    assert.ok(refs.includes(`**[${i}]**`), `thiếu tài liệu số ${i}`);
  }
});

// ==================================================================
console.log('\nNHÓM B — LỖ HỔNG NẶNG');
// ==================================================================

req('B1', 'Thu thập dữ liệu tuân thủ robots.txt, giới hạn tần suất, không sinh dữ liệu giả', () => {
  const scraper = readCode('backend/services/scraper.js');
  assert.ok(scraper.includes('robots.txt'), 'thiếu kiểm tra robots.txt');
  assert.ok(/MIN_INTERVAL_MS|respectRateLimit/.test(scraper), 'thiếu giới hạn tần suất');
  assert.ok(
    !/đóng vai một người đọc|tạo 10 bài đánh giá|sinh dữ liệu giả lập thông minh/.test(scraper),
    'vẫn còn nhánh sinh dữ liệu giả khi bị chặn'
  );
  const scraperRaw = readFile('backend/services/scraper.js');
  assert.ok(scraperRaw.includes('Nghị định 13'), 'thiếu ghi chú tuân thủ Nghị định 13/2023');
  assert.ok(scraperRaw.includes('KHÔNG tự sáng tác'), 'thiếu ràng buộc cấm mô hình bịa đánh giá');
});

req('B3', 'Tầng khuyến nghị là playbook truy vết được, không phải hộp đen', () => {
  const playbook = require('../services/playbook');
  assert.ok(playbook.PLAYBOOK_COUNT >= 10, 'thư viện playbook quá mỏng');
  const rec = playbook.buildRecommendation({
    id: 'x', type: 'SPIKE', category: 'Delivery', cause: 'DamagedInTransit',
    categoryLabel: 'Giao hàng', causeLabel: 'Hư hỏng khi vận chuyển',
    severity: 'Critical', severityScore: 0.8, owner: 'Vận hành',
    statistics: {}, evidenceCount: 10, excludedByTrust: 2, affectedCustomers: 5, evidenceIds: []
  });
  assert.ok(rec.ruleId.startsWith('PB:'), 'khuyến nghị phải truy vết được về quy tắc');
  assert.ok(rec.evidence, 'khuyến nghị phải đính kèm bằng chứng');
});

req('C3', 'Không hành động nào phát sinh chi phí được tự thực thi', () => {
  const playbook = require('../services/playbook');
  for (const [causeKey, pb] of Object.entries(playbook.PLAYBOOKS)) {
    for (const step of [...(pb.baseline || []), ...(pb.escalated || [])]) {
      const kind = playbook.ACTION_KIND[step.kind];
      assert.ok(kind, `${causeKey}: loại hành động không hợp lệ "${step.kind}"`);
      if (kind.cost || kind.touchesCustomer) {
        assert.ok(
          /đề xuất|chờ|phê duyệt|Đề xuất/.test(step.text),
          `${causeKey}: hành động tốn tiền phải ở dạng đề xuất chờ duyệt — "${step.text}"`
        );
      }
    }
  }
  const rec = playbook.buildRecommendation({
    id: 'x', category: 'Delivery', cause: 'DamagedInTransit', severity: 'Critical',
    categoryLabel: 'Giao hàng', causeLabel: 'Hư hỏng', severityScore: 0.9, owner: 'VH',
    statistics: {}, evidenceCount: 1, excludedByTrust: 0, affectedCustomers: 1, evidenceIds: []
  });
  assert.strictEqual(rec.autoExecuted, false, 'autoExecuted phải luôn false');
  assert.strictEqual(rec.status, 'PROPOSED', 'trạng thái mặc định phải là đề xuất');
});

req('B4', 'Có tài liệu kiến trúc mô tả luồng dữ liệu', () => {
  const readme = readFile('README.md');
  assert.ok(readme.includes('DATA TRUST LAYER'), 'README thiếu sơ đồ kiến trúc');
  assert.ok(/T0|T1|T2|T3|T4|T5/.test(readme), 'README thiếu mô tả các tầng');
});

// ==================================================================
console.log('\nNHÓM C — LỖI LOGIC CỤ THỂ');
// ==================================================================

req('C1', 'Hư hỏng khi vận chuyển thuộc nhánh Giao hàng, không thuộc Chất lượng sản phẩm', () => {
  const taxonomy = require('../services/taxonomy');
  assert.ok(taxonomy.TAXONOMY.Delivery.causes.DamagedInTransit, 'phải nằm trong nhánh Delivery');
  assert.strictEqual(
    taxonomy.TAXONOMY.ProductQuality.causes.DamagedInTransit, undefined,
    'KHÔNG được nằm trong nhánh ProductQuality'
  );
});

req('C2', 'Đầu ra ABSA và NER được tách riêng', () => {
  const analyzer = readFile('backend/services/ai_analyzer.js');
  assert.ok(analyzer.includes('entities'), 'thiếu trường thực thể NER');
  assert.ok(/aspects/.test(analyzer), 'thiếu trường khía cạnh ABSA');
  assert.ok(
    /branch|courier/.test(analyzer),
    'NER phải trích được chi nhánh và đơn vị vận chuyển'
  );
});

req('C5', 'Tên sản phẩm nhất quán trong toàn bộ mã nguồn', () => {
  const files = ['README.md', 'index.html', 'backend/server.js', 'src/components/Logo.jsx'];
  for (const f of files) {
    const content = readFile(f);
    assert.ok(
      !/Custom Radar|Customer Complaint/.test(content),
      `${f} còn dùng tên sai lệch`
    );
  }
});

req('C7', 'Tuyên bố phân tích chuỗi thời gian có nội dung tương ứng', () => {
  const stats = require('../services/statistics');
  assert.ok(typeof stats.ewmaControlChart === 'function', 'thiếu biểu đồ kiểm soát EWMA');
  const chart = stats.ewmaControlChart([2, 3, 2, 3, 2, 3, 5, 7, 9, 11, 13, 15]);
  assert.strictEqual(chart.breached, true, 'EWMA phải bắt được dịch chuyển chậm');
});

// ==================================================================
console.log('\nPHẦN 5 — CẢNH BÁO CÓ Ý NGHĨA THỐNG KÊ');
// ==================================================================

req('P5a', 'Thay ngưỡng cố định bằng kiểm định tỉ lệ hai mẫu', () => {
  const stats = require('../services/statistics');
  const t = stats.twoProportionZTest(100, 500, 40, 500);
  assert.ok(t.z > 5 && t.p < 0.001, 'kiểm định z không cho kết quả đúng');
});

req('P5b', 'Điều kiện kép: ý nghĩa thống kê VÀ ý nghĩa nghiệp vụ', () => {
  const stats = require('../services/statistics');
  assert.strictEqual(stats.ALERT_THRESHOLDS.pValue, 0.01, 'ngưỡng p phải là 0.01');
  assert.strictEqual(stats.ALERT_THRESHOLDS.minDeltaPP, 0.5, 'ngưỡng ΔWCR phải là 0.5 điểm phần trăm');
  assert.strictEqual(stats.ALERT_THRESHOLDS.minAffectedCustomers, 20, 'ngưỡng khách ảnh hưởng phải là 20');
  const huge = stats.twoProportionZTest(10300, 1000000, 10000, 1000000);
  assert.strictEqual(stats.passesDualCriteria(huge, 2).passed, false,
    'chênh lệch vô nghĩa về nghiệp vụ vẫn phải bị chặn');
});

req('P5c', 'Có hiệu chỉnh đa kiểm định Benjamini-Hochberg ở mức FDR 0.05', () => {
  const stats = require('../services/statistics');
  assert.strictEqual(stats.ALERT_THRESHOLDS.fdrLevel, 0.05);
  const out = stats.benjaminiHochberg([{ p: 0.001 }, { p: 0.9 }], 0.05);
  assert.strictEqual(out[0].significant, true);
  assert.strictEqual(out[1].significant, false);
});

req('P5d', 'Có phân cấp mức nghiêm trọng kèm kênh thông báo và SLA', () => {
  const stats = require('../services/statistics');
  assert.strictEqual(stats.SEVERITY_BANDS.length, 4, 'phải có 4 mức');
  for (const b of stats.SEVERITY_BANDS) {
    assert.ok(b.channel, `mức ${b.level} thiếu kênh thông báo`);
    assert.ok(b.sla, `mức ${b.level} thiếu SLA`);
  }
});

// ==================================================================
console.log('\nPHẦN 4.8 + PHỤ LỤC — TAXONOMY VÀ TỪ ĐIỂN');
// ==================================================================

req('T1', 'Taxonomy đủ 7 danh mục Level 1', () => {
  const taxonomy = require('../services/taxonomy');
  assert.strictEqual(taxonomy.CATEGORY_KEYS.length, 7, `nhận ${taxonomy.CATEGORY_KEYS.length} danh mục`);
  assert.ok(taxonomy.CAUSE_COUNT >= 26, `chỉ có ${taxonomy.CAUSE_COUNT} nguyên nhân, cần từ 26`);
});

req('T2', 'Từ điển chuẩn hóa tiếng Việt đạt 200-300 mục', () => {
  const n = require('../services/normalizer');
  assert.ok(n.DICTIONARY_SIZE >= 200, `mới có ${n.DICTIONARY_SIZE} mục, mục tiêu 200-300`);
});

req('T3', 'Che thông tin cá nhân ngay ở tiền xử lý', () => {
  const n = require('../services/normalizer');
  const r = n.normalize('liên hệ 0912345678 email a@b.com');
  assert.ok(r.piiMasked, 'không che được PII');
  assert.ok(!r.normalized.includes('0912345678'), 'số điện thoại lọt qua');
});

// ==================================================================
console.log('\nPHẦN 8 + 9 — DEMO VÀ KINH DOANH');
// ==================================================================

req('D1', 'Tài khoản demo in sẵn trên màn hình đăng nhập', () => {
  const login = readFile('src/components/Login.jsx');
  assert.ok(login.includes('DEMO_ACCOUNT'), 'thiếu khai báo tài khoản demo');
  assert.ok(/Tài khoản dùng thử|Điền sẵn/.test(login), 'không hiển thị tài khoản demo cho người xem');
});

req('D2', 'Có màn hình phân tích trực tiếp một câu', () => {
  const api = readFile('backend/routes/api.js');
  assert.ok(api.includes("'/analyze'"), 'thiếu endpoint phân tích trực tiếp');
  assert.ok(exists('src/components/Lab.jsx'), 'thiếu giao diện phòng thí nghiệm');
});

req('D3', 'Có công tắc so sánh bật/tắt Trust Layer', () => {
  const api = readFile('backend/routes/api.js');
  assert.ok(api.includes('/trust/impact'), 'thiếu endpoint so sánh');
  const ui = readFile('src/components/TrustLayer.jsx');
  assert.ok(/Tắt Trust Layer|trustOn/.test(ui), 'giao diện thiếu công tắc');
});

req('B9', 'Bảng giá có số cụ thể và kinh tế đơn vị', () => {
  const business = require('../services/business');
  assert.ok(business.PRICING_TIERS.length >= 4, 'thiếu các gói dịch vụ');
  for (const t of business.PRICING_TIERS) {
    assert.ok(typeof t.priceVnd === 'number', `gói ${t.name} thiếu giá bằng số`);
  }
  for (const t of business.PRICING_TIERS.filter((x) => x.priceVnd > 0)) {
    const u = business.unitEconomics(t.id);
    assert.ok(u.grossMargin > 0, `gói ${t.name} biên lợi nhuận âm`);
    assert.ok(u.ltvCacRatio > 1, `gói ${t.name} LTV/CAC không bền vững`);
  }
  assert.ok(business.BUSINESS_RISKS.length >= 3, 'thiếu phân tích rủi ro kinh doanh');
});

req('B9b', 'Mọi giả định kinh doanh đều ghi rõ căn cứ và độ tin cậy', () => {
  const business = require('../services/business');
  for (const [k, a] of Object.entries(business.COST_ASSUMPTIONS)) {
    assert.ok(a.basis, `giả định ${k} thiếu căn cứ`);
    assert.ok(a.confidence, `giả định ${k} thiếu mức độ tin cậy`);
  }
});

// ==================================================================
console.log('\nTÍNH TOÀN VẸN — KHÔNG ĐƯỢC BỊA SỐ');
// ==================================================================

req('I1', 'Không còn nhãn sinh ngẫu nhiên trong tầng phân tích', () => {
  const analyzer = readCode('backend/services/ai_analyzer.js');
  const randomInLabels = /categories\[Math\.floor\(Math\.random|sentiments\[Math\.floor\(Math\.random|severities\[Math\.floor\(Math\.random/;
  assert.ok(!randomInLabels.test(analyzer), 'vẫn còn sinh nhãn ngẫu nhiên khi mô hình lỗi');
  assert.ok(analyzer.includes('classifyByRulesFallback'), 'thiếu lớp dự phòng theo luật');
});

req('I2', 'Thẻ chỉ số không hiển thị số viết cứng', () => {
  const kpi = readCode('src/components/KPICards.jsx');
  assert.ok(!/NPS Score/.test(kpi), 'vẫn còn NPS viết cứng');
  assert.ok(!/"\+12%"|'\+12%'|"-2\.1%"|'-2\.1%'/.test(kpi), 'vẫn còn mức tăng giảm viết cứng');
});

req('I3', 'Báo cáo PDF không chứa đoạn nhận định bịa sẵn', () => {
  const reports = readCode('src/components/Reports.jsx');
  assert.ok(
    !/Overall sentiment has been highly positive|consistently scoring above industry benchmarks/.test(reports),
    'vẫn còn đoạn nhận định viết cứng trong báo cáo xuất ra'
  );
  assert.ok(!/avgResolutionTime/.test(reports), 'vẫn đọc trường chỉ số không còn tồn tại');
});

req('I4', 'Nguồn dữ liệu không bịa số sản phẩm', () => {
  const ds = readCode('src/components/DataSources.jsx');
  assert.ok(!/Math\.random\(\) \* 50/.test(ds), 'vẫn sinh số sản phẩm ngẫu nhiên');
  assert.ok(!/\|\| 15/.test(ds), 'vẫn bịa số bản ghi khi không có dữ liệu');
});

req('I5', 'Không còn chuỗi kết nối cơ sở dữ liệu nhúng cứng', () => {
  for (const f of ['backend/seed_rich_data.js', 'backend/test-mongo.js']) {
    if (!exists(f)) continue;
    assert.ok(!/mongodb\+srv:\/\/[^<]/.test(readCode(f)), `${f} còn nhúng chuỗi kết nối thật`);
  }
});

req('I6', 'Tệp .env được git bỏ qua đúng cách', () => {
  const gi = readFile('.gitignore');
  assert.ok(gi.includes('.env'), '.gitignore không loại trừ .env');
  // Bản trước ghi dòng này bằng UTF-16 nên git không đọc được
  const buf = fs.readFileSync(path.join(ROOT, '.gitignore'));
  assert.ok(!buf.includes(0x00), '.gitignore chứa byte NUL — nhiều khả năng đang là UTF-16');
});

req('I7', 'Hệ thống khởi động được khi thiếu khóa API', () => {
  const analyzer = readFile('backend/services/ai_analyzer.js');
  assert.ok(/function getGroq|function getGenAI/.test(analyzer), 'client mô hình phải khởi tạo muộn');
  assert.ok(
    !/^const groq = new Groq/m.test(analyzer),
    'vẫn khởi tạo client ngay lúc nạp module, thiếu khóa là sập toàn bộ máy chủ'
  );
});

// ==================================================================
console.log('\n' + '='.repeat(66));
console.log(`ĐỐI CHIẾU YÊU CẦU: ${pass} đạt, ${fail} thiếu`);
if (failures.length) {
  console.log('\nCÁC YÊU CẦU CHƯA ĐẠT:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. [${f.id}] ${f.description}\n     ${f.reason}`));
}
console.log('='.repeat(66));
process.exit(fail > 0 ? 1 : 0);
