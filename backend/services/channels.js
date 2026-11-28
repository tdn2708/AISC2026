/**
 * CHUẨN HÓA KÊNH BÁN HÀNG — hàm thuần
 * ==================================================================
 * Gom tên nguồn phản hồi, kênh đơn hàng và nền tảng livestream về một khóa chung
 * để tính phủ kênh theo các kênh mà shop thật sự đang bán (bỏ 'khac').
 */

const CHANNEL_LABELS = {
  shopee: 'Shopee',
  tiki: 'Tiki',
  tiktok: 'TikTok',
  lazada: 'Lazada',
  facebook: 'Facebook',
  website: 'Website',
  khac: 'Khác'
};

/**
 * Chuẩn hóa tên kênh bán về khóa thống nhất:
 * shopee, tiki, tiktok (gồm TikTok Shop và TikTok Live), lazada, facebook, website, khac.
 */
function channelKey(name) {
  const s = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
  if (!s) return 'khac';
  if (s.includes('shopee')) return 'shopee';
  if (s.includes('tiki')) return 'tiki';
  if (s.includes('tiktok') || /tik\s*tok/.test(s)) return 'tiktok';
  if (s.includes('lazada') || s.includes('lazmall')) return 'lazada';
  if (s.includes('facebook') || s.includes('fanpage') || s.includes('messenger') || /\bfb\b/.test(s)) return 'facebook';
  if (s.includes('website') || /\bweb\b/.test(s)) return 'website';
  return 'khac';
}

module.exports = { channelKey, CHANNEL_LABELS };
