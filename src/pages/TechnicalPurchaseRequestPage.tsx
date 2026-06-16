import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
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
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    FileTextOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
    RightOutlined,
    SearchOutlined,
    SendOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import {
    technicalPurchaseService,
    type PurchaseRequest,
    type PurchaseRequestQueryParams,
    type PurchaseRequestStatus,
    type TechnicalPurchasePayload,
} from '../core/services/material.service';
import type { PaginatedResponse, User } from '../core/types';

const { useBreakpoint } = Grid;
const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;

type Tab = 'mine' | 'pending' | 'all';
type DateRange = [Dayjs, Dayjs] | null;
type FilterState = {
    search: string;
    status?: PurchaseRequestStatus;
    startDate?: string;
    endDate?: string;
};
type FormItemValue = { materialName?: string; unit?: string; quantityRequested?: number; note?: string };
type FormValues = {
    requesterName?: string;
    department?: string;
    requestDate?: Dayjs;
    note?: string;
    items: FormItemValue[];
};

const STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pending: { color: 'orange', label: 'Chờ duyệt', icon: <ClockCircleOutlined /> },
    approved: { color: 'green', label: 'Đã duyệt', icon: <CheckCircleOutlined /> },
    rejected: { color: 'red', label: 'Từ chối', icon: <CloseCircleOutlined /> },
};

const STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus; label: string }> = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Từ chối' },
];

const COMMON_UNITS = [
    'Cái', 'Chiếc', 'Bộ', 'Đôi', 'Kg', 'Gram', 'Tấn', 'Mét', 'Cuộn', 'Tấm', 'Hộp', 'Thùng',
    'Bao', 'Bó', 'Gói', 'Túi', 'Lít', 'Can', 'Bình', 'Lọ', 'Chai', 'Ống', 'Viên', 'Cây',
];
const UNIT_OPTIONS = COMMON_UNITS.map((u) => ({ value: u }));

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
const emptyItem = (): FormItemValue => ({ materialName: '', unit: '', quantityRequested: 1, note: '' });

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
    const m = STATUS_META[status] ?? { color: 'default', label: status, icon: null };
    return (
        <Tag color={m.color} icon={m.icon} style={{ margin: 0 }}>
            {m.label}
        </Tag>
    );
};

// ── FormDrawer (tạo / sửa) ──────────────────────────────────────────────────────
const FormDrawer: React.FC<{
    open: boolean;
    initialValues?: PurchaseRequest | null;
    defaultRequesterName?: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: TechnicalPurchasePayload) => Promise<void>;
}> = ({ open, initialValues, defaultRequesterName, submitting, onClose, onSubmit }) => {
    const [form] = Form.useForm<FormValues>();
    const watchedItems: FormItemValue[] = Form.useWatch('items', form) ?? [];
    const screens = useBreakpoint();
    const isMobile = !screens.sm;

    useEffect(() => {
        if (!open) return;
        if (initialValues) {
            form.setFieldsValue({
                requesterName: initialValues.requesterName || '',
                department: initialValues.department || 'Kỹ thuật',
                requestDate: initialValues.requestDate ? dayjs(initialValues.requestDate) : dayjs(),
                note: initialValues.note,
                items: initialValues.items.map((i) => ({
                    materialName: i.materialName || '',
                    unit: i.unit || '',
                    quantityRequested: i.quantityRequested,
                    note: i.note,
                })),
            });
        } else {
            form.resetFields();
            form.setFieldsValue({
                requesterName: defaultRequesterName || '',
                department: 'Kỹ thuật',
                requestDate: dayjs(),
                items: [emptyItem()],
            });
        }
    }, [open, initialValues, defaultRequesterName, form]);

    const handleSubmit = async () => {
        const values = await form.validateFields();
        await onSubmit({
            requesterName: normalizeText(values.requesterName),
            department: normalizeText(values.department),
            note: normalizeText(values.note),
            requestDate: values.requestDate?.toISOString(),
            items: (values.items ?? []).map((i) => ({
                materialName: String(i.materialName ?? '').trim(),
                unit: String(i.unit ?? '').trim(),
                quantityRequested: Number(i.quantityRequested ?? 0),
                note: normalizeText(i.note),
            })),
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
                body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' },
            }}
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600'>
                        <ToolOutlined />
                    </div>
                    <div>
                        <div className='font-semibold text-slate-900'>
                            {initialValues ? 'Cập nhật đề nghị' : 'Tạo giấy đề nghị mua vật tư'}
                        </div>
                        <div className='text-xs text-slate-400'>Bộ phận kỹ thuật đề nghị mua vật tư / phụ tùng</div>
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
                            {initialValues ? 'Lưu cập nhật' : 'Gửi đề nghị'}
                        </Button>
                    </div>
                </div>
            }
        >
            <Form form={form} layout='vertical' className='flex h-full min-h-0 flex-col'>
                {/* Thông tin chung */}
                <div className='shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5'>
                    <div className='mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700'>
                        <FileTextOutlined className='text-blue-500' /> Thông tin chung
                    </div>
                    <div className='grid grid-cols-2 gap-3 sm:gap-4'>
                        <Form.Item
                            name='requesterName'
                            label='Họ và tên người đề nghị'
                            className='col-span-2 mb-0 sm:col-span-1'
                            rules={[{ required: true, message: 'Nhập họ và tên' }]}
                        >
                            <Input placeholder='VD: Nguyễn Văn A' size='large' maxLength={120} allowClear />
                        </Form.Item>
                        <Form.Item name='department' label='Bộ phận' className='col-span-2 mb-0 sm:col-span-1'>
                            <Input placeholder='Kỹ thuật' size='large' maxLength={120} allowClear />
                        </Form.Item>
                        <Form.Item
                            name='requestDate'
                            label='Ngày đề nghị'
                            className='col-span-2 mb-0 sm:col-span-1'
                            rules={[{ required: true, message: 'Chọn ngày' }]}
                        >
                            <DatePicker format='DD/MM/YYYY' className='w-full' size='large' inputReadOnly={isMobile} />
                        </Form.Item>
                        <Form.Item name='note' label='Ghi chú chung (nếu có)' className='col-span-2 mb-0'>
                            <Input.TextArea rows={1} maxLength={500} placeholder='Lý do / mục đích chung...' />
                        </Form.Item>
                    </div>
                </div>

                {/* Danh sách vật tư */}
                <Form.List name='items'>
                    {(fields, { add, remove }) => (
                        <div className='flex min-h-0 flex-1 flex-col'>
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
                                    onClick={() => add(emptyItem())}
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
                                        <Button type='primary' ghost icon={<PlusOutlined />} onClick={() => add(emptyItem())}>
                                            Thêm vật tư đầu tiên
                                        </Button>
                                    </div>
                                )}

                                {fields.map((field, index) => (
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
                                                    onClick={() => remove(field.name)}
                                                />
                                            </Tooltip>
                                        </div>
                                        <Form.Item
                                            name={[field.name, 'materialName']}
                                            label='Tên vật tư'
                                            className='mb-3'
                                            rules={[{ required: true, message: 'Nhập tên vật tư' }]}
                                        >
                                            <Input placeholder='VD: Vòng bi, Dây curoa, Kim máy...' maxLength={200} size='large' allowClear />
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
                                                    placeholder='Cái, Bộ, Mét...'
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
                                                    formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                    parser={parseNum}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'note']}
                                                label='Ghi chú'
                                                className='col-span-2 mb-0 sm:col-span-1'
                                            >
                                                <Input placeholder='Quy cách, vị trí lắp... (nếu có)' maxLength={250} size='large' />
                                            </Form.Item>
                                        </div>
                                    </div>
                                ))}

                                {fields.length > 0 && (
                                    <Button type='dashed' block icon={<PlusOutlined />} onClick={() => add(emptyItem())} className='h-11'>
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
const TechnicalPurchaseRequestPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { user } = useAuth();
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const isManager = hasManagerAccess(user?.role);

    const [activeTab, setActiveTab] = useState<Tab>('mine');
    const [filters, setFilters] = useState<FilterState>({ search: '' });
    const [draftSearch, setDraftSearch] = useState('');
    const [draftStatus, setDraftStatus] = useState<PurchaseRequestStatus | undefined>(undefined);
    const [draftRange, setDraftRange] = useState<DateRange>(null);
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PurchaseRequest | null>(null);
    const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingId, setApprovingId] = useState<string | null>(null);

    // Debounce search
    useEffect(() => {
        const t = window.setTimeout(() => {
            setFilters((c) => ({ ...c, search: normalizeSearchTerm(draftSearch) }));
            setPagination((c) => ({ ...c, page: DEFAULT_PAGE }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draftSearch]);

    const listParams = useMemo<PurchaseRequestQueryParams>(
        () => ({
            search: filters.search || undefined,
            requestedBy: activeTab === 'mine' && isManager ? user?.id : undefined,
            status: activeTab === 'pending' ? 'pending' : filters.status,
            startDate: filters.startDate,
            endDate: filters.endDate,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [activeTab, filters, pagination, user, isManager]
    );

    const {
        data: listRes,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['technical-purchase-requests', listParams],
        queryFn: async () =>
            normalizePaginated(await technicalPurchaseService.getAll(listParams), listParams.page!, listParams.limit!),
        placeholderData: (p) => p,
    });

    const requests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.data ?? [];
    const totalRequests = (listRes as PaginatedResponse<PurchaseRequest> | undefined)?.total ?? 0;
    const selectedInList = requests.find((r) => r.id === selectedId) ?? null;

    const { data: fallbackRequest } = useQuery({
        queryKey: ['technical-purchase-requests', 'detail', selectedId],
        queryFn: () => technicalPurchaseService.getById(selectedId!),
        enabled: Boolean(selectedId) && !selectedInList,
    });
    const selectedRequest =
        selectedInList ?? (fallbackRequest && fallbackRequest.id === selectedId ? fallbackRequest : null);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['technical-purchase-requests'] });

    const { mutateAsync: createReq, isPending: isCreating } = useMutation({
        mutationFn: technicalPurchaseService.create,
        onSuccess: () => {
            invalidate();
            message.success('Tạo giấy đề nghị thành công');
            setFormOpen(false);
            setEditing(null);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể tạo phiếu')),
    });

    const { mutateAsync: updateReq, isPending: isUpdating } = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TechnicalPurchasePayload> }) =>
            technicalPurchaseService.update(id, data),
        onSuccess: () => {
            invalidate();
            message.success('Cập nhật giấy đề nghị thành công');
            setFormOpen(false);
            setEditing(null);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể cập nhật phiếu')),
    });

    const { mutateAsync: approveReq } = useMutation({
        mutationFn: (id: string) => technicalPurchaseService.approve(id),
        onSuccess: () => {
            invalidate();
            message.success('Đã duyệt giấy đề nghị');
            setApprovingId(null);
            setSelectedId(null);
        },
        onError: (e) => {
            setApprovingId(null);
            message.error(resolveError(e, 'Không thể duyệt phiếu'));
        },
    });

    const { mutateAsync: rejectReq, isPending: isRejecting } = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => technicalPurchaseService.reject(id, reason),
        onSuccess: () => {
            invalidate();
            message.success('Đã từ chối phiếu');
            setRejectTarget(null);
            setRejectReason('');
            setSelectedId(null);
        },
        onError: (e) => message.error(resolveError(e, 'Không thể từ chối')),
    });

    const exportXlsx = async (record: PurchaseRequest) => {
        try {
            await technicalPurchaseService.exportXlsx(
                record.id,
                `Giay_De_Nghi_Mua_Vat_Tu_${record.requestCode || record.id}`
            );
        } catch {
            message.error('Không thể tải file Excel');
        }
    };

    const isOwner = (r?: PurchaseRequest | null) =>
        Boolean(r && user?.id && (typeof r.requestedBy === 'string' ? r.requestedBy : (r.requestedBy as any)?.id) === user.id);
    const canEdit = (r?: PurchaseRequest | null) => Boolean(r && r.status === 'pending' && (isManager || isOwner(r)));

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
            title: 'Người đề nghị',
            key: 'requester',
            responsive: ['sm'] as any,
            render: (_: any, r: PurchaseRequest) => (
                <div className='flex flex-col'>
                    <span className='font-medium text-slate-700'>{r.requesterName || resolveUser(r.requestedBy)}</span>
                    <span className='text-xs text-slate-400'>{r.department || 'Kỹ thuật'}</span>
                </div>
            ),
        },
        {
            title: 'Ngày đề nghị',
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
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 140,
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
                            onClick={() => setSelectedId(record.id)}
                            className='text-slate-400 hover:text-blue-600'
                        />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const tabs: { key: Tab; label: string }[] = [
        { key: 'mine', label: 'Của tôi' },
        ...(isManager ? ([{ key: 'pending', label: 'Chờ duyệt' }] as { key: Tab; label: string }[]) : []),
        { key: 'all', label: 'Tất cả' },
    ];

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (r: PurchaseRequest) => {
        setEditing(r);
        setFormOpen(true);
    };

    return (
        <>
            <PageHeader
                title='Đề Nghị Mua Vật Tư (Kỹ thuật)'
                subtitle='Bộ phận kỹ thuật lập giấy đề nghị mua vật tư / phụ tùng và xuất phiếu in ký duyệt.'
                actions={
                    <div className='flex gap-2'>
                        <Button icon={<ReloadOutlined />} onClick={invalidate} />
                        <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
                            Tạo đề nghị
                        </Button>
                    </div>
                }
            />

            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                {/* Tabs */}
                <div className='border-b border-slate-100 px-4 pt-1 sm:px-5'>
                    <div className='flex gap-0'>
                        {tabs.map((tab) => (
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
                    <div className='flex flex-wrap items-center gap-2'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm mã phiếu, tên người, vật tư...'
                            allowClear
                            value={draftSearch}
                            onChange={(e) => setDraftSearch(e.target.value)}
                            className='w-full sm:w-64'
                        />
                        <Select
                            placeholder='Trạng thái'
                            allowClear
                            value={draftStatus}
                            onChange={(v) => {
                                setDraftStatus(v);
                                setFilters((p) => ({ ...p, status: v }));
                                setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            options={STATUS_OPTIONS}
                            className='w-full sm:w-40'
                            disabled={activeTab === 'pending'}
                        />
                        <RangePicker
                            value={draftRange}
                            onChange={(dates) => {
                                setDraftRange(dates as DateRange);
                                setFilters((p) => ({
                                    ...p,
                                    startDate: dates?.[0]?.startOf('day').toISOString(),
                                    endDate: dates?.[1]?.endOf('day').toISOString(),
                                }));
                                setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            format='DD/MM/YYYY'
                            className='w-full sm:w-60'
                            inputReadOnly={isMobile}
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
                                    onClick={() => setSelectedId(record.id)}
                                    className='flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors active:bg-slate-50'
                                >
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
                                            {record.requesterName || resolveUser(record.requestedBy)}
                                        </div>
                                        <div className='mt-0.5 flex items-center gap-3 text-xs text-slate-400'>
                                            <span>{fmtDate(record.requestDate || record.createdAt)}</span>
                                            <span>·</span>
                                            <span>{record.items?.length ?? 0} loại vật tư</span>
                                        </div>
                                    </div>
                                    <RightOutlined className='shrink-0 text-xs text-slate-300' />
                                </div>
                            ))
                        )}
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
                    <div className='px-5 py-4'>
                        <Table
                            columns={columns}
                            dataSource={requests}
                            rowKey='id'
                            loading={isLoading || isFetching}
                            size='middle'
                            onRow={(record) => ({
                                onClick: () => setSelectedId(record.id),
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
                            locale={{ emptyText: <Empty description='Không có phiếu nào' image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                        />
                    </div>
                )}
            </div>

            {/* Form Drawer */}
            <FormDrawer
                open={formOpen}
                initialValues={editing}
                defaultRequesterName={(user as any)?.name || (user as any)?.fullname || ''}
                submitting={isCreating || isUpdating}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                onSubmit={async (payload) => {
                    if (editing) {
                        await updateReq({ id: editing.id, data: payload });
                    } else {
                        await createReq(payload);
                    }
                }}
            />

            {/* Detail Drawer */}
            <Drawer
                open={!!selectedId}
                onClose={() => setSelectedId(null)}
                width={isMobile ? '100%' : 760}
                placement={isMobile ? 'bottom' : 'right'}
                destroyOnHidden
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                    header: { padding: isMobile ? '12px 16px' : undefined },
                }}
                title={
                    <div className='flex items-center gap-3'>
                        <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600'>
                            <ToolOutlined />
                        </div>
                        <div>
                            <div className='text-sm font-semibold text-slate-900 sm:text-base'>
                                Chi tiết đề nghị
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
                                <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(selectedRequest)} block={isMobile}>
                                    Xuất Excel
                                </Button>
                                {canEdit(selectedRequest) && (
                                    <Button
                                        onClick={() => {
                                            const r = selectedRequest;
                                            setSelectedId(null);
                                            openEdit(r);
                                        }}
                                        block={isMobile}
                                    >
                                        Sửa
                                    </Button>
                                )}
                            </div>
                            <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                                {selectedRequest.status === 'pending' && isManager && (
                                    <>
                                        <Button danger onClick={() => setRejectTarget(selectedRequest)} block={isMobile}>
                                            Từ chối
                                        </Button>
                                        <Button
                                            type='primary'
                                            className='bg-green-600 hover:!bg-green-700'
                                            block={isMobile}
                                            loading={approvingId === selectedRequest.id}
                                            onClick={() => {
                                                Modal.confirm({
                                                    title: 'Duyệt giấy đề nghị mua vật tư?',
                                                    content: 'Sau khi duyệt, phiếu chuyển sang trạng thái "Đã duyệt".',
                                                    okText: 'Duyệt',
                                                    okButtonProps: { className: 'bg-green-600' },
                                                    onOk: () => {
                                                        setApprovingId(selectedRequest.id);
                                                        return approveReq(selectedRequest.id);
                                                    },
                                                });
                                            }}
                                        >
                                            <CheckCircleOutlined /> Duyệt phiếu
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                }
            >
                {selectedRequest ? (
                    <div className='flex-1 overflow-y-auto'>
                        <div className='flex flex-col gap-4 p-4 sm:p-5'>
                            {selectedRequest.status === 'rejected' && (
                                <div className='flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700'>
                                    <CloseCircleOutlined className='mt-0.5 shrink-0' />
                                    <div>
                                        <div className='text-sm font-semibold'>Phiếu bị từ chối</div>
                                        <div className='mt-0.5 text-sm'>{selectedRequest.rejectedReason || '—'}</div>
                                    </div>
                                </div>
                            )}

                            {/* Info */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Thông tin phiếu
                                </div>
                                <div className='p-4 sm:p-5'>
                                    <Descriptions column={isMobile ? 1 : 2} size='small' labelStyle={{ color: '#94a3b8', fontWeight: 500 }}>
                                        <Descriptions.Item label='Mã phiếu'>
                                            <Text copyable className='font-mono font-semibold text-blue-700'>
                                                {selectedRequest.requestCode}
                                            </Text>
                                        </Descriptions.Item>
                                        <Descriptions.Item label='Trạng thái'>
                                            <StatusTag status={selectedRequest.status} />
                                        </Descriptions.Item>
                                        <Descriptions.Item label='Họ và tên'>
                                            {selectedRequest.requesterName || resolveUser(selectedRequest.requestedBy)}
                                        </Descriptions.Item>
                                        <Descriptions.Item label='Bộ phận'>
                                            {selectedRequest.department || 'Kỹ thuật'}
                                        </Descriptions.Item>
                                        <Descriptions.Item label='Ngày đề nghị'>
                                            {fmtDate(selectedRequest.requestDate || selectedRequest.createdAt)}
                                        </Descriptions.Item>
                                        <Descriptions.Item label='Người tạo'>
                                            {resolveUser(selectedRequest.requestedBy)}
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
                                            <Descriptions.Item label='Ghi chú' span={2}>
                                                <Paragraph className='mb-0 text-slate-700'>{selectedRequest.note}</Paragraph>
                                            </Descriptions.Item>
                                        )}
                                    </Descriptions>
                                </div>
                            </div>

                            {/* Items */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Danh sách vật tư · {selectedRequest.items?.length ?? 0} loại
                                </div>
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
                                                <span className='font-medium text-slate-800'>{r.materialName || '—'}</span>
                                            ),
                                        },
                                        { title: 'ĐVT', dataIndex: 'unit', width: 80 },
                                        {
                                            title: 'Số lượng',
                                            dataIndex: 'quantityRequested',
                                            width: 100,
                                            align: 'right' as const,
                                            render: (v: number) => <span className='font-semibold'>{fmtNum(v)}</span>,
                                        },
                                        {
                                            title: 'Ghi chú',
                                            dataIndex: 'note',
                                            width: 160,
                                            render: (v?: string) => <span className='text-sm text-slate-400'>{v || '—'}</span>,
                                        },
                                    ]}
                                />
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
                        <CloseCircleOutlined /> Từ chối giấy đề nghị
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
                    </div>
                    <Input.TextArea
                        rows={4}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder='Nhập lý do từ chối để người đề nghị biết và điều chỉnh...'
                        maxLength={300}
                        showCount
                    />
                </div>
            </Modal>
        </>
    );
};

export default TechnicalPurchaseRequestPage;
