import {
    AlertOutlined,
    ArrowDownOutlined,
    ArrowUpOutlined,
    CalendarOutlined,
    CheckCircleFilled,
    DownloadOutlined,
    ExclamationCircleFilled,
    FileExcelOutlined,
    ReloadOutlined,
    TeamOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Empty,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EChart, { type EChartsCoreOption } from '../components/charts/EChart';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import { useResponsive } from '../core/hooks/useResponsive';
import { productionService } from '../core/services/production.service';
import type {
    ProductionReport,
    ProductionReportException,
    ProductionReportItem,
    ProductionReportLine,
    ProductionReportScope,
    ProductionReportTrendPoint,
} from '../core/types/production';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

type ReportTab = 'lines' | 'items' | 'days' | 'exceptions';
type ReportPreset = 'month' | 'last-month' | '7-days' | '30-days' | 'custom';

const number = (value = 0, digits = 0) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value || 0));
const money = (value = 0) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} đ`;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải báo cáo sản xuất');
const percentTone = (value: number) => (value >= 95 ? 'success' : value >= 80 ? 'warning' : 'danger');

const statusLabels = {
    draft: 'Đang nhập',
    submitted: 'Chờ duyệt',
    locked: 'Đã khóa sổ',
};

// Ngày chưa khóa sổ = số chưa chính thức, phải nhìn ra ngay trong bảng theo ngày
const statusTagColor = { draft: 'blue', submitted: 'gold', locked: 'green' } as const;

const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });

const exceptionLabels = {
    missing_report: 'Thiếu báo',
    under_target: 'Hụt khoán',
    zero_without_note: 'Sản lượng 0',
    unconfigured_line: 'Thiếu cấu hình',
    open_day: 'Chưa khóa sổ',
};

const presetRange = (preset: ReportPreset): [Dayjs, Dayjs] => {
    const today = dayjs();
    if (preset === 'last-month')
        return [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')];
    if (preset === '7-days') return [today.subtract(6, 'day'), today];
    if (preset === '30-days') return [today.subtract(29, 'day'), today];
    return [today.startOf('month'), today];
};

const Delta = ({ value, suffix = '%' }: { value?: number | null; suffix?: string }) => {
    if (value === undefined || value === null)
        return <span className='production-report-delta is-neutral'>Chưa có kỳ trước</span>;
    if (Math.abs(value) < 0.05) return <span className='production-report-delta is-neutral'>Không đổi</span>;
    const positive = value > 0;
    return (
        <span className={`production-report-delta ${positive ? 'is-positive' : 'is-negative'}`}>
            {positive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {number(Math.abs(value), 1)}
            {suffix}
        </span>
    );
};

const Achievement = ({ value }: { value: number }) => {
    const tone = percentTone(value);
    return (
        <div className={`production-report-achievement tone-${tone}`}>
            <strong>{number(value, 1)}%</strong>
            <Progress percent={Math.min(100, Math.round(value))} showInfo={false} size='small' />
        </div>
    );
};

const ProductionReportPage = () => {
    const { isCompact: isMobile } = useResponsive();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [range, setRange] = useState<[Dayjs, Dayjs]>(() => presetRange('month'));
    const [preset, setPreset] = useState<ReportPreset>('month');
    const [scope, setScope] = useState<ProductionReportScope>('all');
    const [tab, setTab] = useState<ReportTab>('lines');
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const reportParams = useMemo(
        () => ({
            plantId,
            from: range[0].format('YYYY-MM-DD'),
            to: range[1].format('YYYY-MM-DD'),
            scope,
        }),
        [plantId, range, scope]
    );

    const reportQuery = useQuery({
        queryKey: ['production', 'report', reportParams],
        queryFn: () => productionService.getReport(reportParams),
        enabled: Boolean(plantId),
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload: { plantId: string }) => {
            if (payload.plantId !== plantId) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'report'] });
        };
        socket.on('production:updated', handleUpdate);
        socket.on('production:plan-updated', handleUpdate);
        return () => {
            socket.off('production:updated', handleUpdate);
            socket.off('production:plan-updated', handleUpdate);
        };
    }, [plantId, queryClient, socket]);

    const exportMutation = useMutation({
        mutationFn: () => productionService.exportReport(reportParams),
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-quan-tri-san-xuat-${reportParams.from}-${reportParams.to}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success('Đã xuất báo cáo Excel');
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const report = reportQuery.data;
    const summary = report?.summary;

    const handlePreset = (value: ReportPreset) => {
        setPreset(value);
        if (value !== 'custom') setRange(presetRange(value));
    };

    const handleRange = (value: null | [Dayjs | null, Dayjs | null]) => {
        if (!value?.[0] || !value[1]) return;
        if (value[1].diff(value[0], 'day') > 365) {
            message.warning('Khoảng báo cáo tối đa là 366 ngày');
            return;
        }
        setRange([value[0], value[1]]);
        setPreset('custom');
    };

    const trendOption = useMemo<EChartsCoreOption>(() => {
        const points = report?.trend || [];
        return {
            animationDuration: 650,
            color: ['#147a4b', '#2f5d7c', '#c87816'],
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(20, 29, 24, 0.94)',
                borderWidth: 0,
                textStyle: { color: '#fff', fontSize: 12 },
                formatter: (params: any) => {
                    const list = Array.isArray(params) ? params : [params];
                    const index = Number(list[0]?.dataIndex || 0);
                    const point = points[index];
                    if (!point) return '';
                    return [
                        `<strong>${dayjs(point.productionDate).format('DD/MM/YYYY')}</strong>`,
                        `Thực tế: ${number(point.actualQuantity)} SP`,
                        `Mục tiêu: ${number(point.targetQuantity)} SP`,
                        `Kế hoạch: ${number(point.plannedQuantity)} SP`,
                        `Đạt: ${number(point.achievementPercent, 1)}% · Báo đủ: ${number(point.reportingRate, 1)}%`,
                    ].join('<br/>');
                },
            },
            legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 7, textStyle: { color: '#5f6d64', fontSize: 11 } },
            grid: { left: isMobile ? 44 : 58, right: 16, top: 42, bottom: points.length > 14 ? 48 : 28 },
            xAxis: {
                type: 'category',
                data: points.map((point) => dayjs(point.productionDate).format('DD/MM')),
                axisLine: { lineStyle: { color: '#cfd8d2' } },
                axisTick: { show: false },
                axisLabel: { color: '#748078', fontSize: 10, hideOverlap: true },
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#748078', fontSize: 10, formatter: (value: number) => number(value) },
                splitLine: { lineStyle: { color: '#e8edea' } },
            },
            dataZoom:
                points.length > 14
                    ? [
                          { type: 'inside', startValue: Math.max(0, points.length - 14), endValue: points.length - 1 },
                          {
                              type: 'slider',
                              height: 14,
                              bottom: 4,
                              borderColor: 'transparent',
                              backgroundColor: '#edf1ef',
                              fillerColor: 'rgba(20,122,75,.16)',
                          },
                      ]
                    : undefined,
            series: [
                {
                    name: 'Thực tế',
                    type: 'bar',
                    barMaxWidth: 24,
                    data: points.map((point) => point.actualQuantity),
                    itemStyle: { color: '#147a4b', borderRadius: [3, 3, 0, 0] },
                },
                {
                    name: 'Mục tiêu',
                    type: 'line',
                    data: points.map((point) => point.targetQuantity),
                    symbol: 'circle',
                    symbolSize: 5,
                    lineStyle: { width: 2, color: '#2f5d7c' },
                    itemStyle: { color: '#2f5d7c' },
                },
                {
                    name: 'Kế hoạch',
                    type: 'line',
                    data: points.map((point) => point.plannedQuantity),
                    symbol: 'none',
                    lineStyle: { width: 1.5, type: 'dashed', color: '#c87816' },
                },
            ],
        };
    }, [isMobile, report?.trend]);

    const lineColumns = useMemo<TableColumnsType<ProductionReportLine>>(
        () => [
            {
                title: 'Chuyền',
                key: 'line',
                width: 180,
                fixed: 'left',
                render: (_, line) => (
                    <div className='production-report-identity'>
                        <strong>{line.lineCode}</strong>
                        <span>{line.lineName || line.leaderName || 'Chưa cập nhật tên chuyền'}</span>
                    </div>
                ),
            },
            {
                title: 'Sản lượng',
                key: 'output',
                width: 170,
                render: (_, line) => (
                    <div className='production-report-output-cell'>
                        <strong>{number(line.actualQuantity)} SP</strong>
                        <span>/ {number(line.targetQuantity)} mục tiêu</span>
                    </div>
                ),
            },
            {
                title: '% đạt',
                dataIndex: 'achievementPercent',
                width: 135,
                render: (value) => <Achievement value={value} />,
            },
            {
                title: 'Báo đủ',
                dataIndex: 'reportingRate',
                width: 90,
                align: 'right',
                render: (value) => `${number(value, 1)}%`,
            },
            {
                title: 'NS bình quân',
                dataIndex: 'averageWorkers',
                width: 115,
                align: 'right',
                render: (value) => number(value, 1),
            },
            {
                title: 'SP/người-ngày',
                dataIndex: 'outputPerWorkerDay',
                width: 135,
                align: 'right',
                render: (value) => number(value, 1),
            },
            {
                title: 'Hụt khoán',
                dataIndex: 'underTargetDays',
                width: 105,
                align: 'right',
                render: (value) => (
                    <span className={value > 0 ? 'production-report-risk-number' : ''}>{number(value)} ngày</span>
                ),
            },
            ...(report?.meta.financialsVisible
                ? [
                      {
                          title: 'Giá trị',
                          dataIndex: 'totalAmount',
                          width: 150,
                          align: 'right' as const,
                          render: (value: number) => money(value),
                      },
                  ]
                : []),
        ],
        [report?.meta.financialsVisible]
    );

    const itemColumns = useMemo<TableColumnsType<ProductionReportItem>>(
        () => [
            {
                title: 'Mã hàng',
                key: 'item',
                width: 220,
                fixed: 'left',
                render: (_, item) => (
                    <div className='production-report-identity'>
                        <strong>{item.itemCode}</strong>
                        <span>{item.itemName || 'Chưa cập nhật tên hàng'}</span>
                    </div>
                ),
            },
            {
                title: 'Ngày chạy',
                dataIndex: 'activeDays',
                width: 100,
                align: 'right',
                render: (value) => `${number(value)} ngày`,
            },
            {
                title: 'Số chuyền',
                dataIndex: 'lineCount',
                width: 100,
                align: 'right',
                render: (value) => number(value),
            },
            {
                title: 'Sản lượng',
                key: 'output',
                width: 180,
                render: (_, item) => (
                    <div className='production-report-output-cell'>
                        <strong>
                            {number(item.actualQuantity)} {item.unit}
                        </strong>
                        <span>/ {number(item.targetQuantity)} mục tiêu</span>
                    </div>
                ),
            },
            {
                title: '% đạt',
                dataIndex: 'achievementPercent',
                width: 135,
                render: (value) => <Achievement value={value} />,
            },
            {
                title: 'KH phát hành',
                dataIndex: 'plannedQuantity',
                width: 125,
                align: 'right',
                render: (value) => number(value),
            },
            {
                title: '% theo KH',
                dataIndex: 'planAttainmentPercent',
                width: 115,
                align: 'right',
                render: (value) => `${number(value, 1)}%`,
            },
            ...(report?.meta.financialsVisible
                ? [
                      {
                          title: 'Giá trị',
                          dataIndex: 'totalAmount',
                          width: 150,
                          align: 'right' as const,
                          render: (value: number) => money(value),
                      },
                  ]
                : []),
        ],
        [report?.meta.financialsVisible]
    );

    const dayColumns = useMemo<TableColumnsType<ProductionReportTrendPoint>>(
        () => [
            {
                title: 'Ngày',
                key: 'date',
                width: 130,
                fixed: 'left',
                render: (_, point) => (
                    <div className='production-report-identity'>
                        <strong>{dayjs(point.productionDate).format('DD/MM/YYYY')}</strong>
                        <span>{weekdayFormatter.format(new Date(point.productionDate))}</span>
                    </div>
                ),
            },
            {
                title: 'Trạng thái',
                dataIndex: 'status',
                width: 112,
                render: (value: keyof typeof statusLabels) => (
                    <Tag color={statusTagColor[value] || 'default'}>{statusLabels[value] || value}</Tag>
                ),
            },
            {
                title: 'Sản lượng',
                key: 'output',
                width: 160,
                sorter: (left, right) => left.actualQuantity - right.actualQuantity,
                render: (_, point) => (
                    <div className='production-report-output-cell'>
                        <strong>{number(point.actualQuantity)} SP</strong>
                        <span>/ {number(point.targetQuantity)} khoán</span>
                    </div>
                ),
            },
            {
                title: '% đạt',
                dataIndex: 'achievementPercent',
                width: 135,
                sorter: (left, right) => left.achievementPercent - right.achievementPercent,
                render: (value) => <Achievement value={value} />,
            },
            {
                title: 'Kế hoạch',
                key: 'plan',
                width: 140,
                render: (_, point) =>
                    point.plannedQuantity > 0 ? (
                        <div className='production-report-output-cell'>
                            <strong>{number(point.planAttainmentPercent, 1)}%</strong>
                            <span>/ {number(point.plannedQuantity)} SP ban hành</span>
                        </div>
                    ) : (
                        <Text type='secondary'>—</Text>
                    ),
            },
            {
                title: 'Báo đủ',
                dataIndex: 'reportingRate',
                width: 95,
                align: 'right',
                sorter: (left, right) => left.reportingRate - right.reportingRate,
                render: (value) => `${number(value, 1)}%`,
            },
            {
                title: 'Nhân sự',
                key: 'workers',
                width: 120,
                align: 'right',
                render: (_, point) => (
                    <div className='production-report-output-cell is-right'>
                        <strong>{number(point.workers)} CN</strong>
                        <span>
                            {number(point.configuredLines)}/{number(point.totalLines)} chuyền
                        </span>
                    </div>
                ),
            },
            ...(report?.meta.financialsVisible
                ? [
                      {
                          title: 'Giá trị',
                          dataIndex: 'totalAmount',
                          width: 140,
                          align: 'right' as const,
                          sorter: (left: ProductionReportTrendPoint, right: ProductionReportTrendPoint) =>
                              Number(left.totalAmount || 0) - Number(right.totalAmount || 0),
                          render: (value: number) => money(value),
                      },
                  ]
                : []),
            {
                title: '',
                key: 'action',
                width: 110,
                fixed: 'right',
                render: (_, point) => (
                    <Button
                        type='link'
                        onClick={() =>
                            navigate(`/production/reports/${point.productionDate}?plantId=${plantId}`)
                        }
                    >
                        Xem chi tiết
                    </Button>
                ),
            },
        ],
        [navigate, plantId, report?.meta.financialsVisible]
    );

    const exceptionColumns = useMemo<TableColumnsType<ProductionReportException>>(
        () => [
            {
                title: 'Ngày',
                dataIndex: 'productionDate',
                width: 112,
                render: (value) => dayjs(value).format('DD/MM/YYYY'),
            },
            {
                title: 'Mức độ',
                dataIndex: 'severity',
                width: 118,
                render: (value) => (
                    <Tag color={value === 'critical' ? 'red' : value === 'warning' ? 'gold' : 'default'}>
                        {value === 'critical' ? 'Nghiêm trọng' : value === 'warning' ? 'Cần chú ý' : 'Thông tin'}
                    </Tag>
                ),
            },
            {
                title: 'Loại',
                dataIndex: 'type',
                width: 125,
                render: (value) => exceptionLabels[value as keyof typeof exceptionLabels],
            },
            { title: 'Chuyền', dataIndex: 'lineCode', width: 90, render: (value) => value || '—' },
            {
                title: 'Nội dung',
                key: 'content',
                render: (_, item) => (
                    <div className='production-report-exception-copy'>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                    </div>
                ),
            },
            {
                title: '',
                key: 'action',
                width: 90,
                fixed: 'right',
                render: (_, item) => (
                    <Button
                        type='link'
                        onClick={() => navigate(`/production?plantId=${plantId}&date=${item.productionDate}`)}
                    >
                        Kiểm tra
                    </Button>
                ),
            },
        ],
        [navigate, plantId]
    );

    const renderMobileLine = (line: ProductionReportLine) => (
        <article key={line.lineId} className='production-report-mobile-card'>
            <div className='production-report-mobile-card__head'>
                <div className='production-report-identity'>
                    <strong>{line.lineCode}</strong>
                    <span>{line.lineName || line.leaderName || 'Chưa cập nhật tên chuyền'}</span>
                </div>
                <span className={`production-report-score tone-${percentTone(line.achievementPercent)}`}>
                    {number(line.achievementPercent, 1)}%
                </span>
            </div>
            <div className='production-report-mobile-card__metrics'>
                <div>
                    <span>Thực tế</span>
                    <strong>{number(line.actualQuantity)} SP</strong>
                </div>
                <div>
                    <span>Báo đủ</span>
                    <strong>{number(line.reportingRate, 1)}%</strong>
                </div>
                <div>
                    <span>NS bình quân</span>
                    <strong>{number(line.averageWorkers, 1)}</strong>
                </div>
                <div>
                    <span>SP/người-ngày</span>
                    <strong>{number(line.outputPerWorkerDay, 1)}</strong>
                </div>
            </div>
            <Progress percent={Math.min(100, Math.round(line.achievementPercent))} showInfo={false} size='small' />
        </article>
    );

    const renderMobileItem = (item: ProductionReportItem) => (
        <article key={item.itemId} className='production-report-mobile-card'>
            <div className='production-report-mobile-card__head'>
                <div className='production-report-identity'>
                    <strong>{item.itemCode}</strong>
                    <span>{item.itemName || 'Chưa cập nhật tên hàng'}</span>
                </div>
                <span className={`production-report-score tone-${percentTone(item.achievementPercent)}`}>
                    {number(item.achievementPercent, 1)}%
                </span>
            </div>
            <div className='production-report-mobile-card__metrics'>
                <div>
                    <span>Thực tế</span>
                    <strong>
                        {number(item.actualQuantity)} {item.unit}
                    </strong>
                </div>
                <div>
                    <span>Mục tiêu</span>
                    <strong>{number(item.targetQuantity)}</strong>
                </div>
                <div>
                    <span>Ngày chạy</span>
                    <strong>{number(item.activeDays)}</strong>
                </div>
                <div>
                    <span>Số chuyền</span>
                    <strong>{number(item.lineCount)}</strong>
                </div>
            </div>
            <Progress percent={Math.min(100, Math.round(item.achievementPercent))} showInfo={false} size='small' />
        </article>
    );

    const renderMobileDay = (point: ProductionReportTrendPoint) => (
        <article
            key={point.productionDate}
            className='production-report-mobile-card'
            onClick={() => navigate(`/production/reports/${point.productionDate}?plantId=${plantId}`)}
        >
            <div className='production-report-mobile-card__head'>
                <div className='production-report-identity'>
                    <strong>{dayjs(point.productionDate).format('DD/MM/YYYY')}</strong>
                    <span>
                        <Tag color={statusTagColor[point.status] || 'default'}>
                            {statusLabels[point.status] || point.status}
                        </Tag>
                    </span>
                </div>
                <span className={`production-report-score tone-${percentTone(point.achievementPercent)}`}>
                    {number(point.achievementPercent, 1)}%
                </span>
            </div>
            <div className='production-report-mobile-card__metrics'>
                <div>
                    <span>Thực tế</span>
                    <strong>{number(point.actualQuantity)} SP</strong>
                </div>
                <div>
                    <span>Khoán</span>
                    <strong>{number(point.targetQuantity)} SP</strong>
                </div>
                <div>
                    <span>Báo đủ</span>
                    <strong>{number(point.reportingRate, 1)}%</strong>
                </div>
                <div>
                    <span>Nhân sự</span>
                    <strong>{number(point.workers)} CN</strong>
                </div>
            </div>
            <Progress percent={Math.min(100, Math.round(point.achievementPercent))} showInfo={false} size='small' />
        </article>
    );

    const renderMobileException = (item: ProductionReportException) => (
        <button
            type='button'
            key={item.id}
            className={`production-report-mobile-exception severity-${item.severity}`}
            onClick={() => navigate(`/production?plantId=${plantId}&date=${item.productionDate}`)}
        >
            <span className='production-report-mobile-exception__icon'>
                {item.severity === 'critical' ? <ExclamationCircleFilled /> : <AlertOutlined />}
            </span>
            <span className='production-report-mobile-exception__copy'>
                <strong>{item.title}</strong>
                <small>
                    {dayjs(item.productionDate).format('DD/MM')} · {item.description}
                </small>
            </span>
        </button>
    );

    return (
        <div className='production-page production-report-page'>
            <section className='production-workbench-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Phase 5 · Quản trị sản xuất</span>
                    <Title level={2}>Báo cáo điều hành</Title>
                    <Text type='secondary'>Đối chiếu kế hoạch, hiệu suất chuyền và chất lượng báo cáo.</Text>
                </div>
                <div className='production-report-actions'>
                    <Tooltip title='Tải lại số liệu'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={reportQuery.isFetching}
                            onClick={() => reportQuery.refetch()}
                        />
                    </Tooltip>
                    <Button
                        type='primary'
                        icon={<FileExcelOutlined />}
                        loading={exportMutation.isPending}
                        disabled={!report?.summary.dayCount}
                        onClick={() => exportMutation.mutate()}
                    >
                        Xuất Excel
                    </Button>
                </div>
            </section>

            <section className='production-report-filterbar'>
                <div className='production-report-filterbar__primary'>
                    {canSwitchPlant ? (
                        <Select
                            value={plantId || undefined}
                            loading={plantsQuery.isLoading}
                            options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                            onChange={setPlantId}
                            placeholder='Chọn cơ sở'
                            showSearch
                            optionFilterProp='label'
                        />
                    ) : null}
                    <Select<ReportPreset>
                        value={preset}
                        onChange={handlePreset}
                        options={[
                            { value: 'month', label: 'Tháng này' },
                            { value: 'last-month', label: 'Tháng trước' },
                            { value: '7-days', label: '7 ngày gần nhất' },
                            { value: '30-days', label: '30 ngày gần nhất' },
                            { value: 'custom', label: 'Tùy chỉnh' },
                        ]}
                    />
                    <RangePicker value={range} format='DD/MM/YYYY' allowClear={false} onChange={handleRange} />
                </div>
                <Segmented
                    value={scope}
                    onChange={(value) => setScope(value as ProductionReportScope)}
                    options={[
                        { value: 'all', label: 'Vận hành' },
                        { value: 'locked', label: 'Đã khóa sổ' },
                    ]}
                />
            </section>

            {reportQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không thể tải báo cáo'
                    description={errorMessage(reportQuery.error)}
                    action={<Button onClick={() => reportQuery.refetch()}>Thử lại</Button>}
                />
            ) : null}

            {reportQuery.isLoading ? (
                <section className='production-report-loading'>
                    <Skeleton active paragraph={{ rows: 10 }} />
                </section>
            ) : report && summary?.dayCount ? (
                <>
                    {scope === 'all' && summary.statusCounts.locked < summary.dayCount ? (
                        <Alert
                            className='production-report-draft-note'
                            type='warning'
                            showIcon
                            message={`${summary.dayCount - summary.statusCounts.locked} ngày chưa khóa sổ`}
                            description='Số liệu vận hành có thể tiếp tục thay đổi. Chọn “Đã khóa sổ” khi cần báo cáo chính thức.'
                        />
                    ) : null}

                    <section className={`production-report-commandbar health-${summary.health}`}>
                        <div className='production-report-commandbar__signal'>
                            <span>
                                {summary.health === 'healthy' ? <CheckCircleFilled /> : <ExclamationCircleFilled />}
                            </span>
                            <div>
                                <small>Đánh giá kỳ báo cáo</small>
                                <strong>
                                    {summary.health === 'healthy'
                                        ? 'Vận hành ổn định'
                                        : summary.health === 'warning'
                                          ? 'Có điểm cần theo dõi'
                                          : 'Cần can thiệp'}
                                </strong>
                                <p>
                                    Đạt {number(summary.achievementPercent, 1)}% mục tiêu, báo đủ{' '}
                                    {number(summary.reportingRate, 1)}%
                                    {report.exceptionSummary.critical > 0
                                        ? `, còn ${report.exceptionSummary.critical} ngoại lệ nghiêm trọng.`
                                        : '.'}
                                </p>
                            </div>
                        </div>
                        <div className='production-report-commandbar__facts'>
                            <div>
                                <span>Chuyền tốt nhất</span>
                                <strong>{report.highlights.bestLine?.lineCode || '—'}</strong>
                            </div>
                            <div>
                                <span>Cần chú ý</span>
                                <strong>{report.highlights.attentionLine?.lineCode || '—'}</strong>
                            </div>
                            <div>
                                <span>Mã hàng chủ lực</span>
                                <strong>{report.highlights.topItem?.itemCode || '—'}</strong>
                            </div>
                            <div>
                                <span>Ngoại lệ</span>
                                <strong>{number(report.exceptionSummary.total)}</strong>
                            </div>
                        </div>
                    </section>

                    <section className='production-report-kpis'>
                        <div>
                            <span className='production-report-kpi-icon'>
                                <ThunderboltOutlined />
                            </span>
                            <small>Sản lượng thực tế</small>
                            <strong>{number(summary.actualQuantity)} SP</strong>
                            <Delta value={report.comparison.delta?.actualPercent} />
                        </div>
                        <div>
                            <span className='production-report-kpi-icon'>
                                <CheckCircleFilled />
                            </span>
                            <small>Hoàn thành mục tiêu</small>
                            <strong>{number(summary.achievementPercent, 1)}%</strong>
                            <Delta value={report.comparison.delta?.achievementPoints} suffix=' điểm' />
                        </div>
                        <div>
                            <span className='production-report-kpi-icon'>
                                <CalendarOutlined />
                            </span>
                            <small>Độ đầy đủ báo cáo</small>
                            <strong>{number(summary.reportingRate, 1)}%</strong>
                            <Delta value={report.comparison.delta?.reportingPoints} suffix=' điểm' />
                        </div>
                        <div>
                            <span className='production-report-kpi-icon'>
                                <TeamOutlined />
                            </span>
                            <small>Nhân sự bình quân</small>
                            <strong>{number(summary.averageWorkers, 1)}</strong>
                            <span className='production-report-kpi-foot'>
                                {number(summary.outputPerWorkerDay, 1)} SP/người-ngày
                            </span>
                        </div>
                        <div>
                            <span className='production-report-kpi-icon'>
                                <DownloadOutlined />
                            </span>
                            <small>Thực hiện kế hoạch</small>
                            <strong>{number(summary.planAttainmentPercent, 1)}%</strong>
                            <span className='production-report-kpi-foot'>
                                {number(summary.plannedQuantity)} SP đã phát hành
                            </span>
                        </div>
                        {report.meta.financialsVisible ? (
                            <div>
                                <span className='production-report-kpi-icon'>₫</span>
                                <small>Giá trị sản lượng</small>
                                <strong>{money(summary.totalAmount)}</strong>
                                <Delta value={report.comparison.delta?.amountPercent} />
                            </div>
                        ) : null}
                    </section>

                    <section className='production-report-trend-band'>
                        <div className='production-report-section-heading'>
                            <div>
                                <Title level={4}>Xu hướng sản lượng</Title>
                                <Text type='secondary'>
                                    Thực tế so với mục tiêu và kế hoạch đã phát hành theo ngày.
                                </Text>
                            </div>
                            <Tag>{summary.dayCount} ngày dữ liệu</Tag>
                        </div>
                        <EChart option={trendOption} height={isMobile ? 292 : 340} />
                    </section>

                    <section className='production-report-detail-band'>
                        <div className='production-report-detail-toolbar'>
                            <Segmented
                                block={isMobile}
                                value={tab}
                                onChange={(value) => setTab(value as ReportTab)}
                                options={[
                                    { value: 'lines', label: `Theo chuyền (${report.lines.length})` },
                                    { value: 'items', label: `Mã hàng (${report.items.length})` },
                                    { value: 'days', label: `Theo ngày (${report.trend.length})` },
                                    { value: 'exceptions', label: `Ngoại lệ (${report.exceptionSummary.total})` },
                                ]}
                            />
                            {!isMobile ? (
                                <Text type='secondary'>
                                    Kỳ so sánh:{' '}
                                    {report.comparison.available
                                        ? `${dayjs(report.comparison.from).format('DD/MM')} - ${dayjs(report.comparison.to).format('DD/MM/YYYY')}`
                                        : 'chưa có dữ liệu'}
                                </Text>
                            ) : null}
                        </div>

                        {tab === 'lines' ? (
                            isMobile ? (
                                <div className='production-report-mobile-list'>
                                    {report.lines.map(renderMobileLine)}
                                </div>
                            ) : (
                                <Table
                                    rowKey='lineId'
                                    columns={lineColumns}
                                    dataSource={report.lines}
                                    pagination={{ pageSize: 15, showSizeChanger: false }}
                                    scroll={{ x: 1050 }}
                                    size='middle'
                                />
                            )
                        ) : null}
                        {tab === 'items' ? (
                            isMobile ? (
                                <div className='production-report-mobile-list'>
                                    {report.items.map(renderMobileItem)}
                                </div>
                            ) : (
                                <Table
                                    rowKey='itemId'
                                    columns={itemColumns}
                                    dataSource={report.items}
                                    pagination={{ pageSize: 15, showSizeChanger: false }}
                                    scroll={{ x: 1000 }}
                                    size='middle'
                                />
                            )
                        ) : null}
                        {tab === 'days' ? (
                            isMobile ? (
                                <div className='production-report-mobile-list'>
                                    {[...report.trend].reverse().map(renderMobileDay)}
                                </div>
                            ) : (
                                <Table
                                    rowKey='productionDate'
                                    columns={dayColumns}
                                    dataSource={report.trend}
                                    // Ngày chưa khóa sổ tô nền nhẹ: số trên dòng đó chưa phải số chính thức
                                    rowClassName={(point) =>
                                        point.status !== 'locked' ? 'production-report-day-open' : ''
                                    }
                                    pagination={{ pageSize: 31, showSizeChanger: false }}
                                    scroll={{ x: 1080 }}
                                    size='middle'
                                />
                            )
                        ) : null}
                        {tab === 'exceptions' ? (
                            report.exceptions.length ? (
                                isMobile ? (
                                    <div className='production-report-mobile-list'>
                                        {report.exceptions.map(renderMobileException)}
                                    </div>
                                ) : (
                                    <Table
                                        rowKey='id'
                                        columns={exceptionColumns}
                                        dataSource={report.exceptions}
                                        pagination={{ pageSize: 20, showSizeChanger: false }}
                                        scroll={{ x: 850 }}
                                        size='middle'
                                    />
                                )
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Không có ngoại lệ trong kỳ báo cáo'
                                />
                            )
                        ) : null}
                    </section>
                </>
            ) : report ? (
                <section className='production-report-empty'>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <div>
                                <strong>Chưa có dữ liệu sản xuất</strong>
                                <p>Hãy đổi khoảng ngày hoặc khởi tạo ngày sản xuất trước khi xem báo cáo.</p>
                            </div>
                        }
                    >
                        <Button type='primary' onClick={() => navigate('/production')}>
                            Mở màn nhập sản lượng
                        </Button>
                    </Empty>
                </section>
            ) : null}
        </div>
    );
};

export default ProductionReportPage;
