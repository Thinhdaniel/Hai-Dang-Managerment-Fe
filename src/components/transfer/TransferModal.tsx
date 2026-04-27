import { useEffect } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Typography } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Asset, CreateTransferPayload, Plant } from '../../core/types';

const { Text } = Typography;
const { TextArea } = Input;

type TransferModalFormValues = {
    toPlantId: string;
    toArea?: string;
    reason: string;
    transferDate: dayjs.Dayjs;
    note?: string;
};

type TransferModalProps = {
    open: boolean;
    asset: Asset | null;
    plants: Plant[];
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (payload: CreateTransferPayload) => Promise<void> | void;
};

const TransferModal = ({ open, asset, plants, submitting, onClose, onSubmit }: TransferModalProps) => {
    const [form] = Form.useForm<TransferModalFormValues>();

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }

        form.setFieldsValue({
            toPlantId: asset?.plantId,
            toArea: asset?.area,
            transferDate: dayjs(),
            reason: '',
            note: '',
        });
    }, [asset, form, open]);

    const handleFinish = async (values: TransferModalFormValues) => {
        if (!asset) {
            return;
        }

        await onSubmit({
            assetId: asset.id,
            toPlantId: values.toPlantId,
            toArea: values.toArea?.trim() || undefined,
            reason: values.reason.trim(),
            transferDate: values.transferDate.toISOString(),
            note: values.note?.trim() || undefined,
        });

        form.resetFields();
    };

    return (
        <Modal
            open={open}
            title={
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <SwapOutlined />
                    </div>
                    <span className="text-lg font-bold text-slate-800">Điều chuyển thiết bị</span>
                </div>
            }
            onCancel={onClose}
            width={720}
            maskClosable={false}
            destroyOnHidden
            className="[&_.ant-modal-content]:p-6 [&_.ant-modal-content]:rounded-2xl"
            footer={[
                <Button key='cancel' onClick={onClose} className="rounded-lg">
                    Hủy
                </Button>,
                <Button key='submit' type='primary' loading={submitting} onClick={() => form.submit()} className="rounded-lg bg-blue-600 font-medium shadow-sm hover:bg-blue-700">
                    Tạo lệnh điều chuyển
                </Button>,
            ]}
        >
            {asset ? (
                <div className='mb-5 mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4'>
                    <div className='flex flex-wrap items-center gap-2 text-sm text-slate-600'>
                        <span className='font-semibold text-slate-800'>{asset.name}</span>
                        <span className='rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700'>
                            {asset.machineCode}
                        </span>
                    </div>
                    <div className='mt-2 grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <div>
                            <Text type='secondary'>Cơ sở hiện tại</Text>
                            <div className='font-medium text-slate-800'>{asset.plant?.name || '-'}</div>
                        </div>
                        <div>
                            <Text type='secondary'>Khu vực hiện tại</Text>
                            <div className='font-medium text-slate-800'>{asset.area || '-'}</div>
                        </div>
                    </div>
                </div>
            ) : null}

            <Form 
                form={form} 
                layout='vertical' 
                onFinish={handleFinish}
                className="mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-form-item-label_label]:text-slate-600 [&_.ant-form-item-label_label]:font-medium [&_.ant-input]:rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-picker]:rounded-lg"
            >
                <div>
                    <div className="mb-3 text-sm font-bold tracking-wide text-slate-800">ĐIỂM ĐẾN</div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <Form.Item
                            label='Cơ sở đến'
                            name='toPlantId'
                            rules={[{ required: true, message: 'Vui lòng chọn cơ sở đến' }]}
                        >
                            <Select
                                placeholder='Chọn cơ sở đến'
                                size="large"
                                showSearch
                                optionFilterProp="label"
                                options={plants.map((plant) => ({
                                    value: plant.id,
                                    label: plant.name,
                                }))}
                            />
                        </Form.Item>

                        <Form.Item label='Khu vực đến' name='toArea'>
                            <Input placeholder='Ví dụ: Chuyền 2, khu cắt, kho trung tâm...' size="large" />
                        </Form.Item>
                    </div>
                </div>

                <div className="h-px bg-slate-100"></div>

                <div>
                    <div className="mb-3 text-sm font-bold tracking-wide text-slate-800">CHI TIẾT ĐIỀU CHUYỂN</div>
                    <div className="grid grid-cols-1 gap-4">
                        <Form.Item
                            label='Ngày điều chuyển'
                            name='transferDate'
                            rules={[{ required: true, message: 'Vui lòng chọn ngày điều chuyển' }]}
                            className="md:w-1/2 md:pr-2"
                        >
                            <DatePicker className='w-full' format='DD/MM/YYYY' size="large" />
                        </Form.Item>

                        <Form.Item
                            label='Lý do điều chuyển'
                            name='reason'
                            rules={[{ required: true, message: 'Vui lòng nhập lý do điều chuyển' }]}
                        >
                            <TextArea rows={3} placeholder='Mô tả lý do điều chuyển để bộ phận vận hành theo dõi' className="!rounded-lg" />
                        </Form.Item>

                        <Form.Item label='Ghi chú' name='note'>
                            <TextArea rows={2} placeholder='Thông tin bàn giao, yêu cầu lắp đặt, người nhận...' className="!rounded-lg" />
                        </Form.Item>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default TransferModal;
