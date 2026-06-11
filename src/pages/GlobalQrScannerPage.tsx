import React, { lazy, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Grid, Skeleton, Tag, Typography } from 'antd';
import {
    AuditOutlined,
    BuildOutlined,
    FileSearchOutlined,
    LinkOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    ScanOutlined,
    SwapOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import LazyBoundary from '../components/shared/LazyBoundary';
import QrCameraScanner from '../components/QrCameraScanner';
import QrQuickUpdateModal from '../components/QrQuickUpdateModal';
import MaintenanceFormModal from '../components/MaintenanceFormModal';
import { ASSET_STATUS_LABEL } from '../core/constants';
import { useAuth } from '../core/contexts/AuthContext';
import { extractPublicId, resolveAssetByScan } from '../core/lib/qrScan';
import { recordQrScan } from '../core/lib/qrScanAudit';
import { hasManagerAccess } from '../core/lib/permissions';
import { maintenanceService, type MaintenancePayload } from '../core/services/maintenance.service';
import { plantService } from '../core/services/plant.service';
import { qrLabelService } from '../core/services/qr-label.service';
import { transferService } from '../core/services/transfer.service';
import { AssetStatus, QrLabelStatus, type Asset, type CreateTransferPayload, type QrScanSource } from '../core/types';

const TransferModal = lazy(() => import('../components/transfer/TransferModal'));

const { Text } = Typography;
const { useBreakpoint } = Grid;

type ScanMeta = {
    rawValue?: string;
    publicId?: string;
    labelId?: string;
    source: QrScanSource;
    labelStatus?: QrLabelStatus;
    canActivate?: boolean;
};

type ScanResult = {
    asset: Asset | null;
    ambiguous: boolean;
    meta: ScanMeta;
    resolvedAt: number;
};

const canTransferAsset = (asset: Asset | null) =>
    Boolean(asset && asset.status !== AssetStatus.RETURNED_TO_PARTNER && !asset.hasOpenTransfer);

const getScanErrorText = (result: ScanResult | null) => {
    if (!result || result.asset) return '';
    if (result.ambiguous) return 'Mã này khớp nhiều máy. Hãy nhập mã máy chính xác hơn hoặc quét lại tem QR.';
    if (result.meta.canActivate) return 'Tem QR này chưa gắn với máy nào.';
    return 'Không tìm thấy máy hoặc tem QR hợp lệ từ mã vừa quét.';
};

const GlobalQrScannerPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { role } = useAuth();
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const canManage = hasManagerAccess(role);

    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [resolving, setResolving] = useState(false);
    const [quickUpdateOpen, setQuickUpdateOpen] = useState(false);
    const [maintenanceOpen, setMaintenanceOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);

    const asset = scanResult?.asset ?? null;
    const errorText = getScanErrorText(scanResult);
    const scannerActive = !resolving && !quickUpdateOpen && !maintenanceOpen && !transferOpen;

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const createMaintenanceMutation = useMutation({
        mutationFn: (payload: MaintenancePayload) => maintenanceService.create(payload),
        onSuccess: (maintenance) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            if (asset?.id) {
                queryClient.invalidateQueries({ queryKey: ['asset', asset.id] });
                queryClient.invalidateQueries({ queryKey: ['maintenances', 'asset', asset.id] });
                recordQrScan({
                    rawValue: scanResult?.meta.rawValue,
                    publicId: scanResult?.meta.publicId,
                    labelId: scanResult?.meta.labelId,
                    assetId: asset.id,
                    action: 'maintenance_quick_create_success',
                    result: 'success',
                    source: scanResult?.meta.source ?? 'unknown',
                    metadata: { context: 'global_scanner', maintenanceId: maintenance.id },
                });
            }
        },
    });

    const createTransferMutation = useMutation({
        mutationFn: transferService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['transfers-stats'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });

    const actionItems = useMemo(
        () =>
            [
                {
                    key: 'profile',
                    title: 'Mở hồ sơ máy',
                    description: 'Thông tin, lịch sử, QR và phát sinh của máy',
                    icon: <FileSearchOutlined />,
                    tone: 'blue',
                    disabled: !asset,
                    visible: Boolean(asset),
                    onClick: () => {
                        if (!asset) return;
                        recordQrScan({
                            rawValue: scanResult?.meta.rawValue,
                            publicId: scanResult?.meta.publicId,
                            labelId: scanResult?.meta.labelId,
                            assetId: asset.id,
                            action: 'open_profile',
                            result: 'success',
                            source: scanResult?.meta.source ?? 'unknown',
                            metadata: { context: 'global_scanner' },
                        });
                        navigate(`/assets/${asset.id}`);
                    },
                },
                {
                    key: 'quick-update',
                    title: 'Cập nhật nhanh',
                    description: 'Đổi trạng thái hoặc khu vực máy',
                    icon: <ToolOutlined />,
                    tone: 'emerald',
                    disabled: !asset || !canManage,
                    visible: Boolean(asset) && canManage,
                    onClick: () => {
                        if (!asset) return;
                        recordQrScan({
                            rawValue: scanResult?.meta.rawValue,
                            publicId: scanResult?.meta.publicId,
                            labelId: scanResult?.meta.labelId,
                            assetId: asset.id,
                            action: 'quick_update',
                            result: 'resolved',
                            source: scanResult?.meta.source ?? 'unknown',
                            metadata: { context: 'global_scanner' },
                        });
                        setQuickUpdateOpen(true);
                    },
                },
                {
                    key: 'maintenance',
                    title: 'Tạo phiếu bảo trì',
                    description: 'Lập phiếu sửa nội bộ hoặc sửa ngoài',
                    icon: <BuildOutlined />,
                    tone: 'amber',
                    disabled: !asset || asset.status === AssetStatus.RETURNED_TO_PARTNER,
                    visible: Boolean(asset),
                    onClick: () => {
                        if (!asset) return;
                        recordQrScan({
                            rawValue: scanResult?.meta.rawValue,
                            publicId: scanResult?.meta.publicId,
                            labelId: scanResult?.meta.labelId,
                            assetId: asset.id,
                            action: 'maintenance_quick_create',
                            result: 'resolved',
                            source: scanResult?.meta.source ?? 'unknown',
                            metadata: { context: 'global_scanner' },
                        });
                        setMaintenanceOpen(true);
                    },
                },
                {
                    key: 'transfer',
                    title: 'Tạo lệnh điều chuyển',
                    description: asset?.hasOpenTransfer
                        ? 'Máy đang có lệnh điều chuyển mở'
                        : 'Chuyển máy sang cơ sở/khu vực khác',
                    icon: <SwapOutlined />,
                    tone: 'indigo',
                    disabled: !canManage || !canTransferAsset(asset),
                    visible: Boolean(asset) && canManage,
                    onClick: () => {
                        if (!asset || !canTransferAsset(asset)) return;
                        recordQrScan({
                            rawValue: scanResult?.meta.rawValue,
                            publicId: scanResult?.meta.publicId,
                            labelId: scanResult?.meta.labelId,
                            assetId: asset.id,
                            action: 'transfer_scan',
                            result: 'resolved',
                            source: scanResult?.meta.source ?? 'unknown',
                            metadata: { context: 'global_scanner' },
                        });
                        setTransferOpen(true);
                    },
                },
                {
                    key: 'stocktake',
                    title: 'Vào kiểm kê QR',
                    description: 'Đối chiếu máy theo cơ sở/khu vực',
                    icon: <AuditOutlined />,
                    tone: 'slate',
                    disabled: !canManage,
                    visible: canManage,
                    onClick: () => {
                        if (asset) {
                            recordQrScan({
                                rawValue: scanResult?.meta.rawValue,
                                publicId: scanResult?.meta.publicId,
                                labelId: scanResult?.meta.labelId,
                                assetId: asset.id,
                                action: 'stocktake',
                                result: 'resolved',
                                source: scanResult?.meta.source ?? 'unknown',
                                metadata: { context: 'global_scanner_shortcut' },
                            });
                        }
                        navigate('/assets/stocktake');
                    },
                },
            ].filter((item) => item.visible),
        [asset, canManage, navigate, scanResult]
    );

    const resetScan = () => {
        setScanResult(null);
        setResolving(false);
    };

    const handleDetected = async (rawValue: string) => {
        if (resolving) return;

        setResolving(true);
        const publicId = extractPublicId(rawValue);

        try {
            try {
                const internal = await qrLabelService.resolveInternal(publicId);
                const meta: ScanMeta = {
                    rawValue,
                    publicId: internal.publicId,
                    labelId: internal.label?.id,
                    source: internal.source,
                    labelStatus: internal.status,
                    canActivate: internal.canActivate,
                };

                if (internal.asset?.id) {
                    setScanResult({ asset: internal.asset, ambiguous: false, meta, resolvedAt: Date.now() });
                    message.success(`Đã nhận diện "${internal.asset.name}"`);
                    return;
                }

                setScanResult({ asset: null, ambiguous: false, meta, resolvedAt: Date.now() });
                message.warning(
                    internal.canActivate ? 'Tem QR chưa gắn máy' : 'Tem QR chưa gắn máy hoặc chưa thể kích hoạt'
                );
                return;
            } catch {
                // Không phải tem QR nội bộ -> fallback sang tìm máy theo mã/tên.
            }

            const result = await resolveAssetByScan(rawValue);
            const meta: ScanMeta = {
                rawValue,
                publicId: result.publicId ?? publicId,
                labelId: result.labelId,
                source: result.source,
            };

            setScanResult({
                asset: result.asset,
                ambiguous: result.ambiguous,
                meta,
                resolvedAt: Date.now(),
            });

            if (result.asset) {
                message.success(`Đã nhận diện "${result.asset.name}"`);
                return;
            }

            recordQrScan({
                rawValue,
                publicId: meta.publicId,
                labelId: meta.labelId,
                action: 'open_profile',
                result: result.ambiguous ? 'ambiguous' : 'not_found',
                source: meta.source,
                metadata: { context: 'global_scanner_detect' },
            });
            message[result.ambiguous ? 'warning' : 'error'](
                result.ambiguous ? 'Mã này khớp nhiều máy.' : 'Không tìm thấy máy từ mã vừa quét.'
            );
        } finally {
            setResolving(false);
        }
    };

    const handleCreateMaintenance = async (payload: MaintenancePayload) => {
        await createMaintenanceMutation.mutateAsync(payload);
        message.success('Đã tạo phiếu bảo trì');
        setMaintenanceOpen(false);
    };

    const handleCreateTransfer = async (payload: CreateTransferPayload) => {
        await createTransferMutation.mutateAsync(payload);
        message.success('Đã tạo lệnh điều chuyển');
        setTransferOpen(false);
    };

    return (
        <div className='flex w-full max-w-full flex-col gap-4 overflow-hidden md:gap-6'>
            <PageHeader
                title='Quét QR'
                subtitle='Một điểm quét chung để mở hồ sơ, cập nhật nhanh, tạo bảo trì, điều chuyển hoặc kích hoạt tem.'
            />

            <section className='global-scan-hero'>
                <div className='relative z-10'>
                    <div className='flex items-start justify-between gap-4'>
                        <div className='min-w-0'>
                            <div className='text-xs font-black tracking-[0.16em] text-cyan-200 uppercase'>
                                HAIDANG QR HUB
                            </div>
                            <div className='mt-1 text-2xl leading-tight font-black text-white md:text-3xl'>
                                Quét một lần, chọn đúng việc
                            </div>
                            <div className='mt-2 max-w-2xl text-sm font-medium text-blue-50 md:text-base'>
                                Scanner toàn cục cho luồng quản lý máy trên điện thoại và desktop.
                            </div>
                        </div>
                        <div className='global-scan-hero__icon'>
                            <QrcodeOutlined />
                        </div>
                    </div>
                </div>
            </section>

            <div className='grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]'>
                <section className='rounded-3xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 xl:sticky xl:top-24 xl:self-start'>
                    <div className='mb-3 flex items-center justify-between gap-3'>
                        <div className='flex items-center gap-2 font-black text-slate-950'>
                            <ScanOutlined className='text-blue-600' />
                            Camera QR
                        </div>
                        {resolving ? <Tag color='processing'>Đang xử lý</Tag> : <Tag color='blue'>Sẵn sàng</Tag>}
                    </div>
                    <QrCameraScanner active={scannerActive} onDetected={handleDetected} cooldownMs={1000} />
                    {resolving ? (
                        <div className='mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3'>
                            <Skeleton active paragraph={{ rows: 1 }} title={false} />
                        </div>
                    ) : null}
                </section>

                <section className='rounded-3xl border border-slate-200 bg-white shadow-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5'>
                        <div>
                            <div className='font-black text-slate-950'>Kết quả quét</div>
                            <div className='text-sm text-slate-500'>
                                Chọn thao tác phù hợp với máy hoặc tem vừa quét.
                            </div>
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={resetScan}>
                            Quét lại
                        </Button>
                    </div>

                    <div className='p-4 md:p-5'>
                        {!scanResult ? (
                            <div className='rounded-3xl border border-dashed border-slate-300 bg-slate-50 py-10'>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có mã QR nào được quét' />
                            </div>
                        ) : asset ? (
                            <div className='flex flex-col gap-4'>
                                <div className='global-scan-asset-card'>
                                    <div className='flex min-w-0 items-start justify-between gap-3'>
                                        <div className='min-w-0'>
                                            <Text code className='!m-0 w-fit text-xs'>
                                                {asset.machineCode}
                                            </Text>
                                            <div className='mt-2 line-clamp-2 text-xl leading-snug font-black text-slate-950'>
                                                {asset.name}
                                            </div>
                                            <div className='mt-2 flex flex-wrap gap-1.5'>
                                                <Tag color='blue' className='!m-0'>
                                                    {asset.plant?.name || 'Chưa rõ cơ sở'}
                                                </Tag>
                                                <Tag className='!m-0'>{asset.area?.trim() || 'Chưa gắn khu vực'}</Tag>
                                                <Tag className='!m-0'>{ASSET_STATUS_LABEL[asset.status]}</Tag>
                                            </div>
                                        </div>
                                        <div className='global-scan-asset-card__icon'>
                                            <ToolOutlined />
                                        </div>
                                    </div>
                                    {asset.hasOpenTransfer ? (
                                        <Alert
                                            showIcon
                                            type='warning'
                                            className='mt-4 rounded-2xl'
                                            message='Máy đang có lệnh điều chuyển mở'
                                        />
                                    ) : null}
                                </div>

                                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                    {actionItems.map((item) => (
                                        <button
                                            key={item.key}
                                            type='button'
                                            disabled={item.disabled}
                                            onClick={item.onClick}
                                            className={`global-scan-action global-scan-action--${item.tone}`}
                                        >
                                            <span className='global-scan-action__icon'>{item.icon}</span>
                                            <span className='min-w-0 flex-1'>
                                                <span className='block text-sm font-black text-slate-950'>
                                                    {item.title}
                                                </span>
                                                <span className='mt-0.5 block text-xs font-semibold text-slate-500'>
                                                    {item.description}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className='flex flex-col gap-4'>
                                <Alert
                                    showIcon
                                    type={scanResult.meta.canActivate ? 'warning' : 'error'}
                                    message={errorText}
                                    className='rounded-2xl'
                                />
                                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                                    <div className='text-xs font-bold text-slate-500 uppercase'>Mã đã đọc</div>
                                    <div className='mt-2 font-mono text-sm font-bold break-all text-slate-900'>
                                        {scanResult.meta.publicId || scanResult.meta.rawValue || '-'}
                                    </div>
                                    {scanResult.meta.labelStatus ? (
                                        <Tag color='gold' className='!m-0 mt-3'>
                                            {scanResult.meta.labelStatus}
                                        </Tag>
                                    ) : null}
                                </div>
                                {scanResult.meta.canActivate && scanResult.meta.publicId && canManage ? (
                                    <Button
                                        type='primary'
                                        size='large'
                                        icon={<LinkOutlined />}
                                        onClick={() => navigate(`/qr/${scanResult.meta.publicId}/activate`)}
                                    >
                                        Kích hoạt / gán tem QR
                                    </Button>
                                ) : null}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <QrQuickUpdateModal
                open={quickUpdateOpen}
                asset={asset}
                onClose={() => setQuickUpdateOpen(false)}
                onUpdated={(nextAsset) => {
                    setScanResult((current) => (current ? { ...current, asset: nextAsset } : current));
                }}
                onScanNext={() => {
                    setQuickUpdateOpen(false);
                    resetScan();
                }}
            />

            {maintenanceOpen && asset ? (
                <MaintenanceFormModal
                    open
                    assets={[asset]}
                    initialAssetId={asset.id}
                    submitting={createMaintenanceMutation.isPending}
                    onClose={() => setMaintenanceOpen(false)}
                    onSubmit={handleCreateMaintenance}
                />
            ) : null}

            {transferOpen && asset ? (
                <LazyBoundary mode='overlay'>
                    <TransferModal
                        open
                        asset={asset}
                        assets={[asset]}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => setTransferOpen(false)}
                        onSubmit={handleCreateTransfer}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default GlobalQrScannerPage;
