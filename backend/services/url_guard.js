/**
 * CHỐT CHẶN ĐƯỜNG DẪN CHO THU THẬP (chống SSRF)
 * ------------------------------------------------------------------
 * `POST /api/scrape` nhận đường dẫn từ người ngoài rồi để máy chủ (hoặc
 * trình duyệt không giao diện) tự mở. Nếu không chặn, một đường dẫn trỏ về
 * 127.0.0.1, mạng nội bộ hay máy chủ siêu dữ liệu của nhà cung cấp đám mây
 * (169.254.169.254, 100.100.100.200) sẽ đọc được nội dung nội bộ.
 *
 * Quy tắc:
 *  - chỉ http/https, không kèm tài khoản:mật khẩu, chỉ cổng 80 và 443;
 *  - địa chỉ IP viết thẳng và MỌI địa chỉ mà tên miền phân giải ra phải là
 *    địa chỉ công khai (bao gồm cả IPv6 ánh xạ như ::ffff:127.0.0.1);
 *  - mỗi lần trình duyệt đi theo chuyển hướng cũng phải qua đúng kiểm tra này.
 */

const dns = require('dns');
const net = require('net');

const ALLOWED_PORTS = new Set(['', '80', '443']);

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** "a.b.c.d" -> [a,b,c,d] hoặc null */
function ipv4Bytes(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((x) => x <= 255) ? b : null;
}

function isBlockedIpv4(b) {
  const [a, c] = b;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && c >= 64 && c <= 127) ||
    (a === 169 && c === 254) ||
    (a === 172 && c >= 16 && c <= 31) ||
    (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) ||
    (a === 192 && c === 168) ||
    (a === 198 && (c === 18 || c === 19)) ||
    (a === 198 && c === 51 && b[2] === 100) ||
    (a === 203 && c === 0 && b[2] === 113)
  );
}

/** IPv6 dạng chữ -> 16 byte, hoặc null (hỗ trợ "::" và đuôi IPv4) */
function ipv6Bytes(text) {
  let s = text.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  let tail = [];
  const lastColon = s.lastIndexOf(':');
  const dotted = s.slice(lastColon + 1);
  if (dotted.includes('.')) {
    const v4 = ipv4Bytes(dotted);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part) => (part ? part.split(':') : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const total = head.length + rest.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;
  const groups = [...head, ...Array(8 - total).fill('0'), ...rest];
  const words = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (words.some(Number.isNaN)) return null;
  if (tail.length) {
    words[6] = tail[0];
    words[7] = tail[1];
  }
  return words.flatMap((w) => [w >> 8, w & 255]);
}

function isBlockedIpv6(w) {
  const allZero = (from, to) => w.slice(from, to).every((x) => x === 0);
  if (allZero(0, 16)) return true; // ::
  if (allZero(0, 15) && w[15] === 1) return true; // ::1
  // IPv4 nhúng trong IPv6: kiểm lại như địa chỉ IPv4
  if (allZero(0, 10) && w[10] === 255 && w[11] === 255) return isBlockedIpv4(w.slice(12)); // ::ffff:a.b.c.d
  if (allZero(0, 12)) return isBlockedIpv4(w.slice(12)); // ::a.b.c.d (cũ)
  if (w[0] === 0 && w[1] === 0x64 && w[2] === 0xff && w[3] === 0x9b && allZero(4, 12)) return isBlockedIpv4(w.slice(12)); // 64:ff9b::/96
  if (w[0] === 0x20 && w[1] === 0x02) return isBlockedIpv4(w.slice(2, 6)); // 2002::/16 (6to4)
  if ((w[0] & 0xfe) === 0xfc) return true; // fc00::/7
  if (w[0] === 0xfe && (w[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (w[0] === 0xfe && (w[1] & 0xc0) === 0xc0) return true; // fec0::/10
  if (w[0] === 0xff) return true; // ff00::/8
  if (w[0] === 0x20 && w[1] === 0x01 && w[2] === 0x0d && w[3] === 0xb8) return true; // 2001:db8::/32
  return false;
}

/** Địa chỉ IP (chữ) có thuộc dải nội bộ, loopback, link-local, dành riêng không. Không phải IP hợp lệ thì coi là bị chặn. */
function isBlockedIp(text) {
  const raw = String(text || '').replace(/^\[|\]$/g, '');
  const family = net.isIP(raw);
  if (family === 4) return isBlockedIpv4(ipv4Bytes(raw));
  if (family === 6) {
    const bytes = ipv6Bytes(raw);
    return bytes ? isBlockedIpv6(bytes) : true;
  }
  return true;
}

/** Kiểm tra không cần mạng: giao thức, tài khoản, cổng, tên máy nội bộ, IP viết thẳng */
function checkUrlSyntax(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new UnsafeUrlError('Đường dẫn không hợp lệ');
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new UnsafeUrlError('Chỉ hỗ trợ đường dẫn http/https');
  }
  if (u.username || u.password) throw new UnsafeUrlError('Đường dẫn không được kèm tài khoản hay mật khẩu');
  if (!ALLOWED_PORTS.has(u.port)) throw new UnsafeUrlError('Chỉ hỗ trợ cổng 80 và 443');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('Đường dẫn không hợp lệ');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Không thu thập từ địa chỉ nội bộ');
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new UnsafeUrlError('Không thu thập từ địa chỉ nội bộ');
  return u;
}

/**
 * Kiểm tra đầy đủ: cú pháp, rồi phân giải tên miền và chặn nếu BẤT KỲ địa chỉ nào
 * là nội bộ. `lookup` truyền vào được để kiểm thử không cần mạng.
 */
async function assertPublicUrl(raw, { lookup = dns.promises.lookup } = {}) {
  const u = checkUrlSyntax(raw);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return u;
  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('Không phân giải được tên miền');
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
    throw new UnsafeUrlError('Không thu thập từ địa chỉ nội bộ');
  }
  return u;
}

/** Trình duyệt không giao diện chỉ được bật khi chủ máy chủ cho phép (mặc định tắt: tốn khoảng 300 MB RAM) */
function browserScrapeEnabled(env = process.env) {
  return env.ALLOW_BROWSER_SCRAPE === '1';
}

module.exports = { isBlockedIp, checkUrlSyntax, assertPublicUrl, browserScrapeEnabled, UnsafeUrlError, ALLOWED_PORTS };
