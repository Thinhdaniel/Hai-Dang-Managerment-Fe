import React, { useEffect, useMemo } from 'react';
import { App, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import {
    AppstoreOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    NumberOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { AssetStatus } from '../core/types';
import type { Asset, Brand, Plant } from '../core/types';

const { Text } = Typography;

type AssetFormValues = {
    name: string;
    machineCode: string;
    serial?: string;
    type: string;
    model: string;
    brandId: string;
    plantId: string;
    area?: string;
    status: AssetStatus;
    purchaseDate?: ReturnType<typeof dayjs>;
    purchasePrice?: number;
    specificationsText?: string;
    note?: string;
};

interface AssetFormModalProps {
    open: boolean;
    onClose: () => void;
    initialValues?: Asset | null;
    onSubmit: (values: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    plants: Plant[];
    brands: Brand[];
}

const statusOptions: { value: AssetStatus; label: string }[] = [
    { value: AssetStatus.ACTIVE, label: 'Đang hoạt động' },
    { value: AssetStatus.MAINTENANCE, label: 'Đang bảo trì' },
    { value: AssetStatus.BROKEN, label: 'Lỗi / hỏng' },
    { value: AssetStatus.BORROWING, label: 'Đang mượn' },
    { value: AssetStatus.STORAGE, label: 'Tồn kho' },
];

const SectionTitle = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
    <div className='mb-4 flex items-start gap-3'>
        <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white'>
            {icon}
        </div>
        <div>
            <div className='text-sm font-bold uppercase tracking-wide text-slate-900'>{title}</div>
            <Text type='secondary' className='text-xs'>
                {description}
            </Text>
        </div>
    </div>
);

const AssetFormModal: React.FC<AssetFormModalProps> = ({ open, onClose, initialValues, onSubmit, plants, brands }) => {
    const [form] = Form.useForm<AssetFormValues>();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = React.useState(false);
    const isEditing = Boolean(initialValues);

    useEffect(() => {
        if (!open) return;

        if (!initialValues) {
            form.resetFields();
            form.setFieldsValue({ status: AssetStatus.ACTIVE });
            return;
        }

        form.setFieldsValue({
            name: initialValues.name,
            machineCode: initialValues.machineCode,
            serial: initialValues.serial,
            type: initialValues.type,
            model: initialValues.model || initialValues.type,
            brandId: initialValues.brandId,
            plantId: initialValues.plantId,
            area: initialValues.area,
            status: initialValues.status,
            purchaseDate: initialValues.purchaseDate ? dayjs(initialValues.purchaseDate) : undefined,
            purchasePrice: initialValues.purchasePrice,
            specificationsText:
                initialValues.specifications && Object.keys(initialValues.specifications).length > 0
                    ? JSON.stringify(initialValues.specifications, null, 2)
                    : undefined,
            note: initialValues.note,
        });
    }, [open, initialValues, form]);

    const brandOptions = useMemo(
        () => brands.map((brand) => ({ label: brand.name, value: brand.id })),
        [brands]
    );

    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
                value: plant.id,
            })),
        [plants]
    );

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            let specifications: Record<string, string | number> | undefined;
            if (values.specificationsText?.trim()) {
                try {
                    specifications = JSON.parse(values.specificationsText);
                } catch {
                    form.setFields([
                        {
                            name: 'specificationsText',
                            errors: ['Thông số kỹ thuật phải là JSON hợp lệ'],
                        },
                    ]);
                    return;
                }
            }

            await onSubmit({
                name: values.name.trim(),
                machineCode: values.machineCode.trim(),
                serial: values.serial?.trim(),
                type: values.type.trim(),
                model: values.model.trim(),
                brandId: values.brandId,
                plantId: values.plantId,
                area: values.area?.trim(),
                status: values.status,
                purchaseDate: values.purchaseDate ? values.purchaseDate.format('YYYY-MM-DD') : undefined,
                purchasePrice: values.purchasePrice,
                specifications,
                note: values.note?.trim(),
            } as Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>);

            message.success(isEditing ? 'Đã cập nhật thông tin máy' : 'Đã thêm máy mới');
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open={open}
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white'>
                        <AppstoreOutlined />
                    </div>
                    <div>
                        <div className='text-lg font-bold text-slate-900'>
                            {isEditing ? 'Chỉnh sửa thông tin máy' : 'Thêm máy mới'}
                        </div>
                        <Text type='secondary' className='text-sm'>
                            Quản lý định danh, vị trí, trạng thái và thông số kỹ thuật của máy.
                        </Text>
                    </div>
                </div>
            }
            onOk={handleSubmit}
            onCancel={onClose}
            confirmLoading={submitting}
            width={920}
            okText={isEditing ? 'Cập nhật máy' : 'Tạo máy'}
            cancelText='Hủy'
            mask={{ closable: false }}
            destroyOnHidden
        >
            <Form
                form={form}
                layout='vertical'
                size='large'
                variant='outlined'
                requiredMark='optional'
                scrollToFirstError={{ focus: true }}
                clearOnDestroy
                initialValues={{ status: AssetStatus.ACTIVE }}
                validateTrigger='onBlur'
                className='mt-6'
            >
                <div className='grid grid-cols-1 gap-4'>
                    <Card variant='outlined'>
                        <SectionTitle
                            icon={<NumberOutlined />}
                            title='Định danh máy'
                            description='Các mã nhận diện cần nhất quán với hồ sơ và tem máy ngoài thực tế.'
                        />
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                            <Form.Item
                                name='name'
                                label='Tên máy'
                                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên máy' }]}
                            >
                                <Input allowClear placeholder='Ví dụ: Máy may 1 kim điện tử Juki' />
                            </Form.Item>
                            <Form.Item
                                name='machineCode'
                                label='Mã máy'
                                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã máy' }]}
                            >
                                <Input allowClear placeholder='Ví dụ: MM-001' />
                            </Form.Item>
                            <Form.Item name='serial' label='Số serial'>
                                <Input allowClear placeholder='Ví dụ: DDL-8000A-2024' />
                            </Form.Item>
                            <Form.Item
                                name='brandId'
                                label='Nhãn hiệu'
                                rules={[{ required: true, message: 'Vui lòng chọn nhãn hiệu' }]}
                            >
                                <Select
                                    allowClear
                                    showSearch={{ optionFilterProp: 'label' }}
                                    options={brandOptions}
                                    placeholder='Chọn nhãn hiệu'
                                />
                            </Form.Item>
                        </div>
                    </Card>

                    <Card variant='outlined'>
                        <SectionTitle
                            icon={<ToolOutlined />}
                            title='Phân loại và model'
                            description='Dùng để lọc, thống kê và lập kế hoạch bảo trì theo nhóm máy.'
                        />
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                            <Form.Item
                                name='type'
                                label='Loại máy'
                                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập loại máy' }]}
                            >
                                <Input allowClear placeholder='Ví dụ: Máy may 1 kim' />
                            </Form.Item>
                            <Form.Item
                                name='model'
                                label='Model'
                                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập model máy' }]}
                            >
                                <Input allowClear placeholder='Ví dụ: Juki DDL-8000A' />
                            </Form.Item>
                        </div>
                    </Card>

                    <Card variant='outlined'>
                        <SectionTitle
                            icon={<EnvironmentOutlined />}
                            title='Vị trí và trạng thái'
                            description='Cơ sở lấy từ dữ liệu hệ thống; không cố định trong giao diện.'
                        />
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                            <Form.Item
                                name='plantId'
                                label='Cơ sở'
                                rules={[{ required: true, message: 'Vui lòng chọn cơ sở' }]}
                            >
                                <Select
                                    allowClear
                                    showSearch={{ optionFilterProp: 'label' }}
                                    options={plantOptions}
                                    placeholder='Chọn cơ sở'
                                />
                            </Form.Item>
                            <Form.Item name='area' label='Khu vực / xưởng'>
                                <Input allowClear placeholder='Ví dụ: Xưởng May 1 - Chuyền 02' />
                            </Form.Item>
                            <Form.Item
                                name='status'
                                label='Trạng thái'
                                rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
                            >
                                <Select options={statusOptions} placeholder='Chọn trạng thái' />
                            </Form.Item>
                        </div>
                    </Card>

                    <Card variant='outlined'>
                        <SectionTitle
                            icon={<FileTextOutlined />}
                            title='Tài sản và thông số'
                            description='Bổ sung ngày mua, giá trị, thông số JSON và ghi chú vận hành nếu có.'
                        />
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                            <Form.Item name='purchaseDate' label='Ngày nhập / mua'>
                                <DatePicker className='w-full' format='DD/MM/YYYY' placeholder='Chọn ngày' />
                            </Form.Item>
                            <Form.Item name='purchasePrice' label='Giá trị (VNĐ)'>
                                <InputNumber<number>
                                    className='w-full'
                                    min={0}
                                    placeholder='Nhập giá trị'
                                    formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={(value) => Number(String(value ?? '').replace(/,/g, ''))}
                                    suffix='đ'
                                />
                            </Form.Item>
                            <Form.Item
                                name='specificationsText'
                                label='Thông số kỹ thuật (JSON)'
                                tooltip='Ví dụ: {"tocDo": "5000 mũi/phút", "congSuat": 15}'
                                className='md:col-span-2'
                            >
                                <Input.TextArea
                                    rows={5}
                                    placeholder='{"tocDo": "5000 mũi/phút", "congSuat": 15}'
                                    autoSize={{ minRows: 4, maxRows: 8 }}
                                />
                            </Form.Item>
                            <Form.Item name='note' label='Ghi chú' className='md:col-span-2'>
                                <Input.TextArea
                                    rows={4}
                                    placeholder='Nhập các thông tin cần lưu ý thêm về máy...'
                                    autoSize={{ minRows: 3, maxRows: 6 }}
                                />
                            </Form.Item>
                        </div>
                    </Card>
                </div>
            </Form>
        </Modal>
    );
};

export default AssetFormModal;
