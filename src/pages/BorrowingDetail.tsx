import React, { lazy, useMemo, useState } from 'react';
import { App, Button, Card, Descriptions, Empty, Space, Spin, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined, RollbackOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import AppBreadcrumb from '../components/navigation/AppBreadcrumb';
import LazyBoundary from '../components/shared/LazyBoundary';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import TransactionTypeBadge from '../components/transactions/TransactionTypeBadge';
import { borrowingService } from '../core/services/borrowing.service';

const ReturnTransactionModal = lazy(() => import('../components/transactions/ReturnTransactionModal'));

const { Title, Text } = Typography;

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : 'Chưa cập nhật');

const BorrowingDetail: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { id = '' } = useParams();
    const { message } = App.useApp();

    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

    const { data: transaction, isLoading } = useQuery({
        queryKey: ['borrowing', id],
        queryFn: () => borrowingService.getById(id),
        enabled: Boolean(id),
    });

    const returnMutation = useMutation({
        mutationFn: ({ returnTime, note }: { returnTime: string; note?: string }) =>
            borrowingService.returnAsset(id, returnTime, note),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['borrowing', id] });
            queryClient.invalidateQueries({ queryKey: ['borrowings'] });
            queryClient.invalidateQueries({ queryKey: ['borrowings', 'asset'] });
            queryClient.invalidateQueries({ queryKey: ['asset', transaction?.assetId] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });

    const timelineItems = useMemo(() => {
        if (!transaction) {
            return [];
        }

        return [
            {
                color: 'blue',
                children: (
                    <div className='pb-4'>
                        <div className='font-semibold text-slate-800'>Khởi tạo giao dịch</div>
                        <div className='text-sm text-slate-500'>{formatDateTime(transaction.createdAt)}</div>
                    </div>
                ),
            },
            {
                color: 'gold',
                children: (
                    <div className='pb-4'>
                        <div className='font-semibold text-slate-800'>Thiết bị bắt đầu sử dụng</div>
                        <div className='text-sm text-slate-500'>{formatDateTime(transaction.borrowTime)}</div>
                    </div>
                ),
            },
            ...(transaction.returnTime
                ? [
                      {
                          color: 'green',
                          children: (
                              <div className='pb-4'>
                                  <div className='font-semibold text-slate-800'>Thiết bị đã được trả</div>
                                  <div className='text-sm text-slate-500'>{formatDateTime(transaction.returnTime)}</div>
                                  {transaction.returnNote ? (
                                      <div className='mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600'>
                                          {transaction.returnNote}
                                      </div>
                                  ) : null}
                              </div>
                          ),
                      },
                  ]
                : [
                      {
                          color: 'gray',
                          children: (
                              <div className='pb-4'>
                                  <div className='font-semibold text-slate-800'>Đang hoạt động</div>
                                  <div className='text-sm text-slate-500'>Thiết bị chưa được xác nhận trả.</div>
                              </div>
                          ),
                      },
                  ]),
        ];
    }, [transaction]);

    const handleReturn = async ({ returnTime, note }: { returnTime: string; note?: string }) => {
        await returnMutation.mutateAsync({ returnTime, note });
        message.success('Đã xác nhận trả thiết bị');
        setIsReturnModalOpen(false);
    };

    if (isLoading) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <Spin size='large' />
            </div>
        );
    }

    if (!transaction) {
        return <Empty description='Không tìm thấy giao dịch thiết bị' />;
    }

    return (
        <div className='flex flex-col gap-6'>
            <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-col gap-6 p-6 md:p-8'>
                    <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                        <div className='flex min-w-0 flex-col gap-3'>
                            <AppBreadcrumb />
                            <div className='flex flex-wrap items-center gap-3'>
                                <Button
                                    icon={<ArrowLeftOutlined />}
                                    onClick={() => navigate('/borrowings')}
                                    className='rounded-lg border-slate-300 text-slate-600'
                                >
                                    Quay lại
                                </Button>
                                <Title level={2} className='!m-0 !text-2xl font-bold text-slate-800'>
                                    {transaction.asset?.name || 'Giao dịch thiết bị'}
                                </Title>
                                <TransactionTypeBadge type={transaction.type} />
                                <TransactionStatusBadge status={transaction.status} />
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <span className='rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700'>
                                    {transaction.asset?.machineCode || '-'}
                                </span>
                                <span className='rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600'>
                                    Bắt đầu: {formatDateTime(transaction.borrowTime)}
                                </span>
                            </div>
                        </div>

                        <Space wrap size={12}>
                            <Button
                                onClick={() => navigate(`/assets/${transaction.assetId}`)}
                                className='rounded-lg border-slate-300 text-slate-700'
                            >
                                Xem thiết bị
                            </Button>
                            <Button
                                type='primary'
                                icon={<RollbackOutlined />}
                                disabled={transaction.status !== 'active'}
                                onClick={() => setIsReturnModalOpen(true)}
                                className='rounded-lg border-none bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300'
                            >
                                Xác nhận trả
                            </Button>
                        </Space>
                    </div>
                </div>

                <div className='grid grid-cols-1 border-t border-slate-100 bg-slate-50/50 md:grid-cols-3'>
                    <div className='border-b border-slate-100 p-6 md:border-r md:border-b-0'>
                        <div className='text-sm font-medium text-slate-500'>Người mượn / đối tác</div>
                        <div className='mt-2 text-xl font-bold text-slate-800'>
                            {transaction.borrowerName || transaction.partnerName || '-'}
                        </div>
                    </div>
                    <div className='border-b border-slate-100 p-6 md:border-r md:border-b-0'>
                        <div className='text-sm font-medium text-slate-500'>Vị trí sử dụng</div>
                        <div className='mt-2 text-xl font-bold text-slate-800'>{transaction.location || '-'}</div>
                    </div>
                    <div className='p-6'>
                        <div className='text-sm font-medium text-slate-500'>Chi phí</div>
                        <div className='mt-2 text-xl font-bold text-slate-800'>
                            {transaction.cost != null ? `${transaction.cost.toLocaleString('vi-VN')} VND` : '-'}
                        </div>
                    </div>
                </div>
            </section>

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
                <div className='xl:col-span-2'>
                    <Card
                        title={<span className='font-bold text-slate-800'>Thông tin giao dịch</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        <Descriptions
                            column={{ xs: 1, md: 2 }}
                            layout='vertical'
                            className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800 [&_.ant-descriptions-item-label]:font-medium [&_.ant-descriptions-item-label]:text-slate-500'
                        >
                            <Descriptions.Item label='Loại giao dịch'>
                                <TransactionTypeBadge type={transaction.type} />
                            </Descriptions.Item>
                            <Descriptions.Item label='Trạng thái'>
                                <TransactionStatusBadge status={transaction.status} />
                            </Descriptions.Item>
                            <Descriptions.Item label='Thiết bị'>{transaction.asset?.name || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Mã máy'>
                                {transaction.asset?.machineCode || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label='Người mượn / đối tác'>
                                {transaction.borrowerName || transaction.partnerName || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label='Thời gian bắt đầu'>
                                {formatDateTime(transaction.borrowTime)}
                            </Descriptions.Item>
                            <Descriptions.Item label='Vị trí sử dụng'>{transaction.location || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Mục đích'>{transaction.purpose || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Chi phí'>
                                {transaction.cost != null ? `${transaction.cost.toLocaleString('vi-VN')} VND` : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label='Thời gian trả'>
                                {transaction.returnTime ? formatDateTime(transaction.returnTime) : 'Chưa trả'}
                            </Descriptions.Item>
                        </Descriptions>

                        <div className='mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                            <div className='text-sm font-semibold text-slate-800'>Ghi chú giao dịch</div>
                            <div className='mt-2 text-sm text-slate-600'>
                                {transaction.note || 'Không có ghi chú bổ sung.'}
                            </div>
                        </div>
                    </Card>
                </div>

                <div className='flex flex-col gap-6'>
                    <Card
                        title={<span className='font-bold text-slate-800'>Timeline</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        <Timeline items={timelineItems} />
                    </Card>

                    <Card
                        title={<span className='font-bold text-slate-800'>Thông tin nhanh</span>}
                        bordered={false}
                        className='rounded-2xl border border-slate-200 shadow-sm [&_.ant-card-head]:border-b-slate-100'
                    >
                        <div className='flex flex-col gap-3 text-sm'>
                            <div>
                                <Text type='secondary'>Cơ sở hiện tại</Text>
                                <div className='font-medium text-slate-800'>
                                    {transaction.asset?.plant?.name || '-'}
                                </div>
                            </div>
                            <div>
                                <Text type='secondary'>Khu vực hiện tại</Text>
                                <div className='font-medium text-slate-800'>{transaction.asset?.area || '-'}</div>
                            </div>
                            <div>
                                <Text type='secondary'>Serial</Text>
                                <div className='font-medium text-slate-800'>{transaction.asset?.serial || '-'}</div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {isReturnModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <ReturnTransactionModal
                        open={isReturnModalOpen}
                        transaction={transaction}
                        submitting={returnMutation.isPending}
                        onClose={() => setIsReturnModalOpen(false)}
                        onSubmit={handleReturn}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default BorrowingDetail;
