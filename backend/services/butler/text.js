/**
 * XỬ LÝ VĂN BẢN VÀ THỜI GIAN CHO QUẢN GIA (HÀM THUẦN)
 * ==================================================================
 * Mọi hàm ở đây không phụ thuộc mạng hay cơ sở dữ liệu để kiểm thử trực tiếp.
 */

const vnFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** Chữ thường, bỏ dấu tiếng Việt, đ thành d, gộp khoảng trắng, cắt hai đầu */
function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cắt một dòng quá dài theo khoảng trắng gần nhất; không có khoảng trắng thì cắt cứng */
function splitLongLine(line, max) {
  const out = [];
  let rest = line;
  while (rest.length > max) {
    let idx = rest.lastIndexOf(' ', max);
    if (idx <= 0) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    } else {
      out.push(rest.slice(0, idx).trim());
      rest = rest.slice(idx + 1).trimStart();
    }
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/** Cắt văn bản thành các phần tối đa max ký tự (mặc định 2000 cho Zalo) */
function chunk(text, max = 2000) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const rawLines = raw.split(/\r?\n/);
  const pieces = [];
  for (const line of rawLines) {
    if (line.length <= max) {
      pieces.push(line);
    } else {
      pieces.push(...splitLongLine(line, max));
    }
  }

  const chunks = [];
  let cur = '';
  for (const p of pieces) {
    if (!cur) {
      cur = p;
    } else if (cur.length + 1 + p.length <= max) {
      cur += '\n' + p;
    } else {
      const trimmed = cur.trim();
      if (trimmed) chunks.push(trimmed);
      cur = p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(Boolean);
}

/** Làm sạch markdown sang chữ thường cho tin nhắn Zalo */
function plain(markdown) {
  return String(markdown ?? '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^\p{L}\p{N}])_([^_\n]+)_(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[•*][ \t]+/gm, '- ')
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tách giờ, phút, ngày Việt Nam (Asia/Ho_Chi_Minh) */
function vnParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = {};
  for (const p of vnFormatter.formatToParts(d)) {
    parts[p.type] = p.value;
  }
  const hour = Number(parts.hour || 0) % 24;
  const minute = Number(parts.minute || 0);
  const year = parts.year || '1970';
  const month = parts.month || '01';
  const day = parts.day || '01';
  return {
    hour,
    minute,
    day,
    month,
    year,
    hm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    ymd: `${year}-${month}-${day}`
  };
}

/** Kiểm tra giờ hiện tại có nằm trong khung giờ yên lặng không */
function inQuiet(hour, from, to) {
  const h = Number(hour);
  const f = Number(from);
  const t = Number(to);
  if (f === t) return false;
  if (f < t) return h >= f && h < t;
  return h >= f || h < t;
}

/** Tên mức độ bằng tiếng Việt */
function severityWord(sev) {
  if (sev === 'critical') return 'Nghiêm trọng';
  if (sev === 'high') return 'Cao';
  return 'Chú ý';
}

/** Đổi mức độ của động cơ cảnh báo sang chuẩn quản gia */
function fromAlertSeverity(s) {
  if (s === 'Critical' || s === 'critical') return 'critical';
  if (s === 'High' || s === 'high') return 'high';
  return 'medium';
}

/** Khoảng thời gian tương đối bằng chữ tiếng Việt */
function ago(date, now = new Date()) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  const n = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime()) || Number.isNaN(n.getTime())) return '—';
  const diffSec = Math.max(0, Math.floor((n.getTime() - d.getTime()) / 1000));
  if (diffSec < 60) return 'vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

/** Ngày dd/mm theo múi giờ Việt Nam */
function viDate(date = new Date()) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const { day, month } = vnParts(d);
  return `${day}/${month}`;
}

/** Giờ HH:MM theo múi giờ Việt Nam */
function viTime(date = new Date()) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return vnParts(d).hm;
}

/**
 * Giờ hiển thị theo giờ Việt Nam: trả "20:00" nếu cùng ngày với `now`,
 * "20:00 ngày 18/11" nếu khác ngày.
 */
function vnTime(date, now = new Date()) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  const n = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime()) || Number.isNaN(n.getTime())) return '—';
  const p = vnParts(d);
  const np = vnParts(n);
  if (p.ymd === np.ymd) return p.hm;
  return `${p.hm} ngày ${p.day}/${p.month}`;
}

/** Đổi thời lượng mili giây sang chữ tiếng Việt ("2 giờ 15 phút"), null nếu không hợp lệ */
function formatDurationWords(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return null;
  const totalMin = Math.max(1, Math.round(Number(ms) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

/** Cắt phần đầu của dòng mô tả (`why`) nếu lặp lại đúng tiêu đề (`title`) */
function stripTitlePrefix(title, why) {
  const t = String(title || '').trim();
  let w = String(why || '').trim();
  if (!t || !w) return w;
  if (w.toLowerCase().startsWith(t.toLowerCase())) {
    w = w.slice(t.length).replace(/^[\s,:;.-]+/, '');
    if (w) w = w.charAt(0).toUpperCase() + w.slice(1);
  }
  return w;
}

module.exports = {
  fold,
  chunk,
  plain,
  vnParts,
  inQuiet,
  severityWord,
  fromAlertSeverity,
  ago,
  viDate,
  viTime,
  vnTime,
  formatDurationWords,
  stripTitlePrefix
};
