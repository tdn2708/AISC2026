/**
 * BỘ CÔNG CỤ TRUY VẤN DỮ LIỆU CHO TRỢ LÝ
 * ==================================================================
 * NGUYÊN TẮC NỀN TẢNG: mô hình ngôn ngữ KHÔNG được dùng làm máy tính.
 *
 * Bản trợ lý cũ đổ hàng trăm dòng JSON vào prompt rồi nhờ mô hình tự
 * đếm, tự tính tỉ lệ, tự so sánh. Mô hình ngôn ngữ làm việc đó không
 * đáng tin: nó đếm sai, cộng sai, và sai một cách TỰ TIN — không có dấu
 * hiệu nào để người đọc biết con số vừa đọc là sai.
 *
 * Ở đây mọi con số được tính bằng JavaScript, trên toàn bộ dữ liệu, với
 * cùng các hàm mà dashboard đang dùng. Mô hình ngôn ngữ chỉ còn một
 * việc: diễn đạt các con số đã tính thành câu trả lời tự nhiên.
 *
 * Hệ quả quan trọng: con số trong câu trả lời của trợ lý LUÔN TRÙNG với
 * con số trên dashboard, vì cả hai gọi cùng một hàm.
 */

const metrics = require('./metrics');
const alertEngine = require('./alert_engine');
const taxonomy = require('./taxonomy');
const playbook = require('./playbook');
const retrieval = require('./retrieval');
const { applyFilters } = require('./analysis_context');

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const num = (n) => new Intl.NumberFormat('vi-VN').format(n);

/**
 * Mỗi công cụ trả về { title, facts, evidence? }
 *   facts    — mảng các dữ kiện ĐÃ TÍNH SẴN, mô hình chỉ việc dùng lại
 *   evidence — trích dẫn phản hồi gốc, kèm id để truy vết
 */
const TOOLS = {
  /** Bức tranh tổng thể: chỉ số chính và chất lượng dữ liệu */
  metrics_overview: {
    description: 'Chỉ số tổng quan: số phản hồi, WCR, tỉ trọng tiêu cực, sức khỏe dữ liệu',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {});
      const cards = metrics.buildMetricCards(items, ctx.transactionCount);
      const valid = items.filter(metrics.isCountable);

      const facts = [
        `Tổng phản hồi thô trong phạm vi đang xét: ${num(items.length)}`,
        `Phản hồi hợp lệ sau Trust Layer: ${num(valid.length)}`,
        `Đã loại: ${num(items.length - valid.length)} phản hồi không đạt ngưỡng tin cậy`,
        `Điểm Sức khỏe Dữ liệu: ${ctx.funnel.dataHealthScore}/100`
      ];

      if (cards.weightedComplaintRate.available) {
        facts.push(
          `Tỉ lệ Khiếu nại có Trọng số (WCR): ${cards.weightedComplaintRate.display}, ` +
          `mẫu số là ${num(cards.weightedComplaintRate.denominator)} giao dịch đối soát được`
        );
      } else {
        facts.push(
          'WCR KHÔNG tính được vì chưa kết nối dữ liệu giao dịch. ' +
          'Phải dùng chỉ số thay thế trong cùng kênh, và phải nói rõ điều này.'
        );
      }

      facts.push(`Tỉ trọng phản hồi tiêu cực: ${cards.shareOfNegative.display} (mẫu số: tổng phản hồi hợp lệ theo trọng số)`);
      facts.push(`Tốc độ tăng phản hồi tiêu cực 7 ngày so với nền 28 ngày: ${cards.negativeVelocity.display}`);

      return { title: 'Chỉ số tổng quan', facts };
    }
  },

  /** Phân bố theo danh mục và nguyên nhân cốt lõi */
  root_causes: {
    description: 'Xếp hạng danh mục và nguyên nhân cốt lõi bị khiếu nại nhiều nhất',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {})
        .filter((f) => metrics.isCountable(f) && metrics.isComplaint(f));

      const byCategory = new Map();
      const byCause = new Map();
      for (const f of items) {
        const cat = f.categoryLabel || taxonomy.categoryLabel(f.category);
        byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
        if (f.causeLabel) byCause.set(`${cat} → ${f.causeLabel}`, (byCause.get(`${cat} → ${f.causeLabel}`) || 0) + 1);
      }

      const total = items.length;
      const topCat = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
      const topCause = [...byCause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

      const facts = [`Tổng khiếu nại hợp lệ trong phạm vi: ${num(total)}`];
      if (total > 0) {
        facts.push('Xếp hạng danh mục: ' + topCat.map(([k, v]) => `${k} ${v} (${pct(v / total)})`).join('; '));
        if (topCause.length) {
          facts.push('Xếp hạng nguyên nhân cốt lõi: ' + topCause.map(([k, v]) => `${k} ${v} (${pct(v / total)})`).join('; '));
        }
        facts.push('Bộ phận chịu trách nhiệm của nhóm đứng đầu: ' +
          (topCat[0] ? taxonomy.categoryOwner(
            taxonomy.CATEGORY_KEYS.find((k) => taxonomy.categoryLabel(k) === topCat[0][0]) || 'Other'
          ) : 'chưa xác định'));
      }

      return { title: 'Nguyên nhân cốt lõi', facts };
    }
  },

  /** Cảnh báo đang mở, kèm bằng chứng thống kê */
  alerts_list: {
    description: 'Các cảnh báo đã vượt kiểm định thống kê, kèm z, p, mức nghiêm trọng, SLA',
    run(ctx, args = {}) {
      /**
       * KHÔNG được lọc theo thời gian trước khi đưa vào động cơ cảnh báo.
       *
       * Cảnh báo hoạt động bằng cách so cửa sổ hiện tại với ĐƯỜNG NỀN 28
       * ngày. Nếu người dùng hỏi "tuần này có vấn đề gì" mà ta lọc dữ
       * liệu còn 7 ngày rồi mới đưa vào, thì đường nền bị xóa sạch và
       * kiểm định không còn gì để so — hệ thống báo "0 tổ hợp được kiểm
       * định" và kết luận không có vấn đề gì. Đó là câu trả lời SAI, và
       * sai một cách im lặng.
       *
       * Cách đúng: giữ nguyên toàn bộ lịch sử, và dịch mốc thời gian
       * người dùng hỏi thành ĐỘ DÀI CỬA SỔ hiện tại.
       */
      const { time, ...scopeFilters } = args.filters || {};
      const items = applyFilters(ctx.items, scopeFilters);

      const windowDays =
        time === 'Today' ? 1 : time === 'This Week' ? 7 : time === 'This Month' ? 30 : undefined;

      const result = alertEngine.detectAlerts(items, {
        transactionCount: ctx.transactionCount,
        windowDays
      });

      const facts = [
        `Số cảnh báo đang mở: ${result.alerts.length}`,
        `Cửa sổ hiện tại ${result.alerts[0] ? result.alerts[0].windowDays : windowDays || 7} ngày, so với đường nền 28 ngày trên toàn bộ lịch sử`,
        `Đã kiểm định ${result.diagnostics.combosTested} tổ hợp, ${result.diagnostics.survivedFdr} vượt qua hiệu chỉnh đa kiểm định Benjamini-Hochberg (FDR ${result.diagnostics.fdrLevel})`
      ];

      for (const a of result.alerts.slice(0, 5)) {
        if (a.type === 'SPIKE') {
          facts.push(
            `[${a.severityVi}] ${a.categoryLabel}${a.causeLabel ? ' → ' + a.causeLabel : ''}` +
            `${a.productName ? ' · ' + a.productName : ''}${a.region ? ' · ' + a.region : ''}: ` +
            `tăng từ ${pct(a.statistics.baselineRate)} lên ${pct(a.statistics.currentRate)}, ` +
            `z = ${a.statistics.z}, ${a.statistics.pValueDisplay}, ` +
            `ước tính ${a.affectedCustomers} khách bị ảnh hưởng, ` +
            `dựa trên ${a.evidenceCount} phản hồi hợp lệ (đã loại ${a.excludedByTrust}), ` +
            `SLA ${a.sla}, phụ trách: ${a.owner}`
          );
        } else {
          facts.push(
            `[${a.severityVi}] Suy giảm kéo dài · ${a.categoryLabel}: ` +
            `EWMA ${a.statistics.ewmaCurrent} vượt giới hạn ${a.statistics.controlLimit} ` +
            `trong ${a.statistics.consecutiveBreaches} chu kỳ liên tiếp, SLA ${a.sla}`
          );
        }
      }

      if (result.alerts.length === 0) {
        facts.push(
          'Không có biến động nào đạt đồng thời ý nghĩa thống kê (p < 0.01) và ý nghĩa nghiệp vụ. ' +
          'Đây là kết quả bình thường, không phải lỗi hệ thống.'
        );
      }

      return { title: 'Cảnh báo có kiểm định', facts };
    }
  },

  /** Khuyến nghị hành động từ playbook */
  recommendations: {
    description: 'Các hành động được đề xuất cho cảnh báo đang mở, kèm yêu cầu phê duyệt',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {});
      const result = alertEngine.detectAlerts(items, { transactionCount: ctx.transactionCount });

      const facts = [];
      for (const a of result.alerts.slice(0, 3)) {
        const rec = playbook.buildRecommendation(a);
        facts.push(
          `Cho "${a.categoryLabel}${a.causeLabel ? ' → ' + a.causeLabel : ''}" (quy tắc ${rec.ruleId}): ` +
          rec.steps.map((s, i) => `(${i + 1}) ${s.text}${s.requiresApproval ? ' [CẦN PHÊ DUYỆT: ' + s.approvalRole + ']' : ''}`).join('; ')
        );
      }
      if (!facts.length) facts.push('Chưa có cảnh báo nào đang mở nên chưa có khuyến nghị.');

      facts.push(
        'NGUYÊN TẮC BẮT BUỘC NHẮC LẠI: hệ thống không tự thực thi bất kỳ hành động nào ' +
        'phát sinh chi phí hoặc tác động tới khách hàng cuối. Mọi hành động đều là đề xuất chờ duyệt.'
      );

      return { title: 'Khuyến nghị hành động', facts };
    }
  },

  /** Chất lượng dữ liệu đầu vào */
  trust_health: {
    description: 'Phễu Trust Layer, điểm sức khỏe dữ liệu, cụm đánh giá nghi vấn',
    run(ctx) {
      const f = ctx.funnel;
      const facts = [
        `Phễu dữ liệu: ${num(f.rawCollected)} thô → loại ${num(f.spamRemoved.count)} rác (${f.spamRemoved.pct}%) → gắn cờ ${num(f.inauthenticFlagged.count)} nghi ngờ không xác thực (${f.inauthenticFlagged.pct}%) → chờ kiểm duyệt ${num(f.pendingReview.count)} → còn ${num(f.validForAnalysis)} hợp lệ`,
        `Điểm Sức khỏe Dữ liệu: ${f.dataHealthScore}/100 (qua lọc ${f.components.passRate}%, phủ kênh ${f.components.channelCoverage}%, độ tươi ${f.components.freshness}%, đối soát giao dịch ${f.components.reconciliation}%)`,
        `Số cụm trùng lặp gần bị phát hiện: ${ctx.clusters.length}`,
        `Số đợt đột biến thời gian: ${ctx.bursts.length}`
      ];

      for (const c of ctx.clusters.slice(0, 3)) {
        facts.push(
          `Cụm nghi vấn: ${c.size} đánh giá gần như giống hệt nhau, đăng trong ${c.spanMinutes} phút, ` +
          `độ tương đồng ${(c.avgSimilarity * 100).toFixed(0)}%, sản phẩm ${c.productName}`
        );
      }

      return { title: 'Chất lượng dữ liệu đầu vào', facts };
    }
  },

  /** Phân bố theo kênh thu thập */
  channel_breakdown: {
    description: 'So sánh các kênh: số lượng, tỉ lệ tiêu cực, mức tin cậy',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {}).filter(metrics.isCountable);
      const byChannel = new Map();

      for (const f of items) {
        const ch = f.source || 'Khác';
        if (!byChannel.has(ch)) byChannel.set(ch, { total: 0, negative: 0, weight: 0 });
        const e = byChannel.get(ch);
        e.total += 1;
        e.weight += f.trust.weight;
        if (metrics.isComplaint(f)) e.negative += 1;
      }

      const facts = [...byChannel.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([ch, e]) =>
          `${ch}: ${num(e.total)} phản hồi hợp lệ, ${pct(e.negative / e.total)} tiêu cực, ` +
          `trọng số tin cậy trung bình ${(e.weight / e.total).toFixed(2)}`
        );

      if (!facts.length) facts.push('Không có dữ liệu kênh nào trong phạm vi đang xét.');
      return { title: 'Phân bố theo kênh', facts };
    }
  },

  /** Diễn biến theo thời gian */
  time_trend: {
    description: 'Chuỗi thời gian số khiếu nại và phản hồi tích cực',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {});
      const series = metrics.weightedTimeSeries(items, 14, new Date(), args.spanDays || 28);

      const nonEmpty = series.filter((s) => s.total > 0);
      if (!nonEmpty.length) return { title: 'Diễn biến theo thời gian', facts: ['Không có dữ liệu trong khoảng thời gian này.'] };

      const first = nonEmpty.slice(0, Math.ceil(nonEmpty.length / 2));
      const second = nonEmpty.slice(Math.ceil(nonEmpty.length / 2));
      const avg = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / Math.max(1, arr.length);

      const facts = [
        `Chuỗi ${series.length} mốc trong ${args.spanDays || 28} ngày gần nhất.`,
        `Khiếu nại trung bình mỗi mốc: nửa đầu ${avg(first, 'complaints').toFixed(1)} → nửa sau ${avg(second, 'complaints').toFixed(1)}`,
        `Mốc gần nhất: ${nonEmpty[nonEmpty.length - 1].name} — ${nonEmpty[nonEmpty.length - 1].complaints} khiếu nại / ${nonEmpty[nonEmpty.length - 1].total} phản hồi hợp lệ`,
        'Chi tiết từng mốc: ' + nonEmpty.map((s) => `${s.name}:${s.complaints}`).join(' ')
      ];

      return { title: 'Diễn biến theo thời gian', facts };
    }
  },

  /** Phân khúc khách hàng */
  segments: {
    description: 'Phân khúc khách hàng: nhóm có nguy cơ rời bỏ, nhóm ủng hộ',
    run(ctx, args = {}) {
      const items = applyFilters(ctx.items, args.filters || {}).filter(metrics.isCountable);
      const byAuthor = new Map();
      for (const f of items) {
        const a = f.author || 'Ẩn danh';
        if (!byAuthor.has(a)) byAuthor.set(a, { total: 0, negative: 0 });
        const e = byAuthor.get(a);
        e.total += 1;
        if (metrics.isComplaint(f)) e.negative += 1;
      }

      const all = [...byAuthor.entries()];
      const atRisk = all.filter(([, e]) => e.negative > 0);
      const repeat = all.filter(([, e]) => e.negative >= 2);

      return {
        title: 'Phân khúc khách hàng',
        facts: [
          `Tổng số khách hàng có phản hồi: ${num(all.length)}`,
          `Nhóm có nguy cơ (ít nhất một phản hồi tiêu cực): ${num(atRisk.length)} (${pct(atRisk.length / Math.max(1, all.length))})`,
          `Khách hàng khiếu nại lặp lại từ 2 lần trở lên: ${num(repeat.length)} — đây là nhóm cần ưu tiên liên hệ`,
          repeat.length
            ? 'Một số khách khiếu nại nhiều lần: ' + repeat.slice(0, 5).map(([a, e]) => `${a} (${e.negative} lần)`).join(', ')
            : 'Không có khách hàng nào khiếu nại lặp lại.'
        ]
      };
    }
  },

  /** Kết quả đo được của mô hình */
  evaluation_results: {
    description: 'Kết quả thực nghiệm: F1 các baseline, chỉ số Trust Layer, ablation',
    run() {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(__dirname, '..', 'evaluation', 'results.json');
      if (!fs.existsSync(file)) {
        return { title: 'Kết quả thực nghiệm', facts: ['Chưa chạy đánh giá. Cần chạy lệnh `npm run eval`.'] };
      }

      const r = JSON.parse(fs.readFileSync(file, 'utf8'));
      const facts = [
        `Tập đánh giá: ${r.dataset.aspectSamples} câu do nhóm tự gán nhãn, CHƯA phải UIT-ViSFD, mới có ${r.dataset.annotators} người gán nên chưa tính được Cohen's kappa.`
      ];

      for (const m of r.models) {
        if (!m.available) {
          facts.push(`${m.id} (${m.name}): chưa có số — ${m.reason}`);
        } else if (m.canDetectAspect) {
          facts.push(`${m.id} (${m.name}): Macro-F1 trên tập kiểm tra giữ riêng = ${m.categoryMacroF1}, trên tập phát triển = ${m.devCategoryMacroF1}`);
        } else {
          facts.push(`${m.id} (${m.name}): không bóc tách được khía cạnh, chỉ chấm cảm xúc toàn câu`);
        }
      }

      const b1 = r.models.find((m) => m.id === 'B1');
      if (b1 && b1.devCategoryMacroF1 != null) {
        facts.push(
          `PHÁT HIỆN QUAN TRỌNG: bộ phân loại luật đạt ${b1.devCategoryMacroF1} trên tập đã tinh chỉnh ` +
          `nhưng chỉ ${b1.categoryMacroF1} trên tập chưa từng thấy. Khoảng cách này chứng minh ` +
          `phương pháp từ khóa không khái quát hóa được, và đó là lý do cần mô hình tinh chỉnh.`
        );
      }

      if (r.trustLayer) {
        facts.push(
          `Trust Layer: precision lọc rác ${r.trustLayer.report.perClass.spam.precision}, ` +
          `precision phát hiện không xác thực ${r.trustLayer.report.perClass.inauthentic.precision}, ` +
          `tỉ lệ loại nhầm phản hồi thật ${(r.trustLayer.falseRejectRate * 100).toFixed(1)}%`
        );
      }

      return { title: 'Kết quả thực nghiệm', facts };
    }
  },

  /** Mô hình kinh doanh */
  business_model: {
    description: 'Bảng giá, kinh tế đơn vị, chi phí kiến trúc',
    run() {
      const business = require('./business');
      const facts = business.PRICING_TIERS.map(
        (t) => `Gói ${t.name}: ${t.priceDisplay}, giới hạn ${t.feedbackLimit ? num(t.feedbackLimit) + ' phản hồi' : 'không giới hạn'} — ${t.purpose}`
      );

      for (const t of business.PRICING_TIERS.filter((x) => x.priceVnd > 0)) {
        const u = business.unitEconomics(t.id);
        facts.push(`Kinh tế đơn vị gói ${t.name}: biên lợi nhuận gộp ${u.grossMarginDisplay}, LTV/CAC ${u.ltvCacRatio}, hoàn vốn ${u.paybackMonths} tháng`);
      }

      const arch = business.compareArchitectureCost(30000);
      facts.push(
        `So sánh chi phí ở 30.000 phản hồi/tháng: gọi mô hình cho từng phản hồi tốn ${num(arch.naive.costVnd)}đ, ` +
        `kiến trúc chỉ gọi ở tầng tổng hợp tốn ${num(arch.chosen.costVnd)}đ — chênh ${arch.ratio} lần.`
      );
      facts.push(
        `LƯU Ý TRUNG THỰC: thuyết minh từng ghi lợi thế này là "ba bậc độ lớn" (~1000 lần). ` +
        `Mô hình chi phí cho ra ${arch.ratio} lần, không phải 1000 lần. Con số trong thuyết minh cần sửa.`
      );

      return { title: 'Mô hình kinh doanh', facts };
    }
  },

  /** Cây nhãn phân loại */
  taxonomy_info: {
    description: 'Taxonomy nhãn: danh mục, nguyên nhân cốt lõi, bộ phận phụ trách',
    run() {
      const flat = taxonomy.flatTaxonomy();
      return {
        title: 'Taxonomy nhãn',
        facts: [
          `Hệ thống dùng ${flat.length} danh mục chính và ${taxonomy.CAUSE_COUNT} nguyên nhân cốt lõi.`,
          ...flat.map((c) => `${c.label} (phụ trách: ${c.owner}): ${c.causes.map((x) => x.label).join(', ')}`),
          'Nguyên tắc phân nhánh: theo bộ phận có thể hành động để khắc phục, không theo đối tượng được nhắc tới trong câu. Vì vậy hư hỏng khi vận chuyển thuộc nhánh Giao hàng, không thuộc Chất lượng sản phẩm.'
        ]
      };
    }
  },

  /** Trích dẫn phản hồi thật liên quan tới câu hỏi */
  search_feedbacks: {
    description: 'Tìm các phản hồi cụ thể liên quan tới câu hỏi, dùng làm dẫn chứng',
    run(ctx, args = {}) {
      const query = args.query || '';
      const items = applyFilters(ctx.items, args.filters || {});
      const index = retrieval.buildIndex(items.filter(metrics.isCountable));
      const hits = retrieval.search(query, index, { limit: args.limit || 12 });

      if (!hits.length) {
        return {
          title: 'Dẫn chứng',
          facts: ['Không tìm thấy phản hồi nào khớp với chủ đề được hỏi.'],
          evidence: []
        };
      }

      return {
        title: 'Dẫn chứng',
        facts: [`Tìm được ${hits.length} phản hồi liên quan nhất tới câu hỏi (xếp hạng BM25).`],
        evidence: hits.map((h) => ({
          id: String(h.item._id),
          text: h.item.originalText,
          category: h.item.categoryLabel || null,
          cause: h.item.causeLabel || null,
          sentiment: h.item.sentiment,
          source: h.item.source,
          product: h.item.productName,
          date: h.item.timestamp,
          trustTier: h.item.trust ? h.item.trust.tier : null,
          relevance: Number(h.score.toFixed(2))
        }))
      };
    }
  }
};

module.exports = { TOOLS, pct, num };
