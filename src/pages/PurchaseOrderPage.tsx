import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Alert,
    App,
    Badge,
    Button,
    Card,
    Checkbox,
    Descriptions,
    Drawer,
    Empty,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    CheckOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    FileExcelOutlined,
    InboxOutlined,
    PlusOutlined,
    ShoppingOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import {
    materialSupplierService,
    purchaseOrderService,
    purchaseRequestService,
    type PurchaseOrder,
    type PurchaseOrderItem,
    type PurchaseOrderItemUpdate,
    type PurchaseOrderQueryParams,
    type PurchaseOrderStatus,
    type PurchaseRequest,
} from '../core/services/material.service';
import type { PaginatedResponse, User } from '../core/types';

const { Text } = Typography;
const DEFAULT_LIMIT = 10;

const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);
const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');
const resolveUserLabel = (v?: string | User) => {
    if (!v) return '-';
    if (typeof v === 'string') return v;
    return (v as any).name || (v as any).fullname || (v as any).email || '';
};

const normResp = <T,>(r: T[] | PaginatedResponse<T>, page = 1, limit = DEFAULT_LIMIT): PaginatedResponse<T> => {
    if (Array.isArray(r)) {
        const total = r.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        return { data: r.slice((safePage - 1) * limit, safePage * limit), total, page: safePage, limit, totalPages };
    }
    return r;
};

const STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    draft:     { color: 'default',    label: 'Bản nháp',        icon: null },
    confirmed: { color: 'warning',    label: 'Đã xác nhận',     icon: <ClockCircleOutlined /> },
    ordered:   { color: 'processing', label: 'Đang đặt hàng',   icon: <ShoppingOutlined /> },
    received:  { color: 'success',    label: 'Đã nhận hàng',    icon: <CheckCircleOutlined /> },
    cancelled: { color: 'error',      label: 'Đã huỷ',          icon: <CloseCircleOutlined /> },
};

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }));


// ─── ModalCreate ─────────────────────────────────────────────────────────────

type ModalCreateProps = {
    open: boolean;
    submitting: boolean;
    onClose: () => void;
    onCreate: (purchaseRequestIds: string[], note: string) => Promise<void>;
};

const ModalCreate: React.FC<ModalCreateProps> = ({ open, submitting, onClose, onCreate }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const [note, setNote] = useState('');

    const { data: prResp } = useQuery({
        queryKey: ['purchase-requests', 'approved-for-po'],
        queryFn: () => purchaseRequestService.getAll({ status: 'approved', limit: 200 }),
        enabled: open,
    });

    const approvedRequests: PurchaseRequest[] = useMemo(() => {
        const r = prResp;
        return Array.isArray(r) ? r : (r as any)?.data ?? [];
    }, [prResp]);

    React.useEffect(() => {
        if (!open) { setSelected([]); setNote(''); }
    }, [open]);

    const selectedRequests = approvedRequests.filter((r) => selected.includes(r.id));
    const totalItems = selectedRequests.reduce((s, r) => s + r.items.length, 0);
    const totalEst = selectedRequests.reduce((s, r) => s + (r.totalWithVat ?? r.totalEstimated ?? 0), 0);

    const prCols: TableColumnsType<PurchaseRequest> = [
        { title: '', key: 'sel', width: 40,
          render: (_: any, r: PurchaseRequest) => (
            <Checkbox checked={selected.includes(r.id)}
                onChange={(e) => setSelected((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />
          ) },
        { title: 'Mã phiếu', dataIndex: 'requestCode', key: 'code', width: 160,
          render: (v: string) => <Text style={{ fontFamily: 'monospace', color: '#1A3A5C', fontWeight: 600 }}>{v}</Text> },
        { title: 'Tháng', key: 'month', width: 100,
          render: (_: any, r: PurchaseRequest) => r.requestMonth && r.requestYear ? `${r.requestMonth}/${r.requestYear}` : '-' },
        { title: 'Số VT', key: 'items', width: 70, align: 'center',
          render: (_: any, r: PurchaseRequest) => <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} /> },
        { title: 'Tổng tiền ĐX', key: 'total', width: 140, align: 'right',
          render: (_: any, r: PurchaseRequest) => fmtVND(r.totalWithVat ?? r.totalEstimated) },
        { title: 'Ngày duyệt', key: 'approved', width: 110,
          render: (_: any, r: PurchaseRequest) => fmtDate(r.approvedAt) },
    ];

    return (
        <Modal open={open} title="Tạo đơn đặt hàng mới" width={900} centered maskClosable={false} destroyOnClose
            onCancel={onClose}
            footer={
                <Space>
                    <Button onClick={onClose}>Huỷ</Button>
                    <Button type="primary" style={{ background: '#1A3A5C' }} loading={submitting}
                        disabled={selected.length === 0}
                        onClick={() => onCreate(selected, note)}>
                        Tạo đơn hàng →
                    </Button>
                </Space>
            }
        >
            {selected.length > 0 && (
                <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message={`Đã chọn ${selected.length} phiếu — ${totalItems} vật tư — ước tính ${fmtVND(totalEst)}`} />
            )}
            <Table dataSource={approvedRequests} columns={prCols} rowKey="id" size="small"
                pagination={false} scroll={{ y: 320 }}
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '8px 16px', background: '#FAFAFA' }}>
                            <Table
                                size="small"
                                dataSource={record.items}
                                pagination={false}
                                columns={[
                                    { title: 'Tên vật tư', dataIndex: 'materialName', width: 220 },
                                    { title: 'Người ĐX', dataIndex: 'proposedBy', width: 120 },
                                    { title: 'SL cần', dataIndex: 'quantityRequested', width: 80, align: 'center' as const },
                                    { title: 'ĐVT', dataIndex: 'unit', width: 70 },
                                    { title: 'Đơn giá ĐX', dataIndex: 'unitPrice', width: 120, align: 'right' as const,
                                      render: (v: any) => v ? fmtVND(v) : '-' },
                                    { title: 'NCC', dataIndex: 'supplierName', width: 150 },
                                    { title: 'Mục đích', dataIndex: 'purpose', ellipsis: true },
                                ]}
                                rowKey={(_: any, idx: any) => String(idx)}
                            />
                            <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 600, color: '#1A3A5C' }}>
                                Tổng tiền ước tính: {fmtVND(record.totalWithVat ?? record.totalEstimated)}
                            </div>
                        </div>
                    ),
                    rowExpandable: (record) => (record.items?.length ?? 0) > 0,
                    expandRowByClick: false,
                }}
                locale={{ emptyText: <Empty description="Không có phiếu đề xuất đã duyệt" /> }} />
            <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Ghi chú chung</Text>
                <Input.TextArea rows={2} style={{ marginTop: 4 }} value={note}
                    onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú cho đơn hàng..." />
            </div>
        </Modal>
    );
};

// ─── DetailDrawer ─────────────────────────────────────────────────────────────

type DrawerProps = {
    record?: PurchaseOrder | null;
    loading: boolean;
    isCS1Manager: boolean;
    isCS1Director: boolean;
    onClose: () => void;
    onConfirm: (id: string) => void;
    onReceive: (id: string) => void;
    onDelete: (id: string) => void;
    onExport: (id: string, code: string) => void;
    confirmingId: string | null;
    receivingId: string | null;
};

const DetailDrawer: React.FC<DrawerProps> = ({
    record, loading, isCS1Manager, isCS1Director,
    onClose, onConfirm, onReceive, onDelete, onExport,
    confirmingId, receivingId,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [editedItems, setEditedItems] = useState<Record<number, Partial<PurchaseOrderItemUpdate>>>({});
    const [hasEdit, setHasEdit] = useState(false);

    const { data: suppliersResp } = useQuery({
        queryKey: ['material-suppliers', 'all'],
        queryFn: () => materialSupplierService.getAll({ limit: 200 }),
        enabled: Boolean(record),
    });
    const supplierOptions = useMemo(() => {
        const list = Array.isArray(suppliersResp) ? suppliersResp : (suppliersResp as any)?.data ?? [];
        return list.map((s: any) => ({ value: s.id, label: s.name }));
    }, [suppliersResp]);

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => purchaseOrderService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            if (record) queryClient.invalidateQueries({ queryKey: ['purchase-order', record.id] });
            message.success('Đã lưu thay đổi');
            setEditedItems({});
            setHasEdit(false);
        },
        onError: (e: any) => message.error(e?.message ?? 'Lỗi khi lưu'),
    });

    React.useEffect(() => {
        setEditedItems({});
        setHasEdit(false);
    }, [record?.id]);

    const canEdit = record && record.status === 'draft' && isCS1Manager;

    const patchItem = (idx: number, patch: Partial<PurchaseOrderItemUpdate>) => {
        setEditedItems((p) => ({ ...p, [idx]: { ...p[idx], ...patch, index: idx } }));
        setHasEdit(true);
    };

    const handleSave = () => {
        if (!record) return;
        const items = Object.values(editedItems);
        updateMut.mutate({ id: record.id, data: { items } });
    };

    // Compute display items with edits applied
    const displayItems = useMemo(() => {
        if (!record) return [];
        return record.items.map((item, idx) => {
            const edit = editedItems[idx];
            if (!edit) return { ...item, _idx: idx };
            const qty = edit.quantityOrdered ?? item.quantityOrdered ?? 0;
            const price = edit.unitPrice ?? item.unitPrice ?? 0;
            const vatRate = edit.vatRate ?? item.vatRate ?? 0;
            const totalPrice = qty * price;
            const vatAmount = totalPrice * vatRate / 100;
            return {
                ...item,
                quantityOrdered: qty,
                unitPrice: price,
                vatRate,
                totalPrice,
                vatAmount,
                totalWithVat: totalPrice + vatAmount,
                supplierId: edit.supplierId ?? item.supplierId,
                supplierName: edit.supplierName ?? item.supplierName,
                _idx: idx,
            };
        });
    }, [record, editedItems]);

    const sumPrice = displayItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
    const sumVat = displayItems.reduce((s, i) => s + (i.vatAmount ?? 0), 0);
    const sumTotal = displayItems.reduce((s, i) => s + (i.totalWithVat ?? 0), 0);

    const itemCols: TableColumnsType<any> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center', render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Tên vật tư', key: 'name', width: 180, render: (_: any, r: any) => (
            <div><div style={{ fontWeight: 600 }}>{r.materialName}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{r.purchaseRequestCode}</div></div>
        ) },
        { title: 'Cơ sở', dataIndex: 'plantName', key: 'plant', width: 100 },
        { title: 'Người ĐX', dataIndex: 'proposedBy', key: 'proposedBy', width: 110 },
        { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose', width: 140 },
        { title: 'SL ĐX', dataIndex: 'quantityRequested', key: 'qtyR', width: 70, align: 'right', render: fmtNum },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 60 },
        { title: 'SL đặt', key: 'qtyO', width: 90, align: 'center',
          render: (_: any, r: any) => canEdit
            ? <InputNumber size="small" min={0} value={r.quantityOrdered} style={{ width: 80 }}
                onChange={(v) => patchItem(r._idx, { quantityOrdered: v ?? 0 })} />
            : fmtNum(r.quantityOrdered) },
        { title: 'Đơn giá', key: 'price', width: 120, align: 'right',
          render: (_: any, r: any) => canEdit
            ? <InputNumber size="small" min={0} value={r.unitPrice} style={{ width: 110 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                onChange={(v) => patchItem(r._idx, { unitPrice: v ?? 0 })} />
            : fmtVND(r.unitPrice) },
        { title: 'Thành tiền', key: 'total', width: 130, align: 'right',
          render: (_: any, r: any) => <Text style={{ color: '#1A3A5C' }}>{fmtVND(r.totalPrice)}</Text> },
        { title: 'VAT%', key: 'vat', width: 80, align: 'center',
          render: (_: any, r: any) => canEdit
            ? <InputNumber size="small" min={0} max={100} value={r.vatRate} style={{ width: 70 }}
                formatter={(v) => `${v}%`} parser={(v) => Number(String(v).replace('%', '')) as any}
                onChange={(v) => patchItem(r._idx, { vatRate: v ?? 0 })} />
            : `${r.vatRate ?? 0}%` },
        { title: 'Giá VAT', key: 'vatAmt', width: 120, align: 'right',
          render: (_: any, r: any) => <Text type="secondary">{fmtVND(r.vatAmount)}</Text> },
        { title: 'Tổng tiền', key: 'totalVat', width: 130, align: 'right',
          render: (_: any, r: any) => <Text strong style={{ color: '#1A3A5C' }}>{fmtVND(r.totalWithVat)}</Text> },
        { title: 'NCC', key: 'sup', width: 160,
          render: (_: any, r: any) => canEdit
            ? <Select size="small" showSearch allowClear value={r.supplierId} style={{ width: 150 }}
                placeholder="Chọn NCC" options={supplierOptions}
                filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                onChange={(v, opt: any) => patchItem(r._idx, { supplierId: v, supplierName: opt?.label })} />
            : (r.supplierName || '-') },
        { title: 'Ghi chú', dataIndex: 'note', key: 'note', width: 140 },
    ];

    const meta = record ? STATUS_META[record.status] : null;

    return (
        <Drawer open={Boolean(record)} onClose={onClose} width={1100} placement="right" destroyOnHidden
            title={record ? (
                <Space>
                    <Text strong>{record.orderCode}</Text>
                    {meta && <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>}
                </Space>
            ) : 'Chi tiết đơn hàng'}
            footer={record ? (
                <Space wrap>
                    {hasEdit && canEdit && (
                        <Button type="primary" style={{ background: '#1A3A5C' }} loading={updateMut.isPending} onClick={handleSave}>
                            Lưu thay đổi
                        </Button>
                    )}
                    {record.status === 'draft' && isCS1Director && (
                        <ConfirmAction intent="primary" title="Xác nhận đơn hàng?" description="Xác nhận đơn hàng này?" okLabel="Xác nhận" onConfirm={() => onConfirm(record.id)}>
                            <Button type="primary" icon={<CheckOutlined />} loading={confirmingId === record.id} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                                Xác nhận đơn hàng
                            </Button>
                        </ConfirmAction>
                    )}
                    {['confirmed', 'ordered'].includes(record.status) && isCS1Director && (
                        <ConfirmAction intent="primary" title="Xác nhận nhận hàng?"
                            description="Tồn kho CS1 sẽ được cập nhật tự động. Hành động không thể hoàn tác."
                            okLabel="Xác nhận nhận hàng" onConfirm={() => onReceive(record.id)}>
                            <Button icon={<InboxOutlined />} loading={receivingId === record.id}
                                style={{ borderColor: '#0284c7', color: '#0284c7' }}>
                                Xác nhận nhận hàng
                            </Button>
                        </ConfirmAction>
                    )}
                    {record.status === 'draft' && isCS1Manager && (
                        <ConfirmAction title="Huỷ đơn hàng?" description="Các phiếu đề xuất sẽ được hoàn trả về trạng thái đã duyệt." okLabel="Huỷ đơn" onConfirm={() => onDelete(record.id)}>
                            <Button danger icon={<DeleteOutlined />}>Huỷ đơn</Button>
                        </ConfirmAction>
                    )}
                    {isCS1Manager && (
                        <Button icon={<FileExcelOutlined />} style={{ color: '#16a34a', borderColor: '#16a34a' }}
                            onClick={() => onExport(record.id, record.orderCode ?? record.id)}>
                            Xuất Excel
                        </Button>
                    )}
                </Space>
            ) : undefined}
        >
            {loading && <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Đang tải...</div>}
            {!loading && record && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Descriptions column={3} size="small" bordered>
                        <Descriptions.Item label="Mã đơn">{record.orderCode}</Descriptions.Item>
                        <Descriptions.Item label="Ngày tạo">{fmtDate(record.createdAt)}</Descriptions.Item>
                        <Descriptions.Item label="Người lập">{resolveUserLabel(record.createdBy)}</Descriptions.Item>
                        <Descriptions.Item label="Phiếu ĐX" span={2}>
                            <Space wrap size={4}>
                                {(record.purchaseRequestCodes ?? []).map((c) => (
                                    <Tag key={c} style={{ fontFamily: 'monospace', fontSize: 11 }}>{c}</Tag>
                                ))}
                            </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Ghi chú">{record.note || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Thành tiền">{fmtVND(record.totalAmount)}</Descriptions.Item>
                        <Descriptions.Item label="Tổng VAT">{fmtVND(record.totalVat)}</Descriptions.Item>
                        <Descriptions.Item label="Tổng cộng">
                            <Text strong style={{ color: '#1A3A5C', fontSize: 15 }}>{fmtVND(record.totalWithVat)}</Text>
                        </Descriptions.Item>
                    </Descriptions>

                    <Table dataSource={displayItems} columns={itemCols} rowKey="_idx"
                        pagination={false} size="small" scroll={{ x: 'max-content' }}
                        summary={() => (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={9}><Text strong>Tổng cộng</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={9} align="right"><Text strong>{fmtVND(sumPrice)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={10} />
                                <Table.Summary.Cell index={11} align="right"><Text strong>{fmtVND(sumVat)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={12} align="right"><Text strong style={{ color: '#1A3A5C' }}>{fmtVND(sumTotal)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={13} colSpan={2} />
                            </Table.Summary.Row>
                        )}
                    />
                </div>
            )}
        </Drawer>
    );
};


// ─── PurchaseOrderPage ────────────────────────────────────────────────────────

const PurchaseOrderPage: React.FC = () => {
    const { user } = useAuth();
    const { message, notification } = App.useApp();
    const queryClient = useQueryClient();

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID as string;
    const isCS1Manager = Boolean(mainPlantId && user?.plantId === mainPlantId) &&
        ['admin', 'manager', 'director'].includes(user?.role ?? '');
    const isCS1Director = Boolean(mainPlantId && user?.plantId === mainPlantId) &&
        ['admin', 'director'].includes(user?.role ?? '');

    if (!isCS1Manager) return <Navigate to="/" replace />;

    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<PurchaseOrderStatus | undefined>();
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [receivingId, setReceivingId] = useState<string | null>(null);

    const listParams = useMemo<PurchaseOrderQueryParams>(() => ({
        search: search || undefined, status: filterStatus, page, limit: DEFAULT_LIMIT,
    }), [search, filterStatus, page]);

    const { data: listResp, isLoading, isFetching } = useQuery({
        queryKey: ['purchase-orders', listParams],
        queryFn: async () => normResp(await purchaseOrderService.getAll(listParams), page, DEFAULT_LIMIT),
        placeholderData: (p) => p,
    });

    const { data: detailRecord, isLoading: detailLoading } = useQuery({
        queryKey: ['purchase-order', selectedId],
        queryFn: () => purchaseOrderService.getById(selectedId!),
        enabled: Boolean(selectedId),
    });

    const { data: statsResp } = useQuery({
        queryKey: ['purchase-orders', 'stats'],
        queryFn: async () => {
            const [all, draft, active, received] = await Promise.all([
                purchaseOrderService.getAll({ limit: 1 }),
                purchaseOrderService.getAll({ status: 'draft', limit: 1 }),
                purchaseOrderService.getAll({ status: 'confirmed', limit: 1 }),
                purchaseOrderService.getAll({ status: 'received', limit: 1 }),
            ]);
            return {
                total: normResp(all, 1, 1).total,
                draft: normResp(draft, 1, 1).total,
                active: normResp(active, 1, 1).total,
                received: normResp(received, 1, 1).total,
            };
        },
        placeholderData: (p) => p,
    });
    const stats = statsResp ?? { total: 0, draft: 0, active: 0, received: 0 };

    const invalidate = async (id?: string) => {
        await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        if (id) await queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    };

    const createMut = useMutation({ mutationFn: purchaseOrderService.create });
    const confirmMut = useMutation({ mutationFn: purchaseOrderService.confirm });
    const receiveMut = useMutation({ mutationFn: purchaseOrderService.receive });
    const deleteMut = useMutation({ mutationFn: purchaseOrderService.remove });

    const handleCreate = async (purchaseRequestIds: string[], note: string) => {
        try {
            const po = await createMut.mutateAsync({ purchaseRequestIds, note: note || undefined });
            await invalidate();
            message.success('Đã tạo đơn hàng');
            setModalOpen(false);
            setSelectedId(po.id);
        } catch (e: any) { message.error(e?.message ?? 'Không thể tạo đơn hàng'); throw e; }
    };

    const handleConfirm = async (id: string) => {
        try {
            setConfirmingId(id);
            await confirmMut.mutateAsync(id);
            await invalidate(id);
            message.success('Đã xác nhận đơn hàng');
        } catch (e: any) { message.error(e?.message ?? 'Lỗi'); }
        finally { setConfirmingId(null); }
    };

    const handleReceive = async (id: string) => {
        try {
            setReceivingId(id);
            await receiveMut.mutateAsync(id);
            await invalidate(id);
            await queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            notification.success({ message: 'Nhận hàng thành công!', description: 'Tồn kho CS1 đã được cập nhật.' });
        } catch (e: any) { message.error(e?.message ?? 'Lỗi'); }
        finally { setReceivingId(null); }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMut.mutateAsync(id);
            await invalidate();
            if (selectedId === id) setSelectedId(null);
            message.success('Đã huỷ đơn hàng');
        } catch (e: any) { message.error(e?.message ?? 'Lỗi'); }
    };

    const handleExport = async (id: string, code: string) => {
        try { await purchaseOrderService.exportXlsx(id, code); }
        catch { message.error('Không thể xuất file Excel'); }
    };

    const columns: TableColumnsType<PurchaseOrder> = [
        { title: 'MÃ ĐƠN', key: 'code', width: 180,
          render: (_: any, r: PurchaseOrder) => (
            <div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A3A5C', fontSize: 13 }}>{r.orderCode}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{(r.purchaseRequestCodes ?? []).length} phiếu ĐX</div>
            </div>
          ) },
        { title: 'VẬT TƯ', key: 'items', width: 80, align: 'center',
          render: (_: any, r: PurchaseOrder) => <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} /> },
        { title: 'NCC', key: 'suppliers', width: 180,
          render: (_: any, r: PurchaseOrder) => {
            const names = [...new Set(r.items.map((i) => i.supplierName).filter(Boolean))];
            const shown = names.slice(0, 2);
            return <Space size={2} wrap>{shown.map((n) => <Tag key={n} style={{ fontSize: 11 }}>{n}</Tag>)}
                {names.length > 2 && <Tag>+{names.length - 2}</Tag>}</Space>;
          } },
        { title: 'TỔNG TIỀN', key: 'total', width: 150, align: 'right',
          render: (_: any, r: PurchaseOrder) => (
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#1A3A5C' }}>{fmtVND(r.totalWithVat)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>đã gồm VAT</div>
            </div>
          ) },
        { title: 'NGÀY TẠO', dataIndex: 'createdAt', key: 'date', width: 100,
          render: (v: string) => <span style={{ color: '#555', fontSize: 13 }}>{fmtDate(v)}</span> },
        { title: 'TRẠNG THÁI', dataIndex: 'status', key: 'status', width: 140,
          render: (s: string) => { const m = STATUS_META[s]; return m ? <Tag color={m.color} icon={m.icon}>{m.label}</Tag> : <Tag>{s}</Tag>; } },
        { title: 'THAO TÁC', key: 'action', width: 140, fixed: 'right' as const, align: 'right' as const,
          render: (_: any, r: PurchaseOrder) => (
            <Space size={2}>
                <Tooltip title="Xem chi tiết">
                    <Button type="text" size="small" icon={<DownloadOutlined style={{ display: 'none' }} />}
                        style={{ color: '#0284c7' }}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}>
                        <span style={{ fontSize: 12 }}>Xem</span>
                    </Button>
                </Tooltip>
                <Tooltip title="Xuất Excel">
                    <Button type="text" size="small" icon={<FileExcelOutlined />} style={{ color: '#16a34a' }}
                        onClick={(e) => { e.stopPropagation(); handleExport(r.id, r.orderCode ?? r.id); }} />
                </Tooltip>
                {r.status === 'draft' && isCS1Director && (
                    <Tooltip title="Xác nhận">
                        <ConfirmAction intent="primary" title="Xác nhận đơn?" description={`Xác nhận ${r.orderCode}?`} okLabel="Xác nhận" onConfirm={() => handleConfirm(r.id)}>
                            <Button type="text" size="small" icon={<CheckOutlined />} style={{ color: '#1A3A5C' }} />
                        </ConfirmAction>
                    </Tooltip>
                )}
                {['confirmed', 'ordered'].includes(r.status) && isCS1Director && (
                    <Tooltip title="Nhận hàng">
                        <ConfirmAction intent="primary" title="Xác nhận nhận hàng?" description="Tồn kho sẽ được cập nhật." okLabel="Nhận hàng" onConfirm={() => handleReceive(r.id)}>
                            <Button type="text" size="small" icon={<InboxOutlined />} style={{ color: '#0284c7' }} />
                        </ConfirmAction>
                    </Tooltip>
                )}
            </Space>
          ) },
    ];

    return (
        <div className="flex w-full max-w-full flex-col gap-6 overflow-hidden">
            <PageHeader title="Đơn đặt hàng"
                subtitle="Quản lý đơn đặt hàng vật tư từ các phiếu đề xuất đã duyệt."
                actions={
                    <Button type="primary" icon={<PlusOutlined />} style={{ background: '#1A3A5C' }}
                        onClick={() => setModalOpen(true)}>
                        Tạo đơn hàng
                    </Button>
                }
            />

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                    { label: 'Tổng đơn', value: stats.total, color: '#1A3A5C', icon: null },
                    { label: 'Bản nháp', value: stats.draft, color: '#888', icon: null },
                    { label: 'Đang xử lý', value: stats.active, color: '#FA8C16', icon: <ClockCircleOutlined /> },
                    { label: 'Đã nhận hàng', value: stats.received, color: '#52C41A', icon: <CheckCircleOutlined /> },
                ].map(({ label, value, color, icon }) => (
                    <Card key={label} style={{ borderRadius: 8, border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} styles={{ body: { padding: '16px 20px' } }}>
                        <Statistic title={<span style={{ color: '#888', fontSize: 13 }}>{label}</span>}
                            value={value} valueStyle={{ color, fontWeight: 700, fontSize: 24 }} prefix={icon} />
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <Input.Search placeholder="Tìm mã đơn..." allowClear style={{ width: 220 }}
                    onSearch={(v) => { setSearch(v); setPage(1); }}
                    onChange={(e) => !e.target.value && setSearch('')} />
                <Select allowClear placeholder="Trạng thái" style={{ width: 160 }} options={STATUS_OPTIONS}
                    value={filterStatus} onChange={(v) => { setFilterStatus(v as PurchaseOrderStatus); setPage(1); }} />
                <Button onClick={() => { setSearch(''); setFilterStatus(undefined); setPage(1); }}>Xoá lọc</Button>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table<PurchaseOrder> rowKey="id" columns={columns} dataSource={listResp?.data ?? []}
                    loading={isLoading || isFetching} size="middle" scroll={{ x: 900 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đơn hàng" /> }}
                    rowClassName={() => 'cursor-pointer'}
                    onRow={(r) => ({ onClick: () => setSelectedId(r.id) })}
                    pagination={{
                        current: listResp?.page ?? page, total: listResp?.total ?? 0, pageSize: DEFAULT_LIMIT,
                        showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
                        onChange: (p) => setPage(p),
                        className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                    }}
                />
            </div>

            <ModalCreate open={modalOpen} submitting={createMut.isPending}
                onClose={() => setModalOpen(false)} onCreate={handleCreate} />

            <DetailDrawer
                record={selectedId ? detailRecord : null}
                loading={detailLoading}
                isCS1Manager={isCS1Manager}
                isCS1Director={isCS1Director}
                onClose={() => setSelectedId(null)}
                onConfirm={handleConfirm}
                onReceive={handleReceive}
                onDelete={handleDelete}
                onExport={handleExport}
                confirmingId={confirmingId}
                receivingId={receivingId}
            />
        </div>
    );
};

export default PurchaseOrderPage;
