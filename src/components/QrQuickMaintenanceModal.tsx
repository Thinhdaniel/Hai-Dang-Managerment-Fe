import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Drawer,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Radio,
    Select,
    Tag,
    Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CloseOutlined, EnvironmentOutlined, SaveOutlined, ScanOutlined, ToolOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QrCameraScanner from './QrCameraScanner';
import { ASSET_STATUS_LABEL } from '../core/constants';
import { resolveAssetByScan } from '../core/lib/qrScan';
import { recordQrScan } from '../core/lib/qrScanAudit';
import { maintenanceService, type MaintenancePayload } from '../core/services/maintenance.service';
import { AssetStatus, MaintenanceRepairMode, MaintenanceType, type Asset, type QrScanSource } from '../core/types';

const { Text } = Typography;
const { useBreakpoint } = Grid;

type QrQuickMaintenanceModalProps = {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
};

type MaintenanceQuickFormValues = {
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

type ScanMeta = {
    rawValue?: string;
    publicId?: string;
    labelId?: string;
    source: QrScanSource;
};

const openMaintenanceStatuses = new Set(['pending', 'in_progress', 'overdue']);

const typeOptions = [
    { label: 'Sự cố', value: MaintenanceType.EMERGENCY },
    { label: 'Kiểm tra', value: MaintenanceType.INSPECTION },
    { label: 'Định kỳ', value: MaintenanceType.PERIODIC },
];

const repairModeOptions = [
    { label: 'Sửa nội bộ', value: MaintenanceRepairMode.INTERNAL },
    { label: 'Sửa ngoài', value: MaintenanceRepairMode.EXTERNAL },
];

const toIso = (value?: Dayjs) => (value ? value.toISOString() : undefined);

const getErrorMessage = (error: unknown, fallback: string) =>
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : fallback;

const QrQuickMaintenanceModal: React.FC<QrQuickMaintenanceModalProps> = ({ open, onClose, onCreated }) => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const [form] = Form.useForm<MaintenanceQuickFormValues>();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [asset, setAsset] = useState<Asset | null>(null);
    const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
    const [resolving, setResolving] = useState(false);
    const repairMode = Form.useWatch('repairMode', form) ?? MaintenanceRepairMode.INTERNAL;

    useEffect(() => {
        if (!open) {
            setAsset(null);
            setScanMeta(null);
            form.resetFields();
            return;
        }

        form.setFieldsValue({
            type: MaintenanceType.EMERGENCY,
            repairMode: MaintenanceRepairMode.INTERNAL,
            startDate: dayjs(),
            externalRepair: { sentOutAt: dayjs() },
        });
    }, [form, open]);

    const { data: existingMaintenances = [] } = useQuery({
        queryKey: ['maintenances', 'asset', asset?.id],
        queryFn: () => maintenanceService.getByAsset(asset?.id ?? ''),
        enabled: Boolean(asset?.id),
    });

    const openMaintenances = useMemo(
        () => existingMaintenances.filter((item) => openMaintenanceStatuses.has(item.status || '')),
        [existingMaintenances]
    );

    const createMutation = useMutation({
        mutationFn: (payload: MaintenancePayload) => maintenanceService.create(payload),
        onSuccess: (maintenance) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            if (asset?.id) {
                queryClient.invalidateQueries({ queryKey: ['asset', asset.id] });
                queryClient.invalidateQueries({ queryKey: ['maintenances', 'asset', asset.id] });
            }

            if (asset) {
                recordQrScan({
                    rawValue: scanMeta?.rawValue,
                    publicId: scanMeta?.publicId,
                    labelId: scanMeta?.labelId,
                    assetId: asset.id,
                    action: 'maintenance_quick_create_success',
                    result: 'success',
                    source: scanMeta?.source ?? 'unknown',
                    metadata: { maintenanceId: maintenance.id, machineCode: asset.machineCode },
                });
            }

            message.success('Đã tạo phiếu bảo trì');
            onCreated?.();
        },
        onError: (error) => {
            if (asset) {
                recordQrScan({
                    rawValue: scanMeta?.rawValue,
                    publicId: scanMeta?.publicId,
                    labelId: scanMeta?.labelId,
                    assetId: asset.id,
                    action: 'maintenance_quick_create_success',
                    result: 'failed',
                    source: scanMeta?.source ?? 'unknown',
                    metadata: { error: getErrorMessage(error, 'Tạo phiếu bảo trì chưa thành công') },
                });
            }
        },
    });

    const handleDetected = async (rawValue: string) => {
        if (resolving) return;
        setResolving(true);
        try {
            const result = await resolveAssetByScan(rawValue);
            const nextMeta = {
                rawValue,
                publicId: result.publicId,
                labelId: result.labelId,
                source: result.source,
            };
            setScanMeta(nextMeta);

            if (!result.asset) {
                recordQrScan({
                    rawValue,
                    publicId: result.publicId,
                    labelId: result.labelId,
                    action: 'maintenance_quick_create',
                    result: result.ambiguous ? 'ambiguous' : 'not_found',
                    source: result.source,
                });
                message[result.ambiguous ? 'warning' : 'error'](
                    result.ambiguous
                        ? 'Mã nhập vào khớp nhiều máy — hãy nhập chính xác mã máy hoặc quét QR.'
                        : 'Không tìm thấy máy từ mã vừa quét.'
                );
                return;
            }

            recordQrScan({
                rawValue,
                publicId: result.publicId,
                labelId: result.labelId,
                assetId: result.asset.id,
                action: 'maintenance_quick_create',
                result: 'resolved',
                source: result.source,
            });
            setAsset(result.asset);
            form.setFieldsValue({
                type: MaintenanceType.EMERGENCY,
                repairMode: MaintenanceRepairMode.INTERNAL,
                startDate: dayjs(),
                description: '',
                technician: '',
                note: '',
                externalRepair: { sentOutAt: dayjs() },
            });
            message.success(`Đã nhận diện "${result.asset.name}"`);
        } finally {
            setResolving(false);
        }
    };

    const handleSubmit = async (values: MaintenanceQuickFormValues) => {
        if (!asset) return;

        const isExternal = values.repairMode === MaintenanceRepairMode.EXTERNAL;
        const payload: MaintenancePayload = {
            assetId: asset.id,
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

        try {
            await createMutation.mutateAsync(payload);
        } catch (error) {
            message.error(getErrorMessage(error, 'Tạo phiếu bảo trì chưa thành công'));
        }
    };

    const handleScanNext = () => {
        setAsset(null);
        setScanMeta(null);
        form.resetFields();
        form.setFieldsValue({
            type: MaintenanceType.EMERGENCY,
            repairMode: MaintenanceRepairMode.INTERNAL,
            startDate: dayjs(),
            externalRepair: { sentOutAt: dayjs() },
        });
    };

    const content = (
        <div className='flex flex-col gap-4'>
            {!asset ? (
                <QrCameraScanner active={open && !asset} onDetected={handleDetected} />
            ) : (
                <>
                    <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='truncate text-base font-bold text-slate-900'>{asset.name}</div>
                                <div className='mt-1 flex flex-wrap items-center gap-2'>
                                    <Tag color='blue' className='!m-0 font-mono'>
                                        {asset.machineCode}
                                    </Tag>
                                    <Tag className='!m-0'>{ASSET_STATUS_LABEL[asset.status]}</Tag>
                                </div>
                            </div>
                            <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white'>
                                <ToolOutlined />
                            </div>
                        </div>
                        <div className='mt-3 flex items-center gap-2 text-sm text-slate-600'>
                            <EnvironmentOutlined className='text-slate-400' />
                            <span className='font-semibold'>{asset.plant?.name || 'Chưa rõ cơ sở'}</span>
                            <span className='text-slate-300'>/</span>
                            <span>{asset.area?.trim() || 'Chưa gắn khu vực'}</span>
                        </div>
                    </div>

                    {asset.status === AssetStatus.RETURNED_TO_PARTNER ? (
                        <Alert
                            showIcon
                            type='warning'
                            message='Máy đã trả đối tác'
                            description='Backend sẽ không cho tạo phiếu bảo trì mới cho máy đã trả đối tác.'
                        />
                    ) : null}

                    {openMaintenances.length ? (
                        <Alert
                            showIcon
                            type='warning'
                            message={`Máy đang có ${openMaintenances.length} phiếu bảo trì chưa đóng`}
                            description='Kiểm tra trước khi tạo thêm phiếu mới để tránh trùng việc.'
                        />
                    ) : null}

                    <Form<MaintenanceQuickFormValues>
                        form={form}
                        layout='vertical'
                        requiredMark='optional'
                        onFinish={handleSubmit}
                    >
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
                            label='Nội dung lỗi / yêu cầu'
                            rules={[{ required: true, message: 'Nhập nội dung cần bảo trì' }]}
                        >
                            <Input.TextArea rows={3} placeholder='Ví dụ: máy kẹt ổ, bỏ mũi, cần kiểm tra motor...' />
                        </Form.Item>

                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            <Form.Item
                                name='startDate'
                                label='Ngày ghi nhận'
                                rules={[{ required: true, message: 'Chọn ngày' }]}
                            >
                                <DatePicker className='w-full' format='DD/MM/YYYY' />
                            </Form.Item>
                            <Form.Item name='technician' label='Người xử lý / kỹ thuật viên'>
                                <Input placeholder='Tên người xử lý nếu đã biết' />
                            </Form.Item>
                        </div>

                        {repairMode === MaintenanceRepairMode.EXTERNAL ? (
                            <div className='rounded-xl border border-amber-200 bg-amber-50 p-3'>
                                <Text className='mb-3 block text-sm font-bold text-amber-900'>Thông tin sửa ngoài</Text>
                                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                    <Form.Item
                                        name={['externalRepair', 'vendorName']}
                                        label='Đơn vị sửa ngoài'
                                        rules={[{ required: true, message: 'Nhập đơn vị sửa ngoài' }]}
                                    >
                                        <Input placeholder='Tên tiệm/nhà cung cấp' />
                                    </Form.Item>
                                    <Form.Item name={['externalRepair', 'estimateCost']} label='Chi phí dự kiến'>
                                        <InputNumber<number>
                                            min={0}
                                            className='w-full'
                                            formatter={(value) =>
                                                `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                            }
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

                    <div className='sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 bg-white/95 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:flex-row md:justify-end md:bg-transparent md:pt-0'>
                        <Button size='large' icon={<CloseOutlined />} onClick={onClose}>
                            Xong
                        </Button>
                        <Button size='large' icon={<ScanOutlined />} onClick={handleScanNext}>
                            Quét máy khác
                        </Button>
                        <Button
                            type='primary'
                            size='large'
                            icon={<SaveOutlined />}
                            loading={createMutation.isPending}
                            onClick={() => form.submit()}
                            className='md:min-w-[156px]'
                        >
                            Tạo phiếu
                        </Button>
                    </div>
                </>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <Drawer
                open={open}
                placement='bottom'
                height='auto'
                onClose={onClose}
                destroyOnHidden
                title='Quét QR tạo bảo trì'
                styles={{
                    body: { padding: 16 },
                    content: { borderRadius: '20px 20px 0 0' },
                }}
            >
                {content}
            </Drawer>
        );
    }

    return (
        <Modal
            open={open}
            centered
            width={720}
            footer={null}
            destroyOnHidden
            onCancel={onClose}
            title='Quét QR tạo bảo trì'
        >
            {content}
        </Modal>
    );
};

export default QrQuickMaintenanceModal;
