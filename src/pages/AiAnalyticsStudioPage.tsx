import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, Segmented, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import {
    BarChartOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    FireOutlined,
    HistoryOutlined,
    LinkOutlined,
    LineChartOutlined,
    PieChartOutlined,
    PushpinOutlined,
    ReloadOutlined,
    RobotOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import EChart, { type EChartsCoreOption } from '../components/charts/EChart';
import MarkdownLite from '../components/shared/MarkdownLite';
import {
    aiAnalyticsService,
    type AnalyticsChart,
    type AnalyticsResult,
    type AnalyticsSpec,
    type IncidentReplayEvent,
    type IncidentReplayResult,
} from '../core/services/ai-help.service';

const { Text, Title } = Typography;
const ACCENT = '#2f51d9';
const PALETTE = ['#2f51d9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#ec4899', '#64748b'];
const PINS_KEY = 'hd-analytics-pins';
const REPLAY_SESSION_KEY = 'hd-incident-replay-session';

// Ghim được cả catalog (theo spec, mở lại nhanh+chuẩn) lẫn agentic (theo câu hỏi, mở lại chạy lại).
type Pin = { id: string; title: string; spec?: AnalyticsSpec; question?: string };

const loadPins = (): Pin[] => {
    try {
        const raw = localStorage.getItem(PINS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
};
const savePins = (pins: Pin[]) => {
    try {
        localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    } catch {
        /* noop */
    }
};

const REPLAY_WF_LABEL: Record<string, string> = {
    draft: 'Nháp',
    reviewed: 'Đã rà soát',
    approved: 'Đã phê duyệt',
    closed: 'Đã đóng',
};

const getReplaySessionId = () => {
    try {
        const current = localStorage.getItem(REPLAY_SESSION_KEY);
        if (current) return current;
        const next = `replay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(REPLAY_SESSION_KEY, next);
        return next;
    } catch {
        return `replay-${Date.now()}`;
    }
};

// Narrative do AI sinh + tên/mô tả từ dữ liệu người dùng nhập -> phải escape trước khi nhét vào HTML in
const escHtml = (value?: string | number) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const exportReplayReport = (result: IncidentReplayResult) => {
    const html = `
        <html>
        <head>
            <title>Incident Replay</title>
            <style>
                body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}
                h1{font-size:20px;margin:0 0 8px}
                h2{font-size:15px;margin:18px 0 8px}
                .muted{color:#64748b;font-size:12px}
                .box{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0}
                table{width:100%;border-collapse:collapse;font-size:12px}
                th,td{border:1px solid #e2e8f0;padding:6px;text-align:left}
                th{background:#f8fafc}
            </style>
        </head>
        <body>
            <h1>AI Incident Replay</h1>
            <div class="muted">${escHtml(result.periodLabel)} · score ${escHtml(result.caseScore)}/100 · ${escHtml(result.caseSeverity)}</div>
            <div class="box">${escHtml(result.narrative || '').replace(/\n/g, '<br/>')}</div>
            <h2>Metrics</h2>
            <table><thead><tr><th>Chỉ số</th><th>Kỳ này</th><th>Kỳ trước</th><th>Chênh</th></tr></thead><tbody>
            ${result.metrics
                .map((m) => `<tr><td>${escHtml(m.label)}</td><td>${escHtml(fmtReplayValue(m.current, m.unit))}</td><td>${escHtml(fmtReplayValue(m.previous, m.unit))}</td><td>${escHtml(fmtReplayValue(m.delta, m.unit))} (${escHtml(m.deltaPct)}%)</td></tr>`)
                .join('')}
            </tbody></table>
            <h2>Top nguyên nhân</h2>
            ${(result.rootCauseChains || [])
                .slice(0, 5)
                .map((c) => `<div class="box"><b>${escHtml(c.title)}</b><div class="muted">Tin cậy ${escHtml(c.confidence)}% · ${escHtml(fmtReplayValue(c.value, 'vnd'))}</div><ul>${c.steps.map((s) => `<li>${escHtml(s)}</li>`).join('')}</ul></div>`)
                .join('')}
            <h2>Hành động đề xuất</h2>
            ${(result.recommendations || []).map((r) => `<div class="box"><b>${escHtml(r.title)}</b><div>${escHtml(r.description)}</div></div>`).join('')}
        </body></html>`;
    const win = window.open('', '_blank', 'width=900,height=720');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
};

const fmtVal = (v: number, unit: string) =>
    unit === 'đ' ? `${Math.round(v).toLocaleString('vi-VN')}đ` : `${v.toLocaleString('vi-VN')} ${unit}`;

const fmtReplayValue = (value?: number, unit: 'vnd' | 'count' = 'vnd') => {
    const safe = Number(value || 0);
    return unit === 'vnd' ? `${Math.round(safe).toLocaleString('vi-VN')}đ` : safe.toLocaleString('vi-VN');
};

const replayDate = (value?: string) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : '-';
};

const replayTone: Record<IncidentReplayEvent['severity'], string> = {
    info: 'border-sky-100 bg-sky-50 text-sky-700',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    danger: 'border-rose-100 bg-rose-50 text-rose-700',
};

const domainLabel: Record<string, string> = {
    purchase: 'Mua hàng',
    distribution: 'Cấp phát',
    maintenance: 'Bảo trì',
    asset: 'Máy móc',
    mixed: 'Tổng hợp',
};

const caseSeverityMeta: Record<string, { label: string; className: string; hint: string }> = {
    normal: {
        label: 'Ổn định',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: 'Chưa thấy tín hiệu bất thường lớn',
    },
    watch: {
        label: 'Cần theo dõi',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
        hint: 'Có biến động, nên đối soát nhanh',
    },
    high: {
        label: 'Rủi ro cao',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: 'Nên kiểm tra chứng từ và người phụ trách',
    },
    critical: {
        label: 'Nghiêm trọng',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
        hint: 'Cần xử lý ưu tiên',
    },
};

const priorityTone: Record<string, string> = {
    low: 'blue',
    medium: 'orange',
    high: 'red',
};

const buildOption = (chart: AnalyticsChart): EChartsCoreOption => {
    const isMoney = chart.unit === 'đ';
    const fmt = (v: number) => (isMoney ? `${Math.round(v).toLocaleString('vi-VN')}đ` : `${Number(v).toLocaleString('vi-VN')}`);

    if (chart.type === 'pie') {
        return {
            color: PALETTE,
            tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${fmt(p.value)} (${p.percent}%)` },
            legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
            series: [
                {
                    type: 'pie',
                    radius: ['42%', '70%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderColor: '#fff', borderWidth: 2 },
                    label: { formatter: '{b}: {d}%', fontSize: 11 },
                    data: chart.categories.map((c, i) => ({ name: c, value: chart.series[0]?.data[i] ?? 0 })),
                },
            ],
        };
    }

    return {
        color: PALETTE,
        tooltip: { trigger: 'axis', valueFormatter: (v: any) => fmt(Number(v)) },
        grid: { left: 8, right: 18, top: 28, bottom: 8, containLabel: true },
        xAxis: {
            type: 'category',
            data: chart.categories,
            axisLabel: { interval: 0, rotate: chart.categories.length > 6 ? 32 : 0, fontSize: 11 },
        },
        yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
        series: chart.series.map((s) => ({
            name: s.name,
            type: chart.type,
            data: s.data,
            smooth: chart.type === 'line',
            showSymbol: chart.type === 'line',
            barMaxWidth: 46,
            itemStyle: { color: ACCENT, borderRadius: chart.type === 'bar' ? [4, 4, 0, 0] : 0 },
            areaStyle: chart.type === 'line' ? { opacity: 0.12 } : undefined,
            animationDuration: 700,
        })),
    };
};

const ResultChart: React.FC<{ chart: AnalyticsChart | null; height?: number }> = ({ chart, height = 320 }) => {
    const option = useMemo(() => (chart ? buildOption(chart) : ({} as EChartsCoreOption)), [chart]);
    if (!chart || !chart.categories.length) {
        return <Empty description='Không vẽ được biểu đồ — xem bảng số bên dưới' image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    return <EChart option={option} height={height} />;
};

// Bảng đối chiếu số (giám đốc kiểm chứng), nhất là với kết quả "tham khảo" từ AI.
const DataTable: React.FC<{ table?: { columns: string[]; rows: (string | number)[][] }; unit?: string }> = ({ table, unit }) => {
    if (!table?.rows?.length) return null;
    const fmt = (v: string | number) => (typeof v === 'number' ? (unit === 'đ' ? `${v.toLocaleString('vi-VN')}đ` : v.toLocaleString('vi-VN')) : v);
    return (
        <div className='mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200'>
            <table className='w-full text-[12.5px]'>
                <thead className='bg-slate-50 text-slate-500'>
                    <tr>
                        {table.columns.map((c) => (
                            <th key={c} className='px-3 py-1.5 text-left font-medium'>
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((r, i) => (
                        <tr key={i} className='border-t border-slate-100'>
                            {r.map((cell, j) => (
                                <td key={j} className={`px-3 py-1.5 ${j === 0 ? 'text-slate-700' : 'text-right font-medium text-slate-800'}`}>
                                    {fmt(cell)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Một chart đã ghim — tự truy vấn lại theo spec (không cần AI).
const PinnedCard: React.FC<{ pin: Pin; onRemove: (id: string) => void }> = ({ pin, onRemove }) => {
    const { data, isFetching, refetch } = useQuery({
        queryKey: ['analytics-pin', pin.id],
        queryFn: () => aiAnalyticsService.query(pin.spec ? { spec: pin.spec } : { question: pin.question }),
        staleTime: 60_000,
    });
    return (
        <Card
            size='small'
            className='rounded-2xl border-slate-200 shadow-sm'
            title={<span className='text-[13px] font-semibold text-slate-700'>{pin.title || pin.spec?.title}</span>}
            extra={
                <span className='flex items-center gap-1'>
                    <Tooltip title='Làm mới'>
                        <Button type='text' size='small' icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} />
                    </Tooltip>
                    <Tooltip title='Bỏ ghim'>
                        <Button type='text' size='small' danger icon={<DeleteOutlined />} onClick={() => onRemove(pin.id)} />
                    </Tooltip>
                </span>
            }
        >
            {data ? (
                <>
                    <ResultChart chart={data.chart} height={240} />
                    <div className='mt-1 text-[11.5px] text-slate-500'>{data.narrative}</div>
                </>
            ) : (
                <div className='flex h-[240px] items-center justify-center'>
                    <Spin />
                </div>
            )}
        </Card>
    );
};

const REPLAY_SAMPLES = [
    'Vì sao chi phí vật tư tăng trong kỳ này?',
    'Điều tra các phiếu cấp phát bất thường gần đây',
    'Có NCC hoặc đơn mua nào đáng chú ý không?',
    'Bảo trì và sửa ngoài có điểm nào bất thường?',
];

const IncidentReplayPanel: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [question, setQuestion] = useState('Vì sao chi phí vật tư tăng trong kỳ này?');
    const [periodDays, setPeriodDays] = useState(30);
    const [result, setResult] = useState<IncidentReplayResult | null>(null);
    const [sessionId] = useState(() => getReplaySessionId());

    const { data: history = [] } = useQuery({
        queryKey: ['incident-replay-history'],
        queryFn: () => aiAnalyticsService.incidentReplayHistory(8),
        staleTime: 60_000,
    });

    const replayMut = useMutation({
        mutationFn: () => aiAnalyticsService.incidentReplay({ question, periodDays, sessionId }),
        onSuccess: (data) => {
            setResult(data);
            queryClient.invalidateQueries({ queryKey: ['incident-replay-history'] });
        },
        onError: () => message.error('Chưa dựng được Incident Replay, thử lại hoặc rút gọn câu hỏi.'),
    });

    const historyDetailMut = useMutation({
        mutationFn: (id: string) => aiAnalyticsService.incidentReplayHistoryDetail(id),
        onSuccess: (data) => setResult({ ...data, historyId: data.id }),
        onError: () => message.error('Không mở được replay đã lưu.'),
    });

    const feedbackMut = useMutation({
        mutationFn: (rating: 'accurate' | 'wrong' | 'missing_data' | 'irrelevant') =>
            aiAnalyticsService.incidentReplayFeedback(result?.historyId || '', { rating }),
        onSuccess: () => {
            message.success('Đã ghi nhận phản hồi');
            queryClient.invalidateQueries({ queryKey: ['incident-replay-history'] });
        },
        onError: () => message.error('Chưa ghi được phản hồi.'),
    });

    const runReplay = () => {
        if (!question.trim() || replayMut.isPending) return;
        replayMut.mutate();
    };

    return (
        <Card className='overflow-hidden rounded-2xl border-slate-200 shadow-sm'>
            <div className='-m-6 mb-5 border-b border-slate-100 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 px-6 py-5 text-white'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                        <div className='flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-cyan-200'>
                            <HistoryOutlined /> AI Incident Replay
                        </div>
                        <Title level={4} className='!mt-1 !mb-1 !text-white'>
                            Dựng lại nguyên nhân bất thường
                        </Title>
                        <div className='max-w-2xl text-[13px] text-slate-200'>
                            AI gom dữ liệu mua hàng, cấp phát, bảo trì và hiện trạng máy thành timeline điều tra. Số liệu gốc luôn hiển thị để đối soát.
                        </div>
                    </div>
                    <Tag className='!m-0 !rounded-full !border-white/20 !bg-white/10 !px-3 !py-1 !text-cyan-50'>
                        Không ghi dữ liệu
                    </Tag>
                </div>
            </div>

            <div className='grid grid-cols-1 gap-3 lg:grid-cols-[1fr_160px_auto]'>
                <Input.TextArea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder='Ví dụ: Vì sao tháng này chi phí cấp phát Phú Sơn tăng?'
                    onPressEnter={(e) => {
                        if (!e.shiftKey) {
                            e.preventDefault();
                            runReplay();
                        }
                    }}
                />
                <Select
                    value={periodDays}
                    onChange={setPeriodDays}
                    options={[
                        { value: 7, label: '7 ngày' },
                        { value: 30, label: '30 ngày' },
                        { value: 60, label: '60 ngày' },
                        { value: 90, label: '90 ngày' },
                        { value: 180, label: '180 ngày' },
                    ]}
                />
                <Button type='primary' icon={<FireOutlined />} loading={replayMut.isPending} onClick={runReplay}>
                    Replay
                </Button>
            </div>

            <div className='mt-3 flex flex-wrap gap-1.5'>
                {REPLAY_SAMPLES.map((sample) => (
                    <Tag
                        key={sample}
                        className='cursor-pointer !rounded-full !border-slate-200 !bg-slate-50 !px-3 !py-1 !text-[12px] hover:!border-cyan-500 hover:!text-cyan-700'
                        onClick={() => setQuestion(sample)}
                    >
                        {sample}
                    </Tag>
                ))}
            </div>

            {history.length ? (
                <div className='mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3'>
                    <div className='mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500'>Replay gần đây</div>
                    <div className='flex gap-2 overflow-x-auto pb-1'>
                        {history.map((item) => (
                            <div
                                key={item.id}
                                className='min-w-[240px] rounded-xl border border-white bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200'
                            >
                                <div className='truncate text-[12px] font-bold text-slate-800'>{item.question}</div>
                                <div className='mt-1 text-[11px] text-slate-500'>
                                    {item.periodLabel} · score {item.caseScore ?? '-'}
                                    {item.workflowStatus ? ` · ${REPLAY_WF_LABEL[item.workflowStatus] || item.workflowStatus}` : ''}
                                </div>
                                <div className='mt-2 flex gap-1.5'>
                                    <Button size='small' onClick={() => historyDetailMut.mutate(item.id)}>
                                        Xem nhanh
                                    </Button>
                                    <Button size='small' type='link' className='!px-1' onClick={() => navigate(`/ai-analytics/incident-replay/${item.id}`)}>
                                        Mở hồ sơ
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {replayMut.isPending ? (
                <div className='mt-5 flex h-[220px] flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 text-slate-500'>
                    <Spin />
                    <span className='text-sm'>Đang gom timeline và điều tra nguyên nhân...</span>
                </div>
            ) : result ? (
                <div className='mt-5 space-y-4'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Tag color='blue' className='!m-0 !rounded-full'>
                            {domainLabel[result.focus] || 'Tổng hợp'}
                        </Tag>
                        <Tag className='!m-0 !rounded-full'>
                            Kỳ này: {result.periodLabel}
                        </Tag>
                        <Tag className='!m-0 !rounded-full'>
                            Kỳ trước: {result.previousPeriodLabel}
                        </Tag>
                        <Tag color={result.aiUsed ? 'green' : 'orange'} className='!m-0 !rounded-full'>
                            {result.aiUsed ? 'AI phân tích' : 'Dự phòng'}
                        </Tag>
                        {result.version ? (
                            <Tag color='cyan' className='!m-0 !rounded-full'>
                                V{result.version}
                            </Tag>
                        ) : null}
                    </div>

                    <div className='flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm'>
                        <Button size='small' onClick={() => exportReplayReport(result)}>
                            Xuất báo cáo
                        </Button>
                        {result.historyId ? (
                            <>
                                <Button size='small' type='primary' onClick={() => navigate(`/ai-analytics/incident-replay/${result.historyId}`)}>
                                    Mở Case File
                                </Button>
                                <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('accurate')}>
                                    Đúng
                                </Button>
                                <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('wrong')}>
                                    Sai
                                </Button>
                                <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('missing_data')}>
                                    Thiếu dữ liệu
                                </Button>
                            </>
                        ) : null}
                    </div>

                    {result.scope?.applied ? (
                        <div className='rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-2'>
                            <div className='text-[12px] font-bold uppercase tracking-wide text-cyan-800'>Phạm vi phân tích</div>
                            <div className='mt-1 flex flex-wrap gap-1.5'>
                                {result.scope.notes.map((note) => (
                                    <Tag key={note} color='cyan' className='!m-0 !rounded-full'>
                                        {note}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className='grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]'>
                        <div className='relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-100 blur-2xl' />
                            <div className='relative'>
                                <div className='text-[12px] font-semibold uppercase tracking-wide text-slate-500'>Incident Score</div>
                                <div className='mt-3 flex items-end gap-2'>
                                    <span className='text-[44px] font-black leading-none text-slate-950'>{result.caseScore}</span>
                                    <span className='pb-1 text-sm font-semibold text-slate-400'>/100</span>
                                </div>
                                <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[12px] font-bold ${caseSeverityMeta[result.caseSeverity]?.className}`}>
                                    {caseSeverityMeta[result.caseSeverity]?.label || result.caseSeverity}
                                </div>
                                <div className='mt-2 text-[12px] text-slate-500'>{caseSeverityMeta[result.caseSeverity]?.hint}</div>
                            </div>
                        </div>

                        <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <CheckCircleOutlined className='text-emerald-500' /> Kết luận điều tra nhanh
                            </div>
                            <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                                {result.rootCauseChains.slice(0, 3).map((chain, idx) => (
                                    <div key={`${chain.title}-${idx}`} className={`rounded-xl border px-3 py-2 ${replayTone[chain.severity]}`}>
                                        <div className='truncate text-[12px] font-bold'>{chain.title}</div>
                                        <div className='mt-1 text-[11px] opacity-80'>
                                            Tin cậy {chain.confidence}% · {fmtReplayValue(chain.value, 'vnd')}
                                        </div>
                                    </div>
                                ))}
                                {!result.rootCauseChains.length ? (
                                    <div className='rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-500'>
                                        Chưa đủ dữ liệu tạo chuỗi nguyên nhân rõ ràng.
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 leading-6 text-slate-700'>
                        <MarkdownLite text={result.narrative} className='text-[13px]' />
                    </div>

                    {result.flags.length ? (
                        <Alert
                            showIcon
                            type='warning'
                            message='Điểm cần kiểm tra'
                            description={
                                <div className='mt-1 flex flex-wrap gap-1.5'>
                                    {result.flags.map((flag) => (
                                        <Tag key={flag} color='orange' className='!m-0 !rounded-full'>
                                            {flag}
                                        </Tag>
                                    ))}
                                </div>
                            }
                        />
                    ) : null}

                    {result.anomalies?.length ? (
                        <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <FireOutlined className='text-rose-500' /> Anomaly Radar
                            </div>
                            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
                                {result.anomalies.slice(0, 6).map((anomaly, idx) => (
                                    <div key={`${anomaly.title}-${idx}`} className={`rounded-xl border p-3 ${replayTone[anomaly.severity]}`}>
                                        <div className='flex items-start justify-between gap-2'>
                                            <div className='min-w-0'>
                                                <div className='truncate text-[13px] font-bold'>{anomaly.title}</div>
                                                <div className='mt-1 text-[11px] opacity-80'>
                                                    {domainLabel[anomaly.domain]} · score {Math.round(anomaly.score)}
                                                </div>
                                            </div>
                                            <span className='rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold'>
                                                {anomaly.severity}
                                            </span>
                                        </div>
                                        <div className='mt-2 text-[12px] leading-5'>{anomaly.description}</div>
                                        {anomaly.evidence?.length ? (
                                            <div className='mt-2 space-y-1'>
                                                {anomaly.evidence.slice(0, 2).map((line) => (
                                                    <div key={line} className='truncate text-[11px] opacity-80'>
                                                        {line}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {result.rootCauseChains.length ? (
                        <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <HistoryOutlined className='text-cyan-600' /> Chuỗi nguyên nhân
                            </div>
                            <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
                                {result.rootCauseChains.slice(0, 4).map((chain, idx) => (
                                    <div key={`${chain.title}-${idx}`} className='rounded-xl border border-slate-100 bg-slate-50 p-3'>
                                        <div className='flex flex-wrap items-start justify-between gap-2'>
                                            <div className='min-w-0'>
                                                <div className='truncate text-[13px] font-bold text-slate-900'>{chain.title}</div>
                                                <div className='mt-1 text-[11px] text-slate-500'>
                                                    {domainLabel[chain.domain]} · độ tin cậy {chain.confidence}%
                                                </div>
                                            </div>
                                            <Tag color={chain.severity === 'danger' ? 'red' : chain.severity === 'warning' ? 'orange' : 'blue'} className='!m-0 !rounded-full'>
                                                {fmtReplayValue(chain.value, 'vnd')}
                                            </Tag>
                                        </div>
                                        <div className='mt-3 space-y-1.5'>
                                            {chain.steps.slice(0, 4).map((step, stepIdx) => (
                                                <div key={step} className='flex gap-2 text-[12px] leading-5 text-slate-600'>
                                                    <span className='mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500'>
                                                        {stepIdx + 1}
                                                    </span>
                                                    <span>{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {chain.evidence.length ? (
                                            <div className='mt-3 border-t border-slate-200 pt-2'>
                                                {chain.evidence.slice(0, 3).map((line) => (
                                                    <div key={line} className='truncate text-[11px] text-slate-500'>
                                                        {line}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {result.recommendations.length ? (
                        <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <LinkOutlined className='text-indigo-500' /> Hành động đề xuất
                            </div>
                            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
                                {result.recommendations.map((rec) => (
                                    <div key={rec.title} className='rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3'>
                                        <div className='flex items-start justify-between gap-2'>
                                            <div className='text-[13px] font-bold text-slate-900'>{rec.title}</div>
                                            <Tag color={priorityTone[rec.priority]} className='!m-0 !rounded-full'>
                                                {rec.priority}
                                            </Tag>
                                        </div>
                                        <div className='mt-2 text-[12px] leading-5 text-slate-600'>{rec.description}</div>
                                        {rec.route ? (
                                            <Button size='small' type='link' className='!mt-1 !px-0' onClick={() => navigate(rec.route!)}>
                                                Mở module liên quan
                                            </Button>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {result.breakdowns?.length ? (
                        <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <BarChartOutlined className='text-blue-500' /> Breakdown so với kỳ trước
                            </div>
                            <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
                                {result.breakdowns.slice(0, 4).map((group) => (
                                    <div key={group.key} className='rounded-xl border border-slate-100 bg-slate-50 p-3'>
                                        <div className='mb-2 flex items-center justify-between gap-2'>
                                            <div>
                                                <div className='text-[13px] font-bold text-slate-900'>{group.title}</div>
                                                <div className='text-[11px] text-slate-500'>
                                                    Tổng {fmtReplayValue(group.total, 'vnd')}
                                                </div>
                                            </div>
                                            <Tag className='!m-0 !rounded-full'>{domainLabel[group.domain]}</Tag>
                                        </div>
                                        <div className='space-y-2'>
                                            {group.rows.slice(0, 6).map((row) => {
                                                const up = row.delta > 0;
                                                return (
                                                    <div key={row.label} className='rounded-lg bg-white px-3 py-2'>
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <div className='min-w-0 truncate text-[12px] font-semibold text-slate-700'>{row.label}</div>
                                                            <div className='text-[12px] font-bold text-slate-900'>{fmtReplayValue(row.value, 'vnd')}</div>
                                                        </div>
                                                        <div className='mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500'>
                                                            <span>{row.sharePct}% nhóm · {row.count} dòng</span>
                                                            <span className={up ? 'font-semibold text-rose-600' : row.delta < 0 ? 'font-semibold text-emerald-600' : ''}>
                                                                {up ? '+' : ''}{fmtReplayValue(row.delta, 'vnd')} · {up ? '+' : ''}{row.deltaPct}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
                        {result.metrics.map((metric) => {
                            const up = metric.delta > 0;
                            const neutral = metric.delta === 0;
                            return (
                                <div key={metric.key} className='rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
                                    <div className='text-[12px] font-medium text-slate-500'>{metric.label}</div>
                                    <div className='mt-1 text-[20px] font-bold text-slate-900'>
                                        {fmtReplayValue(metric.current, metric.unit)}
                                    </div>
                                    <div className={`mt-1 text-[12px] font-semibold ${neutral ? 'text-slate-500' : up ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {neutral ? 'Không đổi' : `${up ? '+' : ''}${fmtReplayValue(metric.delta, metric.unit)} (${up ? '+' : ''}${metric.deltaPct}%)`}
                                    </div>
                                    <div className='mt-1 text-[11px] text-slate-400'>
                                        Kỳ trước: {fmtReplayValue(metric.previous, metric.unit)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]'>
                        <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <FireOutlined className='text-orange-500' /> Tác nhân chính
                            </div>
                            {result.drivers.length ? (
                                <div className='space-y-2'>
                                    {result.drivers.slice(0, 8).map((driver, idx) => (
                                        <div key={`${driver.label}-${idx}`} className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'>
                                            <div className='flex items-start justify-between gap-2'>
                                                <div className='min-w-0'>
                                                    <div className='truncate text-[13px] font-semibold text-slate-800'>{driver.label}</div>
                                                    <div className='text-[11px] text-slate-500'>
                                                        {domainLabel[driver.domain]} · {driver.count} dòng/sự kiện
                                                    </div>
                                                </div>
                                                <div className='text-right text-[12px] font-bold text-slate-900'>
                                                    {fmtReplayValue(driver.value, 'vnd')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có driver đủ rõ' />
                            )}
                        </div>

                        <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-800'>
                                <ClockCircleOutlined className='text-blue-500' /> Timeline bằng chứng
                            </div>
                            {result.events.length ? (
                                <div className='max-h-[460px] space-y-2 overflow-auto pr-1'>
                                    {result.events.map((event) => (
                                        <div
                                            key={`${event.type}-${event.id}`}
                                            className={`relative rounded-xl border border-slate-100 bg-white p-3 shadow-sm ${event.route ? 'cursor-pointer transition hover:border-cyan-200 hover:shadow-md' : ''}`}
                                            onClick={() => event.route && navigate(event.route)}
                                        >
                                            <div className='flex flex-wrap items-start justify-between gap-2'>
                                                <div className='min-w-0'>
                                                    <div className='flex flex-wrap items-center gap-2'>
                                                        <span className='text-[13px] font-bold text-slate-800'>{event.title}</span>
                                                        <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${replayTone[event.severity]}`}>
                                                            {domainLabel[event.type]}
                                                        </span>
                                                    </div>
                                                    <div className='mt-1 text-[12px] text-slate-500'>{event.subtitle}</div>
                                                </div>
                                                <div className='text-right'>
                                                    <div className='text-[12px] font-bold text-slate-900'>{fmtReplayValue(event.value, 'vnd')}</div>
                                                    <div className='text-[11px] text-slate-400'>{replayDate(event.at)}</div>
                                                </div>
                                            </div>
                                            {event.evidence?.length ? (
                                                <div className='mt-2 flex flex-wrap gap-1'>
                                                    {event.evidence.slice(0, 5).map((line) => (
                                                        <Tag key={line} className='!m-0 !rounded-full !text-[11px]'>
                                                            {line}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có sự kiện trong kỳ' />
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </Card>
    );
};

const AiAnalyticsStudioPage: React.FC = () => {
    const { message } = App.useApp();
    const [question, setQuestion] = useState('');
    const [submittedQuestion, setSubmittedQuestion] = useState('');
    const [result, setResult] = useState<AnalyticsResult | null>(null);
    const [pins, setPins] = useState<Pin[]>(() => loadPins());

    const { data: catalog } = useQuery({ queryKey: ['analytics-catalog'], queryFn: () => aiAnalyticsService.catalog() });

    const queryMut = useMutation({
        mutationFn: (q: string) => aiAnalyticsService.query({ question: q }),
        onSuccess: (data) => setResult(data),
        onError: () => message.error('Không phân tích được câu hỏi, thử diễn đạt khác.'),
    });

    const run = (q: string) => {
        const text = q.trim();
        if (!text || queryMut.isPending) return;
        setQuestion(text);
        setSubmittedQuestion(text);
        queryMut.mutate(text);
    };

    const setChartType = (type: 'bar' | 'line' | 'pie') => {
        if (!result?.chart) return;
        setResult({
            ...result,
            spec: result.spec ? { ...result.spec, chartType: type } : result.spec,
            chart: { ...result.chart, type },
        });
    };

    // Ghim cả catalog (theo spec) lẫn agentic (theo câu hỏi).
    const pinResult = () => {
        if (!result) return;
        const title = result.chart?.title || result.spec?.title || submittedQuestion || 'Phân tích';
        const id = `pin-${Date.now()}`;
        const pin: Pin = result.spec
            ? { id, title, spec: { ...result.spec, chartType: result.chart?.type ?? result.spec.chartType } }
            : { id, title, question: submittedQuestion };
        if (!pin.spec && !pin.question) {
            message.info('Không ghim được kết quả này');
            return;
        }
        const next = [pin, ...pins].slice(0, 12);
        setPins(next);
        savePins(next);
        message.success('Đã ghim vào bảng phân tích');
    };

    const removePin = (id: string) => {
        const next = pins.filter((p) => p.id !== id);
        setPins(next);
        savePins(next);
    };

    return (
        <div className='flex flex-col gap-5'>
            {/* Header */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
                <div className='flex items-center gap-2 text-sm font-bold tracking-wide uppercase' style={{ color: ACCENT }}>
                    <RobotOutlined /> AI Analytics Studio
                </div>
                <Title level={3} className='!mt-1 !mb-1'>
                    Hỏi bằng lời, ra biểu đồ
                </Title>
                <Text type='secondary'>
                    Gõ câu hỏi về máy móc, bảo trì, mua sắm — AI tự chọn chỉ số và vẽ biểu đồ từ dữ liệu thật.
                </Text>

                <div className='mt-4 flex items-end gap-2'>
                    <Input.TextArea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        placeholder='Ví dụ: Giá trị đề xuất mua theo cơ sở 6 tháng gần nhất'
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                run(question);
                            }
                        }}
                    />
                    <Button
                        type='primary'
                        icon={<SendOutlined />}
                        loading={queryMut.isPending}
                        onClick={() => run(question)}
                        style={{ background: ACCENT }}
                    >
                        Phân tích
                    </Button>
                </div>

                {catalog?.samples?.length ? (
                    <div className='mt-3 flex flex-wrap gap-1.5'>
                        {catalog.samples.map((s) => (
                            <Tag
                                key={s}
                                className='cursor-pointer !rounded-full !border-slate-200 !bg-slate-50 !px-3 !py-1 !text-[12px] hover:!border-[#2f51d9] hover:!text-[#2f51d9]'
                                onClick={() => run(s)}
                            >
                                {s}
                            </Tag>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* Incident Replay */}
            <IncidentReplayPanel />

            {/* Kết quả */}
            {queryMut.isPending ? (
                <Card className='rounded-2xl border-slate-200 shadow-sm'>
                    <div className='flex h-[320px] flex-col items-center justify-center gap-3 text-slate-500'>
                        <Spin />
                        <span className='text-sm'>AI đang chọn chỉ số và truy vấn dữ liệu…</span>
                    </div>
                </Card>
            ) : result ? (
                <Card className='rounded-2xl border-slate-200 shadow-sm'>
                    <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                        <div className='min-w-0'>
                            <div className='flex items-center gap-2'>
                                <div className='text-[15px] font-bold text-slate-800'>
                                    {result.chart?.title || 'Kết quả phân tích'}
                                </div>
                                {result.trusted ? (
                                    <Tag color='green' className='!m-0 !rounded-full !text-[10.5px]'>
                                        Số liệu chuẩn
                                    </Tag>
                                ) : (
                                    <Tooltip title='Câu mở — AI tự khám phá từ dữ liệu thật. Đối chiếu bảng số bên dưới trước khi báo cáo.'>
                                        <Tag color='orange' className='!m-0 !rounded-full !text-[10.5px]'>
                                            Tham khảo (AI khám phá)
                                        </Tag>
                                    </Tooltip>
                                )}
                            </div>
                            <div className='text-[12px] text-slate-500'>
                                {result.spec
                                    ? `${result.spec.metricLabel} · theo ${result.spec.dimensionLabel}`
                                    : 'Trợ lý AI tổng hợp từ dữ liệu thật'}
                                {result.aiUsed ? ' · AI chọn chỉ số' : ''}
                            </div>
                        </div>
                        <div className='flex items-center gap-2'>
                            {result.chart ? (
                                <Segmented
                                    size='small'
                                    value={result.chart.type}
                                    onChange={(v) => setChartType(v as 'bar' | 'line' | 'pie')}
                                    options={[
                                        { value: 'bar', icon: <BarChartOutlined /> },
                                        { value: 'line', icon: <LineChartOutlined /> },
                                        { value: 'pie', icon: <PieChartOutlined /> },
                                    ]}
                                />
                            ) : null}
                            {result.spec || submittedQuestion ? (
                                <Button icon={<PushpinOutlined />} onClick={pinResult}>
                                    Ghim
                                </Button>
                            ) : null}
                        </div>
                    </div>
                    <ResultChart chart={result.chart} />
                    <div className='mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600'>
                        {result.narrative}
                    </div>
                    {!result.trusted || !result.chart ? <DataTable table={result.table} unit={result.chart?.unit} /> : null}
                </Card>
            ) : (
                <Card className='rounded-2xl border-dashed border-slate-200'>
                    <Empty
                        description='Gõ một câu hỏi hoặc bấm gợi ý phía trên để bắt đầu'
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </Card>
            )}

            {/* Bảng đã ghim */}
            {pins.length ? (
                <div>
                    <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600'>
                        <PushpinOutlined /> Bảng phân tích đã ghim ({pins.length})
                    </div>
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        {pins.map((pin) => (
                            <PinnedCard key={pin.id} pin={pin} onRemove={removePin} />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default AiAnalyticsStudioPage;
