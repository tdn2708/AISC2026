/**
 * KHO NGỮ LIỆU PHẢN HỒI TIẾNG VIỆT
 * ==================================================================
 * Vì sao tách riêng tệp này: bộ sinh dữ liệu cũ chỉ có khoảng 20 câu
 * mẫu, dùng lại cho 568 phản hồi. Kết quả là cùng một câu xuất hiện
 * hàng chục lần trong bảng dữ liệu — nhìn vào biết ngay là dữ liệu bịa,
 * và tệ hơn, nó làm tầng phát hiện trùng lặp gần báo động giả vì dữ
 * liệu nền vốn đã trùng nhau sẵn.
 *
 * Ở đây mỗi nguyên nhân có nhiều khung câu, mỗi khung có nhiều biến thể
 * cho từng ô trống. Nhân tổ hợp lại cho ra hàng nghìn câu khác nhau,
 * gần với độ đa dạng của dữ liệu thật.
 */

/** Các ô trống dùng chung giữa nhiều khung câu */
const SLOTS = {
  open: ['', 'Shop ơi, ', 'Mình mua bên đây mà ', 'Lần đầu đặt mà ', 'Thật sự là ', 'Nói thật ', 'Chán quá, '],
  close: ['', ' ạ', ' nhé shop', ' mong shop xem lại', ' rất mong được giải quyết', '', '', ' thất vọng thật sự', ' lần sau chắc không dám mua nữa'],
  intensity: ['', 'rất ', 'khá ', 'cực kỳ ', 'hơi ', 'quá ', 'vô cùng '],
  duration: ['hai ngày', 'ba ngày', 'gần một tuần', 'hơn một tuần', 'mười ngày', 'gần nửa tháng', 'cả tháng'],
  timeRef: ['sáng nay', 'chiều qua', 'tối hôm kia', 'từ đầu tuần', 'mấy hôm nay', 'suốt từ hôm đặt'],
  positiveClose: ['', ' sẽ ủng hộ shop tiếp', ' cảm ơn shop nhiều', ' rất hài lòng', ' năm sao cho shop', ' đáng đồng tiền']
};

/**
 * Khung câu cho từng nguyên nhân cốt lõi.
 * `{slot}` được thay bằng một biến thể ngẫu nhiên khi sinh.
 */
const COMPLAINT_TEMPLATES = {
  LateDelivery: [
    '{open}đặt {duration} rồi mà vẫn chưa thấy hàng đâu{close}',
    '{open}đơn này giao {intensity}chậm, {timeRef} vẫn chưa có tin gì{close}',
    '{open}dự kiến giao trong ba ngày mà thực tế mất {duration}{close}',
    '{open}bên vận chuyển giữ hàng {duration} không chịu đẩy đi{close}',
    'Mua để kịp dịp mà tới nơi thì trễ mất rồi{close}',
    '{open}chờ {duration} mới nhận được, {intensity}lâu{close}',
    'Đơn hàng nằm ở kho {duration} không nhúc nhích{close}',
    '{open}giao hàng kiểu này thì ai dám đặt nữa{close}'
  ],
  DamagedInTransit: [
    '{open}thùng carton bên ngoài {intensity}nát, bên trong cũng không còn nguyên{close}',
    '{open}nhận hàng thấy góc hộp bẹp dúm, chắc bị quăng quật dọc đường{close}',
    'Hàng dễ vỡ mà chỉ bọc mỗi lớp giấy mỏng, tới nơi thì vỡ rồi{close}',
    '{open}kiện hàng rách toạc một bên, đồ bên trong xước hết{close}',
    'Mở ra thì thấy móp một góc, {intensity}tiếc{close}',
    '{open}đóng gói kiểu này thì hàng nào chịu nổi{close}'
  ],
  LostPackage: [
    '{open}hệ thống báo đã giao thành công nhưng tôi có nhận được gì đâu{close}',
    'Kiện hàng biến mất ở kho trung chuyển, tra {duration} không ra{close}',
    '{open}đơn báo giao rồi mà nhà không ai nhận cả{close}',
    'Mất hàng luôn, liên hệ bên vận chuyển thì không ai trả lời{close}'
  ],
  WrongAddress: [
    '{open}đơn của tôi lại được đem tới nhà người khác{close}',
    'Ghi rõ số nhà mà vẫn đưa nhầm sang tòa đối diện{close}',
    '{open}giao sai địa chỉ, phải tự đi lấy về{close}'
  ],
  CourierAttitude: [
    '{open}anh giao hàng quăng gói đồ trước cổng rồi phóng đi luôn{close}',
    'Bạn giao hàng nói năng trống không, gọi mà cứ như quát vào mặt{close}',
    '{open}nhân viên giao hàng thái độ {intensity}khó chịu{close}',
    'Gọi một cuộc rồi bỏ đi, không chờ được một phút{close}'
  ],
  TechnicalDefect: [
    '{open}xài được {duration} là màn hình tối thui không lên nữa{close}',
    'Sạc đầy buổi sáng tới trưa đã báo yếu pin rồi{close}',
    '{open}cắm điện vào chẳng thấy đèn báo gì, coi như cục gạch{close}',
    'Nút bấm bị liệt một bên ngay từ lúc mở seal{close}',
    '{open}dùng {duration} là hỏng, {intensity}thất vọng{close}',
    'Máy nóng bất thường khi dùng lâu, sợ cháy luôn{close}',
    '{open}mới mở hộp đã thấy không lên nguồn{close}'
  ],
  NotAsDescribed: [
    '{open}trên hình thì một kiểu, nhận về thì một kiểu khác hẳn{close}',
    'Quảng cáo bảo chống nước mà dính chút mưa đã hỏng{close}',
    '{open}size ghi rộng rãi mà mặc vào chật kinh khủng{close}',
    'Màu thực tế khác xa ảnh đăng, {intensity}khác{close}',
    '{open}mô tả một đằng giao một nẻo{close}'
  ],
  MissingAccessory: [
    '{open}trong hộp chẳng có dây nào đi kèm như trong hình{close}',
    'Bộ sản phẩm quảng cáo có tặng túi đựng mà mở ra chẳng thấy{close}',
    '{open}thiếu mất phụ kiện, phải mua thêm bên ngoài{close}'
  ],
  SuspectedCounterfeit: [
    '{open}tem mác in lem nhem, nghi là đồ dựng chứ không phải chính hãng{close}',
    'So với cái mua ở cửa hàng chính thức thì cái này khác hẳn{close}',
    '{open}chất lượng không giống hàng chính hãng chút nào{close}'
  ],
  ExpiredOrStale: [
    '{open}nhận về đã quá hạn hơn một tháng{close}',
    'Rau héo rũ, lá vàng úa hết cả rồi{close}',
    '{open}đồ ăn có mùi lạ, không dám dùng{close}'
  ],
  SlowResponse: [
    '{open}nhắn cho shop {duration} rồi mà vẫn im lặng không một dòng{close}',
    'Bấm tổng đài chờ hai mươi phút rồi tự động ngắt máy{close}',
    '{open}hỏi mãi không ai trả lời{close}',
    'Gửi tin nhắn {timeRef} tới giờ chưa được phản hồi{close}'
  ],
  BadAttitude: [
    '{open}bạn nhân viên trả lời cộc lốc như đang bị làm phiền{close}',
    'Hỏi kỹ chút là tỏ ra khó chịu ra mặt luôn{close}',
    '{open}thái độ phục vụ {intensity}kém{close}',
    'Nhân viên nói chuyện thiếu tôn trọng khách{close}'
  ],
  WrongInformation: [
    '{open}lúc mua thì bảo bảo hành hai năm, giờ lại nói chỉ có sáu tháng{close}',
    'Nhân viên khẳng định dùng được, thực tế thì không{close}',
    '{open}tư vấn sai làm tôi mua nhầm sản phẩm{close}'
  ],
  UnresolvedCase: [
    '{open}bên này đẩy sang bên kia, cuối cùng chẳng ai đứng ra xử lý{close}',
    'Hứa tuần sau trả lời, {duration} rồi vẫn treo đó{close}',
    '{open}khiếu nại mãi mà không ai giải quyết dứt điểm{close}'
  ],
  GatewayError: [
    '{open}bấm đặt hàng thì hệ thống báo giao dịch thất bại liên tục{close}',
    'Chuyển sang thẻ khác cũng không xong, cổng cứ treo mãi{close}',
    '{open}thanh toán mãi không được, thử {duration} rồi{close}',
    'Cổng thanh toán lỗi suốt {timeRef}, không đặt nổi đơn nào{close}'
  ],
  DoubleCharge: [
    '{open}tài khoản bị trừ tới hai lần cho cùng một đơn{close}',
    'Ngân hàng báo hai giao dịch giống hệt nhau cách nhau một phút{close}',
    '{open}trừ tiền hai lần mà đơn vẫn báo chưa thanh toán{close}'
  ],
  WrongPromotion: [
    '{open}nhập mã giảm giá còn hạn mà hệ thống báo không hợp lệ{close}',
    'Chương trình ghi giảm 50k nhưng tới bước cuối chẳng thấy trừ đồng nào{close}',
    '{open}mã khuyến mãi không dùng được{close}'
  ],
  WrongInvoice: [
    '{open}hóa đơn xuất ra ghi sai tên công ty và mã số thuế{close}',
    'Số tiền trên hóa đơn không khớp với số đã trả{close}'
  ],
  AppSlowOrCrash: [
    '{open}mở ứng dụng lên là quay vòng vòng rồi thoát ra ngoài{close}',
    'Lướt vài màn hình là ứng dụng đứng hình phải tắt đi bật lại{close}',
    '{open}app {intensity}chậm, dùng không nổi{close}',
    'Ứng dụng treo liên tục {timeRef}{close}'
  ],
  LoginError: [
    '{open}nhập đúng mật khẩu mà cứ báo sai, vào tài khoản không nổi{close}',
    'Đăng nhập mãi không được, đổi mật khẩu cũng vậy{close}'
  ],
  DisplayError: [
    '{open}ảnh sản phẩm không hiện, toàn ô trắng trơn{close}',
    'Giao diện vỡ hết, chữ chồng lên nhau{close}'
  ],
  SearchError: [
    '{open}gõ tên món vào ô tìm kiếm mà chẳng ra kết quả nào{close}',
    'Tìm sản phẩm có sẵn mà không thấy đâu{close}'
  ],
  SlowRefund: [
    '{open}gửi trả hàng từ đầu tháng, giờ cuối tháng tiền vẫn chưa về{close}',
    'Đợi hoàn tiền {duration} rồi mà chưa thấy đâu{close}',
    '{open}hoàn tiền {intensity}chậm{close}'
  ],
  ReturnRejected: [
    '{open}shop viện đủ lý do để không nhận lại hàng dù còn nguyên seal{close}',
    'Từ chối đổi trả dù lỗi từ phía shop{close}'
  ],
  ComplexProcess: [
    '{open}muốn đổi cái áo mà phải qua năm bước, nản luôn{close}',
    'Thủ tục đổi trả rườm rà quá mức cần thiết{close}'
  ],
  HigherThanExpected: [
    '{open}cùng món này bên kia bán rẻ hơn cả trăm nghìn{close}',
    'Giá {intensity}cao so với chất lượng nhận được{close}'
  ],
  MisleadingPromo: [
    '{open}đội giá lên rồi treo biển giảm sâu, ai mà không biết{close}',
    'Khuyến mãi ghi một đằng tính tiền một nẻo{close}'
  ]
};

/** Phản hồi tích cực — chiếm phần lớn dữ liệu thật */
const POSITIVE_TEMPLATES = [
  'Hàng về sớm hơn dự kiến, đóng gói chắc chắn{positiveClose}',
  'Dùng {duration} vẫn mượt, {intensity}ưng{positiveClose}',
  'Bạn tư vấn nhiệt tình, giải thích cặn kẽ từng thắc mắc{positiveClose}',
  'Chất vải mặc mát, form chuẩn như hình{positiveClose}',
  'Giao nhanh bất ngờ, sáng đặt chiều đã có{positiveClose}',
  'Đóng gói kỹ, bọc tận ba lớp chống sốc{positiveClose}',
  'Shop hỗ trợ đổi size rất nhanh, không phải chờ lâu{positiveClose}',
  'Máy chạy êm, pin trâu hơn cái cũ nhiều{positiveClose}',
  'Sản phẩm đúng mô tả, giá hợp lý{positiveClose}',
  'Shipper thân thiện, gọi trước khi giao{positiveClose}',
  'Mua lần thứ hai rồi, chất lượng vẫn ổn định{positiveClose}',
  'Đúng hàng chính hãng, có phiếu bảo hành đầy đủ{positiveClose}',
  'Giao đúng hẹn, sản phẩm nguyên vẹn{positiveClose}',
  'Giá tốt hơn mấy chỗ khác mà chất lượng không kém{positiveClose}',
  '{open}đóng gói cẩn thận, giao {timeRef} là nhận được{positiveClose}',
  'Dùng thử {duration} thấy ổn định, không có lỗi vặt{positiveClose}',
  '{open}shop phản hồi nhanh, hỏi gì cũng trả lời kỹ{positiveClose}',
  'Hàng đẹp hơn mong đợi, đúng như hình đăng{positiveClose}',
  '{open}chất lượng xứng đáng với số tiền bỏ ra{positiveClose}',
  'Lần thứ ba mua ở shop rồi, vẫn tin tưởng{positiveClose}',
  '{open}giao hàng nhanh, sản phẩm nguyên seal{positiveClose}',
  'Tư vấn đúng nhu cầu, không cố bán hàng đắt{positiveClose}'
];

/** Phản hồi trung tính — không khen không chê rõ ràng */
const NEUTRAL_TEMPLATES = [
  '{open}sản phẩm tạm ổn, không có gì để chê mà cũng không có gì đặc biệt{close}',
  '{open}cũng bình thường thôi, đúng với giá tiền bỏ ra{close}',
  'Mình mua làm quà nên chưa mở ra dùng thử{close}',
  '{open}hàng giống mô tả, chưa dùng nhiều nên chưa đánh giá được{close}',
  'Đang cân nhắc mua thêm cái nữa cho người nhà{close}',
  '{open}tạm được, chắc phải dùng thêm {duration} mới biết{close}',
  'Chưa thấy vấn đề gì, nhưng cũng chưa có gì ấn tượng{close}',
  '{open}dùng {duration} rồi, cảm giác bình thường{close}',
  'Không tệ mà cũng không xuất sắc, đúng tầm giá{close}',
  '{open}giao đúng hẹn, sản phẩm thì {intensity}bình thường{close}',
  'Mua theo gợi ý của bạn bè, chưa có nhận xét gì thêm{close}',
  '{open}chắc phải dùng thêm mới biết bền hay không{close}'
];

/** Nội dung quảng cáo và bot trên fanpage */
const AD_TEMPLATES = [
  'Cần tuyển CTV bán hàng online sỉ lẻ toàn quốc, hoa hồng cao, inbox mình {phone}',
  'Vay nhanh trong ngày, lãi suất thấp, giải ngân 30 phút, liên hệ zalo {phone}',
  'Việc nhẹ lương cao làm tại nhà, thu nhập 500k mỗi ngày, ib mình {phone}',
  'Xả kho giá sốc, ib nhận mã giảm giá SALE50K, freeship toàn quốc',
  'Nhận đặt hàng Quảng Châu giá gốc, cam kết rẻ nhất thị trường, lh {phone}',
  'Bên mình chuyên sỉ mỹ phẩm chính hãng, ai cần ib nhé {phone}'
];

/** Đánh giá rỗng nghĩa, phát sinh từ cơ chế thưởng xu của sàn */
const EMPTY_TEMPLATES = ['ok', 'oke', 'tốt', 'đẹp', '5 sao', 'good', 'ok shop', 'ổn', 'hài lòng', 'tuyệt', 'ok nha', '👍'];

/**
 * Văn mẫu đánh giá thuê. Đặc điểm: khen chung chung, đủ mọi khía cạnh,
 * không nhắc chi tiết cụ thể nào — vì người viết chưa từng dùng sản phẩm.
 */
const SEEDING_TEMPLATES = [
  'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ ủng hộ tiếp',
  'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói kỹ, mình rất hài lòng sẽ ủng hộ tiếp',
  'Sản phẩm tốt lắm, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ mua tiếp',
  'Shop uy tín, sản phẩm chất lượng, giao hàng nhanh chóng, mình sẽ giới thiệu bạn bè'
];

/** Đánh giá hạ uy tín do đối thủ đặt */
const SMEAR_TEMPLATES = [
  'Hàng kém chất lượng, shop lừa đảo, mọi người đừng mua ở đây, phí tiền',
  'Hàng kém chất lượng, shop lừa đảo, mọi người tránh xa shop này ra, phí tiền',
  'Hàng quá kém chất lượng, shop lừa đảo, mọi người đừng mua của shop này, phí tiền'
];

/**
 * Biến đổi teencode. Áp dụng cho một phần dữ liệu để phản ánh đúng cách
 * người Việt viết trên mạng — và để bước chuẩn hóa có việc thật để làm.
 */
const TEENCODE_MAP = [
  [/\bkhông\b/g, 'ko'], [/\bđược\b/g, 'dc'], [/\brồi\b/g, 'r'],
  [/\bvới\b/g, 'vs'], [/\bmình\b/g, 'mk'], [/\bsản phẩm\b/g, 'sp'],
  [/\bquá\b/g, 'wa'], [/\bgì\b/g, 'j'], [/\bvậy\b/g, 'z'],
  [/\bcũng\b/g, 'cx'], [/\bnhưng mà\b/g, 'nhma'], [/\bluôn\b/g, 'lun'],
  [/\bbiết\b/g, 'bit'], [/\bshop\b/g, 'sốp'], [/\bnhé\b/g, 'nhaa']
];

module.exports = {
  SLOTS,
  COMPLAINT_TEMPLATES,
  POSITIVE_TEMPLATES,
  NEUTRAL_TEMPLATES,
  AD_TEMPLATES,
  EMPTY_TEMPLATES,
  SEEDING_TEMPLATES,
  SMEAR_TEMPLATES,
  TEENCODE_MAP
};
