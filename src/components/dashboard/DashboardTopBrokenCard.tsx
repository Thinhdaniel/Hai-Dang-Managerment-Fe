import { Card, Empty, Skeleton, Tooltip } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import type { DashboardTopBrokenAsset } from '../../core/types';

type DashboardTopBrokenCardProps = {
    data?: DashboardTopBrokenAsset[];
    loading?: boolean;
};

const DashboardTopBrokenCard = ({ data, loading }: DashboardTopBrokenCardProps) => {
    const navigate = useNavigate();
    const items = data ?? [];
    const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0);

    return (
        <Card
            variant='borderless'
            className='h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Máy hỏng nhiều nhất</span>}
            extra={<span className='text-xs font-medium text-slate-500'>Theo số lần bảo trì</span>}
        >
            {loading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : items.length === 0 ? (
                <Empty description='Chưa có dữ liệu bảo trì' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div className='flex flex-col gap-2.5'>
                    {items.map((item, index) => (
                        <button
                            key={item.assetId}
                            type='button'
                            onClick={() => navigate(`/assets/${item.assetId}`)}
                            className='group flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-slate-200 hover:bg-slate-50'
                        >
                            <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500'>
                                {index + 1}
                            </span>
                            <div className='min-w-0 flex-1'>
                                <div className='flex items-center gap-2'>
                                    <span className='truncate text-sm font-semibold text-slate-800 group-hover:text-blue-600'>
                                        {item.assetName || 'Máy chưa đặt tên'}
                                    </span>
                                    {item.machineCode ? (
                                        <span className='shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500'>
                                            {item.machineCode}
                                        </span>
                                    ) : null}
                                </div>
                                <div className='mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100'>
                                    <div
                                        className='h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400'
                                        style={{ width: `${maxCount > 0 ? Math.max(8, (item.count / maxCount) * 100) : 0}%` }}
                                    />
                                </div>
                                <div className='mt-1 flex items-center gap-2 text-[11px] text-slate-400'>
                                    <span>{item.plantName || 'Chưa rõ cơ sở'}</span>
                                    {item.lastDate ? <span>· Gần nhất {dayjs(item.lastDate).format('DD/MM/YYYY')}</span> : null}
                                </div>
                            </div>
                            <Tooltip title='Số lần bảo trì'>
                                <span className='flex shrink-0 items-center gap-1 text-sm font-bold text-amber-600'>
                                    <ToolOutlined className='text-xs' />
                                    {item.count}
                                </span>
                            </Tooltip>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default DashboardTopBrokenCard;
