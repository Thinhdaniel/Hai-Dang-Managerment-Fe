import React, { lazy, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Grid, Skeleton, Tag, Typography } from 'antd';
import {
    AuditOutlined,
    BuildOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    FileSearchOutlined,
    HistoryOutlined,
    InboxOutlined,
    LinkOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    ScanOutlined,
    SwapOutlined,
    ThunderboltOutlined,
    ToolOutlined,
    WarningOutlined,
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
import { getCurrentCoords } from '../core/lib/geolocation';
import { evaluateScanLocation, type ScanLocationResult } from '../core/lib/locationMismatch';
import { hasManagerAccess } from '../core/lib/permissions';
import { maintenanceService, type MaintenancePayload } from '../core/services/maintenance.service';
import { plantService } from '../core/services/plant.service';
import { qrLabelService } from '../core/services/qr-label.service';
import { transferService } from '../core/services/transfer.service';
import {
    AssetOwnershipType,
    AssetStatus,
    QrLabelStatus,
    type Asset,
    type CreateTransferPayload,
    type QrScanSource,
} from '../core/types';

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

type SmartActionTone = 'blue' | 'emerald' | 'amber' | 'indigo' | 'slate' | 'rose' | 'violet';

type SmartScanAction = {
    key: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    tone: SmartActionTone;
    disabled: boolean;
    visible: boolean;
    recommended?: boolean;
    priority: number;
    badge?: string;
    onClick: () => void;
};

type SmartScanInsight = {
    title: string;
    description: string;
    tone: SmartActionTone;
    icon: React.ReactNode;
    checks: string[];
};

const OWNERSHIP_LABEL: Record<AssetOwnershipType, string> = {
    [AssetOwnershipType.OWNED]: 'Máy công ty',
    [AssetOwnershipType.PARTNER_BORROWED]: 'Máy mượn đối tác',
    [AssetOwnershipType.RENTAL]: 'Máy thuê',
};

const canTransferAsset = (asset: Asset | null) =>
    Boolean(asset && asset.status !== AssetStatus.RETURNED_TO_PARTNER && !asset.hasOpenTransfer);

const getScanErrorText = (result: ScanResult | null) => {
    if (!result || result.asset) return '';
    if (result.ambiguous) return 'Mã này khớp nhiều máy. Hãy nhập mã máy chính xác hơn hoặc quét lại tem QR.';
    if (result.meta.canActivate) return 'Tem QR này chưa gắn với máy nào.';
    return 'Không tìm thấy máy hoặc tem QR hợp lệ từ mã vừa quét.';
};

const isOverdue = (value?: string) => Boolean(value && new Date(value).getTime() < Date.now());

const isExternalOwnership = (asset: Asset) =>
    asset.ownershipType === AssetOwnershipType.PARTNER_BORROWED || asset.ownershipType === AssetOwnershipType.RENTAL;

const buildSmartInsight = (asset: Asset, canManage: boolean): SmartScanInsight => {
    if (asset.hasOpenTransfer) {
        return {
            title: 'Máy đang có lệnh điều chuyển mở',
            description: 'Ưu tiên kiểm tra lệnh hiện tại trước khi tạo thao tác mới để tránh lệch trạng thái máy.',
            tone: 'indigo',
            icon: <SwapOutlined />,
            checks: [
                'Không tạo thêm lệnh chuyển mới',
                'Kiểm tra nơi nhận và người bàn giao',
                'Chỉ cập nhật khi đã xác minh thực tế',
            ],
        };
    }

    if (asset.status === AssetStatus.BROKEN) {
        return {
            title: 'Nên tạo phiếu bảo trì ngay',
            description:
                'Máy đang ở trạng thái lỗi/hỏng. Luồng nhanh nên là ghi nhận sự cố, kỹ thuật và phương án sửa.',
            tone: 'rose',
            icon: <WarningOutlined />,
            checks: [
                'Ghi rõ triệu chứng lỗi',
                'Ưu tiên chụp ảnh hiện trạng ở bước sau',
                'Không điều chuyển khi chưa xác minh',
            ],
        };
    }

    if (asset.status === AssetStatus.MAINTENANCE) {
        return {
            title: 'Máy đang trong bảo trì',
            description: 'Ưu tiên xem phiếu bảo trì hoặc cập nhật trạng thái sau khi sửa xong.',
            tone: 'amber',
            icon: <BuildOutlined />,
            checks: ['Kiểm tra phiếu đang mở', 'Cập nhật chi phí nếu có', 'Chỉ chuyển về hoạt động khi đã nghiệm thu'],
        };
    }

    if (asset.status === AssetStatus.RETURNED_TO_PARTNER) {
        return {
            title: 'Máy đã trả đối tác',
            description: 'Chỉ nên xem hồ sơ hoặc lịch sử mượn/thuê, không tạo bảo trì/điều chuyển mới.',
            tone: 'violet',
            icon: <SafetyCertificateOutlined />,
            checks: ['Kiểm tra lịch sử trả máy', 'Không dùng lại nếu chưa kích hoạt lại', 'Xác minh tem QR còn hợp lệ'],
        };
    }

    if (asset.status === AssetStatus.STORAGE) {
        return {
            title: canManage ? 'Máy đang tồn kho, có thể điều phối' : 'Máy đang tồn kho',
            description: 'Phù hợp để điều chuyển, cập nhật khu vực lưu hoặc đưa về hoạt động khi đã lắp đặt.',
            tone: 'slate',
            icon: <InboxOutlined />,
            checks: [
                'Xác nhận khu vực lưu thực tế',
                'Kiểm tra tình trạng trước khi xuất dùng',
                'Cập nhật trạng thái nếu đã đưa vào xưởng',
            ],
        };
    }

    if (asset.status === AssetStatus.BORROWING || isExternalOwnership(asset)) {
        return {
            title:
                asset.ownershipType === AssetOwnershipType.RENTAL
                    ? 'Máy thuê cần theo dõi hạn/cost'
                    : 'Máy mượn cần theo dõi trả',
            description: 'Ưu tiên kiểm tra hồ sơ mượn/thuê, chi phí và tình trạng khi nhận/trả.',
            tone: 'violet',
            icon: <HistoryOutlined />,
            checks: ['Kiểm tra đối tác/người mượn', 'Theo dõi hạn trả', 'Ghi nhận tình trạng trước khi trả'],
        };
    }

    if (isOverdue(asset.nextMaintenanceDate)) {
        return {
            title: 'Máy đã đến hạn bảo trì',
            description: 'Nên tạo phiếu kiểm tra/bảo trì để tránh phát sinh lỗi trong vận hành.',
            tone: 'amber',
            icon: <ExclamationCircleOutlined />,
            checks: [
                'Kiểm tra lịch bảo trì gần nhất',
                'Tạo phiếu kiểm tra nếu cần',
                'Cập nhật lịch bảo trì sau khi xong',
            ],
        };
    }

    return {
        title: 'Máy đang sẵn sàng vận hành',
        description:
            'Có thể mở hồ sơ, báo hỏng nhanh, cập nhật vị trí hoặc tạo lệnh điều chuyển tùy tình huống thực tế.',
        tone: 'blue',
        icon: <ThunderboltOutlined />,
        checks: [
            'Ưu tiên báo hỏng nếu quét tại hiện trường',
            'Cập nhật khu vực nếu máy lệch vị trí',
            'Tạo lệnh chuyển khi đổi cơ sở',
        ],
    };
};

const buildAssetSignals = (asset: Asset) => {
    const signals = [
        { label: OWNERSHIP_LABEL[asset.ownershipType], color: isExternalOwnership(asset) ? 'purple' : 'blue' },
        { label: ASSET_STATUS_LABEL[asset.status], color: asset.status === AssetStatus.BROKEN ? 'red' : 'default' },
    ];

    if (asset.hasOpenTransfer) signals.push({ label: 'Có lệnh chuyển mở', color: 'gold' });
    if (!asset.area?.trim()) signals.push({ label: 'Chưa gắn khu vực', color: 'default' });
    if (isOverdue(asset.nextMaintenanceDate)) signals.push({ label: 'Đến hạn bảo trì', color: 'orange' });

    return signals;
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
    const [locationCheck, setLocationCheck] = useState<ScanLocationResult | null>(null);

    const asset = scanResult?.asset ?? null;
    const errorText = getScanErrorText(scanResult);
    const scannerActive = !scanResult && !resolving && !quickUpdateOpen && !maintenanceOpen && !transferOpen;

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

    const smartInsight = useMemo(() => (asset ? buildSmartInsight(asset, canManage) : null), [asset, canManage]);
    const assetSignals = useMemo(() => (asset ? buildAssetSignals(asset) : []), [asset]);

    const actionItems = useMemo<SmartScanAction[]>(() => {
        if (!asset) return [];

        const isReturned = asset.status === AssetStatus.RETURNED_TO_PARTNER;
        const hasTransfer = Boolean(asset.hasOpenTransfer);
        const dueMaintenance = isOverdue(asset.nextMaintenanceDate);
        const external = isExternalOwnership(asset);

        const items: SmartScanAction[] = [
            {
                key: 'maintenance',
                title: asset.status === AssetStatus.BROKEN ? 'Tạo phiếu sửa lỗi' : 'Báo hỏng / tạo bảo trì',
                description:
                    asset.status === AssetStatus.BROKEN
                        ? 'Ghi nhận sự cố, kỹ thuật, kiểu sửa và chi phí dự kiến'
                        : 'Lập phiếu kiểm tra, bảo trì định kỳ hoặc sửa ngoài',
                icon: <BuildOutlined />,
                tone: asset.status === AssetStatus.BROKEN ? 'rose' : 'amber',
                disabled: isReturned,
                visible: !isReturned,
                recommended:
                    asset.status === AssetStatus.BROKEN || dueMaintenance || asset.status === AssetStatus.ACTIVE,
                priority: asset.status === AssetStatus.BROKEN ? 100 : dueMaintenance ? 92 : 74,
                badge: asset.status === AssetStatus.BROKEN ? 'Ưu tiên' : dueMaintenance ? 'Đến hạn' : undefined,
                onClick: () => {
                    recordQrScan({
                        rawValue: scanResult?.meta.rawValue,
                        publicId: scanResult?.meta.publicId,
                        labelId: scanResult?.meta.labelId,
                        assetId: asset.id,
                        action: 'maintenance_quick_create',
                        result: 'resolved',
                        source: scanResult?.meta.source ?? 'unknown',
                        metadata: { context: 'global_scanner', smartReason: asset.status },
                    });
                    setMaintenanceOpen(true);
                },
            },
            {
                key: 'transfer-current',
                title: 'Xem lệnh điều chuyển',
                description: 'Máy đang có lệnh mở, kiểm tra tiến độ trước khi thao tác tiếp',
                icon: <SwapOutlined />,
                tone: 'indigo',
                disabled: false,
                visible: hasTransfer,
                recommended: hasTransfer,
                priority: 98,
                badge: 'Đang mở',
                onClick: () => navigate('/transfers'),
            },
            {
                key: 'quick-update',
                title:
                    asset.status === AssetStatus.MAINTENANCE
                        ? 'Hoàn tất / đổi trạng thái'
                        : asset.status === AssetStatus.STORAGE
                          ? 'Cập nhật tồn kho / khu vực'
                          : 'Cập nhật nhanh',
                description: 'Đổi trạng thái hoặc khu vực máy ngay tại hiện trường',
                icon: <ToolOutlined />,
                tone: 'emerald',
                disabled: !canManage,
                visible: canManage,
                recommended:
                    canManage &&
                    [AssetStatus.MAINTENANCE, AssetStatus.STORAGE, AssetStatus.BORROWING].includes(asset.status),
                priority:
                    asset.status === AssetStatus.MAINTENANCE ? 96 : asset.status === AssetStatus.STORAGE ? 88 : 66,
                badge: asset.status === AssetStatus.MAINTENANCE ? 'Sau sửa' : undefined,
                onClick: () => {
                    recordQrScan({
                        rawValue: scanResult?.meta.rawValue,
                        publicId: scanResult?.meta.publicId,
                        labelId: scanResult?.meta.labelId,
                        assetId: asset.id,
                        action: 'quick_update',
                        result: 'resolved',
                        source: scanResult?.meta.source ?? 'unknown',
                        metadata: { context: 'global_scanner', smartReason: asset.status },
                    });
                    setQuickUpdateOpen(true);
                },
            },
            {
                key: 'transfer',
                title: asset.status === AssetStatus.STORAGE ? 'Điều phối máy tồn kho' : 'Tạo lệnh điều chuyển',
                description: hasTransfer
                    ? 'Máy đang có lệnh điều chuyển mở'
                    : 'Chuyển máy sang cơ sở/khu vực khác đúng quy trình',
                icon: <SwapOutlined />,
                tone: 'indigo',
                disabled: !canManage || !canTransferAsset(asset),
                visible: canManage && !hasTransfer && !isReturned,
                recommended:
                    canManage && !hasTransfer && [AssetStatus.ACTIVE, AssetStatus.STORAGE].includes(asset.status),
                priority: asset.status === AssetStatus.STORAGE ? 94 : 70,
                onClick: () => {
                    if (!canTransferAsset(asset)) return;
                    recordQrScan({
                        rawValue: scanResult?.meta.rawValue,
                        publicId: scanResult?.meta.publicId,
                        labelId: scanResult?.meta.labelId,
                        assetId: asset.id,
                        action: 'transfer_scan',
                        result: 'resolved',
                        source: scanResult?.meta.source ?? 'unknown',
                        metadata: { context: 'global_scanner', smartReason: asset.status },
                    });
                    setTransferOpen(true);
                },
            },
            {
                key: 'borrowings',
                title: asset.ownershipType === AssetOwnershipType.RENTAL ? 'Theo dõi máy thuê' : 'Theo dõi mượn / trả',
                description: 'Xem lịch sử mượn, thuê, đối tác, chi phí và tình trạng trả máy',
                icon: <HistoryOutlined />,
                tone: 'violet',
                disabled: false,
                visible: external || asset.status === AssetStatus.BORROWING || isReturned,
                recommended: external || asset.status === AssetStatus.BORROWING || isReturned,
                priority: asset.status === AssetStatus.BORROWING ? 93 : isReturned ? 90 : 82,
                badge: asset.ownershipType === AssetOwnershipType.RENTAL ? 'Thuê' : external ? 'Đối tác' : undefined,
                onClick: () => navigate('/borrowings'),
            },
            {
                key: 'maintenance-list',
                title: 'Xem phiếu bảo trì',
                description: 'Theo dõi phiếu đang xử lý, lịch sử sửa và chi phí',
                icon: <HistoryOutlined />,
                tone: 'amber',
                disabled: false,
                visible: asset.status === AssetStatus.MAINTENANCE,
                recommended: asset.status === AssetStatus.MAINTENANCE,
                priority: 95,
                badge: 'Đang sửa',
                onClick: () => navigate('/maintenances'),
            },
            {
                key: 'profile',
                title: 'Mở hồ sơ máy',
                description: 'Thông tin, lịch sử, QR và phát sinh của máy',
                icon: <FileSearchOutlined />,
                tone: 'blue',
                disabled: false,
                visible: true,
                recommended: isReturned && !external,
                priority: isReturned ? 91 : 50,
                onClick: () => {
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
                key: 'stocktake',
                title: 'Vào kiểm kê QR',
                description: 'Đối chiếu máy theo cơ sở/khu vực',
                icon: <AuditOutlined />,
                tone: 'slate',
                disabled: !canManage,
                visible: canManage,
                priority: 35,
                onClick: () => {
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
                    navigate('/assets/stocktake');
                },
            },
        ];

        return items
            .filter((item) => item.visible)
            .sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0) || b.priority - a.priority);
    }, [asset, canManage, navigate, scanResult]);

    const primaryAction = actionItems.find((item) => item.recommended && !item.disabled) ?? actionItems[0];
    const secondaryActions = primaryAction ? actionItems.filter((item) => item.key !== primaryAction.key) : actionItems;

    const resetScan = () => {
        setScanResult(null);
        setResolving(false);
        setLocationCheck(null);
    };

    // Đối chiếu GPS real-time: cơ sở gần nhất theo GPS vs cơ sở hệ thống của máy.
    const runLocationCheck = async (resolvedAsset: Asset) => {
        try {
            const coords = await getCurrentCoords();
            setLocationCheck(
                evaluateScanLocation({
                    coords,
                    plants,
                    officialPlantId: resolvedAsset.plant?.id ?? resolvedAsset.plantId,
                })
            );
        } catch {
            setLocationCheck(null);
        }
    };

    const handleDetected = async (rawValue: string) => {
        if (resolving) return;

        setResolving(true);
        setLocationCheck(null);
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
                    void runLocationCheck(internal.asset);
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
                void runLocationCheck(result.asset);
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
                    <QrCameraScanner active={scannerActive} onDetected={handleDetected} cooldownMs={2200} />
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
                                                {assetSignals.map((signal) => (
                                                    <Tag key={signal.label} color={signal.color} className='!m-0'>
                                                        {signal.label}
                                                    </Tag>
                                                ))}
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

                                {locationCheck?.mismatch ? (
                                    <Alert
                                        showIcon
                                        type='warning'
                                        className='rounded-2xl'
                                        message='Lệch vị trí so với hệ thống'
                                        description={
                                            <div className='space-y-1 text-sm'>
                                                <div>
                                                    GPS cho thấy máy đang ở{' '}
                                                    <b>{locationCheck.nearestPlant?.name || 'cơ sở khác'}</b>
                                                    {typeof locationCheck.distanceM === 'number'
                                                        ? ` (cách ~${locationCheck.distanceM}m)`
                                                        : ''}
                                                    , nhưng hệ thống ghi{' '}
                                                    <b>{asset.plant?.name || 'cơ sở khác'}</b>.
                                                </div>
                                                {canManage && canTransferAsset(asset) ? (
                                                    <Button
                                                        size='small'
                                                        type='primary'
                                                        icon={<SwapOutlined />}
                                                        className='mt-1'
                                                        onClick={() => setTransferOpen(true)}
                                                    >
                                                        Tạo lệnh điều chuyển
                                                    </Button>
                                                ) : null}
                                            </div>
                                        }
                                    />
                                ) : null}

                                {smartInsight && primaryAction ? (
                                    <div
                                        className={`global-scan-smart-panel global-scan-smart-panel--${smartInsight.tone}`}
                                    >
                                        <div className='flex min-w-0 items-start gap-3'>
                                            <div className='global-scan-smart-panel__icon'>{smartInsight.icon}</div>
                                            <div className='min-w-0 flex-1'>
                                                <div className='flex flex-wrap items-center gap-2'>
                                                    <span className='text-xs font-black tracking-[0.16em] text-slate-500 uppercase'>
                                                        Đề xuất thông minh
                                                    </span>
                                                    {primaryAction.badge ? (
                                                        <Tag color='processing' className='!m-0 rounded-full'>
                                                            {primaryAction.badge}
                                                        </Tag>
                                                    ) : null}
                                                </div>
                                                <div className='mt-1 text-lg leading-snug font-black text-slate-950'>
                                                    {smartInsight.title}
                                                </div>
                                                <div className='mt-1 text-sm font-semibold text-slate-600'>
                                                    {smartInsight.description}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type='button'
                                            disabled={primaryAction.disabled}
                                            onClick={primaryAction.onClick}
                                            className={`global-scan-primary-action global-scan-primary-action--${primaryAction.tone}`}
                                        >
                                            <span className='global-scan-primary-action__icon'>
                                                {primaryAction.icon}
                                            </span>
                                            <span className='min-w-0 flex-1'>
                                                <span className='block text-sm font-black'>{primaryAction.title}</span>
                                                <span className='mt-0.5 block text-xs font-semibold opacity-80'>
                                                    {primaryAction.description}
                                                </span>
                                            </span>
                                            <CheckCircleOutlined className='text-lg' />
                                        </button>

                                        <div className='global-scan-smart-panel__checks'>
                                            {smartInsight.checks.map((check) => (
                                                <span key={check} className='global-scan-smart-panel__check'>
                                                    <CheckCircleOutlined />
                                                    {check}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                    {secondaryActions.map((item) => (
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
                                            {item.badge ? (
                                                <span className='global-scan-action__badge'>{item.badge}</span>
                                            ) : null}
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
                                    <div className='global-scan-smart-panel global-scan-smart-panel--amber'>
                                        <div className='flex min-w-0 items-start gap-3'>
                                            <div className='global-scan-smart-panel__icon'>
                                                <LinkOutlined />
                                            </div>
                                            <div className='min-w-0 flex-1'>
                                                <div className='text-xs font-black tracking-[0.16em] text-slate-500 uppercase'>
                                                    Tem QR trắng
                                                </div>
                                                <div className='mt-1 text-lg leading-snug font-black text-slate-950'>
                                                    Nên kích hoạt và gán vào máy
                                                </div>
                                                <div className='mt-1 text-sm font-semibold text-slate-600'>
                                                    Tem này chưa liên kết với máy nào, phù hợp để cập nhật thông tin máy
                                                    tại hiện trường.
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type='button'
                                            onClick={() => navigate(`/qr/${scanResult.meta.publicId}/activate`)}
                                            className='global-scan-primary-action global-scan-primary-action--amber'
                                        >
                                            <span className='global-scan-primary-action__icon'>
                                                <LinkOutlined />
                                            </span>
                                            <span className='min-w-0 flex-1'>
                                                <span className='block text-sm font-black'>Kích hoạt / gán tem QR</span>
                                                <span className='mt-0.5 block text-xs font-semibold opacity-80'>
                                                    Mở form cập nhật thông tin máy cho tem này
                                                </span>
                                            </span>
                                            <CheckCircleOutlined className='text-lg' />
                                        </button>
                                        <div className='global-scan-smart-panel__checks'>
                                            {[
                                                'Gán đúng máy thực tế',
                                                'Điền đủ cơ sở/khu vực',
                                                'Kiểm tra mã trước khi dán',
                                            ].map((check) => (
                                                <span key={check} className='global-scan-smart-panel__check'>
                                                    <CheckCircleOutlined />
                                                    {check}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                                        <Button size='large' icon={<ReloadOutlined />} onClick={resetScan}>
                                            Quét lại
                                        </Button>
                                        <Button
                                            size='large'
                                            icon={<FileSearchOutlined />}
                                            onClick={() => navigate('/assets')}
                                        >
                                            Tìm trong danh sách máy
                                        </Button>
                                    </div>
                                )}
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
