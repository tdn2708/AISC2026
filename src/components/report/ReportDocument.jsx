import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import { REPORT, REPORT_VARS, fmtInt } from '../report_kit';
import { pctVi } from '../../lib/reportModel';
import './report.css';

/**
 * BẢN BÁO CÁO IN, NĂM TRANG A4
 * ==================================================================
 * Mỗi <section data-page> là đúng một tờ A4 (794 x 1123 px). Khi xuất,
 * Reports.jsx chụp từng tờ riêng rồi đặt mỗi ảnh vào một trang PDF.
 * Nội dung trên mỗi tờ được giới hạn trước (tối đa 10 nguyên nhân, 4 việc
 * cần quyết) để không tờ nào tràn; ở chế độ xem trước, tờ nào tràn sẽ bị
 * viền đỏ để người sửa mẫu thấy ngay.
 */

const TOTAL_PAGES = 5;

const toneClass = (tone) => (tone === 'good' ? 'rpt-good' : tone === 'bad' ? 'rpt-bad' : tone === 'warn' ? 'rpt-warn' : 'rpt-muted');

function Page({ n, meta, children }) {
  const ref = useRef(null);
  // Báo tờ bị tràn (chỉ có tác dụng khi xem trước): viền đỏ + cảnh báo console
  useLayoutEffect(() => {
    const body = ref.current?.querySelector('.rpt-body');
    if (!body) return;
    const over = body.scrollHeight > body.clientHeight + 1;
    ref.current.dataset.overflow = over ? 'true' : 'false';
    if (over) console.warn(`[Báo cáo] Trang ${n} bị tràn ${body.scrollHeight - body.clientHeight}px`);
  });
  return (
    <section ref={ref} data-page={n} className="rpt-page" aria-label={`Trang ${n}`}>
      {n > 1 && (
        <header className="rpt-run">
          <span><b>{meta.title}</b></span>
          <span>{meta.period}{meta.range ? `, ${meta.range}` : ''}</span>
        </header>
      )}
      <div className="rpt-body">{children}</div>
      <footer className="rpt-foot">
        <span>Customer Radar, tài liệu nội bộ. Lập lúc {meta.generatedAt}.</span>
        <span>Trang {n} trên {TOTAL_PAGES}</span>
      </footer>
    </section>
  );
}

function SectionHead({ no, title }) {
  return (
    <div className="rpt-sec">
      {no && <span className="rpt-sec-no">{no}</span>}
      <h2>{title}</h2>
    </div>
  );
}

/**
 * Biểu đồ đường khiếu nại và hài lòng. SVG chỉ vẽ nét; mọi con chữ là HTML
 * đặt tuyệt đối, vì html2canvas chụp SVG như một ảnh rời, không mang theo
 * webfont, nên chữ trong SVG sẽ ra font mặc định.
 */
function TrendChart({ series, peak, peakLabel, width = 674, height = 250 }) {
  if (!series.length) return <p className="rpt-muted">Chưa có dữ liệu theo thời gian trong phạm vi lọc.</p>;
  const padL = 42;
  const padR = 92;
  const padT = 22;
  const padB = 26;
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

  // Nhãn cuối đường: tách nhau ít nhất 16px để không đè
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
          <line key={t} x1={padL} x2={padL + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? REPORT.ink3 : REPORT.ruleSoft} strokeWidth="1" />
        ))}
        <path d={path('satisfaction')} fill="none" stroke={REPORT.brand} strokeWidth="2" strokeLinejoin="round" />
        <path d={path('complaints')} fill="none" stroke={REPORT.bad} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(series[last].satisfaction)} r="3" fill={REPORT.brand} />
        <circle cx={x(last)} cy={y(series[last].complaints)} r="3" fill={REPORT.bad} />
        {peakIdx >= 0 && (
          <>
            <line x1={x(peakIdx)} x2={x(peakIdx)} y1={y(series[peakIdx].complaints) - 4} y2={padT - 6} stroke={REPORT.bad} strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={x(peakIdx)} cy={y(series[peakIdx].complaints)} r="4" fill={REPORT.paper} stroke={REPORT.bad} strokeWidth="2" />
          </>
        )}
      </svg>
      {ticks.map((t) => (
        <span key={t} className="lbl y" style={{ left: 0, top: y(t) - 6 }}>{fmtInt(t)}</span>
      ))}
      {series.map((d, i) => (i % everyX === 0 || i === last) && (
        <span key={d.name} className="lbl x" style={{ left: x(i), top: padT + h + 9 }}>{d.name}</span>
      ))}
      <span className="lbl end" style={{ left: x(last) + 8, top: yC - 6, color: REPORT.bad }}>Khiếu nại {fmtInt(series[last].complaints)}</span>
      <span className="lbl end" style={{ left: x(last) + 8, top: yS - 6, color: REPORT.brand }}>Hài lòng {fmtInt(series[last].satisfaction)}</span>
      {peakIdx >= 0 && (
        <span
          className="lbl peak"
          style={x(peakIdx) > padL + w / 2
            ? { right: width - x(peakIdx) + 6, top: padT - 12 }
            : { left: x(peakIdx) + 6, top: padT - 12 }}
        >
          Đỉnh {peak.name}: {fmtInt(peak.value)} khiếu nại{peakLabel ? `, ${peakLabel.toLowerCase()}` : ''}
        </span>
      )}
    </div>
  );
}

function niceStep(raw) {
  // Đếm phản hồi là số nguyên: bước chia nhỏ hơn 1 sẽ in ra "1, 1, 2, 2"
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

const Bar = ({ value, quiet }) => (
  <span className="rpt-bar">
    <span className="rpt-bar-track"><span className={`rpt-bar-fill${quiet ? ' is-quiet' : ''}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, display: 'block' }} /></span>
  </span>
);

const ReportDocument = forwardRef(function ReportDocument({ model, mode = 'offscreen' }, ref) {
  if (!model) return null;
  const { meta, ledger } = model;
  const rootClass = `rpt ${mode === 'preview' ? 'rpt-desk' : 'rpt-offscreen'}`;

  return (
    <div ref={ref} className={rootClass} style={REPORT_VARS} data-report-root="">
      {/* ================= TRANG 1: BÌA VÀ TÓM TẮT ================= */}
      <Page n={1} meta={meta}>
        <div className="rpt-brandline">
          <span className="rpt-brandmark" aria-hidden="true"><span /></span>
          Customer Radar
        </div>
        <div className="rpt-cover-title">
          <h1>{meta.title}</h1>
          <p className="rpt-cover-sub">
            {meta.period}{meta.range ? `, dữ liệu từ ${meta.range}` : ''}
          </p>
        </div>
        <dl className="rpt-facts">
          <div><dt>Kho dữ liệu</dt><dd>{meta.workspace}</dd></div>
          <div><dt>Kênh</dt><dd>{meta.source}</dd></div>
          <div><dt>Sản phẩm</dt><dd>{meta.product}</dd></div>
          <div><dt>Ngày lập</dt><dd>{meta.generatedAt.split(',')[0]}</dd></div>
        </dl>
        {meta.simulated && (
          <p className="rpt-note">
            Báo cáo lập trên kho Mô phỏng: dữ liệu sinh tự động có cài sẵn sự cố để kiểm chứng hệ thống, không phải phản hồi của khách hàng thật.
          </p>
        )}

        <div className="rpt-cols">
          <div>
            <SectionHead title="Tóm tắt điều hành" />
            <ol className="rpt-findings">
              {model.findings.map((f, i) => <li key={i}><span>{f}</span></li>)}
            </ol>
          </div>
          {ledger && (
            <aside className="rpt-ledger" aria-label="Sổ đối chiếu">
              <h3>Số liệu này đứng trên gì</h3>
              <p className="rpt-small" style={{ marginBottom: 6 }}>Mọi chỉ số trong báo cáo chỉ tính trên phần còn lại sau phép trừ này.</p>
              <div className="rpt-ledger-row"><span>Phản hồi thu thập được</span><span /><span>{fmtInt(ledger.raw)}</span></div>
              {ledger.rows.map((r) => (
                <div key={r.label} className="rpt-ledger-row"><span>{r.label}</span><span>−</span><span>{fmtInt(r.value)}</span></div>
              ))}
              <div className="rpt-ledger-total">
                <div><span className="rpt-strong">Được tính vào chỉ số</span><b>{fmtInt(ledger.counted)}</b></div>
              </div>
              <p className={`rpt-check ${ledger.diff === 0 ? 'rpt-muted' : 'rpt-bad'}`}>
                {ledger.diff === 0
                  ? <>Phép trừ khớp: {fmtInt(ledger.raw)} trừ {fmtInt(ledger.removed)} đúng bằng {fmtInt(ledger.counted)}.</>
                  : <>Phép trừ lệch {fmtInt(Math.abs(ledger.diff))} phản hồi so với số được tính.</>}
                {ledger.pendingCounted > 0 && <> {fmtInt(ledger.pendingCounted)} phản hồi chờ duyệt vẫn được tính tạm theo trọng số.</>}
                {model.verifiedShare != null && <> {pctVi(model.verifiedShare, 0)} số được tính có chứng từ mua hàng hoặc đã được người duyệt.</>}
              </p>
            </aside>
          )}
        </div>

        <div className="rpt-mt">
          <table className="rpt-table rpt-kpi">
            <caption><h3>Chỉ số chính</h3></caption>
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Chỉ số</th>
                <th className="num">Toàn kỳ</th>
                <th className="num">7 ngày gần nhất</th>
                <th className="num">7 ngày trước đó</th>
                <th className="num">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {model.kpis.map((k) => (
                <tr key={k.label}>
                  <td>{k.label}<div className="rpt-small" style={{ fontWeight: 400 }}>{k.note}</div></td>
                  <td className="num"><span className="rpt-kpi-val">{k.value}</span></td>
                  <td className="num">{k.cur}{k.approx ? ' *' : ''}</td>
                  <td className="num">{k.prev}{k.approx ? ' *' : ''}</td>
                  <td className={`num ${toneClass(k.delta.tone)}`}>{k.delta.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model.approximation && <p className="rpt-small rpt-cap">* {model.approximation}</p>}
        </div>
      </Page>

      {/* ================= TRANG 2: DIỄN BIẾN VÀ CƠ CẤU ================= */}
      <Page n={2} meta={meta}>
        <SectionHead no="1" title="Diễn biến và cơ cấu khiếu nại" />
        <p className="rpt-lead">
          Số phản hồi khiếu nại và hài lòng theo từng mốc thời gian, sau đó là cơ cấu khiếu nại theo nhóm vấn đề để biết nên dồn nguồn lực vào đâu.
        </p>

        <figure className="rpt-fig">
          <div className="rpt-fig-title">
            <h3>Hình 1. Phản hồi khiếu nại và hài lòng theo thời gian</h3>
            <span className="rpt-small">Đơn vị: phản hồi</span>
          </div>
          <TrendChart series={model.trend.series} peak={model.trend.peak} peakLabel={model.trend.peakLabel} />
          <figcaption className="rpt-small rpt-cap">
            Nguồn: phản hồi đã qua tầng kiểm soát tin cậy, gom theo mốc trên trục ngang.
            {model.trend.peak ? ' Điểm đánh dấu là mốc có nhiều khiếu nại nhất, cao hơn trung bình cả kỳ từ 30% trở lên.' : ''}
          </figcaption>
        </figure>

        {model.categories.length ? (
          <>
            <table className="rpt-table">
              <caption><h3>Bảng 1. Khiếu nại theo nhóm vấn đề</h3></caption>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>Nhóm vấn đề</th>
                  <th className="num">Số phản hồi</th>
                  <th className="num">Tỉ trọng</th>
                  <th className="num">Lũy kế</th>
                  <th className="num" style={{ width: 132 }} />
                </tr>
              </thead>
              <tbody>
                {model.categories.map((c) => (
                  <tr key={c.name} className={c.vital ? 'rpt-vital' : ''}>
                    <td>{c.rank}</td>
                    <td className={c.vital ? 'rpt-strong' : ''}>{c.name}</td>
                    <td className="num">{fmtInt(c.value)}</td>
                    <td className="num">{pctVi(c.share, 1)}</td>
                    <td className="num">{pctVi(c.cumulative, 1)}</td>
                    <td className="num"><Bar value={c.share} quiet={!c.vital} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>Tổng phản hồi có nêu vấn đề</td>
                  <td className="num">{fmtInt(model.issueTotal)}</td>
                  <td className="num">100%</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <p className="rpt-small rpt-cap">
              {model.vitalFew} nhóm đầu (tô xanh) chiếm khoảng 80% khối lượng khiếu nại, nên xử lý trước.
              {model.noIssue > 0 ? ` Ngoài bảng còn ${fmtInt(model.noIssue)} phản hồi được tính nhưng không gắn nhóm vấn đề nào.` : ''}
            </p>
          </>
        ) : (
          <p className="rpt-muted">Chưa có phản hồi nào gắn nhóm vấn đề trong phạm vi lọc.</p>
        )}
      </Page>

      {/* ================= TRANG 3: NGUYÊN NHÂN ================= */}
      <Page n={3} meta={meta}>
        <SectionHead no="2" title="Nguyên nhân cụ thể" />
        <p className="rpt-lead">
          Trong mỗi nhóm vấn đề có nhiều nguyên nhân thuộc các bộ phận khác nhau. Bảng dưới bóc tách từ nội dung {fmtInt(model.causeTotal)} phản hồi khiếu nại.
        </p>
        {model.causes.length ? (
          <table className="rpt-table">
            <caption><h3>Bảng 2. Mười nguyên nhân gặp nhiều nhất</h3></caption>
            <thead>
              <tr>
                <th style={{ width: 26 }}>#</th>
                <th>Nguyên nhân</th>
                <th>Nhóm vấn đề</th>
                <th className="num">Số phản hồi</th>
                <th className="num">Tỉ trọng</th>
                <th className="num" style={{ width: 132 }} />
              </tr>
            </thead>
            <tbody>
              {model.causes.map((c) => (
                <tr key={`${c.category}-${c.cause}`}>
                  <td>{c.rank}</td>
                  <td className="rpt-strong">{c.cause}</td>
                  <td className="rpt-muted">{c.category}</td>
                  <td className="num">{fmtInt(c.count)}</td>
                  <td className="num">{pctVi(c.share, 1)}</td>
                  <td className="num"><Bar value={c.share} quiet={c.rank > 3} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rpt-muted">Chưa bóc tách được nguyên nhân nào trong phạm vi lọc.</p>
        )}

      </Page>

      {/* ================= TRANG 4: VIỆC CẦN QUYẾT ================= */}
      <Page n={4} meta={meta}>
          <SectionHead no="3" title="Việc cần quyết" />
          <p className="rpt-lead">
            Mỗi việc đi kèm hành động lấy từ thư viện hành động đã chuẩn hóa, bộ phận chịu trách nhiệm và thời hạn. Không có hành động nào do AI tự viết.
          </p>
          {model.takeaways.length ? (
            <div className="rpt-actions">
              {model.takeaways.map((t) => (
                <article key={t.no} className="rpt-action">
                  <span className="rpt-action-no">{t.no}</span>
                  <div>
                    <div className="rpt-action-head">
                      <h3>{t.problem}<span className="rpt-muted" style={{ fontWeight: 400 }}>, {t.scope}</span></h3>
                      <span className={toneClass(t.tone)}>Mức {t.severity.toLowerCase()}</span>
                    </div>
                    {t.summary && <p className="rpt-action-sum">{t.summary}</p>}
                    <dl className="rpt-action-grid">
                      <dt>Ảnh hưởng</dt><dd>{t.impact}</dd>
                      <dt>Hành động đề xuất</dt><dd className="rpt-strong">{t.action}{t.approval ? ` Cần ${t.approval} phê duyệt.` : ''}</dd>
                      <dt>Bộ phận, thời hạn</dt><dd>{t.owner}, xử lý trong {t.sla}</dd>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rpt-muted">Không có biến động nào vượt ngưỡng trong kỳ này. Đây là kết quả bình thường, không phải lỗi thu thập dữ liệu.</p>
          )}
          {model.moreActions > 0 && (
            <p className="rpt-small rpt-cap">Còn {model.moreActions} việc mức thấp hơn, xem trên trang Cảnh báo của Customer Radar.</p>
          )}
      </Page>

      {/* ================= TRANG 5: PHỤ LỤC ================= */}
      <Page n={5} meta={meta}>
        <SectionHead no="A" title="Phụ lục: độ tin cậy dữ liệu và phương pháp" />
        <p className="rpt-lead">
          Mỗi phản hồi mang một trọng số tin cậy theo nguồn gốc, độ xác thực và độ mới. Chỉ số trong báo cáo cộng theo trọng số này chứ không đếm thô.
        </p>

        {model.tiers.length > 0 && (
          <table className="rpt-table">
            <caption><h3>Bảng 3. Phản hồi theo tầng nguồn gốc</h3></caption>
            <thead>
              <tr>
                <th style={{ width: 34 }}>Tầng</th>
                <th>Mô tả</th>
                <th className="num">Trọng số gốc</th>
                <th className="num">Đối soát</th>
                <th className="num">Số phản hồi</th>
              </tr>
            </thead>
            <tbody>
              {model.tiers.map((t) => (
                <tr key={t.tier}>
                  <td className="rpt-strong">{t.tier}</td>
                  <td>{t.label}</td>
                  <td className="num">{t.weight}</td>
                  <td className="num">{t.reconciliation}</td>
                  <td className="num">{fmtInt(t.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="rpt-two rpt-mt">
          <div>
            <h3>Nguồn của nhãn phân loại</h3>
            <p className="rpt-small" style={{ marginBottom: 6 }}>Trên {fmtInt(model.evidence?.total)} phản hồi được tính.</p>
            <table className="rpt-table">
              <tbody>
                {model.labelRows.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td className="num">{fmtInt(r.value)}</td></tr>
                ))}
                {model.evidence && (
                  <>
                    <tr><td>Có chứng từ mua hàng</td><td className="num">{fmtInt(model.evidence.verified)}</td></tr>
                    <tr><td>Chỉ do AI suy đoán</td><td className="num">{fmtInt(model.evidence.inferred)}</td></tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Thành phần của độ tin số liệu</h3>
            <p className="rpt-small" style={{ marginBottom: 6 }}>Điểm chung {model.healthScore ?? '—'} trên 100.</p>
            <table className="rpt-table">
              <tbody>
                {model.components.map((c) => (
                  <tr key={c.label}><td>{c.label}</td><td className="num">{c.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rpt-mt">
          <h3 style={{ marginBottom: 10 }}>Định nghĩa</h3>
          <dl className="rpt-defs">
            <dt>Trọng số tin cậy</dt>
            <dd>Trọng số gốc của tầng nguồn, nhân với mức xác thực (trừ khi trùng lặp, dồn dập bất thường, sao lệch nội dung) và giảm một nửa sau mỗi chu kỳ bán rã.</dd>
            <dt>Tỉ lệ khiếu nại có trọng số</dt>
            <dd>Tổng trọng số của phản hồi khiếu nại chia cho số giao dịch có chứng từ trong cùng phạm vi.</dd>
            <dt>Tỉ trọng tiêu cực</dt>
            <dd>Tổng trọng số phản hồi tiêu cực chia cho tổng trọng số phản hồi hợp lệ.</dd>
            <dt>Độ tin số liệu</dt>
            <dd>Điểm 0 đến 100 gộp từ tỉ lệ qua bộ lọc, độ phủ kênh, độ mới và tỉ lệ đối soát được.</dd>
            <dt>Ngưỡng thành việc cần quyết</dt>
            <dd>Một biến động chỉ thành việc cần quyết khi vừa có ý nghĩa thống kê, vừa đủ lớn về nghiệp vụ.</dd>
          </dl>
        </div>

        {model.takeaways.length > 0 && (
          <div className="rpt-mt">
            <h3 style={{ marginBottom: 8 }}>Số liệu kiểm định của từng việc</h3>
            <table className="rpt-table">
              <tbody>
                {model.takeaways.map((t) => (
                  <tr key={t.no}><td style={{ width: 26 }}>{t.no}</td><td className="rpt-small" style={{ color: 'inherit' }}>{t.evidence}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </div>
  );
});

export default ReportDocument;
