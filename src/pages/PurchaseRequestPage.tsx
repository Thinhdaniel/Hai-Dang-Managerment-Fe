import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    AutoComplete,
    Badge,
    Button,
    Card,
    DatePicker,
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
    CloseOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
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
import { plantService } from '../core/services';
import {
    materialService,
    materialSupplierService,
    purchaseRequestService,
    type PurchaseRequest,
    type PurchaseRequestItem,
    type PurchaseRequestPayload,
    type PurchaseRequestQueryParams,
    type PurchaseRequestStatus,
} from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { Text } = Typography;
const DEFAULT_LIMIT = 10;

const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);
const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');

const resolveUserLabel = (v?: string | User) => {
    if (!v) return '-';
    if (typeof v === 'string') return v;
    return (v as any).name || (v as any).email || (v as any).id;
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
    draft:       { color: 'default',    label: 'Bản nháp',       icon: <EditOutlined /> },
    pending:     { color: 'warning',    label: 'Chờ duyệt',      icon: <ClockCircleOutlined /> },
    approved:    { color: 'success',    label: 'Đã duyệt',       icon: <CheckCircleOutlined /> },
    rejected:    { color: 'error',      label: 'Từ chối',         icon: <CloseCircleOutlined /> },
    ordered:     { color: 'processing', label: 'Đặt hàng',       icon: <ShoppingOutlined /> },
    received:    { color: 'cyan',       label: 'Đã nhận',         icon: <InboxOutlined /> },
    distributed: { color: 'default',    label: 'Đã cấp phát',    icon: null },
};

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));

type ItemRow = {
    key: string;
    materialName: string;
    plantId: string;
    proposedBy: string;
    quantityRequested: number;
    unit: string;
    quantityOrdered: number;
    unitPrice: number;
    vatRate: number; // 0-100
    orderDate?: Dayjs;
    receivedDate?: Dayjs;
    supplierId?: string;
    supplierName?: string;
    purpose: string;
    totalPrice: number;
    vatAmount: number;
    totalWithVat: number;
};

const newRow = (): ItemRow => ({
    key: String(Date.now() + Math.random()),
    materialName: '', plantId: '', proposedBy: '',
    quantityRequested: 1, unit: '', quantityOrdered: 1,
    unitPrice: 0, vatRate: 8,
    orderDate: undefined, receivedDate: undefined,
    supplierId: undefined, supplierName: undefined,
    purpose: '', totalPrice: 0, vatAmount: 0, totalWithVat: 0,
});

const computeRow = (r: ItemRow): ItemRow => {
    const totalPrice = r.quantityOrdered * r.unitPrice;
    const vatAmount = totalPrice * (r.vatRate / 100);
    return { ...r, totalPrice, vatAmount, totalWithVat: totalPrice + vatAmount };
};

const patchRow = (rows: ItemRow[], key: string, patch: Partial<ItemRow>): ItemRow[] =>
    rows.map((r) => (r.key === key ? computeRow({ ...r, ...patch }) : r));


// ─── ModalForm ───────────────────────────────────────────────────────────────

type ModalFormProps = {
    open: boolean;
    initial?: PurchaseRequest | null;
    plants: Plant[];
    mainPlantId: string;
    submitting: boolean;
    onClose: () => void;
    onSave: (payload: PurchaseRequestPayload, status: 'draft' | 'pending') => Promise<void>;
};

const ModalForm: React.FC<ModalFormProps> = ({ open, initial, plants, mainPlantId, submitting, onClose, onSave }) => {
    const { notification } = App.useApp();
    const now = dayjs();
    const [month, setMonth] = useState(now.month() + 1);
    const [year, setYear] = useState(now.year());
    const [items, setItems] = useState<ItemRow[]>([newRow()]);
    const [errors, setErrors] = useState<Set<string>>(new Set());
    const [matSearch, setMatSearch] = useState('');

    const { data: matResp } = useQuery({
        queryKey: ['materials', 'ac', matSearch],
        queryFn: () => materialService.getAll({ search: matSearch, isActive: true, limit: 50 }),
        enabled: open,
        placeholderData: (p) => p,
    });

    const { data: suppliersResp } = useQuery({
        queryKey: ['material-suppliers', 'all'],
        queryFn: () => materialSupplierService.getAll({ limit: 200 }),
        enabled: open,
    });

    const matOptions = useMemo(() => {
        const list = Array.isArray(matResp) ? matResp : (matResp as any)?.data ?? [];
        return list.map((m: any) => ({ value: m.name, label: `${m.code} — ${m.name}`, unit: m.unit }));
    }, [matResp]);

    const supplierOptions = useMemo(() => {
        const list = Array.isArray(suppliersResp) ? suppliersResp : (suppliersResp as any)?.data ?? [];
        return list.map((s: any) => ({ value: s.id, label: s.name }));
    }, [suppliersResp]);

    React.useEffect(() => {
        if (!open) return;
        if (initial) {
            setMonth(initial.requestMonth ?? now.month() + 1);
            setYear(initial.requestYear ?? now.year());
            setItems(initial.items.map((it) =>
                computeRow({
                    key: String(Math.random()),
                    materialName: it.materialName ?? '',
                    plantId: mainPlantId,
                    proposedBy: it.proposedBy ?? '',
                    quantityRequested: it.quantityRequested,
                    unit: it.unit ?? '',
                    quantityOrdered: it.quantityOrdered ?? it.quantityRequested,
                    unitPrice: it.unitPrice ?? 0,
                    vatRate: it.vatRate != null ? (it.vatRate > 1 ? it.vatRate : it.vatRate * 100) : 8,
                    orderDate: it.orderDate ? dayjs(it.orderDate) : undefined,
                    receivedDate: it.receivedDate ? dayjs(it.receivedDate) : undefined,
                    supplierId: it.supplierId,
                    supplierName: it.supplierName,
                    purpose: it.purpose ?? '',
                    totalPrice: 0, vatAmount: 0, totalWithVat: 0,
                })
            ));
        } else {
            setMonth(now.month() + 1);
            setYear(now.year());
            setItems([newRow()]);
        }
        setErrors(new Set());
    }, [open, initial]);

    const totals = useMemo(() => ({
        price: items.reduce((s, r) => s + r.totalPrice, 0),
        vat: items.reduce((s, r) => s + r.vatAmount, 0),
        total: items.reduce((s, r) => s + r.totalWithVat, 0),
    }), [items]);

    const validate = () => {
        const errs = new Set<string>();
        const missing: string[] = [];
        items.forEach((r, i) => {
            if (!r.materialName.trim()) { errs.add(`${r.key}-name`); missing.push(`Dòng ${i+1}: Tên vật tư`); }
            if (!r.plantId) { errs.add(`${r.key}-plant`); missing.push(`Dòng ${i+1}: Cơ sở`); }
            if (!r.proposedBy.trim()) { errs.add(`${r.key}-proposedBy`); missing.push(`Dòng ${i+1}: Người đề xuất`); }
            if (!r.quantityRequested || r.quantityRequested <= 0) { errs.add(`${r.key}-qty`); missing.push(`Dòng ${i+1}: Số lượng`); }
            if (!r.unit.trim()) { errs.add(`${r.key}-unit`); missing.push(`Dòng ${i+1}: ĐVT`); }
            if (!r.purpose.trim()) { errs.add(`${r.key}-purpose`); missing.push(`Dòng ${i+1}: Nội dung`); }
        });
        setErrors(errs);
        if (missing.length) {
            notification.error({ message: 'Thiếu thông tin bắt buộc', description: missing.slice(0, 5).join(' | ') });
        }
        return errs.size === 0;
    };

    const buildPayload = (status: 'draft' | 'pending'): PurchaseRequestPayload => ({
        plantId: mainPlantId,
        requestMonth: month,
        requestYear: year,
        status,
        items: items.map((r) => ({
            materialName: r.materialName,
            unit: r.unit,
            proposedBy: r.proposedBy,
            purpose: r.purpose,
            quantityRequested: r.quantityRequested,
            quantityOrdered: r.quantityOrdered || undefined,
            unitPrice: r.unitPrice || undefined,
            totalPrice: r.totalPrice || undefined,
            vatRate: r.vatRate,
            vatAmount: r.vatAmount || undefined,
            totalWithVat: r.totalWithVat || undefined,
            orderDate: r.orderDate?.toISOString(),
            receivedDate: r.receivedDate?.toISOString(),
            supplierId: r.supplierId,
            supplierName: r.supplierName,
        })),
    });

    const handleSubmit = async (status: 'draft' | 'pending') => {
        if (status === 'pending' && !validate()) return;
        await onSave(buildPayload(status), status);
    };

    const es = (key: string) => errors.has(key) ? { borderColor: '#ff4d4f' } : undefined;

    const columns: TableColumnsType<ItemRow> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center' as const,
          render: (_: any, __: any, i: number) => <Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Text> },
        { title: <span>Tên vật tư <Text type="danger">*</Text></span>, key: 'name', width: 200,
          render: (_: any, r: ItemRow) => (
            <AutoComplete size="small" value={r.materialName} options={matOptions} style={{ width: 200, ...es(`${r.key}-name`) }}
                onSearch={setMatSearch}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { materialName: v }))}
                onSelect={(v, opt: any) => setItems((p) => patchRow(p, r.key, { materialName: v, unit: opt.unit ?? '' }))}
                placeholder="Tên vật tư" />
          ) },
        { title: <span>Cơ sở <Text type="danger">*</Text></span>, key: 'plant', width: 130,
          render: (_: any, r: ItemRow) => (
            <Select size="small" value={r.plantId || undefined} style={{ width: 130, ...es(`${r.key}-plant`) }}
                placeholder="Cơ sở" options={plants.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { plantId: v }))} />
          ) },
        { title: <span>Người đề xuất <Text type="danger">*</Text></span>, key: 'proposedBy', width: 130,
          render: (_: any, r: ItemRow) => (
            <Input size="small" value={r.proposedBy} style={{ width: 130, ...es(`${r.key}-proposedBy`) }}
                onChange={(e) => setItems((p) => patchRow(p, r.key, { proposedBy: e.target.value }))} />
          ) },
        { title: <span>SL cần <Text type="danger">*</Text></span>, key: 'qty', width: 80,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={1} value={r.quantityRequested} style={{ width: 80, ...es(`${r.key}-qty`) }}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { quantityRequested: v ?? 1, quantityOrdered: v ?? 1 }))} />
          ) },
        { title: <span>ĐVT <Text type="danger">*</Text></span>, key: 'unit', width: 70,
          render: (_: any, r: ItemRow) => (
            <Input size="small" value={r.unit} style={{ width: 70, ...es(`${r.key}-unit`) }}
                onChange={(e) => setItems((p) => patchRow(p, r.key, { unit: e.target.value }))} />
          ) },
        { title: 'SL mua', key: 'qtyO', width: 80,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} value={r.quantityOrdered} style={{ width: 80 }}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { quantityOrdered: v ?? 0 }))} />
          ) },
        { title: 'Đơn giá', key: 'price', width: 120,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} value={r.unitPrice} style={{ width: 120 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { unitPrice: v ?? 0 }))} />
          ) },
        { title: 'Thành tiền', key: 'total', width: 130, align: 'right' as const,
          render: (_: any, r: ItemRow) => <Text style={{ color: '#1A3A5C', fontSize: 12 }}>{fmtVND(r.totalPrice)}</Text> },
        { title: 'VAT%', key: 'vat', width: 70,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} max={100} value={r.vatRate} style={{ width: 70 }}
                formatter={(v) => `${v}%`} parser={(v) => Number(String(v).replace('%', '')) as any}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { vatRate: v ?? 0 }))} />
          ) },
        { title: 'Giá VAT', key: 'vatAmt', width: 120, align: 'right' as const,
          render: (_: any, r: ItemRow) => <Text type="secondary" style={{ fontSize: 12 }}>{fmtVND(r.vatAmount)}</Text> },
        { title: 'Tổng tiền', key: 'totalVat', width: 130, align: 'right' as const,
          render: (_: any, r: ItemRow) => <Text strong style={{ color: '#1A3A5C', fontSize: 12 }}>{fmtVND(r.totalWithVat)}</Text> },
        { title: 'Ngày lên đơn', key: 'od', width: 130,
          render: (_: any, r: ItemRow) => (
            <DatePicker size="small" value={r.orderDate} format="DD/MM/YYYY" style={{ width: 130 }}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { orderDate: v ?? undefined }))} />
          ) },
        { title: 'Ngày nhận', key: 'rd', width: 130,
          render: (_: any, r: ItemRow) => (
            <DatePicker size="small" value={r.receivedDate} format="DD/MM/YYYY" style={{ width: 130 }}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { receivedDate: v ?? undefined }))} />
          ) },
        { title: 'Nhà cung cấp', key: 'sup', width: 200,
          render: (_: any, r: ItemRow) => (
            <Select size="small" showSearch allowClear value={r.supplierId} style={{ width: 200 }}
                placeholder="Chọn NCC" options={supplierOptions}
                filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                onChange={(v, opt: any) => setItems((p) => patchRow(p, r.key, { supplierId: v, supplierName: opt?.label }))} />
          ) },
        { title: <span>Nội dung <Text type="danger">*</Text></span>, key: 'purpose', width: 200,
          render: (_: any, r: ItemRow) => (
            <Input size="small" value={r.purpose} style={{ width: 200, ...es(`${r.key}-purpose`) }}
                onChange={(e) => setItems((p) => patchRow(p, r.key, { purpose: e.target.value }))} />
          ) },
        { title: '', key: 'del', width: 46, align: 'center' as const,
          render: (_: any, r: ItemRow) => (
            <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={items.length === 1}
                onClick={() => setItems((p) => p.filter((x) => x.key !== r.key))} />
          ) },
    ];

    return (
        <Modal open={open} title={initial ? `Chỉnh sửa — ${initial.requestCode}` : 'Tạo đề nghị mua vật tư'}
            width={1200} centered maskClosable={false} destroyOnClose
            style={{ borderRadius: 12, overflow: 'hidden' }}
            styles={{ body: { padding: '16px 20px', maxHeight: '80vh', overflowY: 'auto' } }}
            onCancel={onClose}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <Text type="secondary">{items.length} dòng vật tư</Text>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: '#888' }}>Thành tiền: {fmtVND(totals.price)}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>Tổng VAT: {fmtVND(totals.vat)}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A3A5C' }}>TỔNG CỘNG: {fmtVND(totals.total)}</div>
                        <Space style={{ marginTop: 8 }}>
                            <Button onClick={onClose}>Huỷ</Button>
                            <Button loading={submitting} onClick={() => handleSubmit('draft')}>Lưu nháp</Button>
                            <Button type="primary" style={{ background: '#1A3A5C' }} loading={submitting} onClick={() => handleSubmit('pending')}>Gửi duyệt</Button>
                        </Space>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Mã phiếu</div>
                    <Input disabled value={initial?.requestCode ?? ''} placeholder="Tự động tạo" />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Tháng <Text type="danger">*</Text></div>
                    <Select style={{ width: '100%' }} value={month} options={MONTH_OPTIONS} onChange={setMonth} />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Năm <Text type="danger">*</Text></div>
                    <InputNumber style={{ width: '100%' }} value={year} min={2020} max={2099} onChange={(v) => setYear(v ?? now.year())} />
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>Danh sách vật tư</Text>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setItems((p) => [...p, newRow()])}>Thêm dòng</Button>
            </div>
            <Table dataSource={items} columns={columns} rowKey="key" pagination={false} size="small"
                scroll={{ x: 'max-content' }} sticky={{ offsetHeader: 0 }} />
        </Modal>
    );
};


// ─── DetailDrawer ────────────────────────────────────────────────────────────

type DrawerProps = {
    record?: PurchaseRequest | null;
    loading: boolean;
    isCS1Director: boolean;
    onClose: () => void;
    onEdit: () => void;
    onApprove: (r: PurchaseRequest) => void;
    onReject: (r: PurchaseRequest) => void;
    onExport: (id: string, code: string) => void;
    approvingId: string | null;
};

const DetailDrawer: React.FC<DrawerProps> = ({
    record, loading, isCS1Director, onClose, onEdit, onApprove, onReject, onExport, approvingId,
}) => {
    const isPending = record?.status === 'pending';
    const meta = record ? STATUS_META[record.status] : null;

    const itemCols: TableColumnsType<PurchaseRequestItem> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center', render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Tên vật tư', key: 'name', render: (_: any, r: PurchaseRequestItem) => r.materialName || '-' },
        { title: 'Người đề xuất', dataIndex: 'proposedBy', key: 'proposedBy', width: 130 },
        { title: 'SL cần', dataIndex: 'quantityRequested', key: 'qty', width: 80, align: 'right', render: fmtNum },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 70 },
        { title: 'SL mua', dataIndex: 'quantityOrdered', key: 'qtyO', width: 80, align: 'right', render: (v: any) => v ? fmtNum(v) : '-' },
        { title: 'Đơn giá', dataIndex: 'unitPrice', key: 'price', width: 120, align: 'right', render: (v: any) => v ? fmtVND(v) : '-' },
        { title: 'Thành tiền', dataIndex: 'totalPrice', key: 'total', width: 130, align: 'right', render: (v: any) => v ? fmtVND(v) : '-' },
        { title: 'VAT', dataIndex: 'vatRate', key: 'vat', width: 70, align: 'center', render: (v: any) => v != null ? `${Math.round(v <= 1 ? v * 100 : v)}%` : '-' },
        { title: 'Giá VAT', dataIndex: 'vatAmount', key: 'vatAmt', width: 120, align: 'right', render: (v: any) => v ? fmtVND(v) : '-' },
        { title: 'Tổng tiền', dataIndex: 'totalWithVat', key: 'totalVat', width: 130, align: 'right', render: (v: any) => <Text strong style={{ color: '#1A3A5C' }}>{fmtVND(v)}</Text> },
        { title: 'NCC', dataIndex: 'supplierName', key: 'sup', width: 150 },
        { title: 'Nội dung', dataIndex: 'purpose', key: 'purpose', width: 180 },
    ];

    const sumPrice = record?.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0) ?? 0;
    const sumVat = record?.items.reduce((s, i) => s + (i.vatAmount ?? 0), 0) ?? 0;
    const sumTotal = record?.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0) ?? 0;

    return (
        <Drawer open={Boolean(record)} onClose={onClose} width={900} placement="right" destroyOnHidden
            title={record ? (
                <Space>
                    <Text strong>{record.requestCode}</Text>
                    {meta && <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>}
                </Space>
            ) : 'Chi tiết phiếu'}
            footer={record ? (
                <Space wrap>
                    {isPending && <Button icon={<EditOutlined />} onClick={onEdit}>Chỉnh sửa</Button>}
                    {isPending && isCS1Director && (
                        <ConfirmAction intent="primary" title="Duyệt phiếu?" description={`Xác nhận duyệt ${record.requestCode}?`} okLabel="Duyệt" onConfirm={() => onApprove(record)}>
                            <Button type="primary" icon={<CheckOutlined />} loading={approvingId === record.id} style={{ background: '#16a34a', borderColor: '#16a34a' }}>Duyệt phiếu</Button>
                        </ConfirmAction>
                    )}
                    {isPending && isCS1Director && (
                        <Button danger icon={<CloseOutlined />} onClick={() => onReject(record)}>Từ chối</Button>
                    )}
                    <Button icon={<FileExcelOutlined />} style={{ color: '#16a34a', borderColor: '#16a34a' }}
                        onClick={() => onExport(record.id, record.requestCode ?? record.id)}>Xuất Excel</Button>
                </Space>
            ) : undefined}
        >
            {loading && <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Đang tải...</div>}
            {!loading && record && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {record.status === 'rejected' && record.rejectedReason && (
                        <Alert type="error" showIcon message={`Lý do từ chối: ${record.rejectedReason}`} />
                    )}
                    <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label="Mã phiếu">{record.requestCode ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Tháng/Năm">
                            {record.requestMonth && record.requestYear ? `${record.requestMonth}/${record.requestYear}` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Ngày tạo">{fmtDate(record.createdAt)}</Descriptions.Item>
                        <Descriptions.Item label="Người tạo">{resolveUserLabel(record.requestedBy)}</Descriptions.Item>
                        <Descriptions.Item label="Trạng thái">
                            {meta && <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>}
                        </Descriptions.Item>
                        <Descriptions.Item label="Tổng tiền (có VAT)">
                            <Text strong style={{ color: '#1A3A5C' }}>{fmtVND(record.totalWithVat ?? sumTotal)}</Text>
                        </Descriptions.Item>
                    </Descriptions>
                    <Table dataSource={record.items} columns={itemCols} rowKey={(_, i) => String(i)}
                        pagination={false} size="small" scroll={{ x: 'max-content' }}
                        summary={() => (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={7}><Text strong>Tổng cộng</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={7} align="right"><Text strong>{fmtVND(sumPrice)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={8} />
                                <Table.Summary.Cell index={9} align="right"><Text strong>{fmtVND(sumVat)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={10} align="right"><Text strong style={{ color: '#1A3A5C' }}>{fmtVND(sumTotal)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={11} colSpan={2} />
                            </Table.Summary.Row>
                        )}
                    />
                </div>
            )}
        </Drawer>
    );
};


// ─── PurchaseRequestPage ─────────────────────────────────────────────────────

const PurchaseRequestPage: React.FC = () => {
    const { user } = useAuth();
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID as string;
    const CS1_MANAGER_ROLES = ['admin', 'manager', 'director'];
    const CS1_DIRECTOR_ROLES = ['admin', 'director'];

    const isCS1Manager = Boolean(mainPlantId && user?.plantId === mainPlantId) &&
        CS1_MANAGER_ROLES.includes(user?.role ?? '');
    const isCS1Director = Boolean(mainPlantId && user?.plantId === mainPlantId) &&
        CS1_DIRECTOR_ROLES.includes(user?.role ?? '');

    if (!isCS1Manager) return <Navigate to="/" replace />;

    const [search, setSearch] = useState('');
    const [filterMonth, setFilterMonth] = useState<number | undefined>();
    const [filterYear, setFilterYear] = useState<number | undefined>();
    const [filterStatus, setFilterStatus] = useState<PurchaseRequestStatus | undefined>();
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<PurchaseRequest | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const listParams = useMemo<PurchaseRequestQueryParams>(() => ({
        search: search || undefined,
        status: filterStatus,
        page,
        limit: DEFAULT_LIMIT,
    }), [search, filterStatus, page]);

    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    const { data: listResp, isLoading, isFetching } = useQuery({
        queryKey: ['purchase-requests', listParams],
        queryFn: async () => normResp(await purchaseRequestService.getAll(listParams), page, DEFAULT_LIMIT),
        placeholderData: (p) => p,
    });

    const { data: detailRecord, isLoading: detailLoading } = useQuery({
        queryKey: ['purchase-request', selectedId],
        queryFn: () => purchaseRequestService.getById(selectedId!),
        enabled: Boolean(selectedId),
    });

    const requests = listResp?.data ?? [];

    // Stats: count from all (no filter) for accurate numbers
    const { data: statsResp } = useQuery({
        queryKey: ['purchase-requests', 'stats'],
        queryFn: async () => {
            const [all, pending, approved, rejected] = await Promise.all([
                purchaseRequestService.getAll({ limit: 1 }),
                purchaseRequestService.getAll({ status: 'pending', limit: 1 }),
                purchaseRequestService.getAll({ status: 'approved', limit: 1 }),
                purchaseRequestService.getAll({ status: 'rejected', limit: 1 }),
            ]);
            return {
                total: normResp(all, 1, 1).total,
                pending: normResp(pending, 1, 1).total,
                approved: normResp(approved, 1, 1).total,
                rejected: normResp(rejected, 1, 1).total,
            };
        },
        placeholderData: (p) => p,
    });

    const stats = statsResp ?? { total: 0, pending: 0, approved: 0, rejected: 0 };

    const invalidate = async (id?: string) => {
        await queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
        if (id) await queryClient.invalidateQueries({ queryKey: ['purchase-request', id] });
    };

    const createMut = useMutation({ mutationFn: purchaseRequestService.create });
    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<PurchaseRequestPayload> }) =>
            purchaseRequestService.update(id, data),
    });
    const approveMut = useMutation({ mutationFn: (id: string) => purchaseRequestService.approve(id) });
    const rejectMut = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => purchaseRequestService.reject(id, reason),
    });

    const handleSave = async (payload: PurchaseRequestPayload, status: 'draft' | 'pending') => {
        try {
            if (editingRecord) {
                await updateMut.mutateAsync({ id: editingRecord.id, data: { ...payload, status } });
                await invalidate(editingRecord.id);
                message.success('Đã cập nhật phiếu');
            } else {
                await createMut.mutateAsync({ ...payload, status });
                await invalidate();
                message.success(status === 'draft' ? 'Đã lưu nháp' : 'Đã gửi duyệt');
            }
            setModalOpen(false);
            setEditingRecord(null);
        } catch (e: any) {
            message.error(e?.message ?? 'Có lỗi xảy ra');
            throw e;
        }
    };

    const handleApprove = async (r: PurchaseRequest) => {
        try {
            setApprovingId(r.id);
            await approveMut.mutateAsync(r.id);
            await invalidate(r.id);
            message.success('Đã duyệt phiếu');
        } catch (e: any) {
            message.error(e?.message ?? 'Không thể duyệt');
        } finally {
            setApprovingId(null);
        }
    };

    const handleRejectSubmit = async () => {
        if (!rejectTarget || !rejectReason.trim()) { message.warning('Vui lòng nhập lý do'); return; }
        try {
            await rejectMut.mutateAsync({ id: rejectTarget.id, reason: rejectReason.trim() });
            await invalidate(rejectTarget.id);
            message.success('Đã từ chối phiếu');
            setRejectTarget(null); setRejectReason('');
        } catch (e: any) { message.error(e?.message ?? 'Không thể từ chối'); }
    };

    const handleExport = async (id: string, code: string) => {
        try { await purchaseRequestService.exportXlsx(id, code); }
        catch { message.error('Không thể xuất file Excel'); }
    };

    const yearOptions = useMemo(() => {
        const y = dayjs().year();
        return [y - 1, y, y + 1].map((v) => ({ value: v, label: String(v) }));
    }, []);

    const columns: TableColumnsType<PurchaseRequest> = [
        {
            title: 'MÃ PHIẾU', key: 'code', width: 160,
            render: (_: any, r: PurchaseRequest) => (
                <div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1A3A5C', fontSize: 13 }}>{r.requestCode ?? '-'}</div>
                    {r.requestMonth && r.requestYear && (
                        <div style={{ color: '#888', fontSize: 11 }}>Tháng {r.requestMonth}/{r.requestYear}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'VẬT TƯ', key: 'items', width: 80, align: 'center',
            render: (_: any, r: PurchaseRequest) => <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} />,
        },
        {
            title: 'TỔNG TIỀN', key: 'total', width: 150, align: 'right',
            render: (_: any, r: PurchaseRequest) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#1A3A5C' }}>{fmtVND(r.totalWithVat ?? r.totalEstimated)}</div>
                    <div style={{ color: '#888', fontSize: 11 }}>đã gồm VAT</div>
                </div>
            ),
        },
        {
            title: 'NGÀY TẠO', dataIndex: 'createdAt', key: 'date', width: 100,
            render: (v: string) => <span style={{ color: '#555', fontSize: 13 }}>{fmtDate(v)}</span>,
        },
        {
            title: 'TRẠNG THÁI', dataIndex: 'status', key: 'status', width: 140,
            render: (s: string) => {
                const m = STATUS_META[s];
                return m ? <Tag color={m.color} icon={m.icon}>{m.label}</Tag> : <Tag>{s}</Tag>;
            },
        },
        {
            title: 'THAO TÁC', key: 'action', width: 130, fixed: 'right' as const, align: 'right' as const,
            render: (_: any, r: PurchaseRequest) => (
                <Space size={2}>
                    <Tooltip title="Xem chi tiết">
                        <Button type="text" size="small" icon={<EyeOutlined />} style={{ color: '#0284c7' }}
                            onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }} />
                    </Tooltip>
                    <Tooltip title="Xuất Excel">
                        <Button type="text" size="small" icon={<FileExcelOutlined />} style={{ color: '#16a34a' }}
                            onClick={(e) => { e.stopPropagation(); handleExport(r.id, r.requestCode ?? r.id); }} />
                    </Tooltip>
                    {r.status === 'pending' && isCS1Director && (
                        <Tooltip title="Duyệt">
                            <ConfirmAction intent="primary" title="Duyệt phiếu?" description={`Duyệt ${r.requestCode}?`} okLabel="Duyệt" onConfirm={() => handleApprove(r)}>
                                <Button type="text" size="small" icon={<CheckOutlined />} style={{ color: '#1A3A5C' }} />
                            </ConfirmAction>
                        </Tooltip>
                    )}
                    {r.status === 'pending' && isCS1Director && (
                        <Tooltip title="Từ chối">
                            <Button type="text" size="small" danger icon={<CloseOutlined />}
                                onClick={(e) => { e.stopPropagation(); setRejectTarget(r); setRejectReason(''); }} />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div className="flex w-full max-w-full flex-col gap-6 overflow-hidden">
            <PageHeader
                title="Đề nghị mua vật tư"
                subtitle="Quản lý phiếu đề nghị mua vật tư của cơ sở chính."
                actions={
                    <Button type="primary" icon={<PlusOutlined />} style={{ background: '#1A3A5C' }}
                        onClick={() => { setEditingRecord(null); setModalOpen(true); }}>
                        Tạo đề nghị
                    </Button>
                }
            />

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                    { label: 'Tổng phiếu', value: stats.total, color: '#1A3A5C', icon: null },
                    { label: 'Chờ duyệt', value: stats.pending, color: '#FA8C16', icon: <ClockCircleOutlined /> },
                    { label: 'Đã duyệt', value: stats.approved, color: '#52C41A', icon: <CheckCircleOutlined /> },
                    { label: 'Từ chối', value: stats.rejected, color: '#FF4D4F', icon: <CloseCircleOutlined /> },
                ].map(({ label, value, color, icon }) => (
                    <Card key={label} style={{ borderRadius: 8, border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} styles={{ body: { padding: '16px 20px' } }}>
                        <Statistic
                            title={<span style={{ color: '#888', fontSize: 13 }}>{label}</span>}
                            value={value}
                            valueStyle={{ color, fontWeight: 700, fontSize: 24 }}
                            prefix={icon}
                        />
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <Input.Search placeholder="Tìm mã phiếu..." allowClear style={{ width: 220 }}
                    onSearch={(v) => { setSearch(v); setPage(1); }}
                    onChange={(e) => !e.target.value && setSearch('')} />
                <Select allowClear placeholder="Tháng" style={{ width: 120 }} options={MONTH_OPTIONS}
                    value={filterMonth} onChange={(v) => { setFilterMonth(v); setPage(1); }} />
                <Select allowClear placeholder="Năm" style={{ width: 100 }} options={yearOptions}
                    value={filterYear} onChange={(v) => { setFilterYear(v); setPage(1); }} />
                <Select allowClear placeholder="Trạng thái" style={{ width: 160 }} options={STATUS_OPTIONS}
                    value={filterStatus} onChange={(v) => { setFilterStatus(v as PurchaseRequestStatus); setPage(1); }} />
                <Button onClick={() => { setSearch(''); setFilterMonth(undefined); setFilterYear(undefined); setFilterStatus(undefined); setPage(1); }}>
                    Xoá lọc
                </Button>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table<PurchaseRequest>
                    rowKey="id" columns={columns} dataSource={requests}
                    loading={isLoading || isFetching} size="middle" scroll={{ x: 900 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có phiếu đề nghị" /> }}
                    rowClassName={() => 'hover:bg-blue-50/30 cursor-pointer'}
                    onRow={(r) => ({ onClick: () => setSelectedId(r.id) })}
                    pagination={{
                        current: listResp?.page ?? page,
                        total: listResp?.total ?? 0,
                        pageSize: DEFAULT_LIMIT,
                        showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
                        onChange: (p) => setPage(p),
                        className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                    }}
                />
            </div>

            <ModalForm open={modalOpen} initial={editingRecord} plants={plants} mainPlantId={mainPlantId}
                submitting={createMut.isPending || updateMut.isPending}
                onClose={() => { setModalOpen(false); setEditingRecord(null); }}
                onSave={handleSave} />

            <DetailDrawer
                record={selectedId ? detailRecord : null}
                loading={detailLoading}
                isCS1Director={isCS1Director}
                onClose={() => setSelectedId(null)}
                onEdit={() => { setEditingRecord(detailRecord ?? null); setModalOpen(true); }}
                onApprove={handleApprove}
                onReject={(r) => { setRejectTarget(r); setRejectReason(''); }}
                onExport={handleExport}
                approvingId={approvingId}
            />

            <Modal open={Boolean(rejectTarget)} title="Nhập lý do từ chối"
                okText="Xác nhận từ chối" cancelText="Huỷ"
                confirmLoading={rejectMut.isPending}
                onOk={handleRejectSubmit}
                onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
                destroyOnHidden>
                <div style={{ marginTop: 12 }}>
                    <Text type="secondary">Phiếu: <Text strong>{rejectTarget?.requestCode}</Text></Text>
                    <Input.TextArea rows={4} style={{ marginTop: 8 }} value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do từ chối..." maxLength={300} showCount />
                </div>
            </Modal>
        </div>
    );
};

export default PurchaseRequestPage;
