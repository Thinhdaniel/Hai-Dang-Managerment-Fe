import { useMemo } from 'react';
import { Card, Empty, Skeleton } from 'antd';
import dayjs from 'dayjs';
import EChart, { type EChartsCoreOption } from '../charts/EChart';
import {
    CHART_SEMANTIC,
    ECHARTS_AXIS_LABEL,
    ECHARTS_LEGEND_TOP,
    barGradient,
    fmtChartShort,
    stackedTooltipFormatter,
} from '../charts';
import type { DashboardCostTrendPoint } from '../../core/types';

type DashboardCostTrendCardProps = {
    data?: DashboardCostTrendPoint[];
    loading?: boolean;
};

const fmtMoney = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const DashboardCostTrendCard = ({ data, loading }: DashboardCostTrendCardProps) => {
    const points = data ?? [];
    const total = useMemo(() => points.reduce((sum, point) => sum + point.totalCost, 0), [points]);
    const hasData = points.some((point) => point.totalCost > 0);

    const option = useMemo<EChartsCoreOption>(
        () => ({
            grid: { top: 36, right: 16, bottom: 28, left: 48 },
            legend: { ...ECHARTS_LEGEND_TOP },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: stackedTooltipFormatter },
            xAxis: {
                type: 'category',
                data: points.map((point) => dayjs(`${point.month}-01`).format('MM/YYYY')),
                axisLabel: ECHARTS_AXIS_LABEL,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLabel: { ...ECHARTS_AXIS_LABEL, formatter: (value: number) => fmtChartShort(value) },
                splitLine: { lineStyle: { color: '#f1f5f9' } },
            },
            series: [
                {
                    name: 'Cấp phát vật tư',
                    type: 'bar',
                    stack: 'cost',
                    barMaxWidth: 36,
                    itemStyle: { color: barGradient(CHART_SEMANTIC.material), borderRadius: [0, 0, 0, 0] },
                    data: points.map((point) => point.distributionCost),
                },
                {
                    name: 'Sửa ngoài',
                    type: 'bar',
                    stack: 'cost',
                    barMaxWidth: 36,
                    itemStyle: { color: barGradient(CHART_SEMANTIC.repair), borderRadius: [6, 6, 0, 0] },
                    data: points.map((point) => point.repairCost),
                },
            ],
        }),
        [points]
    );

    return (
        <Card
            variant='borderless'
            className='h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Xu hướng chi phí vận hành 6 tháng</span>}
            extra={<span className='text-xs font-semibold text-slate-500'>Tổng {fmtMoney(total)}</span>}
        >
            {loading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : !hasData ? (
                <Empty description='Chưa có chi phí phát sinh' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <EChart option={option} height={300} />
            )}
        </Card>
    );
};

export default DashboardCostTrendCard;
