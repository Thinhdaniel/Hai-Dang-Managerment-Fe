import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Alert,
    App,
    Badge,
    Button,
    Card,
    Checkbox,
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
    Upload,
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
    RollbackOutlined,
    ScanOutlined,
    UploadOutlined,
    ShoppingOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import {
    materialService,
    materialSupplierService,
    purchaseOrderService,
    purchaseRequestService,
    returnRecordService,
    type PurchaseOrder,
    type PurchaseOrderItem,
    type PurchaseOrderItemUpdate,
    type PurchaseOrderQueryParams,
    type PurchaseOrderStatus,
    type PurchaseShortage,
    type PurchaseReceiptScanPreview,
    type PurchaseRequest,
    type ReceivePurchaseOrderPayload,
    type MaterialPayload,
} from '../core/services/material.service';
import type { PaginatedResponse, User } from '../core/types';

const { Text } = Typography;
const DEFAULT_LIMIT = 10;

const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);
const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');

// Một dòng đối soát phiếu quét: người dùng sửa được đích nhận + số lượng, AI chỉ điền sẵn
type ScanMapRow = {
    key: string;
    line: PurchaseReceiptScanPreview['extractedLines'][number];
    status: 'auto' | 'suggest' | 'manual' | 'unmatched' | 'unreadable';
    target?: string; // 'po:<itemIndex>' | 'shortage:<shortageId>'
    quantity: number;
    reason?: string;
};

const scanLineKey = (line: any) => `${line?.pageIndex ?? 0}|${line?.lineNo ?? ''}|${line?.materialName ?? ''}`;

// Trạng thái hiển thị bằng chấm màu + chữ thường (không dùng tag màu rực)
const SCAN_ROW_STATUS: Record<ScanMapRow['status'], { label: string; dot: string; hollow?: boolean }> = {
    auto: { label: 'AI khớp', dot: '#15803d' },
    suggest: { label: 'AI gợi ý', dot: '#b45309' },
    manual: { label: 'Bạn chọn', dot: '#2f51d9' },
    unmatched: { label: 'Chưa xử lý', dot: '#94a3b8', hollow: true },
    unreadable: { label: 'Không đọc được', dot: '#b91c1c' },
};

const buildScanMapRows = (preview: PurchaseReceiptScanPreview): ScanMapRow[] => {
    const autosByKey = new Map<string, any>();
    (preview.currentAllocations ?? []).forEach((allocation) => {
        const key = scanLineKey(allocation.sourceLine);
        const current = autosByKey.get(key);
        if (!current || allocation.quantity > current.quantity) autosByKey.set(key, { ...allocation, kind: 'po' });
    });
    (preview.shortageAllocations ?? []).forEach((allocation) => {
        const key = scanLineKey(allocation.sourceLine);
        const current = autosByKey.get(key);
        if (!current || allocation.quantity > current.quantity)
            autosByKey.set(key, { ...allocation, kind: 'shortage' });
    });
    const reviewByKey = new Map((preview.reviewLines ?? []).map((review) => [scanLineKey(review.sourceLine), review]));
    const unreadableByKey = new Map(
        (preview.unreadableLines ?? []).map((row) => [scanLineKey(row.sourceLine), row])
    );

    return (preview.extractedLines ?? []).map((line, index) => {
        const key = `${scanLineKey(line)}#${index}`;
        const lineKey = scanLineKey(line);
        const unreadable = unreadableByKey.get(lineKey);
        if (unreadable) {
            return { key, line, status: 'unreadable', quantity: line.quantity ?? 0, reason: unreadable.reason };
        }
        const auto = autosByKey.get(lineKey);
        const review = reviewByKey.get(lineKey);
        if (auto) {
            return {
                key,
                line,
                status: 'auto',
                target: auto.kind === 'po' ? `po:${auto.poItemIndex}` : `shortage:${auto.shortageId}`,
                quantity: auto.quantity,
                reason: review?.reason,
            };
        }
        if (review?.suggestion) {
            const suggestion = review.suggestion;
            return {
                key,
                line,
                status: 'suggest',
                target:
                    suggestion.type === 'po_item'
                        ? `po:${suggestion.poItemIndex}`
                        : `shortage:${suggestion.shortageId}`,
                quantity: suggestion.quantity,
                reason: review.reason,
            };
        }
        return { key, line, status: 'unmatched', quantity: line.quantity ?? 0, reason: review?.reason };
    });
};
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
    draft: { color: 'default', label: 'Bản nháp', icon: null },
    confirmed: { color: 'warning', label: 'Đã xác nhận', icon: <ClockCircleOutlined /> },
    ordered: { color: 'processing', label: 'Đang đặt hàng', icon: <ShoppingOutlined /> },
    partially_received: { color: 'cyan', label: 'Nhận một phần', icon: <InboxOutlined /> },
    received: { color: 'success', label: 'Đã nhận hàng', icon: <CheckCircleOutlined /> },
    cancelled: { color: 'error', label: 'Đã huỷ', icon: <CloseCircleOutlined /> },
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
        return Array.isArray(r) ? r : ((r as any)?.data ?? []);
    }, [prResp]);

    React.useEffect(() => {
        if (!open) {
            setSelected([]);
            setNote('');
        }
    }, [open]);

    const selectedRequests = approvedRequests.filter((r) => selected.includes(r.id));
    const totalItems = selectedRequests.reduce((s, r) => s + r.items.length, 0);
    const totalEst = selectedRequests.reduce((s, r) => s + (r.totalWithVat ?? r.totalEstimated ?? 0), 0);

    const prCols: TableColumnsType<PurchaseRequest> = [
        {
            title: '',
            key: 'sel',
            width: 40,
            render: (_: any, r: PurchaseRequest) => (
                <Checkbox
                    checked={selected.includes(r.id)}
                    onChange={(e) =>
                        setSelected((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))
                    }
                />
            ),
        },
        {
            title: 'Mã phiếu',
            dataIndex: 'requestCode',
            key: 'code',
            width: 160,
            render: (v: string) => (
                <Text style={{ fontFamily: 'monospace', color: '#1A3A5C', fontWeight: 600 }}>{v}</Text>
            ),
        },
        {
            title: 'Tháng',
            key: 'month',
            width: 100,
            render: (_: any, r: PurchaseRequest) =>
                r.requestMonth && r.requestYear ? `${r.requestMonth}/${r.requestYear}` : '-',
        },
        {
            title: 'Số VT',
            key: 'items',
            width: 70,
            align: 'center',
            render: (_: any, r: PurchaseRequest) => (
                <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} />
            ),
        },
        {
            title: 'Tổng tiền ĐX',
            key: 'total',
            width: 140,
            align: 'right',
            render: (_: any, r: PurchaseRequest) => fmtVND(r.totalWithVat ?? r.totalEstimated),
        },
        {
            title: 'Ngày duyệt',
            key: 'approved',
            width: 110,
            render: (_: any, r: PurchaseRequest) => fmtDate(r.approvedAt),
        },
    ];

    return (
        <Modal
            open={open}
            title='Tạo đơn đặt hàng mới'
            width={900}
            centered
            maskClosable={false}
            destroyOnClose
            onCancel={onClose}
            footer={
                <Space>
                    <Button onClick={onClose}>Huỷ</Button>
                    <Button
                        type='primary'
                        style={{ background: '#1A3A5C' }}
                        loading={submitting}
                        disabled={selected.length === 0}
                        onClick={() => onCreate(selected, note)}
                    >
                        Tạo đơn hàng →
                    </Button>
                </Space>
            }
        >
            {selected.length > 0 && (
                <Alert
                    type='info'
                    showIcon
                    style={{ marginBottom: 12 }}
                    title={`Đã chọn ${selected.length} phiếu — ${totalItems} vật tư — ước tính ${fmtVND(totalEst)}`}
                />
            )}
            <Table
                dataSource={approvedRequests}
                columns={prCols}
                rowKey='id'
                size='small'
                pagination={false}
                scroll={{ y: 320 }}
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '8px 16px', background: '#FAFAFA' }}>
                            <Table
                                size='small'
                                dataSource={record.items}
                                pagination={false}
                                columns={[
                                    { title: 'Tên vật tư', dataIndex: 'materialName', width: 220 },
                                    { title: 'Người ĐX', dataIndex: 'proposedBy', width: 120 },
                                    {
                                        title: 'SL cần',
                                        dataIndex: 'quantityRequested',
                                        width: 80,
                                        align: 'center' as const,
                                    },
                                    { title: 'ĐVT', dataIndex: 'unit', width: 70 },
                                    {
                                        title: 'Đơn giá ĐX',
                                        dataIndex: 'unitPrice',
                                        width: 120,
                                        align: 'right' as const,
                                        render: (v: any) => (v ? fmtVND(v) : '-'),
                                    },
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
                locale={{ emptyText: <Empty description='Không có phiếu đề xuất đã duyệt' /> }}
            />
            <div style={{ marginTop: 12 }}>
                <Text type='secondary' style={{ fontSize: 12 }}>
                    Ghi chú chung
                </Text>
                <Input.TextArea
                    rows={2}
                    style={{ marginTop: 4 }}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder='Ghi chú cho đơn hàng...'
                />
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
    onReceive: (id: string, payload: ReceivePurchaseOrderPayload) => Promise<void>;
    onDelete: (id: string) => void;
    onExport: (id: string, code: string) => void;
    confirmingId: string | null;
    receivingId: string | null;
};

const DetailDrawer: React.FC<DrawerProps> = ({
    record,
    loading,
    isCS1Manager,
    isCS1Director,
    onClose,
    onConfirm,
    onReceive,
    onDelete,
    onExport,
    confirmingId,
    receivingId,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [editedItems, setEditedItems] = useState<Record<number, Partial<PurchaseOrderItemUpdate>>>({});
    const [hasEdit, setHasEdit] = useState(false);
    const [returnOpen, setReturnOpen] = useState(false);
    const [returnNote, setReturnNote] = useState('');
    const [returnItems, setReturnItems] = useState<
        Array<{
            materialId?: string;
            materialName: string;
            unit: string;
            quantityReturned: number;
            unitPrice: number;
            vatRate: number;
            reason: string;
        }>
    >([]);
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [receiveItems, setReceiveItems] = useState<Record<number, number>>({});
    const [receiveShortageMarks, setReceiveShortageMarks] = useState<Record<number, boolean>>({});
    const [shortageAllocations, setShortageAllocations] = useState<Record<string, number>>({});
    const [receiptScanFiles, setReceiptScanFiles] = useState<File[]>([]);
    const [receiptScanPreview, setReceiptScanPreview] = useState<PurchaseReceiptScanPreview | null>(null);
    const [scanMapRows, setScanMapRows] = useState<ScanMapRow[]>([]);
    const [showMappedScanRows, setShowMappedScanRows] = useState(false);
    const [appliedReceiptScanId, setAppliedReceiptScanId] = useState<string>();
    const [catalogTarget, setCatalogTarget] = useState<{ index: number; item: PurchaseOrderItem } | null>(null);
    const [catalogMode, setCatalogMode] = useState<'link' | 'create'>('link');
    const [materialSearch, setMaterialSearch] = useState('');
    const [selectedMaterialId, setSelectedMaterialId] = useState<string>();
    const [materialDraft, setMaterialDraft] = useState<Partial<MaterialPayload>>({ trackInventory: true });

    const returnMut = useMutation({
        mutationFn: returnRecordService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['returns', record?.id] });
            message.success('Tạo phiếu trả hàng thành công');
            setReturnOpen(false);
            setReturnItems([]);
            setReturnNote('');
        },
        onError: (e: any) => message.error(e?.message || 'Không thể tạo phiếu trả hàng'),
    });

    const receiptScanMut = useMutation({
        mutationFn: ({ id, files }: { id: string; files: File[] }) => purchaseOrderService.previewReceiptScan(id, files),
        onSuccess: (preview) => {
            setReceiptScanPreview(preview);
            setScanMapRows(buildScanMapRows(preview));
            setShowMappedScanRows(false);
            setAppliedReceiptScanId(undefined);
            if (record?.id) queryClient.invalidateQueries({ queryKey: ['purchase-receipt-scans', record.id] });
            if ((preview.extractedLines?.length ?? 0) <= 0) {
                message.warning('AI chưa đọc được dòng vật tư nào. Hãy chụp rõ hơn hoặc nhập thủ công.');
                return;
            }
            message.success(`Đã quét ${preview.summary?.extractedLineCount ?? preview.extractedLines.length} dòng`);
        },
        onError: (e: any) => message.error(e?.message || 'Không thể quét phiếu nhận hàng'),
    });

    const addReceiptScanFiles = (incoming: File[]) => {
        if (!incoming.length) return;
        setReceiptScanFiles((prev) => [...prev, ...incoming].slice(0, 5));
        setReceiptScanPreview(null);
    };

    // Thumbnail ảnh phiếu để chạy hiệu ứng quét; thu hồi objectURL khi đổi ảnh
    const receiptScanUrls = useMemo(() => receiptScanFiles.map((file) => URL.createObjectURL(file)), [receiptScanFiles]);
    React.useEffect(
        () => () => {
            receiptScanUrls.forEach((url) => URL.revokeObjectURL(url));
        },
        [receiptScanUrls]
    );

    // Dán ảnh (Ctrl+V) từ clipboard khi đang mở form nhận hàng — chụp màn hình Zalo/ảnh copy đều dán được
    React.useEffect(() => {
        if (!receiveOpen) return;
        const onPaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.items ?? [])
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file));
            if (!files.length) return;
            event.preventDefault();
            addReceiptScanFiles(files);
            message.success(`Đã dán ${files.length} ảnh từ clipboard`);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [receiveOpen]);

    // Lấy danh sách phiếu trả của PO này
    const linkMaterialMut = useMutation({
        mutationFn: ({ index, materialId }: { index: number; materialId: string }) =>
            purchaseOrderService.linkItemMaterial(record!.id, index, materialId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            if (record) queryClient.invalidateQueries({ queryKey: ['purchase-order', record.id] });
            message.success('Da gan vat tu vao danh muc');
            setCatalogTarget(null);
        },
        onError: (e: any) => message.error(e?.message || 'Khong the gan vat tu'),
    });

    const createMaterialMut = useMutation({
        mutationFn: ({ index, data }: { index: number; data: Partial<MaterialPayload> }) =>
            purchaseOrderService.createItemMaterial(record!.id, index, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            if (record) queryClient.invalidateQueries({ queryKey: ['purchase-order', record.id] });
            message.success('Da tao vat tu tu dong mua');
            setCatalogTarget(null);
        },
        onError: (e: any) => message.error(e?.message || 'Khong the tao vat tu'),
    });

    const ignoreInventoryMut = useMutation({
        mutationFn: ({ index, reason }: { index: number; reason?: string }) =>
            purchaseOrderService.ignoreItemInventory(record!.id, index, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            if (record) queryClient.invalidateQueries({ queryKey: ['purchase-order', record.id] });
            message.success('Da bo qua quan ton cho dong vat tu');
        },
        onError: (e: any) => message.error(e?.message || 'Khong the bo qua quan ton'),
    });

    const { data: returnRecords = [] } = useQuery({
        queryKey: ['returns', record?.id],
        queryFn: () => returnRecordService.getByPurchaseOrder(record!.id),
        enabled: !!record?.id && record?.status === 'received',
    });

    const { data: shortageResp = [] } = useQuery({
        queryKey: ['purchase-shortages', 'open', record?.id],
        queryFn: () => purchaseOrderService.getShortages({ status: 'open', limit: 200 }),
        enabled: Boolean(record?.id && receiveOpen),
    });

    const { data: receiptScanHistory = [] } = useQuery({
        queryKey: ['purchase-receipt-scans', record?.id],
        queryFn: () => purchaseOrderService.getReceiptScans(record!.id, 8),
        enabled: Boolean(record?.id && receiveOpen),
    });

    const { data: materialResp } = useQuery({
        queryKey: ['materials', 'catalog-link', materialSearch],
        queryFn: () => materialService.getAll({ search: materialSearch, isActive: true, limit: 50 }),
        enabled: Boolean(catalogTarget && catalogMode === 'link'),
    });

    const materialOptions = useMemo(() => {
        const list = Array.isArray(materialResp) ? materialResp : ((materialResp as any)?.data ?? []);
        return list.map((m: any) => ({ value: m.id, label: `${m.code || 'NO-CODE'} - ${m.name}` }));
    }, [materialResp]);

    // Map materialId → { totalReturned, reasons }
    const returnedMap = useMemo(() => {
        const map = new Map<string, { qty: number; reasons: string[] }>();
        (returnRecords as any[]).forEach((rr: any) => {
            (rr.items ?? []).forEach((item: any) => {
                const key = String(item.materialId ?? item.materialName);
                const cur = map.get(key) ?? { qty: 0, reasons: [] };
                cur.qty += item.quantityReturned ?? 0;
                if (item.reason) cur.reasons.push(item.reason);
                map.set(key, cur);
            });
        });
        return map;
    }, [returnRecords]);

    const getReturnItemKey = (
        item: Pick<PurchaseOrderItem, 'materialId' | 'materialName'> | { materialId?: string; materialName?: string }
    ) => String(item.materialId ?? item.materialName ?? '');

    const getReturnRemaining = (item: PurchaseOrderItem) => {
        const key = getReturnItemKey(item);
        const received = Number(item.quantityReceived ?? item.quantityOrdered ?? item.quantityRequested ?? 0);
        const returned = returnedMap.get(key)?.qty ?? 0;
        return Math.max(0, Number((received - returned).toFixed(2)));
    };

    const getSelectedReturnRemaining = (item: {
        materialId?: string;
        materialName?: string;
        quantityReturned: number;
    }) => {
        const key = getReturnItemKey(item);
        const sourceItem = record?.items.find((poItem) => getReturnItemKey(poItem) === key);
        return sourceItem ? getReturnRemaining(sourceItem) : item.quantityReturned;
    };

    const openShortages = useMemo<PurchaseShortage[]>(() => {
        if (!record) return [];
        const supplierIds = new Set(record.items.map((item) => item.supplierId).filter(Boolean));
        const materialNames = new Set(record.items.map((item) => item.materialName).filter(Boolean));
        const aiShortageIds = new Set(
            (receiptScanPreview?.proposedPayload.shortageAllocations ?? []).map((item) => item.shortageId)
        );
        return (shortageResp as PurchaseShortage[]).filter((shortage) => {
            if (shortage.originalPurchaseOrderId === record.id) return false;
            const sameSupplier = shortage.supplierId ? supplierIds.has(shortage.supplierId) : true;
            const sameMaterial = materialNames.has(shortage.materialName);
            const aiSuggested = aiShortageIds.has(shortage.id);
            return (aiSuggested || (sameSupplier && sameMaterial)) && (shortage.quantityOutstanding ?? 0) > 0;
        });
    }, [record, shortageResp, receiptScanPreview]);

    const receiveRows = useMemo(() => {
        if (!record) return [];
        return record.items.map((item, index) => {
            const ordered = item.quantityOrdered ?? item.quantityRequested ?? 0;
            const received = item.quantityReceived ?? 0;
            const remaining = Math.max(0, ordered - received);
            return { ...item, index, ordered, received, remaining };
        });
    }, [record]);

    // Ứng viên đích để nhận từng dòng phiếu: dòng của đơn này + nợ NCC còn thiếu
    const scanTargetOptions = useMemo(() => {
        const poGroup = {
            label: 'Dòng trong đơn này',
            options: receiveRows.map((row: any) => ({
                value: `po:${row.index}`,
                label: `${row.materialName} · còn ${fmtNum(row.remaining)} ${row.unit || ''}`,
            })),
        };
        const shortages = receiptScanPreview?.openShortages ?? [];
        const shortageGroup = {
            label: 'Nợ NCC từ đơn cũ',
            options: shortages.map((shortage) => ({
                value: `shortage:${shortage.id}`,
                label: `${shortage.materialName} · ${shortage.originalPurchaseOrderCode || 'đơn cũ'} · nợ ${fmtNum(shortage.quantityOutstanding ?? 0)} ${shortage.unit || ''}`,
            })),
        };
        return shortageGroup.options.length ? [poGroup, shortageGroup] : [poGroup];
    }, [receiveRows, receiptScanPreview]);

    const updateScanRow = (key: string, patch: Partial<ScanMapRow>) => {
        setScanMapRows((prev) =>
            prev.map((row) => {
                if (row.key !== key) return row;
                const next = { ...row, ...patch };
                if ('target' in patch) {
                    next.status = patch.target ? 'manual' : row.status === 'unreadable' ? 'unreadable' : 'unmatched';
                }
                return next;
            })
        );
    };

    const resetReceiveForm = () => {
        setReceiveItems({});
        setReceiveShortageMarks({});
        setShortageAllocations({});
        setReceiptScanFiles([]);
        setReceiptScanPreview(null);
        setScanMapRows([]);
        setAppliedReceiptScanId(undefined);
        receiptScanMut.reset();
    };

    const handleReceiptScan = () => {
        if (!record) return;
        if (!receiptScanFiles.length) {
            message.warning('Chọn hoặc chụp ít nhất 1 ảnh phiếu giao hàng');
            return;
        }
        receiptScanMut.mutate({ id: record.id, files: receiptScanFiles });
    };

    const applyReceiptScanPreview = () => {
        if (!receiptScanPreview) return;

        const nextReceiveItems: Record<number, number> = {};
        const nextShortageMarks: Record<number, boolean> = {};
        const nextShortageAllocations: Record<string, number> = {};
        let appliedCount = 0;

        scanMapRows.forEach((row) => {
            if (!row.target || !(row.quantity > 0)) return;
            appliedCount += 1;
            if (row.target.startsWith('po:')) {
                const index = Number(row.target.slice(3));
                nextReceiveItems[index] = (nextReceiveItems[index] ?? 0) + row.quantity;
            } else if (row.target.startsWith('shortage:')) {
                const shortageId = row.target.slice('shortage:'.length);
                nextShortageAllocations[shortageId] = (nextShortageAllocations[shortageId] ?? 0) + row.quantity;
            }
        });

        // Kẹp theo số còn chờ; dòng nhận CHƯA đủ -> tự tick "Ghi thiếu" để vào sổ nợ NCC
        receiveRows.forEach((row) => {
            const receiving = nextReceiveItems[row.index];
            if (receiving == null) return;
            const capped = Math.min(receiving, row.remaining);
            nextReceiveItems[row.index] = capped;
            if (capped > 0 && capped < row.remaining) nextShortageMarks[row.index] = true;
        });
        (receiptScanPreview.openShortages ?? []).forEach((shortage) => {
            const allocating = nextShortageAllocations[shortage.id];
            if (allocating == null) return;
            nextShortageAllocations[shortage.id] = Math.min(allocating, shortage.quantityOutstanding ?? allocating);
        });

        if (!appliedCount) {
            message.warning('Chưa có dòng nào chọn nơi nhận — chọn ở cột "Nhận vào" trước');
            return;
        }

        setReceiveItems(nextReceiveItems);
        setReceiveShortageMarks(nextShortageMarks);
        setShortageAllocations(nextShortageAllocations);
        setAppliedReceiptScanId(receiptScanPreview.scanId);
        message.success(`Đã điền ${appliedCount} dòng vào form nhận hàng. Rà lại rồi bấm "Cập nhật nhận hàng".`);

        // Học map NCC từ các dòng vừa đối soát: lần giao sau cùng NCC sẽ tự khớp (fire-and-forget)
        if (record?.id) {
            const mappings = scanMapRows
                .filter((row) => row.target?.startsWith('po:') && row.quantity > 0 && row.line?.materialName)
                .map((row) => ({
                    materialName: row.line.materialName,
                    note: row.line.note,
                    poItemIndex: Number(row.target!.slice(3)),
                }));
            if (mappings.length) {
                void purchaseOrderService
                    .recordReceiptScanMappings(record.id, {
                        supplierName: receiptScanPreview.header?.supplierName || undefined,
                        mappings,
                    })
                    .catch(() => undefined);
            }
        }
    };

    const handleReceiveSubmit = async () => {
        if (!record) return;

        const items = Object.entries(receiveItems)
            .map(([index, quantityReceived]) => ({
                index: Number(index),
                quantityReceived: Number(quantityReceived ?? 0),
                markShortage: Boolean(receiveShortageMarks[Number(index)]),
            }))
            .filter((item) => item.quantityReceived > 0 || item.markShortage);
        Object.entries(receiveShortageMarks).forEach(([index, markShortage]) => {
            if (!markShortage || items.some((item) => item.index === Number(index))) return;
            items.push({ index: Number(index), quantityReceived: 0, markShortage: true });
        });
        const allocations = Object.entries(shortageAllocations)
            .map(([shortageId, quantityReceived]) => ({ shortageId, quantityReceived: Number(quantityReceived ?? 0) }))
            .filter((item) => item.quantityReceived > 0);

        if (!items.length && !allocations.length) {
            message.warning('Vui lòng nhập số lượng thực nhận hoặc hàng bù');
            return;
        }

        await onReceive(record.id, {
            receiptScanId: appliedReceiptScanId,
            items,
            shortageAllocations: allocations,
        });
        setReceiveOpen(false);
        resetReceiveForm();
    };

    const totalRefunded = (returnRecords as any[]).reduce((s: number, r: any) => s + (r.totalRefundWithVat ?? 0), 0);

    const { data: suppliersResp } = useQuery({
        queryKey: ['material-suppliers', 'all'],
        queryFn: () => materialSupplierService.getAll({ limit: 200 }),
        enabled: Boolean(record),
    });
    const supplierOptions = useMemo(() => {
        const list = Array.isArray(suppliersResp) ? suppliersResp : ((suppliersResp as any)?.data ?? []);
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
        resetReceiveForm();
        setReceiveOpen(false);
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

    const openCatalogModal = (index: number, item: PurchaseOrderItem, mode: 'link' | 'create') => {
        setCatalogTarget({ index, item });
        setCatalogMode(mode);
        setSelectedMaterialId(undefined);
        setMaterialSearch(item.materialName || '');
        setMaterialDraft({
            name: item.materialName || '',
            unit: item.unit || '',
            trackInventory: true,
        });
    };

    const handleCatalogSubmit = () => {
        if (!catalogTarget) return;
        if (catalogMode === 'link') {
            if (!selectedMaterialId) {
                message.warning('Vui long chon vat tu trong danh muc');
                return;
            }
            linkMaterialMut.mutate({ index: catalogTarget.index, materialId: selectedMaterialId });
            return;
        }

        createMaterialMut.mutate({ index: catalogTarget.index, data: materialDraft });
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
            const vatAmount = (totalPrice * vatRate) / 100;
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
        {
            title: 'Tên vật tư',
            key: 'name',
            width: 180,
            render: (_: any, r: any) => {
                const key = String(r.materialId ?? r.materialName);
                const ret = returnedMap.get(key);
                const sourceLines = Array.isArray(r.sourceLines) ? r.sourceLines : [];
                const sourceTitle = sourceLines.length
                    ? sourceLines
                          .map(
                              (source: any) =>
                                  `${source.purchaseRequestCode || r.purchaseRequestCode || 'Phiếu ĐX'}: ${fmtNum(
                                      source.quantityOrdered ?? source.quantityRequested ?? 0
                                  )} ${source.unit || r.unit || ''}${source.proposedBy ? ` - ${source.proposedBy}` : ''}`
                          )
                          .join('\n')
                    : r.purchaseRequestCode;
                return (
                    <div>
                        <div style={{ fontWeight: 600 }}>{r.materialName}</div>
                        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{sourceTitle}</span>}>
                            <div style={{ fontSize: 11, color: '#888', cursor: sourceTitle ? 'help' : 'default' }}>
                                {r.purchaseRequestCode}
                                {sourceLines.length > 1 ? ` · ${sourceLines.length} nguồn` : ''}
                            </div>
                        </Tooltip>
                        {r.catalogStatus === 'unmatched' && (
                            <Tag color='orange' style={{ fontSize: 10, marginTop: 2 }}>
                                Chua co danh muc
                            </Tag>
                        )}
                        {r.catalogStatus === 'ignored' && (
                            <Tag color='default' style={{ fontSize: 10, marginTop: 2 }}>
                                Khong quan ton
                            </Tag>
                        )}
                        {r.inventoryStatus === 'pending' &&
                            Number(r.quantityReceived ?? 0) > Number(r.quantityInventoried ?? 0) && (
                                <Tag color='gold' style={{ fontSize: 10, marginTop: 2 }}>
                                    Cho cong ton
                                </Tag>
                            )}
                        {ret && (
                            <Tooltip title={ret.reasons.length ? `Lý do: ${ret.reasons.join('; ')}` : 'Đã trả hàng'}>
                                <Tag color='red' style={{ fontSize: 10, marginTop: 2, cursor: 'help' }}>
                                    <RollbackOutlined /> Trả {fmtNum(ret.qty)} {r.unit}
                                </Tag>
                            </Tooltip>
                        )}
                    </div>
                );
            },
        },
        { title: 'Cơ sở', dataIndex: 'plantName', key: 'plant', width: 100 },
        { title: 'Người ĐX', dataIndex: 'proposedBy', key: 'proposedBy', width: 110 },
        { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose', width: 140 },
        { title: 'SL ĐX', dataIndex: 'quantityRequested', key: 'qtyR', width: 70, align: 'right', render: fmtNum },
        {
            title: 'Đã nhận',
            key: 'qtyReceived',
            width: 80,
            align: 'right',
            render: (_: any, r: any) => fmtNum(r.quantityReceived ?? 0),
        },
        {
            title: 'Còn thiếu',
            key: 'qtyMissing',
            width: 86,
            align: 'right',
            render: (_: any, r: any) => {
                const missing = r.quantityMissing ?? Math.max(0, (r.quantityOrdered ?? 0) - (r.quantityReceived ?? 0));
                return missing > 0 ? <Text type='danger'>{fmtNum(missing)}</Text> : <Text type='success'>0</Text>;
            },
        },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 60 },
        {
            title: 'SL đặt',
            key: 'qtyO',
            width: 90,
            align: 'center',
            render: (_: any, r: any) =>
                canEdit ? (
                    <InputNumber
                        size='small'
                        min={0}
                        value={r.quantityOrdered}
                        style={{ width: 80 }}
                        onChange={(v) => patchItem(r._idx, { quantityOrdered: v ?? 0 })}
                    />
                ) : (
                    fmtNum(r.quantityOrdered)
                ),
        },
        {
            title: 'Đơn giá',
            key: 'price',
            width: 120,
            align: 'right',
            render: (_: any, r: any) =>
                canEdit ? (
                    <InputNumber
                        size='small'
                        min={0}
                        value={r.unitPrice}
                        style={{ width: 110 }}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                        onChange={(v) => patchItem(r._idx, { unitPrice: v ?? 0 })}
                    />
                ) : (
                    fmtVND(r.unitPrice)
                ),
        },
        {
            title: 'Thành tiền',
            key: 'total',
            width: 130,
            align: 'right',
            render: (_: any, r: any) => <Text style={{ color: '#1A3A5C' }}>{fmtVND(r.totalPrice)}</Text>,
        },
        {
            title: 'VAT%',
            key: 'vat',
            width: 80,
            align: 'center',
            render: (_: any, r: any) =>
                canEdit ? (
                    <InputNumber
                        size='small'
                        min={0}
                        max={100}
                        value={r.vatRate}
                        style={{ width: 70 }}
                        formatter={(v) => `${v}%`}
                        parser={(v) => Number(String(v).replace('%', '')) as any}
                        onChange={(v) => patchItem(r._idx, { vatRate: v ?? 0 })}
                    />
                ) : (
                    `${r.vatRate ?? 0}%`
                ),
        },
        {
            title: 'Giá VAT',
            key: 'vatAmt',
            width: 120,
            align: 'right',
            render: (_: any, r: any) => <Text type='secondary'>{fmtVND(r.vatAmount)}</Text>,
        },
        {
            title: 'Tổng tiền',
            key: 'totalVat',
            width: 130,
            align: 'right',
            render: (_: any, r: any) => (
                <Text strong style={{ color: '#1A3A5C' }}>
                    {fmtVND(r.totalWithVat)}
                </Text>
            ),
        },
        {
            title: 'NCC',
            key: 'sup',
            width: 160,
            render: (_: any, r: any) =>
                canEdit ? (
                    <Select
                        size='small'
                        showSearch
                        allowClear
                        value={r.supplierId}
                        style={{ width: 150 }}
                        placeholder='Chọn NCC'
                        options={supplierOptions}
                        filterOption={(input, opt) =>
                            String(opt?.label ?? '')
                                .toLowerCase()
                                .includes(input.toLowerCase())
                        }
                        onChange={(v, opt: any) => patchItem(r._idx, { supplierId: v, supplierName: opt?.label })}
                    />
                ) : (
                    r.supplierName || '-'
                ),
        },
        { title: 'Ghi chú', dataIndex: 'note', key: 'note', width: 140 },
        {
            title: 'Danh mục',
            key: 'catalog',
            width: 150,
            render: (_: any, r: any) => (
                <Space size={2} wrap>
                    {r.catalogStatus !== 'matched' && (
                        <>
                            <Button size='small' onClick={() => openCatalogModal(r._idx, r, 'link')}>
                                Gắn
                            </Button>
                            <Button size='small' onClick={() => openCatalogModal(r._idx, r, 'create')}>
                                Tạo
                            </Button>
                        </>
                    )}
                    {r.catalogStatus !== 'ignored' && (
                        <Button
                            size='small'
                            danger
                            loading={ignoreInventoryMut.isPending}
                            onClick={() =>
                                ignoreInventoryMut.mutate({ index: r._idx, reason: 'Vật tư không quản tồn' })
                            }
                        >
                            Bỏ tồn
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    const meta = record ? STATUS_META[record.status] : null;

    return (
        <>
            <Drawer
                open={Boolean(record)}
                onClose={onClose}
                size={1100}
                placement='right'
                destroyOnHidden
                title={
                    record ? (
                        <Space>
                            <Text strong>{record.orderCode}</Text>
                            {meta && (
                                <Tag color={meta.color} icon={meta.icon}>
                                    {meta.label}
                                </Tag>
                            )}
                        </Space>
                    ) : (
                        'Chi tiết đơn hàng'
                    )
                }
                footer={
                    record ? (
                        <Space wrap>
                            {hasEdit && canEdit && (
                                <Button
                                    type='primary'
                                    style={{ background: '#1A3A5C' }}
                                    loading={updateMut.isPending}
                                    onClick={handleSave}
                                >
                                    Lưu thay đổi
                                </Button>
                            )}
                            {record.status === 'draft' && isCS1Director && (
                                <ConfirmAction
                                    intent='primary'
                                    title='Xác nhận đặt hàng?'
                                    description='Đơn sẽ chuyển sang Đang đặt hàng, các phiếu đề xuất liên quan chuyển sang Đã đặt hàng.'
                                    okLabel='Xác nhận đặt hàng'
                                    onConfirm={() => onConfirm(record.id)}
                                >
                                    <Button
                                        type='primary'
                                        icon={<CheckOutlined />}
                                        loading={confirmingId === record.id}
                                        style={{ background: '#16a34a', borderColor: '#16a34a' }}
                                    >
                                        Xác nhận đặt hàng
                                    </Button>
                                </ConfirmAction>
                            )}
                            {['confirmed', 'ordered', 'partially_received'].includes(record.status) &&
                                isCS1Director && (
                                    <ConfirmAction
                                        intent='primary'
                                        title='Mở form nhận hàng?'
                                        description='Nhập số lượng thực nhận. Tồn kho cơ sở mua sẽ được cập nhật tự động với các vật tư đã chuẩn hóa.'
                                        okLabel='Mở form nhận hàng'
                                        onConfirm={() => {
                                            resetReceiveForm();
                                            setReceiveOpen(true);
                                        }}
                                    >
                                        <Button
                                            icon={<InboxOutlined />}
                                            loading={receivingId === record.id}
                                            style={{ borderColor: '#0284c7', color: '#0284c7' }}
                                        >
                                            Nhập nhận hàng
                                        </Button>
                                    </ConfirmAction>
                                )}
                            {record.status === 'draft' && isCS1Manager && (
                                <ConfirmAction
                                    title='Huỷ đơn hàng?'
                                    description='Các phiếu đề xuất sẽ được hoàn trả về trạng thái đã duyệt.'
                                    okLabel='Huỷ đơn'
                                    onConfirm={() => onDelete(record.id)}
                                >
                                    <Button danger icon={<DeleteOutlined />}>
                                        Huỷ đơn
                                    </Button>
                                </ConfirmAction>
                            )}
                            {isCS1Manager && (
                                <Button
                                    icon={<FileExcelOutlined />}
                                    style={{ color: '#16a34a', borderColor: '#16a34a' }}
                                    onClick={() => onExport(record.id, record.orderCode ?? record.id)}
                                >
                                    Xuất Excel
                                </Button>
                            )}
                            {record.status === 'received' && isCS1Manager && (
                                <Button icon={<RollbackOutlined />} danger onClick={() => setReturnOpen(true)}>
                                    Trả hàng NCC
                                </Button>
                            )}
                        </Space>
                    ) : undefined
                }
            >
                {loading && <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Đang tải...</div>}
                {!loading && record && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <Descriptions column={3} size='small' bordered>
                            <Descriptions.Item label='Mã đơn'>{record.orderCode}</Descriptions.Item>
                            <Descriptions.Item label='Ngày tạo'>{fmtDate(record.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label='Người lập'>
                                {resolveUserLabel(record.createdBy)}
                            </Descriptions.Item>
                            <Descriptions.Item label='Phiếu ĐX' span={2}>
                                <Space wrap size={4}>
                                    {(record.purchaseRequestCodes ?? []).map((c) => (
                                        <Tag key={c} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                            {c}
                                        </Tag>
                                    ))}
                                </Space>
                            </Descriptions.Item>
                            <Descriptions.Item label='Ghi chú'>{record.note || '-'}</Descriptions.Item>
                            <Descriptions.Item label='Thành tiền'>{fmtVND(record.totalAmount)}</Descriptions.Item>
                            <Descriptions.Item label='Tổng VAT'>{fmtVND(record.totalVat)}</Descriptions.Item>
                            <Descriptions.Item label='Tổng cộng'>
                                <Text strong style={{ color: '#1A3A5C', fontSize: 15 }}>
                                    {fmtVND(record.totalWithVat)}
                                </Text>
                            </Descriptions.Item>
                            {totalRefunded > 0 && (
                                <Descriptions.Item label='Đã hoàn trả' span={3}>
                                    <Space>
                                        <Tag color='red' icon={<RollbackOutlined />}>
                                            -{fmtVND(totalRefunded)}
                                        </Tag>
                                        <Text strong style={{ color: '#16a34a' }}>
                                            Thực chi: {fmtVND(Math.max(0, (record.totalWithVat ?? 0) - totalRefunded))}
                                        </Text>
                                    </Space>
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        <Table
                            dataSource={displayItems}
                            columns={itemCols}
                            rowKey='_idx'
                            pagination={false}
                            size='small'
                            scroll={{ x: 'max-content' }}
                            rowClassName={(r) =>
                                returnedMap.has(String(r.materialId ?? r.materialName)) ? 'bg-red-50/40' : ''
                            }
                            summary={() => (
                                <Table.Summary.Row>
                                    <Table.Summary.Cell index={0} colSpan={9}>
                                        <Text strong>Tổng cộng</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={9} align='right'>
                                        <Text strong>{fmtVND(sumPrice)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={10} />
                                    <Table.Summary.Cell index={11} align='right'>
                                        <Text strong>{fmtVND(sumVat)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={12} align='right'>
                                        <Text strong style={{ color: '#1A3A5C' }}>
                                            {fmtVND(sumTotal)}
                                        </Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={13} colSpan={2} />
                                </Table.Summary.Row>
                            )}
                        />
                    </div>
                )}
            </Drawer>

            <Modal
                open={receiveOpen}
                onCancel={() => {
                    setReceiveOpen(false);
                    resetReceiveForm();
                }}
                title='Nhập số lượng thực nhận'
                width={1080}
                okText='Cập nhật nhận hàng'
                confirmLoading={receivingId === record?.id}
                onOk={handleReceiveSubmit}
                destroyOnHidden
            >
                <div className='flex flex-col gap-4 py-2'>
                    <div className='rounded-lg border border-slate-200 bg-white px-4 py-3'>
                        <style>{`
                            .hd-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
                            .hd-num { font-variant-numeric: tabular-nums; }
                            .hd-stamp { display: inline-block; transform: rotate(-4deg); border: 1.5px solid #2f51d9; color: #2f51d9; border-radius: 6px; padding: 2px 10px; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; background: #fff; box-shadow: inset 0 0 0 1.5px #fff, inset 0 0 0 2.5px #2f51d9; user-select: none; }
                            .hd-stamp.warn { border-color: #b45309; color: #b45309; box-shadow: inset 0 0 0 1.5px #fff, inset 0 0 0 2.5px #b45309; }
                            .hd-dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; margin-right: 6px; vertical-align: 1px; }
                            .hd-recon .ant-table-thead > tr > th { background: transparent !important; border-bottom: 1px solid #cbd5e1 !important; font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #64748b !important; font-weight: 600; padding: 6px 8px !important; }
                            .hd-recon .ant-table-thead > tr > th::before { display: none !important; }
                            .hd-recon .ant-table-tbody > tr > td { border-bottom: 1px solid #eef2f7 !important; padding: 7px 8px !important; }
                            .hd-recon .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
                            .hd-scan-frame { position: relative; width: 132px; height: 96px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc; }
                            .hd-scan-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
                            .hd-scan-frame.hd-scanning img { filter: saturate(.8) brightness(.94); }
                            .hd-scan-corner { position: absolute; width: 14px; height: 14px; border: 0 solid #2f51d9; pointer-events: none; z-index: 3; }
                            .hd-scan-corner.tl { top: 5px; left: 5px; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 5px; }
                            .hd-scan-corner.tr { top: 5px; right: 5px; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 5px; }
                            .hd-scan-corner.bl { bottom: 5px; left: 5px; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 5px; }
                            .hd-scan-corner.br { bottom: 5px; right: 5px; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 5px; }
                            .hd-scan-beam { position: absolute; left: 0; right: 0; height: 38%; pointer-events: none; z-index: 2;
                                background: linear-gradient(180deg, rgba(47,81,217,0) 0%, rgba(47,81,217,.16) 60%, rgba(47,81,217,.34) 100%);
                                border-bottom: 2px solid rgba(47,81,217,.85);
                                box-shadow: 0 3px 12px rgba(47,81,217,.5);
                                animation: hdScanSweep 1.5s linear infinite; }
                            .hd-scan-lines { position: absolute; inset: 0; pointer-events: none; z-index: 1; mix-blend-mode: screen;
                                background: repeating-linear-gradient(180deg, rgba(47,81,217,.07) 0 2px, transparent 2px 6px);
                                animation: hdScanFlicker 1.1s steps(2) infinite; }
                            .hd-scan-done { position: absolute; top: 5px; right: 5px; z-index: 4; background: #15803d; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; }
                            .hd-scan-status { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #2f51d9; }
                            .hd-scan-status .hd-scan-pulse { width: 8px; height: 8px; border-radius: 999px; background: #2f51d9; animation: hdScanPulse 1s ease-in-out infinite; }
                            @keyframes hdScanSweep { 0% { top: -40%; } 100% { top: 102%; } }
                            @keyframes hdScanFlicker { 0% { opacity: .55; } 100% { opacity: 1; } }
                            @keyframes hdScanPulse { 0%, 100% { transform: scale(.7); opacity: .5; } 50% { transform: scale(1.15); opacity: 1; } }
                            @media (prefers-reduced-motion: reduce) { .hd-scan-beam, .hd-scan-lines, .hd-scan-status .hd-scan-pulse { animation: none; } .hd-scan-beam { display: none; } }
                        `}</style>
                        <div className='flex flex-col gap-3'>
                            <div className='flex flex-wrap items-baseline justify-between gap-2'>
                                <span className='hd-eyebrow'>Quét phiếu giao hàng</span>
                                <Text type='secondary' className='text-xs'>
                                    Nhập số thực nhận lần này — dòng nhận thiếu tự ghi vào sổ nợ NCC
                                </Text>
                            </div>
                            <div className='flex flex-wrap items-center gap-2'>
                                <Upload
                                    accept='image/*'
                                    multiple
                                    showUploadList={false}
                                    beforeUpload={(file, fileList) => {
                                        if (file === fileList[0]) addReceiptScanFiles(fileList.slice(0, 5));
                                        return false;
                                    }}
                                >
                                    <Button icon={<UploadOutlined />}>Chọn/chụp ảnh</Button>
                                </Upload>
                                <Button
                                    type='primary'
                                    icon={<ScanOutlined />}
                                    loading={receiptScanMut.isPending}
                                    disabled={!receiptScanFiles.length}
                                    onClick={handleReceiptScan}
                                >
                                    Quét và đối soát
                                </Button>
                                {receiptScanFiles.length > 0 && (
                                    <Button
                                        size='small'
                                        type='text'
                                        onClick={() => {
                                            setReceiptScanFiles([]);
                                            setReceiptScanPreview(null);
                                        }}
                                    >
                                        Bỏ ảnh
                                    </Button>
                                )}
                                <Text type='secondary' className='text-xs'>
                                    {receiptScanFiles.length
                                        ? `${receiptScanFiles.length} ảnh đã chọn`
                                        : 'Tối đa 5 ảnh · dán ảnh chụp màn hình bằng Ctrl+V'}
                                </Text>
                            </div>

                            {receiptScanUrls.length > 0 && (
                                <div className='flex flex-wrap items-center gap-3'>
                                    {receiptScanUrls.map((url, index) => (
                                        <div
                                            key={url}
                                            className={`hd-scan-frame ${receiptScanMut.isPending ? 'hd-scanning' : ''}`}
                                        >
                                            <img src={url} alt={`Ảnh phiếu ${index + 1}`} />
                                            {receiptScanMut.isPending && (
                                                <>
                                                    <span className='hd-scan-beam' />
                                                    <span className='hd-scan-lines' />
                                                </>
                                            )}
                                            {!receiptScanMut.isPending && receiptScanPreview && (
                                                <span className='hd-scan-done'>✓ Đã quét</span>
                                            )}
                                            <i className='hd-scan-corner tl' />
                                            <i className='hd-scan-corner tr' />
                                            <i className='hd-scan-corner bl' />
                                            <i className='hd-scan-corner br' />
                                        </div>
                                    ))}
                                    {receiptScanMut.isPending && (
                                        <span className='hd-scan-status'>
                                            <span className='hd-scan-pulse' />
                                            Đang quét và đối chiếu 2 lần đọc…
                                        </span>
                                    )}
                                </div>
                            )}

                            {receiptScanPreview && (
                                <div className='mt-1 flex flex-col gap-2 border-t border-slate-200 pt-3'>
                                    <div className='flex flex-wrap items-start justify-between gap-2 px-1'>
                                        <div>
                                            <div className='hd-eyebrow'>Phiếu giao hàng</div>
                                            <div className='text-sm font-semibold text-slate-800'>
                                                {receiptScanPreview.header?.supplierName || record?.supplierName || 'Chưa rõ nhà cung cấp'}
                                            </div>
                                            <div className='hd-num text-xs text-slate-500'>
                                                Số{' '}
                                                {receiptScanPreview.header?.deliveryCode ||
                                                    receiptScanPreview.header?.invoiceNo ||
                                                    '—'}{' '}
                                                ·{' '}
                                                {fmtDate(
                                                    receiptScanPreview.header?.receivedDate ||
                                                        receiptScanPreview.header?.invoiceDate
                                                )}
                                            </div>
                                        </div>
                                        {receiptScanPreview.verification?.status === 'verified' ? (
                                            <span className='hd-stamp mt-1'>
                                                Đối chiếu ×2 · {receiptScanPreview.summary.verifiedLineCount ?? 0}/
                                                {receiptScanPreview.summary.extractedLineCount} khớp
                                            </span>
                                        ) : (
                                            <Tooltip title={receiptScanPreview.verification?.note}>
                                                <span className='hd-stamp warn mt-1'>Chưa đối chiếu — rà kỹ</span>
                                            </Tooltip>
                                        )}
                                    </div>

                                    {(() => {
                                        // Dòng AI đã khớp / bạn đã chọn thì thu gọn — chỉ phơi ra dòng cần xử lý tay
                                        const isHandled = (row: ScanMapRow) =>
                                            !!row.target && (row.status === 'auto' || row.status === 'manual');
                                        const pendingRows = scanMapRows.filter((row) => !isHandled(row));
                                        const handledRows = scanMapRows.filter(isHandled);
                                        const scanReconColumns = [
                                            {
                                                title: '#',
                                                key: 'no',
                                                width: 40,
                                                render: (_: any, row: ScanMapRow, index: number) => (
                                                    <Text type='secondary'>{row.line?.lineNo ?? index + 1}</Text>
                                                ),
                                            },
                                            {
                                                title: 'Dòng trên phiếu',
                                                key: 'line',
                                                width: 280,
                                                render: (_: any, row: ScanMapRow) => (
                                                    <Tooltip
                                                        title={
                                                            row.line?.rawText
                                                                ? `Nguyên văn: “${row.line.rawText}”`
                                                                : undefined
                                                        }
                                                    >
                                                        <div>
                                                            <div className='text-[13px] font-medium text-slate-800'>
                                                                {row.line?.materialName || '(không rõ tên)'}
                                                            </div>
                                                            {row.line?.confidence != null && (
                                                                <div className='text-xs text-slate-400'>
                                                                    đọc {Math.round(row.line.confidence * 100)}%
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Tooltip>
                                                ),
                                            },
                                            {
                                                title: 'SL phiếu',
                                                key: 'lineQty',
                                                width: 90,
                                                align: 'right' as const,
                                                render: (_: any, row: ScanMapRow) => (
                                                    <span className='hd-num text-slate-800'>
                                                        {row.line?.quantity != null ? fmtNum(row.line.quantity) : '—'}
                                                        {row.line?.unit ? (
                                                            <span className='text-slate-400'> {row.line.unit}</span>
                                                        ) : null}
                                                    </span>
                                                ),
                                            },
                                            {
                                                title: 'Nhận vào',
                                                key: 'target',
                                                width: 330,
                                                render: (_: any, row: ScanMapRow) => (
                                                    <Select
                                                        size='small'
                                                        className='w-full'
                                                        placeholder='Chọn dòng đơn / nợ NCC…'
                                                        value={row.target}
                                                        allowClear
                                                        showSearch
                                                        optionFilterProp='label'
                                                        options={scanTargetOptions}
                                                        onChange={(value) =>
                                                            updateScanRow(row.key, { target: value })
                                                        }
                                                    />
                                                ),
                                            },
                                            {
                                                title: 'SL nhận',
                                                key: 'quantity',
                                                width: 110,
                                                render: (_: any, row: ScanMapRow) => (
                                                    <InputNumber
                                                        size='small'
                                                        min={0}
                                                        className='w-full'
                                                        value={row.quantity}
                                                        disabled={!row.target}
                                                        onChange={(value) =>
                                                            updateScanRow(row.key, { quantity: Number(value ?? 0) })
                                                        }
                                                    />
                                                ),
                                            },
                                            {
                                                title: 'Trạng thái',
                                                key: 'status',
                                                width: 130,
                                                render: (_: any, row: ScanMapRow) => {
                                                    const status = SCAN_ROW_STATUS[row.status];
                                                    return (
                                                        <Tooltip title={row.reason}>
                                                            <span className='text-xs text-slate-600'>
                                                                <span
                                                                    className='hd-dot'
                                                                    style={
                                                                        status.hollow
                                                                            ? {
                                                                                  border: `1.5px solid ${status.dot}`,
                                                                                  background: 'transparent',
                                                                              }
                                                                            : { background: status.dot }
                                                                    }
                                                                />
                                                                {status.label}
                                                            </span>
                                                        </Tooltip>
                                                    );
                                                },
                                            },
                                        ];
                                        return (
                                            <>
                                                {pendingRows.length > 0 ? (
                                                    <>
                                                        <div className='px-1 text-xs font-medium text-slate-600'>
                                                            Cần bạn xử lý ({pendingRows.length} dòng)
                                                        </div>
                                                        <Table
                                                            className='hd-recon'
                                                            size='small'
                                                            rowKey='key'
                                                            pagination={false}
                                                            dataSource={pendingRows}
                                                            scroll={{ x: 'max-content' }}
                                                            columns={scanReconColumns}
                                                        />
                                                    </>
                                                ) : (
                                                    <div className='rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700'>
                                                        AI đã map toàn bộ {scanMapRows.length} dòng — bấm bên dưới nếu
                                                        muốn rà lại.
                                                    </div>
                                                )}
                                                {handledRows.length > 0 && (
                                                    <div className='px-1'>
                                                        <button
                                                            type='button'
                                                            className='text-xs text-slate-500 hover:text-slate-700'
                                                            onClick={() => setShowMappedScanRows((v) => !v)}
                                                        >
                                                            {showMappedScanRows ? '▾' : '▸'} AI đã map{' '}
                                                            {handledRows.length} dòng
                                                            {showMappedScanRows ? ' — thu gọn' : ' — xem lại'}
                                                        </button>
                                                        {showMappedScanRows && (
                                                            <Table
                                                                className='hd-recon mt-1'
                                                                size='small'
                                                                rowKey='key'
                                                                pagination={false}
                                                                dataSource={handledRows}
                                                                scroll={{ x: 'max-content' }}
                                                                columns={scanReconColumns}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}

                                    <div className='flex flex-wrap items-center justify-between gap-2 px-1'>
                                        <Text type='secondary' className='text-xs'>
                                            Sai chỗ nào, chọn lại ở cột “Nhận vào”
                                            {receiptScanPreview.model ? ` · đọc bởi ${receiptScanPreview.model}` : ''}
                                        </Text>
                                        <Button
                                            type='primary'
                                            disabled={!scanMapRows.some((row) => row.target && row.quantity > 0)}
                                            onClick={applyReceiptScanPreview}
                                        >
                                            Áp dụng vào form (
                                            {scanMapRows.filter((row) => row.target && row.quantity > 0).length}/
                                            {scanMapRows.length} dòng)
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {receiptScanHistory.length > 0 && (
                        <div className='rounded-lg border border-slate-200 bg-white px-4 py-3'>
                            <div className='hd-eyebrow mb-2'>Các lần quét trước</div>
                            <div className='divide-y divide-slate-100'>
                                {receiptScanHistory.slice(0, 6).map((scan) => (
                                    <div
                                        key={scan.id}
                                        className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-xs'
                                    >
                                        <span className='hd-num text-slate-400'>{fmtDate(scan.createdAt)}</span>
                                        <span className='font-medium text-slate-700'>
                                            {scan.header?.deliveryCode || scan.header?.invoiceNo || 'Phiếu chưa rõ số'}
                                        </span>
                                        <span className='hd-num text-slate-500'>
                                            {scan.summary?.extractedLineCount ?? 0} dòng · đơn này{' '}
                                            {fmtNum(scan.summary?.currentOrderQuantity ?? 0)} · bù{' '}
                                            {fmtNum(scan.summary?.shortageResolvedQuantity ?? 0)}
                                        </span>
                                        <span
                                            className={
                                                scan.status === 'applied'
                                                    ? 'ml-auto font-medium text-emerald-700'
                                                    : 'ml-auto text-slate-400'
                                            }
                                        >
                                            {scan.status === 'applied' ? 'đã áp dụng' : 'chưa áp dụng'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <Table
                        dataSource={receiveRows}
                        rowKey='index'
                        pagination={false}
                        size='small'
                        scroll={{ x: 'max-content' }}
                        columns={[
                            { title: 'Vật tư', dataIndex: 'materialName', width: 190 },
                            { title: 'NCC', dataIndex: 'supplierName', width: 150, render: (v: string) => v || '-' },
                            { title: 'Đặt', dataIndex: 'ordered', width: 80, align: 'right' as const, render: fmtNum },
                            {
                                title: 'Đã nhận',
                                dataIndex: 'received',
                                width: 90,
                                align: 'right' as const,
                                render: fmtNum,
                            },
                            {
                                title: 'Còn lại',
                                dataIndex: 'remaining',
                                width: 90,
                                align: 'right' as const,
                                render: (v: number) =>
                                    v > 0 ? <Text type='danger'>{fmtNum(v)}</Text> : <Text type='success'>0</Text>,
                            },
                            {
                                title: 'Nhận lần này',
                                key: 'receiveNow',
                                width: 130,
                                render: (_: any, row: any) => (
                                    <InputNumber
                                        min={0}
                                        max={row.remaining}
                                        value={receiveItems[row.index] ?? 0}
                                        style={{ width: 120 }}
                                        onChange={(value) =>
                                            setReceiveItems((prev) => ({ ...prev, [row.index]: Number(value ?? 0) }))
                                        }
                                    />
                                ),
                            },
                            {
                                title: 'Ghi thiếu',
                                key: 'markShortage',
                                width: 95,
                                render: (_: any, row: any) => (
                                    <Checkbox
                                        checked={Boolean(receiveShortageMarks[row.index])}
                                        disabled={row.remaining <= 0}
                                        onChange={(event) =>
                                            setReceiveShortageMarks((prev) => ({
                                                ...prev,
                                                [row.index]: event.target.checked,
                                            }))
                                        }
                                    />
                                ),
                            },
                            { title: 'ĐVT', dataIndex: 'unit', width: 70 },
                        ]}
                    />

                    <div>
                        <div className='mb-2 text-sm font-semibold text-slate-700'>
                            Hàng bù cho nợ cũ cùng NCC/vật tư
                        </div>
                        <Table
                            dataSource={openShortages}
                            rowKey='id'
                            pagination={false}
                            size='small'
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description='Không có nợ hàng phù hợp'
                                    />
                                ),
                            }}
                            scroll={{ x: 'max-content' }}
                            columns={[
                                { title: 'Đơn gốc', dataIndex: 'originalPurchaseOrderCode', width: 130 },
                                { title: 'Vật tư', dataIndex: 'materialName', width: 190 },
                                {
                                    title: 'NCC',
                                    dataIndex: 'supplierName',
                                    width: 150,
                                    render: (v: string) => v || '-',
                                },
                                {
                                    title: 'Còn nợ',
                                    dataIndex: 'quantityOutstanding',
                                    width: 90,
                                    align: 'right' as const,
                                    render: (v: number) => <Text type='danger'>{fmtNum(v)}</Text>,
                                },
                                {
                                    title: 'Bù lần này',
                                    key: 'allocation',
                                    width: 130,
                                    render: (_: any, row: PurchaseShortage) => (
                                        <InputNumber
                                            min={0}
                                            max={row.quantityOutstanding}
                                            value={shortageAllocations[row.id] ?? 0}
                                            style={{ width: 120 }}
                                            onChange={(value) =>
                                                setShortageAllocations((prev) => ({
                                                    ...prev,
                                                    [row.id]: Number(value ?? 0),
                                                }))
                                            }
                                        />
                                    ),
                                },
                                { title: 'ĐVT', dataIndex: 'unit', width: 70 },
                            ]}
                        />
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(catalogTarget)}
                onCancel={() => setCatalogTarget(null)}
                title={catalogMode === 'link' ? 'Gắn vật tư vào danh mục' : 'Tạo vật tư từ đơn mua'}
                width={620}
                okText={catalogMode === 'link' ? 'Gắn vật tư' : 'Tạo và gắn'}
                confirmLoading={linkMaterialMut.isPending || createMaterialMut.isPending}
                onOk={handleCatalogSubmit}
                destroyOnHidden
            >
                <div className='flex flex-col gap-3 py-2'>
                    {catalogTarget?.item && (
                        <Alert
                            type='info'
                            showIcon
                            title={`${catalogTarget.item.materialName || ''} - ${catalogTarget.item.unit || ''}`}
                        />
                    )}
                    <Select
                        value={catalogMode}
                        style={{ width: 220 }}
                        options={[
                            { value: 'link', label: 'Gắn vật tư có sẵn' },
                            { value: 'create', label: 'Tạo vật tư mới' },
                        ]}
                        onChange={(value) => setCatalogMode(value)}
                    />
                    {catalogMode === 'link' ? (
                        <Select
                            showSearch
                            allowClear
                            value={selectedMaterialId}
                            options={materialOptions}
                            style={{ width: '100%' }}
                            placeholder='Tìm vật tư trong danh mục'
                            filterOption={false}
                            onSearch={setMaterialSearch}
                            onChange={setSelectedMaterialId}
                        />
                    ) : (
                        <div className='grid grid-cols-2 gap-3'>
                            <Input
                                placeholder='Mã vật tư'
                                value={materialDraft.code}
                                onChange={(e) => setMaterialDraft((prev) => ({ ...prev, code: e.target.value }))}
                            />
                            <Input
                                placeholder='Tên vật tư'
                                value={materialDraft.name}
                                onChange={(e) => setMaterialDraft((prev) => ({ ...prev, name: e.target.value }))}
                            />
                            <Input
                                placeholder='Đơn vị tính'
                                value={materialDraft.unit}
                                onChange={(e) => setMaterialDraft((prev) => ({ ...prev, unit: e.target.value }))}
                            />
                            <Input
                                placeholder='Nhóm vật tư'
                                value={materialDraft.category}
                                onChange={(e) => setMaterialDraft((prev) => ({ ...prev, category: e.target.value }))}
                            />
                            <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                placeholder='Tồn tối thiểu'
                                value={materialDraft.minStockLevel}
                                onChange={(value) =>
                                    setMaterialDraft((prev) => ({ ...prev, minStockLevel: value ?? 0 }))
                                }
                            />
                            <Checkbox
                                checked={materialDraft.trackInventory !== false}
                                onChange={(e) =>
                                    setMaterialDraft((prev) => ({ ...prev, trackInventory: e.target.checked }))
                                }
                            >
                                Quản tồn
                            </Checkbox>
                            <Input.TextArea
                                className='col-span-2'
                                rows={2}
                                placeholder='Mô tả'
                                value={materialDraft.description}
                                onChange={(e) => setMaterialDraft((prev) => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                    )}
                </div>
            </Modal>

            {/* Return Modal */}
            <Modal
                open={returnOpen}
                onCancel={() => {
                    setReturnOpen(false);
                    setReturnItems([]);
                    setReturnNote('');
                }}
                title={
                    <span className='flex items-center gap-2 text-red-600'>
                        <RollbackOutlined /> Tạo phiếu trả hàng NCC
                    </span>
                }
                width={860}
                okText='Xác nhận trả hàng'
                okButtonProps={{ danger: true, loading: returnMut.isPending, disabled: !returnItems.length }}
                onOk={() => {
                    if (!record) return;
                    const requestedByKey = new Map<string, number>();
                    for (const item of returnItems) {
                        const key = getReturnItemKey(item);
                        requestedByKey.set(
                            key,
                            Number(((requestedByKey.get(key) ?? 0) + Number(item.quantityReturned ?? 0)).toFixed(2))
                        );
                    }
                    for (const [key, requestedQty] of requestedByKey.entries()) {
                        const sourceItem = record.items.find((item) => getReturnItemKey(item) === key);
                        if (!sourceItem) {
                            message.error('Vật tư trả không nằm trong đơn mua');
                            return;
                        }
                        const remaining = getReturnRemaining(sourceItem);
                        if (requestedQty > remaining) {
                            message.error(
                                `Số lượng trả của ${sourceItem.materialName} vượt quá số lượng còn được trả (${fmtNum(remaining)})`
                            );
                            return;
                        }
                    }
                    returnMut.mutate({
                        purchaseOrderId: record.id,
                        items: returnItems.map((i) => ({
                            materialId: i.materialId,
                            materialName: i.materialName,
                            unit: i.unit,
                            quantityReturned: i.quantityReturned,
                            unitPrice: i.unitPrice,
                            vatRate: i.vatRate,
                            reason: i.reason || undefined,
                        })),
                        note: returnNote || undefined,
                    });
                }}
                destroyOnHidden
            >
                <div className='flex flex-col gap-4 py-2'>
                    {/* Pre-fill từ PO items */}
                    {returnItems.length === 0 && (
                        <div className='rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700'>
                            Chọn mặt hàng cần trả từ đơn hàng <strong>{record?.orderCode}</strong>:
                            <div className='mt-2 flex flex-wrap gap-2'>
                                {(record?.items ?? []).map((item, idx) => {
                                    const remaining = getReturnRemaining(item);
                                    return (
                                        <Button
                                            key={idx}
                                            size='small'
                                            disabled={remaining <= 0}
                                            onClick={() =>
                                                setReturnItems((p) => [
                                                    ...p,
                                                    {
                                                        materialId: item.materialId,
                                                        materialName: item.materialName || '',
                                                        unit: item.unit || '',
                                                        quantityReturned: remaining || 1,
                                                        unitPrice: item.unitPrice ?? 0,
                                                        vatRate: item.vatRate ?? 0,
                                                        reason: '',
                                                    },
                                                ])
                                            }
                                        >
                                            + {item.materialName}
                                            {item.supplierName ? ` (${item.supplierName})` : ''} - còn{' '}
                                            {fmtNum(remaining)}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Items table */}
                    {returnItems.length > 0 && (
                        <div className='overflow-x-auto rounded-xl border border-slate-200'>
                            <table className='w-full text-sm'>
                                <thead className='bg-slate-50'>
                                    <tr>
                                        {[
                                            'Tên vật tư',
                                            'ĐVT',
                                            'SL trả',
                                            'Đơn giá',
                                            'VAT%',
                                            'Hoàn tiền',
                                            'Lý do',
                                            '',
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                className='px-3 py-2 text-left text-xs font-semibold text-slate-500'
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {returnItems.map((item, idx) => {
                                        const refund = Number(
                                            (item.quantityReturned * item.unitPrice * (1 + item.vatRate / 100)).toFixed(
                                                0
                                            )
                                        );
                                        const maxReturnQty = getSelectedReturnRemaining(item);
                                        return (
                                            <tr key={idx} className='border-t border-slate-100'>
                                                <td className='px-3 py-2 font-medium'>{item.materialName}</td>
                                                <td className='px-3 py-2'>{item.unit}</td>
                                                <td className='px-3 py-2'>
                                                    <InputNumber
                                                        min={1}
                                                        max={maxReturnQty || undefined}
                                                        size='small'
                                                        style={{ width: 80 }}
                                                        value={item.quantityReturned}
                                                        onChange={(v) =>
                                                            setReturnItems((p) =>
                                                                p.map((r, i) =>
                                                                    i === idx ? { ...r, quantityReturned: v ?? 1 } : r
                                                                )
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td className='px-3 py-2'>
                                                    <InputNumber
                                                        min={0}
                                                        size='small'
                                                        style={{ width: 100 }}
                                                        value={item.unitPrice}
                                                        formatter={(v) =>
                                                            `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                        }
                                                        onChange={(v) =>
                                                            setReturnItems((p) =>
                                                                p.map((r, i) =>
                                                                    i === idx ? { ...r, unitPrice: v ?? 0 } : r
                                                                )
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td className='px-3 py-2'>
                                                    <InputNumber
                                                        min={0}
                                                        max={100}
                                                        size='small'
                                                        style={{ width: 70 }}
                                                        value={item.vatRate}
                                                        onChange={(v) =>
                                                            setReturnItems((p) =>
                                                                p.map((r, i) =>
                                                                    i === idx ? { ...r, vatRate: v ?? 0 } : r
                                                                )
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td className='px-3 py-2 font-semibold text-green-700'>
                                                    {fmtVND(refund)}
                                                </td>
                                                <td className='px-3 py-2'>
                                                    <Input
                                                        size='small'
                                                        placeholder='Lý do...'
                                                        style={{ width: 140 }}
                                                        value={item.reason}
                                                        onChange={(e) =>
                                                            setReturnItems((p) =>
                                                                p.map((r, i) =>
                                                                    i === idx ? { ...r, reason: e.target.value } : r
                                                                )
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td className='px-3 py-2'>
                                                    <Button
                                                        type='text'
                                                        danger
                                                        size='small'
                                                        icon={<DeleteOutlined />}
                                                        onClick={() =>
                                                            setReturnItems((p) => p.filter((_, i) => i !== idx))
                                                        }
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className='border-t-2 border-slate-200 bg-slate-50 font-semibold'>
                                        <td colSpan={5} className='px-3 py-2 text-right text-slate-600'>
                                            Tổng hoàn tiền:
                                        </td>
                                        <td className='px-3 py-2 text-green-700'>
                                            {fmtVND(
                                                returnItems.reduce(
                                                    (s, i) =>
                                                        s + i.quantityReturned * i.unitPrice * (1 + i.vatRate / 100),
                                                    0
                                                )
                                            )}
                                        </td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {returnItems.length > 0 && (
                        <div className='flex items-center gap-3'>
                            <Button
                                size='small'
                                icon={<PlusOutlined />}
                                onClick={() =>
                                    setReturnItems((p) => [
                                        ...p,
                                        {
                                            materialName: '',
                                            unit: '',
                                            quantityReturned: 1,
                                            unitPrice: 0,
                                            vatRate: 0,
                                            reason: '',
                                        },
                                    ])
                                }
                            >
                                Thêm dòng
                            </Button>
                            <Input
                                placeholder='Ghi chú phiếu trả hàng...'
                                value={returnNote}
                                onChange={(e) => setReturnNote(e.target.value)}
                                className='flex-1'
                            />
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

// ─── PurchaseOrderPage ────────────────────────────────────────────────────────

const PurchaseOrderPage: React.FC = () => {
    const { user } = useAuth();
    const { message, notification } = App.useApp();
    const queryClient = useQueryClient();

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID as string;
    const procurementPlantIds = String(import.meta.env.VITE_PROCUREMENT_PLANT_IDS || mainPlantId || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    const isCS1Manager =
        Boolean(user?.plantId && procurementPlantIds.includes(user.plantId)) &&
        ['admin', 'manager', 'director'].includes(user?.role ?? '');
    const isCS1Director =
        Boolean(user?.plantId && procurementPlantIds.includes(user.plantId)) &&
        ['admin', 'director'].includes(user?.role ?? '');
    const userScope = `${user?.id ?? 'anonymous'}:${user?.role ?? ''}:${user?.plantId ?? ''}`;

    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<PurchaseOrderStatus | undefined>();
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [receivingId, setReceivingId] = useState<string | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportRange, setExportRange] = useState<any>([dayjs().startOf('month'), dayjs()]);

    const listParams = useMemo<PurchaseOrderQueryParams>(
        () => ({
            search: search || undefined,
            status: filterStatus,
            page,
            limit: DEFAULT_LIMIT,
        }),
        [search, filterStatus, page]
    );

    const {
        data: listResp,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['purchase-orders', userScope, listParams],
        queryFn: async () => normResp(await purchaseOrderService.getAll(listParams), page, DEFAULT_LIMIT),
        placeholderData: (p) => p,
        enabled: isCS1Manager,
    });

    const { data: detailRecord, isLoading: detailLoading } = useQuery({
        queryKey: ['purchase-order', selectedId, userScope],
        queryFn: () => purchaseOrderService.getById(selectedId!),
        enabled: isCS1Manager && Boolean(selectedId),
    });

    const { data: statsResp } = useQuery({
        queryKey: ['purchase-orders', 'stats', userScope],
        queryFn: async () => {
            const [all, draft, confirmed, ordered, partial, received] = await Promise.all([
                purchaseOrderService.getAll({ limit: 1 }),
                purchaseOrderService.getAll({ status: 'draft', limit: 1 }),
                purchaseOrderService.getAll({ status: 'confirmed', limit: 1 }),
                purchaseOrderService.getAll({ status: 'ordered', limit: 1 }),
                purchaseOrderService.getAll({ status: 'partially_received', limit: 1 }),
                purchaseOrderService.getAll({ status: 'received', limit: 1 }),
            ]);
            return {
                total: normResp(all, 1, 1).total,
                draft: normResp(draft, 1, 1).total,
                ordered: normResp(confirmed, 1, 1).total + normResp(ordered, 1, 1).total,
                partial: normResp(partial, 1, 1).total,
                received: normResp(received, 1, 1).total,
            };
        },
        placeholderData: (p) => p,
        enabled: isCS1Manager,
    });
    const stats = statsResp ?? { total: 0, draft: 0, ordered: 0, partial: 0, received: 0 };

    const invalidate = async (id?: string) => {
        await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        if (id) await queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    };

    const createMut = useMutation({ mutationFn: purchaseOrderService.create });
    const confirmMut = useMutation({ mutationFn: purchaseOrderService.confirm });
    const receiveMut = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: ReceivePurchaseOrderPayload }) =>
            purchaseOrderService.receive(id, payload),
    });
    const deleteMut = useMutation({ mutationFn: purchaseOrderService.remove });

    const handleCreate = async (purchaseRequestIds: string[], note: string) => {
        try {
            const po = await createMut.mutateAsync({ purchaseRequestIds, note: note || undefined });
            await invalidate();
            message.success('Đã tạo đơn hàng');
            setModalOpen(false);
            setSelectedId(po.id);
        } catch (e: any) {
            message.error(e?.message ?? 'Không thể tạo đơn hàng');
            throw e;
        }
    };

    const handleConfirm = async (id: string) => {
        try {
            setConfirmingId(id);
            await confirmMut.mutateAsync(id);
            await invalidate(id);
            message.success('Đã xác nhận đơn hàng');
        } catch (e: any) {
            message.error(e?.message ?? 'Lỗi');
        } finally {
            setConfirmingId(null);
        }
    };

    const handleExportRange = async () => {
        const [from, to] = exportRange ?? [];
        if (!from || !to) {
            message.warning('Chọn khoảng thời gian cần xuất');
            return;
        }
        setExporting(true);
        try {
            const startDate = from.format('YYYY-MM-DD');
            const endDate = to.format('YYYY-MM-DD');
            await purchaseOrderService.exportRangeXlsx({ startDate, endDate }, `dat-hang-${startDate}_${endDate}`);
            message.success('Đã xuất Excel tổng hợp đặt hàng');
            setExportOpen(false);
        } catch (e: any) {
            message.error(e?.message ?? 'Không có đơn nào trong khoảng này hoặc xuất thất bại');
        } finally {
            setExporting(false);
        }
    };

    const handleReceive = async (id: string, payload: ReceivePurchaseOrderPayload) => {
        try {
            setReceivingId(id);
            await receiveMut.mutateAsync({ id, payload });
            await invalidate(id);
            await queryClient.invalidateQueries({ queryKey: ['purchase-shortages'] });
            await queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            notification.success({
                title: 'Nhận hàng thành công!',
                description: 'Tồn kho cơ sở mua đã được cập nhật cho các vật tư đủ điều kiện.',
            });
        } catch (e: any) {
            message.error(e?.message ?? 'Lỗi');
        } finally {
            setReceivingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMut.mutateAsync(id);
            await invalidate();
            if (selectedId === id) setSelectedId(null);
            message.success('Đã huỷ đơn hàng');
        } catch (e: any) {
            message.error(e?.message ?? 'Lỗi');
        }
    };

    const handleExport = async (id: string, code: string) => {
        try {
            await purchaseOrderService.exportXlsx(id, code);
        } catch {
            message.error('Không thể xuất file Excel');
        }
    };

    const columns: TableColumnsType<PurchaseOrder> = [
        {
            title: 'MÃ ĐƠN',
            key: 'code',
            width: 180,
            render: (_: any, r: PurchaseOrder) => (
                <div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A3A5C', fontSize: 13 }}>
                        {r.orderCode}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>{(r.purchaseRequestCodes ?? []).length} phiếu ĐX</div>
                </div>
            ),
        },
        {
            title: 'VẬT TƯ',
            key: 'items',
            width: 80,
            align: 'center',
            render: (_: any, r: PurchaseOrder) => (
                <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} />
            ),
        },
        {
            title: 'NCC',
            key: 'suppliers',
            width: 180,
            render: (_: any, r: PurchaseOrder) => {
                const names = [...new Set(r.items.map((i) => i.supplierName).filter(Boolean))];
                const shown = names.slice(0, 2);
                return (
                    <Space size={2} wrap>
                        {shown.map((n) => (
                            <Tag key={n} style={{ fontSize: 11 }}>
                                {n}
                            </Tag>
                        ))}
                        {names.length > 2 && <Tag>+{names.length - 2}</Tag>}
                    </Space>
                );
            },
        },
        {
            title: 'TỔNG TIỀN',
            key: 'total',
            width: 150,
            align: 'right',
            render: (_: any, r: PurchaseOrder) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#1A3A5C' }}>{fmtVND(r.totalWithVat)}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>đã gồm VAT</div>
                </div>
            ),
        },
        {
            title: 'NGÀY TẠO',
            dataIndex: 'createdAt',
            key: 'date',
            width: 100,
            render: (v: string) => <span style={{ color: '#555', fontSize: 13 }}>{fmtDate(v)}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (s: string) => {
                const m = STATUS_META[s];
                return m ? (
                    <Tag color={m.color} icon={m.icon}>
                        {m.label}
                    </Tag>
                ) : (
                    <Tag>{s}</Tag>
                );
            },
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 140,
            fixed: 'right' as const,
            align: 'right' as const,
            render: (_: any, r: PurchaseOrder) => (
                <Space size={2}>
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            size='small'
                            icon={<DownloadOutlined style={{ display: 'none' }} />}
                            style={{ color: '#0284c7' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(r.id);
                            }}
                        >
                            <span style={{ fontSize: 12 }}>Xem</span>
                        </Button>
                    </Tooltip>
                    <Tooltip title='Xuất Excel'>
                        <Button
                            type='text'
                            size='small'
                            icon={<FileExcelOutlined />}
                            style={{ color: '#16a34a' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleExport(r.id, r.orderCode ?? r.id);
                            }}
                        />
                    </Tooltip>
                    {r.status === 'draft' && isCS1Director && (
                        <Tooltip title='Xác nhận đặt hàng'>
                            <ConfirmAction
                                intent='primary'
                                title='Xác nhận đặt hàng?'
                                description={`${r.orderCode} sẽ chuyển sang trạng thái Đang đặt hàng.`}
                                okLabel='Xác nhận đặt hàng'
                                onConfirm={() => handleConfirm(r.id)}
                            >
                                <Button
                                    type='text'
                                    size='small'
                                    icon={<CheckOutlined />}
                                    style={{ color: '#1A3A5C' }}
                                />
                            </ConfirmAction>
                        </Tooltip>
                    )}
                    {['confirmed', 'ordered', 'partially_received'].includes(r.status) && isCS1Director && (
                        <Tooltip title='Nhập nhận hàng'>
                            <ConfirmAction
                                intent='primary'
                                title='Mở form nhận hàng?'
                                description='Mở chi tiết để nhập số lượng thực nhận.'
                                okLabel='Mở chi tiết'
                                onConfirm={() => setSelectedId(r.id)}
                            >
                                <Button
                                    type='text'
                                    size='small'
                                    icon={<InboxOutlined />}
                                    style={{ color: '#0284c7' }}
                                />
                            </ConfirmAction>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    if (!isCS1Manager) return <Navigate to='/' replace />;

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Đơn đặt hàng'
                subtitle='Quản lý đơn đặt hàng vật tư từ các phiếu đề xuất đã duyệt.'
                actions={
                    <Space>
                        <Button icon={<FileExcelOutlined />} onClick={() => setExportOpen(true)}>
                            Xuất Excel
                        </Button>
                        <Button
                            type='primary'
                            icon={<PlusOutlined />}
                            style={{ background: '#1A3A5C' }}
                            onClick={() => setModalOpen(true)}
                        >
                            Tạo đơn hàng
                        </Button>
                    </Space>
                }
            />

            <Modal
                open={exportOpen}
                title='Xuất Excel tổng hợp đặt hàng'
                okText='Xuất file'
                cancelText='Huỷ'
                confirmLoading={exporting}
                onOk={handleExportRange}
                onCancel={() => setExportOpen(false)}
                width={480}
            >
                <div className='flex flex-col gap-3 py-2'>
                    <Text type='secondary' className='text-xs'>
                        Chọn khoảng thời gian (theo ngày tạo đơn). File gồm 4 sheet: Tổng quan · Danh sách đơn ·
                        Chi tiết vật tư · Sổ nợ hàng NCC.
                    </Text>
                    <DatePicker.RangePicker
                        className='w-full'
                        value={exportRange}
                        format='DD/MM/YYYY'
                        onChange={(value) => setExportRange(value)}
                        presets={[
                            { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
                            {
                                label: 'Tháng trước',
                                value: [
                                    dayjs().subtract(1, 'month').startOf('month'),
                                    dayjs().subtract(1, 'month').endOf('month'),
                                ],
                            },
                            {
                                label: '3 tháng gần nhất',
                                value: [dayjs().subtract(2, 'month').startOf('month'), dayjs()],
                            },
                            { label: 'Năm nay', value: [dayjs().startOf('year'), dayjs()] },
                        ]}
                    />
                </div>
            </Modal>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                    { label: 'Tổng đơn', value: stats.total, color: '#1A3A5C', icon: null },
                    { label: 'Bản nháp', value: stats.draft, color: '#888', icon: null },
                    { label: 'Đang đặt hàng', value: stats.ordered, color: '#FA8C16', icon: <ShoppingOutlined /> },
                    { label: 'Nhận một phần', value: stats.partial, color: '#0891b2', icon: <InboxOutlined /> },
                    { label: 'Đã nhận hàng', value: stats.received, color: '#52C41A', icon: <CheckCircleOutlined /> },
                ].map(({ label, value, color, icon }) => (
                    <Card
                        key={label}
                        style={{
                            borderRadius: 8,
                            border: '1px solid #F0F0F0',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}
                        styles={{ body: { padding: '16px 20px' } }}
                    >
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
            <div className='flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <Input.Search
                    placeholder='Tìm mã đơn...'
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(v) => {
                        setSearch(v);
                        setPage(1);
                    }}
                    onChange={(e) => !e.target.value && setSearch('')}
                />
                <Select
                    allowClear
                    placeholder='Trạng thái'
                    style={{ width: 160 }}
                    options={STATUS_OPTIONS}
                    value={filterStatus}
                    onChange={(v) => {
                        setFilterStatus(v as PurchaseOrderStatus);
                        setPage(1);
                    }}
                />
                <Button
                    onClick={() => {
                        setSearch('');
                        setFilterStatus(undefined);
                        setPage(1);
                    }}
                >
                    Xoá lọc
                </Button>
            </div>

            {/* Table */}
            <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <Table<PurchaseOrder>
                    rowKey='id'
                    columns={columns}
                    dataSource={listResp?.data ?? []}
                    loading={isLoading || isFetching}
                    size='middle'
                    scroll={{ x: 900 }}
                    locale={{
                        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có đơn hàng' />,
                    }}
                    rowClassName={() => 'cursor-pointer'}
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

            <ModalCreate
                open={modalOpen}
                submitting={createMut.isPending}
                onClose={() => setModalOpen(false)}
                onCreate={handleCreate}
            />

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
