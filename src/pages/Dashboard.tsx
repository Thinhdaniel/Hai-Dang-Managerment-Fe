import React, { useMemo } from 'react';
import { Button, Space, Tag } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    ClusterOutlined,
    DollarOutlined,
    ReloadOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import DashboardFacilityDistributionCard from '../components/dashboard/DashboardFacilityDistributionCard';
import DashboardOperationsCard from '../components/dashboard/DashboardOperationsCard';
import DashboardRecentActivityCard from '../components/dashboard/DashboardRecentActivityCard';
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';
import { useDashboardOverview } from '../core/hooks/useDashboardOverview';
import type { DashboardOverviewResponse } from '../core/types';

const emptyOverview: DashboardOverviewResponse = {
    summary: {
        totalMachines: 0,
        activeMachines: 0,
        maintenanceMachines: 0,
        inactiveMachines: 0,
        totalFacilities: 0,
        unassignedMachines: 0,
    },
    maintenanceCost: {
        externalRepairCostThisMonth: 0,
        externalRepairCompletedThisMonth: 0,
        externalRepairPendingApproval: 0,
        externalRepairInProgress: 0,
    },
    facilityStats: [],
    recentActivities: [],
};

const toPercent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
const formatMoney = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const Dashboard: React.FC = () => {
    const { data = emptyOverview, isLoading, isFetching, refetch, dataUpdatedAt } = useDashboardOverview();
    const { summary, maintenanceCost = emptyOverview.maintenanceCost, facilityStats, recentActivities } = data;

    const summaryCards = useMemo(
        () => [
            {
                title: 'Tổng số máy',
                value: summary.totalMachines,
                icon: <AppstoreOutlined />,
                accent: '#2563eb',
                caption: `${summary.totalFacilities} cơ sở đã kết nối`,
            },
            {
                title: 'Máy hoạt động',
                value: summary.activeMachines,
                icon: <CheckCircleOutlined />,
                accent: '#16a34a',
                caption: `${toPercent(summary.activeMachines, summary.totalMachines)}% đội máy sẵn sàng`,
            },
            {
                title: 'Máy đang bảo trì',
                value: summary.maintenanceMachines,
                icon: <ToolOutlined />,
                accent: '#d97706',
                caption: `${maintenanceCost?.externalRepairInProgress ?? 0} máy sửa ngoài đang xử lý`,
            },
            {
                title: 'Chi phí sửa ngoài',
                value: formatMoney(maintenanceCost?.externalRepairCostThisMonth ?? 0),
                icon: <DollarOutlined />,
                accent: '#16a34a',
                caption: `${maintenanceCost?.externalRepairPendingApproval ?? 0} phiếu chờ duyệt`,
            },
        ],
        [summary, maintenanceCost]
    );

    const lastUpdatedLabel = dataUpdatedAt ? dayjs(dataUpdatedAt).format('DD/MM/YYYY HH:mm') : '--';

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Bảng điều khiển vận hành'
                subtitle='Tổng quan tình trạng máy móc, tải cơ sở, sửa chữa và hoạt động gần đây trên toàn công ty.'
                actions={
                    <Space wrap size={12}>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={isFetching}
                            onClick={() => refetch()}
                            className='rounded-lg border-slate-300 font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900'
                        >
                            Làm mới
                        </Button>
                    </Space>
                }
                extra={
                    <div className='flex flex-wrap gap-2'>
                        <Tag color='blue' className='rounded-full px-3 py-1 text-xs font-semibold'>
                            <ClusterOutlined /> {summary.totalFacilities} cơ sở
                        </Tag>
                        <Tag
                            color={summary.unassignedMachines > 0 ? 'red' : 'green'}
                            className='rounded-full px-3 py-1 text-xs font-semibold'
                        >
                            {summary.unassignedMachines} máy chưa được phân công
                        </Tag>
                        <Tag className='rounded-full px-3 py-1 text-xs font-semibold text-slate-600'>
                            Cập nhật {lastUpdatedLabel}
                        </Tag>
                    </div>
                }
            />

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
                {summaryCards.map((card) => (
                    <StatsCard
                        key={card.title}
                        title={card.title}
                        value={card.value}
                        icon={card.icon}
                        accent={card.accent}
                        caption={card.caption}
                    />
                ))}
            </div>

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]'>
                <DashboardFacilityDistributionCard facilityStats={facilityStats} loading={isLoading} />
                <DashboardOperationsCard summary={summary} loading={isLoading} />
            </div>

            <DashboardRecentActivityCard activities={recentActivities} loading={isLoading} />
        </div>
    );
};

export default Dashboard;
