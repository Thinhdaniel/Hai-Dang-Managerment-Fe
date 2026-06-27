import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    AutoComplete,
    Badge,
    Button,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Grid,
    Input,
    InputNumber,
    Modal,
    Select,
    Steps,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';

const { useBreakpoint } = Grid;
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    FileTextOutlined,
    FilterOutlined,
    InboxOutlined,
    MessageOutlined,
    PlusOutlined,
    ReloadOutlined,
    RightOutlined,
    RobotOutlined,
    SearchOutlined,
    SendOutlined,
    SyncOutlined,
    UploadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import SupplyCompensationModal from '../components/SupplyCompensationModal';
import ContextChatDrawer from '../components/chat/ContextChatDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { api } from '../core/lib/api';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService } from '../core/services';
import {
    aiMaterialMatchService,
    aiOcrService,
    type AiMaterialMatchItem,
} from '../core/services/ai-help.service';
import type {
    PurchaseRequest,
    PurchaseRequestPayload,
    PurchaseRequestQueryParams,
    PurchaseRequestStatus,
} from '../core/services/material.service';
import { distributionService, supplyRequestService, supplyShortageService } from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;

type SupplyRequestTab = 'mine' | 'pending' | 'all';
type DateRangeValue = [Dayjs, Dayjs];
type FilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    startDate?: string;
    endDate?: string;
};
type DraftFilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    dateRange: DateRangeValue | null;
};
type FormItemValue = { materialName?: string; unit?: string; quantityRequested?: number; note?: string };
type FormValues = { fromPlantId?: string; note?: string; requestDate?: any; items: FormItemValue[] };
type ScanReviewState = {
    fileName: string;
    count: number;
    strong: number;
    needsConfirm: number;
    unmatched: number;
    plantName?: string;
    requesterName?: string;
    requestDate?: string;
    provider?: string;
    model?: string;
    usedFallback?: boolean;
};
type Stats = {
    total: number;
    pending: number;
    approved: number;
    in_progress: number;
    partially_distributed: number;
    distributed: number;
    rejected: number;
};

const STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pending: { color: 'orange', label: 'Chờ duyệt', icon: <ClockCircleOutlined /> },
    approved: { color: 'blue', label: 'Đã duyệt', icon: <CheckCircleOutlined /> },
    in_progress: { color: 'cyan', label: 'Đang cấp phát', icon: <SyncOutlined spin /> },
    partially_distributed: { color: 'gold', label: 'Cấp thiếu', icon: <WarningOutlined /> },
    distributed: { color: 'green', label: 'Đã nhận hàng', icon: <CheckCircleOutlined /> },
    rejected: { color: 'red', label: 'Từ chối', icon: <CloseCircleOutlined /> },
    cancelled: { color: 'default', label: 'Đã hủy', icon: <CloseCircleOutlined /> },
};

const STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus; label: string }> = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'in_progress' as PurchaseRequestStatus, label: 'Đang cấp phát' },
    { value: 'partially_distributed' as PurchaseRequestStatus, label: 'Cấp thiếu' },
    { value: 'distributed', label: 'Đã nhận hàng' },
    { value: 'rejected', label: 'Từ chối' },
];

const WORKFLOW_STEPS = [
    { title: 'Tạo phiếu', status: 'pending' },
    { title: 'Duyệt', status: 'approved' },
    { title: 'Cấp phát', status: 'in_progress' },
    { title: 'Cấp bù', status: 'partially_distributed' },
    { title: 'Nhận hàng', status: 'distributed' },
];

const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
const fmtDateTime = (v?: string) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
const resolveUser = (v?: string | User) => {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    return (v as any).name || (v as any).email || '—';
};
const normalizeText = (v?: string | null) => {
    const s = (v || '').trim().replace(/\s+/g, ' ');
    return s || undefined;
};
const resolveError = (e: unknown, fb: string) =>
    e && typeof e === 'object' && 'message' in e ? String((e as any).message) : fb;
const parseNum = (v: string | number | null | undefined) => {
    const n = String(v ?? '').replace(/[^\d.-]/g, '');
    return n ? Number(n) : 0;
};
const normalizePaginated = <T,>(res: T[] | PaginatedResponse<T>, page: number, limit: number): PaginatedResponse<T> => {
    if (Array.isArray(res)) {
        const total = res.length;
        const tp = Math.max(1, Math.ceil(total / limit));
        const sp = Math.min(page, tp);
        return { data: res.slice((sp - 1) * limit, sp * limit), total, page: sp, limit, totalPages: tp };
    }
    return res;
};
const getWorkflowStep = (status: string) => {
    if (status === 'rejected' || status === 'cancelled') return -1;
    const i = WORKFLOW_STEPS.findIndex((s) => s.status === status);
    return i === -1 ? 0 : i;
};
const emptyItem = (): FormItemValue => ({ materialName: '', unit: '', quantityRequested: 1, note: '' });

// Đơn vị tính thông dụng -> gợi ý trong ô ĐVT để khỏi gõ tay (vẫn cho nhập tự do)
const COMMON_UNITS = [
    'Cái',
    'Chiếc',
    'Bộ',
    'Đôi',
    'Kg',
    'Gram',
    'Tấn',
    'Mét',
    'Cuộn',
    'Tấm',
    'Hộp',
    'Thùng',
    'Bao',
    'Bó',
    'Gói',
    'Túi',
    'Lít',
    'Can',
    'Bình',
    'Lọ',
    'Chai',
    'Ống',
    'Viên',
    'Cây',
];
const UNIT_OPTIONS = COMMON_UNITS.map((u) => ({ value: u }));

// ── StatusTag ─────────────────────────────────────────────────────────────────
const StatusTag: React.FC<{ status: string }> = ({ status }) => {
    const m = STATUS_META[status] ?? { color: 'default', label: status, icon: null };
    return (
        <Tag color={m.color} icon={m.icon} style={{ margin: 0 }}>
            {m.label}
        </Tag>
    );
};

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    active?: boolean;
    onClick?: () => void;
}> = ({ title, value, icon, color, active, onClick }) => (
    <div
        onClick={onClick}
        className={[
            'flex cursor-pointer items-center gap-2.5 rounded-2xl border p-3 transition-all active:scale-[0.98]',
            active ? 'shadow-sm' : 'border-slate-200 bg-white hover:shadow-md',
        ].join(' ')}
        style={active ? { borderColor: color, backgroundColor: `${color}12` } : undefined}
    >
        <div
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base'
            style={{ background: `${color}18`, color }}
        >
            {icon}
        </div>
        <div className='min-w-0 flex-1'>
            <div className='truncate text-[10px] font-semibold tracking-wide text-slate-400 uppercase'>{title}</div>
            <div className='text-xl leading-tight font-bold sm:text-2xl' style={{ color }}>
                {fmtNum(value)}
            </div>
        </div>
    </div>
);

// ── FormDrawer ────────────────────────────────────────────────────────────────
const FormDrawer: React.FC<{
    open: boolean;
    initialValues?: PurchaseRequest | null;
    defaultPlantId?: string;
    defaultPlantName?: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: Partial<PurchaseRequestPayload>) => Promise<void>;
}> = ({ open, initialValues, defaultPlantId, defaultPlantName, submitting, onClose, onSubmit }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm<FormValues>();
    const scanInputRef = useRef<HTMLInputElement | null>(null);
    const itemListRef = useRef<HTMLDivElement | null>(null);
    const watchedItems: FormItemValue[] = Form.useWatch('items', form) ?? [];
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const [scanningSupply, setScanningSupply] = useState(false);
    const [scanReview, setScanReview] = useState<ScanReviewState | null>(null);
    const [scanMatchesByIndex, setScanMatchesByIndex] = useState<Record<number, AiMaterialMatchItem>>({});

    useEffect(() => {
        if (!open) return;
        setScanReview(null);
        setScanMatchesByIndex({});
        if (initialValues) {
            form.setFieldsValue({
                fromPlantId: initialValues.fromPlantId,
                note: initialValues.note,
                requestDate: initialValues.requestDate ? dayjs(initialValues.requestDate) : dayjs(),
                items: initialValues.items.map((i) => ({
                    materialName: i.materialName || '',
                    unit: i.unit || '',
                    quantityRequested: i.quantityRequested,
                    note: i.note,
                })),
            });
        } else {
            form.resetFields();
            form.setFieldsValue({ fromPlantId: defaultPlantId, requestDate: dayjs(), items: [emptyItem()] });
        }
    }, [open, initialValues, defaultPlantId, form]);

    const clearScanHints = () => {
        setScanReview(null);
        setScanMatchesByIndex({});
    };

    const matchTone = (match?: AiMaterialMatchItem) => {
        if (!match) return { color: 'default', label: 'Chưa kiểm tra' };
        if (match.status === 'matched' && match.confidence >= 92) return { color: 'green', label: 'Đã khớp chắc' };
        if (match.status === 'unmatched') return { color: 'red', label: 'Chưa có danh mục' };
        return { color: 'orange', label: 'Cần xác nhận' };
    };

    const handleScanSupplyFile = async (file?: File) => {
        if (!file) return;
        setScanningSupply(true);
        setScanReview(null);
        setScanMatchesByIndex({});
        try {
            const result = await aiOcrService.scanSupplyRequest(file);
            if (!result.items.length) {
                message.warning('Chưa đọc được dòng vật tư nào từ phiếu');
                return;
            }

            const currentItems = (form.getFieldValue('items') ?? []) as FormItemValue[];
            const meaningfulItems = currentItems.filter(
                (item) =>
                    String(item.materialName ?? '').trim() ||
                    String(item.unit ?? '').trim() ||
                    Number(item.quantityRequested ?? 1) > 1 ||
                    String(item.note ?? '').trim()
            );
            const scannedItems = result.items.map((item) => ({
                materialName: item.materialName,
                unit: item.unit ?? '',
                quantityRequested:
                    item.quantityRequested && Number(item.quantityRequested) > 0
                        ? Number(item.quantityRequested)
                        : 1,
                note: [item.purpose, item.note].filter(Boolean).join(' · '),
            }));
            const offset = meaningfulItems.length;
            const requestDate = result.header?.requestDate ? dayjs(result.header.requestDate) : undefined;
            const noteFromOcr = normalizeText([result.header?.purpose, result.header?.note].filter(Boolean).join(' · '));

            form.setFieldsValue({
                requestDate: requestDate?.isValid() ? requestDate : form.getFieldValue('requestDate') || dayjs(),
                note: form.getFieldValue('note') || noteFromOcr,
                items: meaningfulItems.length ? [...meaningfulItems, ...scannedItems] : scannedItems,
            });

            let strong = 0;
            let needsConfirm = 0;
            let unmatched = 0;
            try {
                const match = await aiMaterialMatchService.match(
                    scannedItems.map((item, index) => ({
                        key: `supply-scan-${index}`,
                        materialName: item.materialName ?? '',
                        unit: item.unit,
                        note: item.note,
                    }))
                );
                const byIndex: Record<number, AiMaterialMatchItem> = {};
                match.items.forEach((item, index) => {
                    byIndex[offset + index] = item;
                    if (item.status === 'matched' && item.confidence >= 92) strong += 1;
                    else if (item.status === 'unmatched') unmatched += 1;
                    else needsConfirm += 1;
                });
                setScanMatchesByIndex(byIndex);
            } catch {
                needsConfirm = scannedItems.length;
            }

            setScanReview({
                fileName: file.name,
                count: scannedItems.length,
                strong,
                needsConfirm,
                unmatched,
                plantName: result.header?.plantName,
                requesterName: result.header?.requesterName,
                requestDate: result.header?.requestDate,
                provider: result.provider,
                model: result.model,
                usedFallback: result.usedFallback,
            });
            if (isMobile) {
                window.setTimeout(() => {
                    itemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            }
            message.success(`Đã quét ${scannedItems.length} dòng vật tư. Kiểm tra lại trước khi gửi.`);
        } catch {
            message.error('Không quét được phiếu. Hãy dùng ảnh rõ nét JPG/PNG/WebP và thử lại.');
        } finally {
            setScanningSupply(false);
            if (scanInputRef.current) scanInputRef.current.value = '';
        }
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        await onSubmit({
            fromPlantId: String(values.fromPlantId),
            note: normalizeText(values.note),
            requestDate: values.requestDate?.toISOString(),
            items: (values.items ?? []).map((i) => ({
                materialName: String(i.materialName ?? '').trim(),
                unit: String(i.unit ?? '').trim(),
                quantityRequested: Number(i.quantityRequested ?? 0),
                note: normalizeText(i.note),
            })) as any,
        });
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={isMobile ? '100%' : 760}
            destroyOnHidden
            maskClosable={false}
            styles={{
                header: { borderBottom: '1px solid #f1f5f9' },
                body: {
                    padding: 0,
                    paddingBottom: isMobile ? 112 : 0,
                    display: isMobile ? 'block' : 'flex',
                    flexDirection: 'column',
                    overflow: isMobile ? 'auto' : 'hidden',
                    background: '#f8fafc',
                },
            }}
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600'>
                        <SendOutlined />
                    </div>
                    <div>
                        <div className='font-semibold text-slate-900'>
                            {initialValues ? 'Cập nhật đề xuất' : 'Tạo đề xuất cấp vật tư'}
                        </div>
                        <div className='text-xs text-slate-400'>Gửi yêu cầu cấp vật tư từ cơ sở</div>
                    </div>
                </div>
            }
            footer={
                <div className={isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-3'}>
                    {!isMobile && (
                        <Text type='secondary' className='text-sm'>
                            Tổng <strong className='text-slate-700'>{watchedItems.length}</strong> loại vật tư
                        </Text>
                    )}
                    <div className={isMobile ? 'flex flex-col-reverse gap-2' : 'flex gap-2'}>
                        <Button onClick={onClose} block={isMobile}>
                            Huỷ
                        </Button>
                        <Button
                            type='primary'
                            loading={submitting}
                            onClick={handleSubmit}
                            disabled={!watchedItems.length}
                            icon={<SendOutlined />}
                            block={isMobile}
                        >
                            {initialValues ? 'Lưu cập nhật' : 'Gửi đề xuất'}
                        </Button>
                    </div>
                </div>
            }
        >
            <Form
                form={form}
                layout='vertical'
                className={isMobile ? 'min-h-full pb-4' : 'flex h-full min-h-0 flex-col'}
            >
                {/* Thông tin chung */}
                <div className='shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5'>
                    <div className='mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700'>
                        <FileTextOutlined className='text-blue-500' /> Thông tin chung
                    </div>
                    <div className='grid grid-cols-2 gap-3 sm:gap-4'>
                        <Form.Item label='Cơ sở gửi' className='col-span-2 mb-0 sm:col-span-1'>
                            <Input
                                value={defaultPlantName || '—'}
                                readOnly
                                size='large'
                                className='cursor-default bg-slate-50 font-medium text-slate-700'
                            />
                        </Form.Item>
                        <Form.Item name='fromPlantId' hidden>
                            <Input />
                        </Form.Item>
                        <Form.Item
                            name='requestDate'
                            label='Ngày đề xuất'
                            className='col-span-2 mb-0 sm:col-span-1'
                            rules={[{ required: true, message: 'Chọn ngày' }]}
                        >
                            <DatePicker format='DD/MM/YYYY' className='w-full' size='large' inputReadOnly={isMobile} />
                        </Form.Item>
                        <Form.Item
                            name='note'
                            label='Lý do / Mục đích'
                            className='col-span-2 mb-0'
                            rules={[
                                { required: true, message: 'Vui lòng nhập lý do' },
                                { min: 10, message: 'Tối thiểu 10 ký tự' },
                            ]}
                        >
                            <Input.TextArea
                                rows={2}
                                maxLength={500}
                                showCount
                                placeholder='Ghi rõ lý do cần cấp và mục đích sử dụng...'
                            />
                        </Form.Item>
                    </div>
                </div>

                {!initialValues && (
                    <div className='shrink-0 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-white px-4 py-3 sm:px-6'>
                        <input
                            ref={scanInputRef}
                            type='file'
                            accept='.jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif'
                            className='hidden'
                            style={{ display: 'none' }}
                            tabIndex={-1}
                            onChange={(event) => {
                                void handleScanSupplyFile(event.target.files?.[0]);
                            }}
                        />
                        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                            <div className='flex min-w-0 items-start gap-3'>
                                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100'>
                                    <RobotOutlined />
                                </div>
                                <div className='min-w-0'>
                                    <div className='font-semibold text-slate-900'>AI quét phiếu đề xuất cấp</div>
                                    <div className='text-xs text-slate-500'>
                                        Đọc ảnh phiếu giấy rồi điền vào danh sách để kiểm tra trước khi gửi.
                                    </div>
                                </div>
                            </div>
                            <Button
                                icon={<UploadOutlined />}
                                loading={scanningSupply}
                                onClick={() => scanInputRef.current?.click()}
                                className='border-blue-200 bg-white text-blue-700 shadow-sm hover:!border-blue-300 hover:!text-blue-800'
                                block={isMobile}
                            >
                                Quét ảnh phiếu
                            </Button>
                        </div>
                        {scanReview && (
                            <Alert
                                className='mt-3 rounded-2xl border-blue-100 bg-white/80'
                                type={
                                    scanReview.unmatched ||
                                    scanReview.needsConfirm ||
                                    (scanReview.plantName &&
                                        defaultPlantName &&
                                        normalizeSearchTerm(scanReview.plantName) !== normalizeSearchTerm(defaultPlantName))
                                        ? 'warning'
                                        : 'success'
                                }
                                showIcon
                                message={
                                    <span className='font-semibold'>
                                        Đã đọc {scanReview.count} dòng từ {scanReview.fileName}
                                    </span>
                                }
                                description={
                                    <div className='space-y-1 text-sm'>
                                        <div>
                                            {[
                                                scanReview.strong ? `${scanReview.strong} dòng khớp chắc` : '',
                                                scanReview.needsConfirm ? `${scanReview.needsConfirm} dòng cần xác nhận` : '',
                                                scanReview.unmatched
                                                    ? `${scanReview.unmatched} dòng chưa có trong danh mục`
                                                    : '',
                                                scanReview.usedFallback
                                                    ? 'AI/provider chưa khả dụng, cần kiểm tra thủ công kỹ hơn.'
                                                    : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </div>
                                        {(scanReview.plantName || scanReview.requesterName || scanReview.requestDate) && (
                                            <div className='text-slate-500'>
                                                {scanReview.plantName ? `Phiếu ghi cơ sở: ${scanReview.plantName}. ` : ''}
                                                {scanReview.requesterName ? `Người nhận: ${scanReview.requesterName}. ` : ''}
                                                {scanReview.requestDate ? `Ngày phiếu: ${dayjs(scanReview.requestDate).format('DD/MM/YYYY')}. ` : ''}
                                                Form vẫn dùng cơ sở tài khoản: {defaultPlantName || 'chưa rõ'}.
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        )}
                    </div>
                )}

                {/* Danh sách vật tư */}
                <Form.List name='items'>
                    {(fields, { add, remove }) => (
                        <div ref={itemListRef} className='flex min-h-0 flex-1 flex-col'>
                            <div className='flex shrink-0 items-center justify-between px-4 pt-4 pb-2 sm:px-6'>
                                <div className='flex items-center gap-2 text-sm font-semibold text-slate-700'>
                                    <InboxOutlined className='text-blue-500' /> Danh sách vật tư
                                    <Tag color='blue' className='m-0'>
                                        {fields.length}
                                    </Tag>
                                </div>
                                <Button
                                    type='link'
                                    size='small'
                                    icon={<PlusOutlined />}
                                    onClick={() => {
                                        clearScanHints();
                                        add(emptyItem());
                                    }}
                                    className='px-0'
                                >
                                    Thêm
                                </Button>
                            </div>

                            <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 sm:px-6'>
                                {fields.length === 0 && (
                                    <div className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-slate-400'>
                                        <InboxOutlined style={{ fontSize: 32 }} />
                                        <span className='text-sm'>Chưa có vật tư nào</span>
                                        <Button
                                            type='primary'
                                            ghost
                                            icon={<PlusOutlined />}
                                            onClick={() => {
                                                clearScanHints();
                                                add(emptyItem());
                                            }}
                                        >
                                            Thêm vật tư đầu tiên
                                        </Button>
                                    </div>
                                )}

                                {fields.map((field, index) => {
                                    const match = scanMatchesByIndex[index];
                                    const tone = matchTone(match);
                                    const candidate = match?.candidate;

                                    return (
                                        <div
                                            key={field.key}
                                            className='rounded-2xl border border-slate-200 bg-white p-3.5 transition-all hover:border-blue-300 hover:shadow-sm sm:p-4'
                                        >
                                        <div className='mb-2.5 flex items-center justify-between'>
                                            <span className='inline-flex h-6 min-w-[30px] items-center justify-center rounded-lg bg-blue-50 px-2 text-xs font-bold text-blue-600'>
                                                #{index + 1}
                                            </span>
                                            <Tooltip title='Xoá vật tư này'>
                                                <Button
                                                    type='text'
                                                    danger
                                                    size='small'
                                                    disabled={fields.length === 1}
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => {
                                                        clearScanHints();
                                                        remove(field.name);
                                                    }}
                                                />
                                            </Tooltip>
                                        </div>
                                        {match && (
                                            <div className='mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2'>
                                                <div className='flex flex-wrap items-center gap-2'>
                                                    <Tag color={tone.color} className='m-0 font-semibold'>
                                                        {tone.label} · {match.confidence}%
                                                    </Tag>
                                                    <span className='min-w-0 flex-1 truncate text-xs font-medium text-slate-600'>
                                                        {candidate
                                                            ? `${candidate.code} · ${candidate.name}`
                                                            : match.reason}
                                                    </span>
                                                </div>
                                                {match.warnings?.length > 0 && (
                                                    <div className='mt-1 text-xs text-orange-600'>
                                                        {match.warnings[0]}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <Form.Item
                                            name={[field.name, 'materialName']}
                                            label='Tên vật tư'
                                            className='mb-3'
                                            rules={[{ required: true, message: 'Nhập tên vật tư' }]}
                                        >
                                            <Input
                                                placeholder='VD: Vải cotton, Chỉ may, Kim máy...'
                                                maxLength={200}
                                                size='large'
                                                allowClear
                                            />
                                        </Form.Item>
                                        <div className='grid grid-cols-2 gap-3 sm:grid-cols-[150px_150px_minmax(0,1fr)]'>
                                            <Form.Item
                                                name={[field.name, 'unit']}
                                                label='Đơn vị tính'
                                                className='mb-0'
                                                rules={[{ required: true, message: 'Nhập ĐVT' }]}
                                            >
                                                <AutoComplete
                                                    options={UNIT_OPTIONS}
                                                    placeholder='Cái, Kg, Mét...'
                                                    size='large'
                                                    allowClear
                                                    filterOption={(input, option) =>
                                                        normalizeSearchTerm(String(option?.value ?? '')).includes(
                                                            normalizeSearchTerm(input)
                                                        )
                                                    }
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'quantityRequested']}
                                                label='Số lượng'
                                                className='mb-0'
                                                rules={[{ required: true, message: 'Nhập SL' }]}
                                            >
                                                <InputNumber<number>
                                                    min={1}
                                                    className='w-full'
                                                    size='large'
                                                    formatter={(v) =>
                                                        `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                    }
                                                    parser={parseNum}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'note']}
                                                label='Ghi chú'
                                                className='col-span-2 mb-0 sm:col-span-1'
                                            >
                                                <Input
                                                    placeholder='Quy cách, màu sắc... (nếu có)'
                                                    maxLength={250}
                                                    size='large'
                                                />
                                            </Form.Item>
                                        </div>
                                    </div>
                                    );
                                })}

                                {fields.length > 0 && (
                                    <Button
                                        type='dashed'
                                        block
                                        icon={<PlusOutlined />}
                                        onClick={() => {
                                            clearScanHints();
                                            add(emptyItem());
                                        }}
                                        className='h-11'
                                    >
                                        Thêm vật tư
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </Form.List>
            </Form>
        </Drawer>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const SupplyRequestPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const screens = useBreakpoint();
    const isMobile = !screens.sm;

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID;
    const isMainPlant = Boolean(mainPlantId && user?.plantId === mainPlantId);
    const isCS1Manager = isMainPlant && ['admin', 'manager', 'director'].includes(user?.role ?? '');

    const queryStatus = STATUS_OPTIONS.find((o) => o.value === searchParams.get('status'))?.value;

    const [activeTab, setActiveTab] = useState<SupplyRequestTab>(() =>
        queryStatus === 'pending' ? 'pending' : 'mine'
    );
    const [filters, setFilters] = useState<FilterState>({
        search: '',
        fromPlantId: undefined,
        status: queryStatus !== 'pending' ? queryStatus : undefined,
    });
    const [draft, setDraft] = useState<DraftFilterState>({
        search: '',
        fromPlantId: undefined,
        status: queryStatus !== 'pending' ? queryStatus : undefined,
        dateRange: null,
    });
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [compensationOpen, setCompensationOpen] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [approvalQty, setApprovalQty] = useState<Record<number, number>>({});

    // Debounce search
    useEffect(() => {
        const t = window.setTimeout(() => {
            const n = normalizeSearchTerm(draft.search);
            setFilters((c) => ({ ...c, search: n }));
            setPagination((c) => ({ ...c, page: DEFAULT_PAGE }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draft.search]);

    // Deep-link từ chat "Mở phiếu": ?request=<id> → mở drawer chi tiết rồi gỡ param khỏi URL
    const deepLinkId = searchParams.get('request');
    useEffect(() => {
        if (!deepLinkId) return;
        setSelectedId(deepLinkId);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('request');
                return next;
            },
            { replace: true }
        );
    }, [deepLinkId, setSearchParams]);

    const listParams = useMemo<PurchaseRequestQueryParams>(
        () => ({
            search: filters.search || undefined,
            fromPlantId: activeTab === 'mine' && !isCS1Manager ? user?.plantId : filters.fromPlantId,
            requestedBy: activeTab === 'mine' && isCS1Manager ? user?.id : undefined,
            status: activeTab === 'pending' ? 'pending' : filters.status,
            startDate: filters.startDate,
            endDate: filters.endDate,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [activeTab, filters, pagination, user, isCS1Manager]
    );

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60_000,
    });

    const {
        data: listRes,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['supply-requests', listParams],
        queryFn: async () =>
            normalizePaginated(await supplyRequestService.getAll(listParams), listParams.page!, listParams.limit!),
        placeholderData: (p) => p,
    });

    const { data: statsRes } = useQuery({
        queryKey: ['supply-requests', 'stats'],
        queryFn: () => supplyRequestService.getAll({ page: 1, limit: 500 }),
        enabled: isCS1Manager,
        staleTime: 60_000,
    });

    const requests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.data ?? [];
    const totalRequests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.total ?? 0;
    const selectedInList = requests.find((r) => r.id === selectedId) ?? null;

    // Phiếu mở từ deep-link có thể không nằm trong trang danh sách hiện tại — fetch riêng theo id
    const { data: fallbackRequest } = useQuery({
        queryKey: ['supply-requests', 'detail', selectedId],
        queryFn: () => supplyRequestService.getById(selectedId!),
        enabled: Boolean(selectedId) && !selectedInList,
    });
    const selectedRequest =
        selectedInList ?? (fallbackRequest && fallbackRequest.id === selectedId ? fallbackRequest : null);

    const stats = useMemo<Stats>(() => {
        const base: Stats = {
            total: 0,
            pending: 0,
            approved: 0,
            in_progress: 0,
            partially_distributed: 0,
            distributed: 0,
            rejected: 0,
        };
        if (!statsRes) return base;
        const items: PurchaseRequest[] = Array.isArray(statsRes) ? statsRes : ((statsRes as any).data ?? []);
        const total = Array.isArray(statsRes) ? items.length : ((statsRes as any).total ?? 0);
        return items.reduce(
            (acc, r) => {
                if (r.status === 'pending') acc.pending++;
                if (r.status === 'approved') acc.approved++;
                if ((r.status as string) === 'in_progress') acc.in_progress++;
                if ((r.status as string) === 'partially_distributed') acc.partially_distributed++;
                if (r.status === 'distributed') acc.distributed++;
                if (r.status === 'rejected') acc.rejected++;
                return acc;
            },
            { ...base, total }
        );
    }, [statsRes]);

    // Linked distribution for in_progress requests
    const isInProgress = ['in_progress', 'partially_distributed'].includes(String(selectedRequest?.status));
    const { data: linkedDistRes } = useQuery({
        queryKey: ['distributions', 'by-sr', selectedId],
        queryFn: () => distributionService.getAll({ supplyRequestId: selectedId!, limit: 1, page: 1 }),
        enabled: !!selectedId && isInProgress,
    });
    const linkedDist = useMemo(() => {
        if (!linkedDistRes) return null;
        const items = Array.isArray(linkedDistRes) ? linkedDistRes : ((linkedDistRes as any).data ?? []);
        return items[0] ?? null;
    }, [linkedDistRes]);

    // Vật tư còn thiếu của phiếu đề xuất đang chọn → dùng cho luồng cấp bù
    const isPartiallyDistributed = String(selectedRequest?.status) === 'partially_distributed';
    const { data: shortageRes } = useQuery({
        queryKey: ['materials', 'supply-shortages', selectedId],
        queryFn: () =>
            supplyShortageService
                .getAll({ originalSupplyRequestId: selectedId!, limit: 100 })
                .then((res) => (Array.isArray(res) ? res : (res.data ?? []))),
        enabled: !!selectedId && isPartiallyDistributed,
    });
    const openShortages = useMemo(
        () =>
            (shortageRes ?? []).filter(
                (item: any) =>
                    ['outstanding', 'partially_settled'].includes(String(item.status)) &&
                    Number(item.quantityOutstanding ?? 0) > 0
            ),
        [shortageRes]
    );

    const resolveId = (v: any): string | undefined => (v && typeof v === 'object' ? (v.id ?? String(v._id ?? '')) : v);
    const canConfirm =
        isInProgress &&
        linkedDist?.status === 'distributed' &&
        (isCS1Manager || resolveId(selectedRequest?.fromPlantId) === user?.plantId);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const { mutateAsync: createReq, isPending: isCreating } = useMutation({
        mutationFn: supplyRequestService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            message.success('Tạo phiếu đề xuất thành công');
            setFormOpen(false);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể tạo phiếu')),
    });

    const { mutateAsync: approveReq } = useMutation({
        mutationFn: ({
            id,
            payload,
        }: {
            id: string;
            payload: { items: Array<{ materialId: string; quantityApproved: number }> };
        }) => supplyRequestService.approve(id, payload),
        onSuccess: (approved) => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            setApprovingId(null);
            setSelectedId(null);
            navigate('/materials/distributions', {
                state: { supplyRequestId: approved.id, fromPlantId: mainPlantId, toPlantId: approved.fromPlantId },
            });
        },
        onError: (e) => {
            setApprovingId(null);
            message.error(resolveError(e, 'Không thể duyệt phiếu'));
        },
    });

    const { mutateAsync: rejectReq, isPending: isRejecting } = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => supplyRequestService.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            message.success('Đã từ chối phiếu');
            setRejectTarget(null);
            setRejectReason('');
        },
        onError: (e) => message.error(resolveError(e, 'Không thể từ chối')),
    });

    const { mutateAsync: confirmDist, isPending: isConfirming } = useMutation({
        mutationFn: (id: string) => distributionService.confirm(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
            queryClient.invalidateQueries({ queryKey: ['distributions'] });
            message.success('Xác nhận nhận hàng thành công!');
            setSelectedId(null);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể xác nhận')),
    });

    const exportXlsx = async (record: PurchaseRequest) => {
        try {
            const res: any = await api.get(`/supply-requests/${record.id}/export-xlsx`, { responseType: 'blob' });
            const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Phieu_De_Xuat_Cap_Vat_Tu_${record.requestCode || record.id}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            message.error('Không thể tải file Excel');
        }
    };

    // ── Table columns ─────────────────────────────────────────────────────────
    const columns: TableColumnsType<PurchaseRequest> = [
        {
            title: 'Mã phiếu',
            dataIndex: 'requestCode',
            width: 150,
            render: (v?: string) => (
                <span className='rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700'>
                    {v || '—'}
                </span>
            ),
        },
        {
            title: 'Cơ sở gửi',
            key: 'plant',
            responsive: ['sm'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className='font-medium text-slate-700'>{r.fromPlant?.name || r.plant?.name || '—'}</span>
            ),
        },
        {
            title: 'Ngày đề xuất',
            key: 'date',
            width: 130,
            responsive: ['md'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className='text-sm text-slate-500'>{fmtDate(r.requestDate || r.createdAt)}</span>
            ),
        },
        {
            title: 'Số loại VT',
            key: 'items',
            width: 100,
            align: 'center' as const,
            responsive: ['sm'] as any,
            render: (_: any, r: PurchaseRequest) => <Badge count={r.items?.length ?? 0} color='#6366f1' showZero />,
        },
        {
            title: 'Người tạo',
            key: 'requestedBy',
            width: 140,
            responsive: ['lg'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <span className='text-sm text-slate-600'>{resolveUser(r.requestedBy)}</span>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 150,
            render: (s: string) => <StatusTag status={s} />,
        },
        {
            title: '',
            key: 'action',
            width: 90,
            align: 'right' as const,
            render: (_: any, record: PurchaseRequest) => (
                <div className='flex items-center justify-end gap-1'>
                    {!isMobile && (
                        <Tooltip title='Xuất Excel'>
                            <Button
                                type='text'
                                size='small'
                                icon={<DownloadOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    exportXlsx(record);
                                }}
                                className='text-slate-400 hover:text-green-600'
                            />
                        </Tooltip>
                    )}
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            size='small'
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedId(record.id);
                                setApprovalQty({});
                            }}
                            className='text-slate-400 hover:text-blue-600'
                        />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const defaultPlantName = plants.find((p: Plant) => p.id === user?.plantId)?.name;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <PageHeader
                title='Đề Xuất Cấp Vật Tư'
                subtitle='Quản lý luồng đề xuất cấp vật tư từ cơ sở về kho trung tâm.'
                actions={
                    <div className='flex gap-2'>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['supply-requests'] })}
                        />
                        {!isMainPlant && (
                            <Button type='primary' icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                                Tạo đề xuất
                            </Button>
                        )}
                    </div>
                }
            />

            {/* Stats */}
            {isCS1Manager && (
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7'>
                    {[
                        {
                            title: 'Tổng phiếu',
                            value: stats.total,
                            color: '#3b82f6',
                            icon: <FileTextOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: undefined,
                        },
                        {
                            title: 'Chờ duyệt',
                            value: stats.pending,
                            color: '#f97316',
                            icon: <ClockCircleOutlined />,
                            tab: 'pending' as SupplyRequestTab,
                            status: undefined,
                        },
                        {
                            title: 'Đã duyệt',
                            value: stats.approved,
                            color: '#6366f1',
                            icon: <CheckCircleOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: 'approved' as PurchaseRequestStatus,
                        },
                        {
                            title: 'Đang cấp phát',
                            value: stats.in_progress,
                            color: '#06b6d4',
                            icon: <SyncOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: 'in_progress' as PurchaseRequestStatus,
                        },
                        {
                            title: 'Cấp thiếu',
                            value: stats.partially_distributed,
                            color: '#eab308',
                            icon: <WarningOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: 'partially_distributed' as PurchaseRequestStatus,
                        },
                        {
                            title: 'Đã nhận hàng',
                            value: stats.distributed,
                            color: '#22c55e',
                            icon: <CheckCircleOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: 'distributed' as PurchaseRequestStatus,
                        },
                        {
                            title: 'Từ chối',
                            value: stats.rejected,
                            color: '#ef4444',
                            icon: <CloseCircleOutlined />,
                            tab: 'all' as SupplyRequestTab,
                            status: 'rejected' as PurchaseRequestStatus,
                        },
                    ].map((s) => (
                        <StatCard
                            key={s.title}
                            title={s.title}
                            value={s.value}
                            color={s.color}
                            icon={s.icon}
                            active={
                                activeTab === s.tab &&
                                (s.status ? filters.status === s.status : !filters.status && s.tab !== 'pending')
                            }
                            onClick={() => {
                                setActiveTab(s.tab);
                                setFilters((p) => ({ ...p, status: s.status }));
                                setDraft((p) => ({ ...p, status: s.status }));
                                setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Table card */}
            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                {/* Tabs */}
                <div className='border-b border-slate-100 px-4 pt-1 sm:px-5'>
                    <div className='flex gap-0'>
                        {(
                            [
                                { key: 'mine', label: 'Của tôi' },
                                ...(isCS1Manager
                                    ? [
                                          {
                                              key: 'pending',
                                              label: `Chờ xử lý${stats.pending > 0 ? ` (${stats.pending})` : ''}`,
                                          },
                                      ]
                                    : []),
                                { key: 'all', label: 'Tất cả' },
                            ] as { key: SupplyRequestTab; label: string }[]
                        ).map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    setActiveTab(tab.key);
                                    setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
                                }}
                                className={[
                                    'border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
                                    activeTab === tab.key
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700',
                                ].join(' ')}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className='border-b border-slate-100 px-3 py-3 sm:px-5'>
                    {/* Mobile */}
                    <div className='flex gap-2 sm:hidden'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu...'
                            allowClear
                            value={draft.search}
                            onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
                            className='flex-1'
                        />
                        <Button
                            icon={<FilterOutlined />}
                            type={draft.fromPlantId || draft.status || draft.dateRange ? 'primary' : 'default'}
                            ghost={!!(draft.fromPlantId || draft.status || draft.dateRange)}
                            onClick={() => setFilterOpen((v) => !v)}
                        />
                    </div>
                    {filterOpen && (
                        <div className='mt-2 flex flex-col gap-2 sm:hidden'>
                            {isCS1Manager && (
                                <Select
                                    placeholder='Cơ sở gửi'
                                    allowClear
                                    value={draft.fromPlantId}
                                    onChange={(v) => {
                                        setDraft((p) => ({ ...p, fromPlantId: v }));
                                        setFilters((p) => ({ ...p, fromPlantId: v }));
                                        setPagination((p) => ({ ...p, page: 1 }));
                                    }}
                                    options={plants.map((p: Plant) => ({ label: p.name, value: p.id }))}
                                    className='w-full'
                                />
                            )}
                            <Select
                                placeholder='Trạng thái'
                                allowClear
                                value={draft.status}
                                onChange={(v) => {
                                    setDraft((p) => ({ ...p, status: v }));
                                    setFilters((p) => ({ ...p, status: v }));
                                    setPagination((p) => ({ ...p, page: 1 }));
                                }}
                                options={STATUS_OPTIONS}
                                className='w-full'
                            />
                            <RangePicker
                                value={draft.dateRange}
                                onChange={(dates) => {
                                    setDraft((p) => ({ ...p, dateRange: dates as any }));
                                    setFilters((p) => ({
                                        ...p,
                                        startDate: dates?.[0]?.startOf('day').toISOString(),
                                        endDate: dates?.[1]?.endOf('day').toISOString(),
                                    }));
                                    setPagination((p) => ({ ...p, page: 1 }));
                                }}
                                format='DD/MM/YYYY'
                                className='w-full'
                                inputReadOnly
                            />
                        </div>
                    )}
                    {/* Desktop */}
                    <div className='hidden flex-wrap items-center gap-2 sm:flex'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu, ghi chú...'
                            allowClear
                            value={draft.search}
                            onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
                            className='w-60'
                        />
                        {isCS1Manager && (
                            <Select
                                placeholder='Cơ sở gửi'
                                allowClear
                                value={draft.fromPlantId}
                                onChange={(v) => {
                                    setDraft((p) => ({ ...p, fromPlantId: v }));
                                    setFilters((p) => ({ ...p, fromPlantId: v }));
                                    setPagination((p) => ({ ...p, page: 1 }));
                                }}
                                options={plants.map((p: Plant) => ({ label: p.name, value: p.id }))}
                                className='w-44'
                            />
                        )}
                        <Select
                            placeholder='Trạng thái'
                            allowClear
                            value={draft.status}
                            onChange={(v) => {
                                setDraft((p) => ({ ...p, status: v }));
                                setFilters((p) => ({ ...p, status: v }));
                                setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            options={STATUS_OPTIONS}
                            className='w-40'
                        />
                        <RangePicker
                            value={draft.dateRange}
                            onChange={(dates) => {
                                setDraft((p) => ({ ...p, dateRange: dates as any }));
                                setFilters((p) => ({
                                    ...p,
                                    startDate: dates?.[0]?.startOf('day').toISOString(),
                                    endDate: dates?.[1]?.endOf('day').toISOString(),
                                }));
                                setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            format='DD/MM/YYYY'
                            className='w-60'
                        />
                    </div>
                </div>

                {/* Mobile card list */}
                {isMobile ? (
                    <div className='divide-y divide-slate-100'>
                        {(isLoading || isFetching) && requests.length === 0 ? (
                            <div className='py-16 text-center text-sm text-slate-400'>Đang tải...</div>
                        ) : requests.length === 0 ? (
                            <div className='py-16'>
                                <Empty description='Không có phiếu nào' image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            </div>
                        ) : (
                            requests.map((record) => (
                                <div
                                    key={record.id}
                                    onClick={() => {
                                        setSelectedId(record.id);
                                        setApprovalQty({});
                                    }}
                                    className='flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors active:bg-slate-50'
                                >
                                    {/* Status dot */}
                                    <div
                                        className='mt-0.5 h-2 w-2 shrink-0 rounded-full'
                                        style={{
                                            backgroundColor:
                                                STATUS_META[record.status]?.color === 'default'
                                                    ? '#94a3b8'
                                                    : STATUS_META[record.status]?.color,
                                        }}
                                    />
                                    <div className='min-w-0 flex-1'>
                                        <div className='mb-0.5 flex items-center justify-between gap-2'>
                                            <span className='truncate font-mono text-xs font-bold text-blue-700'>
                                                {record.requestCode || '—'}
                                            </span>
                                            <StatusTag status={record.status} />
                                        </div>
                                        <div className='truncate text-sm font-medium text-slate-700'>
                                            {record.fromPlant?.name || record.plant?.name || '—'}
                                        </div>
                                        <div className='mt-0.5 flex items-center gap-3 text-xs text-slate-400'>
                                            <span>{fmtDate(record.requestDate || record.createdAt)}</span>
                                            <span>·</span>
                                            <span>{record.items?.length ?? 0} loại vật tư</span>
                                            <span>·</span>
                                            <span>{resolveUser(record.requestedBy)}</span>
                                        </div>
                                    </div>
                                    <RightOutlined className='shrink-0 text-xs text-slate-300' />
                                </div>
                            ))
                        )}
                        {/* Mobile pagination */}
                        {totalRequests > 0 && (
                            <div className='flex items-center justify-between bg-slate-50 px-4 py-3 text-sm text-slate-500'>
                                <Button
                                    size='small'
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                                >
                                    ← Trước
                                </Button>
                                <span className='text-xs text-slate-400'>
                                    {pagination.page} / {Math.max(1, Math.ceil(totalRequests / pagination.limit))} ·{' '}
                                    {totalRequests} phiếu
                                </span>
                                <Button
                                    size='small'
                                    disabled={pagination.page >= Math.ceil(totalRequests / pagination.limit)}
                                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                                >
                                    Sau →
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Desktop table */
                    <div className='px-5 py-4'>
                        <Table
                            columns={columns}
                            dataSource={requests}
                            rowKey='id'
                            loading={isLoading || isFetching}
                            size='middle'
                            onRow={(record) => ({
                                onClick: () => {
                                    setSelectedId(record.id);
                                    setApprovalQty({});
                                },
                                className: 'cursor-pointer hover:bg-blue-50/30 transition-colors',
                            })}
                            pagination={{
                                current: pagination.page,
                                pageSize: pagination.limit,
                                total: totalRequests,
                                showSizeChanger: true,
                                onChange: (page, limit) => setPagination({ page, limit }),
                                showTotal: (total) => `${total} phiếu`,
                            }}
                            locale={{
                                emptyText: (
                                    <Empty description='Không có phiếu nào' image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                ),
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Form Drawer */}
            <FormDrawer
                open={formOpen}
                defaultPlantId={user?.plantId}
                defaultPlantName={defaultPlantName}
                submitting={isCreating}
                onClose={() => setFormOpen(false)}
                onSubmit={async (payload) => {
                    await createReq(payload);
                }}
            />

            {/* Detail Drawer */}
            <Drawer
                open={!!selectedId}
                onClose={() => {
                    setSelectedId(null);
                    setApprovalQty({});
                    setChatOpen(false);
                }}
                size={isMobile ? '92%' : 820}
                placement={isMobile ? 'bottom' : 'right'}
                destroyOnHidden
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                    header: { padding: isMobile ? '12px 16px' : undefined },
                }}
                title={
                    <div className='flex items-center gap-3'>
                        <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600'>
                            <FileTextOutlined />
                        </div>
                        <div>
                            <div className='text-sm font-semibold text-slate-900 sm:text-base'>
                                Chi tiết đề xuất
                                {selectedRequest?.requestCode && (
                                    <span className='ml-2 font-mono text-blue-600'>#{selectedRequest.requestCode}</span>
                                )}
                            </div>
                            {selectedRequest && <StatusTag status={selectedRequest.status} />}
                        </div>
                    </div>
                }
                footer={
                    selectedRequest && (
                        <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
                            <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                                <Button
                                    icon={<MessageOutlined />}
                                    className='text-blue-600'
                                    block={isMobile}
                                    onClick={() => setChatOpen(true)}
                                >
                                    Trao đổi
                                </Button>
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={() => exportXlsx(selectedRequest)}
                                    block={isMobile}
                                >
                                    Xuất Excel
                                </Button>
                            </div>
                            <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                                {selectedRequest.status === 'pending' && isCS1Manager && (
                                    <>
                                        <Button
                                            danger
                                            onClick={() => setRejectTarget(selectedRequest)}
                                            block={isMobile}
                                        >
                                            Từ chối
                                        </Button>
                                        <Button
                                            type='primary'
                                            className='bg-green-600 hover:!bg-green-700'
                                            block={isMobile}
                                            loading={approvingId === selectedRequest.id}
                                            onClick={() => {
                                                const items = selectedRequest.items.map((r: any, idx: number) => ({
                                                    materialId: resolveId(r.materialId) ?? r.materialId,
                                                    quantityApproved: approvalQty[idx] ?? r.quantityRequested,
                                                }));
                                                Modal.confirm({
                                                    title: 'Duyệt phiếu đề xuất?',
                                                    content:
                                                        'Sau khi duyệt, bạn sẽ được chuyển sang trang tạo phiếu cấp phát.',
                                                    okText: 'Duyệt',
                                                    okButtonProps: { className: 'bg-green-600' },
                                                    onOk: () => {
                                                        setApprovingId(selectedRequest.id);
                                                        return approveReq({
                                                            id: selectedRequest.id,
                                                            payload: { items },
                                                        });
                                                    },
                                                });
                                            }}
                                        >
                                            <CheckCircleOutlined /> Duyệt phiếu
                                        </Button>
                                    </>
                                )}
                                {canConfirm && (
                                    <Button
                                        type='primary'
                                        className='bg-green-600 hover:!bg-green-700'
                                        block={isMobile}
                                        loading={isConfirming}
                                        onClick={() => {
                                            if (!linkedDist?.id) return;
                                            Modal.confirm({
                                                title: 'Xác nhận đã nhận hàng?',
                                                content:
                                                    'Thao tác này xác nhận cơ sở đã nhận đủ vật tư. Không thể hoàn tác.',
                                                okText: 'Xác nhận',
                                                okButtonProps: { className: 'bg-green-600' },
                                                onOk: () => confirmDist(linkedDist.id),
                                            });
                                        }}
                                    >
                                        <CheckCircleOutlined /> Xác nhận nhận hàng
                                    </Button>
                                )}
                            </div>
                        </div>
                    )
                }
            >
                {selectedRequest ? (
                    <div className='flex-1 overflow-y-auto'>
                        <div className='flex flex-col gap-4 p-4 sm:p-5'>
                            {/* Workflow */}
                            {selectedRequest.status !== 'rejected' && selectedRequest.status !== 'cancelled' && (
                                <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:px-6'>
                                    <Steps
                                        size='small'
                                        current={getWorkflowStep(selectedRequest.status)}
                                        items={WORKFLOW_STEPS.map((s) => ({ title: s.title }))}
                                    />
                                </div>
                            )}

                            {/* Rejected banner */}
                            {selectedRequest.status === 'rejected' && (
                                <div className='flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700'>
                                    <WarningOutlined className='mt-0.5 shrink-0' />
                                    <div>
                                        <div className='text-sm font-semibold'>Phiếu bị từ chối</div>
                                        <div className='mt-0.5 text-sm'>{selectedRequest.rejectedReason || '—'}</div>
                                    </div>
                                </div>
                            )}

                            {/* In-progress banner */}
                            {isInProgress && linkedDist?.status === 'distributed' && (
                                <div className='flex gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-700'>
                                    <SendOutlined className='mt-0.5 shrink-0' />
                                    <div>
                                        <div className='text-sm font-semibold'>Hàng đang trên đường vận chuyển</div>
                                        <div className='mt-0.5 text-sm'>Vui lòng xác nhận sau khi nhận đủ vật tư.</div>
                                    </div>
                                </div>
                            )}

                            {/* Cấp thiếu → lối vào cấp bù */}
                            {isPartiallyDistributed && openShortages.length > 0 && (
                                <div className='flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between'>
                                    <div className='flex gap-3 text-orange-700'>
                                        <WarningOutlined className='mt-0.5 shrink-0' />
                                        <div>
                                            <div className='text-sm font-semibold'>
                                                Còn {openShortages.length} vật tư cấp thiếu cần cấp bù
                                            </div>
                                            <div className='mt-0.5 text-sm'>
                                                Tạo phiếu cấp bù để xuất bổ sung phần còn thiếu cho cơ sở.
                                            </div>
                                        </div>
                                    </div>
                                    {isCS1Manager && (
                                        <Button
                                            type='primary'
                                            icon={<SendOutlined />}
                                            block={isMobile}
                                            className='bg-orange-500 hover:!bg-orange-600'
                                            onClick={() => setCompensationOpen(true)}
                                        >
                                            Cấp bù ngay ({openShortages.length})
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Info — mobile: list rows, desktop: Descriptions */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Thông tin phiếu
                                </div>
                                {isMobile ? (
                                    <div className='divide-y divide-slate-100'>
                                        {[
                                            {
                                                label: 'Mã phiếu',
                                                value: (
                                                    <Text
                                                        copyable
                                                        className='font-mono text-sm font-bold text-blue-700'
                                                    >
                                                        {selectedRequest.requestCode}
                                                    </Text>
                                                ),
                                            },
                                            {
                                                label: 'Trạng thái',
                                                value: <StatusTag status={selectedRequest.status} />,
                                            },
                                            {
                                                label: 'Cơ sở gửi',
                                                value:
                                                    selectedRequest.fromPlant?.name ||
                                                    selectedRequest.plant?.name ||
                                                    '—',
                                            },
                                            {
                                                label: 'Ngày đề xuất',
                                                value: fmtDate(
                                                    selectedRequest.requestDate || selectedRequest.createdAt
                                                ),
                                            },
                                            { label: 'Người tạo', value: resolveUser(selectedRequest.requestedBy) },
                                            ...(selectedRequest.approvedBy
                                                ? [
                                                      {
                                                          label: 'Người duyệt',
                                                          value: resolveUser(selectedRequest.approvedBy),
                                                      },
                                                  ]
                                                : []),
                                            ...(selectedRequest.approvedAt
                                                ? [
                                                      {
                                                          label: 'Ngày duyệt',
                                                          value: fmtDateTime(selectedRequest.approvedAt),
                                                      },
                                                  ]
                                                : []),
                                            ...(selectedRequest.note
                                                ? [{ label: 'Lý do', value: selectedRequest.note }]
                                                : []),
                                        ].map(({ label, value }) => (
                                            <div
                                                key={label}
                                                className='flex items-start justify-between gap-3 px-4 py-3'
                                            >
                                                <span className='w-24 shrink-0 text-xs text-slate-400'>{label}</span>
                                                <span className='flex-1 text-right text-sm text-slate-800'>
                                                    {value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className='p-5'>
                                        <Descriptions
                                            column={2}
                                            size='small'
                                            labelStyle={{ color: '#94a3b8', fontWeight: 500 }}
                                        >
                                            <Descriptions.Item label='Mã phiếu'>
                                                <Text copyable className='font-mono font-semibold text-blue-700'>
                                                    {selectedRequest.requestCode}
                                                </Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Trạng thái'>
                                                <StatusTag status={selectedRequest.status} />
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Cơ sở gửi'>
                                                {selectedRequest.fromPlant?.name || selectedRequest.plant?.name || '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Ngày đề xuất'>
                                                {fmtDate(selectedRequest.requestDate || selectedRequest.createdAt)}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Người tạo'>
                                                {resolveUser(selectedRequest.requestedBy)}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Ngày tạo'>
                                                {fmtDateTime(selectedRequest.createdAt)}
                                            </Descriptions.Item>
                                            {selectedRequest.approvedBy && (
                                                <Descriptions.Item label='Người duyệt'>
                                                    {resolveUser(selectedRequest.approvedBy)}
                                                </Descriptions.Item>
                                            )}
                                            {selectedRequest.approvedAt && (
                                                <Descriptions.Item label='Ngày duyệt'>
                                                    {fmtDateTime(selectedRequest.approvedAt)}
                                                </Descriptions.Item>
                                            )}
                                            {selectedRequest.note && (
                                                <Descriptions.Item label='Lý do / Mục đích' span={2}>
                                                    <Paragraph className='mb-0 text-slate-700'>
                                                        {selectedRequest.note}
                                                    </Paragraph>
                                                </Descriptions.Item>
                                            )}
                                        </Descriptions>
                                    </div>
                                )}
                            </div>

                            {/* Items */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Danh sách vật tư · {selectedRequest.items?.length ?? 0} loại
                                </div>
                                {isMobile ? (
                                    <div className='divide-y divide-slate-100'>
                                        {(selectedRequest.items ?? []).map((r: any, idx: number) => (
                                            <div key={idx} className='px-4 py-3'>
                                                <div className='mb-1.5 flex items-start justify-between gap-2'>
                                                    <span className='flex-1 text-sm font-semibold text-slate-800'>
                                                        {r.materialName || '—'}
                                                    </span>
                                                    <span className='shrink-0 text-xs text-slate-400'>
                                                        {r.unit || '—'}
                                                    </span>
                                                </div>
                                                <div className='flex items-center gap-4 text-xs text-slate-500'>
                                                    <span>
                                                        Đề xuất:{' '}
                                                        <strong className='text-slate-700'>
                                                            {fmtNum(r.quantityRequested)}
                                                        </strong>
                                                    </span>
                                                    {isCS1Manager && selectedRequest.status === 'pending' ? (
                                                        <div className='flex items-center gap-1.5'>
                                                            <span>Duyệt:</span>
                                                            <InputNumber
                                                                min={1}
                                                                size='small'
                                                                style={{ width: 80 }}
                                                                value={approvalQty[idx] ?? r.quantityRequested}
                                                                onChange={(v) =>
                                                                    setApprovalQty((p) => ({
                                                                        ...p,
                                                                        [idx]: v ?? r.quantityRequested,
                                                                    }))
                                                                }
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span
                                                            className={
                                                                r.quantityApproved != null &&
                                                                r.quantityApproved < r.quantityRequested
                                                                    ? 'font-semibold text-orange-600'
                                                                    : ''
                                                            }
                                                        >
                                                            Duyệt:{' '}
                                                            <strong>
                                                                {fmtNum(r.quantityApproved ?? r.quantityRequested)}
                                                            </strong>
                                                        </span>
                                                    )}
                                                </div>
                                                {r.note && (
                                                    <div className='mt-1 text-xs text-slate-400 italic'>{r.note}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Table
                                        dataSource={selectedRequest.items}
                                        rowKey={(_, idx) => String(idx)}
                                        pagination={false}
                                        size='small'
                                        className='[&_.ant-table-thead_th]:bg-slate-50'
                                        columns={[
                                            {
                                                title: '#',
                                                key: 'idx',
                                                width: 40,
                                                align: 'center' as const,
                                                render: (_: any, __: any, idx: number) => (
                                                    <span className='text-xs text-slate-400'>{idx + 1}</span>
                                                ),
                                            },
                                            {
                                                title: 'Tên vật tư',
                                                key: 'name',
                                                render: (_: any, r: any) => (
                                                    <span className='font-medium text-slate-800'>
                                                        {r.materialName || '—'}
                                                    </span>
                                                ),
                                            },
                                            { title: 'ĐVT', dataIndex: 'unit', width: 80 },
                                            {
                                                title: 'SL đề xuất',
                                                dataIndex: 'quantityRequested',
                                                width: 100,
                                                align: 'right' as const,
                                                render: (v: number) => (
                                                    <span className='font-semibold'>{fmtNum(v)}</span>
                                                ),
                                            },
                                            ...(isCS1Manager && selectedRequest.status === 'pending'
                                                ? [
                                                      {
                                                          title: 'SL duyệt',
                                                          key: 'qtyA',
                                                          width: 110,
                                                          render: (_: any, r: any, idx: number) => (
                                                              <InputNumber
                                                                  min={1}
                                                                  size='small'
                                                                  style={{ width: '100%' }}
                                                                  value={approvalQty[idx] ?? r.quantityRequested}
                                                                  onChange={(v) =>
                                                                      setApprovalQty((p) => ({
                                                                          ...p,
                                                                          [idx]: v ?? r.quantityRequested,
                                                                      }))
                                                                  }
                                                              />
                                                          ),
                                                      },
                                                  ]
                                                : [
                                                      {
                                                          title: 'SL duyệt',
                                                          key: 'qtyA',
                                                          width: 100,
                                                          align: 'right' as const,
                                                          render: (_: any, r: any) => (
                                                              <span
                                                                  className={
                                                                      r.quantityApproved != null &&
                                                                      r.quantityApproved < r.quantityRequested
                                                                          ? 'font-semibold text-orange-600'
                                                                          : ''
                                                                  }
                                                              >
                                                                  {fmtNum(r.quantityApproved ?? r.quantityRequested)}
                                                              </span>
                                                          ),
                                                      },
                                                  ]),
                                            {
                                                title: 'Ghi chú',
                                                dataIndex: 'note',
                                                width: 160,
                                                render: (v?: string) => (
                                                    <span className='text-sm text-slate-400'>{v || '—'}</span>
                                                ),
                                            },
                                        ]}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty description='Không có dữ liệu' className='py-20' />
                )}
            </Drawer>

            {/* Reject Modal */}
            <Modal
                open={Boolean(rejectTarget)}
                title={
                    <div className='flex items-center gap-2 text-red-600'>
                        <CloseCircleOutlined /> Từ chối phiếu đề xuất
                    </div>
                }
                okText='Xác nhận từ chối'
                okButtonProps={{ danger: true }}
                cancelText='Huỷ'
                confirmLoading={isRejecting}
                onOk={async () => {
                    if (!rejectTarget || !rejectReason.trim()) {
                        message.warning('Vui lòng nhập lý do từ chối');
                        return;
                    }
                    await rejectReq({ id: rejectTarget.id, reason: rejectReason.trim() });
                }}
                onCancel={() => {
                    setRejectTarget(null);
                    setRejectReason('');
                }}
                destroyOnHidden
            >
                <div className='mt-4 flex flex-col gap-3'>
                    <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm'>
                        Phiếu: <span className='font-semibold text-slate-800'>{rejectTarget?.requestCode}</span>
                        {' · '}
                        <span className='text-slate-500'>
                            {rejectTarget?.fromPlant?.name || rejectTarget?.plant?.name}
                        </span>
                    </div>
                    <Input.TextArea
                        rows={4}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder='Nhập lý do từ chối rõ ràng để cơ sở biết và điều chỉnh...'
                        maxLength={300}
                        showCount
                    />
                </div>
            </Modal>

            <SupplyCompensationModal
                open={compensationOpen}
                shortages={openShortages as any}
                onClose={() => setCompensationOpen(false)}
                onSuccess={() => {
                    setCompensationOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
                    queryClient.invalidateQueries({ queryKey: ['distributions'] });
                    queryClient.invalidateQueries({ queryKey: ['materials', 'supply-shortages'] });
                }}
            />

            {selectedRequest && chatOpen ? (
                <ContextChatDrawer
                    open={chatOpen}
                    contextType='supply_request'
                    contextId={selectedRequest.id}
                    title={`Trao đổi ${selectedRequest.requestCode || 'phiếu yêu cầu'}`}
                    subtitle='Yêu cầu cấp vật tư'
                    onClose={() => setChatOpen(false)}
                />
            ) : null}
        </>
    );
};

export default SupplyRequestPage;
