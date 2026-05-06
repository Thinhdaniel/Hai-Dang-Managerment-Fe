import React, { useEffect, useMemo, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Switch } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import type { Material, MaterialPayload } from '../core/services/material.service';

type MaterialFormValues = {
    name: string;
    code: string;
    category?: string;
    unit: string;
    minStockLevel?: number;
    description?: string;
    isActive?: boolean;
};

type MaterialFormModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: MaterialPayload) => Promise<void>;
    initialValues?: Material | null;
};

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');
const normalizeCodeValue = (value?: string | null) => sanitizeValue(value).toUpperCase();

const MaterialFormModal: React.FC<MaterialFormModalProps> = ({ open, onClose, onSubmit, initialValues }) => {
    const [form] = Form.useForm<MaterialFormValues>();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        if (initialValues) {
            form.setFieldsValue({
                name: initialValues.name,
                code: initialValues.code,
                category: initialValues.category,
                unit: initialValues.unit,
                minStockLevel: initialValues.minStockLevel ?? 0,
                description: initialValues.description,
                isActive: initialValues.isActive,
            });
            return;
        }

        form.resetFields();
        form.setFieldsValue({
            minStockLevel: 0,
            isActive: true,
        });
    }, [form, initialValues, open]);

    const isEditMode = useMemo(() => Boolean(initialValues), [initialValues]);

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const payload: MaterialPayload = {
            name: sanitizeValue(values.name),
            code: normalizeCodeValue(values.code),
            category: sanitizeValue(values.category) || undefined,
            unit: sanitizeValue(values.unit),
            minStockLevel: values.minStockLevel ?? 0,
            description: sanitizeValue(values.description) || undefined,
            isActive: values.isActive !== false,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload);
            message.success(isEditMode ? 'Cập nhật vật tư thành công' : 'Tạo vật tư thành công');
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onOk={handleSubmit}
            confirmLoading={submitting}
            title={
                <div className='flex items-center gap-2 border-b border-slate-100 pb-2'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600'>
                        <DatabaseOutlined />
                    </div>
                    <span className='text-lg font-bold text-slate-800'>
                        {isEditMode ? 'Chỉnh sửa vật tư' : 'Thêm vật tư'}
                    </span>
                </div>
            }
            okText={isEditMode ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            width={680}
            destroyOnHidden
            maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <Form
                form={form}
                layout='vertical'
                initialValues={{
                    minStockLevel: 0,
                    isActive: true,
                }}
                className='mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg [&_.ant-input-affix-wrapper]:rounded-lg [&_.ant-input-number]:!rounded-lg [&_.ant-input-number-input]:text-sm [&_.ant-switch]:bg-slate-300'
            >
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    <Form.Item
                        name='name'
                        label='Tên vật tư'
                        rules={[{ required: true, message: 'Vui lòng nhập tên vật tư' }]}
                    >
                        <Input placeholder='Ví dụ: Dầu máy Juki' size='large' maxLength={160} />
                    </Form.Item>

                    <Form.Item
                        name='code'
                        label='Mã vật tư'
                        getValueFromEvent={(event) => normalizeCodeValue(event?.target?.value)}
                        rules={[{ required: true, message: 'Vui lòng nhập mã vật tư' }]}
                    >
                        <Input placeholder='Ví dụ: OIL-JUKI-01' size='large' maxLength={60} />
                    </Form.Item>

                    <Form.Item name='category' label='Nhóm / Category'>
                        <Input placeholder='Ví dụ: Dầu nhớt' size='large' maxLength={120} />
                    </Form.Item>

                    <Form.Item
                        name='unit'
                        label='Đơn vị tính'
                        rules={[{ required: true, message: 'Vui lòng nhập đơn vị tính' }]}
                    >
                        <Input placeholder='Ví dụ: Chai, Cuộn, Cái' size='large' maxLength={60} />
                    </Form.Item>

                    <Form.Item name='minStockLevel' label='Ngưỡng tồn kho tối thiểu'>
                        <InputNumber<number>
                            min={0}
                            className='w-full'
                            size='large'
                            formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => Number(String(value ?? '').replace(/,/g, ''))}
                        />
                    </Form.Item>

                    <Form.Item
                        name='isActive'
                        label='Trạng thái'
                        valuePropName='checked'
                        className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'
                    >
                        <Switch checkedChildren='Hoạt động' unCheckedChildren='Ngừng' />
                    </Form.Item>

                    <Form.Item name='description' label='Mô tả' className='md:col-span-2'>
                        <Input.TextArea
                            rows={4}
                            placeholder='Nhập mô tả hoặc ghi chú thêm cho vật tư...'
                            maxLength={500}
                            showCount
                            className='!rounded-lg'
                        />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
};

export default MaterialFormModal;
