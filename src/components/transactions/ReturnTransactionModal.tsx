import { useEffect } from 'react';
import { Button, DatePicker, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import type { Borrowing } from '../../core/types';
import TransactionTypeBadge from './TransactionTypeBadge';

type ReturnTransactionFormValues = {
    returnTime: dayjs.Dayjs;
    note?: string;
};

type ReturnTransactionModalProps = {
    open: boolean;
    transaction?: Borrowing | null;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (payload: { returnTime: string; note?: string }) => Promise<void> | void;
};

const ReturnTransactionModal = ({ open, transaction, submitting, onClose, onSubmit }: ReturnTransactionModalProps) => {
    const [form] = Form.useForm<ReturnTransactionFormValues>();

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }

        form.setFieldsValue({
            returnTime: dayjs(),
            note: '',
        });
    }, [form, open]);

    const handleFinish = async (values: ReturnTransactionFormValues) => {
        await onSubmit({
            returnTime: values.returnTime.toISOString(),
            note: values.note?.trim() || undefined,
        });
    };

    return (
        <Modal
            open={open}
            title='Xác nhận trả thiết bị'
            onCancel={onClose}
            width={640}
            footer={[
                <Button key='cancel' onClick={onClose}>
                    Hủy
                </Button>,
                <Button key='submit' type='primary' loading={submitting} onClick={() => form.submit()}>
                    Xác nhận trả
                </Button>,
            ]}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            {transaction ? (
                <div className='mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <span className='text-sm font-semibold text-slate-800'>{transaction.asset?.name || '-'}</span>
                        <span className='rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-[11px] font-semibold text-blue-700'>
                            {transaction.asset?.machineCode || transaction.assetId}
                        </span>
                        <TransactionTypeBadge type={transaction.type} />
                    </div>
                    <div className='mt-3 grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-2'>
                        <div>
                            <div className='text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                                Người mượn / đối tác
                            </div>
                            <div className='mt-1 font-medium text-slate-800'>
                                {transaction.borrowerName || transaction.partnerName || 'Chưa xác định'}
                            </div>
                        </div>
                        <div>
                            <div className='text-xs font-semibold tracking-wide text-slate-500 uppercase'>Bắt đầu</div>
                            <div className='mt-1 font-medium text-slate-800'>
                                {dayjs(transaction.borrowTime).format('DD/MM/YYYY HH:mm')}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <Form
                form={form}
                layout='vertical'
                onFinish={handleFinish}
                className='[&_.ant-form-item-label>label]:font-semibold [&_.ant-form-item-label>label]:text-slate-700 [&_.ant-input]:rounded-lg [&_.ant-picker]:rounded-lg'
            >
                <Form.Item
                    label='Thời gian trả'
                    name='returnTime'
                    rules={[{ required: true, message: 'Vui lòng chọn thời gian trả' }]}
                >
                    <DatePicker showTime className='w-full' format='DD/MM/YYYY HH:mm' size='large' />
                </Form.Item>

                <Form.Item label='Ghi chú bàn giao' name='note' className='!mb-0'>
                    <Input.TextArea
                        rows={4}
                        placeholder='Thông tin nghiệm thu, bàn giao lại, tình trạng thiết bị khi trả...'
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default ReturnTransactionModal;
