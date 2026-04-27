import React, { useEffect, useMemo, useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { TagsOutlined } from '@ant-design/icons';
import type { Brand } from '../core/types';

type BrandFormValues = {
    name: string;
    description?: string;
};

interface BrandFormModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: BrandFormValues) => Promise<void>;
    initialValues?: Brand | null;
    brands: Brand[];
}

const normalizeBrandName = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const BrandFormModal: React.FC<BrandFormModalProps> = ({ open, onClose, onSubmit, initialValues, brands }) => {
    const [form] = Form.useForm<BrandFormValues>();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;

        if (initialValues) {
            form.setFieldsValue({
                name: initialValues.name,
                description: initialValues.description,
            });
            return;
        }

        form.resetFields();
    }, [open, initialValues, form]);

    const existingNames = useMemo(
        () =>
            new Set(
                brands
                    .filter((brand) => brand.id !== initialValues?.id)
                    .map((brand) => normalizeBrandName(brand.name))
                    .filter(Boolean)
            ),
        [brands, initialValues?.id]
    );

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const payload = {
                name: values.name.trim().replace(/\s+/g, ' '),
                description: values.description?.trim().replace(/\s+/g, ' ') || undefined,
            };

            setSubmitting(true);
            await onSubmit(payload);
            message.success(initialValues ? 'Cập nhật nhãn hiệu thành công' : 'Tạo nhãn hiệu thành công');
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
                        <TagsOutlined />
                    </div>
                    <span className='text-lg font-bold text-slate-800'>
                        {initialValues ? 'Chỉnh sửa nhãn hiệu' : 'Thêm nhãn hiệu'}
                    </span>
                </div>
            }
            okText={initialValues ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            width={560}
            destroyOnHidden
            maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <Form
                form={form}
                layout='vertical'
                className='mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg'
            >
                <Form.Item
                    name='name'
                    label='Tên nhãn hiệu'
                    rules={[
                        { required: true, message: 'Vui lòng nhập tên nhãn hiệu' },
                        {
                            validator: async (_, value?: string) => {
                                const normalized = normalizeBrandName(value);
                                if (!normalized) {
                                    return Promise.reject(new Error('Vui lòng nhập tên nhãn hiệu'));
                                }
                                if (existingNames.has(normalized)) {
                                    return Promise.reject(new Error('Tên nhãn hiệu đã tồn tại'));
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <Input placeholder='Ví dụ: Juki' size='large' maxLength={120} />
                </Form.Item>

                <Form.Item name='description' label='Mô tả'>
                    <Input.TextArea
                        rows={4}
                        placeholder='Mô tả ngắn về nhãn hiệu máy...'
                        className='!rounded-lg'
                        maxLength={500}
                        showCount
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default BrandFormModal;
