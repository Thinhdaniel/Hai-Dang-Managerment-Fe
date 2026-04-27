import React from 'react';
import { App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import TransactionForm from '../components/transactions/TransactionForm';
import { assetService } from '../core/services/asset.service';
import { borrowingService } from '../core/services/borrowing.service';
import type { CreateBorrowingPayload } from '../core/types';

const BorrowingCreate: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { message } = App.useApp();

    const initialAssetId = searchParams.get('assetId') || undefined;

    const { data: assetResponse } = useQuery({
        queryKey: ['assets', 'transaction-form'],
        queryFn: () => assetService.getAll({ page: 1, limit: 500 }),
    });

    const createMutation = useMutation({
        mutationFn: borrowingService.create,
    });

    const handleSubmit = async (payload: CreateBorrowingPayload) => {
        const created = await createMutation.mutateAsync(payload);
        message.success('Đã tạo giao dịch thiết bị');
        navigate(`/borrowings/${created.id}`);
    };

    return (
        <div className='flex flex-col gap-6'>
            <PageHeader
                title='Tạo Giao Dịch Thiết Bị'
                subtitle='Khởi tạo mượn nội bộ, mượn ngoài hoặc thuê máy trong cùng một form thống nhất.'
                actions={
                    <button
                        type='button'
                        onClick={() => navigate('/borrowings')}
                        className='inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900'
                    >
                        <ArrowLeftOutlined />
                        Quay lại danh sách
                    </button>
                }
            />

            <section className='rounded-xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-emerald-50 p-5 shadow-sm'>
                <div className='flex flex-col gap-2'>
                    <div className='text-xs font-bold tracking-[0.18em] text-slate-500 uppercase'>Borrow / Return</div>
                    <p className='max-w-3xl text-sm text-slate-600'>
                        Mượn nội bộ dùng nhập tay tên công nhân, mượn ngoài dùng tên đối tác, còn thuê máy bắt buộc có
                        chi phí.
                    </p>
                </div>
            </section>

            <section className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
                <TransactionForm
                    assets={assetResponse?.data ?? []}
                    initialAssetId={initialAssetId}
                    submitting={createMutation.isPending}
                    onSubmit={handleSubmit}
                    submitLabel='Tạo giao dịch'
                />
            </section>
        </div>
    );
};

export default BorrowingCreate;
