import { Card, Empty, Skeleton, Tag } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { DashboardInsights } from '../../core/types';

type DashboardOverdueCardProps = {
    data?: DashboardInsights['overdue'];
    loading?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
    pending: 'Chờ xử lý',
    in_progress: 'Đang xử lý',
    overdue: 'Quá hạn',
};

const severityClass = (days: number) =>
    days >= 30
        ? 'border-red-200 bg-red-50 hover:border-red-300'
        : days >= 14
          ? 'border-amber-200 bg-amber-50 hover:border-amber-300'
          : 'border-slate-200 bg-white hover:border-slate-300';

const daysColor = (days: number) => (days >= 30 ? 'text-red-600' : days >= 14 ? 'text-amber-600' : 'text-slate-600');

const DashboardOverdueCard = ({ data, loading }: DashboardOverdueCardProps) => {
    const navigate = useNavigate();
    const items = data?.items ?? [];
    const count = data?.count ?? 0;
    const thresholdDays = data?.thresholdDays ?? 7;

    return (
        <Card
            variant='borderless'
            className='h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Phiếu bảo trì tồn đọng</span>}
            extra={
                <Tag color={count > 0 ? 'red' : 'green'} className='rounded-full px-2.5 py-0.5 text-xs font-semibold'>
                    {count} phiếu &gt; {thresholdDays} ngày
                </Tag>
            }
        >
            {loading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : items.length === 0 ? (
                <Empty description='Không có phiếu tồn đọng 🎉' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div className='flex flex-col gap-2'>
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type='button'
                            onClick={() => navigate('/maintenances')}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${severityClass(item.daysOpen)}`}
                        >
                            <div className='min-w-0 flex-1'>
                                <div className='flex items-center gap-2'>
                                    <span className='truncate text-sm font-semibold text-slate-800'>
                                        {item.assetName || 'Máy chưa đặt tên'}
                                    </span>
                                    {item.machineCode ? (
                                        <span className='shrink-0 rounded-full bg-white/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500'>
                                            {item.machineCode}
                                        </span>
                                    ) : null}
                                </div>
                                <div className='mt-0.5 flex items-center gap-2 text-[11px] text-slate-500'>
                                    <span>{STATUS_LABEL[item.status] ?? item.status}</span>
                                    <span>· {item.repairMode === 'external' ? 'Sửa ngoài' : 'Sửa nội bộ'}</span>
                                    {item.plantName ? <span>· {item.plantName}</span> : null}
                                </div>
                            </div>
                            <span className={`flex shrink-0 items-center gap-1 text-sm font-bold ${daysColor(item.daysOpen)}`}>
                                <ClockCircleOutlined className='text-xs' />
                                {item.daysOpen} ngày
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default DashboardOverdueCard;
