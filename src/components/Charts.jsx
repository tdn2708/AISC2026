import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

/**
 * BIỂU ĐỒ
 * ------------------------------------------------------------------
 * Hai thay đổi so với bản cũ.
 *
 * 1. BỎ DONUT. Mắt người so sánh độ dài rất tốt và so sánh góc rất kém.
 *    Với bảy tới tám nhóm vấn đề, donut buộc người đọc đối chiếu qua
 *    lại giữa lát bánh và chú giải — mà chú giải lại đang bị cắt mất
 *    dòng dưới vì tràn khung. Thanh ngang xếp hạng bỏ hẳn bước đối
 *    chiếu đó, sắp sẵn theo thứ tự, và không bao giờ tràn.
 *
 * 2. MỘT MÀU CHO DỮ LIỆU CÙNG LOẠI. Bảy màu cầu vồng không mang thêm
 *    thông tin nào, vì thứ hạng đã do độ dài truyền tải rồi. Màu chỉ
 *    được dùng khi nó CÓ NGHĨA: đỏ cho khiếu nại, xanh cho hài lòng.
 */

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--raised)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-ctrl)',
  fontSize: '0.82rem',
  padding: '8px 12px'
};

const AXIS_TICK = { fontSize: 11, fill: 'var(--text-lo)' };

const PanelHead = ({ title, sub, right }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: '1rem', marginBottom: '1.25rem'
  }}>
    <div>
      <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, lineHeight: 1.35 }}>{title}</h3>
      <p style={{ color: 'var(--text-lo)', fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.45 }}>{sub}</p>
    </div>
    {right}
  </div>
);

export const TrendChart = ({ data = [] }) => (
  <div className="glass-panel" style={{ height: '100%' }}>
    <PanelHead
      title="Diễn biến theo thời gian"
      sub="Phản hồi tiêu cực so với phản hồi tích cực"
      right={
        <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.75rem', color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--sev-crit)' }} />Khiếu nại
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />Hài lòng
          </span>
        </div>
      }
    />
    <div style={{ height: 280, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* syncId: rê chuột trên biểu đồ này thì biểu đồ cạnh nó cùng
            hiện đúng mốc thời gian đó. Rẻ nhất mà tăng cảm giác chất
            lượng nhiều nhất. */}
        <AreaChart data={data} syncId="radar" margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fillComplaints" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sev-crit)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--sev-crit)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillSatisfaction" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Lưới mảnh, chỉ ngang: đường dọc không giúp đọc giá trị mà
              chỉ thêm nhiễu vào vùng dữ liệu. */}
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border-soft)" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            itemStyle={{ color: 'var(--text-hi)' }}
            labelStyle={{ color: 'var(--text-lo)', marginBottom: 4, fontSize: '0.75rem' }}
            cursor={{ stroke: 'var(--text-lo)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            name="Khiếu nại" type="monotone" dataKey="complaints"
            stroke="var(--sev-crit)" strokeWidth={2}
            fill="url(#fillComplaints)" fillOpacity={1}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
          <Area
            name="Hài lòng" type="monotone" dataKey="satisfaction"
            stroke="var(--accent)" strokeWidth={2}
            fill="url(#fillSatisfaction)" fillOpacity={1}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * Thanh xếp hạng thay cho donut.
 * Giữ nguyên tên export CategoryPieChart để không phải sửa nơi gọi.
 */
export const CategoryPieChart = ({ data = [] }) => {
  const rows = [...(data || [])]
    .filter((d) => (d?.value ?? 0) > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = rows.length ? rows[0].value : 0;

  return (
    <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PanelHead
        title="Nhóm vấn đề"
        sub={total > 0 ? `${total.toLocaleString('vi-VN')} phản hồi hợp lệ, xếp theo số lượng` : 'Phân bố theo chủ đề'}
      />

      {rows.length === 0 ? (
        /* Trạng thái rỗng phải nói rõ nó là rỗng, không phải đang tải
           hay đang lỗi — bản cũ không phân biệt ba trạng thái này. */
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-lo)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0'
        }}>
          Chưa có phản hồi nào đạt ngưỡng tin cậy trong kỳ này
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {rows.map((r) => {
            const pct = total ? (r.value / total) * 100 : 0;
            return (
              <div
                key={r.name}
                title={`${r.name}: ${r.value.toLocaleString('vi-VN')} phản hồi (${pct.toFixed(1)}%)`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 52px',
                  gap: '0.5rem 0.75rem',
                  alignItems: 'center'
                }}
              >
                <span style={{
                  gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-mid)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4
                }}>
                  {r.name}
                </span>
                <span style={{ background: 'var(--raised)', height: 14, borderRadius: 3, overflow: 'hidden' }}>
                  <span style={{
                    display: 'block', height: '100%',
                    width: `${max ? Math.max((r.value / max) * 100, 2) : 0}%`,
                    background: 'var(--accent)', borderRadius: 3,
                    transition: 'width 420ms var(--ease)'
                  }} />
                </span>
                <span className="data-num" style={{
                  fontSize: '0.76rem', color: 'var(--text-hi)', textAlign: 'right'
                }}>
                  {r.value.toLocaleString('vi-VN')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
