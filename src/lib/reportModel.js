/**
 * MÔ HÌNH NỘI DUNG CỦA BÁO CÁO PDF
 * ==================================================================
 * Hàm thuần: nhận dữ liệu thô từ các API (/stats, /trend, /categories,
 * /recommendations, /root-causes, /trust/health) và bộ lọc, trả về đúng
 * những câu, con số, hàng bảng sẽ in ra. Phần dựng trang
 * (components/report/ReportDocument.jsx) chỉ việc xếp chúng lên giấy.
 *
 * Nguyên tắc: không có câu nào viết sẵn mà không dựa trên số liệu. Thiếu
 * dữ liệu thì nói là thiếu, không làm tròn thành một nhận định đẹp.
 */
import { fmtInt, buildTakeaways, buildPareto, findPeak } from '../components/report_kit';

const TIME_LABEL = {
  All: 'Toàn bộ thời gian',
  Today: 'Hôm nay',
  'This Week': '7 ngày gần nhất',
  'This Month': '30 ngày gần nhất'
};

const SOURCE_LABEL = { All: 'Tất cả các kênh', CSKH: 'Tổng đài CSKH' };

const SEVERITY = {
  Critical: { label: 'Nghiêm trọng', rank: 0, tone: 'bad' },
  High: { label: 'Cao', rank: 1, tone: 'bad' },
  Medium: { label: 'Trung bình', rank: 2, tone: 'warn' },
  Low: { label: 'Thấp', rank: 3, tone: 'muted' }
};

const MIN_COMPARE_SAMPLE = 30;

const dayVi = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Phần trăm kiểu Việt; tỉ lệ nhỏ giữ 2 chữ số để 0,04% không thành "0,0%" */
export function pctVi(x, digits) {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = x * 100;
  const d = digits ?? (Math.abs(v) < 1 ? 2 : 1);
  return `${v.toFixed(d).replace('.', ',')}%`;
}

export function periodLabel(time) {
  if (time && time.startsWith('Custom:')) {
    const [, s, e] = time.split(':');
    return `${dayVi(s)} đến ${dayVi(e)}`;
  }
  return TIME_LABEL[time] || TIME_LABEL.All;
}

/**
 * Thay đổi so với kỳ trước, bằng chữ chứ không bằng mũi tên.
 * Màu suy ra từ chiều tốt của chỉ số (khiếu nại giảm mới là tốt).
 */
export function deltaWords(delta, minSample = Infinity) {
  if (!delta || delta.rel == null || !Number.isFinite(delta.rel)) return { text: 'Chưa so được', tone: 'muted' };
  // Kỳ nào dưới 30 phản hồi thì phần trăm thay đổi vô nghĩa (1 lên 6 là "tăng 500%")
  if (minSample < MIN_COMPARE_SAMPLE) return { text: 'Mẫu nhỏ, chưa so', tone: 'muted' };
  const p = delta.rel * 100;
  if (Math.abs(p) < 0.5) return { text: 'Gần như không đổi', tone: 'muted' };
  const up = p > 0;
  const good = delta.lowerIsBetter ? !up : up;
  return { text: `${up ? 'Tăng' : 'Giảm'} ${Math.abs(p).toFixed(1).replace('.', ',')}%`, tone: good ? 'good' : 'bad' };
}

/** Sổ đối chiếu: thu thập trừ các phần bị loại phải đúng bằng số được tính */
export function buildLedger(health) {
  if (!health) return null;
  const raw = health.rawCollected ?? 0;
  const counted = health.countedForMetrics ?? health.validForAnalysis ?? 0;
  // health.ledger (máy chủ mới) tách phản hồi chờ duyệt còn trọng số, được tính tạm
  const L = health.ledger;
  const aged = L ? L.aged : Math.max(0, (health.validForAnalysis ?? counted) - counted);
  const rows = [
    { label: 'Rác, quảng cáo', value: health.spamRemoved?.count ?? 0 },
    { label: 'Nghi đánh giá ảo', value: health.inauthenticFlagged?.count ?? 0 },
    { label: L?.pendingCounted ? 'Chờ duyệt, chưa tính' : 'Chờ người duyệt', value: L ? L.pendingNotCounted : (health.pendingReview?.count ?? 0) },
    { label: 'Quá cũ, hết trọng số', value: aged }
  ];
  const removed = rows.reduce((s, r) => s + r.value, 0);
  return { raw, rows, removed, counted, diff: raw - removed - counted, pendingCounted: L?.pendingCounted ?? 0 };
}

export function buildReportModel({ data, filters = {}, workspaceLabel, generatedAt = new Date() }) {
  const stats = data?.stats || {};
  const trend = Array.isArray(data?.trend) ? data.trend : [];
  const recs = data?.recommendations || [];
  const causes = data?.rootCauses || [];
  const health = data?.health || null;
  const cmp = stats.comparison || null;
  const wcr = stats.weightedComplaintRate || {};
  const neg = stats.shareOfNegative || {};
  const tf = stats.totalFeedbacks || {};
  const evAll = stats.evidence?.all || null;
  const minSample = cmp ? Math.min(cmp.current?.valid ?? 0, cmp.previous?.valid ?? 0) : 0;

  // ---------- Thông tin chung ----------
  // Không suy khoảng ngày từ biểu đồ xu hướng (14 ô x 2 ngày, chỉ là 28 ngày gần nhất, không phải ngày đầu/cuối của dữ liệu trong bộ lọc).
  // Chờ backend trả minTs/maxTs trong /stats thì điền ở đây; trong lúc đó bìa chỉ ghi kỳ lọc và ngày lập.
  const range = null;
  const meta = {
    title: 'Báo cáo phản hồi khách hàng',
    period: periodLabel(filters.time),
    range,
    workspace: workspaceLabel || 'Mô phỏng',
    source: SOURCE_LABEL[filters.source] || filters.source || SOURCE_LABEL.All,
    product: !filters.product || filters.product === 'All' ? 'Tất cả sản phẩm' : filters.product,
    generatedAt: `${dayVi(generatedAt)}, ${new Date(generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
    simulated: /mô phỏng/i.test(workspaceLabel || '')
  };

  // ---------- Chỉ số chính ----------
  const kpis = [
    {
      label: 'Phản hồi được tính vào chỉ số',
      value: fmtInt(tf.valid),
      note: `trên ${fmtInt(tf.value)} phản hồi thu thập được`,
      cur: cmp ? fmtInt(cmp.current?.valid) : '—',
      prev: cmp ? fmtInt(cmp.previous?.valid) : '—',
      delta: deltaWords(cmp?.deltas?.valid, minSample)
    },
    {
      label: 'Tỉ lệ khiếu nại có trọng số',
      value: wcr.available ? wcr.display : 'Chưa tính được',
      note: wcr.available ? `mẫu số ${fmtInt(wcr.denominator)} giao dịch có chứng từ` : 'chưa có dữ liệu giao dịch làm mẫu số',
      cur: cmp && wcr.available ? pctVi(cmp.current?.wcr) : '—',
      prev: cmp && wcr.available ? pctVi(cmp.previous?.wcr) : '—',
      delta: wcr.available ? deltaWords(cmp?.deltas?.wcr, minSample) : { text: 'Chưa so được', tone: 'muted' },
      approx: Boolean(cmp?.approximation && wcr.available)
    },
    {
      label: 'Tỉ trọng phản hồi tiêu cực',
      value: neg.available ? neg.display : '—',
      note: 'tính theo trọng số tin cậy',
      cur: cmp ? pctVi(cmp.current?.shareOfNegative) : '—',
      prev: cmp ? pctVi(cmp.previous?.shareOfNegative) : '—',
      delta: deltaWords(cmp?.deltas?.shareOfNegative, minSample)
    },
    {
      label: 'Độ tin số liệu',
      value: stats.dataHealthScore != null ? `${stats.dataHealthScore} trên 100` : '—',
      note: 'tính trên toàn kho, không theo kỳ',
      cur: '—',
      prev: '—',
      delta: { text: 'Không áp dụng', tone: 'muted' }
    }
  ];

  // ---------- Cơ cấu theo nhóm vấn đề ----------
  const pareto = buildPareto(data?.categories || []);
  const categories = pareto.data.map((d, i) => ({
    rank: i + 1,
    name: d.name,
    value: d.value,
    share: d.share / 100,
    cumulative: d.cumulative / 100,
    vital: i < pareto.vitalFew
  }));
  const issueTotal = pareto.data.length ? pareto.total : 0;
  const noIssue = pareto.unclassified?.value ?? 0;


  // ---------- Nguyên nhân ----------
  const causeRows = causes.slice(0, 10).map((c, i) => ({
    rank: i + 1,
    cause: c.causeLabel || c.cause,
    category: c.categoryLabel || '—',
    count: c.count,
    share: (c.share ?? 0) / 100
  }));

  // ---------- Việc cần quyết ----------
  const takeaways = buildTakeaways(recs, 4).map((t, i) => {
    const r = recs[i] || {};
    const sev = SEVERITY[t.severity] || SEVERITY.Medium;
    return {
      no: i + 1,
      problem: t.problem || 'Vấn đề chưa đặt tên',
      scope: t.scope || 'Toàn bộ sản phẩm và khu vực',
      severity: sev.label,
      tone: sev.tone,
      summary: r.summary || null,
      impact: t.impact.length ? t.impact.join('; ') : 'Chưa đo được mức ảnh hưởng bằng tiền hay số khách',
      action: t.action || 'Chưa có hành động trong thư viện cho tình huống này',
      approval: t.approval,
      owner: t.owner || '—',
      sla: t.sla || '—',
      evidence: t.evidence
    };
  });
  const moreActions = Math.max(0, recs.length - takeaways.length);

  // ---------- Độ tin cậy ----------
  const ledger = buildLedger(health);
  const verifiedShare = evAll?.total ? (evAll.verified + evAll.human) / evAll.total : null;
  const tiers = (health?.tierBreakdown || []).map((t) => ({
    tier: t.tier, label: t.label, weight: String(t.weight).replace('.', ','), reconciliation: t.reconciliation, count: t.count
  }));
  const labels = evAll?.labels || {};
  const labelRows = [
    { label: 'Nhãn sinh kèm dữ liệu mô phỏng', value: labels.synthetic ?? 0 },
    { label: 'Người duyệt', value: labels.human ?? 0 },
    { label: 'Mô hình ngôn ngữ gán', value: labels.llm ?? 0 },
    { label: 'Mô hình ViSoBERT', value: labels.visobert ?? labels.model ?? 0 },
    { label: 'Luật từ khóa', value: labels.rules ?? 0 }
  ].filter((r) => r.value > 0);
  const components = health?.components ? [
    { label: 'Tỉ lệ qua bộ lọc', value: `${String(health.components.passRate).replace('.', ',')}%` },
    { label: 'Độ phủ kênh', value: `${health.components.channelCoverage}%` },
    { label: 'Độ mới của dữ liệu', value: `${health.components.freshness}%` },
    { label: 'Tỉ lệ đối soát được', value: `${health.components.reconciliation}%` }
  ] : [];

  // ---------- Tóm tắt điều hành: chỉ những câu số liệu chống lưng được ----------
  // Mỗi ý mở bằng một cụm chữ đậm (lead), như báo cáo tư vấn, thay cho số thứ tự
  const findings = [];
  if (tf.value) {
    findings.push({
      lead: 'Dữ liệu.',
      text: `${fmtInt(tf.valid)} trên ${fmtInt(tf.value)} phản hồi thu thập được (${pctVi(tf.valid / tf.value, 1)}) đủ tin cậy để đưa vào chỉ số` +
        (verifiedShare != null ? `; ${pctVi(verifiedShare, 0)} trong số đó có chứng từ mua hàng hoặc đã được người duyệt.` : '.')
    });
  }
  if (wcr.available) {
    const d = deltaWords(cmp?.deltas?.wcr, minSample);
    findings.push({
      lead: 'Khiếu nại.',
      text: `Tỉ lệ khiếu nại có trọng số là ${wcr.display}, tính trên ${fmtInt(wcr.denominator)} giao dịch có chứng từ` +
        (d.tone !== 'muted' ? `; ${cmp.label.toLowerCase()}, tỉ lệ này ${d.text.toLowerCase()}.` : '.')
    });
  } else if (neg.available) {
    findings.push({ lead: 'Khiếu nại.', text: `Phản hồi tiêu cực chiếm ${neg.display} tổng phản hồi hợp lệ, tính theo trọng số tin cậy. Chưa có dữ liệu giao dịch để tính tỉ lệ khiếu nại.` });
  }
  if (categories.length) {
    const top = categories[0];
    const c0 = causeRows[0];
    findings.push({
      lead: 'Vấn đề lớn nhất.',
      text: `${top.name} với ${fmtInt(top.value)} phản hồi (${pctVi(top.share, 1)} số phản hồi có nêu vấn đề)` +
        (c0 ? `; nguyên nhân cụ thể gặp nhiều nhất là ${c0.cause.toLowerCase()} (${fmtInt(c0.count)} phản hồi).` : '.')
    });
  }
  const worst = takeaways.length
    ? [...takeaways].sort((x, y) => (SEVERITY[x.severity]?.rank ?? 9) - (SEVERITY[y.severity]?.rank ?? 9))[0]
    : null;
  findings.push(worst
    ? {
      lead: 'Cần quyết.',
      text: `${recs.length} việc; việc đứng đầu là ${worst.problem.toLowerCase()}, mức ${worst.severity.toLowerCase()}` +
        (worst.sla !== '—' ? `, cần xử lý trong ${worst.sla}.` : '.')
    }
    : { lead: 'Cần quyết.', text: 'Không có biến động nào vượt đồng thời ngưỡng thống kê và ngưỡng nghiệp vụ trong kỳ này.' });

  // ---------- Tiêu đề kết luận cho từng phần (action title) ----------
  const cap1 = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const series = trend.map((d) => ({ name: d.name, complaints: d.complaints ?? 0, satisfaction: d.satisfaction ?? 0 }));
  const lastPoint = series[series.length - 1];
  const avgComplaints = series.length ? series.reduce((sum, d) => sum + d.complaints, 0) / series.length : 0;
  const peak = findPeak(trend);
  const titles = {
    trend: !series.length
      ? 'Chưa có dữ liệu theo thời gian trong phạm vi lọc'
      : peak
        ? `Khiếu nại lên đỉnh ${fmtInt(peak.value)} ngày ${peak.name}, mốc gần nhất còn ${fmtInt(lastPoint.complaints)}`
        : `Khiếu nại dao động quanh ${fmtInt(avgComplaints)} mỗi mốc, mốc gần nhất là ${fmtInt(lastPoint.complaints)}`,
    categories: categories.length >= 2
      ? `${categories[0].name} và ${categories[1].name.toLowerCase()} chiếm ${pctVi(categories[1].cumulative, 1)} số khiếu nại có nêu vấn đề`
      : categories.length
        ? `${categories[0].name} chiếm ${pctVi(categories[0].share, 1)} số khiếu nại có nêu vấn đề`
        : 'Chưa có khiếu nại nào gắn nhóm vấn đề',
    causes: causeRows.length
      ? `${cap1(causeRows[0].cause)} là nguyên nhân gặp nhiều nhất, ${pctVi(causeRows[0].share, 1)} số khiếu nại`
      : 'Chưa bóc tách được nguyên nhân nào',
    actions: worst
      ? `${recs.length} việc cần quyết trong kỳ, việc gấp nhất cần xử lý trong ${worst.sla}`
      : 'Không có việc nào cần quyết trong kỳ này'
  };

  return {
    meta,
    findings,
    kpis,
    comparisonLabel: cmp?.label || null,
    // Độ dài kỳ so sánh theo nhịp của kho (/stats cadence): kho dày 7 ngày, kho thưa dài hơn
    windowLabel: stats.cadence?.windowLabel || '7 ngày',
    approximation: cmp?.approximation || null,
    titles,
    trend: { series, peak, peakLabel: recs[0]?.alert?.causeLabel || recs[0]?.alert?.categoryLabel || null },
    categories,
    issueTotal,
    noIssue,
    vitalFew: pareto.vitalFew,
    causes: causeRows,
    causeTotal: data?.rootTotal ?? 0,
    takeaways,
    moreActions,
    ledger,
    verifiedShare,
    evidence: evAll,
    tiers,
    labelRows,
    components,
    healthScore: stats.dataHealthScore ?? null
  };
}
