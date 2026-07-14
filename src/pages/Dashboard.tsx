import React, { useMemo } from 'react';
import { Button, Space, Tag } from 'antd';
import {
    AppstoreOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ClusterOutlined,
    DatabaseOutlined,
    DollarOutlined,
    FormOutlined,
    ReloadOutlined,
    SendOutlined,
    SwapOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import DashboardChartsRow from '../components/dashboard/DashboardChartsRow';
import DashboardCostTrendCard from '../components/dashboard/DashboardCostTrendCard';
import DashboardFacilityDistributionCard from '../components/dashboard/DashboardFacilityDistributionCard';
import DashboardOperationsCard from '../components/dashboard/DashboardOperationsCard';
import DashboardMislocatedCard from '../components/dashboard/DashboardMislocatedCard';
import DashboardAuditCard from '../components/dashboard/DashboardAuditCard';
import DashboardExecutiveBriefing from '../components/dashboard/DashboardExecutiveBriefing';
import DashboardOverdueCard from '../components/dashboard/DashboardOverdueCard';
import DashboardRecentActivityCard from '../components/dashboard/DashboardRecentActivityCard';
import DashboardTopBrokenCard from '../components/dashboard/DashboardTopBrokenCard';
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';
import { useAuth } from '../core/contexts/AuthContext';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { useDashboardCharts, useDashboardInsights, useDashboardOverview } from '../core/hooks/useDashboardOverview';
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
    const navigate = useNavigate();
    const { user } = useAuth();
    // Chi phí chỉ dành cho ADMIN + Giám đốc (kỹ thuật & quản lý không thấy trên dashboard).
    const canViewCost = isAdmin(user?.role) || isDirector(user?.role);
    const { data = emptyOverview, isLoading, isFetching, refetch, dataUpdatedAt } = useDashboardOverview();
    const {
        data: chartData,
        isLoading: chartsLoading,
        isFetching: chartsFetching,
        refetch: refetchCharts,
    } = useDashboardCharts();
    const {
        data: insights,
        isLoading: insightsLoading,
        isFetching: insightsFetching,
        refetch: refetchInsights,
    } = useDashboardInsights();
    const { summary, maintenanceCost = emptyOverview.maintenanceCost, facilityStats, recentActivities } = data;
    const resolution = insights?.resolution;
    const attentionCount =
        summary.unassignedMachines +
        summary.maintenanceMachines +
        summary.inactiveMachines +
        (maintenanceCost?.externalRepairPendingApproval ?? 0);

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
            ...(canViewCost
                ? [
                      {
                          title: 'Chi phí sửa ngoài',
                          value: formatMoney(maintenanceCost?.externalRepairCostThisMonth ?? 0),
                          icon: <DollarOutlined />,
                          accent: '#16a34a',
                          caption: `${maintenanceCost?.externalRepairPendingApproval ?? 0} phiếu chờ duyệt`,
                      },
                  ]
                : []),
        ],
        [summary, maintenanceCost, canViewCost]
    );

    const performanceCards = useMemo(
        () => [
            {
                title: 'Thời gian xử lý TB (tháng)',
                value: resolution ? `${resolution.avgDaysThisMonth} ngày` : '--',
                icon: <ClockCircleOutlined />,
                accent: '#2563eb',
                caption: `Toàn thời gian: ${resolution?.avgDaysAll ?? 0} ngày`,
            },
            {
                title: 'Phiếu xử lý xong (tháng)',
                value: resolution?.completedThisMonth ?? 0,
                icon: <CheckCircleOutlined />,
                accent: '#16a34a',
                caption: `Tổng đã hoàn thành: ${resolution?.completedAll ?? 0}`,
            },
            {
                title: 'Phiếu bảo trì tồn đọng',
                value: insights?.overdue.count ?? 0,
                icon: <WarningOutlined />,
                accent: (insights?.overdue.count ?? 0) > 0 ? '#dc2626' : '#16a34a',
                caption: `Quá ${insights?.overdue.thresholdDays ?? 7} ngày chưa hoàn thành`,
            },
        ],
        [resolution, insights?.overdue.count, insights?.overdue.thresholdDays]
    );

    const quickActions = useMemo(
        () => [
            {
                label: 'Danh sách máy',
                path: '/assets',
                icon: <AppstoreOutlined />,
            },
            {
                label: 'Chuyển máy',
                path: '/transfers',
                icon: <SwapOutlined />,
            },
            {
                label: 'Tồn kho',
                path: '/materials/inventory',
                icon: <DatabaseOutlined />,
            },
            {
                label: 'Cấp phát vật tư',
                path: '/materials/distributions',
                icon: <SendOutlined />,
            },
            {
                label: 'Phiếu yêu cầu',
                path: '/materials/supply-requests',
                icon: <FormOutlined />,
            },
        ],
        []
    );

    const attentionItems = useMemo(
        () => [
            {
                label: 'Máy chưa phân công',
                value: summary.unassignedMachines,
                caption: 'Cần gán cơ sở để theo dõi vận hành',
                path: '/assets',
                icon: <ClusterOutlined />,
                severity: summary.unassignedMachines > 0 ? 'danger' : 'ok',
            },
            {
                label: 'Đang bảo trì',
                value: summary.maintenanceMachines,
                caption: 'Kiểm tra tiến độ và lịch sử sửa chữa',
                path: '/maintenances',
                icon: <ToolOutlined />,
                severity: summary.maintenanceMachines > 0 ? 'warning' : 'ok',
            },
            {
                label: 'Phiếu sửa chờ duyệt',
                value: maintenanceCost?.externalRepairPendingApproval ?? 0,
                caption: 'Ưu tiên xử lý chi phí sửa ngoài',
                path: '/maintenances',
                icon: <DollarOutlined />,
                severity: (maintenanceCost?.externalRepairPendingApproval ?? 0) > 0 ? 'warning' : 'ok',
            },
        ],
        [summary.unassignedMachines, summary.maintenanceMachines, maintenanceCost?.externalRepairPendingApproval]
    );

    const lastUpdatedLabel = dataUpdatedAt ? dayjs(dataUpdatedAt).format('DD/MM/YYYY HH:mm') : '--';

    return (
        <div className='dashboard-shell flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Bảng điều khiển vận hành'
                subtitle='Tổng quan tình trạng máy móc, tải cơ sở, sửa chữa và hoạt động gần đây trên toàn công ty.'
                actions={
                    <Space wrap size={12}>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={isFetching || chartsFetching || insightsFetching}
                            onClick={() => {
                                refetch();
                                refetchCharts();
                                refetchInsights();
                            }}
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
                        {attentionCount > 0 ? (
                            <Tag color='orange' className='rounded-full px-3 py-1 text-xs font-semibold'>
                                {attentionCount} việc cần xử lý
                            </Tag>
                        ) : null}
                    </div>
                }
            />

            <div className='dashboard-action-strip' aria-label='Thao tác nhanh trên dashboard'>
                {quickActions.map((action) => (
                    <button
                        key={action.path}
                        type='button'
                        onClick={() => navigate(action.path)}
                        className='dashboard-action-chip'
                    >
                        <span className='dashboard-action-chip__icon'>{action.icon}</span>
                        <span className='dashboard-action-chip__label'>{action.label}</span>
                    </button>
                ))}
            </div>

            {canViewCost ? <DashboardExecutiveBriefing /> : null}

            {canViewCost ? <DashboardAuditCard /> : null}

            <div className='dashboard-attention-grid'>
                {attentionItems.map((item) => (
                    <button
                        key={item.label}
                        type='button'
                        onClick={() => navigate(item.path)}
                        className={`dashboard-attention-item dashboard-attention-item--${item.severity}`}
                    >
                        <span className='dashboard-attention-item__icon'>{item.icon}</span>
                        <span className='min-w-0 flex-1'>
                            <span className='dashboard-attention-item__label'>{item.label}</span>
                            <span className='dashboard-attention-item__caption'>{item.caption}</span>
                        </span>
                        <span className='dashboard-attention-item__value'>{item.value}</span>
                    </button>
                ))}
            </div>

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

            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                {performanceCards.map((card) => (
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

            <DashboardChartsRow data={chartData} loading={chartsLoading} />

            {canViewCost ? (
                <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]'>
                    <DashboardCostTrendCard data={insights?.costTrend} loading={insightsLoading} />
                    <DashboardTopBrokenCard data={insights?.topBrokenAssets} loading={insightsLoading} />
                </div>
            ) : (
                <DashboardTopBrokenCard data={insights?.topBrokenAssets} loading={insightsLoading} />
            )}

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]'>
                <DashboardFacilityDistributionCard facilityStats={facilityStats} loading={isLoading} />
                <DashboardOperationsCard summary={summary} loading={isLoading} />
            </div>

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
                <DashboardOverdueCard data={insights?.overdue} loading={insightsLoading} />
                <DashboardMislocatedCard data={insights?.mislocatedAssets} loading={insightsLoading} />
            </div>

            <DashboardRecentActivityCard activities={recentActivities} loading={isLoading} />
        </div>
    );
};

export default Dashboard;
