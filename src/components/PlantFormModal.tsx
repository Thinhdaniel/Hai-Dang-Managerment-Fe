import React, { useEffect, useMemo, useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { ClusterOutlined } from '@ant-design/icons';
import type { Plant } from '../core/types';

type PlantFormValues = {
    name: string;
    code: string;
    address?: string;
    phone?: string;
};

type PlantFormModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: PlantFormValues) => Promise<void>;
    initialValues?: Plant | null;
    plants: Plant[];
};

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');
const normalizeValue = (value?: string | null) => sanitizeValue(value).toLowerCase();

const PlantFormModal: React.FC<PlantFormModalProps> = ({ open, onClose, onSubmit, initialValues, plants }) => {
    const [form] = Form.useForm<PlantFormValues>();
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
                address: initialValues.address,
                phone: initialValues.phone,
            });
            return;
        }

        form.resetFields();
    }, [form, initialValues, open]);

    const existingNames = useMemo(
        () =>
            new Set(
                plants
                    .filter((plant) => plant.id !== initialValues?.id)
                    .map((plant) => normalizeValue(plant.name))
            ),
        [initialValues?.id, plants]
    );

    const existingCodes = useMemo(
        () =>
            new Set(
                plants
                    .filter((plant) => plant.id !== initialValues?.id)
                    .map((plant) => normalizeValue(plant.code))
            ),
        [initialValues?.id, plants]
    );

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const payload = {
            name: sanitizeValue(values.name),
            code: sanitizeValue(values.code),
            address: sanitizeValue(values.address) || undefined,
            phone: sanitizeValue(values.phone) || undefined,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload);
            message.success(initialValues ? 'Cập nhật cơ sở thành công' : 'Tạo cơ sở thành công');
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
                        <ClusterOutlined />
                    </div>
                    <span className='text-lg font-bold text-slate-800'>
                        {initialValues ? 'Chỉnh sửa cơ sở' : 'Thêm cơ sở'}
                    </span>
                </div>
            }
            okText={initialValues ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            width={620}
            destroyOnHidden
            maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <Form
                form={form}
                layout='vertical'
                className='mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg'
            >
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    <Form.Item
                        name='name'
                        label='Tên cơ sở'
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên cơ sở' },
                            {
                                validator: async (_, value?: string) => {
                                    const normalized = normalizeValue(value);
                                    if (existingNames.has(normalized)) {
                                        return Promise.reject(new Error('Tên cơ sở đã tồn tại'));
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <Input placeholder='Ví dụ: Nhà máy Bình Dương' size='large' maxLength={120} />
                    </Form.Item>

                    <Form.Item
                        name='code'
                        label='Mã cơ sở'
                        rules={[
                            { required: true, message: 'Vui lòng nhập mã cơ sở' },
                            {
                                validator: async (_, value?: string) => {
                                    const normalized = normalizeValue(value);
                                    if (existingCodes.has(normalized)) {
                                        return Promise.reject(new Error('Mã cơ sở đã tồn tại'));
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <Input placeholder='Ví dụ: BD-01' size='large' maxLength={40} />
                    </Form.Item>

                    <Form.Item name='address' label='Địa chỉ' className='md:col-span-2'>
                        <Input.TextArea
                            rows={3}
                            placeholder='Nhập địa chỉ cơ sở...'
                            maxLength={300}
                            showCount
                            className='!rounded-lg'
                        />
                    </Form.Item>

                    <Form.Item name='phone' label='Số điện thoại'>
                        <Input placeholder='Ví dụ: 0909123456' size='large' maxLength={20} />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
};

export default PlantFormModal;
