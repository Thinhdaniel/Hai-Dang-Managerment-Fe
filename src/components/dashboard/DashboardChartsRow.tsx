import { useMemo } from 'react';
import { Card, Empty, Skeleton } from 'antd';
import dayjs from 'dayjs';
import EChart, { type EChartsCoreOption } from '../charts/EChart';
import { DonutCenter, ECHARTS_AXIS_LABEL, ECHARTS_TOOLTIP_STYLE } from '../charts';
import type { DashboardChartData } from '../../core/types';

type DashboardChartsRowProps = {
    data?: DashboardChartData;
    loading?: boolean;
};

// Nhãn + màu trạng thái máy, đồng bộ với danh sách máy.
const STATUS_META: Record<string, { label: string; color: string }> = {
    active: { label: 'Hoạt động', color: '#16a34a' },
    maintenance: { label: 'Bảo trì', color: '#d97706' },
    broken: { label: 'Lỗi / hỏng', color: '#dc2626' },
    borrowing: { label: 'Đang mượn', color: '#6366f1' },
    storage: { label: 'Tồn kho', color: '#64748b' },
};

const cardClass = 'h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm';
const titleClass = 'text-base font-semibold text-slate-800';

const DashboardChartsRow = ({ data, loading }: DashboardChartsRowProps) => {
    const statusItems = useMemo(
        () =>
            (data?.statusDistribution ?? [])
                .map((item) => ({
                    name: STATUS_META[item.status]?.label ?? item.status,
                    value: item.count,
                    itemStyle: { color: STATUS_META[item.status]?.color ?? '#94a3b8' },
                }))
                .filter((item) => item.value > 0),
        [data?.statusDistribution]
    );

    const totalMachines = useMemo(() => statusItems.reduce((sum, item) => sum + item.value, 0), [statusItems]);

    const donutOption = useMemo<EChartsCoreOption>(
        () => ({
            tooltip: {
                ...ECHARTS_TOOLTIP_STYLE,
                trigger: 'item',
                formatter: (params: any) =>
                    `<b>${params.name}</b><br/>${params.value} máy · ${params.percent}%`,
            },
            series: [
                {
                    type: 'pie',
                    radius: ['60%', '84%'],
                    center: ['50%', '50%'],
                    avoidLabelOverlap: true,
                    padAngle: 2,
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    label: { show: false },
                    labelLine: { show: false },
                    data: statusItems,
                },
            ],
        }),
        [statusItems]
    );

    const trendOption = useMemo<EChartsCoreOption>(() => {
        const points = data?.maintenanceByWeek ?? [];
        return {
            grid: { top: 16, right: 16, bottom: 28, left: 36 },
            tooltip: {
                ...ECHARTS_TOOLTIP_STYLE,
                trigger: 'axis',
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    return `<b>Tuần ${item.axisValue}</b><br/>${item.value} phiếu bảo trì`;
                },
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: points.map((point) => dayjs(point.date).format('DD/MM')),
                axisLabel: ECHARTS_AXIS_LABEL,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel: ECHARTS_AXIS_LABEL,
                splitLine: { lineStyle: { color: '#f1f5f9' } },
            },
            series: [
                {
                    type: 'line',
                    smooth: true,
                    symbolSize: 7,
                    data: points.map((point) => point.count),
                    lineStyle: { width: 3, color: '#2563eb' },
                    itemStyle: { color: '#2563eb' },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(37,99,235,0.22)' },
                                { offset: 1, color: 'rgba(37,99,235,0.01)' },
                            ],
                        },
                    },
                },
            ],
        };
    }, [data?.maintenanceByWeek]);

    const hasTrend = (data?.maintenanceByWeek ?? []).some((point) => point.count > 0);

    return (
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
            <Card
                variant='borderless'
                className={cardClass}
                title={<span className={titleClass}>Phân bố trạng thái máy</span>}
                extra={<span className='text-xs font-medium text-slate-500'>{totalMachines} máy</span>}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                ) : statusItems.length === 0 ? (
                    <Empty description='Chưa có dữ liệu' image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                    <>
                        <div className='relative'>
                            <EChart option={donutOption} height={220} />
                            <DonutCenter title='Tổng số máy' value={String(totalMachines)} />
                        </div>
                        <div className='mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5'>
                            {statusItems.map((item) => (
                                <span key={item.name} className='flex items-center gap-1.5 text-xs text-slate-600'>
                                    <span
                                        className='h-2.5 w-2.5 rounded-sm'
                                        style={{ background: item.itemStyle.color }}
                                    />
                                    {item.name}
                                    <b className='text-slate-800'>{item.value}</b>
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </Card>

            <Card
                variant='borderless'
                className={cardClass}
                title={<span className={titleClass}>Xu hướng bảo trì 8 tuần</span>}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                ) : !hasTrend ? (
                    <Empty description='Chưa có phiếu bảo trì gần đây' image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                    <EChart option={trendOption} height={260} />
                )}
            </Card>
        </div>
    );
};

export default DashboardChartsRow;
