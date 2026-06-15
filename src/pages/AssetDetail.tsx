import React, { lazy, useMemo, useState } from 'react';
import {
    App,
    Button,
    Card,
    Descriptions,
    Empty,
    Segmented,
    Spin,
    Tag,
    Tabs,
    Timeline,
    Tooltip,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    CalendarOutlined,
    EditOutlined,
    AimOutlined,
    EnvironmentOutlined,
    HistoryOutlined,
    RollbackOutlined,
    SwapOutlined,
    ToolOutlined,
    WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import AppBreadcrumb from '../components/navigation/AppBreadcrumb';
import LazyBoundary from '../components/shared/LazyBoundary';
import TransferHistorySection from '../components/transfer/TransferHistorySection';
import TransactionStatusBadge from '../components/transactions/TransactionStatusBadge';
import TransactionTypeBadge from '../components/transactions/TransactionTypeBadge';
import { useAuth } from '../core/contexts/AuthContext';
import { can, hasManagerAccess } from '../core/lib/permissions';
import { brandService, plantService } from '../core/services';
import { assetService } from '../core/services/asset.service';
import { borrowingService } from '../core/services/borrowing.service';
import { maintenanceService } from '../core/services/maintenance.service';
import { qrScanLogService } from '../core/services/qr-scan-log.service';
import { transferService } from '../core/services/transfer.service';
import { ASSET_OWNERSHIP_LABEL, isReturnedToPartner } from '../core/constants';
import type { Asset, AssetStatus, Borrowing, CreateTransferPayload, Maintenance, Transfer } from '../core/types';

const AssetFormModal = lazy(() => import('../components/AssetFormModal'));
const MaintenanceFormModal = lazy(() => import('../components/MaintenanceFormModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));
const HandoverModal = lazy(() => import('../components/transfer/HandoverModal'));

const { Text, Title } = Typography;

const STATUS_CFG: Record<AssetStatus, { label: string; color: string; badge: string }> = {
    active: { label: 'Đang hoạt động', color: 'green', badge: 'success' },
    maintenance: { label: 'Đang bảo trì', color: 'gold', badge: 'warning' },
    broken: { label: 'Lỗi / hỏng', color: 'red', badge: 'error' },
    borrowing: { label: 'Đang mượn', color: 'purple', badge: 'processing' },
    storage: { label: 'Tồn kho', color: 'default', badge: 'default' },
    returned_to_partner: { label: 'Đã trả đối tác', color: 'default', badge: 'default' },
};

const MAINT_LABEL: Record<string, string> = {
    completed: 'Hoàn thành',
    overdue: 'Quá hạn',
    in_progress: 'Đang làm',
    pending: 'Chờ xử lý',
};

const QR_SCAN_ACTION_LABEL: Record<string, string> = {
    open_profile: 'Mở hồ sơ',
    quick_update: 'Cập nhật nhanh',
    stocktake: 'Kiểm kê',
    transfer_scan: 'Quét điều chuyển',
    maintenance_quick_create: 'Tạo bảo trì',
    maintenance_quick_create_success: 'Tạo bảo trì thành công',
};

const QR_SCAN_RESULT_LABEL: Record<string, { label: string; color: string }> = {
    resolved: { label: 'Nhận diện', color: 'blue' },
    not_found: { label: 'Không tìm thấy', color: 'red' },
    ambiguous: { label: 'Trùng nhiều máy', color: 'orange' },
    duplicate: { label: 'Quét trùng', color: 'default' },
    present: { label: 'Có mặt', color: 'green' },
    wrong_area: { label: 'Sai khu vực', color: 'orange' },
    wrong_plant: { label: 'Sai cơ sở', color: 'red' },
    success: { label: 'Thành công', color: 'green' },
    failed: { label: 'Không hợp lệ', color: 'red' },
};

const formatDate = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');
const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');
const formatMoney = (value?: number) => (value ? `${value.toLocaleString('vi-VN')} đ` : '-');
const renderArea = (value?: string) => value || 'Chưa chỉ định khu vực';
const formatRelativeVi = (value?: string) => {
    if (!value) return '';
    const diffMs = Date.now() - new Date(value).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'vừa xong';
    if (min < 60) return `${min} phút trước`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return dayjs(value).format('DD/MM/YYYY');
};

const getTransferAssets = (transfer: Transfer) => {
    if (transfer.assets?.length) return transfer.assets;
    return transfer.asset ? [transfer.asset] : [];
};

const getTransferAssetLabel = (transfer: Transfer) => {
    const assets = getTransferAssets(transfer);
    if (assets.length === 1) return assets[0].name;
    if (assets.length > 1) return `${assets.length} máy`;
    return 'Máy';
};

const MetricCard = ({ title, value, icon }: { title: string; value: React.ReactNode; icon: React.ReactNode }) => (
    <Card variant='outlined' className='asset-detail-metric-card h-full'>
        <div className='flex items-start justify-between gap-3'>
            <div>
                <Text type='secondary' className='text-xs font-semibold tracking-wide uppercase'>
                    {title}
                </Text>
                <div className='mt-2 text-xl font-bold text-slate-900'>{value}</div>
            </div>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600'>
                {icon}
            </div>
        </div>
    </Card>
);

const AssetDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { role } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const canManage = hasManagerAccess(role);
    const canUpdateStatus = can(role, 'asset.status');

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [statusDraft, setStatusDraft] = useState<AssetStatus | undefined>();
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [completingId, setCompletingId] = useState<string | null>(null);
    const [handoverTransfer, setHandoverTransfer] = useState<Transfer | null>(null);
    const [tab, setTab] = useState('overview');

    const { data: asset, isLoading } = useQuery({
        queryKey: ['asset', id],
        queryFn: () => assetService.getById(id),
        enabled: Boolean(id),
    });
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });
    const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => brandService.getAll() });
    const { data: maintenances = [] } = useQuery({
        queryKey: ['maintenances', 'asset', id],
        queryFn: () => maintenanceService.getByAsset(id),
        enabled: Boolean(id),
    });
    const { data: transfers = [] } = useQuery({
        queryKey: ['transfers', 'asset', id],
        queryFn: () => transferService.getByAsset(id),
        enabled: Boolean(id),
    });
    const { data: borrowings = [] } = useQuery({
        queryKey: ['borrowings', 'asset', id],
        queryFn: () => borrowingService.getByAsset(id),
        enabled: Boolean(id),
    });
    const { data: qrScanLogResponse } = useQuery({
        queryKey: ['qr-scan-logs', 'asset', id],
        queryFn: () => qrScanLogService.getAll({ assetId: id, page: 1, limit: 20 }),
        enabled: Boolean(id && canManage),
    });

    const invalidateAsset = () => {
        queryClient.invalidateQueries({ queryKey: ['asset', id] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
    };

    const updateMutation = useMutation({
        mutationFn: (payload: { id: string; data: Partial<Asset> }) => assetService.update(payload.id, payload.data),
        onSuccess: () => {
            invalidateAsset();
            queryClient.invalidateQueries({ queryKey: ['asset-models'] });
        },
    });

    const statusMutation = useMutation({
        mutationFn: ({ nextStatus, note }: { nextStatus: AssetStatus; note?: string }) =>
            assetService.updateStatus(id, nextStatus, note),
        onSuccess: invalidateAsset,
    });

    const createTransferMutation = useMutation({
        mutationFn: transferService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            invalidateAsset();
        },
    });

    const createMaintenanceMutation = useMutation({
        mutationFn: maintenanceService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            invalidateAsset();
        },
    });

    const approveTransferMutation = useMutation({
        mutationFn: transferService.approve,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            invalidateAsset();
        },
    });

    const completeTransferMutation = useMutation({
        mutationFn: ({
            transferId,
            payload,
        }: {
            transferId: string;
            payload: { receivedBy: string; handoverImages?: string[] };
        }) => transferService.complete(transferId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers', 'asset', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            invalidateAsset();
        },
    });

    const historyItems = useMemo(() => {
        const maintenanceItems = maintenances.map((item: Maintenance) => ({
            key: `m-${item.id}`,
            date: item.endDate || item.startDate,
            color: item.status === 'completed' ? 'green' : item.status === 'overdue' ? 'red' : 'orange',
            title: `Bảo trì ${item.type}`,
            description: item.description,
            meta: item.technician ? `Kỹ thuật viên: ${item.technician}` : undefined,
        }));
        const transferItems = transfers.map((item: Transfer) => ({
            key: `t-${item.id}`,
            date: item.transferDate,
            color: item.status === 'completed' ? 'blue' : item.status === 'rejected' ? 'red' : 'gray',
            title: `Điều chuyển: ${item.fromPlant?.name || '?'} → ${item.toPlant?.name || '?'}`,
            description: item.reason,
            meta: getTransferAssetLabel(item),
        }));
        const borrowingItems = borrowings.map((item: Borrowing) => ({
            key: `b-${item.id}`,
            date: item.returnTime || item.borrowTime,
            color: item.status === 'returned' ? 'green' : 'gold',
            title: item.status === 'returned' ? 'Đã trả máy' : `Giao dịch ${item.type}`,
            description: item.purpose || item.partnerName || '',
            meta: item.borrowerName ? `Người mượn: ${item.borrowerName}` : undefined,
        }));

        return [...maintenanceItems, ...transferItems, ...borrowingItems].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [borrowings, maintenances, transfers]);

    const handleUpdate = async (values: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => {
        await updateMutation.mutateAsync({ id, data: values });
        message.success('Đã cập nhật máy');
        setIsFormOpen(false);
    };

    const handleCreateTransfer = async (payload: CreateTransferPayload) => {
        await createTransferMutation.mutateAsync(payload);
        message.success('Đã tạo lệnh điều chuyển');
        setIsTransferOpen(false);
    };

    const handleCreateMaintenance = async (payload: Parameters<typeof maintenanceService.create>[0]) => {
        await createMaintenanceMutation.mutateAsync(payload);
        message.success('Đã tạo phiếu bảo trì');
        setIsMaintenanceOpen(false);
    };

    const handleStatusChange = async (value: AssetStatus) => {
        setStatusDraft(value);
        await statusMutation.mutateAsync({ nextStatus: value });
        message.success('Đã cập nhật trạng thái');
    };

    const handleApprove = async (transfer: Transfer) => {
        try {
            setApprovingId(transfer.id);
            await approveTransferMutation.mutateAsync(transfer.id);
            message.success('Đã duyệt lệnh điều chuyển');
        } finally {
            setApprovingId(null);
        }
    };

    const handleHandover = async (payload: { receivedBy: string; handoverImages?: string[] }) => {
        if (!handoverTransfer) return;
        try {
            setCompletingId(handoverTransfer.id);
            await completeTransferMutation.mutateAsync({ transferId: handoverTransfer.id, payload });
            message.success('Đã hoàn tất điều chuyển');
            setHandoverTransfer(null);
        } finally {
            setCompletingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className='flex min-h-[50vh] items-center justify-center'>
                <Spin size='large' />
            </div>
        );
    }

    if (!asset) {
        return <Empty description='Không tìm thấy máy' className='py-20' />;
    }

    const currentStatus = statusDraft ?? asset.status;
    const status = STATUS_CFG[currentStatus as AssetStatus] || STATUS_CFG.active;
    const openTransfer = transfers.find((transfer: Transfer) => ['pending', 'approved'].includes(transfer.status));
    const hasOpenTransfer = asset.hasOpenTransfer || Boolean(openTransfer);
    const returnedToPartner = isReturnedToPartner(asset.status);
    const transferDisabledReason = returnedToPartner
        ? 'Máy đã trả đối tác, không thể điều chuyển'
        : hasOpenTransfer
          ? 'Máy đang có lệnh điều chuyển chưa hoàn tất'
          : '';
    const ownershipLabel = ASSET_OWNERSHIP_LABEL[asset.ownershipType] || ASSET_OWNERSHIP_LABEL.owned;

    const overviewContent = (
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
            <div className='flex flex-col gap-6 xl:col-span-2'>
                <Card variant='outlined' title='Thông tin máy' extra={<Tag color={status.color}>{status.label}</Tag>}>
                    <Descriptions
                        layout='vertical'
                        bordered
                        size='small'
                        column={{ xs: 1, sm: 2, md: 3 }}
                        items={[
                            { key: 'name', label: 'Tên máy', children: asset.name },
                            { key: 'machineCode', label: 'Mã máy', children: <Text code>{asset.machineCode}</Text> },
                            { key: 'serial', label: 'Serial', children: asset.serial || '-' },
                            { key: 'type', label: 'Loại máy', children: asset.type || '-' },
                            { key: 'model', label: 'Model', children: asset.model || '-' },
                            { key: 'brand', label: 'Nhãn hiệu', children: asset.brand?.name || '-' },
                            { key: 'plant', label: 'Cơ sở', children: asset.plant?.name || '-' },
                            { key: 'area', label: 'Khu vực', children: renderArea(asset.area) },
                            {
                                key: 'status',
                                label: 'Trạng thái',
                                children: <Tag color={status.color}>{status.label}</Tag>,
                            },
                            { key: 'ownershipType', label: 'Nguồn gốc máy', children: ownershipLabel },
                            { key: 'purchaseDate', label: 'Ngày mua', children: formatDate(asset.purchaseDate) },
                            { key: 'purchasePrice', label: 'Giá trị', children: formatMoney(asset.purchasePrice) },
                            { key: 'createdAt', label: 'Ngày nhập hệ thống', children: formatDate(asset.createdAt) },
                            { key: 'note', label: 'Ghi chú', span: 3, children: asset.note || '-' },
                        ]}
                    />
                </Card>

                <Card variant='outlined' title='Thông số kỹ thuật'>
                    {asset.specifications && Object.keys(asset.specifications).length > 0 ? (
                        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                            {Object.entries(asset.specifications).map(([key, value]) => (
                                <div key={key} className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                                    <Text type='secondary' className='text-xs font-semibold tracking-wide uppercase'>
                                        {key}
                                    </Text>
                                    <div className='mt-2 font-bold text-slate-900'>{String(value)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có thông số kỹ thuật' />
                    )}
                </Card>
            </div>

            <div className='flex flex-col gap-4'>
                <MetricCard
                    title='Cơ sở quản lý'
                    value={
                        <div>
                            <div>{asset.plant?.name || '-'}</div>
                            <Text type='secondary' className='text-sm'>
                                {renderArea(asset.area)}
                            </Text>
                        </div>
                    }
                    icon={<EnvironmentOutlined />}
                />
                <MetricCard
                    title='Vị trí gần nhất (theo lần quét QR)'
                    value={
                        asset.lastSeen?.plantName || asset.lastSeen?.scannedAt ? (
                            <div className='space-y-0.5'>
                                <div>{asset.lastSeen.plantName || '—'}</div>
                                <Text type='secondary' className='block text-sm'>
                                    {formatRelativeVi(asset.lastSeen.scannedAt)}
                                    {asset.lastSeen.scannedByName ? ` · ${asset.lastSeen.scannedByName}` : ''}
                                </Text>
                                <Text type='secondary' className='block text-xs'>
                                    {typeof asset.lastSeen.distanceM === 'number'
                                        ? `Cách cơ sở ~${asset.lastSeen.distanceM}m`
                                        : ''}
                                    {typeof asset.lastSeen.accuracy === 'number'
                                        ? ` · sai số GPS ±${asset.lastSeen.accuracy}m`
                                        : ''}
                                </Text>
                                {typeof asset.lastSeen.lat === 'number' && typeof asset.lastSeen.lng === 'number' ? (
                                    <a
                                        href={`https://www.google.com/maps?q=${asset.lastSeen.lat},${asset.lastSeen.lng}`}
                                        target='_blank'
                                        rel='noreferrer'
                                        className='text-xs text-blue-600'
                                    >
                                        Xem trên bản đồ
                                    </a>
                                ) : null}
                            </div>
                        ) : (
                            <Text type='secondary' className='text-sm'>
                                Chưa có dữ liệu — sẽ tự cập nhật khi quét QR có bật định vị
                            </Text>
                        )
                    }
                    icon={<AimOutlined />}
                />
                <MetricCard
                    title='Bảo trì'
                    value={
                        <div>
                            <div>{maintenances.length} lần</div>
                            <Text type='secondary' className='text-sm'>
                                Kế tiếp: {formatDate(asset.nextMaintenanceDate)}
                            </Text>
                        </div>
                    }
                    icon={<CalendarOutlined />}
                />
                <MetricCard title='Giá trị' value={formatMoney(asset.purchasePrice)} icon={<WalletOutlined />} />
                <Card variant='outlined' title='Thao tác nhanh'>
                    <div className='flex flex-col gap-2'>
                        <Tooltip title={transferDisabledReason}>
                            <Button
                                block
                                icon={<SwapOutlined />}
                                disabled={Boolean(transferDisabledReason)}
                                onClick={() => setIsTransferOpen(true)}
                            >
                                Tạo lệnh điều chuyển
                            </Button>
                        </Tooltip>
                        {canManage ? (
                            <Button
                                block
                                icon={<RollbackOutlined />}
                                disabled={returnedToPartner}
                                onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)}
                            >
                                Tạo giao dịch mượn / thuê
                            </Button>
                        ) : null}
                        <Button
                            block
                            icon={<ToolOutlined />}
                            disabled={returnedToPartner}
                            onClick={() => setIsMaintenanceOpen(true)}
                        >
                            Tạo phiếu bảo trì
                        </Button>
                        {canManage ? (
                            <Button block type='primary' icon={<EditOutlined />} onClick={() => setIsFormOpen(true)}>
                                Chỉnh sửa thông tin
                            </Button>
                        ) : null}
                    </div>
                </Card>
            </div>
        </div>
    );

    const maintenanceContent = (
        <Card variant='outlined' title='Lịch sử bảo trì' extra={<Tag>{maintenances.length} lần</Tag>}>
            {maintenances.length ? (
                <div className='divide-y divide-slate-100'>
                    {maintenances.map((item: Maintenance) => (
                        <div
                            key={item.id}
                            className='flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between'
                        >
                            <div className='flex flex-col gap-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <Text strong>{item.description || item.type}</Text>
                                    <Tag
                                        color={
                                            item.status === 'completed'
                                                ? 'green'
                                                : item.status === 'overdue'
                                                  ? 'red'
                                                  : 'gold'
                                        }
                                    >
                                        {MAINT_LABEL[item.status || 'pending'] || item.status}
                                    </Tag>
                                </div>
                                {item.technician ? (
                                    <Text type='secondary'>Kỹ thuật viên: {item.technician}</Text>
                                ) : null}
                                {item.cost ? <Text strong>{formatMoney(item.cost)}</Text> : null}
                                {item.note ? <Text type='secondary'>{item.note}</Text> : null}
                            </div>
                            <div className='text-left md:text-right'>
                                <Text strong>{formatDate(item.startDate)}</Text>
                                {item.endDate ? (
                                    <div>
                                        <Text type='secondary'>→ {formatDate(item.endDate)}</Text>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử bảo trì' />
            )}
        </Card>
    );

    const borrowingContent = (
        <Card
            variant='outlined'
            title='Lịch sử giao dịch'
            extra={
                canManage ? (
                    <Button
                        size='small'
                        icon={<RollbackOutlined />}
                        onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)}
                    >
                        Tạo giao dịch
                    </Button>
                ) : null
            }
        >
            {borrowings.length ? (
                <div className='divide-y divide-slate-100'>
                    {borrowings.map((item: Borrowing) => (
                        <button
                            key={item.id}
                            type='button'
                            className='flex w-full cursor-pointer flex-col gap-3 py-4 text-left transition-colors hover:bg-slate-50 md:flex-row md:items-start md:justify-between'
                            onClick={() => navigate(`/borrowings/${item.id}`)}
                        >
                            <div className='flex flex-col gap-1 px-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <Text strong>{item.borrowerName || item.partnerName || '-'}</Text>
                                    <TransactionTypeBadge type={item.type} />
                                    <TransactionStatusBadge status={item.status} />
                                </div>
                                {item.purpose ? <Text type='secondary'>{item.purpose}</Text> : null}
                                {item.location ? <Text type='secondary'>Vị trí: {item.location}</Text> : null}
                            </div>
                            <div className='px-1 text-left md:text-right'>
                                <Text strong>{formatDate(item.borrowTime)}</Text>
                                {item.returnTime ? (
                                    <div>
                                        <Text type='secondary'>→ {formatDate(item.returnTime)}</Text>
                                    </div>
                                ) : null}
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có giao dịch nào' />
            )}
        </Card>
    );

    const qrScanLogs = qrScanLogResponse?.data ?? [];
    const qrScanContent = (
        <Card variant='outlined' title='Lịch sử quét QR' extra={<Tag>{qrScanLogs.length} gần nhất</Tag>}>
            {qrScanLogs.length ? (
                <div className='divide-y divide-slate-100'>
                    {qrScanLogs.map((log) => {
                        const result = QR_SCAN_RESULT_LABEL[log.result] ?? { label: log.result, color: 'default' };
                        return (
                            <div
                                key={log.id}
                                className='flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between'
                            >
                                <div className='min-w-0'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <Text strong>{QR_SCAN_ACTION_LABEL[log.action] ?? log.action}</Text>
                                        <Tag color={result.color} className='!m-0'>
                                            {result.label}
                                        </Tag>
                                        {log.publicId ? <Tag className='!m-0 font-mono'>{log.publicId}</Tag> : null}
                                    </div>
                                    <div className='mt-1 text-xs text-slate-500'>
                                        {log.actor?.name || log.actor?.email || log.actorRole || 'Không rõ người quét'}
                                        {log.source ? ` · ${log.source}` : ''}
                                    </div>
                                </div>
                                <Text type='secondary' className='shrink-0 text-xs'>
                                    {formatDateTime(log.createdAt)}
                                </Text>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử quét QR' />
            )}
        </Card>
    );

    const historyContent = (
        <Card variant='outlined' title='Lịch sử hoạt động'>
            {historyItems.length ? (
                <Timeline
                    items={historyItems.map((item) => ({
                        key: item.key,
                        color: item.color,
                        children: (
                            <div className='pb-3'>
                                <Text type='secondary' className='text-xs font-semibold'>
                                    {formatDate(item.date)}
                                </Text>
                                <div className='mt-1 font-bold text-slate-900'>{item.title}</div>
                                {item.description ? (
                                    <div className='text-sm text-slate-600'>{item.description}</div>
                                ) : null}
                                {item.meta ? <Tag className='mt-2'>{item.meta}</Tag> : null}
                            </div>
                        ),
                    }))}
                />
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử' />
            )}
        </Card>
    );

    return (
        <div className='asset-detail-page flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <Card variant='outlined' className='asset-detail-header-card'>
                <div className='flex flex-col gap-5'>
                    <div className='asset-detail-header flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-start'>
                        <div className='asset-detail-header__info flex min-w-0 flex-col gap-3'>
                            <AppBreadcrumb />
                            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')} className='w-fit'>
                                Quay lại danh sách máy
                            </Button>
                            <div className='asset-detail-tags flex flex-wrap items-center gap-3'>
                                <Title level={3} className='!mb-0'>
                                    {asset.name}
                                </Title>
                                <Tag color='blue' className='font-mono text-sm'>
                                    {asset.machineCode}
                                </Tag>
                                <Tag color={status.color}>{status.label}</Tag>
                                {hasOpenTransfer ? (
                                    <Tag icon={<SwapOutlined />} color='gold'>
                                        Đang điều chuyển
                                    </Tag>
                                ) : null}
                                <Tag>{ownershipLabel}</Tag>
                            </div>
                            <div className='asset-detail-meta flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500'>
                                <span>
                                    Serial: <strong className='text-slate-800'>{asset.serial || '-'}</strong>
                                </span>
                                <span>
                                    Model: <strong className='text-slate-800'>{asset.model || '-'}</strong>
                                </span>
                                <span>
                                    Cơ sở: <strong className='text-slate-800'>{asset.plant?.name || '-'}</strong>
                                </span>
                            </div>
                        </div>

                        <div className='asset-detail-actions flex flex-wrap items-center gap-2'>
                            <Tooltip title={transferDisabledReason}>
                                <Button
                                    className='asset-detail-action-button'
                                    icon={<SwapOutlined />}
                                    disabled={Boolean(transferDisabledReason)}
                                    onClick={() => setIsTransferOpen(true)}
                                >
                                    Điều chuyển
                                </Button>
                            </Tooltip>
                            {canManage ? (
                                <Button
                                    className='asset-detail-action-button'
                                    icon={<RollbackOutlined />}
                                    disabled={returnedToPartner}
                                    onClick={() => navigate(`/borrowings/new?assetId=${asset.id}`)}
                                >
                                    Tạo giao dịch
                                </Button>
                            ) : null}
                            <Button
                                className='asset-detail-action-button'
                                icon={<ToolOutlined />}
                                disabled={returnedToPartner}
                                onClick={() => setIsMaintenanceOpen(true)}
                            >
                                Bảo trì
                            </Button>
                            {canManage ? (
                                <Button
                                    type='primary'
                                    className='asset-detail-action-button'
                                    icon={<EditOutlined />}
                                    onClick={() => setIsFormOpen(true)}
                                >
                                    Chỉnh sửa
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    {canUpdateStatus ? (
                        <div className='asset-detail-status-panel rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                            <div className='mb-3 flex items-center gap-2'>
                                <ToolOutlined className='text-slate-500' />
                                <Text strong>Cập nhật trạng thái nhanh</Text>
                            </div>
                            <Segmented<AssetStatus>
                                value={currentStatus}
                                size='small'
                                shape='round'
                                options={Object.entries(STATUS_CFG)
                                    .filter(
                                        ([value]) => !isReturnedToPartner(value as AssetStatus) || returnedToPartner
                                    )
                                    .map(([value, config]) => ({
                                        value: value as AssetStatus,
                                        label: config.label,
                                    }))}
                                onChange={handleStatusChange}
                            />
                        </div>
                    ) : null}
                </div>
            </Card>

            <Tabs
                className='asset-detail-tabs'
                activeKey={tab}
                onChange={setTab}
                destroyOnHidden
                items={[
                    { key: 'overview', label: 'Tổng quan', children: overviewContent },
                    { key: 'maintenance', label: `Bảo trì (${maintenances.length})`, children: maintenanceContent },
                    {
                        key: 'transfer',
                        label: `Điều chuyển (${transfers.length})`,
                        children: (
                            <TransferHistorySection
                                transfers={transfers}
                                loading={
                                    createTransferMutation.isPending ||
                                    approveTransferMutation.isPending ||
                                    completeTransferMutation.isPending
                                }
                                approvingTransferId={approvingId}
                                completingTransferId={completingId}
                                onCreate={returnedToPartner ? undefined : () => setIsTransferOpen(true)}
                                onApprove={canManage ? handleApprove : undefined}
                                onComplete={canManage ? setHandoverTransfer : undefined}
                            />
                        ),
                    },
                    { key: 'borrowing', label: `Giao dịch (${borrowings.length})`, children: borrowingContent },
                    ...(canManage
                        ? [
                              {
                                  key: 'qr-scan',
                                  label: `QR (${qrScanLogs.length})`,
                                  children: qrScanContent,
                              },
                          ]
                        : []),
                    {
                        key: 'history',
                        label: (
                            <span className='inline-flex items-center gap-1.5'>
                                <HistoryOutlined />
                                Lịch sử
                            </span>
                        ),
                        children: historyContent,
                    },
                ]}
            />

            {isFormOpen ? (
                <LazyBoundary mode='overlay'>
                    <AssetFormModal
                        open
                        onClose={() => setIsFormOpen(false)}
                        initialValues={asset}
                        onSubmit={handleUpdate}
                        plants={plants}
                        brands={brands}
                    />
                </LazyBoundary>
            ) : null}

            {isTransferOpen ? (
                <LazyBoundary mode='overlay'>
                    <TransferModal
                        open
                        asset={asset}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => setIsTransferOpen(false)}
                        onSubmit={handleCreateTransfer}
                    />
                </LazyBoundary>
            ) : null}

            {isMaintenanceOpen ? (
                <LazyBoundary mode='overlay'>
                    <MaintenanceFormModal
                        open
                        assets={[asset]}
                        initialAssetId={asset.id}
                        submitting={createMaintenanceMutation.isPending}
                        onClose={() => setIsMaintenanceOpen(false)}
                        onSubmit={handleCreateMaintenance}
                    />
                </LazyBoundary>
            ) : null}

            {handoverTransfer ? (
                <LazyBoundary mode='overlay'>
                    <HandoverModal
                        open
                        assetName={getTransferAssetLabel(handoverTransfer)}
                        submitting={completeTransferMutation.isPending}
                        onClose={() => setHandoverTransfer(null)}
                        onSubmit={handleHandover}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default AssetDetail;
