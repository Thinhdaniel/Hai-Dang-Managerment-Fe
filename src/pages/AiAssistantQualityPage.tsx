import React, { useMemo, useState } from 'react';
import {
    App,
    Button,
    Descriptions,
    Drawer,
    Empty,
    Grid,
    Input,
    Pagination,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DatabaseOutlined,
    ExperimentOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import EChart, { type EChartsCoreOption } from '../components/charts/EChart';
import { useAuth } from '../core/contexts/AuthContext';
import { isSuperAdmin } from '../core/lib/permissions';
import {
    aiAssistantQualityService,
    type AssistantQualityOverview,
    type AssistantTraceDetail,
    type AssistantTraceSummary,
} from '../core/services/ai-assistant-quality.service';

const { Text, Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const fmtNumber = (value?: number) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(value || 0)));
const fmtDuration = (value?: number) => {
    const ms = Number(value || 0);
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
};
const fmtDateTime = (value?: string) =>
    value
        ? new Intl.DateTimeFormat('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
          }).format(new Date(value))
        : '';

const statusMeta: Record<string, { label: string; color: string }> = {
    success: { label: 'Thành công', color: 'green' },
    fallback: { label: 'Fallback', color: 'gold' },
    policy: { label: 'Chặn quyền', color: 'blue' },
    error: { label: 'Lỗi', color: 'red' },
};

const groundingMeta: Record<string, { label: string; color: string }> = {
    verified: { label: 'Đã đối chiếu', color: 'green' },
    corrected: { label: 'Đã hiệu chỉnh', color: 'blue' },
    unverified: { label: 'Chưa kiểm chứng', color: 'orange' },
    not_applicable: { label: 'Không áp dụng', color: 'default' },
};

const feedbackReasonLabel: Record<string, string> = {
    incorrect: 'Sai số liệu',
    misunderstood: 'Hiểu sai câu hỏi',
    missing_data: 'Thiếu dữ liệu',
    too_slow: 'Phản hồi chậm',
    too_verbose: 'Trả lời quá dài',
    other: 'Lý do khác',
};

const MetricCell: React.FC<{
    label: string;
    value: React.ReactNode;
    note: string;
    tone?: 'normal' | 'good' | 'warn';
}> = ({ label, value, note, tone = 'normal' }) => (
    <div className='min-w-0 border-r border-slate-200 px-4 py-3 last:border-r-0 md:px-5'>
        <div className='text-[11px] font-bold tracking-wide text-slate-500 uppercase'>{label}</div>
        <div
            className={`mt-1 text-2xl font-black ${
                tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-950'
            }`}
        >
            {value}
        </div>
        <div className='mt-0.5 truncate text-[11px] font-medium text-slate-400'>{note}</div>
    </div>
);

const TraceStatus: React.FC<{ trace: AssistantTraceSummary }> = ({ trace }) => (
    <div className='flex flex-wrap items-center gap-1'>
        <Tag color={statusMeta[trace.status]?.color || 'default'} className='!m-0'>
            {statusMeta[trace.status]?.label || trace.status}
        </Tag>
        {trace.grounding ? (
            <Tag color={groundingMeta[trace.grounding]?.color || 'default'} className='!m-0'>
                {groundingMeta[trace.grounding]?.label || trace.grounding}
            </Tag>
        ) : null}
        {trace.feedback?.rating === 'not_helpful' ? (
            <Tag color='red' className='!m-0'>
                Chưa hữu ích
            </Tag>
        ) : trace.feedback?.rating === 'helpful' ? (
            <Tag color='green' className='!m-0'>
                Hữu ích
            </Tag>
        ) : null}
    </div>
);

const buildTrendOption = (data?: AssistantQualityOverview): EChartsCoreOption => ({
    animationDuration: 500,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 42, right: 18, top: 42, bottom: 32 },
    xAxis: {
        type: 'category',
        data: data?.daily.map((item) => item.date.slice(5)) || [],
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b' },
    },
    yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: '#64748b' },
    },
    series: [
        {
            name: 'Câu hỏi',
            type: 'line',
            smooth: true,
            symbolSize: 7,
            data: data?.daily.map((item) => item.total) || [],
            lineStyle: { width: 3, color: '#2563eb' },
            itemStyle: { color: '#2563eb' },
            areaStyle: { color: 'rgba(37,99,235,.08)' },
        },
        {
            name: 'Cần rà soát',
            type: 'bar',
            barMaxWidth: 18,
            data: data?.daily.map((item) => item.fallback + item.unverified + item.notHelpful) || [],
            itemStyle: { color: '#f59e0b', borderRadius: [3, 3, 0, 0] },
        },
    ],
});

const TraceDetailDrawer: React.FC<{
    reqId?: string;
    open: boolean;
    models: string[];
    onClose: () => void;
}> = ({ reqId, open, models, onClose }) => {
    const screens = useBreakpoint();
    const { message } = App.useApp();
    const [replayModel, setReplayModel] = useState<string>();
    const detailQuery = useQuery({
        queryKey: ['assistant-quality', 'trace', reqId],
        queryFn: () => aiAssistantQualityService.getTrace(reqId!),
        enabled: open && Boolean(reqId),
    });
    const replayMutation = useMutation({
        mutationFn: () => aiAssistantQualityService.replay(reqId!, replayModel),
        onError: () => message.error('Không replay được trace này'),
    });
    const trace = detailQuery.data;
    const replay = replayMutation.data;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={screens.md ? 720 : '100%'}
            title={<span className='font-black text-slate-900'>Chi tiết AI trace</span>}
            destroyOnHidden
        >
            {detailQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 12 }} />
            ) : trace ? (
                <div className='space-y-5'>
                    <section className='border-b border-slate-200 pb-4'>
                        <div className='mb-2 flex flex-wrap items-center gap-2'>
                            <TraceStatus trace={trace} />
                            <span className='font-mono text-[11px] text-slate-400'>{trace.reqId}</span>
                        </div>
                        <Title level={5} className='!mb-2 !font-black !text-slate-950'>
                            {trace.question}
                        </Title>
                        <Paragraph className='!mb-0 !text-sm !leading-6 whitespace-pre-wrap !text-slate-600'>
                            {trace.answerPreview || 'Không có bản xem trước câu trả lời'}
                        </Paragraph>
                    </section>

                    <Descriptions size='small' bordered column={screens.md ? 3 : 1}>
                        <Descriptions.Item label='Người dùng'>
                            {trace.userId?.name || trace.userId?.email || trace.role}
                        </Descriptions.Item>
                        <Descriptions.Item label='Model'>{trace.model || trace.provider || '-'}</Descriptions.Item>
                        <Descriptions.Item label='Thời gian'>{fmtDuration(trace.tookMs)}</Descriptions.Item>
                        <Descriptions.Item label='Prompt'>{trace.promptVersion}</Descriptions.Item>
                        <Descriptions.Item label='Tool registry'>{trace.toolRegistryVersion}</Descriptions.Item>
                        <Descriptions.Item label='Cơ sở'>{trace.plantName || '-'}</Descriptions.Item>
                    </Descriptions>

                    <section>
                        <div className='mb-2 flex items-center gap-2 font-black text-slate-900'>
                            <ExperimentOutlined className='text-blue-600' /> Planner
                        </div>
                        {trace.planner?.used ? (
                            <div className='border-l-2 border-blue-200 pl-3'>
                                <div className='text-sm font-semibold text-slate-700'>
                                    {trace.planner.goal || 'Kế hoạch truy vấn'}
                                </div>
                                <div className='mt-2 space-y-1.5'>
                                    {(trace.planner.steps || []).map((step, index) => (
                                        <div
                                            key={`${step.tool}-${index}`}
                                            className='flex gap-2 text-xs text-slate-600'
                                        >
                                            <span className='font-mono font-bold text-blue-700'>{step.tool}</span>
                                            <span>{step.purpose || ''}</span>
                                        </div>
                                    ))}
                                </div>
                                {trace.planner.error ? (
                                    <div className='mt-2 text-xs text-red-600'>{trace.planner.error}</div>
                                ) : null}
                            </div>
                        ) : (
                            <Text className='text-sm text-slate-400'>Tuyến nhanh, không dùng planner</Text>
                        )}
                    </section>

                    <section>
                        <div className='mb-2 flex items-center gap-2 font-black text-slate-900'>
                            <ToolOutlined className='text-slate-600' /> Tool execution
                        </div>
                        <div className='divide-y divide-slate-100 border-y border-slate-200'>
                            {(trace.tools || []).map((tool, index) => (
                                <div key={`${tool.tool}-${index}`} className='py-3'>
                                    <div className='flex items-center gap-2'>
                                        {tool.success ? (
                                            <CheckCircleOutlined className='text-emerald-600' />
                                        ) : (
                                            <CloseCircleOutlined className='text-red-600' />
                                        )}
                                        <span className='font-mono text-xs font-bold text-slate-800'>{tool.tool}</span>
                                        <Tag className='!m-0'>{tool.phase}</Tag>
                                        <span className='ml-auto text-xs font-semibold text-slate-400'>
                                            {fmtDuration(tool.durationMs)}
                                        </span>
                                    </div>
                                    {tool.scope || tool.records != null ? (
                                        <div className='mt-1 pl-6 text-xs text-slate-500'>
                                            {[
                                                tool.scope,
                                                tool.records != null ? `${fmtNumber(tool.records)} bản ghi` : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </div>
                                    ) : null}
                                    {tool.errorMessage ? (
                                        <div className='mt-1 pl-6 text-xs text-red-600'>{tool.errorMessage}</div>
                                    ) : null}
                                    {tool.args && Object.keys(tool.args).length ? (
                                        <pre className='mt-2 max-h-32 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] leading-4 text-slate-600'>
                                            {JSON.stringify(tool.args, null, 2)}
                                        </pre>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>

                    {trace.feedback ? (
                        <section className='border-l-2 border-rose-300 pl-3'>
                            <div className='text-sm font-black text-slate-900'>Phản hồi người dùng</div>
                            <div className='mt-1 text-sm text-slate-600'>
                                {trace.feedback.rating === 'helpful'
                                    ? 'Hữu ích'
                                    : feedbackReasonLabel[trace.feedback.reason || 'other']}
                                {trace.feedback.note ? ` · ${trace.feedback.note}` : ''}
                            </div>
                        </section>
                    ) : null}

                    <section className='border-t border-slate-200 pt-4'>
                        <div className='flex flex-col gap-2 sm:flex-row'>
                            <Select
                                allowClear
                                showSearch
                                value={replayModel}
                                onChange={setReplayModel}
                                options={models.map((model) => ({ value: model, label: model }))}
                                placeholder='Model theo router hiện tại'
                                className='min-w-0 flex-1'
                            />
                            <Button
                                type='primary'
                                icon={<ReloadOutlined />}
                                loading={replayMutation.isPending}
                                onClick={() => replayMutation.mutate()}
                            >
                                Chạy lại
                            </Button>
                        </div>
                        {replay ? (
                            <div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
                                <div className='border border-slate-200 bg-slate-50 p-3'>
                                    <div className='text-[11px] font-bold text-slate-500 uppercase'>Bản gốc</div>
                                    <div className='mt-1 text-xs font-semibold text-slate-700'>
                                        {replay.baseline.model || replay.baseline.provider} ·{' '}
                                        {fmtDuration(replay.baseline.tookMs)}
                                    </div>
                                    <div className='mt-2 text-xs leading-5 whitespace-pre-wrap text-slate-600'>
                                        {replay.baseline.answer}
                                    </div>
                                </div>
                                <div className='border border-blue-200 bg-blue-50/40 p-3'>
                                    <div className='text-[11px] font-bold text-blue-600 uppercase'>Replay</div>
                                    <div className='mt-1 text-xs font-semibold text-slate-700'>
                                        {replay.replay.model || replay.replay.provider} ·{' '}
                                        {fmtDuration(replay.replay.tookMs)}
                                    </div>
                                    <div className='mt-2 text-xs leading-5 whitespace-pre-wrap text-slate-600'>
                                        {replay.replay.answer}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </section>
                </div>
            ) : (
                <Empty description='Không tải được trace' />
            )}
        </Drawer>
    );
};

const AiAssistantQualityPage: React.FC = () => {
    const screens = useBreakpoint();
    const { user } = useAuth();
    const [days, setDays] = useState(7);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<string>();
    const [feedback, setFeedback] = useState<string>();
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [selectedReqId, setSelectedReqId] = useState<string>();

    const overviewQuery = useQuery({
        queryKey: ['assistant-quality', 'overview', days],
        queryFn: () => aiAssistantQualityService.getOverview(days),
        enabled: isSuperAdmin(user?.role),
        staleTime: 30_000,
    });
    const tracesQuery = useQuery({
        queryKey: ['assistant-quality', 'traces', days, page, status, feedback, search],
        queryFn: () => aiAssistantQualityService.listTraces({ days, page, limit: 20, status, feedback, search }),
        enabled: isSuperAdmin(user?.role),
        staleTime: 15_000,
    });
    const overview = overviewQuery.data;
    const summary = overview?.summary;
    const trendOption = useMemo(() => buildTrendOption(overview), [overview]);

    const toolColumns = [
        {
            title: 'Tool',
            dataIndex: 'tool',
            render: (value: string) => <span className='font-mono text-xs font-bold'>{value}</span>,
        },
        { title: 'Lượt gọi', dataIndex: 'calls', width: 90, align: 'right' as const },
        {
            title: 'Lỗi',
            dataIndex: 'errors',
            width: 80,
            align: 'right' as const,
            render: (value: number) => (
                <span className={value ? 'font-bold text-red-600' : 'text-slate-400'}>{value}</span>
            ),
        },
        {
            title: 'TB',
            dataIndex: 'avgDurationMs',
            width: 90,
            align: 'right' as const,
            render: fmtDuration,
        },
    ];

    const traceColumns = [
        {
            title: 'Câu hỏi',
            dataIndex: 'question',
            render: (value: string, row: AssistantTraceSummary) => (
                <button type='button' onClick={() => setSelectedReqId(row.reqId)} className='max-w-[460px] text-left'>
                    <div className='line-clamp-2 text-sm font-bold text-slate-900 hover:text-blue-700'>{value}</div>
                    <div className='mt-1 text-[11px] text-slate-400'>
                        {row.userId?.name || row.userId?.email || 'Người dùng'} · {fmtDateTime(row.createdAt)}
                    </div>
                </button>
            ),
        },
        {
            title: 'Trạng thái',
            width: 190,
            render: (_: unknown, row: AssistantTraceSummary) => <TraceStatus trace={row} />,
        },
        {
            title: 'Model',
            width: 190,
            render: (_: unknown, row: AssistantTraceSummary) => (
                <div className='max-w-[180px] truncate text-xs font-semibold text-slate-600' title={row.model}>
                    {row.model || row.provider || '-'}
                </div>
            ),
        },
        { title: 'Tool', dataIndex: 'toolCallCount', width: 65, align: 'right' as const },
        { title: 'Độ trễ', dataIndex: 'tookMs', width: 85, align: 'right' as const, render: fmtDuration },
    ];

    if (!isSuperAdmin(user?.role)) return <Navigate to='/dashboard' replace />;

    return (
        <div className='w-full min-w-0 space-y-4'>
            <header className='border-b border-slate-200 pb-4'>
                <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
                    <div>
                        <div className='mb-1 flex items-center gap-2 text-xs font-bold text-blue-700 uppercase'>
                            <SafetyCertificateOutlined /> Super Admin
                        </div>
                        <Title level={2} className='!m-0 !text-[26px] !font-black !text-slate-950 md:!text-[32px]'>
                            Chất lượng Trợ lý AI
                        </Title>
                        <Text className='mt-1 block text-sm font-medium text-slate-500'>
                            Theo dõi độ chính xác, tốc độ, grounding và phản hồi người dùng.
                        </Text>
                    </div>
                    <div className='flex items-center gap-2'>
                        <Segmented
                            value={days}
                            onChange={(value) => {
                                setDays(Number(value));
                                setPage(1);
                            }}
                            options={[
                                { label: '7 ngày', value: 7 },
                                { label: '30 ngày', value: 30 },
                                { label: '90 ngày', value: 90 },
                            ]}
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            loading={overviewQuery.isFetching || tracesQuery.isFetching}
                            onClick={() => {
                                void overviewQuery.refetch();
                                void tracesQuery.refetch();
                            }}
                        />
                    </div>
                </div>
            </header>

            {overviewQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 12 }} />
            ) : overview && summary ? (
                <>
                    <section className='overflow-hidden border border-slate-200 bg-white shadow-sm'>
                        <div className='grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6'>
                            <MetricCell
                                label='Sức khỏe'
                                value={`${overview.healthScore}/100`}
                                note={`${fmtNumber(summary.total)} câu hỏi`}
                                tone={overview.healthScore >= 80 ? 'good' : 'warn'}
                            />
                            <MetricCell
                                label='Thành công'
                                value={`${summary.successRate}%`}
                                note={`${fmtNumber(summary.success)} lượt`}
                                tone='good'
                            />
                            <MetricCell
                                label='Tin cậy cao'
                                value={`${summary.trustedRate}%`}
                                note={`${fmtNumber(summary.corrected)} đã hiệu chỉnh`}
                            />
                            <MetricCell
                                label='Hữu ích'
                                value={`${summary.helpfulRate}%`}
                                note={`${fmtNumber(summary.feedbackCount)} phản hồi`}
                                tone={summary.notHelpful ? 'warn' : 'good'}
                            />
                            <MetricCell
                                label='P95'
                                value={fmtDuration(summary.p95LatencyMs)}
                                note={`P50 ${fmtDuration(summary.p50LatencyMs)}`}
                                tone={summary.p95LatencyMs > 30000 ? 'warn' : 'normal'}
                            />
                            <MetricCell
                                label='Fallback'
                                value={`${summary.fallbackRate}%`}
                                note={`${fmtNumber(summary.failedToolCalls)} tool lỗi`}
                                tone={summary.fallback ? 'warn' : 'good'}
                            />
                        </div>
                    </section>

                    <section className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]'>
                        <div className='border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-2 flex items-center justify-between'>
                                <div>
                                    <div className='font-black text-slate-900'>Lưu lượng và vấn đề</div>
                                    <div className='text-xs text-slate-400'>Theo ngày · giờ Việt Nam</div>
                                </div>
                                <ClockCircleOutlined className='text-slate-400' />
                            </div>
                            <EChart option={trendOption} height={280} />
                        </div>
                        <div className='min-w-0 border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 font-black text-slate-900'>
                                <ToolOutlined className='text-slate-500' /> Hiệu năng tool
                            </div>
                            {screens.md ? (
                                <Table
                                    rowKey='tool'
                                    size='small'
                                    pagination={false}
                                    dataSource={(overview.tools || []).slice(0, 8)}
                                    columns={toolColumns}
                                />
                            ) : (
                                <div className='divide-y divide-slate-100'>
                                    {(overview.tools || []).slice(0, 8).map((tool) => (
                                        <div key={tool.tool} className='py-2.5'>
                                            <div className='truncate font-mono text-xs font-bold text-slate-800'>
                                                {tool.tool}
                                            </div>
                                            <div className='mt-1 flex items-center gap-3 text-[11px] text-slate-500'>
                                                <span>{tool.calls} lượt</span>
                                                <span className={tool.errors ? 'font-bold text-red-600' : ''}>
                                                    {tool.errors} lỗi
                                                </span>
                                                <span className='ml-auto'>{fmtDuration(tool.avgDurationMs)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <div className='border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 font-black text-slate-900'>
                                <DatabaseOutlined className='text-blue-600' /> Model đang phục vụ
                            </div>
                            <div className='divide-y divide-slate-100'>
                                {(overview.models || []).slice(0, 8).map((item) => {
                                    const trustedRate = item.total ? Math.round((item.trusted / item.total) * 100) : 0;
                                    return (
                                        <div
                                            key={`${item.provider}-${item.model}`}
                                            className='grid grid-cols-[minmax(0,1fr)_70px_70px] items-center gap-3 py-2.5 text-xs'
                                        >
                                            <div className='min-w-0'>
                                                <div className='truncate font-bold text-slate-800' title={item.model}>
                                                    {item.model || item.provider}
                                                </div>
                                                <div className='text-slate-400'>{item.provider}</div>
                                            </div>
                                            <div className='text-right'>
                                                <div className='font-bold text-slate-700'>{trustedRate}%</div>
                                                <div className='text-slate-400'>tin cậy</div>
                                            </div>
                                            <div className='text-right'>
                                                <div className='font-bold text-slate-700'>
                                                    {fmtDuration(item.avgLatencyMs)}
                                                </div>
                                                <div className='text-slate-400'>{fmtNumber(item.total)} lượt</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className='border border-slate-200 bg-white p-4 shadow-sm'>
                            <div className='mb-3 flex items-center gap-2 font-black text-slate-900'>
                                <CloseCircleOutlined className='text-rose-600' /> Phản hồi cần xử lý
                            </div>
                            {overview.feedbackReasons.length ? (
                                <div className='space-y-3'>
                                    {overview.feedbackReasons.map((item) => {
                                        const width = summary.notHelpful
                                            ? Math.max(4, (item.count / summary.notHelpful) * 100)
                                            : 0;
                                        return (
                                            <div key={item.reason}>
                                                <div className='mb-1 flex justify-between text-xs'>
                                                    <span className='font-semibold text-slate-600'>
                                                        {feedbackReasonLabel[item.reason] || item.reason}
                                                    </span>
                                                    <b className='text-slate-800'>{item.count}</b>
                                                </div>
                                                <div className='h-1.5 overflow-hidden bg-slate-100'>
                                                    <div
                                                        className='h-full bg-rose-500 transition-all'
                                                        style={{ width: `${width}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phản hồi tiêu cực' />
                            )}
                        </div>
                    </section>
                </>
            ) : (
                <Empty description='Chưa có dữ liệu trace trong kỳ' />
            )}

            <section className='border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div>
                        <div className='font-black text-slate-900'>Lịch sử truy vấn</div>
                        <div className='text-xs text-slate-400'>
                            {fmtNumber(tracesQuery.data?.pagination.total)} trace trong phạm vi
                        </div>
                    </div>
                    <div className='grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_140px_150px]'>
                        <Input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            onPressEnter={() => {
                                setSearch(searchInput.trim());
                                setPage(1);
                            }}
                            prefix={<SearchOutlined className='text-slate-400' />}
                            suffix={
                                searchInput !== search ? (
                                    <Button
                                        type='link'
                                        size='small'
                                        onClick={() => {
                                            setSearch(searchInput.trim());
                                            setPage(1);
                                        }}
                                    >
                                        Tìm
                                    </Button>
                                ) : null
                            }
                            placeholder='Câu hỏi, reqId, model'
                            allowClear
                        />
                        <Select
                            allowClear
                            value={status}
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                            placeholder='Trạng thái'
                            options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                        />
                        <Select
                            allowClear
                            value={feedback}
                            onChange={(value) => {
                                setFeedback(value);
                                setPage(1);
                            }}
                            placeholder='Phản hồi'
                            options={[
                                { value: 'helpful', label: 'Hữu ích' },
                                { value: 'not_helpful', label: 'Chưa hữu ích' },
                                { value: 'none', label: 'Chưa đánh giá' },
                            ]}
                        />
                    </div>
                </div>

                {tracesQuery.isLoading ? (
                    <div className='p-4'>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                ) : screens.md ? (
                    <Table
                        rowKey='reqId'
                        pagination={false}
                        dataSource={tracesQuery.data?.rows || []}
                        columns={traceColumns}
                        scroll={{ x: 980 }}
                    />
                ) : (
                    <div className='divide-y divide-slate-100'>
                        {(tracesQuery.data?.rows || []).map((trace) => (
                            <button
                                key={trace.reqId}
                                type='button'
                                onClick={() => setSelectedReqId(trace.reqId)}
                                className='w-full p-4 text-left active:bg-slate-50'
                            >
                                <div className='line-clamp-2 text-sm font-bold text-slate-900'>{trace.question}</div>
                                <div className='mt-2'>
                                    <TraceStatus trace={trace} />
                                </div>
                                <div className='mt-2 flex items-center justify-between text-[11px] text-slate-400'>
                                    <span className='max-w-[65%] truncate'>{trace.model || trace.provider}</span>
                                    <span>
                                        {fmtDuration(trace.tookMs)} · {fmtDateTime(trace.createdAt)}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                <div className='flex justify-end border-t border-slate-200 p-3'>
                    <Pagination
                        current={page}
                        pageSize={20}
                        total={tracesQuery.data?.pagination.total || 0}
                        showSizeChanger={false}
                        size={screens.md ? undefined : 'small'}
                        onChange={setPage}
                    />
                </div>
            </section>

            <TraceDetailDrawer
                reqId={selectedReqId}
                open={Boolean(selectedReqId)}
                models={overview?.availableReplayModels || []}
                onClose={() => setSelectedReqId(undefined)}
            />
        </div>
    );
};

export default AiAssistantQualityPage;
