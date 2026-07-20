import {
    CalendarOutlined,
    CheckCircleFilled,
    DeleteOutlined,
    EditOutlined,
    ExportOutlined,
    PlusOutlined,
    ReloadOutlined,
    SaveOutlined,
    SendOutlined,
    UnlockOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Drawer,
    Empty,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Skeleton,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionItem,
    ProductionLine,
    ProductionPlan,
    ProductionPlanAllocation,
    ProductionPlanAllocationPayload,
    ProductionPlanPriority,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý kế hoạch');
const createClientId = () =>
    globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type AllocationDraft = ProductionPlanAllocationPayload & {
    clientId: string;
    sourceType: 'manual' | 'carry_over';
    sourceProductionDate?: string;
};

type AllocationFormValues = {
    lineId: string;
    itemId: string;
    orderCode?: string;
    plannedQuantity: number;
    hourlyQuota: number;
    startSlotKey: string;
    endSlotKey: string;
    priority: ProductionPlanPriority;
    dueDate?: Dayjs;
    note?: string;
};

type ActionFormValues = { note?: string; reason?: string };
type PlanAction = 'publish' | 'reopen' | null;

const priorityMeta: Record<ProductionPlanPriority, { label: string; color: string; rank: number }> = {
    urgent: { label: 'Khẩn', color: 'red', rank: 0 },
    high: { label: 'Cao', color: 'gold', rank: 1 },
    normal: { label: 'Thường', color: 'blue', rank: 2 },
    low: { label: 'Thấp', color: 'default', rank: 3 },
};

const toDraft = (allocation: ProductionPlanAllocation): AllocationDraft => ({
    clientId: allocation.id,
    id: allocation.id,
    lineId: allocation.lineId,
    itemId: allocation.itemId,
    orderCode: allocation.orderCode,
    plannedQuantity: allocation.plannedQuantity,
    hourlyQuota: allocation.hourlyQuota,
    startSlotKey: allocation.startSlotKey,
    endSlotKey: allocation.endSlotKey,
    priority: allocation.priority,
    dueDate: allocation.dueDate,
    note: allocation.note,
    sourceType: allocation.sourceType,
    sourceProductionDate: allocation.sourceProductionDate,
});

const toPayload = ({
    clientId: _clientId,
    sourceType: _sourceType,
    sourceProductionDate: _sourceDate,
    ...draft
}: AllocationDraft) => draft;

const ProductionPlanningPage = () => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const [searchParams] = useSearchParams();
    const [allocationForm] = Form.useForm<AllocationFormValues>();
    const [actionForm] = Form.useForm<ActionFormValues>();
    const [date, setDate] = useState<Dayjs>(() => {
        const requested = searchParams.get('date');
        const parsed = requested ? dayjs(requested, 'YYYY-MM-DD', true) : dayjs();
        return parsed.isValid() ? parsed : dayjs();
    });
    const [plantId, setPlantId] = useState(searchParams.get('plantId') || user?.plantId || '');
    const [drafts, setDrafts] = useState<AllocationDraft[]>([]);
    const [dirty, setDirty] = useState(false);
    const [changeReason, setChangeReason] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [planAction, setPlanAction] = useState<PlanAction>(null);
    const productionDate = date.format('YYYY-MM-DD');
    const canSwitchPlant = isAdmin(role) || isDirector(role);
    const planKey = ['production', 'plan', plantId, productionDate] as const;

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60 * 1000,
    });
    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, false],
        queryFn: () => productionService.getLines(plantId),
        enabled: Boolean(plantId),
        staleTime: 60 * 1000,
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, false],
        queryFn: () => productionService.getItems(plantId),
        enabled: Boolean(plantId),
        staleTime: 60 * 1000,
    });
    const planQuery = useQuery({
        queryKey: planKey,
        queryFn: () => productionService.lookupPlan(plantId, productionDate),
        enabled: Boolean(plantId),
        refetchInterval: dirty ? false : 60_000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    useEffect(() => {
        setDirty(false);
        setChangeReason('');
        setDrafts([]);
    }, [plantId, productionDate]);

    useEffect(() => {
        if (dirty) return;
        setDrafts((planQuery.data?.allocations || []).map(toDraft));
    }, [dirty, planQuery.data]);

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload: { plantId: string; productionDate: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate || dirty) return;
            void queryClient.invalidateQueries({ queryKey: planKey });
        };
        socket.on('production:plan-updated', handleUpdate);
        return () => {
            socket.off('production:plan-updated', handleUpdate);
        };
    }, [dirty, planKey, plantId, productionDate, queryClient, socket]);

    const plan = planQuery.data;
    const activeSlots = useMemo(
        () =>
            [...(plan?.timeSlots || [])]
                .filter((slot) => slot.isActive)
                .sort((left, right) => left.startMinute - right.startMinute),
        [plan?.timeSlots]
    );
    const slotByKey = useMemo(() => new Map(activeSlots.map((slot) => [slot.key, slot])), [activeSlots]);
    const slotIndex = useMemo(() => new Map(activeSlots.map((slot, index) => [slot.key, index])), [activeSlots]);
    const lines = linesQuery.data || [];
    const items = itemsQuery.data || [];
    const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);
    const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

    const sortedDrafts = useMemo(
        () =>
            [...drafts].sort(
                (left, right) =>
                    priorityMeta[left.priority].rank - priorityMeta[right.priority].rank ||
                    (lineById.get(left.lineId)?.sortOrder || 0) - (lineById.get(right.lineId)?.sortOrder || 0) ||
                    Number(slotIndex.get(left.startSlotKey) || 0) - Number(slotIndex.get(right.startSlotKey) || 0)
            ),
        [drafts, lineById, slotIndex]
    );

    const draftSummary = useMemo(
        () => ({
            total: drafts.reduce((sum, draft) => sum + Number(draft.plannedQuantity || 0), 0),
            lines: new Set(drafts.map((draft) => draft.lineId)).size,
            items: new Set(drafts.map((draft) => draft.itemId)).size,
            carry: drafts
                .filter((draft) => draft.sourceType === 'carry_over')
                .reduce((sum, draft) => sum + draft.plannedQuantity, 0),
        }),
        [drafts]
    );

    const syncPlan = (next: ProductionPlan) => {
        queryClient.setQueryData(planKey, next);
        setDrafts(next.allocations.map(toDraft));
        setDirty(false);
        setChangeReason('');
    };

    const createMutation = useMutation({
        mutationFn: () => productionService.createPlan({ plantId, productionDate }),
        onSuccess: (next) => {
            syncPlan(next);
            message.success('Đã tạo kế hoạch ngày');
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const saveMutation = useMutation({
        mutationFn: () =>
            productionService.updatePlan(plan!.id, {
                revision: plan!.revision,
                changeReason: changeReason.trim(),
                allocations: drafts.map(toPayload),
            }),
        onSuccess: (next) => {
            syncPlan(next);
            message.success('Đã lưu phiên bản kế hoạch');
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const publishMutation = useMutation({
        mutationFn: (note?: string) => productionService.publishPlan(plan!.id, { revision: plan!.revision, note }),
        onSuccess: async (result) => {
            syncPlan(result.plan);
            setPlanAction(null);
            actionForm.resetFields();
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
            message.success(
                result.sync.preservedLines.length
                    ? `Đã ban hành; giữ dữ liệu đã nhập tại ${result.sync.preservedLines.join(', ')}`
                    : 'Đã ban hành và đồng bộ vào sổ sản xuất'
            );
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const reopenMutation = useMutation({
        mutationFn: (reason: string) => productionService.reopenPlan(plan!.id, { revision: plan!.revision, reason }),
        onSuccess: (next) => {
            syncPlan(next);
            setPlanAction(null);
            actionForm.resetFields();
            message.success('Đã mở kế hoạch để điều chỉnh');
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const carryMutation = useMutation({
        mutationFn: () => productionService.carryOverPlan(plan!.id, { revision: plan!.revision }),
        onSuccess: (result) => {
            syncPlan(result.plan);
            if (result.skippedCount) {
                message.warning(
                    `Đã xếp ${result.importedCount} phân bổ; ${result.skippedCount} phân bổ chưa có khung trống`
                );
            } else {
                message.success(
                    `Đã chuyển ${number(result.importedQuantity)} SP còn thiếu từ ${dayjs(result.sourceProductionDate).format('DD/MM')}`
                );
            }
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const confirmDiscard = (action: () => void) => {
        if (!dirty) {
            action();
            return;
        }
        modal.confirm({
            title: 'Bỏ các thay đổi chưa lưu?',
            content: 'Các phân bổ vừa chỉnh trên màn hình sẽ không được giữ lại.',
            okText: 'Bỏ thay đổi',
            cancelText: 'Ở lại',
            okButtonProps: { danger: true },
            onOk: action,
        });
    };

    const openNewAllocation = () => {
        if (!activeSlots.length) {
            message.warning('Kế hoạch chưa có khung giờ hoạt động');
            return;
        }
        setEditingClientId(null);
        allocationForm.resetFields();
        allocationForm.setFieldsValue({
            priority: 'normal',
            startSlotKey: activeSlots[0].key,
            endSlotKey: activeSlots[activeSlots.length - 1].key,
            dueDate: date,
        });
        setDrawerOpen(true);
    };

    const openEditAllocation = (draft: AllocationDraft) => {
        setEditingClientId(draft.clientId);
        allocationForm.setFieldsValue({
            lineId: draft.lineId,
            itemId: draft.itemId,
            orderCode: draft.orderCode,
            plannedQuantity: draft.plannedQuantity,
            hourlyQuota: draft.hourlyQuota,
            startSlotKey: draft.startSlotKey,
            endSlotKey: draft.endSlotKey,
            priority: draft.priority,
            dueDate: draft.dueDate ? dayjs(draft.dueDate) : date,
            note: draft.note,
        });
        setDrawerOpen(true);
    };

    const saveAllocationDraft = (values: AllocationFormValues) => {
        const startIndex = slotIndex.get(values.startSlotKey);
        const endIndex = slotIndex.get(values.endSlotKey);
        if (startIndex === undefined || endIndex === undefined || endIndex < startIndex) {
            message.warning('Khoảng giờ phân bổ không hợp lệ');
            return;
        }
        const overlap = drafts.find((draft) => {
            if (draft.clientId === editingClientId || draft.lineId !== values.lineId) return false;
            const otherStart = Number(slotIndex.get(draft.startSlotKey));
            const otherEnd = Number(slotIndex.get(draft.endSlotKey));
            return startIndex <= otherEnd && endIndex >= otherStart;
        });
        if (overlap) {
            message.error(`Khung giờ bị chồng với ${itemById.get(overlap.itemId)?.code || 'mã hàng khác'}`);
            return;
        }
        const previous = drafts.find((draft) => draft.clientId === editingClientId);
        const next: AllocationDraft = {
            clientId: editingClientId || createClientId(),
            id: previous?.id,
            lineId: values.lineId,
            itemId: values.itemId,
            orderCode: values.orderCode?.trim() || undefined,
            plannedQuantity: values.plannedQuantity,
            hourlyQuota: values.hourlyQuota,
            startSlotKey: values.startSlotKey,
            endSlotKey: values.endSlotKey,
            priority: values.priority,
            dueDate: values.dueDate?.format('YYYY-MM-DD') || productionDate,
            note: values.note?.trim() || undefined,
            sourceType: previous?.sourceType || 'manual',
            sourceProductionDate: previous?.sourceProductionDate,
        };
        setDrafts((current) => [...current.filter((draft) => draft.clientId !== next.clientId), next]);
        setDirty(true);
        setDrawerOpen(false);
        allocationForm.resetFields();
    };

    const removeAllocation = (clientId: string) => {
        setDrafts((current) => current.filter((draft) => draft.clientId !== clientId));
        setDirty(true);
    };

    const capacityFor = (draft: AllocationDraft) => {
        const start = slotIndex.get(draft.startSlotKey);
        const end = slotIndex.get(draft.endSlotKey);
        if (start === undefined || end === undefined) return 0;
        const hours = activeSlots
            .slice(start, end + 1)
            .reduce((sum, slot) => sum + (slot.endMinute - slot.startMinute) / 60, 0);
        return Math.round(hours * draft.hourlyQuota);
    };

    const renderAllocationIdentity = (draft: AllocationDraft) => {
        const line = lineById.get(draft.lineId);
        const item = itemById.get(draft.itemId);
        return { line, item };
    };

    const columns: TableColumnsType<AllocationDraft> = [
        {
            title: 'Chuyền',
            key: 'line',
            width: 130,
            render: (_, draft) => {
                const { line } = renderAllocationIdentity(draft);
                return (
                    <div className='production-plan-line-cell'>
                        <strong>{line?.code || '—'}</strong>
                        <small>{line?.leaderName || line?.name || 'Chưa có tổ trưởng'}</small>
                    </div>
                );
            },
        },
        {
            title: 'Mã hàng / Đơn hàng',
            key: 'item',
            width: 230,
            render: (_, draft) => {
                const { item } = renderAllocationIdentity(draft);
                return (
                    <div className='production-plan-item-cell'>
                        <div>
                            <strong>{item?.code || '—'}</strong>
                            {draft.sourceType === 'carry_over' ? <Tag color='purple'>Chuyển tiếp</Tag> : null}
                        </div>
                        <small>{draft.orderCode || item?.name || 'Không có mã đơn'}</small>
                    </div>
                );
            },
        },
        {
            title: 'Khung chạy',
            key: 'window',
            width: 150,
            render: (_, draft) => (
                <div className='production-plan-window'>
                    <CalendarOutlined />
                    <span>
                        {slotByKey.get(draft.startSlotKey)?.label || draft.startSlotKey}–
                        {slotByKey.get(draft.endSlotKey)?.label || draft.endSlotKey}
                    </span>
                </div>
            ),
        },
        {
            title: 'Kế hoạch',
            key: 'quantity',
            width: 155,
            align: 'right',
            render: (_, draft) => (
                <div className='production-plan-number-cell'>
                    <strong>{number(draft.plannedQuantity)} SP</strong>
                    <small>Khoán {number(draft.hourlyQuota)}/giờ</small>
                </div>
            ),
        },
        {
            title: 'Năng lực khung',
            key: 'capacity',
            width: 145,
            align: 'right',
            render: (_, draft) => {
                const capacity = capacityFor(draft);
                const overloaded = draft.plannedQuantity > capacity;
                return (
                    <div className={`production-plan-capacity ${overloaded ? 'is-overloaded' : ''}`}>
                        {overloaded ? <WarningFilled /> : <CheckCircleFilled />}
                        <span>{number(capacity)} SP</span>
                    </div>
                );
            },
        },
        {
            title: 'Ưu tiên',
            dataIndex: 'priority',
            width: 90,
            render: (priority: ProductionPlanPriority) => (
                <Tag color={priorityMeta[priority].color}>{priorityMeta[priority].label}</Tag>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 90,
            fixed: 'right',
            render: (_, draft) => (
                <div className='production-plan-row-actions'>
                    <Button
                        type='text'
                        icon={<EditOutlined />}
                        aria-label='Sửa phân bổ'
                        title='Sửa phân bổ'
                        onClick={() => openEditAllocation(draft)}
                    />
                    <Popconfirm title='Xóa phân bổ này?' onConfirm={() => removeAllocation(draft.clientId)}>
                        <Button
                            type='text'
                            danger
                            icon={<DeleteOutlined />}
                            aria-label='Xóa phân bổ'
                            title='Xóa phân bổ'
                        />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    const submitPlanAction = async () => {
        try {
            const values = await actionForm.validateFields();
            if (planAction === 'publish') publishMutation.mutate(values.note?.trim() || undefined);
            if (planAction === 'reopen') reopenMutation.mutate(values.reason!.trim());
        } catch {
            // Ant Design hiển thị lỗi ngay tại trường cần sửa.
        }
    };

    if (planQuery.isLoading && plantId) {
        return (
            <div className='production-page production-planning-page'>
                <Skeleton active paragraph={{ rows: 12 }} />
            </div>
        );
    }

    return (
        <div className='production-page production-planning-page'>
            <section className='production-workbench-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Kế hoạch & năng lực</span>
                    <Title level={2}>Kế hoạch sản xuất ngày</Title>
                    <Text type='secondary'>Phân bổ chuyền, mã hàng và sản lượng mục tiêu.</Text>
                </div>
                <div className='production-planning-controls'>
                    <Select
                        value={plantId || undefined}
                        onChange={(value) => confirmDiscard(() => setPlantId(value))}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                    />
                    <DatePicker
                        value={date}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        onChange={(value) => value && confirmDiscard(() => setDate(value))}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => planQuery.refetch()}
                        loading={planQuery.isFetching}
                    />
                </div>
            </section>

            {planQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được kế hoạch'
                    description={errorMessage(planQuery.error)}
                    action={<Button onClick={() => planQuery.refetch()}>Thử lại</Button>}
                />
            ) : !plan ? (
                <section className='production-plan-empty'>
                    <Empty description={`Chưa có kế hoạch ngày ${date.format('DD/MM/YYYY')}`}>
                        <Button
                            type='primary'
                            icon={<PlusOutlined />}
                            loading={createMutation.isPending}
                            onClick={() => createMutation.mutate()}
                        >
                            Tạo kế hoạch ngày
                        </Button>
                    </Empty>
                </section>
            ) : (
                <>
                    <section className={`production-plan-statusbar is-${plan.status}`}>
                        <div>
                            <span className='production-plan-status-dot' />
                            <strong>{plan.status === 'published' ? 'Đã ban hành' : 'Đang soạn kế hoạch'}</strong>
                            <Tag>{`Phiên bản ${plan.revision}`}</Tag>
                        </div>
                        <div>
                            {plan.status === 'published' ? (
                                <>
                                    <small>
                                        {plan.publishedBy?.name || 'Quản lý'} ·{' '}
                                        {plan.publishedAt ? dayjs(plan.publishedAt).format('HH:mm DD/MM') : ''}
                                    </small>
                                    <Button icon={<UnlockOutlined />} onClick={() => setPlanAction('reopen')}>
                                        Mở điều chỉnh
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    icon={<ExportOutlined />}
                                    loading={carryMutation.isPending}
                                    onClick={() =>
                                        modal.confirm({
                                            title: 'Chuyển phần còn thiếu gần nhất?',
                                            content: 'Chỉ lấy từ kế hoạch đã ban hành và ngày nguồn đã khóa sổ.',
                                            okText: 'Chuyển tiếp',
                                            cancelText: 'Hủy',
                                            onOk: () => carryMutation.mutate(),
                                        })
                                    }
                                >
                                    Lấy phần còn thiếu
                                </Button>
                            )}
                        </div>
                    </section>

                    <section className='production-plan-kpis'>
                        <div className='is-primary'>
                            <span>Tổng kế hoạch</span>
                            <strong>{number(draftSummary.total)}</strong>
                            <small>SP trong ngày</small>
                        </div>
                        <div>
                            <span>Phân bổ</span>
                            <strong>{drafts.length}</strong>
                            <small>{draftSummary.lines} chuyền</small>
                        </div>
                        <div>
                            <span>Mã hàng</span>
                            <strong>{draftSummary.items}</strong>
                            <small>Mã đang lên kế hoạch</small>
                        </div>
                        <div className={draftSummary.carry ? 'has-carry' : ''}>
                            <span>Chuyển tiếp</span>
                            <strong>{number(draftSummary.carry)}</strong>
                            <small>SP từ kỳ trước</small>
                        </div>
                    </section>

                    {plan.status === 'draft' && (!lines.length || !items.length) ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Danh mục sản xuất chưa đủ'
                            description='Cần có ít nhất một chuyền và một mã hàng đang hoạt động.'
                        />
                    ) : null}

                    <section className='production-plan-allocation-panel'>
                        <div className='production-monitor-section-heading'>
                            <div>
                                <Title level={4}>Phân bổ chuyền và mã hàng</Title>
                                <Text type='secondary'>{drafts.length} phân bổ trong kế hoạch hiện tại</Text>
                            </div>
                            {plan.status === 'draft' ? (
                                <Button type='primary' icon={<PlusOutlined />} onClick={openNewAllocation}>
                                    Thêm phân bổ
                                </Button>
                            ) : null}
                        </div>

                        {!drafts.length ? (
                            <Empty className='production-plan-list-empty' description='Kế hoạch chưa có phân bổ' />
                        ) : isMobile ? (
                            <div className='production-plan-mobile-list'>
                                {sortedDrafts.map((draft) => {
                                    const { line, item } = renderAllocationIdentity(draft);
                                    const capacity = capacityFor(draft);
                                    return (
                                        <article key={draft.clientId} className='production-plan-mobile-card'>
                                            <div className='production-plan-mobile-card__head'>
                                                <span>{line?.code || '—'}</span>
                                                <div>
                                                    <strong>{item?.code || '—'}</strong>
                                                    <small>{draft.orderCode || item?.name || 'Không có mã đơn'}</small>
                                                </div>
                                                <Tag color={priorityMeta[draft.priority].color}>
                                                    {priorityMeta[draft.priority].label}
                                                </Tag>
                                            </div>
                                            <div className='production-plan-mobile-card__metrics'>
                                                <span>
                                                    <small>Kế hoạch</small>
                                                    <strong>{number(draft.plannedQuantity)} SP</strong>
                                                </span>
                                                <span>
                                                    <small>Khung chạy</small>
                                                    <strong>
                                                        {slotByKey.get(draft.startSlotKey)?.label}–
                                                        {slotByKey.get(draft.endSlotKey)?.label}
                                                    </strong>
                                                </span>
                                                <span
                                                    className={draft.plannedQuantity > capacity ? 'is-overloaded' : ''}
                                                >
                                                    <small>Năng lực</small>
                                                    <strong>{number(capacity)} SP</strong>
                                                </span>
                                            </div>
                                            {draft.sourceType === 'carry_over' ? (
                                                <div className='production-plan-carry-label'>
                                                    <ExportOutlined /> Từ ngày{' '}
                                                    {dayjs(draft.sourceProductionDate).format('DD/MM/YYYY')}
                                                </div>
                                            ) : null}
                                            {plan.status === 'draft' ? (
                                                <div className='production-plan-mobile-card__actions'>
                                                    <Button
                                                        icon={<EditOutlined />}
                                                        aria-label='Sửa phân bổ'
                                                        onClick={() => openEditAllocation(draft)}
                                                    >
                                                        Sửa
                                                    </Button>
                                                    <Popconfirm
                                                        title='Xóa phân bổ này?'
                                                        onConfirm={() => removeAllocation(draft.clientId)}
                                                    >
                                                        <Button
                                                            danger
                                                            icon={<DeleteOutlined />}
                                                            aria-label='Xóa phân bổ'
                                                        />
                                                    </Popconfirm>
                                                </div>
                                            ) : null}
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <Table<AllocationDraft>
                                rowKey='clientId'
                                columns={plan.status === 'draft' ? columns : columns.slice(0, -1)}
                                dataSource={sortedDrafts}
                                pagination={false}
                                scroll={{ x: 1050 }}
                            />
                        )}
                    </section>

                    {plan.status === 'draft' ? (
                        <section className='production-plan-savebar'>
                            <div>
                                <Input
                                    value={changeReason}
                                    onChange={(event) => setChangeReason(event.target.value)}
                                    maxLength={500}
                                    placeholder='Lý do lập hoặc điều chỉnh kế hoạch'
                                    status={dirty && changeReason.trim().length < 3 ? 'error' : undefined}
                                />
                                <small>{dirty ? 'Có thay đổi chưa lưu' : 'Kế hoạch đã đồng bộ với máy chủ'}</small>
                            </div>
                            <Button
                                icon={<SaveOutlined />}
                                disabled={!dirty || changeReason.trim().length < 3}
                                loading={saveMutation.isPending}
                                onClick={() => saveMutation.mutate()}
                            >
                                Lưu phiên bản
                            </Button>
                            <Button
                                type='primary'
                                icon={<SendOutlined />}
                                disabled={dirty || !drafts.length}
                                onClick={() => setPlanAction('publish')}
                            >
                                Ban hành
                            </Button>
                        </section>
                    ) : null}
                </>
            )}

            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                placement={screens.md ? 'right' : 'bottom'}
                width={screens.md ? 520 : undefined}
                height={screens.md ? undefined : '92dvh'}
                title={editingClientId ? 'Sửa phân bổ sản xuất' : 'Thêm phân bổ sản xuất'}
                className='production-plan-drawer'
                destroyOnHidden
            >
                <Form form={allocationForm} layout='vertical' onFinish={saveAllocationDraft}>
                    <div className='production-form-two-columns'>
                        <Form.Item label='Chuyền' name='lineId' rules={[{ required: true, message: 'Chọn chuyền' }]}>
                            <Select
                                showSearch
                                optionFilterProp='label'
                                options={lines.map((line: ProductionLine) => ({
                                    value: line.id,
                                    label: `${line.code}${line.leaderName ? ` · ${line.leaderName}` : ''}`,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item label='Mã hàng' name='itemId' rules={[{ required: true, message: 'Chọn mã hàng' }]}>
                            <Select
                                showSearch
                                optionFilterProp='label'
                                options={items.map((item: ProductionItem) => ({
                                    value: item.id,
                                    label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                }))}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item label='Mã đơn hàng / Lệnh sản xuất' name='orderCode'>
                        <Input maxLength={80} placeholder='VD: LSX-0726-01' />
                    </Form.Item>
                    <div className='production-form-two-columns'>
                        <Form.Item
                            label='Sản lượng kế hoạch'
                            name='plannedQuantity'
                            rules={[{ required: true, message: 'Nhập sản lượng kế hoạch' }]}
                        >
                            <InputNumber min={1} precision={0} className='w-full' addonAfter='SP' />
                        </Form.Item>
                        <Form.Item
                            label='Khoán mỗi giờ'
                            name='hourlyQuota'
                            rules={[{ required: true, message: 'Nhập khoán giờ' }]}
                        >
                            <InputNumber min={1} precision={0} className='w-full' addonAfter='SP/giờ' />
                        </Form.Item>
                    </div>
                    <div className='production-form-two-columns'>
                        <Form.Item
                            label='Bắt đầu từ'
                            name='startSlotKey'
                            rules={[{ required: true, message: 'Chọn giờ bắt đầu' }]}
                        >
                            <Select options={activeSlots.map((slot) => ({ value: slot.key, label: slot.label }))} />
                        </Form.Item>
                        <Form.Item
                            label='Kết thúc tại'
                            name='endSlotKey'
                            rules={[{ required: true, message: 'Chọn giờ kết thúc' }]}
                        >
                            <Select options={activeSlots.map((slot) => ({ value: slot.key, label: slot.label }))} />
                        </Form.Item>
                    </div>
                    <div className='production-form-two-columns'>
                        <Form.Item label='Mức ưu tiên' name='priority' rules={[{ required: true }]}>
                            <Select
                                options={(Object.keys(priorityMeta) as ProductionPlanPriority[]).map((priority) => ({
                                    value: priority,
                                    label: priorityMeta[priority].label,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item label='Hạn hoàn thành' name='dueDate'>
                            <DatePicker className='w-full' format='DD/MM/YYYY' />
                        </Form.Item>
                    </div>
                    <Form.Item label='Ghi chú điều hành' name='note'>
                        <Input.TextArea rows={3} maxLength={500} />
                    </Form.Item>
                    <div className='production-plan-drawer-actions'>
                        <Button onClick={() => setDrawerOpen(false)}>Hủy</Button>
                        <Button type='primary' htmlType='submit' icon={<SaveOutlined />}>
                            {editingClientId ? 'Cập nhật phân bổ' : 'Thêm vào kế hoạch'}
                        </Button>
                    </div>
                </Form>
            </Drawer>

            <Modal
                open={Boolean(planAction)}
                title={planAction === 'publish' ? 'Ban hành kế hoạch sản xuất' : 'Mở lại kế hoạch'}
                okText={planAction === 'publish' ? 'Ban hành' : 'Mở điều chỉnh'}
                cancelText='Hủy'
                confirmLoading={publishMutation.isPending || reopenMutation.isPending}
                onCancel={() => {
                    setPlanAction(null);
                    actionForm.resetFields();
                }}
                onOk={() => void submitPlanAction()}
            >
                <Form form={actionForm} layout='vertical'>
                    {planAction === 'publish' ? (
                        <Form.Item label='Ghi chú ban hành' name='note'>
                            <Input.TextArea rows={3} maxLength={500} placeholder='Nội dung cần lưu ý trong ngày' />
                        </Form.Item>
                    ) : (
                        <Form.Item
                            label='Lý do mở lại'
                            name='reason'
                            rules={[{ required: true, min: 3, message: 'Nhập lý do mở lại kế hoạch' }]}
                        >
                            <Input.TextArea rows={3} maxLength={500} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default ProductionPlanningPage;
