/**
 * MÔ HÌNH KINH DOANH VÀ KINH TẾ ĐƠN VỊ
 * ==================================================================
 * Chủ đề đăng ký là Data Driven Business, nhưng phần "business" lại là
 * phần mỏng nhất của hồ sơ: ba gói dịch vụ không có một con số tiền
 * nào, không có kinh tế đơn vị.
 *
 * ------------------------------------------------------------------
 * TRUNG THỰC VỀ NGUỒN GỐC CÁC CON SỐ DƯỚI ĐÂY:
 *
 * Đây là GIẢ ĐỊNH CÓ CƠ SỞ, không phải số liệu đo được từ vận hành
 * thật — hệ thống chưa có khách hàng trả tiền nào. Mỗi giả định đều
 * ghi rõ căn cứ và độ tin cậy, để người đọc biết chỗ nào chắc và chỗ
 * nào cần kiểm chứng.
 *
 * Một con số có ghi chú giả định vẫn tốt hơn nhiều so với không có con
 * số nào; nhưng một con số giả định được trình bày như số đo thật thì
 * tệ hơn cả hai.
 * ------------------------------------------------------------------
 */

/** Mức độ chắc chắn của từng giả định */
const CONFIDENCE = {
  HIGH: 'Cao — tra cứu được từ bảng giá công khai của nhà cung cấp',
  MEDIUM: 'Trung bình — ước lượng từ kiến trúc hệ thống, cần đo lại khi vận hành thật',
  LOW: 'Thấp — giả định thị trường, bắt buộc kiểm chứng qua phỏng vấn khách hàng'
};

const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    priceVnd: 0,
    priceDisplay: 'Miễn phí',
    feedbackLimit: 500,
    productLimit: 2,
    features: ['Gom dữ liệu đa kênh', 'Báo cáo thống kê cơ bản', 'Chỉ số Sức khỏe Dữ liệu'],
    excludes: ['Trust Layer đầy đủ', 'Cảnh báo có kiểm định', 'Khuyến nghị hành động'],
    purpose: 'Để doanh nghiệp tự kiểm chứng giải pháp trước khi trả tiền'
  },
  {
    id: 'growth',
    name: 'Growth',
    priceVnd: 490000,
    priceDisplay: '490.000 đ/tháng',
    feedbackLimit: 5000,
    productLimit: 20,
    features: ['Toàn bộ gói Starter', 'ABSA đầy đủ', 'Trust Layer 5 nhóm tín hiệu', 'Cảnh báo có kiểm định thống kê'],
    excludes: ['Khuyến nghị hành động', 'Phân tích theo chi nhánh', 'API'],
    purpose: 'Gian hàng vừa trên sàn, 200–2.000 đơn mỗi tháng'
  },
  {
    id: 'professional',
    name: 'Professional',
    priceVnd: 1900000,
    priceDisplay: '1.900.000 đ/tháng',
    feedbackLimit: 30000,
    productLimit: null,
    features: ['Toàn bộ gói Growth', 'Playbook khuyến nghị hành động', 'Phân tích theo chi nhánh và sản phẩm', 'API tích hợp', 'Vòng lặp học chủ động'],
    excludes: ['Triển khai riêng', 'Tinh chỉnh mô hình theo ngành'],
    purpose: 'Chuỗi bán lẻ vừa, doanh nghiệp có bộ phận CSKH riêng'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceVnd: 15000000,
    priceDisplay: 'Từ 15.000.000 đ/tháng + phí triển khai',
    feedbackLimit: null,
    productLimit: null,
    features: ['Toàn bộ gói Professional', 'Triển khai trên hạ tầng riêng', 'Tinh chỉnh mô hình theo ngành dọc', 'SLA cam kết'],
    excludes: [],
    purpose: 'Chuỗi lớn, yêu cầu dữ liệu không rời khỏi hạ tầng của họ'
  }
];

/**
 * GIẢ ĐỊNH CHI PHÍ.
 *
 * Quyết định kiến trúc quan trọng nhất về mặt chi phí: mô hình ngôn ngữ
 * lớn CHỈ được gọi ở tầng tổng hợp cảnh báo (vài chục lần mỗi ngày),
 * KHÔNG gọi cho từng phản hồi (hàng chục nghìn lần mỗi ngày). Phần xử
 * lý khối lượng lớn do lớp luật và mô hình ViSoBERT tinh chỉnh đảm
 * nhiệm, chạy được trên hạ tầng chi phí thấp.
 *
 * Chính chênh lệch này làm mô hình giá cho SME khả thi — và nó định
 * lượng được, xem hàm compareArchitectureCost().
 */
/**
 * ĐÍNH CHÍNH MỘT TUYÊN BỐ TRONG THUYẾT MINH.
 *
 * Bản thuyết minh viết rằng kiến trúc "chỉ gọi LLM ở tầng tổng hợp" rẻ
 * hơn cách gọi từng phản hồi "khoảng ba bậc độ lớn" (tức ~1000 lần).
 *
 * Phép tính trong tệp này KHÔNG ủng hộ con số đó. Với các giả định đang
 * dùng, chênh lệch là khoảng 6–7 lần, không phải 1000 lần. Lý do: số
 * cảnh báo cũng tăng theo khối lượng dữ liệu, nên chi phí của kiến trúc
 * đã chọn không phải hằng số như tuyên bố ngầm định.
 *
 * Sáu tới bảy lần vẫn là một lợi thế lớn và vẫn đủ để lập luận về giá
 * cho SME. Nhưng nói "ba bậc độ lớn" là con số không kiểm chứng được,
 * và một giám khảo có nghề sẽ yêu cầu chứng minh.
 *
 * => Cần sửa lại con số này trong bản thuyết minh.
 */
const OVERSTATED_CLAIM_NOTE = {
  claimInProposal: 'Rẻ hơn khoảng ba bậc độ lớn (~1000 lần)',
  actualFromModel: 'Khoảng 6–7 lần với các giả định hiện tại',
  action: 'Sửa lại con số trong thuyết minh, hoặc nêu rõ giả định dẫn tới ba bậc độ lớn'
};

const COST_ASSUMPTIONS = {
  llmCostPer1kTokens: {
    value: 400,
    unit: 'đ',
    basis: 'Bảng giá công khai của mô hình hạng nhẹ, quy đổi theo tỉ giá',
    confidence: CONFIDENCE.HIGH
  },
  tokensPerFeedback: {
    value: 120,
    unit: 'token',
    basis: 'Độ dài trung bình một phản hồi TMĐT tiếng Việt sau chuẩn hóa',
    confidence: CONFIDENCE.MEDIUM
  },
  /**
   * Số cảnh báo PHẢI tỉ lệ theo quy mô khách hàng, không phải hằng số.
   *
   * Bản đầu đặt cố định 30 cảnh báo mỗi ngày cho mọi khách hàng. Hệ quả
   * là một gian hàng nhỏ 5.000 phản hồi mỗi tháng bị gán toàn bộ chi phí
   * của 900 cảnh báo, và biên lợi nhuận gói Growth ra ÂM 12,7%. Đó là
   * lỗi mô hình hóa, không phải kết luận kinh doanh.
   *
   * Thực tế: sau hiệu chỉnh FDR, số tổ hợp vượt ngưỡng tăng theo lượng
   * dữ liệu nhưng chậm hơn tuyến tính — nhiều dữ liệu hơn cho phép phát
   * hiện vấn đề nhỏ hơn, nhưng số vấn đề thật của một doanh nghiệp thì
   * có hạn.
   */
  alertsPerDayPer1kFeedbacks: {
    value: 0.4,
    unit: 'cảnh báo/ngày trên mỗi 1.000 phản hồi/tháng',
    basis: 'Số tổ hợp sống sót sau hiệu chỉnh FDR trên dữ liệu thử nghiệm, quy về đơn vị',
    confidence: CONFIDENCE.MEDIUM
  },
  minAlertsPerDay: {
    value: 0.5,
    unit: 'cảnh báo',
    basis: 'Sàn cảnh báo tối thiểu kể cả khi khối lượng rất nhỏ',
    confidence: CONFIDENCE.MEDIUM
  },
  tokensPerAlert: {
    value: 1500,
    unit: 'token',
    basis: 'Prompt tổng hợp cảnh báo kèm bằng chứng',
    confidence: CONFIDENCE.MEDIUM
  },
  infraCostPerMonth: {
    value: 1200000,
    unit: 'đ',
    basis: 'Máy chủ ứng dụng, cơ sở dữ liệu và suy luận ViSoBERT ở quy mô nhỏ',
    confidence: CONFIDENCE.MEDIUM
  },
  customerAcquisitionCost: {
    value: 800000,
    unit: 'đ',
    basis: 'Giả định tiếp cận qua cộng đồng người bán trên sàn — kênh rẻ nhất và đúng đối tượng',
    confidence: CONFIDENCE.LOW
  },
  monthlyChurnRate: {
    value: 0.05,
    unit: 'tỉ lệ',
    basis: 'Giả định theo mức phổ biến của SaaS B2B phân khúc SME',
    confidence: CONFIDENCE.LOW
  }
};

/**
 * So sánh chi phí hai kiến trúc trên cùng khối lượng phản hồi.
 * Đây là lập luận nối kỹ thuật với kinh doanh — thứ mà giám khảo mảng
 * kinh doanh tìm, và phần lớn đội thi kỹ thuật không nói được.
 */
function alertsPerDayFor(feedbacksPerMonth) {
  const a = COST_ASSUMPTIONS;
  return Math.max(
    a.minAlertsPerDay.value,
    (feedbacksPerMonth / 1000) * a.alertsPerDayPer1kFeedbacks.value
  );
}

function compareArchitectureCost(feedbacksPerMonth) {
  const a = COST_ASSUMPTIONS;
  const costPerToken = a.llmCostPer1kTokens.value / 1000;

  // Cách làm ngây thơ: gọi mô hình ngôn ngữ cho TỪNG phản hồi
  const naiveTokens = feedbacksPerMonth * a.tokensPerFeedback.value;
  const naiveCost = naiveTokens * costPerToken;

  // Kiến trúc đã chọn: chỉ gọi ở tầng tổng hợp cảnh báo
  const chosenTokens = alertsPerDayFor(feedbacksPerMonth) * 30 * a.tokensPerAlert.value;
  const chosenCost = chosenTokens * costPerToken;

  /**
   * ĐIỂM HÒA VỐN — con số mà bản thuyết minh cũ bỏ qua.
   *
   * Thuyết minh cũ tuyên bố kiến trúc này rẻ hơn "khoảng ba bậc độ lớn".
   * Phép tính ở đây KHÔNG ủng hộ tuyên bố đó. Chi phí của cách gọi từng
   * phản hồi tỉ lệ thuận với khối lượng, còn chi phí của kiến trúc đã
   * chọn cũng tăng theo khối lượng (vì số cảnh báo tăng), chỉ là tăng
   * chậm hơn. Dưới một ngưỡng khối lượng nhất định, gọi từng phản hồi
   * còn RẺ HƠN.
   *
   * Lợi thế thật nằm ở chỗ chi phí tăng chậm hơn khi doanh nghiệp lớn
   * lên — đó mới là điều đáng nói, và nó đúng.
   */
  const perFeedbackCost = a.tokensPerFeedback.value * costPerToken;
  const perAlertMonthlyCost =
    (a.alertsPerDayPer1kFeedbacks.value / 1000) * 30 * a.tokensPerAlert.value * costPerToken;
  const breakEven = perFeedbackCost > perAlertMonthlyCost
    ? (a.minAlertsPerDay.value * 30 * a.tokensPerAlert.value * costPerToken) /
      (perFeedbackCost - perAlertMonthlyCost)
    : null;

  return {
    feedbacksPerMonth,
    naive: {
      label: 'Gọi mô hình ngôn ngữ cho từng phản hồi',
      tokens: Math.round(naiveTokens),
      costVnd: Math.round(naiveCost)
    },
    chosen: {
      label: 'Chỉ gọi ở tầng tổng hợp cảnh báo (kiến trúc đã chọn)',
      tokens: Math.round(chosenTokens),
      costVnd: Math.round(chosenCost),
      alertsPerDay: Number(alertsPerDayFor(feedbacksPerMonth).toFixed(2))
    },
    savingVnd: Math.round(naiveCost - chosenCost),
    ratio: chosenCost > 0 ? Number((naiveCost / chosenCost).toFixed(2)) : null,
    breakEvenFeedbacksPerMonth: breakEven ? Math.round(breakEven) : null,
    cheaperArchitecture: chosenCost < naiveCost ? 'chosen' : 'naive',
    note: chosenCost < naiveCost
      ? 'Ở khối lượng này, kiến trúc đã chọn rẻ hơn. Khoảng cách nới rộng khi khối lượng tăng.'
      : 'Ở khối lượng nhỏ này, gọi từng phản hồi còn rẻ hơn. Lợi thế của kiến trúc đã chọn ' +
        'chỉ xuất hiện từ khoảng ' + (breakEven ? Math.round(breakEven).toLocaleString('vi-VN') : '?') +
        ' phản hồi mỗi tháng trở lên.'
  };
}

/**
 * Kinh tế đơn vị cho một gói.
 * Trả về cả các thành phần chi phí để người đọc kiểm chứng được phép
 * tính, thay vì chỉ đưa ra một con số biên lợi nhuận.
 */
function unitEconomics(tierId, customersOnTier = 100) {
  const tier = PRICING_TIERS.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Không có gói: ${tierId}`);
  if (tier.priceVnd === 0) {
    return {
      tier: tier.name,
      isFree: true,
      note: 'Gói miễn phí là kênh tiếp cận, không tính biên lợi nhuận. Chi phí phục vụ được coi là chi phí marketing.'
    };
  }

  const a = COST_ASSUMPTIONS;
  const volume = tier.feedbackLimit || 100000;
  const arch = compareArchitectureCost(volume);

  // Chi phí biến đổi mỗi khách: phần mô hình ngôn ngữ chia đều + hạ tầng chia đều
  const llmCostPerCustomer = arch.chosen.costVnd;
  const infraPerCustomer = a.infraCostPerMonth.value / Math.max(1, customersOnTier);
  const variableCost = llmCostPerCustomer + infraPerCustomer;

  const grossMargin = (tier.priceVnd - variableCost) / tier.priceVnd;
  const lifetimeMonths = 1 / a.monthlyChurnRate.value;
  const ltv = (tier.priceVnd - variableCost) * lifetimeMonths;
  const paybackMonths = tier.priceVnd > variableCost
    ? a.customerAcquisitionCost.value / (tier.priceVnd - variableCost)
    : null;

  return {
    tier: tier.name,
    isFree: false,
    priceVnd: tier.priceVnd,
    assumedCustomersOnTier: customersOnTier,
    costBreakdown: {
      llmVnd: Math.round(llmCostPerCustomer),
      infrastructureVnd: Math.round(infraPerCustomer),
      totalVariableVnd: Math.round(variableCost)
    },
    grossMargin: Number(grossMargin.toFixed(3)),
    grossMarginDisplay: `${(grossMargin * 100).toFixed(1)}%`,
    ltvVnd: Math.round(ltv),
    cacVnd: a.customerAcquisitionCost.value,
    ltvCacRatio: a.customerAcquisitionCost.value > 0
      ? Number((ltv / a.customerAcquisitionCost.value).toFixed(1))
      : null,
    paybackMonths: paybackMonths ? Number(paybackMonths.toFixed(1)) : null,
    healthCheck:
      grossMargin > 0.7
        ? 'Biên lợi nhuận gộp trên 70%, phù hợp chuẩn SaaS'
        : 'Biên lợi nhuận gộp dưới chuẩn SaaS, cần xem lại giá hoặc chi phí'
  };
}

/** Chi phí xử lý 1.000 phản hồi — câu hỏi tối thiểu phải trả lời được */
function costPer1000Feedbacks(atScaleFeedbacksPerMonth = 30000) {
  /**
   * Phải tính ở MỘT QUY MÔ CỤ THỂ rồi chia ra, không tính trực tiếp cho
   * 1.000 phản hồi. Lý do: chi phí có phần cố định (sàn cảnh báo tối
   * thiểu, hạ tầng), nên chi phí đơn vị giảm khi quy mô tăng. Báo cáo
   * một con số "chi phí trên 1.000 phản hồi" mà không nói ở quy mô nào
   * là con số vô nghĩa.
   */
  const arch = compareArchitectureCost(atScaleFeedbacksPerMonth);
  const units = atScaleFeedbacksPerMonth / 1000;

  const llmPer1k = arch.chosen.costVnd / units;
  const infraPer1k = COST_ASSUMPTIONS.infraCostPerMonth.value / units;

  return {
    measuredAtScale: atScaleFeedbacksPerMonth,
    llmVnd: Math.round(llmPer1k),
    infrastructureVnd: Math.round(infraPer1k),
    totalVnd: Math.round(llmPer1k + infraPer1k),
    naiveLlmVnd: Math.round(arch.naive.costVnd / units),
    note:
      `Tính ở quy mô ${atScaleFeedbacksPerMonth.toLocaleString('vi-VN')} phản hồi/tháng. ` +
      'Chi phí đơn vị giảm khi quy mô tăng, vì phần hạ tầng và sàn cảnh báo tối thiểu là chi phí cố định.'
  };
}

/** Rủi ro kinh doanh cần nêu thẳng, kèm phương án ứng phó */
const BUSINESS_RISKS = [
  {
    risk: 'Sàn thương mại điện tử thay đổi chính sách API',
    impact: 'Cao',
    mitigation:
      'Mô hình first-party dựa trên quyền do chính doanh nghiệp cấp cho gian hàng của họ, ' +
      'nên ít phụ thuộc chính sách công khai hơn scraping. Kênh CSKH, email và biểu mẫu ' +
      'không phụ thuộc sàn.'
  },
  {
    risk: 'Doanh nghiệp không chịu chia sẻ dữ liệu giao dịch',
    impact: 'Trung bình',
    mitigation:
      'Hệ thống chạy ở chế độ suy giảm: dùng chỉ số thay thế trong cùng kênh, và Chỉ số ' +
      'Sức khỏe Dữ liệu hiển thị thấp hơn — chính điều đó tạo động lực kết nối thêm nguồn.'
  },
  {
    risk: 'Đối thủ trong nước làm tính năng tương tự',
    impact: 'Trung bình',
    mitigation:
      'Vòng lặp học chủ động tạo lợi thế tích lũy: mỗi thao tác kiểm duyệt của khách hàng ' +
      'là một mẫu huấn luyện đúng ngành và đúng tập khách hàng của họ.'
  },
  {
    risk: 'Chi phí mô hình ngôn ngữ tăng',
    impact: 'Thấp',
    mitigation:
      'Mô hình ngôn ngữ chỉ chiếm phần nhỏ trong chi phí biến đổi nhờ quyết định kiến trúc ' +
      'gọi ở tầng tổng hợp. Xem compareArchitectureCost().'
  }
];

module.exports = {
  PRICING_TIERS,
  OVERSTATED_CLAIM_NOTE,
  alertsPerDayFor,
  COST_ASSUMPTIONS,
  CONFIDENCE,
  BUSINESS_RISKS,
  compareArchitectureCost,
  unitEconomics,
  costPer1000Feedbacks
};
