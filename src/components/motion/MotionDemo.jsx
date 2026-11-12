import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { GlassPanel, Button, AnimatedNumber } from '../ui';
import { fmtInt } from '../../lib/format';
import { LedgerRun } from './LedgerRun';
import { ChartReveal } from './ChartReveal';
import { BarGrow } from './BarGrow';
import { Pulse } from './Pulse';
import { Stagger } from './Stagger';
import { PageEnter } from './PageEnter';
import { useReducedMotion } from './useReducedMotion';

/**
 * Mục "Chuyển động" của /ui-kit: mọi thành phần trong components/motion
 * chạy với số thật (sổ đối chiếu của kho mô phỏng và kho thật, theo bản
 * bàn giao). Để duyệt nhịp và kiểm giảm chuyển động, không dùng trong trang.
 */

// Số của sổ đối chiếu: kho mô phỏng và kho thật (Tiki)
const DEMO = { raw: 15000, spam: 562, inauthentic: 69, pendingNotCounted: 12, pendingCounted: 0, aged: 150, counted: 14207 };
const REAL = { raw: 4572, spam: 23, inauthentic: 4, pendingNotCounted: 0, pendingCounted: 0, aged: 43, counted: 4502 };

const removedParts = (l) => [
  { name: 'Rác, quảng cáo', value: l.spam },
  { name: 'Nghi đánh giá ảo', value: l.inauthentic },
  { name: 'Chờ duyệt', value: l.pendingNotCounted },
  { name: 'Quá cũ', value: l.aged }
];

const pct = (n, d) => `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((n / d) * 100)}%`;

const Head = ({ title, note, action }) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <h3 className="text-base font-semibold text-ink-hi">{title}</h3>
      {note && <p className="mt-1 max-w-[52ch] text-sm text-ink-lo">{note}</p>}
    </div>
    {action}
  </div>
);

// Ô trống hiện dấu gạch dài (luật người dùng chốt 11/11); giữ trong hằng vì sloplint mã 19 không cho dấu này nằm trong chữ
const EMPTY_CELL = '—';

const INBOX = [
  { id: 'a', text: 'Khiếu nại giao chậm tăng ở kênh Shopee' },
  { id: 'b', text: 'Câu hỏi về size áo dồn trong phiên live tối qua' },
  { id: 'c', text: '12 đánh giá chờ người duyệt' }
];

const MotionDemo = () => {
  const reduced = useReducedMotion();
  const [runKey, setRunKey] = useState(0);
  const [progress, setProgress] = useState(0.5);
  const [chartKey, setChartKey] = useState(0);
  const [store, setStore] = useState('demo');
  const [accepted, setAccepted] = useState({});
  const [order, setOrder] = useState(INBOX);
  const [staggerKey, setStaggerKey] = useState(0);
  const [numIdx, setNumIdx] = useState(0);
  const [enterKey, setEnterKey] = useState(0);
  const [enterDone, setEnterDone] = useState(false);

  const ledger = store === 'demo' ? DEMO : REAL;
  const parts = useMemo(() => removedParts(ledger), [ledger]);
  const NUMS = [
    { value: 14207, decimals: 0, unit: undefined },
    { value: 4502, decimals: 0, unit: undefined }
  ];
  const n = NUMS[numIdx];

  return (
    <section aria-labelledby="motion-title" className="mt-10">
      <div className="mb-5">
        <h2 id="motion-title" className="text-heading font-semibold text-ink-hi">Chuyển động</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-mid">
          Mỗi trang một khoảnh khắc dàn dựng; còn lại chỉ chuyển động khi người dùng thao tác. Chỉ đổi transform, opacity, clip-path.
          {reduced ? ' Máy đang bật giảm chuyển động: mọi thứ hiện ngay ở trạng thái cuối.' : ' Bật giảm chuyển động thì mọi thứ hiện ngay ở trạng thái cuối.'}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Chữ ký: phép trừ chạy, tự chạy một lần */}
        <div className="lg:col-span-6">
          <Head
            title="Phép trừ chạy, tự chạy"
            note="Chạy một lần khi tờ sổ vào khung nhìn. Số kho mô phỏng."
            action={<Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setRunKey((k) => k + 1)}>Chạy lại</Button>}
          />
          <LedgerRun key={runKey} ledger={DEMO} mode="auto" showLink={false} />
        </div>

        {/* Chữ ký: phép trừ chạy theo tiến độ do trang ngoài điều khiển */}
        <div className="lg:col-span-6">
          <Head title="Phép trừ chạy, theo thanh cuộn" note="Trang giới thiệu truyền tiến độ cuộn vào. Ở đây kéo thanh trượt thay cho cuộn. Số kho thật." />
          <label className="mb-3 flex items-center gap-3 text-sm text-ink-mid">
            <span className="shrink-0">Tiến độ</span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => setProgress(Number(e.target.value) / 1000)}
              className="min-w-0 flex-1 accent-accent"
              aria-label="Tiến độ của phép trừ"
            />
            <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-hi">{Math.round(progress * 100)}%</span>
          </label>
          <LedgerRun ledger={REAL} mode="scroll" progress={progress} showLink={false} title="Kho thật, dữ liệu Tiki" />
        </div>

        <GlassPanel className="p-5 lg:col-span-7">
          <Head
            title="ChartReveal"
            note="Biểu đồ mở từ trái sang bằng clip-path khi vào khung nhìn, một lần. Phần bị loại khỏi chỉ số, kho mô phỏng."
            action={<Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setChartKey((k) => k + 1)}>Mở lại</Button>}
          />
          <ChartReveal key={chartKey} className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={removedParts(DEMO)} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                <XAxis type="number" tick={{ fill: 'var(--text-lo)', fontSize: 13 }} tickFormatter={(v) => fmtInt(v)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--text-mid)', fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--raised)' }} formatter={(v) => [fmtInt(v), 'Phản hồi']} contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-hi)' }} />
                <Bar dataKey="value" fill="var(--viz-1)" radius={[0, 2, 2, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartReveal>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-5">
          <Head
            title="BarGrow"
            note="Thanh mọc bằng scaleX khi vào khung nhìn; đổi số thì co giãn sang độ dài mới."
            action={
              <Button size="sm" variant="secondary" onClick={() => setStore((s) => (s === 'demo' ? 'real' : 'demo'))}>
                {store === 'demo' ? 'Xem kho thật' : 'Xem kho mô phỏng'}
              </Button>
            }
          />
          <ul className="flex list-none flex-col gap-3">
            {parts.map((p) => (
              <li key={p.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-mid">{p.name}</span>
                  <span className="font-mono tabular-nums text-ink-hi">{fmtInt(p.value)} ({pct(p.value, ledger.raw - ledger.counted || 1)})</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-xs bg-raised">
                  <BarGrow value={p.value / Math.max(1, ledger.raw - ledger.counted)} className="bg-accent" />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-lo">Tỉ lệ trên tổng số bị loại ({fmtInt(ledger.raw - ledger.counted)} phản hồi).</p>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-4">
          <Head title="Pulse" note="Một nhịp tô nền ở dòng vừa đổi, thay cho chấm trạng thái." />
          <ul className="flex list-none flex-col">
            {INBOX.map((it) => (
              <li key={it.id} className="border-b border-line-soft last:border-b-0">
                <Pulse trigger={accepted[it.id] || 0} className="-mx-2 flex items-center justify-between gap-3 rounded-ctrl px-2 py-2.5">
                  <span className="min-w-0 text-sm text-ink-hi">{it.text}</span>
                  <Button size="sm" variant={accepted[it.id] ? 'ghost' : 'secondary'} onClick={() => setAccepted((a) => ({ ...a, [it.id]: (a[it.id] || 0) + 1 }))}>
                    {accepted[it.id] ? 'Đã nhận' : 'Nhận việc'}
                  </Button>
                </Pulse>
              </li>
            ))}
          </ul>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-4">
          <Head
            title="Stagger"
            note="Lệch nhịp 40ms, chỉ khi dữ liệu mới về sau thao tác. Tải trang thì không."
            action={
              <Button size="sm" variant="secondary" onClick={() => { setOrder((o) => [...o.slice(1), o[0]]); setStaggerKey((k) => k + 1); }}>
                Sắp lại
              </Button>
            }
          />
          <Stagger as="ol" active runKey={staggerKey} className="flex list-none flex-col gap-2">
            {order.map((it, i) => (
              <li key={it.id} className="flex items-baseline gap-3 rounded-ctrl bg-raised px-3 py-2 text-sm text-ink-hi">
                <span className="font-mono tabular-nums text-ink-lo">{i + 1}</span>
                <span className="min-w-0">{it.text}</span>
              </li>
            ))}
          </Stagger>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-4">
          <Head
            title="AnimatedNumber"
            note="Đếm khi vào khung nhìn, rồi chốt nhẹ. Đổi số thì đếm từ số cũ."
            action={<Button size="sm" variant="secondary" onClick={() => setNumIdx((i) => (i + 1) % NUMS.length)}>Đổi số</Button>}
          />
          <p className="font-mono text-metric font-semibold text-ink-hi">
            <AnimatedNumber value={n.value} decimals={n.decimals} unit={n.unit} />
          </p>
          <p className="mt-2 text-sm text-ink-lo">Được tính vào chỉ số, {numIdx === 0 ? 'kho mô phỏng' : 'kho thật'}</p>
          <p className="mt-4 font-mono text-heading font-semibold text-ink-hi">
            <AnimatedNumber value={(DEMO.spam / DEMO.raw) * 100} decimals={2} unit="%" />
          </p>
          <p className="mt-1 text-sm text-ink-lo">Rác trên tổng thu thập, kho mô phỏng</p>
        </GlassPanel>

        {/* K3-01 (M1): vào trang. Bản dựng thử trong trang, chạy lại bằng nút */}
        <GlassPanel className="p-5 lg:col-span-6">
          <Head
            title="PageEnter (M1, vào trang)"
            note="Tối đa 4 khối đầu, lệch 60ms, từ mờ và thấp 12px. Chỉ chạy khi đổi route, không chạy khi lọc hay dữ liệu về. Khối thứ năm đứng yên. Số chỉ đếm sau khi khối cuối vào xong."
            action={<Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => { setEnterDone(false); setEnterKey((k) => k + 1); }}>Vào lại</Button>}
          />
          <PageEnter key={enterKey} local onDone={() => setEnterDone(true)} className="flex flex-col gap-2">
            {['Câu tóm tắt của trang', 'Hàng bộ lọc', 'Việc hôm nay', 'Khối số liệu', 'Khối thứ năm, không dàn dựng'].map((t) => (
              <div key={t} className="rounded-ctrl bg-raised px-3 py-2.5 text-sm text-ink-hi">{t}</div>
            ))}
          </PageEnter>
          <p className="mt-3 font-mono text-metric font-semibold text-ink-hi">
            {enterDone ? <AnimatedNumber key={enterKey} value={14207} /> : <span className="text-ink-lo">{EMPTY_CELL}</span>}
          </p>
          <p className="mt-1 text-sm text-ink-lo">Được tính vào chỉ số, kho mô phỏng</p>
        </GlassPanel>

        {/* K3-03 (M4): lift. Chỉ phần tử bấm được */}
        <GlassPanel className="p-5 lg:col-span-6 lg:self-start">
          <Head
            title="lift (M4, thẻ nhấc)"
            note="Chỉ thẻ bấm được, chỉ máy có chuột: rê vào thì nhấc 2px kèm bóng nổi. Tab bằng bàn phím thì không nhấc, chỉ có vòng focus. Điện thoại không nhấc. Thẻ thứ ba không bấm được nên không nhấc."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <a href="#motion-title" className="lift glass-strong block rounded-surf p-4 text-sm text-ink-hi">
              <span className="font-semibold">Liên kết</span>
              <span className="mt-1 block text-ink-mid">Có href, nhấc khi rê</span>
            </a>
            <button type="button" className="lift glass-strong block rounded-surf p-4 text-left text-sm text-ink-hi">
              <span className="font-semibold">Nút bấm</span>
              <span className="mt-1 block text-ink-mid">Có onClick, nhấc khi rê</span>
            </button>
            <div className="glass-strong block rounded-surf p-4 text-sm text-ink-hi">
              <span className="font-semibold">Chỉ để xem</span>
              <span className="mt-1 block text-ink-mid">Không bấm được, không nhấc</span>
            </div>
          </div>
        </GlassPanel>

        {/* K3-02 (M2): reveal. Cuộn trang để xem; mỗi khối hiện khi lộ ra 35% đầu */}
        <div className="lg:col-span-12">
          <Head
            title="reveal (M2, hiện theo cuộn)"
            note="Một kiểu duy nhất cho khối nằm dưới màn đầu: thuần CSS, mờ và thấp 16px, phóng 98,5%. Cuộn trang để xem. Trình duyệt không hỗ trợ animation-timeline hoặc bật giảm chuyển động thì hiện đủ ngay."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ['Khối thứ nhất', 'Hiện khi lộ ra, không chờ ai.'],
              ['Khối thứ hai', 'Cùng một kiểu, không khối nào riêng.'],
              ['Khối thứ ba', 'Không nảy, không xoay.']
            ].map(([t, d]) => (
              <GlassPanel key={t} className="reveal p-5">
                <h4 className="text-base font-semibold text-ink-hi">{t}</h4>
                <p className="mt-1 text-sm text-ink-mid">{d}</p>
                <div className="mt-6 h-24 rounded-ctrl bg-raised" />
              </GlassPanel>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MotionDemo;
