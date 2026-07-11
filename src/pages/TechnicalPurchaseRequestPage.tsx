import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    Image,
    Input,
    InputNumber,
    Modal,
    Select,
    Table,
    Tag,
    Tooltip,
    Typography,
    Upload,
    type TableColumnsType,
} from 'antd';
import {
    CameraOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
    InboxOutlined,
    LoadingOutlined,
    MessageOutlined,
    PlusOutlined,
    ReloadOutlined,
    RightOutlined,
    SearchOutlined,
    SendOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import ContextChatDrawer from '../components/chat/ContextChatDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { APP_ENVs } from '../core/config/enviroments';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { assetService } from '../core/services/asset.service';
import {
    technicalPurchaseService,
    type PurchaseRequest,
    type PurchaseRequestQueryParams,
    type PurchaseRequestStatus,
    type TechnicalMaterialSuggestion,
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
type FormItemValue = {
    materialName?: string;
    unit?: string;
    quantityRequested?: number;
    note?: string;
    assetId?: string;
    imageUrls?: string[];
};
type FormValues = {
    requesterName?: string;
    department?: string;
    requestDate?: Dayjs;
    note?: string;
    items: FormItemValue[];
};

const STATUS_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pending: { color: 'orange', label: 'Chờ duyệt', icon: <ClockCircleOutlined /> },
    approved: { color: 'green', label: 'Đã duyệt — chờ mua', icon: <CheckCircleOutlined /> },
    in_progress: { color: 'blue', label: 'Đã vào đề xuất mua', icon: <InboxOutlined /> },
    received: { color: 'cyan', label: 'Đã nhận hàng', icon: <CheckCircleOutlined /> },
    rejected: { color: 'red', label: 'Từ chối', icon: <CloseCircleOutlined /> },
};

const STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus; label: string }> = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt — chờ mua' },
    { value: 'in_progress', label: 'Đã vào đề xuất mua' },
    { value: 'received', label: 'Đã nhận hàng' },
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
const emptyItem = (): FormItemValue => ({ materialName: '', unit: '', quantityRequested: 1, note: '', imageUrls: [] });

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
    const m = STATUS_META[status] ?? { color: 'default', label: status, icon: null };
    return (
        <Tag color={m.color} icon={m.icon} style={{ margin: 0 }}>
            {m.label}
        </Tag>
    );
};

// ── Upload ảnh linh kiện lên Cloudinary (unsigned preset, cùng pattern HandoverModal) ──
const uploadItemImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', APP_ENVs.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'technical-purchase');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${APP_ENVs.CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) throw new Error('Upload ảnh thất bại');
    const data = await res.json();
    return data.secure_url as string;
};

// Field ảnh cho 1 dòng vật tư — dùng trong Form.Item (antd bơm value/onChange)
const ItemImageField: React.FC<{ value?: string[]; onChange?: (value: string[]) => void }> = ({
    value = [],
    onChange,
}) => {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);

    const pick = async (file: File) => {
        if (value.length >= 3) {
            message.warning('Tối đa 3 ảnh mỗi vật tư');
            return false;
        }
        setUploading(true);
        try {
            const url = await uploadItemImage(file);
            onChange?.([...value, url]);
        } catch {
            message.error('Không tải được ảnh lên, thử lại');
        } finally {
            setUploading(false);
        }
        return false;
    };

    return (
        <div className='flex items-center gap-2'>
            <Image.PreviewGroup>
                {value.map((url) => (
                    <div key={url} className='relative shrink-0'>
                        <Image
                            src={url}
                            width={42}
                            height={42}
                            style={{ objectFit: 'cover', borderRadius: 8 }}
                            alt='Ảnh vật tư'
                        />
                        <button
                            type='button'
                            aria-label='Xoá ảnh'
                            onClick={() => onChange?.(value.filter((item) => item !== url))}
                            className='absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] leading-none text-white'
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </Image.PreviewGroup>
            {value.length < 3 && (
                <Upload accept='image/*' showUploadList={false} beforeUpload={pick} disabled={uploading}>
                    <button
                        type='button'
                        className='flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-blue-400 hover:text-blue-500'
                    >
                        {uploading ? <LoadingOutlined /> : <CameraOutlined />}
                    </button>
                </Upload>
            )}
            {!value.length && <span className='text-xs text-slate-400'>Chụp linh kiện hỏng để người mua dễ tìm</span>}
        </div>
    );
};

// ── FormDrawer (tạo / sửa) ──────────────────────────────────────────────────────
const FormDrawer: React.FC<{
    open: boolean;
    initialValues?: PurchaseRequest | null;
    defaultRequesterName?: string;
    plantId?: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (payload: TechnicalPurchasePayload) => Promise<void>;
}> = ({ open, initialValues, defaultRequesterName, plantId, submitting, onClose, onSubmit }) => {
    const [form] = Form.useForm<FormValues>();
    const watchedItems: FormItemValue[] = Form.useWatch('items', form) ?? [];
    const requesterName = Form.useWatch('requesterName', form);
    const department = Form.useWatch('department', form);
    const requestDate = Form.useWatch('requestDate', form);
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const [infoOpen, setInfoOpen] = useState(false);
    // Ghi chú / ảnh mỗi dòng ẩn mặc định cho form gọn — bấm chip mới mở
    const [extraOpen, setExtraOpen] = useState<Record<number, { note?: boolean; images?: boolean }>>({});
    const [suggestions, setSuggestions] = useState<TechnicalMaterialSuggestion[]>([]);
    const suggestTimer = useRef<number | undefined>(undefined);

    // Danh sách máy của cơ sở để gắn vào dòng vật tư (tải 1 lần khi mở form)
    const assetsQuery = useQuery({
        queryKey: ['technical-purchase-assets', plantId ?? 'all'],
        queryFn: () => assetService.getAll({ plantId: plantId || undefined, page: 1, limit: 500 }),
        enabled: open,
        staleTime: 5 * 60_000,
    });
    const assetOptions = useMemo(() => {
        const options = (assetsQuery.data?.data ?? []).map((asset) => ({
            value: asset.id,
            label: `${asset.machineCode} — ${asset.name}`,
        }));
        const known = new Set(options.map((option) => option.value));
        // Phiếu cũ có thể gắn máy đã chuyển cơ sở/xoá — vẫn hiện bằng snapshot
        (initialValues?.items ?? []).forEach((item) => {
            if (item.assetId && !known.has(item.assetId)) {
                known.add(item.assetId);
                options.push({
                    value: item.assetId,
                    label: `${item.assetCode || '—'} — ${item.assetName || 'Máy'}`,
                });
            }
        });
        return options;
    }, [assetsQuery.data, initialValues]);

    const fetchSuggestions = (search: string) => {
        window.clearTimeout(suggestTimer.current);
        suggestTimer.current = window.setTimeout(async () => {
            try {
                setSuggestions(await technicalPurchaseService.getMaterialSuggestions(search.trim()));
            } catch {
                // Gợi ý lỗi thì thôi — người dùng vẫn gõ tự do được
            }
        }, 250);
    };

    const suggestionOptions = useMemo(
        () =>
            suggestions.map((item) => ({
                value: item.name,
                label: (
                    <div className='flex items-center justify-between gap-2'>
                        <span className='truncate'>{item.name}</span>
                        <span className='shrink-0 text-[11px] text-slate-400'>
                            {item.unit ? `${item.unit} · ` : ''}
                            {item.source === 'history' ? `đã mua ${item.count ?? 1} lần` : 'danh mục'}
                        </span>
                    </div>
                ),
            })),
        [suggestions]
    );

    useEffect(() => {
        if (!open) return;
        setInfoOpen(false);
        fetchSuggestions('');
        if (initialValues) {
            setExtraOpen(
                Object.fromEntries(
                    initialValues.items.map((item, index) => [
                        index,
                        { note: Boolean(item.note), images: Boolean(item.imageUrls?.length) },
                    ])
                )
            );
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
                    assetId: i.assetId,
                    imageUrls: i.imageUrls ?? [],
                })),
            });
        } else {
            setExtraOpen({});
            form.resetFields();
            form.setFieldsValue({
                requesterName: defaultRequesterName || '',
                department: 'Kỹ thuật',
                requestDate: dayjs(),
                items: [emptyItem()],
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialValues, defaultRequesterName, form]);

    const toggleExtra = (name: number, key: 'note' | 'images') =>
        setExtraOpen((current) => ({ ...current, [name]: { ...current[name], [key]: !current[name]?.[key] } }));

    const handleSubmit = async () => {
        try {
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
                    assetId: i.assetId || undefined,
                    imageUrls: i.imageUrls?.length ? i.imageUrls : undefined,
                })),
            });
        } catch (error: any) {
            // Field bắt buộc nằm trong khối thông tin đang thu gọn → mở ra cho người dùng thấy lỗi
            const errorFields: Array<{ name: (string | number)[] }> = error?.errorFields ?? [];
            if (errorFields.some((f) => ['requesterName', 'requestDate'].includes(String(f.name?.[0])))) {
                setInfoOpen(true);
            }
            if (!errorFields.length) throw error;
        }
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
                {/* Thông tin chung — điền sẵn, thu gọn 1 dòng; bấm Sửa mới mở */}
                <div className='shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6'>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0 truncate text-sm text-slate-600'>
                            <span className='font-semibold text-slate-800'>{requesterName || '—'}</span>
                            <span className='text-slate-400'>
                                {' '}
                                · {department || 'Kỹ thuật'} · {requestDate ? requestDate.format('DD/MM/YYYY') : '—'}
                            </span>
                        </div>
                        <Button
                            size='small'
                            type='text'
                            icon={<EditOutlined />}
                            onClick={() => setInfoOpen((v) => !v)}
                            className='shrink-0 text-slate-400'
                        >
                            {infoOpen ? 'Thu gọn' : 'Sửa'}
                        </Button>
                    </div>
                    <div className={infoOpen ? 'mt-3 grid grid-cols-2 gap-3' : 'hidden'}>
                        <Form.Item
                            name='requesterName'
                            label='Họ và tên người đề nghị'
                            className='col-span-2 mb-0 sm:col-span-1'
                            rules={[{ required: true, message: 'Nhập họ và tên' }]}
                        >
                            <Input placeholder='VD: Nguyễn Văn A' maxLength={120} allowClear />
                        </Form.Item>
                        <Form.Item name='department' label='Bộ phận' className='col-span-2 mb-0 sm:col-span-1'>
                            <Input placeholder='Kỹ thuật' maxLength={120} allowClear />
                        </Form.Item>
                        <Form.Item
                            name='requestDate'
                            label='Ngày đề nghị'
                            className='col-span-2 mb-0 sm:col-span-1'
                            rules={[{ required: true, message: 'Chọn ngày' }]}
                        >
                            <DatePicker format='DD/MM/YYYY' className='w-full' inputReadOnly={isMobile} />
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

                                {fields.map((field, index) => {
                                    const itemValue = watchedItems[field.name] ?? {};
                                    const extra = extraOpen[field.name] ?? {};
                                    const showNote = Boolean(extra.note || itemValue.note);
                                    const showImages = Boolean(extra.images || itemValue.imageUrls?.length);
                                    return (
                                        <div
                                            key={field.key}
                                            className='rounded-xl border border-slate-200 bg-white p-3 transition-colors focus-within:border-blue-300'
                                        >
                                            {/* Hàng 1: tên vật tư (gợi ý) + số lượng + xoá */}
                                            <div className='flex items-start gap-2'>
                                                <span className='mt-1.5 inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[11px] font-bold text-blue-600'>
                                                    {index + 1}
                                                </span>
                                                <Form.Item
                                                    name={[field.name, 'materialName']}
                                                    className='mb-0 min-w-0 flex-1'
                                                    rules={[{ required: true, message: 'Nhập tên vật tư' }]}
                                                >
                                                    <AutoComplete
                                                        options={suggestionOptions}
                                                        onSearch={fetchSuggestions}
                                                        onFocus={() =>
                                                            fetchSuggestions(String(itemValue.materialName ?? ''))
                                                        }
                                                        onSelect={(value: string) => {
                                                            const picked = suggestions.find((s) => s.name === value);
                                                            if (picked?.unit && !itemValue.unit) {
                                                                form.setFieldValue(
                                                                    ['items', field.name, 'unit'],
                                                                    picked.unit
                                                                );
                                                            }
                                                        }}
                                                        placeholder='Tên vật tư — gõ để gợi ý từ đồ đã mua'
                                                        allowClear
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    name={[field.name, 'quantityRequested']}
                                                    className='mb-0 w-20 shrink-0'
                                                    rules={[{ required: true, message: 'SL?' }]}
                                                >
                                                    <InputNumber<number>
                                                        min={1}
                                                        className='w-full'
                                                        placeholder='SL'
                                                        formatter={(v) =>
                                                            `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                        }
                                                        parser={parseNum}
                                                    />
                                                </Form.Item>
                                                <Button
                                                    type='text'
                                                    danger
                                                    disabled={fields.length === 1}
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => remove(field.name)}
                                                    className='shrink-0'
                                                />
                                            </div>
                                            {/* Hàng 2: ĐVT + máy liên quan */}
                                            <div className='mt-2 flex items-start gap-2 pl-8'>
                                                <Form.Item
                                                    name={[field.name, 'unit']}
                                                    className='mb-0 w-24 shrink-0'
                                                    rules={[{ required: true, message: 'ĐVT?' }]}
                                                >
                                                    <AutoComplete
                                                        options={UNIT_OPTIONS}
                                                        placeholder='ĐVT'
                                                        allowClear
                                                        filterOption={(input, option) =>
                                                            normalizeSearchTerm(String(option?.value ?? '')).includes(
                                                                normalizeSearchTerm(input)
                                                            )
                                                        }
                                                    />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'assetId']} className='mb-0 min-w-0 flex-1'>
                                                    <Select
                                                        allowClear
                                                        showSearch
                                                        options={assetOptions}
                                                        loading={assetsQuery.isLoading}
                                                        placeholder='Cho máy nào? (không bắt buộc)'
                                                        filterOption={(input, option) =>
                                                            normalizeSearchTerm(String(option?.label ?? '')).includes(
                                                                normalizeSearchTerm(input)
                                                            )
                                                        }
                                                    />
                                                </Form.Item>
                                            </div>
                                            {/* Chips mở ghi chú / ảnh — giữ card gọn khi không dùng */}
                                            <div className='mt-2 flex flex-wrap items-center gap-2 pl-8'>
                                                {!showNote && (
                                                    <button
                                                        type='button'
                                                        onClick={() => toggleExtra(field.name, 'note')}
                                                        className='rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-500'
                                                    >
                                                        ＋ Ghi chú
                                                    </button>
                                                )}
                                                {!showImages && (
                                                    <button
                                                        type='button'
                                                        onClick={() => toggleExtra(field.name, 'images')}
                                                        className='rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-500'
                                                    >
                                                        <CameraOutlined /> Ảnh linh kiện
                                                    </button>
                                                )}
                                            </div>
                                            {showNote && (
                                                <Form.Item name={[field.name, 'note']} className='mt-2 mb-0 pl-8'>
                                                    <Input
                                                        placeholder='Quy cách, vị trí lắp... (nếu có)'
                                                        maxLength={250}
                                                    />
                                                </Form.Item>
                                            )}
                                            {showImages && (
                                                <div className='mt-2 pl-8'>
                                                    <Form.Item name={[field.name, 'imageUrls']} className='mb-0'>
                                                        <ItemImageField />
                                                    </Form.Item>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

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
    const [chatOpen, setChatOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    // Debounce search
    useEffect(() => {
        const t = window.setTimeout(() => {
            setFilters((c) => ({ ...c, search: normalizeSearchTerm(draftSearch) }));
            setPagination((c) => ({ ...c, page: DEFAULT_PAGE }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [draftSearch]);

    // Deep-link từ thông báo/chat "Mở phiếu": ?request=<id> → mở drawer chi tiết rồi gỡ param
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
    const confirmApprove = (record: PurchaseRequest) => {
        Modal.confirm({
            title: 'Duyệt giấy đề nghị mua vật tư?',
            content: 'Sau khi duyệt, phiếu chuyển sang trạng thái "Đã duyệt".',
            okText: 'Duyệt',
            okButtonProps: { className: 'bg-green-600' },
            onOk: () => {
                setApprovingId(record.id);
                return approveReq(record.id);
            },
        });
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
                plantId={(user as any)?.plantId}
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
                height={isMobile ? '92%' : undefined}
                placement={isMobile ? 'bottom' : 'right'}
                destroyOnHidden
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                    header: { padding: isMobile ? '12px 16px' : undefined, borderBottom: '1px solid #f1f5f9' },
                    content: isMobile ? { borderRadius: '16px 16px 0 0' } : undefined,
                    footer: isMobile ? { padding: '10px 16px' } : undefined,
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
                    selectedRequest &&
                    (isMobile ? (
                        <div className='flex flex-col gap-2'>
                            {selectedRequest.status === 'pending' && isManager && (
                                <div className='flex gap-2'>
                                    <Button
                                        danger
                                        size='large'
                                        className='flex-1'
                                        onClick={() => setRejectTarget(selectedRequest)}
                                    >
                                        Từ chối
                                    </Button>
                                    <Button
                                        type='primary'
                                        size='large'
                                        className='flex-[2] bg-green-600 hover:!bg-green-700'
                                        loading={approvingId === selectedRequest.id}
                                        icon={<CheckCircleOutlined />}
                                        onClick={() => confirmApprove(selectedRequest)}
                                    >
                                        Duyệt phiếu
                                    </Button>
                                </div>
                            )}
                            <div className='flex gap-2'>
                                <Button
                                    icon={<MessageOutlined />}
                                    className='flex-1 text-blue-600'
                                    onClick={() => setChatOpen(true)}
                                >
                                    Trao đổi
                                </Button>
                                <Button
                                    icon={<DownloadOutlined />}
                                    className='flex-1'
                                    onClick={() => exportXlsx(selectedRequest)}
                                >
                                    Excel
                                </Button>
                                {canEdit(selectedRequest) && (
                                    <Button
                                        icon={<EditOutlined />}
                                        className='flex-1'
                                        onClick={() => {
                                            const r = selectedRequest;
                                            setSelectedId(null);
                                            openEdit(r);
                                        }}
                                    >
                                        Sửa
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className='flex items-center justify-between gap-2'>
                            <div className='flex gap-2'>
                                <Button
                                    icon={<MessageOutlined />}
                                    className='text-blue-600'
                                    onClick={() => setChatOpen(true)}
                                >
                                    Trao đổi
                                </Button>
                                <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(selectedRequest)}>
                                    Xuất Excel
                                </Button>
                                {canEdit(selectedRequest) && (
                                    <Button
                                        onClick={() => {
                                            const r = selectedRequest;
                                            setSelectedId(null);
                                            openEdit(r);
                                        }}
                                    >
                                        Sửa
                                    </Button>
                                )}
                            </div>
                            <div className='flex gap-2'>
                                {selectedRequest.status === 'pending' && isManager && (
                                    <>
                                        <Button danger onClick={() => setRejectTarget(selectedRequest)}>
                                            Từ chối
                                        </Button>
                                        <Button
                                            type='primary'
                                            className='bg-green-600 hover:!bg-green-700'
                                            loading={approvingId === selectedRequest.id}
                                            onClick={() => confirmApprove(selectedRequest)}
                                        >
                                            <CheckCircleOutlined /> Duyệt phiếu
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
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

                            {/* Info — mobile: card phẳng dễ đọc; desktop: Descriptions 2 cột */}
                            {isMobile ? (
                                <div className='rounded-2xl border border-slate-200 bg-white p-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600'>
                                            {(selectedRequest.requesterName || resolveUser(selectedRequest.requestedBy))
                                                .trim()
                                                .charAt(0)
                                                .toUpperCase() || '?'}
                                        </div>
                                        <div className='min-w-0 flex-1'>
                                            <div className='truncate text-sm font-semibold text-slate-900'>
                                                {selectedRequest.requesterName || resolveUser(selectedRequest.requestedBy)}
                                            </div>
                                            <div className='text-xs text-slate-400'>
                                                {selectedRequest.department || 'Kỹ thuật'} ·{' '}
                                                {fmtDate(selectedRequest.requestDate || selectedRequest.createdAt)}
                                            </div>
                                        </div>
                                        <Text
                                            copyable={{ text: selectedRequest.requestCode || '' }}
                                            className='shrink-0 font-mono text-xs font-semibold text-blue-600'
                                        >
                                            {selectedRequest.requestCode}
                                        </Text>
                                    </div>
                                    {selectedRequest.approvedBy && (
                                        <div
                                            className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                                                selectedRequest.status === 'rejected'
                                                    ? 'bg-red-50 text-red-600'
                                                    : 'bg-emerald-50 text-emerald-700'
                                            }`}
                                        >
                                            {selectedRequest.status === 'rejected' ? (
                                                <CloseCircleOutlined />
                                            ) : (
                                                <CheckCircleOutlined />
                                            )}
                                            <span className='min-w-0 truncate'>
                                                {selectedRequest.status === 'rejected' ? 'Từ chối' : 'Duyệt'} bởi{' '}
                                                <strong>{resolveUser(selectedRequest.approvedBy)}</strong>
                                                {selectedRequest.approvedAt
                                                    ? ` · ${fmtDateTime(selectedRequest.approvedAt)}`
                                                    : ''}
                                            </span>
                                        </div>
                                    )}
                                    {selectedRequest.note && (
                                        <div className='mt-3 border-l-2 border-slate-200 pl-3 text-sm leading-5 text-slate-600'>
                                            {selectedRequest.note}
                                        </div>
                                    )}
                                </div>
                            ) : (
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Thông tin phiếu
                                </div>
                                <div className='p-4 sm:p-5'>
                                    <Descriptions column={2} size='small' labelStyle={{ color: '#94a3b8', fontWeight: 500 }}>
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
                            )}

                            {/* Items — mobile: card list; desktop: table */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Danh sách vật tư · {selectedRequest.items?.length ?? 0} loại
                                </div>
                                {isMobile ? (
                                    <div className='divide-y divide-slate-100'>
                                        {(selectedRequest.items ?? []).map((item: any, idx: number) => (
                                            <div key={idx} className='px-4 py-3'>
                                                <div className='flex items-start justify-between gap-3'>
                                                    <div className='min-w-0 flex-1'>
                                                        <div className='text-sm leading-5 font-semibold text-slate-800'>
                                                            <span className='mr-1.5 text-xs font-bold text-slate-300'>
                                                                {idx + 1}
                                                            </span>
                                                            {item.materialName || '—'}
                                                        </div>
                                                        {item.assetCode || item.consumedByRequestCode ? (
                                                            <div className='mt-1.5 flex flex-wrap gap-1'>
                                                                {item.assetCode ? (
                                                                    <Tag color='geekblue' className='!m-0'>
                                                                        <ToolOutlined /> {item.assetCode}
                                                                        {item.assetName ? ` · ${item.assetName}` : ''}
                                                                    </Tag>
                                                                ) : null}
                                                                {item.consumedByRequestCode ? (
                                                                    <Tag color='cyan' className='!m-0'>
                                                                        Đã vào {item.consumedByRequestCode}
                                                                    </Tag>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                        {item.note ? (
                                                            <div className='mt-1 text-xs leading-4 text-slate-400'>
                                                                {item.note}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className='shrink-0 text-right'>
                                                        <span className='text-base leading-5 font-bold text-slate-900'>
                                                            {fmtNum(item.quantityRequested)}
                                                        </span>
                                                        <span className='ml-1 text-xs text-slate-400'>
                                                            {item.unit || ''}
                                                        </span>
                                                        {item.quantityApproved != null &&
                                                            item.quantityApproved !== item.quantityRequested && (
                                                                <div className='mt-0.5 text-[11px] font-semibold text-amber-600'>
                                                                    duyệt {fmtNum(item.quantityApproved)}
                                                                </div>
                                                            )}
                                                    </div>
                                                </div>
                                                {item.imageUrls?.length ? (
                                                    <div className='mt-2 flex gap-1.5 pl-5'>
                                                        <Image.PreviewGroup>
                                                            {item.imageUrls.map((url: string) => (
                                                                <Image
                                                                    key={url}
                                                                    src={url}
                                                                    width={48}
                                                                    height={48}
                                                                    style={{ objectFit: 'cover', borderRadius: 8 }}
                                                                    alt='Ảnh vật tư'
                                                                />
                                                            ))}
                                                        </Image.PreviewGroup>
                                                    </div>
                                                ) : null}
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
                                                <div>
                                                    <span className='font-medium text-slate-800'>
                                                        {r.materialName || '—'}
                                                    </span>
                                                    {r.assetCode || r.consumedByRequestCode ? (
                                                        <div className='mt-1 flex flex-wrap gap-1'>
                                                            {r.assetCode ? (
                                                                <Tag color='geekblue' className='!m-0'>
                                                                    <ToolOutlined /> {r.assetCode}
                                                                    {r.assetName ? ` · ${r.assetName}` : ''}
                                                                </Tag>
                                                            ) : null}
                                                            {r.consumedByRequestCode ? (
                                                                <Tag color='cyan' className='!m-0'>
                                                                    Đã vào {r.consumedByRequestCode}
                                                                </Tag>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                    {r.imageUrls?.length ? (
                                                        <div className='mt-1.5 flex gap-1.5'>
                                                            <Image.PreviewGroup>
                                                                {r.imageUrls.map((url: string) => (
                                                                    <Image
                                                                        key={url}
                                                                        src={url}
                                                                        width={38}
                                                                        height={38}
                                                                        style={{ objectFit: 'cover', borderRadius: 6 }}
                                                                        alt='Ảnh vật tư'
                                                                    />
                                                                ))}
                                                            </Image.PreviewGroup>
                                                        </div>
                                                    ) : null}
                                                </div>
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

            {selectedRequest && chatOpen ? (
                <ContextChatDrawer
                    open={chatOpen}
                    contextType='technical_purchase'
                    contextId={selectedRequest.id}
                    title={`Trao đổi ${selectedRequest.requestCode || 'phiếu đề nghị'}`}
                    subtitle='Giấy đề nghị mua vật tư (Kỹ thuật)'
                    onClose={() => setChatOpen(false)}
                />
            ) : null}
        </>
    );
};

export default TechnicalPurchaseRequestPage;
