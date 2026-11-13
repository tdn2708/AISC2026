import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { REPORT, REPORT_VARS, fmtInt } from '../report_kit';
import { LogoMark } from '../Logo';
import { pctVi } from '../../lib/reportModel';
import './report.css';

/**
 * BẢN BÁO CÁO IN, TỰ DÀN TRANG A4
 * ==================================================================
 * Nội dung là một dòng các KHỐI (tóm tắt, bảng chỉ số, hình, bảng...).
 * Lượt đầu, mọi khối được dựng trong một cột ẩn đúng bề ngang trang để
 * đo chiều cao; sau đó khối được xếp lần lượt vào các tờ A4 (794 x 1123
 * px), hết chỗ thì sang tờ mới. Tiêu đề luôn đi cùng khối ngay sau nó;
 * một khối có thể ép sang tờ mới bằng breakBefore. Số trang tùy dữ liệu.
 *
 * Khi xếp xong, phần tử gốc mang data-ready="1": Reports.jsx chờ cờ này
 * rồi mới chụp từng tờ [data-page] thành một trang PDF.
 */

const toneClass = (tone) => (tone === 'good' ? 'rpt-good' : tone === 'bad' ? 'rpt-bad' : tone === 'warn' ? 'rpt-warn' : 'rpt-muted');

/* ------------------------------------------------------------------ */
/* Khung một tờ                                                        */
/* ------------------------------------------------------------------ */

function Sheet({ n, total, meta, section, cover, children, flowRef }) {
  return (
    <section data-page={n || undefined} className={`rpt-page${cover ? ' is-cover' : ''}`} aria-label={n ? `Trang ${n}` : undefined}>
      {cover ? <Cover meta={meta} /> : (
        <header className="rpt-run">
          <span>{meta.title}</span>
          <span>{section}</span>
        </header>
      )}
      <div className="rpt-flow" ref={flowRef}>{children}</div>
      <footer className="rpt-foot">
        <span>Customer Radar. Tài liệu nội bộ, lập lúc {meta.generatedAt}.</span>
        <span className="rpt-folio">{n || ''}{total ? <span className="rpt-muted"> / {total}</span> : null}</span>
      </footer>
    </section>
  );
}

function Cover({ meta }) {
  return (
    <div className="rpt-cover">
      <div className="rpt-band">
        <div className="rpt-band-brand">
          <LogoMark size={24} colors={{ ink: REPORT.logoInk, dot: REPORT.logoDot }} />
          <span>Customer Radar</span>
        </div>
        <div>
          <h1>{meta.title}</h1>
          <p className="rpt-band-sub">{meta.period}{meta.range ? `, dữ liệu từ ${meta.range}` : ''}</p>
        </div>
      </div>
      <dl className="rpt-facts">
        <div><dt>Kho dữ liệu</dt><dd>{meta.workspace}</dd></div>
        <div><dt>Kênh</dt><dd>{meta.source}</dd></div>
        <div><dt>Sản phẩm</dt><dd>{meta.product}</dd></div>
        <div><dt>Ngày lập</dt><dd>{meta.generatedAt.split(',')[0]}</dd></div>
      </dl>
      {meta.simulated && (
        <p className="rpt-small rpt-sim">
          Lập trên kho Mô phỏng: dữ liệu sinh tự động có cài sẵn sự cố để kiểm chứng hệ thống, không phải phản hồi của khách hàng thật.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Biểu đồ                                                             */
/* ------------------------------------------------------------------ */

function niceStep(raw) {
  // Đếm phản hồi là số nguyên: bước chia nhỏ hơn 1 sẽ in ra "1, 1, 2, 2"
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/**
 * Đường khiếu nại và hài lòng. SVG chỉ vẽ nét; chữ là HTML đặt tuyệt đối,
 * vì html2canvas chụp SVG như một ảnh rời, không mang theo webfont.
 */
function TrendChart({ series, peak, peakLabel, width = 674, height = 236 }) {
  if (!series.length) return <p className="rpt-muted">Chưa có dữ liệu theo thời gian trong phạm vi lọc.</p>;
  const padL = 40;
  const padR = 96;
  const padT = 24;
  const padB = 28;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const max = Math.max(1, ...series.map((d) => Math.max(d.complaints, d.satisfaction)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const x = (i) => padL + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v) => padT + h - (v / top) * h;
  const path = (key) => series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const last = series.length - 1;
  const everyX = Math.max(1, Math.ceil(series.length / 8));
  const peakIdx = peak ? series.findIndex((d) => d.name === peak.name) : -1;

  let yC = y(series[last].complaints);
  let yS = y(series[last].satisfaction);
  if (Math.abs(yC - yS) < 16) {
    const mid = (yC + yS) / 2;
    if (yC >= yS) { yC = mid + 8; yS = mid - 8; } else { yC = mid - 8; yS = mid + 8; }
  }

  return (
    <div className="rpt-chart" style={{ width, height }}>
      <svg width={width} height={height} aria-hidden="true">
        {ticks.map((t) => (
          <line key={t} x1={padL} x2={padL + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? REPORT.ink : REPORT.ruleSoft} strokeWidth="1" />
        ))}
        <path d={path('satisfaction')} fill="none" stroke={REPORT.ink3} strokeWidth="1.75" strokeLinejoin="round" />
        <path d={path('complaints')} fill="none" stroke={REPORT.brand} strokeWidth="2.25" strokeLinejoin="round" />
        {peakIdx >= 0 && (
          <>
            <line x1={x(peakIdx)} x2={x(peakIdx)} y1={y(series[peakIdx].complaints) - 5} y2={padT - 8} stroke={REPORT.ink} strokeWidth="1" />
            <circle cx={x(peakIdx)} cy={y(series[peakIdx].complaints)} r="3.5" fill={REPORT.brand} />
          </>
        )}
      </svg>
      {ticks.map((t) => (
        <span key={t} className="lbl y" style={{ left: 0, top: y(t) - 6 }}>{fmtInt(t)}</span>
      ))}
      {series.map((d, i) => (i % everyX === 0 || i === last) && (
        <span key={d.name} className="lbl x" style={{ left: x(i), top: padT + h + 10 }}>{d.name}</span>
      ))}
      <span className="lbl end" style={{ left: x(last) + 8, top: yC - 6, color: REPORT.brand }}>Khiếu nại {fmtInt(series[last].complaints)}</span>
      <span className="lbl end is-quiet" style={{ left: x(last) + 8, top: yS - 6 }}>Hài lòng {fmtInt(series[last].satisfaction)}</span>
      {peakIdx >= 0 && (
        <span
          className="lbl peak"
          style={x(peakIdx) > padL + w / 2 ? { right: width - x(peakIdx) + 6, top: padT - 16 } : { left: x(peakIdx) + 6, top: padT - 16 }}
        >
          {peak.name}: {fmtInt(peak.value)} khiếu nại{peakLabel ? `, ${peakLabel.toLowerCase()}` : ''}
        </span>
      )}
    </div>
  );
}

const InlineBar = ({ value, strong }) => (
  <span className="rpt-ibar" aria-hidden="true">
    <span className={strong ? 'is-strong' : ''} style={{ width: `${Math.min(100, Math.max(1, value * 100))}%` }} />
  </span>
);

const Source = ({ children }) => <p className="rpt-source">{children}</p>;

/* ------------------------------------------------------------------ */
/* Các khối nội dung                                                   */
/* ------------------------------------------------------------------ */

function buildBlocks(model) {
  const { ledger } = model;
  const B = [];
  const add = (id, section, node, opts = {}) => B.push({ id, section, node, space: 28, ...opts });

  // ---------- Tóm tắt ----------
  add('summary', 'Tóm tắt điều hành', (
    <div className="rpt-exec">
      <div>
        <h2 className="rpt-h2">Tóm tắt điều hành</h2>
        <div className="rpt-findings">
          {model.findings.map((f) => (
            <p key={f.lead}><strong>{f.lead}</strong> {f.text}</p>
          ))}
        </div>
      </div>
      {ledger && (
        <aside className="rpt-ledger" aria-label="Sổ đối chiếu">
          <h3>Số liệu này đứng trên gì</h3>
          <table>
            <tbody>
              <tr><td>Phản hồi thu thập được</td><td className="num">{fmtInt(ledger.raw)}</td></tr>
              {ledger.rows.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td className="num">{r.value ? `−${fmtInt(r.value)}` : '0'}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Được tính vào chỉ số</td><td className="num">{fmtInt(ledger.counted)}</td></tr>
            </tfoot>
          </table>
          <p className={`rpt-check ${ledger.diff === 0 ? '' : 'rpt-bad'}`}>
            {ledger.diff === 0
              ? <>Phép trừ khớp: {fmtInt(ledger.raw)} trừ {fmtInt(ledger.removed)} đúng bằng {fmtInt(ledger.counted)}.</>
              : <>Phép trừ lệch {fmtInt(Math.abs(ledger.diff))} phản hồi so với số được tính.</>}
            {ledger.pendingCounted > 0 && <> {fmtInt(ledger.pendingCounted)} phản hồi chờ duyệt vẫn được tính tạm theo trọng số.</>}
            {model.verifiedShare != null && <> {pctVi(model.verifiedShare, 0)} số được tính có chứng từ mua hàng hoặc đã được người duyệt.</>}
          </p>
        </aside>
      )}
    </div>
  ), { space: 0 });

  add('kpi', 'Tóm tắt điều hành', (
    <div>
      <table className="rpt-table rpt-kpi">
        <caption>Bảng 1. Chỉ số chính{model.comparisonLabel ? `, ${model.comparisonLabel.toLowerCase()}` : ''}</caption>
        <thead>
          <tr>
            <th style={{ width: '36%' }}>Chỉ số</th>
            <th className="num">Toàn kỳ</th>
            <th className="num">{model.windowLabel} gần nhất</th>
            <th className="num">{model.windowLabel} trước đó</th>
            <th className="num">Thay đổi</th>
          </tr>
        </thead>
        <tbody>
          {model.kpis.map((k) => (
            <tr key={k.label}>
              <td>{k.label}<span className="rpt-sub">{k.note}</span></td>
              <td className="num rpt-strong">{k.value}</td>
              <td className="num">{k.cur}{k.approx ? '*' : ''}</td>
              <td className="num">{k.prev}{k.approx ? '*' : ''}</td>
              <td className={`num ${toneClass(k.delta.tone)}`}>{k.delta.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Source>
        {model.approximation ? `* ${model.approximation} ` : ''}
        Nguồn: Customer Radar, phản hồi đã qua tầng kiểm soát tin cậy.
      </Source>
    </div>
  ));

  // ---------- 1. Diễn biến ----------
  add('trend-h', '1. Diễn biến khiếu nại', <h2 className="rpt-h2">{model.titles.trend}</h2>, { keepWithNext: true, space: 36 });
  add('trend', '1. Diễn biến khiếu nại', (
    <figure>
      <figcaption className="rpt-cap">Hình 1. Số phản hồi khiếu nại và hài lòng theo thời gian</figcaption>
      <TrendChart series={model.trend.series} peak={model.trend.peak} peakLabel={model.trend.peakLabel} />
      <Source>
        Nguồn: Customer Radar, phản hồi đã qua tầng kiểm soát tin cậy, gom theo mốc trên trục ngang.
        {model.trend.peak ? ' Mốc được đánh dấu có nhiều khiếu nại nhất, cao hơn trung bình cả kỳ từ 30% trở lên.' : ''}
      </Source>
    </figure>
  ), { space: 14 });

  // ---------- 2. Nhóm vấn đề ----------
  add('cat-h', '2. Nhóm vấn đề', <h2 className="rpt-h2">{model.titles.categories}</h2>, { keepWithNext: true, space: 36 });
  add('cat', '2. Nhóm vấn đề', model.categories.length ? (
    <div>
      <table className="rpt-table">
        <caption>Bảng 2. Khiếu nại theo nhóm vấn đề, xếp theo số phản hồi</caption>
        <thead>
          <tr>
            <th>Nhóm vấn đề</th>
            <th className="num">Số phản hồi</th>
            <th className="num">Tỉ trọng</th>
            <th className="num">Lũy kế</th>
            <th style={{ width: 150 }} />
          </tr>
        </thead>
        <tbody>
          {model.categories.map((c) => (
            <tr key={c.name}>
              <td className={c.vital ? 'rpt-strong' : ''}>{c.name}</td>
              <td className="num">{fmtInt(c.value)}</td>
              <td className="num">{pctVi(c.share, 1)}</td>
              <td className="num">{pctVi(c.cumulative, 1)}</td>
              <td><InlineBar value={c.share} strong={c.vital} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Tổng phản hồi có nêu vấn đề</td><td className="num">{fmtInt(model.issueTotal)}</td><td className="num">100%</td><td colSpan={2} /></tr>
        </tfoot>
      </table>
      <Source>
        {model.vitalFew} nhóm in đậm chiếm khoảng 80% khối lượng khiếu nại.
        {model.noIssue > 0 ? ` Ngoài bảng còn ${fmtInt(model.noIssue)} phản hồi được tính nhưng không gắn nhóm vấn đề nào.` : ''}
      </Source>
    </div>
  ) : <p className="rpt-muted">Chưa có phản hồi nào gắn nhóm vấn đề trong phạm vi lọc.</p>, { space: 14 });

  // ---------- 3. Nguyên nhân ----------
  add('cause-h', '3. Nguyên nhân', <h2 className="rpt-h2">{model.titles.causes}</h2>, { keepWithNext: true, space: 36 });
  add('cause', '3. Nguyên nhân', model.causes.length ? (
    <div>
      <table className="rpt-table">
        <caption>Bảng 3. Mười nguyên nhân gặp nhiều nhất, bóc tách từ {fmtInt(model.causeTotal)} phản hồi khiếu nại</caption>
        <thead>
          <tr>
            <th>Nguyên nhân</th>
            <th>Nhóm vấn đề</th>
            <th className="num">Số phản hồi</th>
            <th className="num">Tỉ trọng</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {model.causes.map((c) => (
            <tr key={`${c.category}-${c.cause}`}>
              <td className={c.rank <= 3 ? 'rpt-strong' : ''}>{c.cause}</td>
              <td className="rpt-muted">{c.category}</td>
              <td className="num">{fmtInt(c.count)}</td>
              <td className="num">{pctVi(c.share, 1)}</td>
              <td><InlineBar value={c.share / Math.max(0.0001, model.causes[0].share)} strong={c.rank <= 3} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Source>Nguồn: Customer Radar. Một phản hồi có thể nêu nhiều nguyên nhân; thanh so với nguyên nhân đứng đầu.</Source>
    </div>
  ) : <p className="rpt-muted">Chưa bóc tách được nguyên nhân nào trong phạm vi lọc.</p>, { space: 14 });

  // ---------- 4. Việc cần quyết ----------
  add('act-h', '4. Việc cần quyết', (
    <div>
      <h2 className="rpt-h2">{model.titles.actions}</h2>
      <p className="rpt-lead">Hành động lấy từ thư viện hành động đã chuẩn hóa, không có hành động nào do AI tự viết. Mọi việc chờ người phụ trách phê duyệt.</p>
    </div>
  ), { keepWithNext: true, space: 36 });
  if (model.takeaways.length) {
    add('act-table', '4. Việc cần quyết', (
      <div>
        <table className="rpt-table rpt-plan">
          <caption>Bảng 4. Kế hoạch hành động đề xuất</caption>
          <thead>
            <tr>
              <th style={{ width: 22 }}>#</th>
              <th style={{ width: '38%' }}>Vấn đề và ảnh hưởng</th>
              <th>Hành động đề xuất</th>
              <th style={{ width: 118 }}>Bộ phận, hạn</th>
            </tr>
          </thead>
          <tbody>
            {model.takeaways.map((t) => (
              <tr key={t.no}>
                <td className="rpt-muted">{t.no}</td>
                <td>
                  <span className="rpt-strong">{t.problem}</span>
                  <span className="rpt-sub">{t.scope}. Mức <span className={toneClass(t.tone)}>{t.severity.toLowerCase()}</span>.</span>
                  <span className="rpt-sub">{t.impact}.</span>
                </td>
                <td>{t.action}{t.approval ? ` Cần ${t.approval} phê duyệt.` : ''}</td>
                <td>{t.owner}<span className="rpt-sub">trong {t.sla}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {model.moreActions > 0 && <Source>Còn {model.moreActions} việc mức thấp hơn, xem trên trang Cảnh báo của Customer Radar.</Source>}
      </div>
    ), { space: 14 });
  } else {
    add('act-none', '4. Việc cần quyết', <p className="rpt-muted">Không có biến động nào vượt ngưỡng trong kỳ này. Đây là kết quả bình thường, không phải lỗi thu thập dữ liệu.</p>, { space: 14 });
  }

  // ---------- Phụ lục: chạy tiếp, không ép sang tờ mới để không phí giấy ----------
  add('app-h', 'Phụ lục', (
    <div>
      <h2 className="rpt-h2">Phụ lục: dữ liệu và phương pháp</h2>
      <p className="rpt-lead">Mỗi phản hồi mang một trọng số tin cậy theo nguồn gốc, độ xác thực và độ mới. Chỉ số trong báo cáo cộng theo trọng số này, không đếm thô.</p>
    </div>
  ), { keepWithNext: true, space: 48 });

  if (model.tiers.length) {
    add('tiers', 'Phụ lục', (
      <table className="rpt-table">
        <caption>Bảng A1. Phản hồi theo tầng nguồn gốc</caption>
        <thead>
          <tr><th style={{ width: 34 }}>Tầng</th><th>Mô tả</th><th className="num">Trọng số gốc</th><th className="num">Đối soát</th><th className="num">Số phản hồi</th></tr>
        </thead>
        <tbody>
          {model.tiers.map((t) => (
            <tr key={t.tier}><td className="rpt-strong">{t.tier}</td><td>{t.label}</td><td className="num">{t.weight}</td><td className="num">{t.reconciliation}</td><td className="num">{fmtInt(t.count)}</td></tr>
          ))}
        </tbody>
      </table>
    ), { space: 14 });
  }

  add('labels', 'Phụ lục', (
    <div className="rpt-two">
      <table className="rpt-table">
        <caption>Bảng A2. Nguồn nhãn, {fmtInt(model.evidence?.total)} phản hồi được tính</caption>
        <tbody>
          {model.labelRows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{fmtInt(r.value)}</td></tr>)}
          {model.evidence && (
            <>
              <tr><td>Có chứng từ mua hàng</td><td className="num">{fmtInt(model.evidence.verified)}</td></tr>
              <tr><td>Chỉ do AI suy đoán</td><td className="num">{fmtInt(model.evidence.inferred)}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <table className="rpt-table">
        <caption>Bảng A3. Độ tin số liệu, {model.healthScore ?? '—'} trên 100</caption>
        <tbody>
          {model.components.map((c) => <tr key={c.label}><td>{c.label}</td><td className="num">{c.value}</td></tr>)}
        </tbody>
      </table>
    </div>
  ));

  add('defs', 'Phụ lục', (
    <div>
      <h3 className="rpt-h3">Định nghĩa</h3>
      <dl className="rpt-defs">
        <dt>Trọng số tin cậy</dt>
        <dd>Trọng số gốc của tầng nguồn, nhân với mức xác thực (trừ khi trùng lặp, dồn dập bất thường, sao lệch nội dung) và giảm một nửa sau mỗi chu kỳ bán rã.</dd>
        <dt>Tỉ lệ khiếu nại có trọng số</dt>
        <dd>Tổng trọng số của phản hồi khiếu nại chia cho số giao dịch có chứng từ trong cùng phạm vi.</dd>
        <dt>Tỉ trọng tiêu cực</dt>
        <dd>Tổng trọng số phản hồi tiêu cực chia cho tổng trọng số phản hồi hợp lệ.</dd>
        <dt>Độ tin số liệu</dt>
        <dd>Điểm 0 đến 100 gộp từ tỉ lệ qua bộ lọc, độ phủ kênh, độ mới và tỉ lệ đối soát được.</dd>
        <dt>Việc cần quyết</dt>
        <dd>Một biến động chỉ thành việc cần quyết khi vừa có ý nghĩa thống kê, vừa đủ lớn về nghiệp vụ.</dd>
      </dl>
    </div>
  ));

  if (model.takeaways.length) {
    add('stats', 'Phụ lục', (
      <table className="rpt-table">
        <caption>Bảng A4. Số liệu kiểm định của từng việc trong Bảng 4</caption>
        <tbody>
          {model.takeaways.map((t) => (
            <tr key={t.no}>
              <td style={{ width: 22 }} className="rpt-muted">{t.no}</td>
              <td>{t.summary || t.problem}<span className="rpt-sub">{t.evidence}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    ));
  }
  return B;
}

/* ------------------------------------------------------------------ */
/* Dàn trang                                                           */
/* ------------------------------------------------------------------ */

/** Xếp khối vào tờ theo chiều cao đo được (hàm thuần) */
function paginate(blocks, heights, capFirst, cap) {
  const pages = [[]];
  let used = 0;
  let limit = capFirst;
  const newPage = () => { pages.push([]); used = 0; limit = cap; };
  blocks.forEach((b, i) => {
    if (b.breakBefore && used > 0) newPage();
    const own = heights[b.id] || 0;
    let need = (used ? b.space : 0) + own;
    const next = blocks[i + 1];
    // Tiêu đề không được đứng một mình cuối trang
    const withNext = b.keepWithNext && next ? need + next.space + (heights[next.id] || 0) : need;
    if (used > 0 && used + Math.min(withNext, limit) > limit) {
      newPage();
      need = own;
    }
    pages[pages.length - 1].push(b);
    used += need;
  });
  return pages.filter((p) => p.length);
}

const ReportDocument = forwardRef(function ReportDocument({ model, mode = 'offscreen' }, ref) {
  const measureRef = useRef(null);
  const capRef = useRef(null);
  const capFirstRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const blocks = model ? buildBlocks(model) : [];

  useLayoutEffect(() => {
    if (!model) return undefined;
    let alive = true;
    setLayout(null);
    const run = () => {
      if (!alive || !measureRef.current) return;
      const heights = {};
      measureRef.current.querySelectorAll('[data-block]').forEach((el) => { heights[el.dataset.block] = el.offsetHeight; });
      const cap = capRef.current?.clientHeight || 900;
      const capFirst = capFirstRef.current?.clientHeight || 600;
      setLayout(paginate(blocks, heights, capFirst, cap));
    };
    (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(run));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  if (!model) return null;
  const { meta } = model;
  const total = layout?.length || 0;

  return (
    <div
      ref={ref}
      className={`rpt ${mode === 'preview' ? 'rpt-desk' : 'rpt-offscreen'}`}
      style={REPORT_VARS}
      data-report-root=""
      data-ready={layout ? '1' : '0'}
    >
      {/* Lượt đo: một tờ bìa trống, một tờ thường trống và cột chứa mọi khối */}
      <div className="rpt-measure" aria-hidden="true">
        <Sheet n={0} meta={meta} cover flowRef={capFirstRef} />
        <Sheet n={0} meta={meta} section="" flowRef={capRef} />
        <div ref={measureRef} className="rpt-measure-col">
          {blocks.map((b) => <div key={b.id} data-block={b.id}>{b.node}</div>)}
        </div>
      </div>

      {layout && layout.map((page, i) => (
        <Sheet key={i} n={i + 1} total={total} meta={meta} section={page[0]?.section} cover={i === 0}>
          {page.map((b, j) => (
            <div key={b.id} style={{ paddingTop: j === 0 ? 0 : b.space }}>{b.node}</div>
          ))}
        </Sheet>
      ))}
    </div>
  );
});

export default ReportDocument;
