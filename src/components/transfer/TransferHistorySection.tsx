import { Button, Card, Empty, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import { CheckCircleOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Transfer } from '../../core/types';
import ConfirmAction from '../shared/ConfirmAction';
import TransferStatusBadge from './TransferStatusBadge';

const { Text } = Typography;

type TransferHistorySectionProps = {
    transfers: Transfer[];
    loading?: boolean;
    approvingTransferId?: string | null;
    completingTransferId?: string | null;
    onCreate?: () => void;
    onApprove?: (transfer: Transfer) => void;
    onComplete?: (transfer: Transfer) => void;
};

const formatDate = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');

const renderArea = (value?: string) => value || 'Chưa chỉ định khu vực';

const TransferHistorySection = ({
    transfers,
    loading,
    approvingTransferId,
    completingTransferId,
    onCreate,
    onApprove,
    onComplete,
}: TransferHistorySectionProps) => {
    const columns: TableColumnsType<Transfer> = [
        {
            title: 'NGÀY CHUYỂN',
            dataIndex: 'transferDate',
            key: 'transferDate',
            width: 140,
            render: (value: string) => <span className='font-semibold text-slate-800'>{formatDate(value)}</span>,
        },
        {
            title: 'LỘ TRÌNH',
            key: 'route',
            render: (_value, record) => (
                <div className='flex items-center gap-3'>
                    <div className='flex flex-col gap-0.5'>
                        <span className='text-[13px] font-semibold text-slate-700'>{record.fromPlant?.name || '-'}</span>
                        <span className='text-xs font-medium text-slate-500'>{renderArea(record.fromArea)}</span>
                    </div>
                    <div className='text-slate-300'>
                        <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M14 5l7 7m0 0l-7 7m7-7H3'
                            />
                        </svg>
                    </div>
                    <div className='flex flex-col gap-0.5'>
                        <span className='text-[13px] font-semibold text-slate-700'>{record.toPlant?.name || '-'}</span>
                        <span className='text-xs font-medium text-slate-500'>{renderArea(record.toArea)}</span>
                    </div>
                </div>
            ),
        },
        {
            title: 'LÝ DO',
            dataIndex: 'reason',
            key: 'reason',
            render: (value: string, record) => (
                <div className='flex flex-col gap-1'>
                    <span className='line-clamp-1 text-sm font-medium text-slate-700' title={value}>
                        {value}
                    </span>
                    {record.note ? (
                        <Text type='secondary' className='line-clamp-1 text-xs' title={record.note}>
                            {record.note}
                        </Text>
                    ) : null}
                    {record.rejectReason ? (
                        <span className='line-clamp-1 text-xs font-medium text-rose-600' title={record.rejectReason}>
                            {record.rejectReason}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (status) => <TransferStatusBadge status={status} />,
        },
    ];

    if (onApprove || onComplete) {
        columns.push({
            title: 'THAO TÁC',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    {record.status === 'pending' && onApprove ? (
                        <ConfirmAction
                            intent='warning'
                            title='Duyệt lệnh điều chuyển'
                            description='Xác nhận duyệt lệnh điều chuyển này?'
                            okLabel='Duyệt'
                            onConfirm={() => onApprove(record)}
                        >
                            <Tooltip title='Duyệt lệnh'>
                                <Button
                                    type='text'
                                    icon={<CheckOutlined />}
                                    loading={approvingTransferId === record.id}
                                    className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700'
                                />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                    {record.status === 'approved' && onComplete ? (
                        <ConfirmAction
                            intent='primary'
                            title='Hoàn tất điều chuyển'
                            description='Xác nhận hoàn tất và cập nhật vị trí thiết bị?'
                            okLabel='Hoàn tất'
                            onConfirm={() => onComplete(record)}
                        >
                            <Tooltip title='Hoàn tất điều chuyển'>
                                <Button
                                    type='text'
                                    icon={<CheckCircleOutlined />}
                                    loading={completingTransferId === record.id}
                                    className='flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700'
                                />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                </div>
            ),
        });
    }

    return (
        <Card
            title={<span className='font-bold text-slate-800'>Lịch sử điều chuyển</span>}
            bordered={false}
            className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
        >
            {transfers.length ? (
                <div className='[&_.ant-table-row]:group [&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
                    <Table<Transfer>
                        rowKey='id'
                        columns={columns}
                        dataSource={transfers}
                        loading={loading}
                        pagination={false}
                        scroll={{ x: 920 }}
                        size='small'
                    />
                </div>
            ) : (
                <Empty description='Chưa có lịch sử điều chuyển' />
            )}
        </Card>
    );
};

export default TransferHistorySection;
