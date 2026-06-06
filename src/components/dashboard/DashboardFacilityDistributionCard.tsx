import { Card, Empty, Table, Tooltip, type TableColumnsType } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import type { DashboardFacilityStat } from '../../core/types';

type DashboardFacilityDistributionCardProps = {
    facilityStats: DashboardFacilityStat[];
    loading?: boolean;
};

const columns: TableColumnsType<DashboardFacilityStat> = [
    {
        title: 'Cơ sở',
        dataIndex: 'facilityName',
        key: 'facilityName',
        render: (value: string, record) => (
            <div className='flex min-w-0 flex-col gap-1'>
                <div className='flex items-center gap-2'>
                    <span className='truncate text-[14px] font-semibold text-slate-800'>{value}</span>
                    <span className='rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500'>
                        {record.facilityCode}
                    </span>
                </div>
                <div className='flex items-center gap-1.5 text-xs text-slate-500'>
                    <EnvironmentOutlined className='text-[11px]' />
                    <Tooltip title={record.address || 'Không có địa chỉ'}>
                        <span className='truncate'>{record.address || 'Không có địa chỉ'}</span>
                    </Tooltip>
                </div>
            </div>
        ),
    },
    {
        title: 'Máy móc',
        dataIndex: 'machineCount',
        key: 'machineCount',
        width: 280,
        render: (value: number, record) => (
            <div className='flex min-w-[220px] items-center gap-3'>
                <span className='w-12 text-right text-sm font-bold text-slate-800'>{value}</span>
                <div className='h-2 flex-1 overflow-hidden rounded-full bg-slate-100'>
                    <div
                        className='h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400'
                        style={{ width: `${Math.max(record.sharePercent, value > 0 ? 6 : 0)}%` }}
                    />
                </div>
            </div>
        ),
    },
    {
        title: 'Tỷ lệ',
        dataIndex: 'sharePercent',
        key: 'sharePercent',
        width: 110,
        align: 'right',
        render: (value: number) => <span className='text-sm font-semibold text-slate-600'>{value.toFixed(1)}%</span>,
    },
];

const DashboardFacilityDistributionCard = ({ facilityStats, loading }: DashboardFacilityDistributionCardProps) => {
    return (
        <Card
            variant='borderless'
            className='h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm'
            title={<span className='text-base font-semibold text-slate-800'>Phân bố cơ sở</span>}
            extra={<span className='text-xs font-medium text-slate-500'>{facilityStats.length} cơ sở</span>}
        >
            {facilityStats.length === 0 && !loading ? (
                <Empty description='Không có dữ liệu cơ sở' image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <>
                    <div className='dashboard-facility-mobile-list'>
                        {facilityStats.map((facility) => (
                            <div key={facility.facilityId} className='dashboard-facility-mobile-item'>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-center gap-2'>
                                        <span className='truncate text-sm font-bold text-slate-900'>
                                            {facility.facilityName}
                                        </span>
                                        <span className='rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500'>
                                            {facility.facilityCode}
                                        </span>
                                    </div>
                                    <div className='mt-1 flex items-center gap-1.5 text-xs text-slate-500'>
                                        <EnvironmentOutlined className='text-[11px]' />
                                        <span className='truncate'>{facility.address || 'Không có địa chỉ'}</span>
                                    </div>
                                    <div className='mt-3 h-2 overflow-hidden rounded-full bg-slate-100'>
                                        <div
                                            className='h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400'
                                            style={{
                                                width: `${Math.max(
                                                    facility.sharePercent,
                                                    facility.machineCount > 0 ? 6 : 0
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className='shrink-0 text-right'>
                                    <div className='text-2xl font-bold text-slate-900'>{facility.machineCount}</div>
                                    <div className='text-[11px] font-semibold text-slate-500'>
                                        {facility.sharePercent.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className='dashboard-facility-table [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wide [&_.ant-table-thead_th]:!text-slate-500'>
                        <Table<DashboardFacilityStat>
                            rowKey='facilityId'
                            columns={columns}
                            dataSource={facilityStats}
                            loading={loading}
                            pagination={false}
                            scroll={{ x: 680 }}
                        />
                    </div>
                </>
            )}
        </Card>
    );
};

export default DashboardFacilityDistributionCard;
