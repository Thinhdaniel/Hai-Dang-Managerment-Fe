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
    Segmented,
    Tag,
    Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CloseOutlined, EnvironmentOutlined, SaveOutlined, ScanOutlined } from '@ant-design/icons';
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
    { label: 'Sửa nội bộ', description: 'Xử lý tại cơ sở', value: MaintenanceRepairMode.INTERNAL },
    { label: 'Sửa ngoài', description: 'Gửi đơn vị sửa', value: MaintenanceRepairMode.EXTERNAL },
];

const toIso = (value?: Dayjs) => (value ? value.toISOString() : undefined);

const getErrorMessage = (error: unknown, fallback: string) =>
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : fallback;

const createDefaultQuickValues = (): Partial<MaintenanceQuickFormValues> => ({
    type: MaintenanceType.EMERGENCY,
    repairMode: MaintenanceRepairMode.INTERNAL,
    description: '',
    startDate: dayjs(),
    technician: '',
    note: '',
    externalRepair: { sentOutAt: dayjs() },
});

const QrQuickMaintenanceModal: React.FC<QrQuickMaintenanceModalProps> = ({ open, onClose, onCreated }) => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const controlSize = isMobile ? 'large' : 'middle';
    const [form] = Form.useForm<MaintenanceQuickFormValues>();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
    const [scanMetas, setScanMetas] = useState<Record<string, ScanMeta>>({});
    const [addingAsset, setAddingAsset] = useState(false);
    const [resolving, setResolving] = useState(false);
    const repairMode = Form.useWatch('repairMode', form) ?? MaintenanceRepairMode.INTERNAL;
    const asset = selectedAssets[0] ?? null;
    const selectedAssetIds = useMemo(() => selectedAssets.map((item) => item.id), [selectedAssets]);

    useEffect(() => {
        if (!open) {
            setSelectedAssets([]);
            setScanMetas({});
            setAddingAsset(false);
            form.resetFields();
            return;
        }

        form.setFieldsValue(createDefaultQuickValues());
    }, [form, open]);

    const { data: existingMaintenances = [] } = useQuery({
        queryKey: ['maintenances', 'quick-scan-assets', selectedAssetIds],
        queryFn: async () => {
            const rows = await Promise.all(selectedAssetIds.map((id) => maintenanceService.getByAsset(id)));
            return Array.from(new Map(rows.flat().map((item) => [item.id, item])).values());
        },
        enabled: selectedAssetIds.length > 0,
    });

    const openMaintenances = useMemo(
        () => existingMaintenances.filter((item) => openMaintenanceStatuses.has(item.status || '')),
        [existingMaintenances]
    );
    const openMaintenanceCountByAsset = useMemo(() => {
        const map = new Map<string, number>();
        openMaintenances.forEach((item) => {
            const ids = item.assetIds?.length ? item.assetIds : [item.assetId];
            ids.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
        });
        return map;
    }, [openMaintenances]);
    const returnedAssets = useMemo(
        () => selectedAssets.filter((item) => item.status === AssetStatus.RETURNED_TO_PARTNER),
        [selectedAssets]
    );

    const createMutation = useMutation({
        mutationFn: (payload: MaintenancePayload) => maintenanceService.create(payload),
        onSuccess: (maintenance) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            selectedAssets.forEach((item) => {
                queryClient.invalidateQueries({ queryKey: ['asset', item.id] });
                queryClient.invalidateQueries({ queryKey: ['maintenances', 'asset', item.id] });

                const scanMeta = scanMetas[item.id];
                recordQrScan({
                    rawValue: scanMeta?.rawValue,
                    publicId: scanMeta?.publicId,
                    labelId: scanMeta?.labelId,
                    assetId: item.id,
                    action: 'maintenance_quick_create_success',
                    result: 'success',
                    source: scanMeta?.source ?? 'unknown',
                    metadata: {
                        maintenanceId: maintenance.id,
                        machineCode: item.machineCode,
                        assetCount: selectedAssets.length,
                    },
                });
            });

            message.success(`Đã tạo phiếu bảo trì cho ${selectedAssets.length} máy`);
            onCreated?.();
            setSelectedAssets([]);
            setScanMetas({});
            setAddingAsset(false);
            form.resetFields();
            form.setFieldsValue(createDefaultQuickValues());
        },
        onError: (error) => {
            selectedAssets.forEach((item) => {
                const scanMeta = scanMetas[item.id];
                recordQrScan({
                    rawValue: scanMeta?.rawValue,
                    publicId: scanMeta?.publicId,
                    labelId: scanMeta?.labelId,
                    assetId: item.id,
                    action: 'maintenance_quick_create_success',
                    result: 'failed',
                    source: scanMeta?.source ?? 'unknown',
                    metadata: { error: getErrorMessage(error, 'Tạo phiếu bảo trì chưa thành công') },
                });
            });
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

            const alreadySelected = selectedAssets.some((item) => item.id === result.asset!.id);
            if (alreadySelected) {
                message.info(`Máy "${result.asset.name}" đã nằm trong phiếu`);
                return;
            }

            // Một phiếu chỉ gộp máy cùng cơ sở (giống lệnh điều chuyển) để cơ sở của phiếu đúng.
            const firstAsset = selectedAssets[0];
            if (firstAsset && String(result.asset.plantId) !== String(firstAsset.plantId)) {
                recordQrScan({
                    rawValue,
                    publicId: result.publicId,
                    labelId: result.labelId,
                    assetId: result.asset.id,
                    action: 'maintenance_quick_create',
                    result: 'failed',
                    source: result.source,
                    metadata: {
                        reason: 'different_plant',
                        firstPlantId: firstAsset.plantId,
                        currentPlantId: result.asset.plantId,
                    },
                });
                message.warning(
                    `"${result.asset.name}" khác cơ sở với máy đầu tiên (${
                        firstAsset.plant?.name || 'chưa rõ'
                    }) — không thể chung một phiếu bảo trì.`
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
            if (!selectedAssets.length) {
                form.resetFields();
                form.setFieldsValue(createDefaultQuickValues());
            }
            setSelectedAssets((prev) => [...prev, result.asset!]);
            setScanMetas((prev) => ({ ...prev, [result.asset!.id]: nextMeta }));
            setAddingAsset(selectedAssets.length === 0 ? false : true);
            message.success(
                selectedAssets.length
                    ? `Đã thêm "${result.asset.name}" vào phiếu`
                    : `Đã nhận diện "${result.asset.name}"`
            );
        } finally {
            setResolving(false);
        }
    };

    const handleSubmit = async (values: MaintenanceQuickFormValues) => {
        if (!selectedAssets.length) return;

        const isExternal = values.repairMode === MaintenanceRepairMode.EXTERNAL;
        const payload: MaintenancePayload = {
            assetId: selectedAssets[0].id,
            assetIds: selectedAssets.map((item) => item.id),
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
        setSelectedAssets([]);
        setScanMetas({});
        setAddingAsset(false);
        form.resetFields();
        form.setFieldsValue(createDefaultQuickValues());
    };

    const handleRemoveAsset = (assetId: string) => {
        setSelectedAssets((prev) => prev.filter((item) => item.id !== assetId));
        setScanMetas((prev) => {
            const next = { ...prev };
            delete next[assetId];
            return next;
        });
    };

    const repairModeSegmentOptions = repairModeOptions.map((option) => ({
        value: option.value,
        label: (
            <div className='qr-maintenance-segment-label'>
                <span className='font-bold'>{option.label}</span>
                <span className='text-xs text-slate-500'>{option.description}</span>
            </div>
        ),
    }));

    const typeSegmentOptions = typeOptions.map((option) => ({
        value: option.value,
        label: <span className='font-semibold'>{option.label}</span>,
    }));

    const scanContent = (
        <div className={isMobile ? 'flex h-full flex-col gap-4 bg-slate-50 p-4' : 'flex flex-col gap-4'}>
            <div className='rounded-2xl border border-blue-100 bg-blue-50/80 p-4'>
                <div className='flex items-center gap-3'>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white'>
                        <ScanOutlined />
                    </div>
                    <div className='min-w-0'>
                        <div className='font-bold text-slate-950'>Quét QR máy</div>
                        <div className='text-sm text-slate-600'>Nhận diện máy trước khi lập phiếu bảo trì.</div>
                    </div>
                </div>
            </div>
            <QrCameraScanner active={open && !asset} onDetected={handleDetected} />
        </div>
    );

    const formContent = asset ? (
        <div className={isMobile ? 'flex h-full flex-col bg-slate-50' : 'flex flex-col gap-4'}>
            <div className={isMobile ? 'flex-1 overflow-y-auto p-4' : 'flex flex-col gap-4'}>
                <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <div className='text-base font-black text-slate-950'>
                                Máy trong phiếu ({selectedAssets.length})
                            </div>
                            <div className='mt-1 text-sm font-medium text-slate-500'>
                                Quét liên tiếp các máy cần đưa vào cùng một phiếu bảo trì.
                            </div>
                        </div>
                        <Button
                            icon={<ScanOutlined />}
                            onClick={() => setAddingAsset((prev) => !prev)}
                            type={addingAsset ? 'primary' : 'default'}
                        >
                            {addingAsset ? 'Dừng quét' : 'Quét thêm'}
                        </Button>
                    </div>

                    <div className='mt-3 flex flex-col gap-2'>
                        {selectedAssets.map((item, index) => {
                            const openCount = openMaintenanceCountByAsset.get(item.id) ?? 0;
                            return (
                                <div
                                    key={item.id}
                                    className='rounded-2xl border border-slate-100 bg-slate-50 p-3'
                                >
                                    <div className='flex items-start justify-between gap-3'>
                                        <div className='min-w-0'>
                                            <div className='flex flex-wrap items-center gap-1.5'>
                                                <Tag color={index === 0 ? 'blue' : 'default'} className='!m-0'>
                                                    {index === 0 ? 'Máy chính' : `Máy ${index + 1}`}
                                                </Tag>
                                                <Tag color='blue' className='!m-0 font-mono'>
                                                    {item.machineCode}
                                                </Tag>
                                                <Tag className='!m-0'>{ASSET_STATUS_LABEL[item.status]}</Tag>
                                                {openCount ? (
                                                    <Tag color='warning' className='!m-0'>
                                                        {openCount} phiếu mở
                                                    </Tag>
                                                ) : null}
                                            </div>
                                            <div className='mt-1 line-clamp-2 font-bold text-slate-950'>
                                                {item.name}
                                            </div>
                                            <div className='mt-2 flex items-center gap-2 text-sm text-slate-600'>
                                                <EnvironmentOutlined className='shrink-0 text-slate-400' />
                                                <span className='min-w-0 truncate font-semibold'>
                                                    {item.plant?.name || 'Chưa rõ cơ sở'}
                                                </span>
                                                <span className='text-slate-300'>/</span>
                                                <span className='min-w-0 truncate'>
                                                    {item.area?.trim() || 'Chưa gắn khu vực'}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            danger
                                            size='small'
                                            disabled={selectedAssets.length === 1}
                                            onClick={() => handleRemoveAsset(item.id)}
                                        >
                                            Xóa
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {addingAsset ? (
                        <div className='mt-3 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 p-2'>
                            <QrCameraScanner active={open && addingAsset} onDetected={handleDetected} />
                        </div>
                    ) : null}
                </section>

                {returnedAssets.length ? (
                    <Alert
                        showIcon
                        type='warning'
                        message={`Có ${returnedAssets.length} máy đã trả đối tác`}
                        description='Backend sẽ không cho tạo phiếu bảo trì mới nếu danh sách có máy đã trả đối tác.'
                    />
                ) : null}

                {openMaintenances.length ? (
                    <Alert
                        showIcon
                        type='warning'
                        message={`Danh sách đang có ${openMaintenances.length} phiếu bảo trì chưa đóng`}
                        description='Kiểm tra trước khi tạo thêm phiếu mới để tránh trùng việc.'
                    />
                ) : null}

                <Form<MaintenanceQuickFormValues>
                    form={form}
                    layout='vertical'
                    requiredMark='optional'
                    onFinish={handleSubmit}
                    className='flex flex-col gap-3'
                >
                    <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm'>
                        <Form.Item
                            name='repairMode'
                            label='Hình thức sửa'
                            rules={[{ required: true, message: 'Chọn hình thức sửa' }]}
                        >
                            <Segmented<MaintenanceRepairMode>
                                className='qr-maintenance-mode-segment'
                                options={repairModeSegmentOptions}
                            />
                        </Form.Item>
                        <Form.Item
                            name='type'
                            label='Loại phiếu'
                            rules={[{ required: true, message: 'Chọn loại bảo trì' }]}
                            className='!mb-0'
                        >
                            <Segmented<MaintenanceType>
                                className='qr-maintenance-type-segment'
                                options={typeSegmentOptions}
                            />
                        </Form.Item>
                    </section>

                    <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm'>
                        <Form.Item
                            name='description'
                            label='Nội dung lỗi / yêu cầu'
                            rules={[{ required: true, message: 'Nhập nội dung cần bảo trì' }]}
                        >
                            <Input.TextArea
                                rows={isMobile ? 4 : 3}
                                placeholder='Ví dụ: máy kẹt ổ, bỏ mũi, cần kiểm tra motor...'
                            />
                        </Form.Item>

                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                            <Form.Item
                                name='startDate'
                                label='Ngày ghi nhận'
                                rules={[{ required: true, message: 'Chọn ngày' }]}
                            >
                                <DatePicker size={controlSize} className='w-full' format='DD/MM/YYYY' />
                            </Form.Item>
                            <Form.Item name='technician' label='Người xử lý / kỹ thuật viên'>
                                <Input size={controlSize} placeholder='Tên người xử lý nếu đã biết' />
                            </Form.Item>
                        </div>

                        <Form.Item name='note' label='Ghi chú' className='!mb-0'>
                            <Input.TextArea rows={2} placeholder='Thông tin thêm nếu cần' />
                        </Form.Item>
                    </section>

                    {repairMode === MaintenanceRepairMode.EXTERNAL ? (
                        <section className='rounded-2xl border border-amber-200 bg-amber-50/80 p-3 shadow-sm'>
                            <Text className='mb-3 block text-sm font-bold text-amber-900'>Thông tin sửa ngoài</Text>
                            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                <Form.Item
                                    name={['externalRepair', 'vendorName']}
                                    label='Đơn vị sửa ngoài'
                                    rules={[{ required: true, message: 'Nhập đơn vị sửa ngoài' }]}
                                >
                                    <Input size={controlSize} placeholder='Tên tiệm/nhà cung cấp' />
                                </Form.Item>
                                <Form.Item
                                    name={['externalRepair', 'estimateCost']}
                                    label='Chi phí dự kiến'
                                    className='maintenance-money-form-item'
                                >
                                    <InputNumber<number>
                                        size={controlSize}
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
                                    <DatePicker size={controlSize} className='w-full' format='DD/MM/YYYY' />
                                </Form.Item>
                                <Form.Item name={['externalRepair', 'expectedReturnAt']} label='Dự kiến nhận về'>
                                    <DatePicker size={controlSize} className='w-full' format='DD/MM/YYYY' />
                                </Form.Item>
                                <Form.Item
                                    name={['externalRepair', 'invoiceNo']}
                                    label='Số hóa đơn/phiếu sửa'
                                    className='md:col-span-2'
                                >
                                    <Input size={controlSize} placeholder='Nếu đã có' />
                                </Form.Item>
                            </div>
                        </section>
                    ) : null}
                </Form>
            </div>

            <div className={isMobile ? 'border-t border-slate-200 bg-white/95 p-3 backdrop-blur' : 'pt-1'}>
                <div
                    className={
                        isMobile ? 'grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]' : 'flex justify-end gap-2'
                    }
                >
                    <Button block={isMobile} size={controlSize} icon={<CloseOutlined />} onClick={onClose}>
                        Xong
                    </Button>
                    <Button block={isMobile} size={controlSize} icon={<ScanOutlined />} onClick={handleScanNext}>
                        Làm lại
                    </Button>
                    <Button
                        block={isMobile}
                        type='primary'
                        size={controlSize}
                        icon={<SaveOutlined />}
                        loading={createMutation.isPending}
                        disabled={Boolean(returnedAssets.length)}
                        onClick={() => form.submit()}
                        className={isMobile ? 'col-span-2' : 'min-w-[156px]'}
                    >
                        Tạo phiếu ({selectedAssets.length})
                    </Button>
                </div>
            </div>
        </div>
    ) : null;

    const content = asset ? formContent : scanContent;

    if (isMobile) {
        return (
            <Drawer
                open={open}
                placement='bottom'
                size='92vh'
                onClose={onClose}
                destroyOnHidden
                title={asset ? `Tạo phiếu bảo trì (${selectedAssets.length} máy)` : 'Quét QR máy'}
                styles={{
                    body: { padding: 0, overflow: 'hidden' },
                    section: { borderRadius: '22px 22px 0 0' },
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
            title={asset ? `Tạo phiếu bảo trì (${selectedAssets.length} máy)` : 'Quét QR máy'}
        >
            {content}
        </Modal>
    );
};

export default QrQuickMaintenanceModal;
