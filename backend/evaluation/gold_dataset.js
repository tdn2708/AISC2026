/**
 * TẬP CHUẨN ĐÁNH GIÁ (GOLD STANDARD)
 * ==================================================================
 *
 * NGUỒN GỐC VÀ GIỚI HẠN — đọc kỹ trước khi trích dẫn bất kỳ con số nào
 * sinh ra từ tập này:
 *
 *   - Đây là tập do NHÓM TỰ SOẠN VÀ TỰ GÁN NHÃN để kiểm chứng pipeline,
 *     KHÔNG phải bộ dữ liệu chuẩn đã công bố. Nó KHÔNG thay thế
 *     UIT-ViSFD. Muốn đối chuẩn với các công bố đã có thì phải chạy
 *     trên UIT-ViSFD (xem `loaders.js`).
 *   - Cỡ mẫu nhỏ (dưới 200 câu), nên khoảng tin cậy của F1 khá rộng.
 *     Con số đo được ở đây là "tín hiệu về việc pipeline có chạy đúng
 *     hướng không", không phải kết quả thực nghiệm công bố được.
 *   - Nhãn phản ánh phán đoán của người gán, không phải sự thật tuyệt
 *     đối — đặc biệt với nhãn "không xác thực", vì không có cách nào
 *     xác minh tuyệt đối một đánh giá là thật hay giả từ dữ liệu công khai.
 *
 * NGUYÊN TẮC SOẠN TẬP — quan trọng nhất về mặt phương pháp:
 *
 *   Câu trong tập này được viết ĐỘC LẬP với danh sách từ khóa của bộ
 *   phân loại luật. Nếu soạn tập bằng chính các từ khóa mà bộ phân loại
 *   đang tìm, F1 sẽ gần 1.0 và hoàn toàn vô nghĩa — ta chỉ đo được việc
 *   chuỗi ký tự có khớp chuỗi ký tự hay không.
 *
 *   Vì vậy tập cố tình chứa: cách diễn đạt vòng, phủ định, teencode,
 *   câu nhiều khía cạnh trái dấu, và câu mơ hồ. Điểm số thấp ở một số
 *   nhóm là KẾT QUẢ ĐÚNG cần báo cáo, không phải lỗi cần che.
 */

/**
 * Mỗi mục: { text, category, cause, sentiment }
 *   category/cause = null nghĩa là câu không phải khiếu nại thuộc
 *   taxonomy (khen ngợi, trung tính, hoặc ngoài phạm vi).
 */
const ASPECT_GOLD = [
  // ---------- Giao hàng: giao chậm ----------
  { text: 'Đặt từ thứ hai mà tới giờ vẫn chưa thấy tăm hơi đâu cả', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'Bên vận chuyển giữ hàng cả tuần không chịu đẩy đi', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'Dự kiến 3 ngày mà thực tế mất gần 2 tuần mới tới tay', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'Mua quà sinh nhật mà tới nơi thì tiệc tan lâu rồi', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'giao lâu ghê lun mn ơi, đợi mòn mỏi', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },

  // ---------- Giao hàng: hư hỏng khi vận chuyển ----------
  { text: 'Thùng carton bên ngoài nát bươm, bên trong cũng không còn nguyên', category: 'Delivery', cause: 'DamagedInTransit', sentiment: 'Negative' },
  { text: 'Nhận hàng thấy góc hộp bẹp dúm, chắc bị quăng quật dọc đường', category: 'Delivery', cause: 'DamagedInTransit', sentiment: 'Negative' },
  { text: 'Ly thủy tinh vỡ tan trong kiện, bọc mỗi lớp giấy mỏng dính', category: 'Delivery', cause: 'DamagedInTransit', sentiment: 'Negative' },

  // ---------- Giao hàng: thất lạc ----------
  { text: 'Hệ thống báo đã giao thành công nhưng tôi có nhận được gì đâu', category: 'Delivery', cause: 'LostPackage', sentiment: 'Negative' },
  { text: 'Kiện hàng biến mất ở kho trung chuyển, tra mãi không ra', category: 'Delivery', cause: 'LostPackage', sentiment: 'Negative' },

  // ---------- Giao hàng: sai địa chỉ ----------
  { text: 'Đơn của tôi lại được đem tới nhà người khác ở phường bên', category: 'Delivery', cause: 'WrongAddress', sentiment: 'Negative' },
  { text: 'Ghi rõ số nhà mà vẫn đưa nhầm sang tòa đối diện', category: 'Delivery', cause: 'WrongAddress', sentiment: 'Negative' },

  // ---------- Giao hàng: thái độ nhân viên giao hàng ----------
  { text: 'Anh giao hàng quăng gói đồ trước cổng rồi phóng đi luôn', category: 'Delivery', cause: 'CourierAttitude', sentiment: 'Negative' },
  { text: 'Bạn giao hàng nói năng trống không, gọi mà cứ như quát vào mặt', category: 'Delivery', cause: 'CourierAttitude', sentiment: 'Negative' },

  // ---------- Chất lượng sản phẩm: lỗi kỹ thuật ----------
  { text: 'Xài được đúng ba hôm là màn hình tối thui không lên nữa', category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative' },
  { text: 'Sạc đầy buổi sáng tới trưa đã báo yếu pin rồi', category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative' },
  { text: 'Cắm điện vào chẳng thấy đèn báo gì, coi như cục gạch', category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative' },
  { text: 'Nút bấm bị liệt một bên ngay từ lúc mở seal', category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative' },

  // ---------- Chất lượng sản phẩm: không đúng mô tả ----------
  { text: 'Trên hình thì xanh ngọc mà nhận về thành xanh lá đậm', category: 'ProductQuality', cause: 'NotAsDescribed', sentiment: 'Negative' },
  { text: 'Quảng cáo bảo chống nước mà dính chút mưa đã hỏng', category: 'ProductQuality', cause: 'NotAsDescribed', sentiment: 'Negative' },
  { text: 'Size ghi rộng rãi mà mặc vào chật kinh khủng', category: 'ProductQuality', cause: 'NotAsDescribed', sentiment: 'Negative' },

  // ---------- Chất lượng sản phẩm: thiếu phụ kiện ----------
  { text: 'Trong hộp chẳng có dây nào đi kèm như trong hình', category: 'ProductQuality', cause: 'MissingAccessory', sentiment: 'Negative' },
  { text: 'Bộ sản phẩm quảng cáo có tặng túi đựng mà mở ra chẳng thấy', category: 'ProductQuality', cause: 'MissingAccessory', sentiment: 'Negative' },

  // ---------- Chất lượng sản phẩm: nghi ngờ hàng giả ----------
  { text: 'Tem mác in lem nhem, nghi là đồ dựng chứ không phải chính hãng', category: 'ProductQuality', cause: 'SuspectedCounterfeit', sentiment: 'Negative' },
  { text: 'So với cái mua ở cửa hàng chính thức thì cái này khác hẳn, chắc đồ nhái', category: 'ProductQuality', cause: 'SuspectedCounterfeit', sentiment: 'Negative' },

  // ---------- Chất lượng sản phẩm: hết hạn / kém tươi ----------
  { text: 'Bịch bánh nhận về đã quá date hơn một tháng', category: 'ProductQuality', cause: 'ExpiredOrStale', sentiment: 'Negative' },
  { text: 'Rau héo rũ, lá vàng úa hết cả rồi', category: 'ProductQuality', cause: 'ExpiredOrStale', sentiment: 'Negative' },

  // ---------- Dịch vụ khách hàng: phản hồi chậm ----------
  { text: 'Nhắn cho shop ba ngày rồi mà vẫn im lặng không một dòng', category: 'CustomerService', cause: 'SlowResponse', sentiment: 'Negative' },
  { text: 'Bấm tổng đài chờ hai mươi phút rồi tự động ngắt máy', category: 'CustomerService', cause: 'SlowResponse', sentiment: 'Negative' },

  // ---------- Dịch vụ khách hàng: thái độ phục vụ ----------
  { text: 'Bạn nhân viên trả lời cộc lốc như đang bị làm phiền', category: 'CustomerService', cause: 'BadAttitude', sentiment: 'Negative' },
  { text: 'Hỏi kỹ chút là tỏ ra khó chịu ra mặt luôn', category: 'CustomerService', cause: 'BadAttitude', sentiment: 'Negative' },

  // ---------- Dịch vụ khách hàng: tư vấn sai thông tin ----------
  { text: 'Lúc mua thì bảo bảo hành hai năm, giờ lại nói chỉ có sáu tháng', category: 'CustomerService', cause: 'WrongInformation', sentiment: 'Negative' },
  { text: 'Nhân viên khẳng định máy dùng được sim hai, thực tế thì không', category: 'CustomerService', cause: 'WrongInformation', sentiment: 'Negative' },

  // ---------- Dịch vụ khách hàng: không giải quyết dứt điểm ----------
  { text: 'Bên này đẩy sang bên kia, cuối cùng chẳng ai đứng ra xử lý', category: 'CustomerService', cause: 'UnresolvedCase', sentiment: 'Negative' },
  { text: 'Hứa tuần sau trả lời, ba tuần rồi vẫn treo đó', category: 'CustomerService', cause: 'UnresolvedCase', sentiment: 'Negative' },

  // ---------- Thanh toán: lỗi cổng thanh toán ----------
  { text: 'Bấm đặt hàng thì hệ thống báo giao dịch thất bại liên tục', category: 'Payment', cause: 'GatewayError', sentiment: 'Negative' },
  { text: 'Chuyển sang thẻ khác cũng không xong, cổng cứ treo mãi', category: 'Payment', cause: 'GatewayError', sentiment: 'Negative' },

  // ---------- Thanh toán: trừ tiền hai lần ----------
  { text: 'Tài khoản bị trừ tới hai lần cho cùng một đơn', category: 'Payment', cause: 'DoubleCharge', sentiment: 'Negative' },
  { text: 'Ngân hàng báo hai giao dịch giống hệt nhau cách nhau một phút', category: 'Payment', cause: 'DoubleCharge', sentiment: 'Negative' },

  // ---------- Thanh toán: sai khuyến mãi ----------
  { text: 'Nhập mã giảm giá còn hạn mà hệ thống báo không hợp lệ', category: 'Payment', cause: 'WrongPromotion', sentiment: 'Negative' },
  { text: 'Chương trình ghi giảm 50k nhưng tới bước cuối chẳng thấy trừ đồng nào', category: 'Payment', cause: 'WrongPromotion', sentiment: 'Negative' },

  // ---------- Thanh toán: sai hóa đơn ----------
  { text: 'Hóa đơn xuất ra ghi sai tên công ty và mã số thuế', category: 'Payment', cause: 'WrongInvoice', sentiment: 'Negative' },

  // ---------- Kỹ thuật / Ứng dụng ----------
  { text: 'Mở ứng dụng lên là quay vòng vòng rồi thoát ra ngoài', category: 'TechnicalApp', cause: 'AppSlowOrCrash', sentiment: 'Negative' },
  { text: 'Lướt vài màn hình là ứng dụng đứng hình phải tắt đi bật lại', category: 'TechnicalApp', cause: 'AppSlowOrCrash', sentiment: 'Negative' },
  { text: 'Nhập đúng mật khẩu mà cứ báo sai, vào tài khoản không nổi', category: 'TechnicalApp', cause: 'LoginError', sentiment: 'Negative' },
  { text: 'Gõ tên món vào ô tìm kiếm mà chẳng ra kết quả nào', category: 'TechnicalApp', cause: 'SearchError', sentiment: 'Negative' },
  { text: 'Ảnh sản phẩm không hiện, toàn ô trắng trơn', category: 'TechnicalApp', cause: 'DisplayError', sentiment: 'Negative' },

  // ---------- Đổi trả & Hoàn tiền ----------
  { text: 'Gửi trả hàng từ đầu tháng, giờ cuối tháng tiền vẫn chưa về', category: 'ReturnRefund', cause: 'SlowRefund', sentiment: 'Negative' },
  { text: 'Shop viện đủ lý do để không nhận lại hàng dù còn nguyên seal', category: 'ReturnRefund', cause: 'ReturnRejected', sentiment: 'Negative' },
  { text: 'Muốn đổi cái áo mà phải qua năm bước, nản luôn', category: 'ReturnRefund', cause: 'ComplexProcess', sentiment: 'Negative' },

  // ---------- Giá & Khuyến mãi ----------
  { text: 'Cùng món này bên kia bán rẻ hơn cả trăm nghìn', category: 'PricePromotion', cause: 'HigherThanExpected', sentiment: 'Negative' },
  { text: 'Đội giá lên rồi treo biển giảm sâu, ai mà không biết', category: 'PricePromotion', cause: 'MisleadingPromo', sentiment: 'Negative' },

  // ================================================================
  // CÂU KHÔNG PHẢI KHIẾU NẠI — kiểm tra khả năng KHÔNG báo động nhầm
  // ================================================================
  { text: 'Hàng về sớm hơn dự kiến, đóng gói chắc chắn, rất ưng', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Dùng một tháng vẫn mượt, đáng đồng tiền bát gạo', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Bạn tư vấn nhiệt tình, giải thích cặn kẽ từng thắc mắc', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Chất vải mặc mát, form chuẩn như hình', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Giao nhanh bất ngờ, sáng đặt chiều đã có', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Đóng gói kỹ, bọc tận ba lớp chống sốc', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Shop hỗ trợ đổi size rất nhanh, không phải chờ lâu', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Máy chạy êm, pin trâu hơn cái cũ nhiều', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Sản phẩm tạm ổn, không có gì để chê mà cũng không có gì đặc biệt', category: null, cause: null, sentiment: 'Neutral' },
  { text: 'Cũng bình thường thôi, đúng với giá tiền bỏ ra', category: null, cause: null, sentiment: 'Neutral' },
  { text: 'Mình mua làm quà nên chưa mở ra dùng thử', category: null, cause: null, sentiment: 'Neutral' },
  { text: 'Đang cân nhắc mua thêm cái nữa cho người nhà', category: null, cause: null, sentiment: 'Neutral' },

  // ================================================================
  // CÂU KHÓ — phủ định, mỉa mai, nhiều khía cạnh trái dấu
  // Đây là nhóm phân biệt mô hình hiểu ngữ nghĩa với bộ khớp từ khóa
  // ================================================================
  // Phủ định: có từ khóa "chậm" nhưng ý là KHÔNG chậm
  { text: 'Lo là giao chậm mà hóa ra nhanh không tưởng', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Đọc bình luận sợ hàng hỏng, nhận về thì nguyên vẹn hoàn toàn', category: null, cause: null, sentiment: 'Positive' },
  { text: 'Không hề bị móp méo gì như mọi người nói', category: null, cause: null, sentiment: 'Positive' },

  // Mỉa mai
  { text: 'Giao hàng thần tốc ghê, có mỗi mười ngày thôi mà', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'Chất lượng tuyệt vời, dùng một hôm là hỏng rồi', category: 'ProductQuality', cause: 'TechnicalDefect', sentiment: 'Negative' },

  // Nhiều khía cạnh trái dấu — nhãn ghi khía cạnh TIÊU CỰC chính
  { text: 'Bạn giao hàng thì dễ thương lắm nhưng cái hộp thì móp hết một bên', category: 'Delivery', cause: 'DamagedInTransit', sentiment: 'Negative' },
  { text: 'Máy đẹp, chạy mượt, tiếc là giao trễ mất một tuần', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'Sản phẩm thì ổn mà khâu thanh toán trục trặc hoài', category: 'Payment', cause: 'GatewayError', sentiment: 'Negative' },
  { text: 'Giá hợp lý, đóng gói tốt, mỗi tội nhân viên trả lời hơi khó chịu', category: 'CustomerService', cause: 'BadAttitude', sentiment: 'Negative' },

  // Teencode nặng
  { text: 'sp ok nhma giao lâu qá, ship gì mà cả tuần lận', category: 'Delivery', cause: 'LateDelivery', sentiment: 'Negative' },
  { text: 'hàng về mà bể nát hết trơn, xu cà na thật sự', category: 'Delivery', cause: 'DamagedInTransit', sentiment: 'Negative' },
  { text: 'app lag muốn xỉu lun, bấm gì cũng đơ', category: 'TechnicalApp', cause: 'AppSlowOrCrash', sentiment: 'Negative' },
  { text: 'sốp ơi ib e ko rep gì hết vậy ạ', category: 'CustomerService', cause: 'SlowResponse', sentiment: 'Negative' },

  // Mơ hồ — nhiều người gán sẽ bất đồng, giữ lại để đo đúng độ khó
  { text: 'Không như mong đợi lắm', category: null, cause: null, sentiment: 'Negative' },
  { text: 'Thất vọng', category: null, cause: null, sentiment: 'Negative' },
  { text: 'Cũng được', category: null, cause: null, sentiment: 'Neutral' }
];

/**
 * TẬP NHÃN TRUST LAYER — ba lớp: hợp lệ / rác / nghi ngờ không xác thực.
 *
 * Nhắc lại giới hạn: nhãn "không xác thực" là PHÁN ĐOÁN của người gán
 * dựa trên dấu hiệu quan sát được, không phải sự thật đã xác minh. Do
 * đó chỉ số đo trên tập này phải được diễn giải là "mức độ đồng thuận
 * với đánh giá của con người", không phải "độ chính xác".
 */
const TRUST_GOLD = [
  // --- Hợp lệ: phản hồi thật, kể cả khi ngắn hoặc gay gắt ---
  { text: 'Giao hàng hơi chậm nhưng đóng gói cẩn thận, sản phẩm dùng ổn', label: 'valid' },
  { text: 'Máy dùng được ba ngày là hỏng, mình cần đổi trả gấp', label: 'valid' },
  { text: 'Nhân viên tư vấn sai thông tin bảo hành, rất bực mình', label: 'valid' },
  { text: 'Chất lượng tốt hơn mình nghĩ, sẽ ủng hộ shop lần sau', label: 'valid' },
  { text: 'Hộp bị móp một góc, mong shop rút kinh nghiệm khâu đóng gói', label: 'valid' },
  { text: 'Đợi hoàn tiền hai tuần rồi mà chưa thấy đâu cả', label: 'valid' },
  { text: 'Áo đẹp, vải mát, mặc vừa in luôn, cảm ơn shop nhiều', label: 'valid' },
  { text: 'Cổng thanh toán lỗi suốt buổi tối, mình phải đặt lại ba lần', label: 'valid' },

  // --- Rác / quảng cáo ---
  { text: 'Cần tuyển CTV bán hàng online sỉ lẻ toàn quốc, hoa hồng cao, inbox mình 0912345678', label: 'spam' },
  { text: 'Vay nhanh trong ngày, lãi suất thấp, giải ngân 30 phút, liên hệ zalo 0987654321', label: 'spam' },
  { text: 'Việc nhẹ lương cao làm tại nhà, thu nhập 500k mỗi ngày, ib mình để biết thêm', label: 'spam' },
  { text: 'Xả kho giá sốc, ib mình nhận mã giảm giá SALE50K, freeship toàn quốc nhé', label: 'spam' },

  // --- Rỗng nghĩa (nhận xu của sàn) ---
  { text: 'ok', label: 'spam' },
  { text: 'good', label: 'spam' },
  { text: '5 sao', label: 'spam' },
  { text: 'đẹp', label: 'spam' },

  // --- Nghi ngờ không xác thực: văn mẫu đánh giá thuê ---
  { text: 'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ ủng hộ tiếp', label: 'inauthentic' },
  { text: 'Shop uy tín, sản phẩm chất lượng, giao hàng nhanh chóng, mình sẽ giới thiệu bạn bè', label: 'inauthentic' },
  { text: 'Hàng kém chất lượng, shop lừa đảo, mọi người đừng mua ở đây, phí tiền', label: 'inauthentic' }
];

/**
 * Độ đồng thuận giữa người gán nhãn.
 *
 * TRUNG THỰC: tập hiện tại mới có MỘT người gán. Hệ số Cohen's kappa
 * chỉ tính được khi có tối thiểu hai người gán độc lập trên cùng tập.
 * Trường này để `null` cho tới khi quy trình gán nhãn đôi hoàn tất —
 * báo cáo một con số kappa khi chưa gán đôi là bịa số.
 */
const ANNOTATION_META = {
  annotators: 1,
  doubleAnnotated: false,
  cohensKappa: null,
  kappaNote:
    'Chưa tính được: cần tối thiểu hai người gán độc lập trên cùng tập. ' +
    'Quy trình gán đôi và phân xử bất đồng nằm ở mục A.2 của kế hoạch thực nghiệm.',
  guidelineNote:
    'Câu trong tập được soạn độc lập với danh sách từ khóa của bộ phân loại luật, ' +
    'để phép đo không bị vòng tròn.'
};

/**
 * CHIA TẬP PHÁT TRIỂN / TẬP KIỂM TRA
 * ==================================================================
 * Bắt buộc về mặt phương pháp. Nếu tinh chỉnh từ khóa rồi đo lại trên
 * chính tập đã dùng để tinh chỉnh, con số thu được chỉ nói lên rằng ta
 * đã học thuộc đáp án — và ta sẽ tự lừa mình chứ không lừa được ai khác.
 *
 *   - Tập PHÁT TRIỂN (dev): được phép xem khi sửa từ điển, từ khóa, ngưỡng.
 *   - Tập KIỂM TRA (test): GIỮ RIÊNG. Chỉ chạy để báo cáo. Không bao giờ
 *     được sửa luật dựa trên các câu trong tập này.
 *
 * Chia xen kẽ theo chỉ số để hai tập có phân phối nhãn tương đương, và
 * để kết quả tái lập được (không dùng số ngẫu nhiên).
 */
const ASPECT_DEV = ASPECT_GOLD.filter((_, i) => i % 5 < 2); // 40%
const ASPECT_TEST = ASPECT_GOLD.filter((_, i) => i % 5 >= 2); // 60%

module.exports = { ASPECT_GOLD, ASPECT_DEV, ASPECT_TEST, TRUST_GOLD, ANNOTATION_META };
