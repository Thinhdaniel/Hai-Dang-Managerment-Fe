import { App, DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Asset, MaintenanceRepairMode, MaintenanceType } from '../core/types';
import type { MaintenancePayload } from '../core/services/maintenance.service';

type MaintenanceFormValues = {
    assetIds: string[];
    type: MaintenanceType;
    repairMode: MaintenanceRepairMode;
    description: string;
    startDate: Dayjs;
    technician?: string;
    note?: string;
    externalRepair?: {
        vendorName?: string;
        sentOutAt?: Dayjs;
        expectedReturnAt?: Dayjs;
        estimateCost?: number;
        invoiceNo?: string;
    };
};

type MaintenanceFormModalProps = {
    open: boolean;
    assets: Asset[];
    initialAssetId?: string;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (payload: MaintenancePayload) => Promise<void> | void;
};

const typeOptions = [
    { label: 'Định kỳ', value: 'periodic' },
    { label: 'Sự cố', value: 'emergency' },
    { label: 'Kiểm tra', value: 'inspection' },
];

const repairModeOptions = [
    { label: 'Sửa nội bộ', value: 'internal' },
    { label: 'Sửa ngoài', value: 'external' },
];

const toIso = (value?: Dayjs) => (value ? value.toISOString() : undefined);

const MaintenanceFormModal = ({
    open,
    assets,
    initialAssetId,
    submitting,
    onClose,
    onSubmit,
}: MaintenanceFormModalProps) => {
    const [form] = Form.useForm<MaintenanceFormValues>();
    const { message } = App.useApp();
    const repairMode = Form.useWatch('repairMode', form) ?? 'internal';

    const assetOptions = assets.map((asset) => ({
        value: asset.id,
        label: `${asset.machineCode} - ${asset.name}`,
    }));

    const handleFinish = async (values: MaintenanceFormValues) => {
        const isExternal = values.repairMode === 'external';
        const assetIds = Array.from(new Set(values.assetIds ?? [])).filter(Boolean);

        // Một phiếu chỉ gộp máy cùng cơ sở (giống lệnh điều chuyển) để cơ sở của phiếu đúng cho mọi máy.
        const selected = assets.filter((asset) => assetIds.includes(asset.id));
        const distinctPlantIds = new Set(selected.map((asset) => String(asset.plantId ?? '')));
        if (distinctPlantIds.size > 1) {
            message.warning('Các máy trong cùng một phiếu bảo trì phải thuộc cùng một cơ sở.');
            return;
        }
        const payload: MaintenancePayload = {
            assetId: assetIds[0],
            assetIds,
            type: values.type,
            repairMode: values.repairMode,
            description: values.description.trim(),
            startDate: toIso(values.startDate) ?? new Date().toISOString(),
            technician: values.technician?.trim() || undefined,
            note: values.note?.trim() || undefined,
            externalRepair: isExternal
                ? {
                      vendorName: values.externalRepair?.vendorName?.trim() || undefined,
                      sentOutAt: toIso(values.externalRepair?.sentOutAt),
                      expectedReturnAt: toIso(values.externalRepair?.expectedReturnAt),
                      estimateCost: values.externalRepair?.estimateCost,
                      invoiceNo: values.externalRepair?.invoiceNo?.trim() || undefined,
                  }
                : undefined,
        };

        await onSubmit(payload);
        form.resetFields();
    };

    return (
        <Modal
            open={open}
            title='Tạo phiếu bảo trì'
            okText='Tạo phiếu'
            cancelText='Đóng'
            confirmLoading={submitting}
            onOk={() => form.submit()}
            onCancel={onClose}
            destroyOnHidden
            width={760}
        >
            <Form<MaintenanceFormValues>
                form={form}
                layout='vertical'
                requiredMark='optional'
                initialValues={{
                    assetIds: initialAssetId ? [initialAssetId] : undefined,
                    type: 'emergency',
                    repairMode: 'internal',
                    startDate: dayjs(),
                    externalRepair: {
                        sentOutAt: dayjs(),
                    },
                }}
                onFinish={handleFinish}
            >
                <Form.Item
                    name='assetIds'
                    label='Máy cần sửa (có thể chọn nhiều)'
                    rules={[{ required: true, message: 'Chọn ít nhất một máy cần bảo trì' }]}
                >
                    <Select
                        mode='multiple'
                        showSearch
                        optionFilterProp='label'
                        options={assetOptions}
                        placeholder='Tìm & chọn một hoặc nhiều máy theo mã máy hoặc tên máy'
                        disabled={Boolean(initialAssetId)}
                        maxTagCount='responsive'
                    />
                </Form.Item>

                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    <Form.Item name='repairMode' label='Kiểu sửa chữa'>
                        <Radio.Group optionType='button' buttonStyle='solid' options={repairModeOptions} />
                    </Form.Item>
                    <Form.Item
                        name='type'
                        label='Loại bảo trì'
                        rules={[{ required: true, message: 'Chọn loại bảo trì' }]}
                    >
                        <Select options={typeOptions} />
                    </Form.Item>
                </div>

                <Form.Item
                    name='description'
                    label='Nội dung sửa chữa'
                    rules={[{ required: true, message: 'Nhập nội dung sửa chữa' }]}
                >
                    <Input.TextArea rows={3} placeholder='Ví dụ: Máy bỏ mũi, kẹt ổ, cần kiểm tra motor...' />
                </Form.Item>

                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    <Form.Item
                        name='startDate'
                        label='Ngày ghi nhận'
                        rules={[{ required: true, message: 'Chọn ngày' }]}
                    >
                        <DatePicker className='w-full' format='DD/MM/YYYY' />
                    </Form.Item>
                    <Form.Item name='technician' label='Kỹ thuật viên'>
                        <Input placeholder='Tên người xử lý' />
                    </Form.Item>
                </div>

                {repairMode === 'external' ? (
                    <div className='rounded-lg border border-amber-200 bg-amber-50 p-3'>
                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            <Form.Item
                                name={['externalRepair', 'vendorName']}
                                label='Đơn vị sửa ngoài'
                                rules={[{ required: true, message: 'Nhập đơn vị sửa ngoài' }]}
                            >
                                <Input placeholder='Tên tiệm/nhà cung cấp sửa máy' />
                            </Form.Item>
                            <Form.Item
                                name={['externalRepair', 'estimateCost']}
                                label='Chi phí dự kiến'
                                className='maintenance-money-form-item'
                            >
                                <InputNumber<number>
                                    size='large'
                                    min={0}
                                    step={10000}
                                    controls={false}
                                    placeholder='0'
                                    className='maintenance-money-input w-full'
                                    formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                                    suffix='VND'
                                />
                            </Form.Item>
                            <Form.Item name={['externalRepair', 'sentOutAt']} label='Ngày đem đi sửa'>
                                <DatePicker className='w-full' format='DD/MM/YYYY' />
                            </Form.Item>
                            <Form.Item name={['externalRepair', 'expectedReturnAt']} label='Dự kiến nhận về'>
                                <DatePicker className='w-full' format='DD/MM/YYYY' />
                            </Form.Item>
                            <Form.Item name={['externalRepair', 'invoiceNo']} label='Số hóa đơn/phiếu sửa'>
                                <Input placeholder='Nếu đã có' />
                            </Form.Item>
                        </div>
                    </div>
                ) : null}

                <Form.Item name='note' label='Ghi chú'>
                    <Input.TextArea rows={2} placeholder='Thông tin thêm nếu cần' />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default MaintenanceFormModal;
