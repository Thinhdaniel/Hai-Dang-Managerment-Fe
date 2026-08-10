import {
    AlertOutlined,
    AuditOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    DatabaseOutlined,
    DownloadOutlined,
    FileSearchOutlined,
    FilterOutlined,
    LineChartOutlined,
    PrinterOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Drawer,
    Empty,
    Input,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    type TableColumnsType,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import EChart, { type EChartsCoreOption } from '../components/charts/EChart';
import ProductionQcOpeningBalanceDrawer from '../components/production/ProductionQcOpeningBalanceDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { can, isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type { ProductionQcReportRow } from '../core/types/production';
import '../styles/production-qc-management.css';

const { RangePicker } = DatePicker;
type ReportView = 'overview' | 'items' | 'lines' | 'exceptions';
const number = (value?: number, digits = 0) =>
    value === undefined
        ? '—'
        : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value || 0));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải báo cáo QC');
const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const ProductionQcReportPage = () => {
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isPhone, isCompact } = useResponsive();
    const queryClient = useQueryClient();
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
    const [view, setView] = useState<ReportView>('overview');
    const [itemId, setItemId] = useState<string>();
    const [lineId, setLineId] = useState<string>();
    const [orderCode, setOrderCode] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [openingOpen, setOpeningOpen] = useState(false);
    const canSwitchPlant = isAdmin(role) || isDirector(role);
    const canManage = can(role, 'production.manage');
    const from = range[0].format('YYYY-MM-DD');
    const to = range[1].format('YYYY-MM-DD');

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        enabled: canSwitchPlant,
        staleTime: 5 * 60 * 1000,
    });
    useEffect(() => {
        if (!plantId) setPlantId(user?.plantId || plantsQuery.data?.[0]?.id || '');
    }, [plantId, plantsQuery.data, user?.plantId]);
    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, 'qc-report'],
        queryFn: () => productionService.getLines(plantId, true),
        enabled: Boolean(plantId),
        staleTime: 5 * 60 * 1000,
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, 'qc-report'],
        queryFn: () => productionService.getItems(plantId, true),
        enabled: Boolean(plantId),
        staleTime: 5 * 60 * 1000,
    });
    const params = useMemo(
        () => ({
            plantId,
            from,
            to,
            ...(itemId ? { itemId } : {}),
            ...(lineId ? { lineId } : {}),
            ...(orderCode.trim() ? { orderCode: orderCode.trim() } : {}),
        }),
        [from, itemId, lineId, orderCode, plantId, to]
    );
    const reportQuery = useQuery({
        queryKey: ['production', 'qc-report', params],
        queryFn: () => productionService.getQcReport(params),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });
    const report = reportQuery.data;
    const summary = report?.summary;
    const coverage = report?.meta.coverage;

    useEffect(() => {
        if (!socket) return;
        const onUpdate = (payload: { plantId?: string }) => {
            if (payload.plantId !== plantId) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'qc-report'] });
        };
        socket.on('production:updated', onUpdate);
        return () => {
            socket.off('production:updated', onUpdate);
        };
    }, [plantId, queryClient, socket]);

    const exportMutation = useMutation({
        mutationFn: () => productionService.exportQcReport(params),
        onSuccess: (blob) => download(blob, `bao-cao-qc-${from}-${to}.xlsx`),
        onError: (error) => message.error(errorMessage(error)),
    });

    const trendOption = useMemo<EChartsCoreOption>(
        () => ({
            animationDuration: 480,
            color: ['#1e6478', '#27865f', '#c47a19'],
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(20, 36, 50, 0.94)',
                borderWidth: 0,
                textStyle: { color: '#fff', fontSize: 12 },
                valueFormatter: (value: unknown) => `${number(Number(value))} SP`,
            },
            legend: { top: 0, right: 0, textStyle: { color: '#5b6875', fontSize: 11 } },
            grid: { left: isPhone ? 8 : 18, right: 14, top: 42, bottom: 12, containLabel: true },
            xAxis: {
                type: 'category',
                data: report?.trend.map((point) => dayjs(point.date).format('DD/MM')) || [],
                axisLine: { lineStyle: { color: '#d7e0e5' } },
                axisLabel: { color: '#71808e', fontSize: 10 },
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    color: '#71808e',
                    formatter: (value: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value),
                },
                splitLine: { lineStyle: { color: '#edf1f3' } },
            },
            series: [
                {
                    name: 'Sản lũy kế',
                    type: 'line',
                    smooth: 0.2,
                    symbolSize: 5,
                    data: report?.trend.map((point) => point.cumulativeProduced) || [],
                    lineStyle: { width: 2.4 },
                },
                {
                    name: 'QC lũy kế',
                    type: 'line',
                    smooth: 0.2,
                    symbolSize: 5,
                    data: report?.trend.map((point) => point.cumulativeInspected ?? null) || [],
                    lineStyle: { width: 2.4 },
                },
                {
                    name: 'Chưa kiểm',
                    type: 'line',
                    smooth: 0.2,
                    symbol: 'none',
                    areaStyle: { opacity: 0.09 },
                    data: report?.trend.map((point) => point.cumulativePending ?? null) || [],
                    lineStyle: { width: 2, type: 'dashed' },
                },
            ],
        }),
        [isPhone, report?.trend]
    );

    const itemColumns = useMemo<TableColumnsType<ProductionQcReportRow>>(
        () => [
            {
                title: 'Mã hàng',
                key: 'item',
                width: 210,
                fixed: 'left',
                render: (_, row) => (
                    <span className='qc-report-item-cell'>
                        <strong>{row.itemCode || 'Chưa phân bổ'}</strong>
                        <small>{row.itemName || 'Không có tên hàng'}</small>
                    </span>
                ),
            },
            {
                title: 'Sản trong kỳ',
                dataIndex: 'periodProduced',
                width: 120,
                align: 'right',
                sorter: (a, b) => a.periodProduced - b.periodProduced,
                render: (value) => number(value),
            },
            {
                title: 'QC lần đầu',
                dataIndex: 'periodFirstPass',
                width: 120,
                align: 'right',
                sorter: (a, b) => a.periodFirstPass - b.periodFirstPass,
                render: (value) => number(value),
            },
            {
                title: 'Đạt',
                dataIndex: 'periodPassed',
                width: 100,
                align: 'right',
                render: (value) => <span className='is-passed'>{number(value)}</span>,
            },
            {
                title: 'Lỗi',
                dataIndex: 'periodDefect',
                width: 100,
                align: 'right',
                sorter: (a, b) => a.periodDefect - b.periodDefect,
                render: (value) => <span className={value ? 'is-defect' : ''}>{number(value)}</span>,
            },
            {
                title: 'Chưa kiểm',
                dataIndex: 'pendingQuantity',
                width: 125,
                align: 'right',
                sorter: (a, b) => Number(a.pendingQuantity || 0) - Number(b.pendingQuantity || 0),
                render: (value, row) =>
                    row.overInspectedQuantity > 0 ? (
                        <Tag color='red'>Vượt {number(row.overInspectedQuantity)}</Tag>
                    ) : value === undefined ? (
                        <Tag>Chưa đủ dữ liệu</Tag>
                    ) : (
                        <strong className={value ? 'is-pending' : ''}>{number(value)}</strong>
                    ),
            },
            {
                title: 'Tiến độ QC',
                dataIndex: 'qcCompletionPercent',
                width: 150,
                render: (value) =>
                    value === undefined ? (
                        '—'
                    ) : (
                        <Progress
                            percent={Math.min(100, value)}
                            size='small'
                            strokeColor='#27865f'
                            format={(percentValue) => `${number(percentValue, 1)}%`}
                        />
                    ),
            },
            {
                title: 'Tỷ lệ lỗi',
                dataIndex: 'periodDefectRate',
                width: 110,
                align: 'right',
                sorter: (a, b) => a.periodDefectRate - b.periodDefectRate,
                render: (value) => <span className={value >= 5 ? 'is-defect' : ''}>{number(value, 2)}%</span>,
            },
            {
                title: 'Tái kiểm',
                dataIndex: 'periodRecheck',
                width: 100,
                align: 'right',
                render: (value) => number(value),
            },
            {
                title: 'QC gần nhất',
                dataIndex: 'lastQcDate',
                width: 120,
                render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '—'),
            },
        ],
        []
    );

    const lineColumns = useMemo<TableColumnsType<ProductionQcReportRow>>(
        () => [
            {
                title: 'Chuyền',
                key: 'line',
                width: 180,
                render: (_, row) => (
                    <span className='qc-report-item-cell'>
                        <strong>{row.lineCode}</strong>
                        <small>{row.lineName || '—'}</small>
                    </span>
                ),
            },
            {
                title: 'Sản trong kỳ',
                dataIndex: 'periodProduced',
                width: 125,
                align: 'right',
                render: (value) => number(value),
            },
            {
                title: 'QC lần đầu',
                dataIndex: 'periodFirstPass',
                width: 125,
                align: 'right',
                render: (value) => number(value),
            },
            { title: 'Đạt', dataIndex: 'periodPassed', width: 110, align: 'right', render: (value) => number(value) },
            {
                title: 'Lỗi',
                dataIndex: 'periodDefect',
                width: 110,
                align: 'right',
                render: (value) => <span className={value ? 'is-defect' : ''}>{number(value)}</span>,
            },
            {
                title: 'Chưa kiểm',
                dataIndex: 'pendingQuantity',
                width: 125,
                align: 'right',
                render: (value) => (value === undefined ? '—' : number(value)),
            },
            {
                title: 'Tiến độ QC',
                dataIndex: 'qcCompletionPercent',
                width: 125,
                align: 'right',
                render: (value) => (value === undefined ? '—' : `${number(value, 1)}%`),
            },
            {
                title: 'Tỷ lệ lỗi',
                dataIndex: 'periodDefectRate',
                width: 115,
                align: 'right',
                render: (value) => `${number(value, 2)}%`,
            },
        ],
        []
    );

    const filters = (
        <div className='qc-report-filters'>
            {canSwitchPlant ? (
                <Select
                    value={plantId || undefined}
                    onChange={(value) => {
                        setPlantId(value);
                        setItemId(undefined);
                        setLineId(undefined);
                    }}
                    options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                    placeholder='Chọn cơ sở'
                />
            ) : (
                <span className='qc-report-plant'>{user?.plant?.name || 'Cơ sở được phân công'}</span>
            )}
            <RangePicker
                value={range}
                allowClear={false}
                format='DD/MM/YYYY'
                onChange={(next) => next?.[0] && next?.[1] && setRange([next[0], next[1]])}
            />
            <Select
                allowClear
                showSearch
                optionFilterProp='label'
                value={itemId}
                onChange={setItemId}
                options={(itemsQuery.data || []).map((item) => ({
                    value: item.id,
                    label: `${item.code} · ${item.name || ''}`,
                }))}
                placeholder='Tất cả mã hàng'
            />
            <Select
                allowClear
                showSearch
                optionFilterProp='label'
                value={lineId}
                onChange={setLineId}
                options={(linesQuery.data || []).map((line) => ({
                    value: line.id,
                    label: `${line.code} · ${line.name || ''}`,
                }))}
                placeholder='Tất cả chuyền'
            />
            <Input
                value={orderCode}
                onChange={(event) => setOrderCode(event.target.value)}
                allowClear
                placeholder='Mã đơn hàng'
            />
        </div>
    );

    const itemCards = (report?.items || []).map((row) => (
        <article className='qc-report-mobile-item' key={row.itemId || row.itemCode}>
            <header>
                <span>
                    <strong>{row.itemCode || 'Chưa phân bổ'}</strong>
                    <small>{row.itemName || 'Không có tên hàng'}</small>
                </span>
                {row.pendingQuantity === undefined ? (
                    <Tag>Chưa đủ dữ liệu</Tag>
                ) : row.overInspectedQuantity > 0 ? (
                    <Tag color='red'>QC vượt nguồn</Tag>
                ) : Number(row.pendingQuantity || 0) > 0 ? (
                    <Tag color='gold'>Còn chờ</Tag>
                ) : (
                    <Tag color='success'>Đã cân</Tag>
                )}
            </header>
            <div>
                <span>
                    <small>Sản trong kỳ</small>
                    <strong>{number(row.periodProduced)}</strong>
                </span>
                <span>
                    <small>QC lần đầu</small>
                    <strong>{number(row.periodFirstPass)}</strong>
                </span>
                <span className='is-passed'>
                    <small>Đạt</small>
                    <strong>{number(row.periodPassed)}</strong>
                </span>
                <span className='is-defect'>
                    <small>Lỗi</small>
                    <strong>{number(row.periodDefect)}</strong>
                </span>
            </div>
            <footer>
                <span>
                    <small>Chưa kiểm lũy kế</small>
                    <strong>
                        {row.pendingQuantity === undefined ? 'Chưa đủ dữ liệu' : number(row.pendingQuantity)}
                    </strong>
                </span>
                <span>
                    <small>Tỷ lệ lỗi</small>
                    <strong>{number(row.periodDefectRate, 2)}%</strong>
                </span>
            </footer>
            {row.qcCompletionPercent !== undefined ? (
                <Progress
                    percent={Math.min(100, row.qcCompletionPercent)}
                    strokeColor='#27865f'
                    format={(value) => `${number(value, 1)}%`}
                />
            ) : null}
        </article>
    ));

    const lineCards = (report?.lines || []).map((row) => (
        <article className='qc-report-mobile-item qc-report-mobile-line' key={row.lineId || row.lineCode}>
            <header>
                <span>
                    <strong>{row.lineCode || 'Chưa xác định'}</strong>
                    <small>{row.lineName || 'Chuyền sản xuất'}</small>
                </span>
                {row.pendingQuantity === undefined ? (
                    <Tag>Chưa đủ dữ liệu</Tag>
                ) : row.overInspectedQuantity > 0 ? (
                    <Tag color='red'>QC vượt nguồn</Tag>
                ) : Number(row.pendingQuantity || 0) > 0 ? (
                    <Tag color='gold'>Còn chờ</Tag>
                ) : (
                    <Tag color='success'>Đã cân</Tag>
                )}
            </header>
            <div>
                <span>
                    <small>Sản trong kỳ</small>
                    <strong>{number(row.periodProduced)}</strong>
                </span>
                <span>
                    <small>QC lần đầu</small>
                    <strong>{number(row.periodFirstPass)}</strong>
                </span>
                <span className='is-passed'>
                    <small>Đạt</small>
                    <strong>{number(row.periodPassed)}</strong>
                </span>
                <span className='is-defect'>
                    <small>Lỗi</small>
                    <strong>{number(row.periodDefect)}</strong>
                </span>
            </div>
            <footer>
                <span>
                    <small>Chưa kiểm lũy kế</small>
                    <strong>{row.pendingQuantity === undefined ? 'Chưa xác định' : number(row.pendingQuantity)}</strong>
                </span>
                <span>
                    <small>Tỷ lệ lỗi</small>
                    <strong>{number(row.periodDefectRate, 2)}%</strong>
                </span>
            </footer>
            {row.qcCompletionPercent !== undefined ? (
                <Progress
                    percent={Math.min(100, row.qcCompletionPercent)}
                    strokeColor='#27865f'
                    format={(value) => `${number(value, 1)}%`}
                />
            ) : null}
        </article>
    ));

    return (
        <div className='qc-report-page'>
            <header className='qc-report-header'>
                <div className='qc-report-title'>
                    <span>
                        <AuditOutlined />
                    </span>
                    <div>
                        <small>KIỂM SOÁT CHẤT LƯỢNG</small>
                        <h1>Đối soát sản lượng & QC</h1>
                        <p>Theo dõi nguồn sản, khối lượng đã kiểm và hàng còn chờ theo từng mã.</p>
                    </div>
                </div>
                <div className='qc-report-actions'>
                    {canManage ? (
                        <Button icon={<SettingOutlined />} onClick={() => setOpeningOpen(true)}>
                            Đầu kỳ QC
                        </Button>
                    ) : null}
                    <Button
                        icon={<DownloadOutlined />}
                        loading={exportMutation.isPending}
                        onClick={() => exportMutation.mutate()}
                    >
                        Excel
                    </Button>
                    <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
                        In/PDF
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={reportQuery.isFetching}
                        onClick={() => reportQuery.refetch()}
                        aria-label='Làm mới báo cáo'
                    />
                </div>
            </header>
            {isCompact ? (
                <Button
                    className='qc-report-filter-trigger'
                    icon={<FilterOutlined />}
                    onClick={() => setFilterOpen(true)}
                >
                    Bộ lọc báo cáo<Tag>{[itemId, lineId, orderCode].filter(Boolean).length}</Tag>
                </Button>
            ) : (
                filters
            )}
            {reportQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không thể tải báo cáo QC'
                    description={errorMessage(reportQuery.error)}
                    action={<Button onClick={() => reportQuery.refetch()}>Thử lại</Button>}
                />
            ) : null}
            {reportQuery.isLoading ? (
                <div className='qc-report-loading'>
                    <Skeleton active paragraph={{ rows: 12 }} />
                </div>
            ) : report ? (
                <>
                    <section className={`qc-report-coverage status-${coverage?.status}`}>
                        <span>
                            {coverage?.status === 'complete' ? (
                                <SafetyCertificateOutlined />
                            ) : coverage?.status === 'partial' ? (
                                <WarningFilled />
                            ) : (
                                <DatabaseOutlined />
                            )}
                        </span>
                        <div>
                            <small>ĐỘ TIN CẬY SỐ LIỆU</small>
                            <strong>
                                {coverage?.status === 'complete'
                                    ? 'Đủ dữ liệu đối soát'
                                    : coverage?.status === 'partial'
                                      ? 'Đang có dữ liệu cần phân bổ'
                                      : 'Thiếu số đầu kỳ QC'}
                            </strong>
                            <p>
                                {coverage?.qcOpeningAvailable
                                    ? `Chốt đầu kỳ ${dayjs(coverage.cutoffDate).format('DD/MM/YYYY')} · phân bổ mã ${number(coverage.allocationCoveragePercent, 1)}%`
                                    : 'Số trong kỳ vẫn dùng được, nhưng không kết luận lượng tồn chờ lũy kế.'}
                            </p>
                        </div>
                        {canManage && coverage?.status !== 'complete' ? (
                            <Button type='link' onClick={() => setOpeningOpen(true)}>
                                Xử lý dữ liệu đầu kỳ
                            </Button>
                        ) : null}
                    </section>
                    <section className='qc-report-kpis'>
                        <div>
                            <small>Sản báo trong kỳ</small>
                            <strong>{number(summary?.periodProduced)}</strong>
                            <span>SP từ các chuyền</span>
                        </div>
                        <div>
                            <small>QC lần đầu</small>
                            <strong>{number(summary?.periodFirstPass)}</strong>
                            <span>{number(summary?.periodBalance)} so với sản trong kỳ</span>
                        </div>
                        <div className='is-passed'>
                            <small>Đạt</small>
                            <strong>{number(summary?.periodPassed)}</strong>
                            <span>FPY {number(summary?.periodFirstPassYield, 2)}%</span>
                        </div>
                        <div className='is-defect'>
                            <small>Lỗi</small>
                            <strong>{number(summary?.periodDefect)}</strong>
                            <span>Tỷ lệ {number(summary?.periodDefectRate, 2)}%</span>
                        </div>
                        <div className='is-pending'>
                            <small>Chưa kiểm lũy kế</small>
                            <strong>{summary?.pendingKnown ? number(summary.pendingQuantity) : 'Chưa xác định'}</strong>
                            <span>
                                {summary?.pendingKnown
                                    ? `Hoàn tất ${number(summary.qcCompletionPercent, 1)}%`
                                    : summary?.pendingUnknownReason === 'unallocated_scope'
                                      ? 'Cần phân bổ dữ liệu cũ'
                                      : 'Cần số đầu kỳ QC'}
                            </span>
                        </div>
                        <div>
                            <small>Tái kiểm trong kỳ</small>
                            <strong>{number(summary?.periodRecheck)}</strong>
                            <span>Không trừ tồn lần hai</span>
                        </div>
                    </section>
                    <section className='qc-report-reconciliation'>
                        <div>
                            <small>TỒN QC ĐẦU KỲ</small>
                            <strong>
                                {summary?.pendingKnown ? `${number(summary.openingPending)} SP` : 'Chưa có'}
                            </strong>
                        </div>
                        <i>+</i>
                        <div>
                            <small>SẢN TRÊN HỆ THỐNG</small>
                            <strong>{number(summary?.trackedProducedToDate)} SP</strong>
                        </div>
                        <i>−</i>
                        <div>
                            <small>QC LẦN ĐẦU</small>
                            <strong>{number(summary?.trackedFirstPassToDate)} SP</strong>
                        </div>
                        <i>=</i>
                        <div className='is-result'>
                            <small>CÒN CHỜ QC</small>
                            <strong>
                                {summary?.pendingKnown ? `${number(summary.pendingQuantity)} SP` : 'Chưa xác định'}
                            </strong>
                        </div>
                    </section>
                    <Segmented<ReportView>
                        className='qc-report-view-switch'
                        value={view}
                        onChange={setView}
                        block={isCompact}
                        options={[
                            { value: 'overview', label: 'Tổng quan', icon: <LineChartOutlined /> },
                            { value: 'items', label: 'Mã hàng', icon: <FileSearchOutlined /> },
                            { value: 'lines', label: 'Chuyền', icon: <AuditOutlined /> },
                            {
                                value: 'exceptions',
                                label: `Bất thường ${report.exceptions.length}`,
                                icon: <AlertOutlined />,
                            },
                        ]}
                    />
                    {view === 'overview' ? (
                        <div className='qc-report-overview-grid'>
                            <section className='qc-report-trend'>
                                <header>
                                    <div>
                                        <small>DIỄN BIẾN LŨY KẾ</small>
                                        <strong>Sản báo, QC đã kiểm và lượng còn chờ</strong>
                                    </div>
                                    <Tag>
                                        {dayjs(from).format('DD/MM')} – {dayjs(to).format('DD/MM/YYYY')}
                                    </Tag>
                                </header>
                                <EChart option={trendOption} height={isPhone ? 300 : 360} />
                            </section>
                            <aside className='qc-report-attention'>
                                <header>
                                    <WarningFilled />
                                    <span>
                                        <small>CẦN XỬ LÝ</small>
                                        <strong>{report.exceptions.length} điểm cần rà soát</strong>
                                    </span>
                                </header>
                                {report.exceptions.slice(0, 5).map((item) => (
                                    <article key={item.id} className={`severity-${item.severity}`}>
                                        <span>
                                            {item.severity === 'critical' ? <AlertOutlined /> : <ClockCircleOutlined />}
                                        </span>
                                        <div>
                                            <strong>{item.title}</strong>
                                            <p>{item.description}</p>
                                        </div>
                                    </article>
                                ))}
                                {!report.exceptions.length ? (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có bất thường' />
                                ) : (
                                    <Button type='link' onClick={() => setView('exceptions')}>
                                        Xem toàn bộ
                                    </Button>
                                )}
                            </aside>
                        </div>
                    ) : null}
                    {view === 'items' ? (
                        <section className='qc-report-table-section'>
                            <header>
                                <div>
                                    <small>ĐỐI SOÁT THEO MÃ HÀNG</small>
                                    <strong>Ưu tiên theo số còn chờ và tỷ lệ lỗi</strong>
                                </div>
                                <Tag>{report.items.length} mã</Tag>
                            </header>
                            {isPhone ? (
                                <div className='qc-report-mobile-list'>{itemCards}</div>
                            ) : (
                                <Table
                                    rowKey={(row) => row.itemId || row.itemCode || 'unallocated'}
                                    columns={itemColumns}
                                    dataSource={report.items}
                                    pagination={{ pageSize: 15, showSizeChanger: true }}
                                    scroll={{ x: 1300 }}
                                />
                            )}
                        </section>
                    ) : null}
                    {view === 'lines' ? (
                        <section className='qc-report-table-section'>
                            <header>
                                <div>
                                    <small>ĐỐI SOÁT THEO CHUYỀN</small>
                                    <strong>Khối lượng kiểm và tồn QC theo nguồn sản</strong>
                                </div>
                                <Tag>{report.lines.length} chuyền</Tag>
                            </header>
                            {isPhone ? (
                                <div className='qc-report-mobile-list'>{lineCards}</div>
                            ) : (
                                <Table
                                    rowKey={(row) => row.lineId || row.lineCode || ''}
                                    columns={lineColumns}
                                    dataSource={report.lines}
                                    pagination={false}
                                    scroll={{ x: 1050 }}
                                />
                            )}
                        </section>
                    ) : null}
                    {view === 'exceptions' ? (
                        <section className='qc-report-exceptions'>
                            <header>
                                <div>
                                    <small>BẤT THƯỜNG & CHẤT LƯỢNG DỮ LIỆU</small>
                                    <strong>Danh sách cần đối soát trước khi chốt kế hoạch</strong>
                                </div>
                            </header>
                            {report.exceptions.length ? (
                                report.exceptions.map((item) => (
                                    <article key={item.id} className={`severity-${item.severity}`}>
                                        <span>
                                            {item.severity === 'critical' ? <AlertOutlined /> : <WarningFilled />}
                                        </span>
                                        <div>
                                            <header>
                                                <strong>{item.title}</strong>
                                                <Tag color={item.severity === 'critical' ? 'red' : 'gold'}>
                                                    {item.severity === 'critical' ? 'Nghiêm trọng' : 'Cần chú ý'}
                                                </Tag>
                                            </header>
                                            <p>{item.description}</p>
                                        </div>
                                    </article>
                                ))
                            ) : (
                                <Empty description='Không phát hiện bất thường trong phạm vi lọc' />
                            )}
                        </section>
                    ) : null}
                </>
            ) : (
                <Empty description='Chưa có dữ liệu QC trong phạm vi đã chọn' />
            )}
            <Drawer
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                placement='bottom'
                height='min(78dvh, 620px)'
                title='Bộ lọc báo cáo QC'
                className='qc-report-filter-drawer'
            >
                <div className='qc-report-filter-mobile'>
                    {filters}
                    <Button type='primary' onClick={() => setFilterOpen(false)}>
                        Áp dụng bộ lọc
                    </Button>
                </div>
            </Drawer>
            {canManage ? (
                <ProductionQcOpeningBalanceDrawer
                    open={openingOpen}
                    plantId={plantId}
                    onClose={() => setOpeningOpen(false)}
                    onChanged={() => reportQuery.refetch()}
                />
            ) : null}
        </div>
    );
};

export default ProductionQcReportPage;
