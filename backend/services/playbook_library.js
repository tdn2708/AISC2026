/**
 * THƯ VIỆN PLAYBOOK CÓ THAM SỐ
 * ==================================================================
 * Đây là bản kế thừa của `playbook.js`, giữ nguyên triết lý kiến trúc —
 * hành động do quy tắc nghiệp vụ quyết định, không do mô hình sinh ra —
 * nhưng sửa đúng chỗ làm cho tầng khuyến nghị trở nên cứng nhắc.
 *
 * ------------------------------------------------------------------
 * BA THAY ĐỔI SO VỚI BẢN CŨ
 *
 * 1. HÀNH ĐỘNG LÀ TEMPLATE CÓ CHỖ TRỐNG, KHÔNG PHẢI CHUỖI CỐ ĐỊNH.
 *    Bản cũ: "Làm việc với đơn vị vận chuyển tại khu vực bị ảnh hưởng".
 *    Bản này: "Làm việc với đơn vị vận chuyển tại {region}, nơi chiếm
 *    {share} phản hồi trễ trong kỳ". Chỗ trống chỉ được điền bằng giá
 *    trị đã qua kiểm định tập trung ở evidence_profile.
 *
 * 2. MỖI HÀNH ĐỘNG KHAI BÁO ĐIỀU KIỆN DỮ LIỆU CỦA NÓ (`requires`).
 *    Đây là cơ chế biến động cơ từ cố định thành hướng dữ liệu. Không
 *    xác định được khu vực thì hành động "chuyển tuyến cho khu vực đó"
 *    KHÔNG được đề xuất — thay vào đó hệ thống đề xuất việc thu thập
 *    đúng trường dữ liệu còn thiếu. Cùng một nguyên nhân, hai bộ dữ
 *    liệu khác nhau sẽ cho hai danh sách hành động khác nhau.
 *
 * 3. MỖI HÀNH ĐỘNG MANG THEO CHI PHÍ VÀ HIỆU QUẢ KỲ VỌNG.
 *    Nhờ đó thứ tự hiển thị là thứ tự giá trị kỳ vọng, không phải thứ
 *    tự khai báo trong mảng. Một danh sách mười việc không xếp hạng thì
 *    thực tế là một danh sách không việc nào.
 *
 * ------------------------------------------------------------------
 * `expectedReduction` là GIẢ ĐỊNH KHỞI TẠO, không phải số đo. Nó là
 * điểm xuất phát để xếp hạng khi chưa có lịch sử. Sau mỗi lần khuyến
 * nghị được chấp nhận, recommender đo lại tỉ lệ khiếu nật trong đúng
 * phạm vi đó sau `followUpDays` và cập nhật con số này bằng quan sát
 * thật. Giả định chỉ tồn tại cho tới lần đo đầu tiên.
 */

/** Ngữ nghĩa các chỗ trống dùng trong template */
const SLOTS = {
  region: 'khu vực',
  product: 'sản phẩm',
  productGroup: 'nhóm hàng',
  channel: 'kênh',
  hour: 'khung giờ',
  weekday: 'ngày trong tuần',
  carrier: 'đơn vị vận chuyển',
  batch: 'số lô',
  agent: 'mã nhân sự',
  appVersion: 'phiên bản ứng dụng'
};

/**
 * Hành động thu thập dữ liệu, dùng khi một chiều cần thiết còn thiếu.
 * Đây là loại khuyến nghị mà bản cũ hoàn toàn không có, dù nó thường là
 * việc đáng làm nhất: không có dữ liệu thì mọi vòng phân tích sau đều
 * dừng ở mức chung chung.
 */
const INSTRUMENTATION_ACTIONS = {
  carrier: {
    id: 'INS-CARRIER',
    kind: 'INTERNAL_FIX',
    template:
      'Bổ sung trường đơn vị vận chuyển vào bản ghi đơn hàng và phản hồi. Hiện {evidenceCount} phản hồi giao vận trong cảnh báo này không quy được về nhà xe nào, nên chưa thể đàm phán với đúng đối tác.',
    requires: [],
    effortDays: 3,
    reversible: true,
    expectedReduction: 0,
    strategicValue: 0.8,
    cooldownDays: 90
  },
  batch: {
    id: 'INS-BATCH',
    kind: 'INTERNAL_FIX',
    template:
      'Gắn số lô sản xuất vào dữ liệu bán hàng. Không có số lô thì phương án duy nhất khi phát hiện hàng lỗi là kiểm tra toàn bộ tồn kho, đắt hơn nhiều lần so với khoanh vùng một lô.',
    requires: [],
    effortDays: 5,
    reversible: true,
    expectedReduction: 0,
    strategicValue: 0.75,
    cooldownDays: 90
  },
  agent: {
    id: 'INS-AGENT',
    kind: 'INTERNAL_FIX',
    template:
      'Gắn mã nhân sự CSKH vào từng hội thoại. Hiện phản ánh về chất lượng phục vụ không quy được về ca trực nào, nên việc đào tạo lại buộc phải làm đại trà.',
    requires: [],
    effortDays: 2,
    reversible: true,
    expectedReduction: 0,
    strategicValue: 0.6,
    cooldownDays: 90
  },
  appVersion: {
    id: 'INS-APPVER',
    kind: 'INTERNAL_FIX',
    template:
      'Ghi phiên bản ứng dụng kèm mỗi phản hồi kỹ thuật. Không có phiên bản thì đội kỹ thuật không xác định được nên quay lui bản nào.',
    requires: [],
    effortDays: 1,
    reversible: true,
    expectedReduction: 0,
    strategicValue: 0.7,
    cooldownDays: 90
  }
};

/**
 * THƯ VIỆN HÀNH ĐỘNG THEO NGUYÊN NHÂN CỐT LÕI.
 *
 * `tier`        baseline áp dụng mọi mức; escalated chỉ khi Cao/Nghiêm trọng
 * `requires`    slot bắt buộc phải điền được, nếu không hành động bị loại
 * `worksWhen`   mức tập trung phù hợp: FOCUSED một điểm hỏng, DIFFUSE hỏng dàn đều
 * `gapSlot`     khi slot này thiếu, đề xuất hành động thu thập dữ liệu tương ứng
 */
const LIBRARY = {
  LateDelivery: {
    category: 'Delivery',
    gapSlot: 'carrier',
    actions: [
      {
        id: 'LD-AUDIT-REGION',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template:
          'Đối chiếu thời gian giao thực tế tại {region}, nơi chiếm {topShare} phản hồi trễ trong kỳ so với {topBaselineShare} ở nền.',
        requires: ['region'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'LD-AUDIT-ALL',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template:
          'Đối chiếu thời gian giao thực tế theo từng đơn vị vận chuyển và từng khu vực. Phản hồi trễ trong kỳ trải đều, không dồn vào một khu vực nào, nên cần rà soát toàn tuyến.',
        requires: [],
        worksWhen: ['PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.12,
        cooldownDays: 14
      },
      {
        id: 'LD-PEAK-CAPACITY',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template:
          'Tăng năng lực lấy hàng trong {hour}, khung giờ chiếm {topShare} số phản hồi trễ của kỳ này.',
        requires: ['hour'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 21
      },
      {
        id: 'LD-PARTNER-SLA',
        tier: 'escalated',
        kind: 'CONTACT_PARTNER',
        template:
          'Làm việc với đơn vị vận chuyển phụ trách {region} và yêu cầu cam kết thời gian bằng văn bản. Kỳ này có {affected} khách bị ảnh hưởng, giá trị đơn liên quan ước tính {revenue}.',
        requires: ['region'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.35,
        cooldownDays: 30
      },
      {
        id: 'LD-REROUTE',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template:
          'Tạm chuyển tuyến {region} sang đơn vị vận chuyển dự phòng cho tới khi tỉ lệ trễ trở lại nền {baselineRate}.',
        requires: ['region'],
        worksWhen: ['FOCUSED'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 30
      },
      {
        id: 'LD-PROACTIVE-NOTICE',
        tier: 'escalated',
        kind: 'CUSTOMER_CONTACT',
        template:
          'Chủ động thông báo trễ hẹn cho khách đang có đơn treo tại {region}, ước tính {affected} khách.',
        requires: ['region'],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: false,
        expectedReduction: 0.25,
        cooldownDays: 7
      }
    ]
  },

  DamagedInTransit: {
    category: 'Delivery',
    gapSlot: 'carrier',
    actions: [
      {
        id: 'DT-PACKAGING',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Kiểm tra quy cách đóng gói của {productGroup}, nhóm chiếm {topShare} phản hồi hư hỏng trong kỳ.',
        requires: ['productGroup'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 21
      },
      {
        id: 'DT-PHOTO-LOG',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template: 'Chụp ảnh hiện trạng kiện hàng tại điểm xuất kho trong 7 ngày tới để xác định hư hỏng phát sinh trước hay sau khi rời kho.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.1,
        cooldownDays: 30
      },
      {
        id: 'DT-UPGRADE-PACK',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Nâng cấp vật liệu đệm cho {productGroup} từ lô xuất kho kế tiếp.',
        requires: ['productGroup'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.4,
        cooldownDays: 45
      },
      {
        id: 'DT-CLAIM',
        tier: 'escalated',
        kind: 'CONTACT_PARTNER',
        template: 'Lập biên bản tỉ lệ hư hỏng {currentRate} tại {region} và yêu cầu đơn vị vận chuyển bồi hoàn, giá trị liên quan {revenue}.',
        requires: ['region'],
        worksWhen: ['FOCUSED'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 30
      },
      {
        id: 'DT-VOUCHER',
        tier: 'escalated',
        kind: 'FINANCIAL',
        template: 'Gửi voucher xin lỗi cho {affected} khách bị ảnh hưởng trong kỳ.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: false,
        expectedReduction: 0.2,
        cooldownDays: 30
      }
    ]
  },

  LostPackage: {
    category: 'Delivery',
    gapSlot: 'carrier',
    actions: [
      {
        id: 'LP-TRACE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Truy vết mã vận đơn của {evidenceCount} đơn bị phản ánh thất lạc trong kỳ.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.1,
        cooldownDays: 7
      },
      {
        id: 'LP-FORMAL-CLAIM',
        tier: 'escalated',
        kind: 'CONTACT_PARTNER',
        template: 'Mở khiếu nại chính thức với đơn vị vận chuyển cho toàn bộ đơn thất lạc tại {region} trong kỳ, giá trị {revenue}.',
        requires: ['region'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.3,
        cooldownDays: 30
      },
      {
        id: 'LP-REFUND',
        tier: 'escalated',
        kind: 'FINANCIAL',
        template: 'Gửi bù hoặc hoàn tiền cho {affected} khách có đơn thất lạc, giá trị ước tính {revenue}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: false,
        expectedReduction: 0.35,
        cooldownDays: 14
      }
    ]
  },

  CourierAttitude: {
    category: 'Delivery',
    gapSlot: 'carrier',
    actions: [
      {
        id: 'CA-REPORT',
        tier: 'baseline',
        kind: 'CONTACT_PARTNER',
        template: 'Gửi danh sách {evidenceCount} phản ánh về thái độ giao hàng tại {region} cho đối tác vận chuyển.',
        requires: ['region'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 21
      },
      {
        id: 'CA-REPLACE',
        tier: 'escalated',
        kind: 'CONTACT_PARTNER',
        template: 'Yêu cầu đối tác thay nhân sự phụ trách tuyến {region}, nơi chiếm {topShare} phản ánh loại này.',
        requires: ['region'],
        worksWhen: ['FOCUSED'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 45
      }
    ]
  },

  TechnicalDefect: {
    category: 'ProductQuality',
    gapSlot: 'batch',
    actions: [
      {
        id: 'TD-TRACE-SKU',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Truy xuất lịch sử nhập và sản xuất của {product}, sản phẩm chiếm {topShare} phản hồi lỗi kỹ thuật trong kỳ.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'TD-DEFECT-RATE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Đối chiếu tỉ lệ lỗi theo lô để xác định lô nghi vấn. Tỉ lệ hiện tại {currentRate} so với nền {baselineRate}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'TD-HALT-SALE',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Tạm dừng bán {product} cho tới khi có kết quả kiểm tra. Doanh thu đang chịu rủi ro {revenue}.',
        requires: ['product'],
        worksWhen: ['FOCUSED'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.6,
        cooldownDays: 30
      },
      {
        id: 'TD-STOCK-CHECK',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Kiểm tra toàn bộ tồn kho của {product}.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.4,
        cooldownDays: 45
      },
      {
        id: 'TD-PROACTIVE-SWAP',
        tier: 'escalated',
        kind: 'FINANCIAL',
        template: 'Chương trình đổi trả chủ động cho khách đã mua {product}, ước tính {affected} khách trong kỳ.',
        requires: ['product'],
        worksWhen: ['FOCUSED'],
        effortDays: 5,
        reversible: false,
        expectedReduction: 0.5,
        cooldownDays: 60
      }
    ]
  },

  NotAsDescribed: {
    category: 'ProductQuality',
    actions: [
      {
        id: 'NAD-REVIEW-PAGE',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template: 'Rà soát ảnh và mô tả của {product} trên trang bán.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.3,
        cooldownDays: 30
      },
      {
        id: 'NAD-REVIEW-ALL',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template: 'Rà soát mô tả sản phẩm trên toàn gian hàng. Phản hồi loại này trải đều nhiều sản phẩm, cho thấy vấn đề nằm ở cách viết mô tả chứ không ở một mã hàng.',
        requires: [],
        worksWhen: ['PARTIAL', 'DIFFUSE'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.25,
        cooldownDays: 45
      },
      {
        id: 'NAD-FIX-SPEC',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Cập nhật ảnh thật và ghi rõ thông số dễ gây hiểu nhầm của {product}.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 30
      },
      {
        id: 'NAD-AUDIT-ADS',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Rà soát nội dung quảng cáo đang chạy cho {product}.',
        requires: ['product'],
        worksWhen: ['FOCUSED'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 30
      }
    ]
  },

  SuspectedCounterfeit: {
    category: 'ProductQuality',
    gapSlot: 'batch',
    actions: [
      {
        id: 'SC-DOCS',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Đối chiếu chứng từ nhập hàng của {product}.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 30
      },
      {
        id: 'SC-DELIST',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Tạm ẩn {product} khỏi gian hàng cho tới khi xác minh xong nguồn gốc. Rủi ro uy tín cao hơn doanh thu {revenue} đang mất.',
        requires: ['product'],
        worksWhen: ['FOCUSED'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.7,
        cooldownDays: 30
      },
      {
        id: 'SC-DOSSIER',
        tier: 'escalated',
        kind: 'INVESTIGATE',
        template: 'Chuẩn bị hồ sơ chứng minh nguồn gốc để phản hồi sàn và khách hàng.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 30
      }
    ]
  },

  GatewayError: {
    category: 'Payment',
    actions: [
      {
        id: 'GE-LOG',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Kiểm tra log cổng thanh toán trong {hour}, khung giờ tập trung {topShare} phản ánh lỗi.',
        requires: ['hour'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 7
      },
      {
        id: 'GE-LOG-ALL',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Kiểm tra log cổng thanh toán trong toàn bộ cửa sổ {windowDays} ngày. Lỗi rải đều các khung giờ, nghi vấn thiên về cấu hình hơn là tải.',
        requires: [],
        worksWhen: ['PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 7
      },
      {
        id: 'GE-ESCALATE',
        tier: 'escalated',
        kind: 'CONTACT_PARTNER',
        template: 'Báo khẩn cho nhà cung cấp cổng thanh toán kèm log khung giờ {hour} và {evidenceCount} giao dịch lỗi.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.4,
        cooldownDays: 14
      },
      {
        id: 'GE-FAILOVER',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Tạm ẩn cổng thanh toán đang lỗi và chuyển sang phương thức dự phòng. Doanh thu đang chịu rủi ro {revenue}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.65,
        cooldownDays: 14
      }
    ]
  },

  DoubleCharge: {
    category: 'Payment',
    actions: [
      {
        id: 'DC-RECONCILE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Đối soát giao dịch trùng trong hệ thống thanh toán cho {evidenceCount} trường hợp được phản ánh.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 7
      },
      {
        id: 'DC-LIST',
        tier: 'escalated',
        kind: 'INVESTIGATE',
        template: 'Lập danh sách giao dịch bị trừ hai lần kèm mã đơn, tổng giá trị liên quan {revenue}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 7
      },
      {
        id: 'DC-REFUND',
        tier: 'escalated',
        kind: 'FINANCIAL',
        template: 'Hoàn tiền cho {affected} khách bị trừ trùng, giá trị {revenue}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: false,
        expectedReduction: 0.6,
        cooldownDays: 7
      }
    ]
  },

  SlowResponse: {
    category: 'CustomerService',
    gapSlot: 'agent',
    actions: [
      {
        id: 'SR-MEASURE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Đo thời gian phản hồi trung bình theo từng ca trực, tập trung vào {hour} nơi có {topShare} phản ánh chờ lâu.',
        requires: ['hour'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'SR-STAFFING',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Bổ sung nhân sự trực trong {hour}, khung giờ có thời gian chờ dài nhất.',
        requires: ['hour'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 3,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 30
      },
      {
        id: 'SR-CALLBACK',
        tier: 'escalated',
        kind: 'CUSTOMER_CONTACT',
        template: 'Liên hệ lại {affected} khách đang chờ quá 24 giờ trên kênh {channel}.',
        requires: ['channel'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: false,
        expectedReduction: 0.3,
        cooldownDays: 7
      }
    ]
  },

  BadAttitude: {
    category: 'CustomerService',
    gapSlot: 'agent',
    actions: [
      {
        id: 'BA-EXTRACT',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Trích xuất {evidenceCount} hội thoại bị phản ánh trên kênh {channel} để đối chiếu.',
        requires: ['channel'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'BA-ESCALATE-MGR',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Thông báo cho quản lý bộ phận và yêu cầu giải trình về {evidenceCount} phản ánh trong {windowDays} ngày qua.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.3,
        cooldownDays: 21
      },
      {
        id: 'BA-TRAINING',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Đưa nhóm nhân sự trực {hour} vào lịch đào tạo lại kỹ năng phục vụ.',
        requires: ['hour'],
        worksWhen: ['FOCUSED'],
        effortDays: 5,
        reversible: true,
        expectedReduction: 0.4,
        cooldownDays: 60
      }
    ]
  },

  WrongInformation: {
    category: 'CustomerService',
    actions: [
      {
        id: 'WI-REVIEW-SCRIPT',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template: 'Rà soát kịch bản tư vấn đang dùng cho {product}.',
        requires: ['product'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.25,
        cooldownDays: 30
      },
      {
        id: 'WI-UPDATE-SCRIPT',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Cập nhật kịch bản tư vấn và thông báo tới toàn bộ nhân sự CSKH.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.4,
        cooldownDays: 45
      }
    ]
  },

  AppSlowOrCrash: {
    category: 'TechnicalApp',
    gapSlot: 'appVersion',
    actions: [
      {
        id: 'AS-CORRELATE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Đối chiếu phản ánh với biểu đồ hiệu năng ứng dụng trong {hour}, khung giờ chiếm {topShare} phản ánh.',
        requires: ['hour'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.2,
        cooldownDays: 7
      },
      {
        id: 'AS-ALERT-ENG',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Báo đội kỹ thuật kèm khung giờ {hour} và {evidenceCount} phản ánh trong {windowDays} ngày.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 7
      },
      {
        id: 'AS-NOTIFY-USERS',
        tier: 'escalated',
        kind: 'CUSTOMER_CONTACT',
        template: 'Thông báo cho người dùng nếu sự cố kéo dài quá 4 giờ, ước tính {affected} người bị ảnh hưởng.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: false,
        expectedReduction: 0.2,
        cooldownDays: 7
      }
    ]
  },

  SlowRefund: {
    category: 'ReturnRefund',
    actions: [
      {
        id: 'SRF-MEASURE',
        tier: 'baseline',
        kind: 'INVESTIGATE',
        template: 'Thống kê thời gian hoàn tiền trung bình theo từng phương thức thanh toán.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.15,
        cooldownDays: 14
      },
      {
        id: 'SRF-PRIORITIZE',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Ưu tiên xử lý các yêu cầu hoàn tiền quá hạn cam kết, tổng giá trị {revenue}.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 2,
        reversible: true,
        expectedReduction: 0.5,
        cooldownDays: 14
      },
      {
        id: 'SRF-NOTIFY',
        tier: 'escalated',
        kind: 'CUSTOMER_CONTACT',
        template: 'Thông báo tiến độ cho {affected} khách đang chờ hoàn tiền.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: false,
        expectedReduction: 0.25,
        cooldownDays: 7
      }
    ]
  },

  MisleadingPromo: {
    category: 'PricePromotion',
    actions: [
      {
        id: 'MP-REVIEW-TERMS',
        tier: 'baseline',
        kind: 'INTERNAL_FIX',
        template: 'Rà soát điều kiện áp dụng của chương trình khuyến mãi đang chạy trên {channel}.',
        requires: ['channel'],
        worksWhen: ['FOCUSED', 'PARTIAL'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.25,
        cooldownDays: 21
      },
      {
        id: 'MP-FIX-COPY',
        tier: 'escalated',
        kind: 'INTERNAL_FIX',
        template: 'Sửa nội dung truyền thông khuyến mãi và ghi rõ điều kiện áp dụng.',
        requires: [],
        worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
        effortDays: 1,
        reversible: true,
        expectedReduction: 0.45,
        cooldownDays: 21
      }
    ]
  }
};

/**
 * Hành động mặc định theo danh mục, khi chưa xác định được nguyên nhân.
 * Vẫn có tham số: ít nhất phải nói được phạm vi và quy mô.
 */
const CATEGORY_FALLBACK = {
  Delivery: [
    {
      id: 'FB-DELIVERY',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Rà soát khâu giao vận trong {windowDays} ngày qua, {evidenceCount} phản hồi liên quan, tỉ lệ {currentRate} so với nền {baselineRate}.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 2,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  ProductQuality: [
    {
      id: 'FB-QUALITY',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Kiểm tra chất lượng hàng đang bán, {evidenceCount} phản hồi trong {windowDays} ngày, tập trung nhiều nhất ở {product}.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 2,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  CustomerService: [
    {
      id: 'FB-CS',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Rà soát nhật ký hội thoại CSKH trong {windowDays} ngày, {evidenceCount} phản hồi liên quan.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 2,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  Payment: [
    {
      id: 'FB-PAYMENT',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Đối soát log giao dịch thanh toán trong {windowDays} ngày, {evidenceCount} phản hồi liên quan.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 1,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  TechnicalApp: [
    {
      id: 'FB-TECH',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Kiểm tra nhật ký lỗi ứng dụng trong {windowDays} ngày, {evidenceCount} phản hồi liên quan.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 1,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  ReturnRefund: [
    {
      id: 'FB-REFUND',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Rà soát hàng đợi yêu cầu đổi trả và hoàn tiền, {evidenceCount} phản hồi trong {windowDays} ngày.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 2,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ],
  PricePromotion: [
    {
      id: 'FB-PROMO',
      tier: 'baseline',
      kind: 'INVESTIGATE',
      template: 'Rà soát chính sách giá và khuyến mãi đang áp dụng, {evidenceCount} phản hồi trong {windowDays} ngày.',
      requires: [],
      worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
      effortDays: 1,
      reversible: true,
      expectedReduction: 0.1,
      cooldownDays: 14
    }
  ]
};

const GENERIC_FALLBACK = {
  id: 'FB-GENERIC',
  tier: 'baseline',
  kind: 'INVESTIGATE',
  template: 'Phân công người phụ trách rà soát {evidenceCount} phản hồi thuộc nhóm này trong {windowDays} ngày qua.',
  requires: [],
  worksWhen: ['FOCUSED', 'PARTIAL', 'DIFFUSE'],
  effortDays: 1,
  reversible: true,
  expectedReduction: 0.05,
  cooldownDays: 14
};

const ACTION_COUNT = Object.values(LIBRARY).reduce((s, pb) => s + pb.actions.length, 0);

module.exports = {
  LIBRARY,
  CATEGORY_FALLBACK,
  GENERIC_FALLBACK,
  INSTRUMENTATION_ACTIONS,
  SLOTS,
  ACTION_COUNT
};
