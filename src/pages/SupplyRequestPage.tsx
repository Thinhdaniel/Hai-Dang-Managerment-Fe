import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
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
    SearchOutlined,
    SendOutlined,
    SyncOutlined,
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
    const [form] = Form.useForm<FormValues>();
    const watchedItems: FormItemValue[] = Form.useWatch('items', form) ?? [];
    const screens = useBreakpoint();
    const isMobile = !screens.sm;

    useEffect(() => {
        if (!open) return;
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
            size={isMobile ? '100%' : 860}
            destroyOnHidden
            maskClosable={false}
            styles={{
                body: {
                    padding: isMobile ? '0' : '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
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
                <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
                    {!isMobile && (
                        <Text type='secondary' className='text-sm'>
                            {watchedItems.length} loại vật tư
                        </Text>
                    )}
                    <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : ''}`}>
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
            <Form form={form} layout='vertical' className='flex h-full flex-col'>
                {/* Thông tin chung */}
                <div
                    className={`shrink-0 border-b border-slate-100 bg-slate-50 ${isMobile ? 'px-4 py-4' : 'mb-5 rounded-2xl border border-slate-200 p-5'}`}
                >
                    {isMobile && (
                        <div className='mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                            Thông tin chung
                        </div>
                    )}
                    {!isMobile && (
                        <div className='mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700'>
                            <FileTextOutlined /> Thông tin chung
                        </div>
                    )}
                    <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-2 gap-4'}`}>
                        <Form.Item label='Cơ sở gửi' className='col-span-2 mb-0 sm:col-span-1'>
                            <Input
                                value={defaultPlantName || '—'}
                                readOnly
                                className='cursor-default bg-white font-medium text-slate-700'
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
                            <DatePicker format='DD/MM/YYYY' className='w-full' inputReadOnly={isMobile} />
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
                                rows={isMobile ? 2 : 3}
                                maxLength={500}
                                showCount
                                placeholder='Ghi rõ lý do cần cấp và mục đích sử dụng...'
                            />
                        </Form.Item>
                    </div>
                </div>

                {/* Danh sách vật tư */}
                <Form.List name='items'>
                    {(fields, { add, remove }) => (
                        <div
                            className={`flex min-h-0 flex-1 flex-col overflow-hidden ${!isMobile ? 'mt-0 rounded-2xl border border-slate-200 bg-white' : ''}`}
                        >
                            <div
                                className={`flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 ${isMobile ? 'px-4 py-3' : 'px-5 py-3'}`}
                            >
                                <div>
                                    <div className='text-sm font-semibold text-slate-800'>Danh sách vật tư</div>
                                    <div className='text-xs text-slate-400'>Tối thiểu 1 vật tư</div>
                                </div>
                                <Tag color='blue'>{fields.length} loại</Tag>
                            </div>
                            {!isMobile && (
                                <div className='grid shrink-0 grid-cols-[minmax(0,2.5fr)_90px_130px_minmax(0,1.5fr)_40px] gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase'>
                                    <span>Tên vật tư *</span>
                                    <span>ĐVT *</span>
                                    <span>Số lượng *</span>
                                    <span>Ghi chú</span>
                                    <span />
                                </div>
                            )}
                            <div className='flex-1 overflow-y-auto'>
                                {fields.length === 0 && (
                                    <div className='flex flex-col items-center justify-center gap-2 py-12 text-slate-400'>
                                        <InboxOutlined style={{ fontSize: 32 }} />
                                        <span className='text-sm'>Chưa có vật tư nào</span>
                                    </div>
                                )}
                                {fields.map((field, index) =>
                                    isMobile ? (
                                        <div
                                            key={field.key}
                                            className='border-b border-slate-100 px-4 py-3 last:border-b-0'
                                        >
                                            <div className='mb-2 flex items-center justify-between'>
                                                <span className='text-xs font-semibold text-slate-500'>
                                                    Vật tư #{index + 1}
                                                </span>
                                                <Button
                                                    type='text'
                                                    danger
                                                    size='small'
                                                    disabled={fields.length === 1}
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => remove(field.name)}
                                                />
                                            </div>
                                            <div className='grid grid-cols-2 gap-2'>
                                                <Form.Item
                                                    name={[field.name, 'materialName']}
                                                    label='Tên vật tư'
                                                    className='col-span-2 mb-0'
                                                    rules={[{ required: true, message: 'Nhập tên' }]}
                                                >
                                                    <Input
                                                        placeholder={`Vật tư ${index + 1}`}
                                                        maxLength={200}
                                                        size='large'
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    name={[field.name, 'unit']}
                                                    label='ĐVT'
                                                    className='mb-0'
                                                    rules={[{ required: true, message: 'Nhập ĐVT' }]}
                                                >
                                                    <Input placeholder='Cái, Kg...' maxLength={50} size='large' />
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
                                                    className='col-span-2 mb-0'
                                                >
                                                    <Input placeholder='Ghi chú...' maxLength={250} />
                                                </Form.Item>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            key={field.key}
                                            className='grid grid-cols-[minmax(0,2.5fr)_90px_130px_minmax(0,1.5fr)_40px] gap-3 border-b border-slate-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-blue-50/20'
                                        >
                                            <Form.Item
                                                name={[field.name, 'materialName']}
                                                className='mb-0'
                                                rules={[{ required: true, message: 'Nhập tên' }]}
                                            >
                                                <Input placeholder={`Vật tư ${index + 1}`} maxLength={200} />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'unit']}
                                                className='mb-0'
                                                rules={[{ required: true, message: 'Nhập ĐVT' }]}
                                            >
                                                <Input placeholder='Cái, Kg...' maxLength={50} />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'quantityRequested']}
                                                className='mb-0'
                                                rules={[{ required: true, message: 'Nhập SL' }]}
                                            >
                                                <InputNumber<number>
                                                    min={1}
                                                    className='w-full'
                                                    formatter={(v) =>
                                                        `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                    }
                                                    parser={parseNum}
                                                />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'note']} className='mb-0'>
                                                <Input placeholder='Ghi chú...' maxLength={250} />
                                            </Form.Item>
                                            <div className='flex items-center justify-center'>
                                                <Tooltip title='Xoá dòng'>
                                                    <Button
                                                        type='text'
                                                        danger
                                                        size='small'
                                                        disabled={fields.length === 1}
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => remove(field.name)}
                                                    />
                                                </Tooltip>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                            <div
                                className={`flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 ${isMobile ? 'px-4 py-3' : 'px-5 py-3'}`}
                            >
                                <Text type='secondary' className='text-xs'>
                                    Tổng: <strong>{fields.length}</strong> loại
                                </Text>
                                <Button
                                    icon={<PlusOutlined />}
                                    onClick={() => add(emptyItem())}
                                    block={isMobile}
                                    type={isMobile ? 'dashed' : 'default'}
                                >
                                    Thêm vật tư
                                </Button>
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
