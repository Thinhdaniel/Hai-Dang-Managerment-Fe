import { Card, Empty, Spin, Tag } from 'antd';
import {
    ArrowRightOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    RollbackOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DashboardRecentActivity } from '../../core/types';

type DashboardRecentActivityCardProps = {
    activities: DashboardRecentActivity[];
    loading?: boolean;
};
const getActivityMeta = (activity: DashboardRecentActivity) => {
    if (activity.category === 'transfer') {
        switch (activity.action) {
            case 'completed':
                return {
                    label: 'Chuyển giao thành công',
                    color: 'green',
                    accent: 'text-emerald-600 bg-emerald-50',
                    icon: <CheckCircleOutlined />,
                };
            case 'approved':
                return {
                    label: 'Đã duyệt',
                    color: 'blue',
                    accent: 'text-blue-600 bg-blue-50',
                    icon: <SwapOutlined />,
                };
            case 'rejected':
                return {
                    label: 'Đã từ chối',
                    color: 'red',
                    accent: 'text-rose-600 bg-rose-50',
                    icon: <CloseCircleOutlined />,
                };
            default:
                return {
                    label: 'Đã tạo yêu cầu chuyển nhượng',
                    color: 'gold',
                    accent: 'text-amber-600 bg-amber-50',
                    icon: <ClockCircleOutlined />,
                };
        }
    }

    if (activity.action === 'returned') {
        return {
            label: 'Đã trả',
            color: 'cyan',
            accent: 'text-cyan-600 bg-cyan-50',
            icon: <RollbackOutlined />,
        };
    }

    return {
        label: 'Đã mượn',
        color: 'purple',
        accent: 'text-violet-600 bg-violet-50',
        icon: <ArrowRightOutlined />,
    };
};

const getContextLine = (activity: DashboardRecentActivity) => {
    if (activity.category === 'transfer') {
        return `${activity.fromFacility?.name || 'Unknown origin'} -> ${activity.toFacility?.name || 'Unknown destination'}`;
    }

    const counterpart = activity.counterpart ? `by ${activity.counterpart}` : 'without counterpart';
    const facility = activity.facility?.name ? `at ${activity.facility.name}` : 'without facility';
    return `${counterpart} ${facility}`;
};

const DashboardRecentActivityCard = ({ activities, loading }: DashboardRecentActivityCardProps) => {
    return (
        <Card
            variant='borderless'
            className='rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Hoạt động gần đây</span>}
            extra={<span className='text-xs font-medium text-slate-500'>Luồng chuyển nhượng và mượn</span>}
        >
            {activities.length === 0 && !loading ? (
                <Empty description='Không có hoạt động nào' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <Spin spinning={Boolean(loading)}>
                    <div className='divide-y divide-slate-100'>
                        {activities.map((activity) => {
                            const meta = getActivityMeta(activity);

                            return (
                                <div
                                    key={`${activity.category}-${activity.action}-${activity.timestamp}`}
                                    className='py-4'
                                >
                                    <div className='flex w-full flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                                        <div className='flex min-w-0 items-start gap-3'>
                                            <div
                                                className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${meta.accent}`}
                                            >
                                                {meta.icon}
                                            </div>
                                            <div className='min-w-0 space-y-1'>
                                                <div className='flex flex-wrap items-center gap-2'>
                                                    <span className='truncate text-[14px] font-semibold text-slate-800'>
                                                        {activity.asset?.name || 'Unknown machine'}
                                                    </span>
                                                    <Tag
                                                        color={meta.color}
                                                        className='mr-0 rounded-full px-2 py-0.5 text-[11px] font-semibold'
                                                    >
                                                        {meta.label}
                                                    </Tag>
                                                </div>
                                                <div className='flex flex-wrap items-center gap-2 text-xs text-slate-500'>
                                                    <span className='rounded-full bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-600'>
                                                        {activity.asset?.machineCode || 'N/A'}
                                                    </span>
                                                    <span>{getContextLine(activity)}</span>
                                                </div>
                                                {activity.description ? (
                                                    <p className='line-clamp-2 max-w-3xl text-sm text-slate-600'>
                                                        {activity.description}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className='flex shrink-0 items-center gap-2 md:flex-col md:items-end'>
                                            <Tag
                                                color={activity.category === 'transfer' ? 'blue' : 'purple'}
                                                className='mr-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase'
                                            >
                                                {activity.category}
                                            </Tag>
                                            <span className='text-xs font-medium text-slate-500'>
                                                {dayjs(activity.timestamp).format('DD/MM/YYYY HH:mm')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Spin>
            )}
        </Card>
    );
};

export default DashboardRecentActivityCard;
