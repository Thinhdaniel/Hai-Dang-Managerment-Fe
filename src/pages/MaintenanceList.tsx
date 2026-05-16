import React, { lazy, useMemo, useState } from 'react';
import {
    App,
    Button,
    DatePicker,
    Descriptions,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
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
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import PageHeader from '../components/shared/PageHeader';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import StatsCard from '../components/shared/StatsCard';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { assetService } from '../core/services/asset.service';
import { maintenanceService, type MaintenancePayload } from '../core/services/maintenance.service';
import { plantService } from '../core/services/plant.service';
import type { Maintenance, MaintenanceFilter, MaintenanceRepairMode, MaintenanceType } from '../core/types';

const MaintenanceFormModal = lazy(() => import('../components/MaintenanceFormModal'));

const { RangePicker } = DatePicker;
const { Text } = Typography;

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
    status: undefined as MaintenanceFilter['status'],
    repairMode: undefined as MaintenanceRepairMode | undefined,
    type: undefined as MaintenanceType | undefined,
    plantId: undefined as string | undefined,
    dateRange: undefined as [Dayjs, Dayjs] | undefined,
});

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
const buildMaintenanceCode = (item: Maintenance) =>
    `MNT-${new Date(item.createdAt || item.startDate).getFullYear()}-${item.id.slice(-5).toUpperCase()}`;
const getRepairModeLabel = (value?: string) => (value === 'external' ? 'Sửa ngoài' : 'Nội bộ');
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

const MaintenanceList: React.FC = () => {
    const queryClient = useQueryClient();
    const { role } = useAuth();
    const { message } = App.useApp();
    const canManage = hasManagerAccess(role);

    const [filters, setFilters] = useState(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState(() => createDefaultFilters());
    const [createOpen, setCreateOpen] = useState(false);
    const [detailTarget, setDetailTarget] = useState<Maintenance | null>(null);
    const [completeTarget, setCompleteTarget] = useState<Maintenance | null>(null);
    const [rejectTarget, setRejectTarget] = useState<Maintenance | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [completeForm] = Form.useForm<CompleteFormValues>();

    const requestParams = useMemo(
        () => ({
            page: filters.page,
            limit: filters.limit,
            search: filters.search || undefined,
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
        const cost =
            completeTarget.repairMode === 'external'
                ? values.externalRepair?.actualCost ??
                  costItems?.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
                : values.cost;

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

    const columns: TableColumnsType<Maintenance> = [
        {
            title: 'Phiếu / Máy',
            key: 'asset',
            width: 310,
            render: (_value, record) => (
                <div className='flex min-w-[260px] flex-col gap-1'>
                    <Text code className='w-fit'>
                        {buildMaintenanceCode(record)}
                    </Text>
                    <Text strong className='line-clamp-1'>
                        {record.asset?.name || '-'}
                    </Text>
                    <div className='flex flex-wrap gap-1'>
                        <Tag color='blue'>{record.asset?.machineCode || record.assetId}</Tag>
                        {record.asset?.plant?.name ? <Tag>{record.asset.plant.name}</Tag> : null}
                    </div>
                </div>
            ),
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
                        <div className='text-xs text-slate-500'>Dự kiến: {fmtMoney(record.externalRepair.estimateCost)}</div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 220,
            align: 'right',
            render: (_value, record) => (
                <div className='flex justify-end gap-1' onClick={(event) => event.stopPropagation()}>
                    <Tooltip title='Xem chi tiết'>
                        <Button type='text' icon={<EyeOutlined />} onClick={() => setDetailTarget(record)} />
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
                                <Tooltip title='Duyệt'>
                                    <Button type='text' icon={<CheckOutlined />} loading={approveMutation.isPending} />
                                </Tooltip>
                            </ConfirmAction>
                            <Tooltip title='Từ chối'>
                                <Button type='text' danger icon={<CloseOutlined />} onClick={() => setRejectTarget(record)} />
                            </Tooltip>
                        </>
                    ) : null}
                    {canCompleteMaintenance(record) ? (
                        <Tooltip title='Hoàn tất'>
                            <Button
                                type='text'
                                icon={<CheckCircleOutlined />}
                                className='text-emerald-600'
                                onClick={() => openCompleteModal(record)}
                            />
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
                            <Tooltip title='Xóa'>
                                <Button type='text' danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Bảo trì máy móc'
                subtitle='Theo dõi sửa chữa nội bộ, sửa ngoài và lịch sử bảo trì gắn trực tiếp với từng máy.'
                actions={
                    <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                        Tạo phiếu bảo trì
                    </Button>
                }
            />

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                <StatsCard title='Tổng phiếu' value={maintenanceResponse?.total ?? 0} icon={<ToolOutlined />} accent='#2563eb' />
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

            <section className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                    <div>
                        <Text strong>Bộ lọc bảo trì</Text>
                        <div className='text-xs text-slate-500'>Lọc theo máy, cơ sở, kiểu sửa và trạng thái phiếu.</div>
                    </div>
                    <Button icon={<ReloadOutlined />} onClick={resetFilters}>
                        Đặt lại
                    </Button>
                </div>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_260px_160px_160px_180px_auto]'>
                    <Input
                        prefix={<SearchOutlined />}
                        placeholder='Tìm theo tên máy, mã máy, serial...'
                        value={draftFilters.search}
                        allowClear
                        onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                        onPressEnter={applyFilters}
                    />
                    <RangePicker
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
                        allowClear
                        placeholder='Trạng thái'
                        value={draftFilters.status}
                        onChange={(status) => setDraftFilters((prev) => ({ ...prev, status }))}
                        options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                    />
                    <Select
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder='Cơ sở'
                        value={draftFilters.plantId}
                        onChange={(plantId) => setDraftFilters((prev) => ({ ...prev, plantId }))}
                        options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                    />
                    <div className='flex gap-2'>
                        <Button block type='primary' icon={<SearchOutlined />} onClick={applyFilters}>
                            Lọc
                        </Button>
                    </div>
                </div>
            </section>

            <section className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4'>
                    <div>
                        <div className='font-semibold text-slate-900'>Danh sách phiếu bảo trì</div>
                        <div className='text-sm text-slate-500'>
                            Bấm vào một dòng hoặc biểu tượng mắt để xem đầy đủ chi tiết phiếu.
                        </div>
                    </div>
                    <Tag color='blue'>{maintenanceResponse?.total ?? 0} phiếu</Tag>
                </div>
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
                        total: maintenanceResponse?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} phiếu`,
                        onChange: (page, limit) => setFilters((prev) => ({ ...prev, page, limit })),
                    }}
                />
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
                            <Text type='secondary'>{detailTarget.asset?.name || 'Máy chưa xác định'}</Text>
                        </div>
                    ) : (
                        'Chi tiết phiếu bảo trì'
                    )
                }
                size='large'
                destroyOnHidden
                onClose={() => setDetailTarget(null)}
                extra={
                    detailTarget ? (
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
                                    <Button danger icon={<CloseOutlined />} onClick={() => setRejectTarget(detailTarget)}>
                                        Từ chối
                                    </Button>
                                </>
                            ) : null}
                            {canCompleteMaintenance(detailTarget) ? (
                                <Button icon={<CheckCircleOutlined />} onClick={() => openCompleteModal(detailTarget)}>
                                    Hoàn tất
                                </Button>
                            ) : null}
                        </Space>
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
                                { key: 'asset', label: 'Tên máy', children: detailTarget.asset?.name || '-' },
                                { key: 'code', label: 'Mã máy', children: detailTarget.asset?.machineCode || '-' },
                                { key: 'serial', label: 'Serial', children: detailTarget.asset?.serial || '-' },
                                { key: 'plant', label: 'Cơ sở', children: detailTarget.asset?.plant?.name || '-' },
                                { key: 'type', label: 'Loại bảo trì', children: typeLabel[detailTarget.type] || detailTarget.type },
                                { key: 'mode', label: 'Kiểu sửa', children: getRepairModeLabel(detailTarget.repairMode) },
                                { key: 'status', label: 'Trạng thái', children: getStatusTag(detailTarget.status) },
                                {
                                    key: 'approval',
                                    label: 'Duyệt sửa ngoài',
                                    children: detailTarget.repairMode === 'external' ? getApprovalTag(detailTarget.approvalStatus) : '-',
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
                                        { key: 'vendor', label: 'Đơn vị sửa', children: detailTarget.externalRepair?.vendorName || '-' },
                                        {
                                            key: 'estimate',
                                            label: 'Chi phí dự kiến',
                                            children: fmtMoney(detailTarget.externalRepair?.estimateCost ?? 0),
                                        },
                                        { key: 'sent', label: 'Ngày đem đi', children: fmtDate(detailTarget.externalRepair?.sentOutAt) },
                                        {
                                            key: 'expected',
                                            label: 'Dự kiến nhận',
                                            children: fmtDate(detailTarget.externalRepair?.expectedReturnAt),
                                        },
                                        { key: 'returned', label: 'Ngày nhận về', children: fmtDate(detailTarget.externalRepair?.returnedAt) },
                                        { key: 'invoice', label: 'Số hóa đơn', children: detailTarget.externalRepair?.invoiceNo || '-' },
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
                                            <div className='text-sm text-slate-500'>{fmtDate(detailTarget.createdAt)}</div>
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
                                                              : approvalMeta[detailTarget.approvalStatus || 'pending']?.label}
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
                                            <div className='text-sm text-slate-500'>{fmtDate(detailTarget.endDate)}</div>
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
                    <Form.Item name='endDate' label='Ngày hoàn tất' rules={[{ required: true, message: 'Chọn ngày hoàn tất' }]}>
                        <DatePicker className='w-full' format='DD/MM/YYYY' />
                    </Form.Item>

                    {completeTarget?.repairMode === 'external' ? (
                        <>
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
                                            <div key={field.key} className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_170px_40px]'>
                                                <Form.Item {...field} name={[field.name, 'name']} className='!mb-0'>
                                                    <Input placeholder='Tên hạng mục' />
                                                </Form.Item>
                                                <Form.Item {...field} name={[field.name, 'amount']} className='!mb-0'>
                                                    <InputNumber<number>
                                                        min={0}
                                                        className='w-full'
                                                        formatter={(value) =>
                                                            `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                        }
                                                        parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                                                    />
                                                </Form.Item>
                                                <Button danger onClick={() => remove(field.name)}>
                                                    Xóa
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Form.List>
                        </>
                    ) : (
                        <Form.Item name='cost' label='Chi phí phát sinh'>
                            <InputNumber<number>
                                min={0}
                                className='w-full'
                                formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                                suffix='VND'
                            />
                        </Form.Item>
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
        </div>
    );
};

export default MaintenanceList;
