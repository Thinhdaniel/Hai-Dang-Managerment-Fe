import { Card, Progress } from 'antd';
import { CheckCircleOutlined, ClusterOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import type { DashboardOverviewSummary } from '../../core/types';

type DashboardOperationsCardProps = {
    summary: DashboardOverviewSummary;
    loading?: boolean;
};

const DashboardOperationsCard = ({ summary, loading }: DashboardOperationsCardProps) => {
    const assignedMachines = Math.max(summary.totalMachines - summary.unassignedMachines, 0);
    const coveragePercent =
        summary.totalMachines > 0 ? Math.round((assignedMachines / summary.totalMachines) * 100) : 0;
    const attentionMachines = summary.maintenanceMachines + summary.inactiveMachines;

    return (
        <Card
            loading={loading}
            variant='borderless'
            className='h-full rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Khả năng vận hành</span>}
        >
            <div className='space-y-5'>
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                    <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase'>
                                    Cơ sở
                                </div>
                                <div className='mt-2 text-3xl font-bold text-slate-900'>{summary.totalFacilities}</div>
                            </div>
                            <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg text-blue-600 shadow-sm'>
                                <ClusterOutlined />
                            </div>
                        </div>
                    </div>

                    <div className='rounded-2xl border border-rose-100 bg-rose-50 p-4'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase'>
                                    Chưa được giao
                                </div>
                                <div className='mt-2 text-3xl font-bold text-rose-700'>
                                    {summary.unassignedMachines}
                                </div>
                            </div>
                            <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg text-rose-600 shadow-sm'>
                                <WarningOutlined />
                            </div>
                        </div>
                    </div>
                </div>

                <div className='rounded-2xl border border-slate-200 bg-white p-4'>
                    <div className='flex items-center justify-between text-sm'>
                        <span className='font-semibold text-slate-700'>Khả năng bao phủ giao cơ sở</span>
                        <span className='font-bold text-slate-900'>{coveragePercent}%</span>
                    </div>
                    <Progress percent={coveragePercent} showInfo={false} strokeColor='#2563eb' railColor='#e2e8f0' />
                    <div className='mt-3 flex items-center justify-between text-xs text-slate-500'>
                        <span>{assignedMachines} máy được giao</span>
                        <span>{summary.totalMachines} tổng số máy</span>
                    </div>
                </div>

                <div className='grid grid-cols-2 gap-3'>
                    <div className='rounded-2xl border border-amber-100 bg-amber-50 p-4'>
                        <div className='flex items-center gap-2 text-amber-600'>
                            <ToolOutlined />
                            <span className='text-xs font-semibold tracking-[0.18em] uppercase'>Bảo trì</span>
                        </div>
                        <div className='mt-2 text-2xl font-bold text-amber-700'>{summary.maintenanceMachines}</div>
                    </div>

                    <div className='rounded-2xl border border-sky-100 bg-sky-50 p-4'>
                        <div className='flex items-center gap-2 text-sky-600'>
                            <CheckCircleOutlined />
                            <span className='text-xs font-semibold tracking-[0.18em] uppercase'>Nhóm cần chú ý</span>
                        </div>
                        <div className='mt-2 text-2xl font-bold text-sky-700'>{attentionMachines}</div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default DashboardOperationsCard;
