import { Card, Empty, Skeleton, Tag } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import type { DashboardMislocatedAsset } from '../../core/types';

type DashboardMislocatedCardProps = {
    data?: DashboardMislocatedAsset[];
    loading?: boolean;
};

const DashboardMislocatedCard = ({ data, loading }: DashboardMislocatedCardProps) => {
    const navigate = useNavigate();
    const items = data ?? [];

    return (
        <Card
            variant='borderless'
            className='h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Máy lệch vị trí (GPS)</span>}
            extra={
                <Tag color={items.length > 0 ? 'orange' : 'green'} className='rounded-full px-2.5 py-0.5 text-xs font-semibold'>
                    {items.length} máy
                </Tag>
            }
        >
            {loading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : items.length === 0 ? (
                <Empty description='Không có máy lệch vị trí' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div className='flex flex-col gap-2'>
                    {items.map((item) => (
                        <button
                            key={item.assetId}
                            type='button'
                            onClick={() => navigate(`/assets/${item.assetId}`)}
                            className='flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:border-amber-300'
                        >
                            <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600'>
                                <EnvironmentOutlined />
                            </span>
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
                                <div className='mt-0.5 text-[11px] text-slate-600'>
                                    Hệ thống: <b>{item.officialPlantName || '—'}</b> → GPS:{' '}
                                    <b className='text-rose-600'>{item.actualPlantName || 'cơ sở khác'}</b>
                                    {typeof item.distanceM === 'number' ? ` (~${item.distanceM}m)` : ''}
                                </div>
                                {item.scannedAt ? (
                                    <div className='text-[11px] text-slate-400'>
                                        Quét {dayjs(item.scannedAt).format('DD/MM/YYYY HH:mm')}
                                    </div>
                                ) : null}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default DashboardMislocatedCard;
