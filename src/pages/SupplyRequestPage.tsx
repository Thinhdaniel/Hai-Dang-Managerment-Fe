import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { api } from '../core/lib/api';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService } from '../core/services';
import type {
    Material,
    PurchaseRequest,
    PurchaseRequestPayload,
    PurchaseRequestQueryParams,
    PurchaseRequestStatus,
} from '../core/services/material.service';
import { distributionService, materialService, supplyRequestService } from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;
const OPTION_LIMIT = 100;

type SupplyRequestTab = 'mine' | 'pending' | 'all';
type DateRangeValue = [Dayjs, Dayjs];

type SupplyRequestFilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    startDate?: string;
    endDate?: string;
};

type SupplyRequestDraftFilterState = {
    search: string;
    fromPlantId?: string;
    status?: PurchaseRequestStatus;
    dateRange: DateRangeValue | null;
};

type RequestFormItemValue = {
    materialName?: string;
    unit?: string;
    quantityRequested?: number;
    note?: string;
};

type RequestFormValues = {
    fromPlantId?: string;
    note?: string;
    requestDate?: any;
    items: RequestFormItemValue[];
};

type SupplyRequestStats = {
    total: number;
    pending: number;
    approved: number;
    in_progress: number;
    distributed: number;
    rejected: number;
};

type SupplyRequestFormModalProps = {
    open: boolean;
    initialValues?: PurchaseRequest | null;
    plants: Plant[];
    defaultPlantId?: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: Partial<PurchaseRequestPayload>) => Promise<void>;
};

const createDefaultFilters = (): SupplyRequestFilterState => ({
    search: '',
    fromPlantId: undefined,
    status: undefined,
    startDate: undefined,
    endDate: undefined,
});

const createDefaultDraftFilters = (): SupplyRequestDraftFilterState => ({
    search: '',
    fromPlantId: undefined,
    status: undefined,
    dateRange: null,
});

const createEmptyItem = (): RequestFormItemValue => ({
    materialName: '',
    unit: '',
    quantityRequested: 1,
    note: '',
});

const normalizePositiveNumber = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
    return value;
};

const normalizePaginatedResponse = <T,>(
    response: T[] | PaginatedResponse<T>,
    params: Pick<{ page?: number; limit?: number }, 'page' | 'limit'>
): PaginatedResponse<T> => {
    const page = normalizePositiveNumber(params.page, DEFAULT_PAGE);
    const limit = normalizePositiveNumber(params.limit, DEFAULT_LIMIT);
    if (Array.isArray(response)) {
        const total = response.length;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * limit;
        return { data: response.slice(startIndex, startIndex + limit), total, page: safePage, limit, totalPages };
    }
    return response;
};

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');
const normalizeOptionalText = (value?: string | null) => { const n = sanitizeValue(value); return n || undefined; };
const resolveErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') return (error as any).message;
    return fallback;
};
const formatNumber = (value?: number) => (value ?? 0).toLocaleString('vi-VN');
const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');
const parseNumberInput = (value: string | number | null | undefined) => {
    const n = String(value ?? '').replace(/[^\d.-]/g, '');
    return n ? Number(n) : 0;
};
const resolveUserLabel = (value?: string | User) => {
    if (!value) return '-';
    if (typeof value === 'string') return value;
    return (value as any).name || (value as any).email || (value as any).id;
};
const mergeUniqueById = <T extends { id: string }>(items: Array<T | null | undefined>) => {
    const map = new Map<string, T>();
    items.forEach((item) => { if (item?.id) map.set(item.id, item); });
    return Array.from(map.values());
};

const SUPPLY_REQUEST_STATUS_META: Record<string, { color: string; label: string }> = {
    pending:     { color: 'orange',  label: 'Chờ duyệt' },
    approved:    { color: 'blue',    label: 'Đã duyệt' },
    in_progress: { color: 'cyan',    label: 'Đang cấp phát' },
    distributed: { color: 'green',   label: 'Đã nhận hàng' },
    rejected:    { color: 'red',     label: 'Từ chối' },
    cancelled:   { color: 'default', label: 'Đã hủy' },
};

const SUPPLY_REQUEST_STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus; label: string }> = [
    { value: 'pending',     label: 'Chờ duyệt' },
    { value: 'approved',    label: 'Đã duyệt' },
    { value: 'in_progress' as PurchaseRequestStatus, label: 'Đang cấp phát' },
    { value: 'distributed', label: 'Đã nhận hàng' },
    { value: 'rejected',    label: 'Từ chối' },
    { value: 'cancelled',   label: 'Đã hủy' },
];

const parseRequestStatusParam = (value?: string | null): PurchaseRequestStatus | undefined => {
    return SUPPLY_REQUEST_STATUS_OPTIONS.find((o) => o.value === value)?.value;
};


const SupplyRequestFormModal: React.FC<SupplyRequestFormModalProps> = ({
    open, initialValues, plants, defaultPlantId, submitting, onClose, onSubmit,
}) => {
    const [form] = Form.useForm<RequestFormValues>();

    const watchedItems = Form.useWatch('items', form) ?? [];

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
                })) || [createEmptyItem()],
            });
            return;
        }
        form.resetFields();
        form.setFieldsValue({ fromPlantId: defaultPlantId, note: '', requestDate: dayjs(), items: [createEmptyItem()] });
    }, [defaultPlantId, form, initialValues, open]);

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const items = (values.items ?? []).map((i) => ({
            materialName: String(i.materialName ?? '').trim(),
            unit: String(i.unit ?? '').trim(),
            quantityRequested: Number(i.quantityRequested ?? 0),
            note: normalizeOptionalText(i.note),
        }));
        await onSubmit({
            fromPlantId: String(values.fromPlantId),
            note: normalizeOptionalText(values.note),
            requestDate: values.requestDate ? (values.requestDate as any).toISOString() : undefined,
            items: items as any,
        });
    };

    const defaultPlantName = plants.find((p) => p.id === defaultPlantId)?.name || 'Cơ sở hiện tại';

    return (
        <Modal open={open} onCancel={onClose}
            title={
                <div className='flex items-center gap-3 border-b border-slate-100 pb-3'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600'>
                        <PlusOutlined />
                    </div>
                    <div>
                        <div className='text-lg font-semibold text-slate-900'>Tạo đề xuất cấp vật tư</div>
                        <div className='text-sm text-slate-500'>Xin cấp vật tư từ cơ sở chính về cơ sở của bạn.</div>
                    </div>
                </div>
            }
            footer={
                <div className='flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='text-sm font-semibold text-slate-800'>
                        Tổng số loại vật tư: <span className='text-blue-600'>{watchedItems.length}</span>
                    </div>
                    <div className='flex justify-end gap-2'>
                        <Button onClick={onClose}>Huỷ</Button>
                        <Button type='primary' loading={submitting} disabled={!watchedItems.length}
                            onClick={handleSubmit} className='rounded-lg bg-blue-600 hover:!bg-blue-700'>
                            {initialValues ? 'Lưu cập nhật' : 'Tạo đề xuất'}
                        </Button>
                    </div>
                </div>
            }
            width={1000} destroyOnHidden maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <Form form={form} layout='vertical'
                className='mt-5 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg [&_.ant-input-affix-wrapper]:rounded-lg [&_.ant-input-number]:!rounded-lg [&_.ant-select-selector]:rounded-lg'
            >
                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                    <div className='mb-3 text-sm font-semibold text-slate-900'>Thông tin chung</div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <Form.Item label='Cơ sở gửi'>
                            <Input value={defaultPlantName} readOnly className='bg-slate-100 text-slate-600' />
                        </Form.Item>
                        <Form.Item name='fromPlantId' hidden><Input /></Form.Item>

                        <Form.Item name='requestDate' label='Ngày đề xuất'
                            rules={[{ required: true, message: 'Vui lòng chọn ngày đề xuất' }]}>
                            <DatePicker format='DD/MM/YYYY' style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item name='note' label='Lý do / Mục đích đề xuất *' className='md:col-span-2'
                            rules={[
                                { required: true, message: 'Vui lòng nhập lý do đề xuất' },
                                { min: 10, message: 'Tối thiểu 10 ký tự' },
                            ]}>
                            <Input.TextArea rows={3}
                                placeholder='Ghi rõ lý do cần cấp và mục đích sử dụng vật tư...'
                                maxLength={500} showCount />
                        </Form.Item>
                    </div>
                </div>

                <Form.List name='items'>
                    {(fields, { add, remove }) => (
                        <div className='rounded-2xl border border-slate-200 bg-white'>
                            <div className='flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between'>
                                <div>
                                    <div className='text-sm font-semibold text-slate-900'>Danh sách vật tư cần cấp</div>
                                    <div className='text-xs text-slate-500'>Tối thiểu 1 vật tư.</div>
                                </div>
                                <Button icon={<PlusOutlined />} onClick={() => add(createEmptyItem())} className='rounded-lg border-slate-200'>
                                    Thêm vật tư
                                </Button>
                            </div>
                            <div className='overflow-x-auto'>
                                <div className='min-w-[800px]'>
                                    <div className='grid grid-cols-[minmax(0,2fr)_100px_140px_minmax(0,1.5fr)_44px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-bold tracking-[0.07em] text-slate-400 uppercase'>
                                        <div>Tên vật tư</div><div>ĐVT</div><div>Số lượng cần</div><div>Ghi chú</div><div></div>
                                    </div>
                                    {fields.map((field, index) => {
                                        return (
                                            <div key={field.key} className='grid grid-cols-[minmax(0,2fr)_100px_140px_minmax(0,1.5fr)_44px] gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0'>
                                                <Form.Item name={[field.name, 'materialName']}
                                                    rules={[{ required: true, message: 'Nhập tên vật tư' }]}>
                                                    <Input placeholder='Tên vật tư (nhập tay)' maxLength={200} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'unit']}
                                                    rules={[{ required: true, message: 'Nhập ĐVT' }]}>
                                                    <Input placeholder='ĐVT' maxLength={50} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'quantityRequested']}
                                                    rules={[{ required: true, message: 'Nhập số lượng' }]}>
                                                    <InputNumber<number> min={1} className='w-full' placeholder='SL'
                                                        formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                        parser={parseNumberInput} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'note']}>
                                                    <Input placeholder='Ghi chú' maxLength={250} />
                                                </Form.Item>
                                                <div className='flex items-start justify-end pt-1'>
                                                    <Tooltip title='Xoá dòng'>
                                                        <Button type='text' danger disabled={fields.length === 1}
                                                            icon={<DeleteOutlined />} onClick={() => remove(field.name)}
                                                            className='flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 hover:!bg-rose-100' />
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </Form.List>
            </Form>
        </Modal>
    );
};


const SupplyRequestPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID;
    const isMainPlant = Boolean(mainPlantId && user?.plantId === mainPlantId);
    const isCS1Manager = isMainPlant && ['admin', 'manager', 'director'].includes(user?.role ?? '');

    const queryStatus = parseRequestStatusParam(searchParams.get('status'));
    const queryPlantId = searchParams.get('fromPlantId')?.trim() || undefined;

    const [activeTab, setActiveTab] = useState<SupplyRequestTab>(() => queryStatus === 'pending' ? 'pending' : 'mine');
    const [filters, setFilters] = useState<SupplyRequestFilterState>(() => ({
        ...createDefaultFilters(),
        fromPlantId: queryPlantId,
        status: queryStatus && queryStatus !== 'pending' ? queryStatus : undefined,
    }));
    const [draftFilters, setDraftFilters] = useState<SupplyRequestDraftFilterState>(() => ({
        ...createDefaultDraftFilters(),
        fromPlantId: queryPlantId,
        status: queryStatus && queryStatus !== 'pending' ? queryStatus : undefined,
    }));
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [rejectingRequest, setRejectingRequest] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
    const [editingItemsForm] = Form.useForm();
    const [isEditingItems, setIsEditingItems] = useState(false);
    // Per-item approval selections: index → { materialId, quantityApproved }
    const [approvalSelections, setApprovalSelections] = useState<Record<number, { materialId?: string; quantityApproved?: number }>>({});

    const listQueryParams = useMemo<PurchaseRequestQueryParams>(() => ({
        search: filters.search || undefined,
        fromPlantId: activeTab === 'mine' && !isCS1Manager ? user?.plantId : filters.fromPlantId,
        requestedBy: activeTab === 'mine' && isCS1Manager ? user?.id : undefined,
        status: activeTab === 'pending' ? 'pending' : filters.status,
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: pagination.page,
        limit: pagination.limit,
    }), [activeTab, filters, pagination, user?.id, user?.plantId, isCS1Manager]);

    const statsScopeParams = useMemo<PurchaseRequestQueryParams>(() => ({ page: 1, limit: 500 }), []);

    useEffect(() => {
        const id = window.setTimeout(() => {
            const n = normalizeSearchTerm(draftFilters.search);
            setPagination((c) => c.page === DEFAULT_PAGE ? c : { ...c, page: DEFAULT_PAGE });
            setFilters((c) => c.search === n ? c : { ...c, search: n });
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [draftFilters.search]);

    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    // Materials with CS1 stock for approve drawer
    const { data: materialsWithStock = [] } = useQuery({
        queryKey: ['materials', 'with-stock-cs1'],
        queryFn: () => materialService.getAll({ includeStock: true, limit: 1000, isActive: true } as any)
            .then((r: any) => Array.isArray(r) ? r : r.data ?? []),
        enabled: isCS1Manager,
    });

    const { data: requestResponse, isLoading, isFetching } = useQuery({
        queryKey: ['materials', 'supply-requests', listQueryParams],
        queryFn: async () => normalizePaginatedResponse(await supplyRequestService.getAll(listQueryParams), listQueryParams),
        placeholderData: (p) => p,
    });

    const { data: statsResponse } = useQuery({
        queryKey: ['materials', 'supply-requests', 'stats'],
        queryFn: () => supplyRequestService.getAll(statsScopeParams),
        enabled: isCS1Manager,
    });

    const paginatedData = requestResponse as PaginatedResponse<PurchaseRequest> | undefined;
    const requests = paginatedData?.data ?? [];
    const totalRequests = paginatedData?.total ?? 0;

    const stats = useMemo<SupplyRequestStats>(() => {
        const base = { total: 0, pending: 0, approved: 0, in_progress: 0, distributed: 0, rejected: 0 };
        if (!statsResponse) return base;
        const items = Array.isArray(statsResponse) ? statsResponse : (statsResponse as any).data ?? [];
        const total = Array.isArray(statsResponse) ? items.length : (statsResponse as any).total ?? 0;
        return items.reduce((acc: SupplyRequestStats, r: PurchaseRequest) => {
            if (r.status === 'pending')     acc.pending++;
            if (r.status === 'approved')    acc.approved++;
            if ((r.status as string) === 'in_progress') acc.in_progress++;
            if (r.status === 'distributed') acc.distributed++;
            if (r.status === 'rejected')    acc.rejected++;
            return acc;
        }, { ...base, total });
    }, [statsResponse]);

    const selectedRequest = useMemo(() => requests.find((r) => r.id === selectedRequestId), [requests, selectedRequestId]);

    useEffect(() => {
        if (selectedRequest && isCS1Manager && selectedRequest.status === 'pending') {
            editingItemsForm.setFieldsValue({
                items: selectedRequest.items.map((it) => ({
                    ...it, quantityApproved: it.quantityApproved ?? it.quantityRequested,
                })),
            });
        }
    }, [selectedRequest, editingItemsForm, isCS1Manager]);

    const { mutateAsync: createRequest, isPending: isCreating } = useMutation({
        mutationFn: supplyRequestService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            message.success('Tạo phiếu đề xuất cấp vật tư thành công');
            setIsFormModalOpen(false);
        },
        onError: (error) => { message.error(resolveErrorMessage(error, 'Không thể tạo phiếu đề xuất')); },
    });

    const { mutateAsync: updateItems, isPending: isUpdatingItems } = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<PurchaseRequestPayload> }) =>
            supplyRequestService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            message.success('Lưu số lượng cấp phát thành công');
            setIsEditingItems(false);
        },
        onError: (error) => { message.error(resolveErrorMessage(error, 'Không thể cập nhật số lượng')); },
    });

    const { mutateAsync: approveRequest } = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { items: Array<{ materialId: string; quantityApproved: number }> } }) =>
            supplyRequestService.approve(id, payload),
        onSuccess: (approvedRequest) => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            setApprovingRequestId(null);
            setSelectedRequestId(null);
            navigate('/materials/distributions', {
                state: {
                    supplyRequestId: approvedRequest.id,
                    fromPlantId: mainPlantId,
                    toPlantId: approvedRequest.fromPlantId,
                },
            });
        },
        onError: (error: any) => {
            setApprovingRequestId(null);
            message.error(resolveErrorMessage(error, 'Không thể duyệt phiếu'));
        },
    });

    const { mutateAsync: rejectRequest, isPending: isRejecting } = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => supplyRequestService.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            message.success('Đã từ chối phiếu đề xuất');
            setRejectingRequest(null);
            setRejectReason('');
        },
        onError: (error) => { message.error(resolveErrorMessage(error, 'Không thể từ chối phiếu')); },
    });

    const { mutateAsync: confirmDistribution, isPending: isConfirming } = useMutation({
        mutationFn: (distributionId: string) => distributionService.confirm(distributionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] });
            message.success('Xác nhận đã nhận hàng thành công!');
            setSelectedRequestId(null);
        },
        onError: (error) => { message.error(resolveErrorMessage(error, 'Không thể xác nhận nhận hàng')); },
    });

    // Lấy distribution liên kết với supply request đang xem (khi status = in_progress)
    const isInProgress = (selectedRequest?.status as string) === 'in_progress';
    const { data: linkedDistributionRes } = useQuery({
        queryKey: ['materials', 'distributions', 'by-supply-request', selectedRequestId],
        queryFn: () => distributionService.getAll({ supplyRequestId: selectedRequestId!, limit: 1, page: 1 }),
        enabled: !!selectedRequestId && isInProgress,
    });
    const linkedDistribution = useMemo(() => {
        if (!linkedDistributionRes) return null;
        const items = Array.isArray(linkedDistributionRes)
            ? linkedDistributionRes
            : (linkedDistributionRes as any).data ?? [];
        return items[0] ?? null;
    }, [linkedDistributionRes]);
    // Chỉ CS nhận (fromPlantId) mới được confirm; CS1 manager bỏ qua kiểm tra
    const resolveId = (val: any): string | undefined =>
        val && typeof val === 'object' ? val.id ?? String(val._id ?? '') : val;
    const canConfirmReceipt = isInProgress
        && linkedDistribution?.status === 'distributed'
        && (isCS1Manager || resolveId(selectedRequest?.fromPlantId) === user?.plantId);

    const exportSupplyRequestXlsx = async (record: PurchaseRequest) => {
        try {
            const response: any = await api.get(`/supply-requests/${record.id}/export-xlsx`, { responseType: 'blob' });
            const blob = new Blob([response], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Phieu_De_Xuat_Cap_Vat_Tu_${record.requestCode || record.id}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch { message.error('Không thể tải file Excel phiếu đề xuất'); }
    };

    const columns: TableColumnsType<PurchaseRequest> = [
        {
            title: 'Mã phiếu', dataIndex: 'requestCode', key: 'requestCode', width: 160,
            render: (v?: string) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>{v || '-'}</span>
            ),
        },
        { title: 'Cơ sở gửi', key: 'plant', render: (_: any, r: PurchaseRequest) => r.fromPlant?.name || r.plant?.name || '-' },
        { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: formatDateTime },
        {
            title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140,
            render: (s: string) => {
                const m = SUPPLY_REQUEST_STATUS_META[s] ?? { color: 'default', label: s };
                return <Tag color={m.color}>{m.label}</Tag>;
            },
        },
        {
            title: 'Thao tác', key: 'action', width: 120, align: 'right',
            render: (_: any, record: PurchaseRequest) => (
                <div className='flex items-center justify-end gap-1'>
                    <Tooltip title='Xuất phiếu đề xuất (Excel)'>
                        <Button type='text' icon={<DownloadOutlined />}
                            onClick={(e) => { e.stopPropagation(); exportSupplyRequestXlsx(record); }}
                            className='text-slate-400 hover:text-green-600' />
                    </Tooltip>
                    <Tooltip title='Xem chi tiết'>
                        <Button type='text' icon={<EyeOutlined />}
                            onClick={() => setSelectedRequestId(record.id)}
                            className='text-slate-400 hover:text-blue-600' />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const STAT_COLORS: Record<string, { text: string; border: string; bg: string }> = {
        blue:   { text: '#1d4ed8', border: '#93c5fd', bg: '#eff6ff' },
        orange: { text: '#c2410c', border: '#fdba74', bg: '#fff7ed' },
        cyan:   { text: '#0e7490', border: '#67e8f9', bg: '#ecfeff' },
        green:  { text: '#15803d', border: '#86efac', bg: '#f0fdf4' },
        red:    { text: '#b91c1c', border: '#fca5a5', bg: '#fef2f2' },
        slate:  { text: '#475569', border: '#cbd5e1', bg: '#f8fafc' },
    };

    const StatCard = ({
        title, value, color, active, onClick,
    }: { title: string; value: number; color: string; active?: boolean; onClick?: () => void }) => {
        const palette = STAT_COLORS[color] ?? STAT_COLORS.slate;
        return (
            <div
                onClick={onClick}
                style={active ? { borderColor: palette.border, backgroundColor: palette.bg } : undefined}
                className={[
                    'mpr-stat rounded-2xl border p-5 transition-all',
                    onClick ? 'cursor-pointer hover:shadow-md' : '',
                    active ? 'shadow-sm' : 'border-slate-200 bg-white',
                ].join(' ')}
            >
                <div className='text-xs font-medium uppercase tracking-wide text-slate-400'>{title}</div>
                <div style={{ color: palette.text }} className='mt-1.5 text-3xl font-bold'>{formatNumber(value)}</div>
            </div>
        );
    };

    return (
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8'>
            <div className='mpr-h'>
                <PageHeader title='Đề xuất cấp vật tư' />
            </div>

            {isCS1Manager && (
                <div className='mpr-s grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                    <StatCard title='Tổng phiếu' value={stats.total} color='blue'
                        active={activeTab === 'all' && !filters.status}
                        onClick={() => { setActiveTab('all'); setFilters((p) => ({ ...p, status: undefined })); setDraftFilters((p) => ({ ...p, status: undefined })); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                    <StatCard title='Chờ duyệt' value={stats.pending} color='orange'
                        active={activeTab === 'pending'}
                        onClick={() => { setActiveTab('pending'); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                    <StatCard title='Đã duyệt' value={stats.approved} color='blue'
                        active={activeTab === 'all' && filters.status === 'approved'}
                        onClick={() => { setActiveTab('all'); setFilters((p) => ({ ...p, status: 'approved' })); setDraftFilters((p) => ({ ...p, status: 'approved' })); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                    <StatCard title='Đang cấp phát' value={stats.in_progress} color='cyan'
                        active={activeTab === 'all' && filters.status === ('in_progress' as PurchaseRequestStatus)}
                        onClick={() => { setActiveTab('all'); setFilters((p) => ({ ...p, status: 'in_progress' as PurchaseRequestStatus })); setDraftFilters((p) => ({ ...p, status: 'in_progress' as PurchaseRequestStatus })); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                    <StatCard title='Đã nhận hàng' value={stats.distributed} color='green'
                        active={activeTab === 'all' && filters.status === 'distributed'}
                        onClick={() => { setActiveTab('all'); setFilters((p) => ({ ...p, status: 'distributed' })); setDraftFilters((p) => ({ ...p, status: 'distributed' })); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                    <StatCard title='Từ chối' value={stats.rejected} color='red'
                        active={activeTab === 'all' && filters.status === 'rejected'}
                        onClick={() => { setActiveTab('all'); setFilters((p) => ({ ...p, status: 'rejected' })); setDraftFilters((p) => ({ ...p, status: 'rejected' })); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }} />
                </div>
            )}

            <div className='mpr-f flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='mpr-tabs border-b border-slate-100'>
                    <Tabs activeKey={activeTab}
                        onChange={(key) => { setActiveTab(key as SupplyRequestTab); setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT }); }}
                        items={[
                            { key: 'mine', label: 'Phiếu của tôi' },
                            ...(isCS1Manager ? [{ key: 'pending', label: 'Chờ xử lý (CS1)' }] : []),
                            { key: 'all', label: 'Tất cả' },
                        ]}
                    />
                </div>

                <div className='flex flex-wrap items-center justify-between gap-4'>
                    <div className='flex flex-wrap items-center gap-3'>
                        <Input placeholder='Tìm mã phiếu, ghi chú...' prefix={<SearchOutlined className='text-slate-400' />}
                            value={draftFilters.search}
                            onChange={(e) => setDraftFilters((p) => ({ ...p, search: e.target.value }))}
                            className='w-64' allowClear />
                        {isCS1Manager && (
                            <Select placeholder='Cơ sở gửi' allowClear value={draftFilters.fromPlantId}
                                onChange={(v) => { setDraftFilters((p) => ({ ...p, fromPlantId: v })); setFilters((p) => ({ ...p, fromPlantId: v })); setPagination((p) => ({ ...p, page: 1 })); }}
                                options={plants.map((p: Plant) => ({ label: p.name, value: p.id }))} className='w-48' />
                        )}
                        <Select placeholder='Trạng thái' allowClear value={draftFilters.status}
                            onChange={(v) => { setDraftFilters((p) => ({ ...p, status: v })); setFilters((p) => ({ ...p, status: v })); setPagination((p) => ({ ...p, page: 1 })); }}
                            options={SUPPLY_REQUEST_STATUS_OPTIONS} className='w-40' />
                        <RangePicker value={draftFilters.dateRange}
                            onChange={(dates) => {
                                setDraftFilters((p) => ({ ...p, dateRange: dates as any }));
                                setFilters((p) => ({ ...p, startDate: dates?.[0]?.startOf('day').toISOString(), endDate: dates?.[1]?.endOf('day').toISOString() }));
                                setPagination((p) => ({ ...p, page: 1 }));
                            }}
                            format='DD/MM/YYYY' className='w-64' />
                    </div>
                    <div className='flex items-center gap-2'>
                        <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] })} />
                        {!isMainPlant && (
                            <Button type='primary' icon={<PlusOutlined />} onClick={() => setIsFormModalOpen(true)}>
                                Tạo đề xuất
                            </Button>
                        )}
                    </div>
                </div>

                <div className='mpr-t'>
                    <Table columns={columns} dataSource={requests} rowKey='id'
                        loading={isLoading || isFetching}
                        pagination={{
                            current: pagination.page, pageSize: pagination.limit, total: totalRequests,
                            showSizeChanger: true,
                            onChange: (page, limit) => setPagination({ page, limit }),
                            showTotal: (total) => `Tổng số ${total} bản ghi`,
                        }}
                        locale={{ emptyText: <Empty description='Không có dữ liệu' image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    />
                </div>
            </div>

            <SupplyRequestFormModal open={isFormModalOpen} plants={plants} defaultPlantId={user?.plantId}
                submitting={isCreating} onClose={() => setIsFormModalOpen(false)}
                onSubmit={async (payload) => { await createRequest(payload); }} />

            <Drawer open={!!selectedRequestId}
                onClose={() => { setSelectedRequestId(null); setIsEditingItems(false); setApprovalSelections({}); }}
                width={800}
                title={
                    <div className='flex items-center gap-3'>
                        <span className='text-lg font-bold'>Chi tiết Đề xuất cấp vật tư</span>
                        {selectedRequest && (
                            <Tag color={SUPPLY_REQUEST_STATUS_META[selectedRequest.status]?.color || 'default'}>
                                {SUPPLY_REQUEST_STATUS_META[selectedRequest.status]?.label || selectedRequest.status}
                            </Tag>
                        )}
                    </div>
                }
                footer={
                    selectedRequest && (
                        // Footer cho CS1 Manager: duyệt/từ chối khi pending
                        (selectedRequest.status === 'pending' && isCS1Manager) ? (
                            <div className='flex justify-end gap-3'>
                                <Button icon={<DownloadOutlined />} onClick={() => exportSupplyRequestXlsx(selectedRequest)}>
                                    Xuất Excel
                                </Button>
                                <Button danger onClick={() => setRejectingRequest(selectedRequest)}>Từ chối</Button>
                                <Button type='primary' className='bg-green-600 hover:bg-green-700'
                                    loading={approvingRequestId === selectedRequest.id}
                                    onClick={() => {
                                        const missing = selectedRequest.items.findIndex((_: any, idx: number) => !approvalSelections[idx]?.materialId);
                                        if (missing !== -1) {
                                            message.error(`Vui lòng chọn vật tư thực tế cho dòng ${missing + 1}`);
                                            return;
                                        }
                                        const items = selectedRequest.items.map((_: any, idx: number) => ({
                                            materialId: approvalSelections[idx]!.materialId!,
                                            quantityApproved: approvalSelections[idx]?.quantityApproved ?? selectedRequest.items[idx].quantityRequested,
                                        }));
                                        Modal.confirm({
                                            title: 'Duyệt phiếu đề xuất?',
                                            content: 'Sau khi duyệt, bạn sẽ được chuyển sang trang tạo phiếu cấp phát.',
                                            okText: 'Duyệt',
                                            onOk: () => {
                                                setApprovingRequestId(selectedRequest.id);
                                                return approveRequest({ id: selectedRequest.id, payload: { items } });
                                            },
                                        });
                                    }}>
                                    Duyệt phiếu
                                </Button>
                            </div>
                        )
                        // Footer cho cơ sở đề xuất: xác nhận nhận hàng khi in_progress
                        : canConfirmReceipt ? (
                            <div className='flex items-center justify-between gap-3'>
                                <div className='flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-700'>
                                    <span className='font-semibold'>📦 Hàng đang được vận chuyển đến cơ sở bạn.</span>
                                    <span className='text-cyan-600'>Sau khi nhận hàng thực tế, bấm xác nhận.</span>
                                </div>
                                <Button
                                    type='primary'
                                    loading={isConfirming}
                                    className='bg-green-600 hover:!bg-green-700'
                                    onClick={() => {
                                        if (!linkedDistribution?.id) return;
                                        Modal.confirm({
                                            title: 'Xác nhận đã nhận hàng?',
                                            content: 'Thao tác này xác nhận cơ sở đã nhận đủ vật tư theo phiếu cấp phát. Không thể hoàn tác.',
                                            okText: 'Xác nhận đã nhận',
                                            okButtonProps: { className: 'bg-green-600' },
                                            cancelText: 'Huỷ',
                                            onOk: () => confirmDistribution(linkedDistribution.id),
                                        });
                                    }}
                                >
                                    ✓ Xác nhận đã nhận hàng
                                </Button>
                            </div>
                        )
                        : null
                    )
                }
            >
                {selectedRequest ? (
                    <div className='flex flex-col gap-6'>
                        <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                            <Descriptions column={2} size='small'>
                                <Descriptions.Item label='Mã phiếu'>
                                    <Text copyable className='font-semibold'>{selectedRequest.requestCode}</Text>
                                </Descriptions.Item>
                                <Descriptions.Item label='Cơ sở gửi'>{selectedRequest.fromPlant?.name || selectedRequest.plant?.name || '-'}</Descriptions.Item>
                                <Descriptions.Item label='Ngày đề xuất'>
                                    {selectedRequest.requestDate ? dayjs(selectedRequest.requestDate).format('DD/MM/YYYY') : '-'}
                                </Descriptions.Item>
                                <Descriptions.Item label='Ngày tạo'>{formatDateTime(selectedRequest.createdAt)}</Descriptions.Item>
                                <Descriptions.Item label='Người tạo'>{resolveUserLabel(selectedRequest.requestedBy)}</Descriptions.Item>
                                <Descriptions.Item label='Trạng thái'>
                                    <Tag color={SUPPLY_REQUEST_STATUS_META[selectedRequest.status]?.color || 'default'}>
                                        {SUPPLY_REQUEST_STATUS_META[selectedRequest.status]?.label || selectedRequest.status}
                                    </Tag>
                                </Descriptions.Item>
                                {selectedRequest.note && (
                                    <Descriptions.Item label='Lý do / Mục đích đề xuất' span={2}>
                                        <Text className='text-slate-700'>{selectedRequest.note}</Text>
                                    </Descriptions.Item>
                                )}
                            </Descriptions>
                        </div>

                        {selectedRequest.status === 'rejected' && selectedRequest.rejectedReason && (
                            <div className='rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 flex gap-2'>
                                <WarningOutlined className='mt-1' />
                                <div>
                                    <div className='font-semibold'>Lý do từ chối:</div>
                                    <div>{selectedRequest.rejectedReason}</div>
                                </div>
                            </div>
                        )}

                        <div className='flex flex-col gap-3'>
                            <div className='font-semibold text-slate-800'>Danh sách vật tư yêu cầu</div>
                            <Table
                                dataSource={selectedRequest.items}
                                rowKey={(_, idx) => String(idx)}
                                pagination={false}
                                size='small'
                                columns={[
                                    { title: 'Tên đề xuất', key: 'name', render: (_: any, r: any) => <span className='font-medium'>{r.materialName || '-'}</span> },
                                    { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 80 },
                                    { title: 'SL đề xuất', dataIndex: 'quantityRequested', key: 'qtyR', width: 100, align: 'right', render: formatNumber },
                                    ...(isCS1Manager && selectedRequest.status === 'pending' ? [
                                        {
                                            title: 'Chọn vật tư thực tế',
                                            key: 'material',
                                            width: 280,
                                            render: (_: any, _r: any, idx: number) => (
                                                <div className='flex flex-col gap-1'>
                                                    <Select
                                                        showSearch
                                                        placeholder='Chọn vật tư...'
                                                        optionFilterProp='label'
                                                        style={{ width: '100%' }}
                                                        value={approvalSelections[idx]?.materialId}
                                                        onChange={(val) => setApprovalSelections((prev) => ({
                                                            ...prev,
                                                            [idx]: { ...prev[idx], materialId: val },
                                                        }))}
                                                        options={(materialsWithStock as any[]).map((m: any) => ({
                                                            value: m.id,
                                                            label: `${m.code} - ${m.name}`,
                                                        }))}
                                                        optionRender={(opt) => {
                                                            const m = (materialsWithStock as any[]).find((x: any) => x.id === opt.value);
                                                            const cs1Stock = m?.cs1CurrentStock ?? null;
                                                            return (
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                                    <span style={{ flex: 1 }}>{opt.label}</span>
                                                                    {cs1Stock === null ? (
                                                                        <Tag color='error' style={{ fontSize: 10, margin: 0 }}>⚠ Chưa có trong kho</Tag>
                                                                    ) : cs1Stock > 0 ? (
                                                                        <Tag color='success' style={{ fontSize: 10, margin: 0 }}>Còn {cs1Stock} {m?.unit}</Tag>
                                                                    ) : (
                                                                        <Tag color='warning' style={{ fontSize: 10, margin: 0 }}>⚠ Không có tồn kho</Tag>
                                                                    )}
                                                                </div>
                                                            );
                                                        }}
                                                    />
                                                </div>
                                            ),
                                        },
                                        {
                                            title: 'SL duyệt',
                                            key: 'qtyA',
                                            width: 110,
                                            render: (_: any, r: any, idx: number) => (
                                                <InputNumber
                                                    min={1}
                                                    size='small'
                                                    style={{ width: '100%' }}
                                                    value={approvalSelections[idx]?.quantityApproved ?? r.quantityRequested}
                                                    onChange={(v) => setApprovalSelections((prev) => ({
                                                        ...prev,
                                                        [idx]: { ...prev[idx], quantityApproved: v ?? r.quantityRequested },
                                                    }))}
                                                />
                                            ),
                                        },
                                    ] : [
                                        { title: 'SL duyệt', key: 'qtyA', width: 100, align: 'right' as const, render: (_: any, r: any) => formatNumber(r.quantityApproved ?? r.quantityRequested) },
                                    ]),
                                    { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (v?: string) => v || '-' },
                                ]}
                            />
                        </div>
                    </div>
                ) : (
                    <Empty description='Không có dữ liệu' />
                )}
            </Drawer>

            <Modal open={Boolean(rejectingRequest)} title='Nhập lý do từ chối'
                okText='Xác nhận từ chối' cancelText='Huỷ'
                confirmLoading={isRejecting}
                onOk={async () => {
                    if (!rejectingRequest || !rejectReason.trim()) { message.warning('Vui lòng nhập lý do từ chối'); return; }
                    await rejectRequest({ id: rejectingRequest.id, reason: rejectReason.trim() });
                }}
                onCancel={() => { setRejectingRequest(null); setRejectReason(''); }}
                destroyOnHidden>
                <div className='mt-4 flex flex-col gap-3'>
                    <div className='text-sm text-slate-500'>
                        Phiếu: <span className='font-semibold text-slate-800'>{rejectingRequest?.requestCode || rejectingRequest?.id}</span>
                    </div>
                    <Input.TextArea rows={4} value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder='Nhập lý do từ chối...' maxLength={300} showCount />
                </div>
            </Modal>
        </div>
    );
};

export default SupplyRequestPage;
