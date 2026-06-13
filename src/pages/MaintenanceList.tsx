import React, { lazy, useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    DatePicker,
    Descriptions,
    Divider,
    Drawer,
    Empty,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Timeline,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    CheckOutlined,
    CloseOutlined,
    DeleteOutlined,
    DollarOutlined,
    EyeOutlined,
    FileExcelOutlined,
    FilterOutlined,
    MessageOutlined,
    PlusOutlined,
    ReloadOutlined,
    ScanOutlined,
    SearchOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useLocation, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import StatsCard from '../components/shared/StatsCard';
import ContextChatDrawer from '../components/chat/ContextChatDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { assetService } from '../core/services/asset.service';
import { maintenanceService, type MaintenancePayload } from '../core/services/maintenance.service';
import { plantService } from '../core/services/plant.service';
import type { Maintenance, MaintenanceFilter, MaintenanceRepairMode, MaintenanceType } from '../core/types';

const MaintenanceFormModal = lazy(() => import('../components/MaintenanceFormModal'));
const QrQuickMaintenanceModal = lazy(() => import('../components/QrQuickMaintenanceModal'));

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { useBreakpoint } = Grid;

type CompleteFormValues = {
    endDate: Dayjs;
    note?: string;
    cost?: number;
    externalRepair?: {
        returnedAt?: Dayjs;
        actualCost?: number;
        invoiceNo?: string;
        costItems?: { name?: string; amount?: number; note?: string }[];
    };
};

const createDefaultFilters = () => ({
    page: 1,
    limit: 10,
    search: '',
    assetId: undefined as string | undefined,
    status: undefined as MaintenanceFilter['status'],
    repairMode: undefined as MaintenanceRepairMode | undefined,
    type: undefined as MaintenanceType | undefined,
    plantId: undefined as string | undefined,
    dateRange: undefined as [Dayjs, Dayjs] | undefined,
});

const createFiltersFromSearch = (search: string) => {
    const params = new URLSearchParams(search);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    const dateRange =
        startDate && endDate && dayjs(startDate).isValid() && dayjs(endDate).isValid()
            ? ([dayjs(startDate), dayjs(endDate)] as [Dayjs, Dayjs])
            : undefined;

    return {
        ...createDefaultFilters(),
        search: params.get('search') ?? '',
        assetId: params.get('assetId') ?? undefined,
        status: (params.get('status') || undefined) as MaintenanceFilter['status'],
        repairMode: (params.get('repairMode') || undefined) as MaintenanceRepairMode | undefined,
        type: (params.get('type') || undefined) as MaintenanceType | undefined,
        plantId: params.get('plantId') ?? undefined,
        dateRange,
    };
};

const typeLabel: Record<string, string> = {
    periodic: 'Định kỳ',
    emergency: 'Sự cố',
    inspection: 'Kiểm tra',
};

const statusMeta: Record<string, { label: string; color: string }> = {
    pending: { label: 'Chờ xử lý', color: 'default' },
    in_progress: { label: 'Đang sửa', color: 'processing' },
    completed: { label: 'Hoàn tất', color: 'success' },
    overdue: { label: 'Quá hạn', color: 'error' },
    cancelled: { label: 'Đã hủy', color: 'default' },
};

const approvalMeta: Record<string, { label: string; color: string }> = {
    none: { label: 'Không cần duyệt', color: 'default' },
    pending: { label: 'Chờ duyệt', color: 'warning' },
    approved: { label: 'Đã duyệt', color: 'success' },
    rejected: { label: 'Từ chối', color: 'error' },
};

const fmtDate = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');
const fmtMoney = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const toIso = (value?: Dayjs) => (value ? value.toISOString() : undefined);
const sumCostItems = (items?: { amount?: number | null }[]) =>
    Number((items ?? []).reduce((sum, item) => sum + Number(item?.amount ?? 0), 0).toFixed(2));
const buildMaintenanceCode = (item: Maintenance) =>
    `MNT-${new Date(item.createdAt || item.startDate).getFullYear()}-${item.id.slice(-5).toUpperCase()}`;
const getRepairModeLabel = (value?: string) => (value === 'external' ? 'Sửa ngoài' : 'Nội bộ');
const getMaintenanceAssets = (record: Maintenance) =>
    record.assets?.length ? record.assets : record.asset ? [record.asset] : [];
const getMaintenanceAssetLabel = (record: Maintenance) => {
    const assets = getMaintenanceAssets(record);
    if (assets.length > 1) return `${assets.length} máy`;
    return assets[0]?.name || 'Máy chưa xác định';
};
const getStatusTag = (value?: string) => {
    const status = statusMeta[value || 'pending'] ?? { label: value || '-', color: 'default' };
    return <Tag color={status.color}>{status.label}</Tag>;
};
const getApprovalTag = (value?: string) => {
    const approval = approvalMeta[value || 'none'] ?? { label: value || '-', color: 'default' };
    return <Tag color={approval.color}>{approval.label}</Tag>;
};
const canCompleteMaintenance = (record: Maintenance) => {
    if (!['pending', 'in_progress', 'overdue'].includes(record.status || '')) return false;
    if (record.repairMode === 'external') return record.approvalStatus === 'approved';
    return true;
};
const getMaintenanceAccent = (record: Maintenance) => {
    if (record.status === 'overdue') return '#dc2626';
    if (record.status === 'completed') return '#16a34a';
    if (record.repairMode === 'external') return '#f97316';
    if (record.status === 'in_progress') return '#0ea5e9';
    return '#2563eb';
};

const MaintenanceList: React.FC = () => {
    const queryClient = useQueryClient();
    const { role } = useAuth();
    const { message } = App.useApp();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const canManage = hasManagerAccess(role);
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const initialFilters = useMemo(() => createFiltersFromSearch(location.search), [location.search]);

    const [filters, setFilters] = useState(initialFilters);
    const [draftFilters, setDraftFilters] = useState(initialFilters);
    const [createOpen, setCreateOpen] = useState(false);
    const [quickMaintenanceOpen, setQuickMaintenanceOpen] = useState(false);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [detailTarget, setDetailTarget] = useState<Maintenance | null>(null);
    const [chatTarget, setChatTarget] = useState<Maintenance | null>(null);
    const [completeTarget, setCompleteTarget] = useState<Maintenance | null>(null);
    const [rejectTarget, setRejectTarget] = useState<Maintenance | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [completeForm] = Form.useForm<CompleteFormValues>();
    const watchedCostItems = Form.useWatch(['externalRepair', 'costItems'], completeForm);
    const watchedInternalCost = Form.useWatch('cost', completeForm);

    const completeCostPreview = useMemo(() => {
        if (completeTarget?.repairMode === 'external') {
            return sumCostItems(watchedCostItems as { amount?: number | null }[] | undefined);
        }
        return Number(watchedInternalCost ?? 0);
    }, [completeTarget?.repairMode, watchedCostItems, watchedInternalCost]);

    const completeEstimateCost = completeTarget?.externalRepair?.estimateCost ?? 0;
    const completeCostDiff = completeCostPreview - completeEstimateCost;

    // Deep-link từ chat "Mở phiếu": ?maintenance=<id> → mở drawer chi tiết rồi gỡ param khỏi URL
    const deepLinkId = searchParams.get('maintenance');
    useEffect(() => {
        if (!deepLinkId) return;

        let cancelled = false;
        maintenanceService
            .getById(deepLinkId)
            .then((record) => {
                if (!cancelled) setDetailTarget(record);
            })
            .catch(() => {
                if (!cancelled) message.error('Không tìm thấy phiếu bảo trì từ liên kết');
            })
            .finally(() => {
                if (cancelled) return;
                setSearchParams(
                    (prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('maintenance');
                        return next;
                    },
                    { replace: true }
                );
            });

        return () => {
            cancelled = true;
        };
    }, [deepLinkId, message, setSearchParams]);

    const requestParams = useMemo(
        () => ({
            page: filters.page,
            limit: filters.limit,
            search: filters.search || undefined,
            assetId: filters.assetId,
            status: filters.status,
            repairMode: filters.repairMode,
            type: filters.type,
            plantId: filters.plantId,
            startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
            endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
        }),
        [filters]
    );

    const reportParams = useMemo(
        () => ({
            startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD') ?? dayjs().startOf('month').format('YYYY-MM-DD'),
            endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD') ?? dayjs().endOf('day').format('YYYY-MM-DD'),
            groupBy: 'month' as const,
        }),
        [filters.dateRange]
    );

    const { data: assetsResponse } = useQuery({
        queryKey: ['assets', 'maintenance-select'],
        queryFn: () => assetService.getAll({ page: 1, limit: 1000 }),
        staleTime: 60_000,
    });
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });
    const { data: maintenanceResponse, isLoading } = useQuery({
        queryKey: ['maintenances', requestParams],
        queryFn: () => maintenanceService.getAll(requestParams),
    });
    const { data: report } = useQuery({
        queryKey: ['maintenances', 'report', reportParams],
        queryFn: () => maintenanceService.getReport(reportParams),
    });

    const assets = assetsResponse?.data ?? [];
    const maintenances = maintenanceResponse?.data ?? [];
    const totalMaintenances = maintenanceResponse?.total ?? 0;
    const activeFilterItems = useMemo(() => {
        const items: string[] = [];
        const selectedPlant = plants.find((plant) => plant.id === filters.plantId);

        if (filters.search.trim()) items.push(`Từ khóa: ${filters.search.trim()}`);
        if (filters.dateRange) {
            items.push(`${filters.dateRange[0].format('DD/MM/YYYY')} - ${filters.dateRange[1].format('DD/MM/YYYY')}`);
        }
        if (filters.repairMode) items.push(getRepairModeLabel(filters.repairMode));
        if (filters.status) items.push(statusMeta[filters.status]?.label ?? filters.status);
        if (selectedPlant) items.push(selectedPlant.name);

        return items;
    }, [filters, plants]);

    const invalidateMaintenance = () => {
        queryClient.invalidateQueries({ queryKey: ['maintenances'] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const createMutation = useMutation({
        mutationFn: (payload: MaintenancePayload) => maintenanceService.create(payload),
        onSuccess: invalidateMaintenance,
    });
    const approveMutation = useMutation({
        mutationFn: (id: string) => maintenanceService.approve(id),
        onSuccess: invalidateMaintenance,
    });
    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => maintenanceService.reject(id, reason),
        onSuccess: invalidateMaintenance,
    });
    const completeMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof maintenanceService.complete>[1] }) =>
            maintenanceService.complete(id, payload),
        onSuccess: invalidateMaintenance,
    });
    const deleteMutation = useMutation({
        mutationFn: maintenanceService.delete,
        onSuccess: invalidateMaintenance,
    });

    const applyFilters = () => setFilters({ ...draftFilters, search: draftFilters.search.trim(), page: 1 });

    const resetFilters = () => {
        const next = createDefaultFilters();
        setDraftFilters(next);
        setFilters(next);
    };

    const applyFiltersAndClose = () => {
        applyFilters();
        setMobileFilterOpen(false);
    };

    const resetFiltersAndClose = () => {
        resetFilters();
        setMobileFilterOpen(false);
    };

    const handleCreate = async (payload: MaintenancePayload) => {
        await createMutation.mutateAsync(payload);
        message.success('Đã tạo phiếu bảo trì');
        setCreateOpen(false);
    };

    const openCompleteModal = (record: Maintenance) => {
        setCompleteTarget(record);
        completeForm.setFieldsValue({
            endDate: dayjs(),
            cost: record.cost,
            externalRepair: {
                returnedAt: dayjs(),
                actualCost: record.externalRepair?.actualCost ?? record.cost,
                invoiceNo: record.externalRepair?.invoiceNo,
                costItems: record.externalRepair?.costItems?.length
                    ? record.externalRepair.costItems
                    : [{ name: 'Chi phí sửa ngoài', amount: record.externalRepair?.actualCost ?? record.cost }],
            },
        });
    };

    const handleComplete = async () => {
        if (!completeTarget) return;
        const values = await completeForm.validateFields();
        const costItems = values.externalRepair?.costItems?.filter((item) => item?.name || item?.amount);
        const cost = completeTarget.repairMode === 'external' ? sumCostItems(costItems) : values.cost;

        await completeMutation.mutateAsync({
            id: completeTarget.id,
            payload: {
                endDate: toIso(values.endDate) ?? new Date().toISOString(),
                note: values.note,
                cost,
                externalRepair:
                    completeTarget.repairMode === 'external'
                        ? {
                              ...completeTarget.externalRepair,
                              returnedAt: toIso(values.externalRepair?.returnedAt),
                              actualCost: cost,
                              invoiceNo: values.externalRepair?.invoiceNo,
                              costItems,
                          }
                        : undefined,
            },
        });
        message.success('Đã hoàn tất phiếu bảo trì');
        setCompleteTarget(null);
        completeForm.resetFields();
    };

    const handleApprove = async (record: Maintenance) => {
        await approveMutation.mutateAsync(record.id);
        message.success('Đã duyệt phiếu sửa ngoài');
    };

    const handleExportXlsx = async (record: Maintenance) => {
        setExportingId(record.id);
        try {
            await maintenanceService.exportXlsx(record.id, buildMaintenanceCode(record));
        } catch {
            message.error('Không xuất được phiếu Excel');
        } finally {
            setExportingId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectTarget || !rejectReason.trim()) return;
        await rejectMutation.mutateAsync({ id: rejectTarget.id, reason: rejectReason.trim() });
        message.success('Đã từ chối phiếu sửa ngoài');
        setRejectTarget(null);
        setRejectReason('');
    };

    const handleDelete = async (record: Maintenance) => {
        await deleteMutation.mutateAsync(record.id);
        message.success('Đã xóa phiếu bảo trì');
        if (detailTarget?.id === record.id) {
            setDetailTarget(null);
        }
    };

    const renderRecordActions = (
        record: Maintenance,
        mode: 'table' | 'mobile' = 'table',
        options: { showDetail?: boolean } = {}
    ) => {
        const isMobileActions = mode === 'mobile';
        const buttonType = isMobileActions ? 'default' : 'text';
        const buttonSize = isMobileActions ? 'middle' : 'small';
        const showDetail = options.showDetail ?? true;

        return (
            <div
                className={isMobileActions ? 'grid grid-cols-2 gap-2' : 'flex items-center justify-end gap-1'}
                onClick={(event) => event.stopPropagation()}
            >
                {showDetail ? (
                    <Tooltip title={isMobileActions ? undefined : 'Xem chi tiết'}>
                        <Button
                            block={isMobileActions}
                            size={buttonSize}
                            type={buttonType}
                            icon={<EyeOutlined />}
                            onClick={() => setDetailTarget(record)}
                        >
                            {isMobileActions ? 'Chi tiết' : null}
                        </Button>
                    </Tooltip>
                ) : null}

                <Tooltip title={isMobileActions ? undefined : 'Trao đổi'}>
                    <Button
                        block={isMobileActions}
                        size={buttonSize}
                        type={buttonType}
                        icon={<MessageOutlined />}
                        className='text-blue-600'
                        onClick={() => setChatTarget(record)}
                    >
                        {isMobileActions ? 'Trao đổi' : null}
                    </Button>
                </Tooltip>

                {record.repairMode === 'external' &&
                record.approvalStatus === 'pending' &&
                record.status === 'pending' &&
                canManage ? (
                    <>
                        <ConfirmAction
                            title='Duyệt sửa ngoài'
                            description={`Duyệt phiếu sửa ngoài cho ${record.asset?.name || 'máy này'}?`}
                            okLabel='Duyệt'
                            intent='primary'
                            onConfirm={() => handleApprove(record)}
                        >
                            <Tooltip title={isMobileActions ? undefined : 'Duyệt'}>
                                <Button
                                    block={isMobileActions}
                                    size={buttonSize}
                                    type={isMobileActions ? 'primary' : 'text'}
                                    icon={<CheckOutlined />}
                                    loading={approveMutation.isPending}
                                >
                                    {isMobileActions ? 'Duyệt' : null}
                                </Button>
                            </Tooltip>
                        </ConfirmAction>
                        <Tooltip title={isMobileActions ? undefined : 'Từ chối'}>
                            <Button
                                block={isMobileActions}
                                size={buttonSize}
                                type={buttonType}
                                danger
                                icon={<CloseOutlined />}
                                onClick={() => setRejectTarget(record)}
                            >
                                {isMobileActions ? 'Từ chối' : null}
                            </Button>
                        </Tooltip>
                    </>
                ) : null}

                {canCompleteMaintenance(record) ? (
                    <Tooltip title={isMobileActions ? undefined : 'Hoàn tất'}>
                        <Button
                            block={isMobileActions}
                            size={buttonSize}
                            type={buttonType}
                            icon={<CheckCircleOutlined />}
                            className='text-emerald-600'
                            onClick={() => openCompleteModal(record)}
                        >
                            {isMobileActions ? 'Hoàn tất' : null}
                        </Button>
                    </Tooltip>
                ) : null}

                {canManage ? (
                    <ConfirmAction
                        title='Xóa phiếu bảo trì'
                        description={`Xóa phiếu ${buildMaintenanceCode(record)}? Thao tác này sẽ ẩn phiếu khỏi danh sách.`}
                        okLabel='Xóa'
                        intent='danger'
                        onConfirm={() => handleDelete(record)}
                    >
                        <Tooltip title={isMobileActions ? undefined : 'Xóa'}>
                            <Button
                                block={isMobileActions}
                                size={buttonSize}
                                type={buttonType}
                                danger
                                icon={<DeleteOutlined />}
                                loading={deleteMutation.isPending}
                            >
                                {isMobileActions ? 'Xóa' : null}
                            </Button>
                        </Tooltip>
                    </ConfirmAction>
                ) : null}
            </div>
        );
    };

    const renderMobileMaintenanceCard = (record: Maintenance, index = 0) => {
        const accent = getMaintenanceAccent(record);
        const recordAssets = getMaintenanceAssets(record);

        return (
            <article
                key={record.id}
                className='maintenance-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
                style={{
                    borderLeft: `4px solid ${accent}`,
                    animationDelay: `${Math.min(index, 6) * 55}ms`,
                }}
                onClick={() => setDetailTarget(record)}
            >
                <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <Text code className='!m-0 w-fit text-xs'>
                            {buildMaintenanceCode(record)}
                        </Text>
                        <div className='mt-2 line-clamp-2 text-base leading-snug font-bold text-slate-950'>
                            {getMaintenanceAssetLabel(record)}
                        </div>
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                            {recordAssets.slice(0, 3).map((asset) => (
                                <Tag key={asset.id} color='blue' className='!m-0 font-mono'>
                                    {asset.machineCode || asset.id}
                                </Tag>
                            ))}
                            {recordAssets.length > 3 ? <Tag className='!m-0'>+{recordAssets.length - 3}</Tag> : null}
                            <Tag color={record.repairMode === 'external' ? 'orange' : 'green'} className='!m-0'>
                                {getRepairModeLabel(record.repairMode)}
                            </Tag>
                            <Tag className='!m-0'>{typeLabel[record.type] || record.type}</Tag>
                        </div>
                    </div>
                    <div className='flex shrink-0 flex-col items-end gap-1'>
                        {getStatusTag(record.status)}
                        {record.repairMode === 'external' ? getApprovalTag(record.approvalStatus) : null}
                    </div>
                </div>

                <p className='mt-3 line-clamp-3 text-sm leading-6 text-slate-700'>{record.description || '-'}</p>

                <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
                    <div className='rounded-xl bg-slate-50 p-2'>
                        <div className='text-xs font-semibold text-slate-400 uppercase'>Cơ sở</div>
                        <div className='mt-1 line-clamp-1 font-semibold text-slate-800'>
                            {record.plantName || recordAssets[0]?.plant?.name || '-'}
                        </div>
                    </div>
                    <div className='rounded-xl bg-slate-50 p-2'>
                        <div className='text-xs font-semibold text-slate-400 uppercase'>Bắt đầu</div>
                        <div className='mt-1 font-semibold text-slate-800'>{fmtDate(record.startDate)}</div>
                    </div>
                    <div className='rounded-xl bg-slate-50 p-2'>
                        <div className='text-xs font-semibold text-slate-400 uppercase'>
                            {record.repairMode === 'external' ? 'Đơn vị sửa' : 'Kỹ thuật'}
                        </div>
                        <div className='mt-1 line-clamp-1 font-semibold text-slate-800'>
                            {record.repairMode === 'external'
                                ? record.externalRepair?.vendorName || '-'
                                : record.technician || '-'}
                        </div>
                    </div>
                    <div className='rounded-xl bg-slate-50 p-2'>
                        <div className='text-xs font-semibold text-slate-400 uppercase'>Chi phí</div>
                        <div className='mt-1 font-bold text-emerald-700'>
                            {fmtMoney(record.cost ?? record.externalRepair?.actualCost ?? 0)}
                        </div>
                    </div>
                </div>

                <div className='mt-4 border-t border-slate-100 pt-3'>{renderRecordActions(record, 'mobile')}</div>
            </article>
        );
    };

    const renderFilterFields = (mode: 'desktop' | 'mobile') => {
        const compact = mode === 'mobile';
        const controlSize = compact ? 'large' : 'middle';

        return (
            <div
                className={
                    compact
                        ? 'grid grid-cols-1 gap-3'
                        : 'grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-[minmax(240px,1fr)_260px_160px_160px_180px_auto]'
                }
            >
                <Input
                    size={controlSize}
                    prefix={<SearchOutlined />}
                    placeholder='Tìm theo tên máy, mã máy, serial...'
                    value={draftFilters.search}
                    allowClear
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                    onPressEnter={compact ? applyFiltersAndClose : applyFilters}
                />
                <RangePicker
                    size={controlSize}
                    className='w-full'
                    value={draftFilters.dateRange}
                    allowClear
                    format='DD/MM/YYYY'
                    onChange={(dates) => {
                        setDraftFilters((prev) => ({
                            ...prev,
                            dateRange: dates ? (dates as [Dayjs, Dayjs]) : undefined,
                        }));
                    }}
                />
                <Select
                    size={controlSize}
                    allowClear
                    placeholder='Kiểu sửa'
                    value={draftFilters.repairMode}
                    onChange={(repairMode) => setDraftFilters((prev) => ({ ...prev, repairMode }))}
                    options={[
                        { label: 'Nội bộ', value: 'internal' },
                        { label: 'Sửa ngoài', value: 'external' },
                    ]}
                />
                <Select
                    size={controlSize}
                    allowClear
                    placeholder='Trạng thái'
                    value={draftFilters.status}
                    onChange={(status) => setDraftFilters((prev) => ({ ...prev, status }))}
                    options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                />
                <Select
                    size={controlSize}
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder='Cơ sở'
                    value={draftFilters.plantId}
                    onChange={(plantId) => setDraftFilters((prev) => ({ ...prev, plantId }))}
                    options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                />
                {!compact ? (
                    <div className='flex gap-2'>
                        <Button block type='primary' icon={<SearchOutlined />} onClick={applyFilters}>
                            Lọc
                        </Button>
                    </div>
                ) : null}
            </div>
        );
    };

    const columns: TableColumnsType<Maintenance> = [
        {
            title: 'Phiếu / Máy',
            key: 'asset',
            width: 310,
            render: (_value, record) => {
                const recordAssets = getMaintenanceAssets(record);
                return (
                    <div className='flex min-w-[260px] flex-col gap-1'>
                        <Text code className='w-fit'>
                            {buildMaintenanceCode(record)}
                        </Text>
                        <Text strong className='line-clamp-1'>
                            {getMaintenanceAssetLabel(record)}
                        </Text>
                        <div className='flex flex-wrap gap-1'>
                            {recordAssets.slice(0, 3).map((asset) => (
                                <Tag key={asset.id} color='blue' className='font-mono'>
                                    {asset.machineCode || asset.id}
                                </Tag>
                            ))}
                            {recordAssets.length > 3 ? <Tag>+{recordAssets.length - 3}</Tag> : null}
                            {record.plantName || recordAssets[0]?.plant?.name ? (
                                <Tag>{record.plantName || recordAssets[0]?.plant?.name}</Tag>
                            ) : null}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Nội dung',
            key: 'description',
            render: (_value, record) => (
                <div className='flex min-w-[260px] flex-col gap-1'>
                    <div className='flex flex-wrap gap-1'>
                        <Tag color={record.repairMode === 'external' ? 'orange' : 'green'}>
                            {getRepairModeLabel(record.repairMode)}
                        </Tag>
                        <Tag>{typeLabel[record.type] || record.type}</Tag>
                    </div>
                    <Text className='line-clamp-2'>{record.description}</Text>
                    {record.externalRepair?.vendorName ? (
                        <Text type='secondary'>Đơn vị sửa: {record.externalRepair.vendorName}</Text>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Thời gian',
            key: 'time',
            width: 190,
            render: (_value, record) => (
                <div className='text-sm'>
                    <div>Bắt đầu: {fmtDate(record.startDate)}</div>
                    {record.repairMode === 'external' ? (
                        <>
                            <div>Đem đi: {fmtDate(record.externalRepair?.sentOutAt)}</div>
                            <div>Nhận về: {fmtDate(record.externalRepair?.returnedAt || record.endDate)}</div>
                        </>
                    ) : (
                        <div>Hoàn tất: {fmtDate(record.endDate)}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 170,
            render: (_value, record) => {
                return (
                    <div className='flex flex-col gap-1'>
                        {getStatusTag(record.status)}
                        {record.repairMode === 'external' ? getApprovalTag(record.approvalStatus) : null}
                    </div>
                );
            },
        },
        {
            title: 'Chi phí',
            key: 'cost',
            width: 150,
            align: 'right',
            render: (_value, record) => (
                <div className='text-right'>
                    <Text strong>{fmtMoney(record.cost ?? record.externalRepair?.actualCost ?? 0)}</Text>
                    {record.repairMode === 'external' && record.externalRepair?.estimateCost ? (
                        <div className='text-xs text-slate-500'>
                            Dự kiến: {fmtMoney(record.externalRepair.estimateCost)}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 250,
            align: 'right',
            render: (_value, record) => renderRecordActions(record),
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-4 overflow-hidden md:gap-6'>
            <PageHeader
                title='Bảo trì máy móc'
                subtitle='Theo dõi sửa chữa nội bộ, sửa ngoài và lịch sử bảo trì gắn trực tiếp với từng máy.'
                actions={
                    !isMobile ? (
                        <div className='grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end'>
                            <Button
                                icon={<ScanOutlined />}
                                onClick={() => setQuickMaintenanceOpen(true)}
                                className='rounded-lg border-amber-200 font-medium text-amber-700 hover:!border-amber-300 hover:!text-amber-800'
                            >
                                Quét QR tạo phiếu
                            </Button>
                            <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                                Tạo phiếu bảo trì
                            </Button>
                        </div>
                    ) : undefined
                }
            />

            {isMobile ? (
                <section className='maintenance-mobile-command'>
                    <div className='relative z-10'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='text-xs font-bold tracking-[0.14em] text-amber-200 uppercase'>
                                    HAIDANG MS
                                </div>
                                <div className='mt-1 text-2xl leading-tight font-black text-white'>
                                    Bảo trì hiện trường
                                </div>
                                <div className='mt-2 text-sm font-medium text-blue-50'>
                                    {report?.summary.pendingApprovalCount ?? 0} chờ duyệt ·{' '}
                                    {report?.summary.inProgressCount ?? 0} sửa ngoài
                                </div>
                            </div>
                            <div className='maintenance-mobile-command__icon'>
                                <ToolOutlined />
                            </div>
                        </div>
                        <div className='mt-5 grid grid-cols-2 gap-2'>
                            <Button
                                size='large'
                                icon={<ScanOutlined />}
                                onClick={() => setQuickMaintenanceOpen(true)}
                                className='maintenance-mobile-command__button maintenance-mobile-command__button--scan'
                            >
                                Quét QR
                            </Button>
                            <Button
                                type='primary'
                                size='large'
                                icon={<PlusOutlined />}
                                onClick={() => setCreateOpen(true)}
                                className='maintenance-mobile-command__button maintenance-mobile-command__button--create'
                            >
                                Tạo phiếu
                            </Button>
                        </div>
                    </div>
                </section>
            ) : null}

            {isMobile ? (
                <div className='grid grid-cols-2 gap-2'>
                    {[
                        {
                            label: 'Tổng phiếu',
                            value: totalMaintenances,
                            color: '#2563eb',
                            tint: '#eff6ff',
                            icon: <ToolOutlined />,
                        },
                        {
                            label: 'Chờ duyệt',
                            value: report?.summary.pendingApprovalCount ?? 0,
                            color: '#d97706',
                            tint: '#fffbeb',
                            icon: <CheckOutlined />,
                        },
                        {
                            label: 'Sửa ngoài',
                            value: report?.summary.inProgressCount ?? 0,
                            color: '#0ea5e9',
                            tint: '#f0f9ff',
                            icon: <ReloadOutlined spin />,
                        },
                        {
                            label: 'Chi phí',
                            value: fmtMoney(report?.summary.totalExternalRepairCost ?? 0),
                            color: '#16a34a',
                            tint: '#f0fdf4',
                            icon: <DollarOutlined />,
                        },
                    ].map((item, index) => (
                        <div
                            key={item.label}
                            className='maintenance-mobile-stat'
                            style={{
                                borderColor: `${item.color}33`,
                                background: `linear-gradient(135deg, ${item.tint}, #ffffff 62%)`,
                                animationDelay: `${index * 45}ms`,
                            }}
                        >
                            <div className='flex items-center justify-between gap-2'>
                                <div className='text-xs font-bold text-slate-500 uppercase'>{item.label}</div>
                                <div className='maintenance-mobile-stat__icon' style={{ color: item.color }}>
                                    {item.icon}
                                </div>
                            </div>
                            <div
                                className='mt-3 truncate text-xl leading-none font-black'
                                style={{ color: item.color }}
                            >
                                {item.value}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                    <StatsCard title='Tổng phiếu' value={totalMaintenances} icon={<ToolOutlined />} accent='#2563eb' />
                    <StatsCard
                        title='Chờ duyệt sửa ngoài'
                        value={report?.summary.pendingApprovalCount ?? 0}
                        icon={<CheckOutlined />}
                        accent='#d97706'
                    />
                    <StatsCard
                        title='Sửa ngoài đang làm'
                        value={report?.summary.inProgressCount ?? 0}
                        icon={<ReloadOutlined spin />}
                        accent='#0ea5e9'
                    />
                    <StatsCard
                        title='Chi phí sửa ngoài'
                        value={fmtMoney(report?.summary.totalExternalRepairCost ?? 0)}
                        icon={<DollarOutlined />}
                        accent='#16a34a'
                        caption='Theo khoảng ngày đang lọc'
                    />
                </div>
            )}

            {isMobile ? (
                <section className='maintenance-mobile-filter-panel'>
                    <div className='flex items-center justify-between gap-3'>
                        <button
                            type='button'
                            className='maintenance-mobile-filter-trigger'
                            onClick={() => setMobileFilterOpen(true)}
                        >
                            <span className='maintenance-mobile-filter-trigger__icon'>
                                <FilterOutlined />
                            </span>
                            <span className='min-w-0 flex-1 text-left'>
                                <span className='block text-sm font-black text-slate-950'>Bộ lọc bảo trì</span>
                                <span className='block truncate text-xs font-medium text-slate-500'>
                                    {activeFilterItems.length
                                        ? `${activeFilterItems.length} điều kiện đang áp dụng`
                                        : 'Đang xem tất cả phiếu'}
                                </span>
                            </span>
                        </button>
                        {activeFilterItems.length ? (
                            <Button size='small' icon={<ReloadOutlined />} onClick={resetFilters}>
                                Xóa
                            </Button>
                        ) : null}
                    </div>

                    <div className='maintenance-mobile-filter-chips'>
                        {activeFilterItems.length ? (
                            activeFilterItems.map((item) => (
                                <span key={item} className='maintenance-mobile-filter-chip'>
                                    {item}
                                </span>
                            ))
                        ) : (
                            <span className='maintenance-mobile-filter-chip maintenance-mobile-filter-chip--empty'>
                                Tất cả phiếu
                            </span>
                        )}
                    </div>
                </section>
            ) : (
                <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4'>
                    <div className='mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <div>
                            <Text strong>Bộ lọc bảo trì</Text>
                            <div className='text-xs text-slate-500'>
                                Lọc theo máy, cơ sở, kiểu sửa và trạng thái phiếu.
                            </div>
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={resetFilters} className='w-full sm:w-auto'>
                            Đặt lại
                        </Button>
                    </div>
                    {renderFilterFields('desktop')}
                </section>
            )}

            {isMobile ? (
                <Drawer
                    open={mobileFilterOpen}
                    placement='bottom'
                    size='78vh'
                    onClose={() => setMobileFilterOpen(false)}
                    title='Bộ lọc bảo trì'
                    destroyOnHidden
                    className='maintenance-filter-drawer'
                    styles={{
                        content: { borderRadius: '24px 24px 0 0' },
                        body: { padding: 16, background: '#f8fafc' },
                    }}
                    footer={
                        <div className='grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]'>
                            <Button size='large' icon={<ReloadOutlined />} onClick={resetFiltersAndClose}>
                                Đặt lại
                            </Button>
                            <Button
                                size='large'
                                type='primary'
                                icon={<SearchOutlined />}
                                onClick={applyFiltersAndClose}
                            >
                                Áp dụng
                            </Button>
                        </div>
                    }
                >
                    {renderFilterFields('mobile')}
                </Drawer>
            ) : null}

            <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5'>
                    <div>
                        <div className='font-semibold text-slate-900'>Danh sách phiếu bảo trì</div>
                        <div className='hidden text-sm text-slate-500 md:block'>
                            Theo dõi theo máy, trạng thái, kiểu sửa và chi phí phát sinh.
                        </div>
                    </div>
                    <Tag color='blue'>{totalMaintenances} phiếu</Tag>
                </div>
                {isMobile ? (
                    <div className='bg-slate-50/70 p-3'>
                        {isLoading ? (
                            <div className='flex min-h-[220px] items-center justify-center'>
                                <Spin />
                            </div>
                        ) : maintenances.length ? (
                            <div className='flex flex-col gap-3'>{maintenances.map(renderMobileMaintenanceCard)}</div>
                        ) : (
                            <div className='rounded-2xl bg-white py-8'>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu bảo trì' />
                            </div>
                        )}
                        {totalMaintenances > 0 ? (
                            <div className='mt-4 flex justify-center'>
                                <Pagination
                                    simple
                                    current={maintenanceResponse?.page ?? filters.page}
                                    pageSize={maintenanceResponse?.limit ?? filters.limit}
                                    total={totalMaintenances}
                                    onChange={(page, limit) => setFilters((prev) => ({ ...prev, page, limit }))}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <Table<Maintenance>
                        rowKey='id'
                        columns={columns}
                        dataSource={maintenances}
                        loading={isLoading}
                        size='middle'
                        scroll={{ x: 1320 }}
                        onRow={(record) => ({
                            onClick: () => setDetailTarget(record),
                            className: 'cursor-pointer',
                        })}
                        pagination={{
                            current: maintenanceResponse?.page ?? filters.page,
                            pageSize: maintenanceResponse?.limit ?? filters.limit,
                            total: totalMaintenances,
                            showSizeChanger: true,
                            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} phiếu`,
                            onChange: (page, limit) => setFilters((prev) => ({ ...prev, page, limit })),
                        }}
                    />
                )}
            </section>

            <Drawer
                open={Boolean(detailTarget)}
                title={
                    detailTarget ? (
                        <div className='flex flex-col gap-1'>
                            <Space wrap>
                                <Text strong>{buildMaintenanceCode(detailTarget)}</Text>
                                <Tag color={detailTarget.repairMode === 'external' ? 'orange' : 'green'}>
                                    {getRepairModeLabel(detailTarget.repairMode)}
                                </Tag>
                                {getStatusTag(detailTarget.status)}
                            </Space>
                            <Text type='secondary'>{getMaintenanceAssetLabel(detailTarget)}</Text>
                        </div>
                    ) : (
                        'Chi tiết phiếu bảo trì'
                    )
                }
                placement={isMobile ? 'bottom' : 'right'}
                size={isMobile ? 'default' : 'large'}
                height={isMobile ? '92vh' : undefined}
                destroyOnHidden
                onClose={() => setDetailTarget(null)}
                styles={
                    isMobile
                        ? {
                              content: { borderRadius: '22px 22px 0 0' },
                              body: { padding: 16, paddingBottom: 96 },
                          }
                        : undefined
                }
                extra={
                    isMobile ? null : detailTarget ? (
                        <Space wrap>
                            {detailTarget.repairMode === 'external' &&
                            detailTarget.approvalStatus === 'pending' &&
                            detailTarget.status === 'pending' &&
                            canManage ? (
                                <>
                                    <Button
                                        type='primary'
                                        icon={<CheckOutlined />}
                                        loading={approveMutation.isPending}
                                        onClick={() => handleApprove(detailTarget)}
                                    >
                                        Duyệt
                                    </Button>
                                    <Button
                                        danger
                                        icon={<CloseOutlined />}
                                        onClick={() => setRejectTarget(detailTarget)}
                                    >
                                        Từ chối
                                    </Button>
                                </>
                            ) : null}
                            {canCompleteMaintenance(detailTarget) ? (
                                <Button icon={<CheckCircleOutlined />} onClick={() => openCompleteModal(detailTarget)}>
                                    Hoàn tất
                                </Button>
                            ) : null}
                            <Button
                                icon={<FileExcelOutlined />}
                                loading={exportingId === detailTarget.id}
                                onClick={() => void handleExportXlsx(detailTarget)}
                            >
                                Xuất phiếu
                            </Button>
                            <Button icon={<MessageOutlined />} onClick={() => setChatTarget(detailTarget)}>
                                Trao đổi
                            </Button>
                        </Space>
                    ) : null
                }
                footer={
                    isMobile && detailTarget ? (
                        <div className='flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]'>
                            <Button
                                block
                                icon={<FileExcelOutlined />}
                                loading={exportingId === detailTarget.id}
                                onClick={() => void handleExportXlsx(detailTarget)}
                            >
                                Xuất phiếu Excel
                            </Button>
                            {renderRecordActions(detailTarget, 'mobile', { showDetail: false })}
                        </div>
                    ) : null
                }
            >
                {detailTarget ? (
                    <div className='flex flex-col gap-4'>
                        <Descriptions
                            bordered
                            size='small'
                            column={{ xs: 1, sm: 2 }}
                            items={[
                                ...((detailTarget.assets?.length ?? 0) > 1
                                    ? [
                                          {
                                              key: 'machines',
                                              label: `Danh sách máy (${detailTarget.assets!.length})`,
                                              span: 2,
                                              children: (
                                                  <Space wrap size={[4, 4]}>
                                                      {detailTarget.assets!.map((a) => (
                                                          <Tag key={a.id} className='!m-0'>
                                                              <span className='font-mono'>{a.machineCode}</span>
                                                              {a.name ? ` · ${a.name}` : ''}
                                                          </Tag>
                                                      ))}
                                                  </Space>
                                              ),
                                          },
                                      ]
                                    : [
                                          {
                                              key: 'asset',
                                              label: 'Tên máy',
                                              children: detailTarget.asset?.name || '-',
                                          },
                                          {
                                              key: 'code',
                                              label: 'Mã máy',
                                              children: detailTarget.asset?.machineCode || '-',
                                          },
                                          {
                                              key: 'serial',
                                              label: 'Serial',
                                              children: detailTarget.asset?.serial || '-',
                                          },
                                      ]),
                                {
                                    key: 'plant',
                                    label: 'Cơ sở',
                                    children:
                                        detailTarget.plantName ||
                                        getMaintenanceAssets(detailTarget)[0]?.plant?.name ||
                                        '-',
                                },
                                {
                                    key: 'type',
                                    label: 'Loại bảo trì',
                                    children: typeLabel[detailTarget.type] || detailTarget.type,
                                },
                                {
                                    key: 'mode',
                                    label: 'Kiểu sửa',
                                    children: getRepairModeLabel(detailTarget.repairMode),
                                },
                                { key: 'status', label: 'Trạng thái', children: getStatusTag(detailTarget.status) },
                                {
                                    key: 'approval',
                                    label: 'Duyệt sửa ngoài',
                                    children:
                                        detailTarget.repairMode === 'external'
                                            ? getApprovalTag(detailTarget.approvalStatus)
                                            : '-',
                                },
                                { key: 'start', label: 'Ngày bắt đầu', children: fmtDate(detailTarget.startDate) },
                                { key: 'end', label: 'Ngày hoàn tất', children: fmtDate(detailTarget.endDate) },
                                { key: 'tech', label: 'Kỹ thuật viên', children: detailTarget.technician || '-' },
                                { key: 'cost', label: 'Chi phí thực tế', children: fmtMoney(detailTarget.cost ?? 0) },
                                { key: 'desc', label: 'Nội dung', span: 2, children: detailTarget.description || '-' },
                                { key: 'note', label: 'Ghi chú', span: 2, children: detailTarget.note || '-' },
                            ]}
                        />

                        {detailTarget.repairMode === 'external' ? (
                            <>
                                <Divider className='!my-1'>Thông tin sửa ngoài</Divider>
                                <Descriptions
                                    bordered
                                    size='small'
                                    column={{ xs: 1, sm: 2 }}
                                    items={[
                                        {
                                            key: 'vendor',
                                            label: 'Đơn vị sửa',
                                            children: detailTarget.externalRepair?.vendorName || '-',
                                        },
                                        {
                                            key: 'estimate',
                                            label: 'Chi phí dự kiến',
                                            children: fmtMoney(detailTarget.externalRepair?.estimateCost ?? 0),
                                        },
                                        {
                                            key: 'sent',
                                            label: 'Ngày đem đi',
                                            children: fmtDate(detailTarget.externalRepair?.sentOutAt),
                                        },
                                        {
                                            key: 'expected',
                                            label: 'Dự kiến nhận',
                                            children: fmtDate(detailTarget.externalRepair?.expectedReturnAt),
                                        },
                                        {
                                            key: 'returned',
                                            label: 'Ngày nhận về',
                                            children: fmtDate(detailTarget.externalRepair?.returnedAt),
                                        },
                                        {
                                            key: 'invoice',
                                            label: 'Số hóa đơn',
                                            children: detailTarget.externalRepair?.invoiceNo || '-',
                                        },
                                        {
                                            key: 'reject',
                                            label: 'Lý do từ chối',
                                            span: 2,
                                            children: detailTarget.externalRepair?.rejectReason || '-',
                                        },
                                    ]}
                                />

                                {detailTarget.externalRepair?.costItems?.length ? (
                                    <Table
                                        rowKey={(_, index) => String(index)}
                                        size='small'
                                        pagination={false}
                                        dataSource={detailTarget.externalRepair.costItems}
                                        columns={[
                                            { title: 'Hạng mục', dataIndex: 'name' },
                                            {
                                                title: 'Chi phí',
                                                dataIndex: 'amount',
                                                width: 160,
                                                align: 'right',
                                                render: (value) => fmtMoney(Number(value ?? 0)),
                                            },
                                            { title: 'Ghi chú', dataIndex: 'note' },
                                        ]}
                                    />
                                ) : null}
                            </>
                        ) : null}

                        <Divider className='!my-1'>Timeline</Divider>
                        <Timeline
                            items={[
                                {
                                    color: 'blue',
                                    children: (
                                        <div>
                                            <Text strong>Tạo phiếu</Text>
                                            <div className='text-sm text-slate-500'>
                                                {fmtDate(detailTarget.createdAt)}
                                            </div>
                                        </div>
                                    ),
                                },
                                ...(detailTarget.repairMode === 'external'
                                    ? [
                                          {
                                              color: detailTarget.approvalStatus === 'approved' ? 'green' : 'orange',
                                              children: (
                                                  <div>
                                                      <Text strong>Duyệt sửa ngoài</Text>
                                                      <div className='text-sm text-slate-500'>
                                                          {detailTarget.externalRepair?.approvedAt
                                                              ? fmtDate(detailTarget.externalRepair.approvedAt)
                                                              : approvalMeta[detailTarget.approvalStatus || 'pending']
                                                                    ?.label}
                                                      </div>
                                                  </div>
                                              ),
                                          },
                                      ]
                                    : []),
                                {
                                    color: detailTarget.status === 'completed' ? 'green' : 'gray',
                                    children: (
                                        <div>
                                            <Text strong>Hoàn tất</Text>
                                            <div className='text-sm text-slate-500'>
                                                {fmtDate(detailTarget.endDate)}
                                            </div>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </div>
                ) : null}
            </Drawer>

            {createOpen ? (
                <LazyBoundary mode='overlay'>
                    <MaintenanceFormModal
                        open
                        assets={assets}
                        submitting={createMutation.isPending}
                        onClose={() => setCreateOpen(false)}
                        onSubmit={handleCreate}
                    />
                </LazyBoundary>
            ) : null}

            {quickMaintenanceOpen ? (
                <LazyBoundary mode='overlay'>
                    <QrQuickMaintenanceModal
                        open
                        onClose={() => setQuickMaintenanceOpen(false)}
                        onCreated={invalidateMaintenance}
                    />
                </LazyBoundary>
            ) : null}

            <Modal
                open={Boolean(completeTarget)}
                title='Hoàn tất phiếu bảo trì'
                okText='Hoàn tất'
                cancelText='Đóng'
                confirmLoading={completeMutation.isPending}
                onOk={handleComplete}
                onCancel={() => {
                    setCompleteTarget(null);
                    completeForm.resetFields();
                }}
                destroyOnHidden
                width={720}
            >
                <Form<CompleteFormValues> form={completeForm} layout='vertical'>
                    <Form.Item
                        name='endDate'
                        label='Ngày hoàn tất'
                        rules={[{ required: true, message: 'Chọn ngày hoàn tất' }]}
                    >
                        <DatePicker className='w-full' format='DD/MM/YYYY' />
                    </Form.Item>

                    {completeTarget?.repairMode === 'external' ? (
                        <>
                            <div className='mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-3'>
                                <div>
                                    <Text type='secondary' className='text-xs font-semibold uppercase'>
                                        Dự kiến
                                    </Text>
                                    <div className='mt-1 text-base font-bold text-slate-800'>
                                        {fmtMoney(completeEstimateCost)}
                                    </div>
                                </div>
                                <div>
                                    <Text type='secondary' className='text-xs font-semibold uppercase'>
                                        Thực tế
                                    </Text>
                                    <div className='mt-1 text-lg font-bold text-emerald-700'>
                                        {fmtMoney(completeCostPreview)}
                                    </div>
                                </div>
                                <div>
                                    <Text type='secondary' className='text-xs font-semibold uppercase'>
                                        Chênh lệch
                                    </Text>
                                    <div
                                        className={`mt-1 text-base font-bold ${
                                            completeCostDiff > 0
                                                ? 'text-rose-600'
                                                : completeCostDiff < 0
                                                  ? 'text-emerald-700'
                                                  : 'text-slate-800'
                                        }`}
                                    >
                                        {fmtMoney(completeCostDiff)}
                                    </div>
                                </div>
                            </div>
                            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                                <Form.Item name={['externalRepair', 'returnedAt']} label='Ngày nhận máy về'>
                                    <DatePicker className='w-full' format='DD/MM/YYYY' />
                                </Form.Item>
                                <Form.Item name={['externalRepair', 'invoiceNo']} label='Số hóa đơn/phiếu sửa'>
                                    <Input />
                                </Form.Item>
                            </div>
                            <Form.List name={['externalRepair', 'costItems']}>
                                {(fields, { add, remove }) => (
                                    <div className='flex flex-col gap-2'>
                                        <div className='flex items-center justify-between'>
                                            <Text strong>Hạng mục chi phí sửa ngoài</Text>
                                            <Button size='small' onClick={() => add({})}>
                                                Thêm hạng mục
                                            </Button>
                                        </div>
                                        {fields.map((field) => (
                                            <div
                                                key={field.key}
                                                className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_48px]'
                                            >
                                                <Form.Item {...field} name={[field.name, 'name']} className='!mb-0'>
                                                    <Input size='large' placeholder='Tên hạng mục' />
                                                </Form.Item>
                                                <Form.Item {...field} name={[field.name, 'amount']} className='!mb-0'>
                                                    <InputNumber<number>
                                                        size='large'
                                                        min={0}
                                                        step={10000}
                                                        controls={false}
                                                        placeholder='0'
                                                        className='maintenance-money-input w-full'
                                                        formatter={(value) =>
                                                            `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                        }
                                                        parser={(value) =>
                                                            Number(String(value ?? '').replace(/\D/g, ''))
                                                        }
                                                        suffix='VND'
                                                    />
                                                </Form.Item>
                                                <Button danger size='large' onClick={() => remove(field.name)}>
                                                    Xóa
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Form.List>
                        </>
                    ) : (
                        <>
                            <div className='mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3'>
                                <Text type='secondary' className='text-xs font-semibold uppercase'>
                                    Chi phí phát sinh
                                </Text>
                                <div className='mt-1 text-lg font-bold text-emerald-700'>
                                    {fmtMoney(completeCostPreview)}
                                </div>
                            </div>
                            <Form.Item name='cost' label='Chi phí phát sinh' className='maintenance-money-form-item'>
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
                        </>
                    )}

                    <Form.Item name='note' label='Ghi chú hoàn tất'>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={Boolean(rejectTarget)}
                title='Từ chối phiếu sửa ngoài'
                okText='Từ chối'
                cancelText='Đóng'
                okButtonProps={{ danger: true, loading: rejectMutation.isPending }}
                onOk={handleReject}
                onCancel={() => {
                    setRejectTarget(null);
                    setRejectReason('');
                }}
                destroyOnHidden
            >
                <Input.TextArea
                    rows={3}
                    placeholder='Nhập lý do từ chối'
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                />
            </Modal>

            {chatTarget ? (
                <ContextChatDrawer
                    open={Boolean(chatTarget)}
                    contextType='maintenance'
                    contextId={chatTarget.id}
                    title={`Trao đổi ${buildMaintenanceCode(chatTarget)}`}
                    subtitle={`${chatTarget.asset?.machineCode || chatTarget.assetId} · ${chatTarget.asset?.name || 'Máy chưa xác định'}`}
                    onClose={() => setChatTarget(null)}
                />
            ) : null}
        </div>
    );
};

export default MaintenanceList;
