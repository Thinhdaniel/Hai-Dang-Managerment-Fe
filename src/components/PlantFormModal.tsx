import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Tooltip } from 'antd';
import { AimOutlined, ClusterOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { Plant } from '../core/types';
import { getCurrentCoords, parseCoordsFromText } from '../core/lib/geolocation';

type PlantFormValues = {
    name: string;
    code: string;
    address?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
};

type PlantSubmitValues = {
    name: string;
    code: string;
    address?: string;
    phone?: string;
    coordinates?: { lat: number; lng: number } | null;
};

type PlantFormModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: PlantSubmitValues) => Promise<void>;
    initialValues?: Plant | null;
    plants: Plant[];
};

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');
const normalizeValue = (value?: string | null) => sanitizeValue(value).toLowerCase();

const PlantFormModal: React.FC<PlantFormModalProps> = ({ open, onClose, onSubmit, initialValues, plants }) => {
    const [form] = Form.useForm<PlantFormValues>();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = useState(false);
    const [locating, setLocating] = useState(false);

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
                lat: initialValues.coordinates?.lat ?? null,
                lng: initialValues.coordinates?.lng ?? null,
            });
            return;
        }

        form.resetFields();
    }, [form, initialValues, open]);

    const handleUseCurrentLocation = async () => {
        setLocating(true);
        try {
            const fix = await getCurrentCoords(0); // 0 -> luon lay fix moi
            if (!fix) {
                message.warning('Không lấy được vị trí. Hãy cho phép định vị trên trình duyệt rồi thử lại.');
                return;
            }
            form.setFieldsValue({ lat: Number(fix.lat.toFixed(6)), lng: Number(fix.lng.toFixed(6)) });
            message.success(`Đã lấy vị trí hiện tại${fix.accuracy ? ` (±${fix.accuracy}m)` : ''}`);
        } finally {
            setLocating(false);
        }
    };

    const handlePasteMapsLink = (text: string) => {
        const coords = parseCoordsFromText(text);
        if (coords) {
            form.setFieldsValue({ lat: Number(coords.lat.toFixed(6)), lng: Number(coords.lng.toFixed(6)) });
            message.success('Đã tách toạ độ từ liên kết');
        } else {
            message.warning('Không tìm thấy toạ độ trong nội dung dán');
        }
    };

    const existingNames = useMemo(
        () =>
            new Set(
                plants.filter((plant) => plant.id !== initialValues?.id).map((plant) => normalizeValue(plant.name))
            ),
        [initialValues?.id, plants]
    );

    const existingCodes = useMemo(
        () =>
            new Set(
                plants.filter((plant) => plant.id !== initialValues?.id).map((plant) => normalizeValue(plant.code))
            ),
        [initialValues?.id, plants]
    );

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const hasLat = typeof values.lat === 'number' && Number.isFinite(values.lat);
        const hasLng = typeof values.lng === 'number' && Number.isFinite(values.lng);
        // Ca 2 co -> luu toa do; ca 2 trong -> xoa toa do (null); le 1 o -> bao loi
        if (hasLat !== hasLng) {
            message.error('Cần nhập đủ cả Vĩ độ và Kinh độ (hoặc để trống cả hai)');
            return;
        }
        const payload: PlantSubmitValues = {
            name: sanitizeValue(values.name),
            code: sanitizeValue(values.code),
            address: sanitizeValue(values.address) || undefined,
            phone: sanitizeValue(values.phone) || undefined,
            coordinates: hasLat && hasLng ? { lat: values.lat as number, lng: values.lng as number } : null,
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
                        <Input placeholder='Ví dụ: Nhà máy May Phú Sơn' size='large' maxLength={120} />
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

                {/* Toạ độ định vị: dùng để suy ra "máy đang gần cơ sở nào nhất" khi quét QR */}
                <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                    <div className='mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700'>
                        <EnvironmentOutlined className='text-blue-500' /> Toạ độ định vị
                        <span className='text-xs font-normal text-slate-400'>(không bắt buộc)</span>
                    </div>
                    <p className='mb-3 text-xs text-slate-400'>
                        Đứng tại cơ sở bấm “Lấy vị trí hiện tại”, hoặc dán liên kết Google Maps. Toạ độ này giúp hệ
                        thống tự nhận biết máy đang ở cơ sở nào khi nhân viên quét QR.
                    </p>

                    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                        <Form.Item name='lat' label='Vĩ độ (latitude)' className='!mb-0'>
                            <InputNumber
                                className='w-full'
                                size='large'
                                placeholder='Ví dụ: 10.762622'
                                min={-90}
                                max={90}
                                step={0.000001}
                                stringMode
                            />
                        </Form.Item>
                        <Form.Item name='lng' label='Kinh độ (longitude)' className='!mb-0'>
                            <InputNumber
                                className='w-full'
                                size='large'
                                placeholder='Ví dụ: 106.660172'
                                min={-180}
                                max={180}
                                step={0.000001}
                                stringMode
                            />
                        </Form.Item>
                    </div>

                    <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
                        <Button
                            icon={<AimOutlined />}
                            loading={locating}
                            onClick={handleUseCurrentLocation}
                            className='sm:w-auto'
                            block
                        >
                            Lấy vị trí hiện tại của tôi
                        </Button>
                        <Tooltip title='Dán liên kết Google Maps hoặc "vĩ độ, kinh độ"'>
                            <Input.Search
                                allowClear
                                enterButton='Tách toạ độ'
                                placeholder='Dán link Google Maps...'
                                onSearch={handlePasteMapsLink}
                                className='flex-1'
                            />
                        </Tooltip>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default PlantFormModal;
