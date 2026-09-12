/**
 * PLAYBOOK ENGINE — TẦNG KHUYẾN NGHỊ HÀNH ĐỘNG
 * ==================================================================
 * Kiến trúc lai (hybrid): một Playbook Engine ánh xạ tổ hợp
 *   (nguyên nhân cốt lõi x mức nghiêm trọng x xu hướng x phạm vi)
 * sang thư viện hành động đã chuẩn hóa theo nghiệp vụ ngành, kết hợp
 * một tầng sinh ngôn ngữ (LLM) CHỈ đảm nhiệm việc diễn đạt khuyến nghị
 * thành văn bản tự nhiên kèm dẫn chứng cụ thể từ dữ liệu.
 *
 * Ba lý do cho lựa chọn kiến trúc này:
 *  (1) Khuyến nghị luôn TRUY VẾT ĐƯỢC về quy tắc và bằng chứng đã sinh
 *      ra nó — điều mà một mô hình sinh thuần túy không đảm bảo.
 *  (2) Chi phí vận hành thấp: LLM chỉ được gọi ở tầng tổng hợp cảnh báo
 *      (vài chục lần mỗi ngày), không gọi cho từng phản hồi (hàng chục
 *      nghìn lần mỗi ngày). Chênh lệch khoảng ba bậc độ lớn, và đó
 *      chính là lý do mô hình giá dành cho SME khả thi.
 *  (3) Thư viện playbook là tài sản tri thức nghiệp vụ tích lũy theo
 *      thời gian và theo từng ngành dọc.
 *
 * ------------------------------------------------------------------
 * NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI (áp dụng cho mọi hành động):
 * Hệ thống KHÔNG TỰ THỰC THI bất kỳ hành động nào phát sinh chi phí
 * hoặc tác động tới khách hàng cuối. Mọi hành động đều ở dạng ĐỀ XUẤT
 * kèm bằng chứng và độ tin cậy, và phải được người có thẩm quyền phê
 * duyệt. Một hệ thống tự động phát voucher dựa trên phán đoán của mô
 * hình NLP là một lỗ hổng tài chính: chỉ cần mô hình sai, hoặc có người
 * phát hiện ra quy luật kích hoạt, doanh nghiệp mất tiền hàng loạt.
 */

/** Phân loại tác động của một hành động, quyết định mức phê duyệt cần có */
const ACTION_KIND = {
  INVESTIGATE: { key: 'INVESTIGATE', label: 'Điều tra nội bộ', cost: false, touchesCustomer: false },
  INTERNAL_FIX: { key: 'INTERNAL_FIX', label: 'Khắc phục nội bộ', cost: false, touchesCustomer: false },
  CONTACT_PARTNER: { key: 'CONTACT_PARTNER', label: 'Làm việc với đối tác', cost: false, touchesCustomer: false },
  CUSTOMER_CONTACT: { key: 'CUSTOMER_CONTACT', label: 'Liên hệ khách hàng', cost: false, touchesCustomer: true },
  FINANCIAL: { key: 'FINANCIAL', label: 'Phát sinh chi phí', cost: true, touchesCustomer: true }
};

/**
 * THƯ VIỆN PLAYBOOK.
 * Khóa: mã nguyên nhân cốt lõi trong taxonomy. Mỗi mục có hành động
 * theo hai mức nghiêm trọng, để cùng một vấn đề ở quy mô khác nhau
 * nhận phản ứng khác nhau.
 */
const PLAYBOOKS = {
  LateDelivery: {
    baseline: [
      { text: 'Đối chiếu thời gian giao thực tế theo từng đơn vị vận chuyển và từng khu vực', kind: 'INVESTIGATE' },
      { text: 'Rà soát khung giờ cao điểm để điều chỉnh năng lực lấy hàng', kind: 'INTERNAL_FIX' }
    ],
    escalated: [
      { text: 'Làm việc với đơn vị vận chuyển tại khu vực bị ảnh hưởng, yêu cầu cam kết thời gian', kind: 'CONTACT_PARTNER' },
      { text: 'Tạm chuyển tuyến sang đơn vị vận chuyển dự phòng cho khu vực này', kind: 'INTERNAL_FIX' },
      { text: 'Đề xuất chủ động thông báo trễ hẹn cho khách đang có đơn treo', kind: 'CUSTOMER_CONTACT' }
    ]
  },
  DamagedInTransit: {
    baseline: [
      { text: 'Kiểm tra quy cách đóng gói của nhóm hàng bị phản ánh', kind: 'INVESTIGATE' },
      { text: 'Chụp ảnh hiện trạng kiện hàng tại điểm xuất kho trong 7 ngày tới', kind: 'INTERNAL_FIX' }
    ],
    escalated: [
      { text: 'Nâng cấp vật liệu đệm cho nhóm hàng dễ vỡ, áp dụng ngay lô kế tiếp', kind: 'INTERNAL_FIX' },
      { text: 'Gửi biên bản tỉ lệ hư hỏng cho đơn vị vận chuyển và yêu cầu bồi hoàn', kind: 'CONTACT_PARTNER' },
      { text: 'Đề xuất gửi voucher xin lỗi cho khách bị ảnh hưởng — chờ nhân sự CSKH phê duyệt một chạm', kind: 'FINANCIAL' }
    ]
  },
  LostPackage: {
    baseline: [{ text: 'Truy vết mã vận đơn của các đơn bị phản ánh thất lạc', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Mở khiếu nại chính thức với đơn vị vận chuyển cho toàn bộ đơn thất lạc trong kỳ', kind: 'CONTACT_PARTNER' },
      { text: 'Đề xuất phương án gửi bù hoặc hoàn tiền — chờ phê duyệt', kind: 'FINANCIAL' }
    ]
  },
  CourierAttitude: {
    baseline: [{ text: 'Ghi nhận mã nhân viên giao hàng bị phản ánh và gửi cho đối tác', kind: 'CONTACT_PARTNER' }],
    escalated: [{ text: 'Yêu cầu đối tác vận chuyển thay nhân sự phụ trách tuyến bị phản ánh', kind: 'CONTACT_PARTNER' }]
  },
  TechnicalDefect: {
    baseline: [
      { text: 'Truy xuất số lô của các sản phẩm bị phản ánh lỗi', kind: 'INVESTIGATE' },
      { text: 'Đối chiếu tỉ lệ lỗi theo lô để xác định lô nghi vấn', kind: 'INVESTIGATE' }
    ],
    escalated: [
      { text: 'Tạm dừng bán lô hàng nghi vấn cho tới khi có kết quả kiểm tra', kind: 'INTERNAL_FIX' },
      { text: 'Kiểm tra toàn bộ tồn kho thuộc lô bị phản ánh', kind: 'INTERNAL_FIX' },
      { text: 'Đề xuất chương trình đổi trả chủ động cho khách đã mua lô này — chờ phê duyệt', kind: 'FINANCIAL' }
    ]
  },
  NotAsDescribed: {
    baseline: [{ text: 'Rà soát lại ảnh và mô tả sản phẩm trên trang bán', kind: 'INTERNAL_FIX' }],
    escalated: [
      { text: 'Cập nhật mô tả và ảnh thật, ghi rõ thông số dễ gây hiểu nhầm', kind: 'INTERNAL_FIX' },
      { text: 'Rà soát nội dung quảng cáo đang chạy cho sản phẩm này', kind: 'INTERNAL_FIX' }
    ]
  },
  SuspectedCounterfeit: {
    baseline: [{ text: 'Đối chiếu chứng từ nhập hàng của lô bị nghi ngờ', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Tạm ẩn sản phẩm khỏi gian hàng cho tới khi xác minh xong nguồn gốc', kind: 'INTERNAL_FIX' },
      { text: 'Chuẩn bị hồ sơ chứng minh nguồn gốc để phản hồi sàn và khách hàng', kind: 'INVESTIGATE' }
    ]
  },
  GatewayError: {
    baseline: [{ text: 'Kiểm tra log lỗi cổng thanh toán trong khung giờ bị phản ánh', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Thông báo khẩn cho đội kỹ thuật và nhà cung cấp cổng thanh toán', kind: 'CONTACT_PARTNER' },
      { text: 'Đề xuất tạm ẩn cổng thanh toán đang lỗi và chuyển sang phương thức dự phòng — chờ phê duyệt', kind: 'INTERNAL_FIX' }
    ]
  },
  DoubleCharge: {
    baseline: [{ text: 'Đối soát giao dịch trùng trong hệ thống thanh toán', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Lập danh sách giao dịch bị trừ hai lần kèm mã đơn', kind: 'INVESTIGATE' },
      { text: 'Đề xuất hoàn tiền cho các giao dịch trùng — chờ phê duyệt của kế toán', kind: 'FINANCIAL' }
    ]
  },
  SlowResponse: {
    baseline: [{ text: 'Đo thời gian phản hồi trung bình của từng ca trực CSKH', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Bổ sung nhân sự trực trong khung giờ có thời gian chờ dài nhất', kind: 'INTERNAL_FIX' },
      { text: 'Đề xuất liên hệ lại các khách đang chờ quá 24 giờ', kind: 'CUSTOMER_CONTACT' }
    ]
  },
  BadAttitude: {
    baseline: [{ text: 'Trích xuất hội thoại của các ca bị phản ánh để đối chiếu', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Thông báo trực tiếp cho quản lý bộ phận và yêu cầu giải trình', kind: 'INTERNAL_FIX' },
      { text: 'Đưa nhóm nhân sự bị phản ánh vào lịch đào tạo lại kỹ năng phục vụ', kind: 'INTERNAL_FIX' }
    ]
  },
  WrongInformation: {
    baseline: [{ text: 'Rà soát kịch bản tư vấn đang dùng cho sản phẩm bị phản ánh', kind: 'INTERNAL_FIX' }],
    escalated: [{ text: 'Cập nhật kịch bản tư vấn và thông báo tới toàn bộ nhân sự CSKH', kind: 'INTERNAL_FIX' }]
  },
  AppSlowOrCrash: {
    baseline: [{ text: 'Đối chiếu phản ánh với biểu đồ hiệu năng ứng dụng cùng khung giờ', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Thông báo khẩn cấp tới đội kỹ thuật kèm khung giờ và phiên bản bị lỗi', kind: 'INTERNAL_FIX' },
      { text: 'Đề xuất thông báo cho người dùng nếu sự cố kéo dài quá 4 giờ — chờ phê duyệt', kind: 'CUSTOMER_CONTACT' }
    ]
  },
  SlowRefund: {
    baseline: [{ text: 'Thống kê thời gian hoàn tiền trung bình theo từng phương thức', kind: 'INVESTIGATE' }],
    escalated: [
      { text: 'Ưu tiên xử lý các yêu cầu hoàn tiền đang quá hạn cam kết', kind: 'INTERNAL_FIX' },
      { text: 'Đề xuất thông báo tiến độ cho khách đang chờ hoàn tiền', kind: 'CUSTOMER_CONTACT' }
    ]
  },
  MisleadingPromo: {
    baseline: [{ text: 'Rà soát điều kiện áp dụng của chương trình khuyến mãi đang chạy', kind: 'INTERNAL_FIX' }],
    escalated: [{ text: 'Sửa nội dung truyền thông khuyến mãi và ghi rõ điều kiện áp dụng', kind: 'INTERNAL_FIX' }]
  }
};

/** Playbook mặc định theo danh mục, khi chưa xác định được nguyên nhân cốt lõi */
const CATEGORY_FALLBACK = {
  Delivery: [{ text: 'Rà soát toàn bộ khâu giao vận trong kỳ bị phản ánh', kind: 'INVESTIGATE' }],
  ProductQuality: [{ text: 'Kiểm tra chất lượng lô hàng đang bán', kind: 'INVESTIGATE' }],
  CustomerService: [{ text: 'Rà soát nhật ký hội thoại CSKH trong kỳ', kind: 'INVESTIGATE' }],
  Payment: [{ text: 'Đối soát log giao dịch thanh toán trong kỳ', kind: 'INVESTIGATE' }],
  TechnicalApp: [{ text: 'Kiểm tra nhật ký lỗi ứng dụng trong kỳ', kind: 'INVESTIGATE' }],
  ReturnRefund: [{ text: 'Rà soát hàng đợi yêu cầu đổi trả và hoàn tiền', kind: 'INVESTIGATE' }],
  PricePromotion: [{ text: 'Rà soát chính sách giá và khuyến mãi đang áp dụng', kind: 'INVESTIGATE' }]
};

/**
 * Sinh khuyến nghị cho một cảnh báo.
 * Mọi khuyến nghị đều kèm: quy tắc đã sinh ra nó (truy vết được), loại
 * tác động, và mức phê duyệt bắt buộc.
 */
function buildRecommendation(alert) {
  const escalate = alert.severity === 'High' || alert.severity === 'Critical';

  let actions;
  let ruleId;

  if (alert.cause && PLAYBOOKS[alert.cause]) {
    const pb = PLAYBOOKS[alert.cause];
    actions = escalate ? [...pb.baseline, ...pb.escalated] : pb.baseline;
    ruleId = `PB:${alert.cause}:${escalate ? 'ESCALATED' : 'BASELINE'}`;
  } else {
    actions = CATEGORY_FALLBACK[alert.category] || [
      { text: 'Phân công người phụ trách rà soát nhóm phản hồi này', kind: 'INVESTIGATE' }
    ];
    ruleId = `PB:${alert.category}:FALLBACK`;
  }

  const steps = actions.map((a, i) => {
    const kind = ACTION_KIND[a.kind] || ACTION_KIND.INVESTIGATE;
    return {
      order: i + 1,
      text: a.text,
      kind: kind.key,
      kindLabel: kind.label,
      incursCost: kind.cost,
      touchesCustomer: kind.touchesCustomer,
      // Hành động phát sinh chi phí hoặc chạm tới khách hàng cuối luôn
      // cần phê duyệt của người có thẩm quyền, không có ngoại lệ
      requiresApproval: kind.cost || kind.touchesCustomer,
      approvalRole: kind.cost ? 'Quản lý có thẩm quyền chi' : kind.touchesCustomer ? 'Trưởng bộ phận CSKH' : null
    };
  });

  return {
    alertId: alert.id,
    ruleId,
    owner: alert.owner,
    status: 'PROPOSED',
    autoExecuted: false,
    // Bằng chứng đi kèm: khuyến nghị nào cũng phải chỉ ra được nó dựa
    // trên cái gì, nếu không doanh nghiệp không có cơ sở để quyết định
    evidence: {
      statistics: alert.statistics,
      evidenceCount: alert.evidenceCount,
      excludedByTrust: alert.excludedByTrust,
      affectedCustomers: alert.affectedCustomers,
      evidenceIds: alert.evidenceIds
    },
    confidence: alert.severityScore,
    steps,
    requiresApproval: steps.some((s) => s.requiresApproval),
    safetyNote:
      'Hệ thống không tự thực thi bất kỳ hành động nào phát sinh chi phí hoặc tác động tới khách hàng cuối. Mọi hành động ở đây là đề xuất; người có thẩm quyền quyết định.',
    followUpDays: escalate ? 7 : 14
  };
}

/**
 * Câu tóm tắt sẵn dùng khi không gọi LLM. Tầng LLM (nếu bật) chỉ diễn
 * đạt lại nội dung này cho tự nhiên hơn — KHÔNG được phép thêm dữ kiện
 * hay hành động mới ngoài playbook.
 */
function summarize(alert) {
  const what = alert.causeLabel
    ? `${alert.categoryLabel} - ${alert.causeLabel}`
    : alert.categoryLabel;
  const scopeParts = [];
  if (alert.productName) scopeParts.push(`trên ${alert.productName}`);
  if (alert.region) scopeParts.push(`tại khu vực ${alert.region}`);
  const scope = scopeParts.length ? ` ${scopeParts.join(' ')}` : '';

  if (alert.type === 'SUSTAINED_DRIFT') {
    return `${what}${scope} đang xấu đi đều đặn: đường EWMA vượt giới hạn kiểm soát ${alert.statistics.consecutiveBreaches} chu kỳ liên tiếp. Không có ngày nào đột biến, nhưng xu hướng đã lệch khỏi nền.`;
  }

  const cur = (alert.statistics.currentRate * 100).toFixed(1);
  const base = (alert.statistics.baselineRate * 100).toFixed(1);
  return `${what}${scope} tăng từ ${base}% lên ${cur}% so với nền ${alert.baselineDays} ngày (z = ${alert.statistics.z}, ${alert.statistics.pValueDisplay}). Ước tính ${alert.affectedCustomers} khách hàng bị ảnh hưởng, dựa trên ${alert.evidenceCount} phản hồi hợp lệ${alert.excludedByTrust > 0 ? ` (đã loại ${alert.excludedByTrust} phản hồi không đạt ngưỡng tin cậy)` : ''}.`;
}

const PLAYBOOK_COUNT = Object.keys(PLAYBOOKS).length;

module.exports = {
  PLAYBOOKS,
  PLAYBOOK_COUNT,
  ACTION_KIND,
  buildRecommendation,
  summarize
};
