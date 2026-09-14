import {
    CalendarOutlined,
    CheckCircleFilled,
    CloudUploadOutlined,
    DownloadOutlined,
    EditOutlined,
    FileExcelOutlined,
    PlusOutlined,
    ReloadOutlined,
    RightOutlined,
    SearchOutlined,
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
    Input,
    InputNumber,
    Modal,
    Progress,
    Select,
    Skeleton,
    Table,
    Tag,
    Timeline,
    Tooltip,
    Typography,
    Upload,
    type TableColumnsType,
    type UploadFile,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { productionPlantLabel } from '../core/lib/productionAccess';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionOrder,
    ProductionOrderDeadlineStatus,
    ProductionOrderImportRow,
    ProductionOrderPayload,
    ProductionOrderStatus,
    ProductionPlanPriority,
} from '../core/types/production';

const { Text, Title } = Typography;
const { Dragger } = Upload;
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý đơn hàng');

const statusMeta: Record<ProductionOrderStatus, { label: string; color: string }> = {
    draft: { label: 'Chuẩn bị', color: 'default' },
    ready: { label: 'Sẵn sàng', color: 'cyan' },
    in_production: { label: 'Đang sản xuất', color: 'blue' },
    paused: { label: 'Tạm dừng', color: 'gold' },
    completed: { label: 'Hoàn thành', color: 'green' },
    cancelled: { label: 'Đã hủy', color: 'red' },
};
const priorityMeta: Record<ProductionPlanPriority, { label: string; color: string }> = {
    urgent: { label: 'Khẩn', color: 'red' },
    high: { label: 'Cao', color: 'orange' },
    normal: { label: 'Thường', color: 'blue' },
    low: { label: 'Thấp', color: 'default' },
};
const deadlineMeta: Record<ProductionOrderDeadlineStatus, { label: string; color: string; tone: string }> = {
    completed: { label: 'Đã đủ sản lượng', color: 'green', tone: 'success' },
    overdue: { label: 'Quá hạn', color: 'red', tone: 'danger' },
    due_soon: { label: 'Sắp đến hạn', color: 'orange', tone: 'warning' },
    on_schedule: { label: 'Còn thời gian', color: 'blue', tone: 'normal' },
};

type OrderFormValues = {
    code: string;
    customerName?: string;
    itemId: string;
    totalQuantity: number;
    plannedStartDate?: Dayjs | null;
    dueDate: Dayjs;
    priority: ProductionPlanPriority;
    status: ProductionOrderStatus;
    note?: string;
    changeReason?: string;
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const ProductionOrdersPage = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isPhone, isCompact: isMobile } = useResponsive();
    const [form] = Form.useForm<OrderFormValues>();
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [status, setStatus] = useState('open');
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim());
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<ProductionOrder | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<Awaited<ReturnType<typeof productionService.previewOrderImport>> | null>(
        null
    );
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, 'orders'],
        queryFn: () => productionService.getItems(plantId),
        enabled: Boolean(plantId),
        staleTime: 60_000,
    });
    const ordersKey = ['production', 'orders', plantId, status, deferredSearch] as const;
    const ordersQuery = useQuery({
        queryKey: ordersKey,
        queryFn: () =>
            productionService.getOrders({
                plantId,
                status,
                search: deferredSearch || undefined,
            }),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    useEffect(() => {
        if (!socket) return;
        const refresh = (payload: { plantId: string }) => {
            if (payload.plantId === plantId) void queryClient.invalidateQueries({ queryKey: ['production', 'orders'] });
        };
        socket.on('production:order-updated', refresh);
        socket.on('production:updated', refresh);
        socket.on('production:plan-updated', refresh);
        return () => {
            socket.off('production:order-updated', refresh);
            socket.off('production:updated', refresh);
            socket.off('production:plan-updated', refresh);
        };
    }, [plantId, queryClient, socket]);

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['production', 'orders'] });
    };

    const saveMutation = useMutation({
        mutationFn: async (values: OrderFormValues) => {
            const payload: ProductionOrderPayload = {
                plantId,
                code: values.code.trim(),
                customerName: values.customerName?.trim() || undefined,
                itemId: values.itemId,
                totalQuantity: values.totalQuantity,
                plannedStartDate: values.plannedStartDate?.format('YYYY-MM-DD') || null,
                dueDate: values.dueDate.format('YYYY-MM-DD'),
                priority: values.priority,
                status: values.status,
                note: values.note?.trim() || undefined,
            };
            if (!editing) return productionService.createOrder(payload);
            return productionService.updateOrder(editing.id, {
                ...payload,
                revision: editing.revision,
                changeReason: values.changeReason?.trim() || 'Cập nhật hồ sơ đơn hàng',
            });
        },
        onSuccess: async (saved) => {
            message.success(editing ? 'Đã cập nhật đơn hàng' : 'Đã tạo đơn hàng');
            setEditing(saved);
            setEditorOpen(false);
            form.resetFields();
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const previewMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error('Chọn file Excel trước khi xem trước');
            return productionService.previewOrderImport(file, plantId);
        },
        onSuccess: setPreview,
        onError: (error) => message.error(errorMessage(error)),
    });
    const importMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error('Chọn file Excel trước khi xác nhận');
            return productionService.confirmOrderImport(file, plantId);
        },
        onSuccess: async (result) => {
            message.success(`Đã tạo ${result.createdCount} và cập nhật ${result.updatedCount} đơn hàng`);
            setImportOpen(false);
            setFile(null);
            setFileList([]);
            setPreview(null);
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const templateMutation = useMutation({
        mutationFn: () => productionService.downloadOrderTemplate(plantId),
        onSuccess: (blob) => downloadBlob(blob, `mau-don-hang-san-xuat-${plantId}.xlsx`),
        onError: (error) => message.error(errorMessage(error)),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ priority: 'normal', status: 'draft', dueDate: dayjs().add(14, 'day') });
        setEditorOpen(true);
    };
    const openEdit = useCallback(
        (order: ProductionOrder) => {
            setEditing(order);
            form.setFieldsValue({
                code: order.code,
                customerName: order.customerName,
                itemId: order.itemId,
                totalQuantity: order.totalQuantity,
                plannedStartDate: order.plannedStartDate ? dayjs(order.plannedStartDate) : null,
                dueDate: dayjs(order.dueDate),
                priority: order.priority,
                status: order.status,
                note: order.note,
                changeReason: '',
            });
            setEditorOpen(true);
        },
        [form]
    );

    const data = ordersQuery.data;
    const orders = data?.items || [];
    const summary = data?.summary;
    const deadline = (order: ProductionOrder) => deadlineMeta[order.progress?.deadlineStatus || 'on_schedule'];

    const columns = useMemo<TableColumnsType<ProductionOrder>>(
        () => [
            {
                title: 'Đơn hàng',
                key: 'identity',
                width: 250,
                fixed: 'left',
                render: (_, order) => (
                    <button type='button' className='production-order-link' onClick={() => openEdit(order)}>
                        <strong>{order.code}</strong>
                        <span>{order.customerName || 'Chưa khai báo khách hàng'}</span>
                    </button>
                ),
            },
            {
                title: 'Mã hàng',
                key: 'item',
                width: 160,
                render: (_, order) => (
                    <div className='production-order-item'>
                        <strong>{order.itemCode}</strong>
                        <span>{order.itemName || 'Mã sản xuất'}</span>
                    </div>
                ),
            },
            {
                title: 'Tiến độ lũy kế',
                key: 'progress',
                width: 260,
                render: (_, order) => (
                    <div className='production-order-progress'>
                        <div>
                            <strong>{number(order.progress?.producedQuantity)} SP</strong>
                            <span>/ {number(order.totalQuantity)} SP</span>
                        </div>
                        <Progress
                            percent={Math.min(100, Number(order.progress?.completionPercent || 0))}
                            showInfo={false}
                            strokeColor={order.progress?.deadlineStatus === 'overdue' ? '#dc2626' : '#16856b'}
                            size='small'
                        />
                        <small>Còn {number(order.progress?.remainingQuantity)} SP</small>
                    </div>
                ),
            },
            {
                title: 'Kế hoạch tới',
                key: 'futurePlan',
                width: 145,
                align: 'right',
                render: (_, order) => (
                    <div className='production-order-number'>
                        <strong>{number(order.progress?.futurePlannedQuantity)}</strong>
                        <span>Chưa xếp {number(order.progress?.unplannedQuantity)}</span>
                    </div>
                ),
            },
            {
                title: 'Hạn giao',
                dataIndex: 'dueDate',
                width: 150,
                render: (_, order) => (
                    <div className='production-order-due'>
                        <strong>{dayjs(order.dueDate).format('DD/MM/YYYY')}</strong>
                        <Tag color={deadline(order).color}>{deadline(order).label}</Tag>
                    </div>
                ),
            },
            {
                title: 'Trạng thái',
                dataIndex: 'status',
                width: 140,
                render: (value: ProductionOrderStatus) => (
                    <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>
                ),
            },
            {
                title: '',
                key: 'actions',
                width: 92,
                fixed: 'right',
                render: (_, order) => (
                    <div className='production-order-actions'>
                        <Tooltip title='Chỉnh sửa'>
                            <Button type='text' icon={<EditOutlined />} onClick={() => openEdit(order)} />
                        </Tooltip>
                        <Tooltip title='Lập kế hoạch'>
                            <Button
                                type='text'
                                icon={<CalendarOutlined />}
                                disabled={['completed', 'cancelled'].includes(order.status)}
                                onClick={() => navigate(`/production/planning?plantId=${plantId}&orderId=${order.id}`)}
                            />
                        </Tooltip>
                    </div>
                ),
            },
        ],
        [navigate, openEdit, plantId]
    );

    const importColumns: TableColumnsType<ProductionOrderImportRow> = [
        { title: 'Dòng', dataIndex: 'rowNumber', width: 66 },
        {
            title: 'Kết quả',
            dataIndex: 'action',
            width: 110,
            render: (value) => (
                <Tag color={value === 'error' ? 'red' : value === 'update' ? 'gold' : 'green'}>
                    {value === 'error' ? 'Có lỗi' : value === 'update' ? 'Cập nhật' : 'Tạo mới'}
                </Tag>
            ),
        },
        { title: 'Mã đơn', dataIndex: 'code', width: 150 },
        { title: 'Mã hàng', dataIndex: 'itemCode', width: 110 },
        { title: 'Số lượng', dataIndex: 'totalQuantity', width: 110, align: 'right', render: number },
        {
            title: 'Ngày giao',
            dataIndex: 'dueDate',
            width: 120,
            render: (value) => (value ? dayjs(value).format('DD/MM/YYYY') : '—'),
        },
        {
            title: 'Lỗi cần sửa',
            dataIndex: 'errors',
            width: 280,
            render: (values: string[]) => values.join('; ') || 'Dữ liệu hợp lệ',
        },
    ];

    const renderMobileOrder = (order: ProductionOrder) => (
        <article
            key={order.id}
            className={`production-order-card is-${deadline(order).tone}`}
            onClick={() => openEdit(order)}
        >
            <div className='production-order-card__head'>
                <div>
                    <strong>{order.code}</strong>
                    <span>{order.customerName || order.itemName || 'Đơn hàng sản xuất'}</span>
                </div>
                <RightOutlined />
            </div>
            <div className='production-order-card__tags'>
                <Tag color={statusMeta[order.status].color}>{statusMeta[order.status].label}</Tag>
                <Tag color={priorityMeta[order.priority].color}>{priorityMeta[order.priority].label}</Tag>
                <Tag color={deadline(order).color}>{deadline(order).label}</Tag>
            </div>
            <div className='production-order-card__progress'>
                <div>
                    <span>Đã sản xuất</span>
                    <strong>
                        {number(order.progress?.producedQuantity)} / {number(order.totalQuantity)} SP
                    </strong>
                </div>
                <Progress percent={Math.min(100, Number(order.progress?.completionPercent || 0))} showInfo={false} />
            </div>
            <div className='production-order-card__foot'>
                <span>Mã {order.itemCode}</span>
                <span>Giao {dayjs(order.dueDate).format('DD/MM')}</span>
                <span>Còn {number(order.progress?.remainingQuantity)}</span>
            </div>
        </article>
    );

    return (
        <div className='production-page production-orders-page'>
            <header className='production-orders-header'>
                <div>
                    <span className='production-kicker'>Nhu cầu & tiến độ đơn hàng</span>
                    <Title level={2}>Danh sách đơn hàng sản xuất</Title>
                    <Text type='secondary'>Nguồn chuẩn cho kế hoạch ngày, sản lượng lũy kế và hạn giao.</Text>
                </div>
                <div className='production-orders-header__actions'>
                    <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>
                        Nhập Excel
                    </Button>
                    <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
                        Thêm đơn hàng
                    </Button>
                </div>
            </header>

            <section className='production-orders-controls'>
                <Select
                    className='production-orders-plant'
                    value={plantId || undefined}
                    disabled={!canSwitchPlant}
                    placeholder='Chọn cơ sở'
                    onChange={(value) => setPlantId(value)}
                    options={(plantsQuery.data || []).map((plant) => ({
                        value: plant.id,
                        label: productionPlantLabel(plant),
                    }))}
                />
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder='Tìm mã đơn, khách hàng, mã hàng...'
                />
                <Select
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'open', label: 'Đơn đang mở' },
                        { value: 'all', label: 'Tất cả trạng thái' },
                        ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
                    ]}
                />
                <Button icon={<ReloadOutlined />} loading={ordersQuery.isFetching} onClick={() => void refresh()}>
                    {isPhone ? null : 'Làm mới'}
                </Button>
            </section>

            <section className='production-orders-kpis'>
                <div>
                    <span>Đơn đang theo dõi</span>
                    <strong>{number(summary?.openOrders)}</strong>
                    <small>{number(summary?.totalOrders)} đơn trong bộ lọc</small>
                </div>
                <div className={summary?.overdueOrders ? 'is-danger' : ''}>
                    <span>Quá hạn còn sản lượng</span>
                    <strong>{number(summary?.overdueOrders)}</strong>
                    <small>{number(summary?.dueSoonOrders)} đơn sắp đến hạn</small>
                </div>
                <div>
                    <span>Sản lượng còn lại</span>
                    <strong>{number(summary?.remainingQuantity)} SP</strong>
                    <small>Đã làm {number(summary?.producedQuantity)} SP</small>
                </div>
                <div className={summary?.unplannedQuantity ? 'is-warning' : ''}>
                    <span>Chưa có kế hoạch tới</span>
                    <strong>{number(summary?.unplannedQuantity)} SP</strong>
                    <small>Cần tiếp tục phân bổ theo ngày</small>
                </div>
            </section>

            {ordersQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 10 }} />
            ) : ordersQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được đơn hàng'
                    description={errorMessage(ordersQuery.error)}
                />
            ) : !orders.length ? (
                <div className='production-orders-empty'>
                    <Empty description='Chưa có đơn hàng phù hợp bộ lọc' />
                    <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
                        Tạo đơn hàng đầu tiên
                    </Button>
                </div>
            ) : isMobile ? (
                <section className='production-order-card-list'>{orders.map(renderMobileOrder)}</section>
            ) : (
                <section className='production-orders-table'>
                    <Table<ProductionOrder>
                        rowKey='id'
                        columns={columns}
                        dataSource={orders}
                        scroll={{ x: 1180 }}
                        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `${total} đơn hàng` }}
                    />
                </section>
            )}

            <Drawer
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                width={isMobile ? '100%' : 560}
                title={editing ? `Đơn hàng ${editing.code}` : 'Tạo đơn hàng sản xuất'}
                destroyOnClose
                footer={
                    <div className='production-order-drawer-actions'>
                        <Button onClick={() => setEditorOpen(false)}>Đóng</Button>
                        {editing && !['completed', 'cancelled'].includes(editing.status) ? (
                            <Button
                                icon={<CalendarOutlined />}
                                onClick={() =>
                                    navigate(`/production/planning?plantId=${plantId}&orderId=${editing.id}`)
                                }
                            >
                                Lập kế hoạch
                            </Button>
                        ) : null}
                        <Button type='primary' loading={saveMutation.isPending} onClick={() => form.submit()}>
                            {editing ? 'Lưu thay đổi' : 'Tạo đơn hàng'}
                        </Button>
                    </div>
                }
            >
                {editing?.progress ? (
                    <section className='production-order-detail-progress'>
                        <div>
                            <span>Tiến độ lũy kế</span>
                            <strong>
                                {number(editing.progress.producedQuantity)} / {number(editing.totalQuantity)} SP
                            </strong>
                        </div>
                        <Progress
                            percent={Math.min(100, editing.progress.completionPercent)}
                            format={() => `${editing.progress?.completionPercent}%`}
                            strokeColor='#16856b'
                        />
                        <div className='production-order-detail-grid'>
                            <div>
                                <span>Đầu kỳ</span>
                                <strong>{number(editing.progress.openingQuantity)}</strong>
                            </div>
                            <div>
                                <span>Trên hệ thống</span>
                                <strong>{number(editing.progress.trackedQuantity)}</strong>
                            </div>
                            <div>
                                <span>Kế hoạch tới</span>
                                <strong>{number(editing.progress.futurePlannedQuantity)}</strong>
                            </div>
                            <div>
                                <span>Chưa xếp</span>
                                <strong>{number(editing.progress.unplannedQuantity)}</strong>
                            </div>
                        </div>
                    </section>
                ) : null}
                <Form
                    form={form}
                    layout='vertical'
                    onFinish={(values) => saveMutation.mutate(values)}
                    requiredMark='optional'
                >
                    <div className='production-order-form-grid'>
                        <Form.Item
                            label='Mã đơn hàng'
                            name='code'
                            rules={[{ required: true, message: 'Nhập mã đơn hàng' }]}
                        >
                            <Input maxLength={80} placeholder='VD: PO-2026-001' />
                        </Form.Item>
                        <Form.Item label='Khách hàng' name='customerName'>
                            <Input maxLength={160} placeholder='Tên khách hàng' />
                        </Form.Item>
                    </div>
                    <Form.Item
                        label='Mã hàng sản xuất'
                        name='itemId'
                        rules={[{ required: true, message: 'Chọn mã hàng' }]}
                    >
                        <Select
                            showSearch
                            optionFilterProp='label'
                            placeholder='Chọn mã hàng đã khai báo'
                            options={(itemsQuery.data || []).map((item) => ({
                                value: item.id,
                                label: `${item.code} · ${item.name || 'Mã sản xuất'}`,
                            }))}
                        />
                    </Form.Item>
                    <div className='production-order-form-grid'>
                        <Form.Item
                            label='Tổng số lượng'
                            name='totalQuantity'
                            rules={[{ required: true, message: 'Nhập tổng số lượng' }]}
                        >
                            <InputNumber min={1} precision={0} className='w-full' addonAfter='SP' />
                        </Form.Item>
                        <Form.Item label='Mức ưu tiên' name='priority'>
                            <Select
                                options={Object.entries(priorityMeta).map(([value, meta]) => ({
                                    value,
                                    label: meta.label,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item label='Ngày dự kiến vào chuyền' name='plannedStartDate'>
                            <DatePicker format='DD/MM/YYYY' className='w-full' />
                        </Form.Item>
                        <Form.Item
                            label='Ngày giao hàng'
                            name='dueDate'
                            rules={[{ required: true, message: 'Chọn ngày giao hàng' }]}
                        >
                            <DatePicker format='DD/MM/YYYY' className='w-full' />
                        </Form.Item>
                    </div>
                    <Form.Item label='Trạng thái' name='status'>
                        <Select
                            options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                        />
                    </Form.Item>
                    <Form.Item label='Ghi chú đơn hàng' name='note'>
                        <Input.TextArea
                            rows={3}
                            maxLength={500}
                            showCount
                            placeholder='Thông tin cần lưu ý khi lập kế hoạch'
                        />
                    </Form.Item>
                    {editing ? (
                        <Form.Item
                            label='Lý do thay đổi'
                            name='changeReason'
                            rules={[{ required: true, min: 3, message: 'Nêu ngắn gọn lý do cập nhật' }]}
                        >
                            <Input maxLength={500} placeholder='VD: Khách hàng điều chỉnh ngày giao' />
                        </Form.Item>
                    ) : null}
                </Form>
                {editing?.history?.length ? (
                    <section className='production-order-history'>
                        <Title level={5}>Lịch sử hồ sơ</Title>
                        <Timeline
                            items={[...editing.history].reverse().map((event) => ({
                                color: event.type === 'status_changed' ? 'blue' : 'gray',
                                children: (
                                    <div>
                                        <strong>
                                            {event.type === 'created'
                                                ? 'Tạo đơn hàng'
                                                : event.type === 'imported'
                                                  ? 'Nhập từ Excel'
                                                  : event.type === 'status_changed'
                                                    ? 'Đổi trạng thái'
                                                    : 'Cập nhật hồ sơ'}
                                        </strong>
                                        <span>
                                            {event.note || 'Không có ghi chú'} · {event.actor?.name || 'Người dùng'} ·{' '}
                                            {event.at ? dayjs(event.at).format('DD/MM/YYYY HH:mm') : ''}
                                        </span>
                                    </div>
                                ),
                            }))}
                        />
                    </section>
                ) : null}
            </Drawer>

            <Modal
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                width={isMobile ? 'calc(100vw - 16px)' : 1040}
                title='Nhập đơn hàng từ Excel'
                footer={[
                    <Button
                        key='template'
                        icon={<DownloadOutlined />}
                        loading={templateMutation.isPending}
                        onClick={() => templateMutation.mutate()}
                    >
                        Tải file mẫu
                    </Button>,
                    <Button key='close' onClick={() => setImportOpen(false)}>
                        Đóng
                    </Button>,
                    <Button
                        key='preview'
                        icon={<FileExcelOutlined />}
                        loading={previewMutation.isPending}
                        disabled={!file}
                        onClick={() => previewMutation.mutate()}
                    >
                        Kiểm tra file
                    </Button>,
                    <Button
                        key='confirm'
                        type='primary'
                        icon={<CloudUploadOutlined />}
                        loading={importMutation.isPending}
                        disabled={!preview || preview.summary.errorRows > 0}
                        onClick={() => importMutation.mutate()}
                    >
                        Xác nhận nhập
                    </Button>,
                ]}
            >
                <Dragger
                    accept='.xlsx'
                    maxCount={1}
                    fileList={fileList}
                    beforeUpload={(nextFile) => {
                        setFile(nextFile);
                        setFileList([nextFile]);
                        setPreview(null);
                        return false;
                    }}
                    onRemove={() => {
                        setFile(null);
                        setFileList([]);
                        setPreview(null);
                    }}
                >
                    <p className='ant-upload-drag-icon'>
                        <FileExcelOutlined />
                    </p>
                    <p className='ant-upload-text'>Kéo file đơn hàng vào đây hoặc bấm để chọn</p>
                    <p className='ant-upload-hint'>Hệ thống chỉ nhận .xlsx và luôn kiểm tra trước khi ghi dữ liệu.</p>
                </Dragger>
                {preview ? (
                    <section className='production-order-import-preview'>
                        <div className='production-order-import-summary'>
                            <div>
                                <span>Tổng dòng</span>
                                <strong>{preview.summary.totalRows}</strong>
                            </div>
                            <div>
                                <span>Tạo mới</span>
                                <strong>{preview.summary.createRows}</strong>
                            </div>
                            <div>
                                <span>Cập nhật</span>
                                <strong>{preview.summary.updateRows}</strong>
                            </div>
                            <div className={preview.summary.errorRows ? 'is-danger' : ''}>
                                <span>Dòng lỗi</span>
                                <strong>{preview.summary.errorRows}</strong>
                            </div>
                        </div>
                        {preview.summary.errorRows ? (
                            <Alert
                                type='error'
                                showIcon
                                message='Chưa thể nhập file'
                                description='Sửa toàn bộ dòng lỗi rồi kiểm tra lại để tránh ghi dữ liệu dở dang.'
                            />
                        ) : (
                            <Alert
                                type='success'
                                showIcon
                                icon={<CheckCircleFilled />}
                                message='File hợp lệ và sẵn sàng xác nhận'
                            />
                        )}
                        <Table<ProductionOrderImportRow>
                            size='small'
                            rowKey='rowNumber'
                            columns={importColumns}
                            dataSource={preview.rows}
                            pagination={{ pageSize: 8 }}
                            scroll={{ x: 950 }}
                            rowClassName={(row) => (row.errors.length ? 'production-order-import-row-error' : '')}
                        />
                    </section>
                ) : null}
            </Modal>
        </div>
    );
};

export default ProductionOrdersPage;
