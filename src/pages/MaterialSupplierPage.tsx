import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    App,
    Button,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import type {
    MaterialSupplier,
    MaterialSupplierPayload,
    PurchaseOrder,
    PurchaseOrderStatus,
} from '../core/services/material.service';
import { materialSupplierService, purchaseOrderService } from '../core/services/material.service';
import type { PaginatedResponse } from '../core/types';

const { Text } = Typography;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300;
const SUPPLIER_ORDER_LIMIT = 200;

const PAGE_ANIM = `
@keyframes msp-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.msp-h{animation:msp-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.msp-s{animation:msp-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.msp-f{animation:msp-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.msp-t{animation:msp-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.msp-stat{transition:background-color 130ms cubic-bezier(.22,1,.36,1)}
.msp-stat:hover{background-color:oklch(0.975 0.005 250)}
@media(prefers-reduced-motion:reduce){.msp-h,.msp-s,.msp-f,.msp-t{animation:none}.msp-stat{transition:none}}
`;

type SupplierStatusFilterValue = 'all' | 'active' | 'inactive';

type SupplierFilterState = {
    search: string;
    isActive?: boolean;
};

type SupplierDraftFilterState = {
    search: string;
    status: SupplierStatusFilterValue;
};

type SupplierFormValues = {
    name: string;
    code: string;
    contactName?: string;
    phone?: string;
    address?: string;
    isActive?: boolean;
};

type SupplierFormModalProps = {
    open: boolean;
    submitting: boolean;
    initialValues?: MaterialSupplier | null;
    onClose: () => void;
    onSubmit: (payload: MaterialSupplierPayload) => Promise<void>;
};

const PURCHASE_ORDER_STATUS_META: Record<PurchaseOrderStatus, { color: string; label: string }> = {
    draft:     { color: 'default',    label: 'Bản nháp' },
    sent:      { color: 'gold',       label: 'Đã gửi NCC' },
    confirmed: { color: 'blue',       label: 'Đã xác nhận' },
    ordered:   { color: 'processing', label: 'Đang đặt hàng' },
    partially_received: { color: 'cyan', label: 'Nhận một phần' },
    received:  { color: 'green',      label: 'Đã nhận hàng' },
    cancelled: { color: 'error',      label: 'Đã huỷ' },
};

const createDefaultFilters = (): SupplierFilterState => ({
    search: '',
    isActive: undefined,
});

const createDefaultDraftFilters = (): SupplierDraftFilterState => ({
    search: '',
    status: 'all',
});

const normalizePositiveNumber = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        return fallback;
    }

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

        return {
            data: response.slice(startIndex, startIndex + limit),
            total,
            page: safePage,
            limit,
            totalPages,
        };
    }

    return response;
};

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');

const normalizeOptionalText = (value?: string | null) => {
    const normalized = sanitizeValue(value);
    return normalized || undefined;
};

const normalizeCodeValue = (value?: string | null) => sanitizeValue(value).toUpperCase();

const resolveErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    return fallbackMessage;
};

const formatNumber = (value?: number) => (value ?? 0).toLocaleString('vi-VN');

const formatCurrency = (value?: number) =>
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    }).format(value ?? 0);

const formatDate = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');
const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');

const resolveOrderStatusMeta = (status?: PurchaseOrderStatus | string) => {
    if (!status) {
        return { color: 'default', label: '-' };
    }

    return (
        PURCHASE_ORDER_STATUS_META[status as PurchaseOrderStatus] ?? {
            color: 'default',
            label: status,
        }
    );
};

const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
    open,
    submitting,
    initialValues,
    onClose,
    onSubmit,
}) => {
    const [form] = Form.useForm<SupplierFormValues>();

    useEffect(() => {
        if (!open) {
            return;
        }

        if (initialValues) {
            form.setFieldsValue({
                name: initialValues.name,
                code: initialValues.code,
                contactName: initialValues.contactName,
                phone: initialValues.phone,
                address: initialValues.address,
                isActive: initialValues.isActive !== false,
            });
            return;
        }

        form.resetFields();
        form.setFieldsValue({
            isActive: true,
        });
    }, [form, initialValues, open]);

    const handleSubmit = async () => {
        const values = await form.validateFields();

        await onSubmit({
            name: sanitizeValue(values.name),
            code: normalizeCodeValue(values.code),
            contactName: normalizeOptionalText(values.contactName),
            phone: normalizeOptionalText(values.phone),
            address: normalizeOptionalText(values.address),
            isActive: values.isActive !== false,
        });
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onOk={handleSubmit}
            confirmLoading={submitting}
            title={
                <div className='flex items-center gap-3 border-b border-slate-100 pb-3'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600'>
                        <ShopOutlined />
                    </div>
                    <div>
                        <div className='text-lg font-semibold text-slate-900'>
                            {initialValues ? 'Chỉnh sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
                        </div>
                        <div className='text-sm text-slate-500'>
                            Cập nhật thông tin cơ bản và trạng thái hợp tác của nhà cung cấp vật tư.
                        </div>
                    </div>
                </div>
            }
            okText={initialValues ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            width={720}
            destroyOnHidden
            maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <Form
                form={form}
                layout='vertical'
                initialValues={{ isActive: true }}
                className='mt-5 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg [&_.ant-input-affix-wrapper]:rounded-lg [&_.ant-switch]:bg-slate-300'
            >
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    <Form.Item
                        name='name'
                        label='Tên NCC'
                        rules={[{ required: true, message: 'Vui lòng nhập tên nhà cung cấp' }]}
                    >
                        <Input placeholder='Ví dụ: Công ty ABC' size='large' maxLength={160} />
                    </Form.Item>

                    <Form.Item
                        name='code'
                        label='Mã NCC'
                        getValueFromEvent={(event) => normalizeCodeValue(event?.target?.value)}
                        rules={[{ required: true, message: 'Vui lòng nhập mã nhà cung cấp' }]}
                    >
                        <Input placeholder='Ví dụ: NCC-ABC-01' size='large' maxLength={60} />
                    </Form.Item>

                    <Form.Item name='contactName' label='Người liên hệ'>
                        <Input placeholder='Ví dụ: Nguyễn Văn A' size='large' maxLength={120} />
                    </Form.Item>

                    <Form.Item name='phone' label='Số điện thoại'>
                        <Input placeholder='Ví dụ: 0901234567' size='large' maxLength={40} />
                    </Form.Item>

                    <Form.Item
                        name='isActive'
                        label='Trạng thái'
                        valuePropName='checked'
                        className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'
                    >
                        <Switch checkedChildren='Hoạt động' unCheckedChildren='Ngừng' />
                    </Form.Item>

                    <Form.Item name='address' label='Địa chỉ' className='md:col-span-2'>
                        <Input.TextArea
                            rows={4}
                            placeholder='Nhập địa chỉ nhà cung cấp...'
                            maxLength={300}
                            showCount
                            className='!rounded-lg'
                        />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
};

const MaterialSupplierPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { message, notification } = App.useApp();
    const { role } = useAuth();
    const canManageSuppliers = hasManagerAccess(role);

    const [filters, setFilters] = useState<SupplierFilterState>(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState<SupplierDraftFilterState>(() => createDefaultDraftFilters());
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null);
    const [detailSupplier, setDetailSupplier] = useState<MaterialSupplier | null>(null);
    const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);

    const queryParams = useMemo(
        () => ({
            ...filters,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [filters, pagination.limit, pagination.page]
    );

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const normalizedSearch = normalizeSearchTerm(draftFilters.search);

            setPagination((current) => (current.page === DEFAULT_PAGE ? current : { ...current, page: DEFAULT_PAGE }));
            setFilters((current) =>
                current.search === normalizedSearch
                    ? current
                    : {
                          ...current,
                          search: normalizedSearch,
                      }
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [draftFilters.search]);

    const {
        data: supplierResponse,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['materials', 'suppliers', queryParams],
        queryFn: async () => normalizePaginatedResponse(await materialSupplierService.getAll(queryParams), queryParams),
        placeholderData: (previousData) => previousData,
    });

    const { data: supplierStats } = useQuery({
        queryKey: ['materials', 'suppliers', 'stats', 'all'],
        queryFn: async () =>
            normalizePaginatedResponse(await materialSupplierService.getAll(), {
                page: 1,
                limit: DEFAULT_LIMIT,
            }),
    });

    const { data: activeSupplierStats } = useQuery({
        queryKey: ['materials', 'suppliers', 'stats', 'active'],
        queryFn: async () =>
            normalizePaginatedResponse(await materialSupplierService.getAll({ isActive: true }), {
                page: 1,
                limit: DEFAULT_LIMIT,
            }),
    });

    const { data: inactiveSupplierStats } = useQuery({
        queryKey: ['materials', 'suppliers', 'stats', 'inactive'],
        queryFn: async () =>
            normalizePaginatedResponse(await materialSupplierService.getAll({ isActive: false }), {
                page: 1,
                limit: DEFAULT_LIMIT,
            }),
    });

    const detailSupplierId = detailSupplier?.id;

    const detailOrderQueryParams = useMemo(
        () =>
            detailSupplierId
                ? {
                      supplierId: detailSupplierId,
                      page: 1,
                      limit: SUPPLIER_ORDER_LIMIT,
                  }
                : undefined,
        [detailSupplierId]
    );

    const {
        data: supplierOrderResponse,
        isLoading: isSupplierOrdersLoading,
        isFetching: isSupplierOrdersFetching,
    } = useQuery({
        queryKey: ['materials', 'suppliers', 'orders', detailOrderQueryParams],
        queryFn: async () =>
            normalizePaginatedResponse(
                await purchaseOrderService.getAll(
                    detailOrderQueryParams as {
                        supplierId: string;
                        page: number;
                        limit: number;
                    }
                ),
                detailOrderQueryParams as { page?: number; limit?: number }
            ),
        enabled: Boolean(detailOrderQueryParams),
    });

    const createMutation = useMutation({
        mutationFn: materialSupplierService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'suppliers'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: MaterialSupplierPayload }) =>
            materialSupplierService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'suppliers'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: materialSupplierService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'suppliers'] });
        },
    });

    const suppliers = useMemo(() => supplierResponse?.data ?? [], [supplierResponse?.data]);

    const stats = useMemo(
        () => ({
            total: supplierStats?.total ?? supplierResponse?.total ?? 0,
            active: activeSupplierStats?.total ?? 0,
            inactive: inactiveSupplierStats?.total ?? 0,
        }),
        [activeSupplierStats?.total, inactiveSupplierStats?.total, supplierResponse?.total, supplierStats?.total]
    );

    const supplierOrders = useMemo(() => {
        if (!detailSupplierId) {
            return [];
        }

        return (supplierOrderResponse?.data ?? []).filter((order) => {
            const supplierId = order.supplier?.id ?? order.supplierId;
            return supplierId === detailSupplierId;
        });
    }, [detailSupplierId, supplierOrderResponse?.data]);

    const supplierOrderSummary = useMemo(
        () => ({
            orderCount: supplierOrders.length,
            totalItems: supplierOrders.reduce((sum, order) => sum + order.items.length, 0),
            totalAmount: supplierOrders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0),
        }),
        [supplierOrders]
    );

    const handleStatusChange = (value: SupplierStatusFilterValue) => {
        setDraftFilters((current) => ({ ...current, status: value }));
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters((current) => ({
            ...current,
            isActive: value === 'all' ? undefined : value === 'active',
        }));
    };

    const handleResetFilters = () => {
        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraftFilters(createDefaultDraftFilters());
        setFilters(createDefaultFilters());
    };

    const handleOpenCreate = () => {
        setEditingSupplier(null);
        setIsFormModalOpen(true);
    };

    const handleOpenEdit = (supplier: MaterialSupplier) => {
        setEditingSupplier(supplier);
        setIsFormModalOpen(true);
    };

    const handleOpenDetail = (supplier: MaterialSupplier) => {
        setDetailSupplier(supplier);
    };

    const handleCreateSupplier = async (payload: MaterialSupplierPayload) => {
        try {
            await createMutation.mutateAsync(payload);
            setIsFormModalOpen(false);
            notification.success({
                message: 'Tạo nhà cung cấp thành công',
            });
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể tạo nhà cung cấp. Vui lòng thử lại.'));
            throw error;
        }
    };

    const handleUpdateSupplier = async (payload: MaterialSupplierPayload) => {
        if (!editingSupplier) {
            return;
        }

        try {
            const updatedSupplier = await updateMutation.mutateAsync({
                id: editingSupplier.id,
                data: payload,
            });
            setIsFormModalOpen(false);
            setEditingSupplier(null);
            setDetailSupplier((current) => (current?.id === updatedSupplier.id ? updatedSupplier : current));
            notification.success({
                message: 'Cập nhật nhà cung cấp thành công',
            });
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể cập nhật nhà cung cấp. Vui lòng thử lại.'));
            throw error;
        }
    };

    const handleDeleteSupplier = async (supplier: MaterialSupplier) => {
        try {
            setDeletingSupplierId(supplier.id);
            await deleteMutation.mutateAsync(supplier.id);
            setDetailSupplier((current) => (current?.id === supplier.id ? null : current));
            notification.success({
                message: 'Đã cập nhật trạng thái ngừng hợp tác',
            });
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể xóa nhà cung cấp. Vui lòng thử lại.'));
        } finally {
            setDeletingSupplierId(null);
        }
    };

    const columns: TableColumnsType<MaterialSupplier> = [
        {
            title: 'MÃ NCC',
            dataIndex: 'code',
            key: 'code',
            width: 160,
            render: (value?: string) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {value || '-'}
                </span>
            ),
        },
        {
            title: 'TÊN NCC',
            dataIndex: 'name',
            key: 'name',
            render: (_value, record) => (
                <button
                    type='button'
                    onClick={() => handleOpenDetail(record)}
                    className='text-left text-[14px] font-semibold text-slate-800 transition-colors hover:text-blue-600'
                >
                    {record.name}
                </button>
            ),
        },
        {
            title: 'NGƯỜI LIÊN HỆ',
            dataIndex: 'contactName',
            key: 'contactName',
            render: (value?: string) => <span className='text-slate-700'>{value || '-'}</span>,
        },
        {
            title: 'SỐ ĐIỆN THOẠI',
            dataIndex: 'phone',
            key: 'phone',
            width: 150,
            render: (value?: string) => <span className='text-slate-700'>{value || '-'}</span>,
        },
        {
            title: 'ĐỊA CHỈ',
            dataIndex: 'address',
            key: 'address',
            render: (value?: string) => <span className='text-slate-600'>{value || '-'}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 130,
            render: (isActive?: boolean) =>
                isActive !== false ? <Tag color='success'>Hoạt động</Tag> : <Tag color='error'>Ngừng</Tag>,
        },
        {
            title: 'THAO TÁC',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_value, record) =>
                canManageSuppliers ? (
                    <div className='flex items-center justify-end gap-2'>
                        <Tooltip title='Chỉnh sửa'>
                            <Button
                                type='text'
                                icon={<EditOutlined />}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700'
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenEdit(record);
                                }}
                            />
                        </Tooltip>

                        <ConfirmAction
                            title='Xóa mềm nhà cung cấp'
                            description={`Nhà cung cấp “${record.name}” sẽ được chuyển sang trạng thái ngừng hợp tác.`}
                            okLabel='Xác nhận'
                            onConfirm={() => handleDeleteSupplier(record)}
                        >
                            <div onClick={(event) => event.stopPropagation()}>
                                <Tooltip title='Xóa mềm'>
                                    <Button
                                        type='text'
                                        danger
                                        loading={deletingSupplierId === record.id}
                                        icon={<DeleteOutlined />}
                                        className='flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700'
                                    />
                                </Tooltip>
                            </div>
                        </ConfirmAction>
                    </div>
                ) : null,
        },
    ];

    const orderColumns: TableColumnsType<PurchaseOrder> = [
        {
            title: 'MÃ PO',
            dataIndex: 'orderCode',
            key: 'orderCode',
            width: 160,
            render: (value: string | undefined, record) => (
                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                    {value || record.id}
                </span>
            ),
        },
        {
            title: 'NGÀY ĐẶT',
            key: 'orderedAt',
            width: 130,
            render: (_value, record) => (
                <span className='text-slate-700'>{formatDate(record.orderedAt || record.createdAt)}</span>
            ),
        },
        {
            title: 'SỐ ITEMS',
            key: 'itemsCount',
            width: 110,
            align: 'right',
            render: (_value, record) => <span className='text-slate-700'>{formatNumber(record.items.length)}</span>,
        },
        {
            title: 'TỔNG TIỀN',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 160,
            align: 'right',
            render: (value?: number) => <span className='font-semibold text-slate-800'>{formatCurrency(value)}</span>,
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (value?: PurchaseOrderStatus | string) => {
                const meta = resolveOrderStatusMeta(value);

                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            <div className='msp-h'>
                <PageHeader
                    title='Nhà cung cấp vật tư'
                    subtitle='Quản lý danh sách nhà cung cấp vật tư, trạng thái hợp tác và lịch sử đơn đặt hàng liên quan.'
                />
            </div>

            <div className='msp-s flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Tổng nhà cung cấp', value: stats.total, accent: 'oklch(0.18 0.012 250)' },
                    { label: 'Đang hoạt động', value: stats.active, accent: 'oklch(0.42 0.14 145)' },
                    { label: 'Ngừng hợp tác', value: stats.inactive, accent: 'oklch(0.44 0.16 25)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='msp-stat flex min-w-[160px] flex-1 flex-col gap-0.5 bg-white px-5 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent }}>
                            {formatNumber(value)}
                        </span>
                    </div>
                ))}
            </div>

            <div className='msp-f flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center'>
                <div className='min-w-[240px] flex-1'>
                    <Input
                        allowClear
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tìm theo tên hoặc mã NCC...'
                        value={draftFilters.search}
                        onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                        onPressEnter={() => {
                            setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
                            setFilters((current) => ({
                                ...current,
                                search: normalizeSearchTerm(draftFilters.search),
                            }));
                        }}
                        className='rounded-lg'
                    />
                </div>

                <Select
                    value={draftFilters.status}
                    className='min-w-[170px]'
                    onChange={handleStatusChange}
                    options={[
                        { value: 'all', label: 'Tất cả' },
                        { value: 'active', label: 'Hoạt động' },
                        { value: 'inactive', label: 'Ngừng' },
                    ]}
                />

                <Button icon={<ReloadOutlined />} onClick={handleResetFilters} className='rounded-lg text-slate-500'>
                    Làm mới
                </Button>

                {canManageSuppliers ? (
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        onClick={handleOpenCreate}
                        className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                    >
                        Thêm nhà cung cấp
                    </Button>
                ) : null}
            </div>

            <div className='msp-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table]:!bg-white [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100 [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                    <Table<MaterialSupplier>
                        rowKey='id'
                        columns={columns}
                        dataSource={suppliers}
                        loading={isLoading || isFetching}
                        size='small'
                        scroll={{ x: 980 }}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Chưa có nhà cung cấp phù hợp bộ lọc hiện tại'
                                />
                            ),
                        }}
                        pagination={{
                            current: supplierResponse?.page ?? pagination.page,
                            total: supplierResponse?.total ?? 0,
                            pageSize: supplierResponse?.limit ?? pagination.limit,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {total > 0 ? `${range[0]}-${range[1]} / ${total} nhà cung cấp` : 'Không có kết quả'}
                                </span>
                            ),
                            onChange: (page, pageSize) => setPagination({ page, limit: pageSize }),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                    />
                </div>
            </div>

            <SupplierFormModal
                open={isFormModalOpen}
                submitting={createMutation.isPending || updateMutation.isPending}
                initialValues={editingSupplier}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingSupplier(null);
                }}
                onSubmit={editingSupplier ? handleUpdateSupplier : handleCreateSupplier}
            />

            <Drawer
                title={
                    detailSupplier ? (
                        <div className='flex flex-wrap items-center gap-3'>
                            <span className='font-semibold text-slate-900'>{detailSupplier.name}</span>
                            <Tag color={detailSupplier.isActive !== false ? 'success' : 'error'}>
                                {detailSupplier.isActive !== false ? 'Hoạt động' : 'Ngừng'}
                            </Tag>
                        </div>
                    ) : (
                        'Chi tiết nhà cung cấp'
                    )
                }
                width={960}
                open={Boolean(detailSupplier)}
                onClose={() => setDetailSupplier(null)}
                destroyOnHidden
                styles={{ body: { paddingBottom: 24 } }}
            >
                {detailSupplier ? (
                    <div className='flex flex-col gap-6'>
                        <div className='rounded-xl border border-slate-200 bg-white p-5'>
                            <div className='mb-4 flex items-center gap-3'>
                                <span className='inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700'>
                                    {detailSupplier.code || '-'}
                                </span>
                            </div>

                            <Descriptions
                                column={{ xs: 1, md: 2 }}
                                size='small'
                                className='[&_.ant-descriptions-item-content]:font-medium [&_.ant-descriptions-item-content]:text-slate-800 [&_.ant-descriptions-item-label]:font-medium [&_.ant-descriptions-item-label]:text-slate-500'
                            >
                                <Descriptions.Item label='Tên NCC'>{detailSupplier.name}</Descriptions.Item>
                                <Descriptions.Item label='Mã NCC'>{detailSupplier.code || '-'}</Descriptions.Item>
                                <Descriptions.Item label='Người liên hệ'>
                                    {detailSupplier.contactName || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item label='Số điện thoại'>
                                    {detailSupplier.phone || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item label='Trạng thái'>
                                    {detailSupplier.isActive !== false ? 'Hoạt động' : 'Ngừng hợp tác'}
                                </Descriptions.Item>
                                <Descriptions.Item label='Cập nhật lần cuối'>
                                    {formatDateTime(detailSupplier.updatedAt)}
                                </Descriptions.Item>
                            </Descriptions>

                            <div className='mt-4'>
                                <Text className='font-semibold text-slate-800'>Địa chỉ</Text>
                                <div className='mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600'>
                                    {detailSupplier.address || 'Chưa có địa chỉ'}
                                </div>
                            </div>
                        </div>

                        <div className='grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-3'>
                            {[
                                {
                                    label: 'Tổng đơn hàng',
                                    value: formatNumber(supplierOrderSummary.orderCount),
                                    accent: 'text-slate-900',
                                },
                                {
                                    label: 'Tổng items đã mua',
                                    value: formatNumber(supplierOrderSummary.totalItems),
                                    accent: 'text-blue-600',
                                },
                                {
                                    label: 'Tổng chi phí đã mua',
                                    value: formatCurrency(supplierOrderSummary.totalAmount),
                                    accent: 'text-emerald-600',
                                },
                            ].map(({ label, value, accent }) => (
                                <div key={label} className='flex flex-col gap-0.5 bg-white px-5 py-4'>
                                    <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                                    <span className={`text-base font-bold ${accent}`}>{value}</span>
                                </div>
                            ))}
                        </div>

                        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                            <div className='border-b border-slate-100 px-5 py-4'>
                                <div className='text-sm font-semibold text-slate-900'>Lịch sử đơn hàng</div>
                                <div className='text-xs text-slate-500'>
                                    Dữ liệu lấy từ danh sách đơn đặt hàng theo nhà cung cấp hiện tại.
                                </div>
                            </div>

                            <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400'>
                                <Table<PurchaseOrder>
                                    rowKey='id'
                                    columns={orderColumns}
                                    dataSource={supplierOrders}
                                    loading={isSupplierOrdersLoading || isSupplierOrdersFetching}
                                    pagination={false}
                                    size='small'
                                    scroll={{ x: 760 }}
                                    locale={{
                                        emptyText: (
                                            <Empty
                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                description='Chưa có đơn hàng nào cho nhà cung cấp này'
                                            />
                                        ),
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
};

export default MaterialSupplierPage;
