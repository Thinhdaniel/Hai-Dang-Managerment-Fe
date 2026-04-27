import React, { useEffect, useMemo } from 'react';
import { Form, Input, InputNumber, Modal, Select, DatePicker, App } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { AssetStatus } from '../core/types';
import type { Asset, Brand, Plant } from '../core/types';

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
    { value: AssetStatus.ACTIVE, label: 'Hoạt động' },
    { value: AssetStatus.MAINTENANCE, label: 'Bảo trì' },
    { value: AssetStatus.BROKEN, label: 'Lỗi / hỏng' },
    { value: AssetStatus.BORROWING, label: 'Đang mượn' },
    { value: AssetStatus.STORAGE, label: 'Tồn kho' },
];

const AssetFormModal: React.FC<AssetFormModalProps> = ({ open, onClose, initialValues, onSubmit, plants, brands }) => {
    const [form] = Form.useForm<AssetFormValues>();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = React.useState(false);

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
        () =>
            brands.map((brand) => ({
                label: brand.name,
                value: brand.id,
            })),
        [brands]
    );

    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                label: plant.name,
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
                name: values.name,
                machineCode: values.machineCode,
                serial: values.serial,
                type: values.type,
                model: values.model,
                brandId: values.brandId,
                plantId: values.plantId,
                area: values.area,
                status: values.status,
                purchaseDate: values.purchaseDate ? values.purchaseDate.format('YYYY-MM-DD') : undefined,
                purchasePrice: values.purchasePrice,
                specifications,
                note: values.note,
            } as Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>);

            message.success(initialValues ? 'Cập nhật thiết bị thành công' : 'Tạo thiết bị thành công');
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <AppstoreOutlined />
                    </div>
                    <span className="text-lg font-bold text-slate-800">
                        {initialValues ? 'Chỉnh sửa thiết bị' : 'Thêm thiết bị mới'}
                    </span>
                </div>
            }
            open={open}
            onOk={handleSubmit}
            onCancel={onClose}
            confirmLoading={submitting}
            width={760}
            okText={initialValues ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            maskClosable={false}
            destroyOnHidden
            className="[&_.ant-modal-content]:p-6 [&_.ant-modal-content]:rounded-2xl"
        >
            <Form 
                form={form} 
                layout='vertical' 
                initialValues={{ status: AssetStatus.ACTIVE }}
                className="mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-form-item-label_label]:text-slate-600 [&_.ant-form-item-label_label]:font-medium [&_.ant-input]:rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-picker]:rounded-lg"
            >
                <div>
                    <div className="text-sm font-bold text-slate-800 mb-3 tracking-wide">THÔNG TIN CƠ BẢN</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                            name='name'
                            label='Tên máy'
                            rules={[{ required: true, message: 'Vui lòng nhập tên máy' }]}
                        >
                            <Input placeholder='Ví dụ: Máy may 1 kim điện tử Juki' size="large" />
                        </Form.Item>
                        <Form.Item
                            name='machineCode'
                            label='Mã máy'
                            rules={[{ required: true, message: 'Vui lòng nhập mã máy' }]}
                        >
                            <Input placeholder='Ví dụ: MM-001' size="large" />
                        </Form.Item>
                        <Form.Item name='serial' label='Số Serial'>
                            <Input placeholder='Ví dụ: DDL-8000A' size="large" />
                        </Form.Item>
                        <Form.Item
                            name='type'
                            label='Loại máy'
                            rules={[{ required: true, message: 'Vui lòng nhập loại máy' }]}
                        >
                            <Input placeholder='Ví dụ: Máy may 1 kim' size="large" />
                        </Form.Item>
                        <Form.Item
                            name='model'
                            label='Model may'
                            rules={[{ required: true, message: 'Vui long nhap model may' }]}
                        >
                            <Input placeholder='Vi du: Juki DDL-8000A' size="large" />
                        </Form.Item>
                        <Form.Item
                            name='brandId'
                            label='Nhãn hiệu'
                            rules={[{ required: true, message: 'Vui lòng chọn nhãn hiệu' }]}
                        >
                            <Select
                                options={brandOptions}
                                placeholder='Chọn nhãn hiệu'
                                showSearch
                                optionFilterProp='label'
                                size="large"
                            />
                        </Form.Item>
                    </div>
                </div>

                <div className="h-px bg-slate-100"></div>

                <div>
                    <div className="text-sm font-bold text-slate-800 mb-3 tracking-wide">VỊ TRÍ & TRẠNG THÁI</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                            name='plantId'
                            label='Cơ sở'
                            rules={[{ required: true, message: 'Vui lòng chọn cơ sở' }]}
                        >
                            <Select
                                options={plantOptions}
                                placeholder='Chọn cơ sở'
                                showSearch
                                optionFilterProp='label'
                                size="large"
                            />
                        </Form.Item>
                        <Form.Item name='area' label='Khu vực / xưởng'>
                            <Input placeholder='Ví dụ: Xưởng May 1 - Chuyền 02' size="large" />
                        </Form.Item>
                        <Form.Item
                            name='status'
                            label='Trạng thái hoạt động'
                            rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
                        >
                            <Select options={statusOptions} size="large" />
                        </Form.Item>
                    </div>
                </div>

                <div className="h-px bg-slate-100"></div>

                <div>
                    <div className="text-sm font-bold text-slate-800 mb-3 tracking-wide">TÀI SẢN & THÔNG SỐ</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item name='purchaseDate' label='Ngày nhập / mua'>
                            <DatePicker className="w-full" format='DD/MM/YYYY' size="large" />
                        </Form.Item>
                        <Form.Item name='purchasePrice' label='Giá trị (VNĐ)'>
                            <InputNumber<number>
                                className="w-full !rounded-lg"
                                min={0}
                                size="large"
                                formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => Number(String(value ?? '').replace(/,/g, ''))}
                            />
                        </Form.Item>
                        <Form.Item
                            name='specificationsText'
                            label='Thông số kỹ thuật (JSON)'
                            tooltip='Ví dụ: {"tocDo": "5000 mui/phut", "congSuat": 15}'
                            className="md:col-span-2"
                        >
                            <Input.TextArea rows={4} placeholder='{"tocDo": "5000 mui/phut", "congSuat": 15}' className="!rounded-lg" />
                        </Form.Item>
                        <Form.Item name='note' label='Ghi chú thêm' className="md:col-span-2">
                            <Input.TextArea rows={3} placeholder='Nhập các thông tin cần lưu ý thêm về thiết bị...' className="!rounded-lg" />
                        </Form.Item>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default AssetFormModal;
