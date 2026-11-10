/**
 * MUỐI BĂM MÃ KHÁCH (PII_SALT)
 * ==================================================================
 * Mã khách của sàn là số tuần tự. Băm với muối công khai (giá trị mặc định
 * trong mã nguồn) thì ai có mã nguồn cũng dò ngược ra tài khoản thật. Vì vậy
 * mọi đường ghi dữ liệu thật đều cần một muối bí mật.
 *
 * Nguồn muối, theo thứ tự:
 *  1. Biến môi trường PII_SALT (nếu đặt và khác giá trị mặc định công khai).
 *  2. Tài liệu meta._id='pii_salt' trong kho thật. Muối nằm cạnh dữ liệu mà
 *     nó bảo vệ, trong cùng ranh giới tin cậy với MONGODB_URI (ai đọc được
 *     database thì đã thấy dữ liệu), và không lộ qua API nào: không route nào
 *     trả collection meta ra ngoài.
 *
 * Nhờ (2), máy chủ triển khai mới không cần ai đặt tay biến môi trường mà
 * vẫn băm khớp với dữ liệu đã có. Nạp xong thì gán vào process.env.PII_SALT,
 * để ingest.js và livestream (đọc biến này lúc băm) dùng chung một giá trị.
 */

const PUBLIC_DEFAULTS = new Set(['customer-radar', 'live']);
const DOC_ID = 'pii_salt';

const isSecret = (v) => typeof v === 'string' && v.length >= 16 && !PUBLIC_DEFAULTS.has(v);

/** Muối bí mật đã sẵn sàng trong tiến trình này chưa */
const saltReady = () => isSecret(process.env.PII_SALT);

/**
 * Gọi một lần lúc khởi động, trước khi nhận request ghi dữ liệu.
 * Trả về nguồn muối: 'env' | 'db' | null (chưa có).
 */
async function loadSalt(realDb) {
  if (saltReady()) return 'env';
  try {
    const doc = await realDb.collection('meta').findOne({ _id: DOC_ID }, { projection: { value: 1 } });
    if (isSecret(doc?.value)) {
      process.env.PII_SALT = doc.value;
      return 'db';
    }
  } catch (e) {
    console.warn('Không đọc được muối băm từ database:', e.message);
  }
  return null;
}

module.exports = { loadSalt, saltReady, isSecret, DOC_ID };
