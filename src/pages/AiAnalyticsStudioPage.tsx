import React, { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Segmented, Spin, Tag, Tooltip, Typography } from 'antd';
import {
    BarChartOutlined,
    DeleteOutlined,
    LineChartOutlined,
    PieChartOutlined,
    PushpinOutlined,
    ReloadOutlined,
    RobotOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import EChart, { type EChartsCoreOption } from '../components/charts/EChart';
import {
    aiAnalyticsService,
    type AnalyticsChart,
    type AnalyticsResult,
    type AnalyticsSpec,
} from '../core/services/ai-help.service';

const { Text, Title } = Typography;
const ACCENT = '#2f51d9';
const PALETTE = ['#2f51d9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#ec4899', '#64748b'];
const PINS_KEY = 'hd-analytics-pins';

type Pin = { id: string; spec: AnalyticsSpec };

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

const fmtVal = (v: number, unit: string) =>
    unit === 'đ' ? `${Math.round(v).toLocaleString('vi-VN')}đ` : `${v.toLocaleString('vi-VN')} ${unit}`;

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

const ResultChart: React.FC<{ result: AnalyticsResult; height?: number }> = ({ result, height = 320 }) => {
    const option = useMemo(() => buildOption(result.chart), [result]);
    if (!result.chart.categories.length) {
        return <Empty description='Chưa có dữ liệu phù hợp' image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    return <EChart option={option} height={height} />;
};

// Một chart đã ghim — tự truy vấn lại theo spec (không cần AI).
const PinnedCard: React.FC<{ pin: Pin; onRemove: (id: string) => void }> = ({ pin, onRemove }) => {
    const { data, isFetching, refetch } = useQuery({
        queryKey: ['analytics-pin', pin.id, pin.spec],
        queryFn: () => aiAnalyticsService.query({ spec: pin.spec }),
        staleTime: 60_000,
    });
    return (
        <Card
            size='small'
            className='rounded-2xl border-slate-200 shadow-sm'
            title={<span className='text-[13px] font-semibold text-slate-700'>{pin.spec.title}</span>}
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
                    <ResultChart result={data} height={240} />
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

const AiAnalyticsStudioPage: React.FC = () => {
    const { message } = App.useApp();
    const [question, setQuestion] = useState('');
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
        queryMut.mutate(text);
    };

    const setChartType = (type: 'bar' | 'line' | 'pie') => {
        if (!result) return;
        setResult({ ...result, spec: { ...result.spec, chartType: type }, chart: { ...result.chart, type } });
    };

    const pinResult = () => {
        if (!result) return;
        const id = `${result.spec.metric}-${result.spec.dimension}-${Date.now()}`;
        const next = [{ id, spec: { ...result.spec, chartType: result.chart.type } }, ...pins].slice(0, 12);
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
                            <div className='text-[15px] font-bold text-slate-800'>{result.chart.title}</div>
                            <div className='text-[12px] text-slate-500'>
                                {result.spec.metricLabel} · theo {result.spec.dimensionLabel}
                                {result.aiUsed ? ' · AI chọn chỉ số' : ''}
                            </div>
                        </div>
                        <div className='flex items-center gap-2'>
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
                            <Button icon={<PushpinOutlined />} onClick={pinResult}>
                                Ghim
                            </Button>
                        </div>
                    </div>
                    <ResultChart result={result} />
                    <div className='mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600'>
                        {result.narrative}
                    </div>
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
