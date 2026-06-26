import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    AutoComplete,
    Badge,
    Button,
    Checkbox,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Grid,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
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
    CheckOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
    FileExcelOutlined,
    FilterOutlined,
    InboxOutlined,
    InfoCircleOutlined,
    MessageOutlined,
    PlusOutlined,
    RightOutlined,
    ShoppingOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import ConfirmAction from '../components/shared/ConfirmAction';
import PageHeader from '../components/shared/PageHeader';
import ContextChatDrawer from '../components/chat/ContextChatDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { plantService } from '../core/services';
import { aiMaterialMatchService, aiOcrService, type AiMaterialMatchItem } from '../core/services/ai-help.service';
import {
    materialService,
    materialSupplierService,
    type Material,
    purchaseRequestService,
    type PurchaseRequest,
    type PurchaseRequestItem,
    type PurchaseRequestPayload,
    type PurchaseRequestQueryParams,
    type PurchaseRequestStatus,
} from '../core/services/material.service';
import type { PaginatedResponse, Plant, User } from '../core/types';

const { useBreakpoint } = Grid;
const { Text } = Typography;
const DEFAULT_LIMIT = 10;

const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);
const fmtNum = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');
const MATERIAL_SEARCH_LIMIT = 50;
const MATERIAL_FETCH_LIMIT = 5000;

const normalizeSearchText = (value?: string | number | null) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

const compactSearchText = (value?: string | number | null) => normalizeSearchText(value).replace(/\s+/g, '');

type MaterialSearchItem = {
    id: string;
    code: string;
    name: string;
    unit: string;
    category?: string;
    raw: Material;
    codeNorm: string;
    codeCompact: string;
    nameNorm: string;
    nameCompact: string;
    unitNorm: string;
    categoryNorm: string;
    searchText: string;
};

type MaterialOptionData = {
    key: string;
    value: string;
    label: string;
    unit: string;
    materialId: string;
    code: string;
    category?: string;
    item: MaterialSearchItem;
};

type MaterialMatchSource = {
    materialId?: string;
    materialName?: string;
    unit?: string;
};

type MaterialCatalogMatch = {
    status: 'matched' | 'suggested' | 'ambiguous' | 'unmatched';
    material?: MaterialSearchItem;
    confidence: number;
    reason: string;
    candidateCount: number;
};

type MaterialMatcher = {
    materialSearchIndex: MaterialSearchItem[];
    materialById: Map<string, MaterialSearchItem>;
    materialByCode: Map<string, MaterialSearchItem[]>;
    materialByCodeCompact: Map<string, MaterialSearchItem[]>;
    materialByName: Map<string, MaterialSearchItem[]>;
    materialByNameUnit: Map<string, MaterialSearchItem[]>;
};

const getMaterialList = (r?: Material[] | PaginatedResponse<Material>) =>
    Array.isArray(r) ? r : ((r as PaginatedResponse<Material> | undefined)?.data ?? []);

const buildMaterialSearchIndex = (materials: Material[]): MaterialSearchItem[] =>
    materials.map((m) => {
        const code = m.code ?? '';
        const name = m.name ?? '';
        const unit = m.unit ?? '';
        const category = m.category ?? '';
        const codeNorm = normalizeSearchText(code);
        const nameNorm = normalizeSearchText(name);
        const unitNorm = normalizeSearchText(unit);
        const categoryNorm = normalizeSearchText(category);

        return {
            id: m.id,
            code,
            name,
            unit,
            category,
            raw: m,
            codeNorm,
            codeCompact: compactSearchText(code),
            nameNorm,
            nameCompact: compactSearchText(name),
            unitNorm,
            categoryNorm,
            searchText: normalizeSearchText([code, name, unit, category, m.description].filter(Boolean).join(' ')),
        };
    });

const scoreMaterial = (item: MaterialSearchItem, query: string) => {
    const q = normalizeSearchText(query);
    const qCompact = compactSearchText(query);
    if (!q) return 20;

    const tokens = q.split(' ').filter(Boolean);
    let score = 0;

    if (item.codeNorm === q || item.codeCompact === qCompact) score += 1000;
    if (item.codeNorm.startsWith(q) || item.codeCompact.startsWith(qCompact)) score += 820;
    if (item.nameNorm === q || item.nameCompact === qCompact) score += 760;
    if (item.nameNorm.startsWith(q)) score += 680;
    if (item.nameNorm.includes(q)) score += 560;
    if (
        qCompact.length >= 4 &&
        item.nameCompact.length >= 4 &&
        (item.nameCompact.includes(qCompact) || qCompact.includes(item.nameCompact))
    ) {
        score += 430;
    }
    if (item.searchText.includes(q)) score += 450;
    if (tokens.length && tokens.every((token) => item.searchText.includes(token))) score += 360 + tokens.length * 18;

    tokens.forEach((token) => {
        if (item.codeNorm.includes(token) || item.codeCompact.includes(token)) score += 120;
        if (item.nameNorm.split(' ').some((word) => word.startsWith(token))) score += 90;
        else if (item.nameNorm.includes(token)) score += 50;
        if (item.categoryNorm.includes(token)) score += 18;
        if (item.unitNorm.includes(token)) score += 10;
    });

    return score;
};

const pushToMaterialMap = (map: Map<string, MaterialSearchItem[]>, key: string, item: MaterialSearchItem) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
};

const uniqueMaterial = (items?: MaterialSearchItem[]) => (items?.length === 1 ? items[0] : undefined);
const uniqueMaterialCandidates = (items: MaterialSearchItem[]) =>
    Array.from(new Map(items.map((item) => [item.id, item])).values());

const materialNameUnitKey = (name?: string | number | null, unit?: string | number | null) =>
    `${normalizeSearchText(name)}::${normalizeSearchText(unit)}`;

const buildMaterialMatcher = (materialSearchIndex: MaterialSearchItem[]): MaterialMatcher => {
    const materialById = new Map<string, MaterialSearchItem>();
    const materialByCode = new Map<string, MaterialSearchItem[]>();
    const materialByCodeCompact = new Map<string, MaterialSearchItem[]>();
    const materialByName = new Map<string, MaterialSearchItem[]>();
    const materialByNameUnit = new Map<string, MaterialSearchItem[]>();

    materialSearchIndex.forEach((item) => {
        materialById.set(item.id, item);
        pushToMaterialMap(materialByCode, item.codeNorm, item);
        pushToMaterialMap(materialByCodeCompact, item.codeCompact, item);
        pushToMaterialMap(materialByName, item.nameNorm, item);
        pushToMaterialMap(materialByNameUnit, materialNameUnitKey(item.name, item.unit), item);
    });

    return {
        materialSearchIndex,
        materialById,
        materialByCode,
        materialByCodeCompact,
        materialByName,
        materialByNameUnit,
    };
};

const findSmartMaterialMatch = (row: MaterialMatchSource, matcher: MaterialMatcher): MaterialCatalogMatch => {
    if (row.materialId) {
        const selected = matcher.materialById.get(row.materialId);
        return selected
            ? {
                  status: 'matched',
                  material: selected,
                  confidence: 100,
                  reason: 'selected_material_id',
                  candidateCount: 1,
              }
            : { status: 'unmatched', confidence: 0, reason: 'missing_material_id', candidateCount: 0 };
    }

    const nameNorm = normalizeSearchText(row.materialName);
    const nameCompact = compactSearchText(row.materialName);
    const unitNorm = normalizeSearchText(row.unit);
    if (!nameNorm) {
        return { status: 'unmatched', confidence: 0, reason: 'empty_name', candidateCount: 0 };
    }

    const exactCodeCandidates = uniqueMaterialCandidates([
        ...(matcher.materialByCode.get(nameNorm) ?? []),
        ...(matcher.materialByCodeCompact.get(nameCompact) ?? []),
    ]);
    const exactCode = uniqueMaterial(exactCodeCandidates);
    if (exactCode) {
        return { status: 'matched', material: exactCode, confidence: 100, reason: 'exact_code', candidateCount: 1 };
    }
    if (exactCodeCandidates.length > 1) {
        return {
            status: 'ambiguous',
            material: exactCodeCandidates[0],
            confidence: 92,
            reason: 'exact_code_ambiguous',
            candidateCount: exactCodeCandidates.length,
        };
    }

    const exactNameUnit = unitNorm
        ? uniqueMaterial(matcher.materialByNameUnit.get(materialNameUnitKey(nameNorm, unitNorm)))
        : undefined;
    if (exactNameUnit) {
        return {
            status: 'matched',
            material: exactNameUnit,
            confidence: 98,
            reason: 'exact_name_unit',
            candidateCount: 1,
        };
    }

    const exactNameCandidates = matcher.materialByName.get(nameNorm) ?? [];
    const exactName = uniqueMaterial(exactNameCandidates);
    if (exactName) {
        return {
            status: 'matched',
            material: exactName,
            confidence: 94,
            reason: 'exact_name_unique',
            candidateCount: 1,
        };
    }

    if (exactNameCandidates.length > 1) {
        const sameUnitCandidates = unitNorm
            ? exactNameCandidates.filter((candidate) => candidate.unitNorm === unitNorm)
            : [];
        const sameUnitMatch = uniqueMaterial(sameUnitCandidates);
        if (sameUnitMatch) {
            return {
                status: 'matched',
                material: sameUnitMatch,
                confidence: 98,
                reason: 'exact_name_unit_from_candidates',
                candidateCount: exactNameCandidates.length,
            };
        }

        const suggestedMaterial = sameUnitCandidates[0] ?? exactNameCandidates[0];
        return {
            status: 'ambiguous',
            material: suggestedMaterial,
            confidence: 88,
            reason: 'exact_name_ambiguous',
            candidateCount: exactNameCandidates.length,
        };
    }

    const scored = matcher.materialSearchIndex
        .map((item) => {
            const unitBonus = unitNorm && item.unitNorm === unitNorm ? 90 : 0;
            return { item, score: scoreMaterial(item, row.materialName ?? '') + unitBonus };
        })
        .filter(({ score }) => score >= 360)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'vi'));

    const best = scored[0];
    if (!best) {
        return { status: 'unmatched', confidence: 0, reason: 'no_candidate', candidateCount: 0 };
    }

    const secondScore = scored[1]?.score ?? 0;
    const strongUnique = best.score >= 820 && best.score - secondScore >= 160;
    return {
        status: strongUnique ? 'matched' : 'suggested',
        material: best.item,
        confidence: Math.min(99, Math.round(best.score / 10)),
        reason: strongUnique ? 'strong_unique_match' : 'fuzzy_candidate',
        candidateCount: scored.length,
    };
};

const highlightMatch = (text: string, query: string) => {
    const normalizedText = normalizeSearchText(text);
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return text;

    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const parts = text.split(/(\s+)/);

    return parts.map((part, index) => {
        const normalizedPart = normalizeSearchText(part);
        const matched =
            normalizedPart.includes(normalizedQuery) ||
            queryTokens.some((token) => token && normalizedPart.includes(token));

        return matched ? (
            <mark key={`${part}-${index}`} style={{ background: '#fef3c7', color: 'inherit', padding: 0 }}>
                {part}
            </mark>
        ) : (
            <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        );
    });
};

const MaterialInfoTooltip = React.memo(({ material }: { material: MaterialSearchItem }) => (
    <Tooltip
        title={
            <div style={{ maxWidth: 360 }}>
                <div style={{ marginBottom: 6, fontWeight: 700, color: '#fff' }}>{material.name}</div>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    <span>Mã vật tư: {material.code || '-'}</span>
                    <span>ĐVT: {material.unit || '-'}</span>
                    {material.category ? <span>Nhóm: {material.category}</span> : null}
                    {material.raw.description ? <span>Mô tả: {material.raw.description}</span> : null}
                </div>
            </div>
        }
    >
        <span
            onMouseDown={(event) => event.preventDefault()}
            style={{ display: 'inline-flex', color: '#94a3b8', cursor: 'help' }}
        >
            <InfoCircleOutlined style={{ fontSize: 13 }} />
        </span>
    </Tooltip>
));
MaterialInfoTooltip.displayName = 'MaterialInfoTooltip';

const MaterialDropdownOption = React.memo(({ item, query }: { item: MaterialSearchItem; query: string }) => (
    <div title={`${item.code} - ${item.name}`} style={{ padding: '5px 0', lineHeight: 1.35 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <Tag color='blue' style={{ margin: 0, fontFamily: 'monospace', flexShrink: 0 }}>
                {highlightMatch(item.code, query)}
            </Tag>
            <span style={{ color: '#0f172a', fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                {highlightMatch(item.name, query)}
            </span>
        </div>
        <div
            style={{
                marginTop: 4,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                color: '#64748b',
                fontSize: 12,
            }}
        >
            <span>ĐVT: {highlightMatch(item.unit || '-', query)}</span>
            {item.category ? <span>Nhóm: {highlightMatch(item.category, query)}</span> : null}
        </div>
    </div>
));
MaterialDropdownOption.displayName = 'MaterialDropdownOption';

type MaterialPickerCellProps = {
    value: string;
    material?: MaterialSearchItem;
    options: MaterialOptionData[];
    size?: 'small' | 'middle' | 'large';
    status?: 'error' | 'warning';
    placeholder?: string;
    searchQuery: string;
    notFoundContent?: React.ReactNode;
    onSearch: (value: string) => void;
    onChange: (value: string) => void;
    onSelect: (value: string, option: MaterialOptionData) => void;
    onBlur?: () => void;
};

const materialCodePillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: 66,
    height: 18,
    padding: '0 5px',
    borderRadius: 5,
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: '18px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const emptyMaterialPrefixStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: 0,
    overflow: 'hidden',
};

const materialSuffixSlotStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 16,
};

const MaterialPickerCell = React.memo(
    ({
        value,
        material,
        options,
        size = 'small',
        status,
        placeholder,
        searchQuery,
        notFoundContent,
        onSearch,
        onChange,
        onSelect,
        onBlur,
    }: MaterialPickerCellProps) => {
        const hasMaterialCode = Boolean(material?.code);

        return (
            <AutoComplete
                value={value}
                options={options}
                style={{ width: '100%' }}
                status={status}
                filterOption={false}
                popupMatchSelectWidth={520}
                notFoundContent={notFoundContent}
                onSearch={onSearch}
                onChange={(nextValue) => {
                    const selectedOption = options.find((option) => option.value === nextValue);
                    onChange(selectedOption?.item.name ?? nextValue);
                }}
                onSelect={(nextValue, option) => {
                    const selectedOption =
                        (option as MaterialOptionData) ?? options.find((item) => item.value === nextValue);
                    onSelect(nextValue, selectedOption);
                }}
                optionRender={(option: any) => {
                    const item = (option?.data?.item ?? option?.item) as MaterialSearchItem | undefined;
                    return item ? <MaterialDropdownOption item={item} query={searchQuery} /> : option?.label;
                }}
                placeholder={placeholder}
            >
                <Input
                    size={size}
                    status={status}
                    placeholder={placeholder}
                    title={material ? `${material.code ? `${material.code} - ` : ''}${material.name}` : value}
                    prefix={
                        hasMaterialCode ? (
                            <span style={materialCodePillStyle}>{material!.code}</span>
                        ) : (
                            <span aria-hidden='true' style={emptyMaterialPrefixStyle} />
                        )
                    }
                    suffix={
                        <span style={materialSuffixSlotStyle}>
                            {material ? (
                                <MaterialInfoTooltip material={material} />
                            ) : (
                                <InfoCircleOutlined aria-hidden='true' style={{ fontSize: 13, visibility: 'hidden' }} />
                            )}
                        </span>
                    }
                    style={{ height: size === 'large' ? 40 : 30 }}
                    onBlur={onBlur}
                />
            </AutoComplete>
        );
    }
);
MaterialPickerCell.displayName = 'MaterialPickerCell';

const useDebouncedValue = <T,>(value: T, delay = 180) => {
    const [debounced, setDebounced] = React.useState(value);

    React.useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};

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
    draft: { color: 'default', label: 'Bản nháp', icon: <EditOutlined /> },
    pending: { color: 'warning', label: 'Chờ duyệt', icon: <ClockCircleOutlined /> },
    approved: { color: 'success', label: 'Đã duyệt', icon: <CheckCircleOutlined /> },
    rejected: { color: 'error', label: 'Từ chối', icon: <CloseCircleOutlined /> },
    in_progress: { color: 'blue', label: 'Đang lên đơn', icon: <ShoppingOutlined /> },
    ordered: { color: 'processing', label: 'Đã đặt hàng', icon: <ShoppingOutlined /> },
    received: { color: 'cyan', label: 'Đã nhận', icon: <InboxOutlined /> },
    distributed: { color: 'default', label: 'Đã cấp phát', icon: null },
};

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));

type ItemRow = {
    key: string;
    materialId?: string;
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
    note?: string;
    totalPrice: number;
    vatAmount: number;
    totalWithVat: number;
};

const createRowKey = () => `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const newRow = (): ItemRow => ({
    key: createRowKey(),
    materialId: undefined,
    materialName: '',
    plantId: '',
    proposedBy: '',
    quantityRequested: 1,
    unit: '',
    quantityOrdered: 1,
    unitPrice: 0,
    vatRate: 8,
    orderDate: undefined,
    receivedDate: undefined,
    supplierId: undefined,
    supplierName: undefined,
    purpose: '',
    note: '',
    totalPrice: 0,
    vatAmount: 0,
    totalWithVat: 0,
});

const computeRow = (r: ItemRow): ItemRow => {
    const totalPrice = r.quantityOrdered * r.unitPrice;
    const vatAmount = totalPrice * (r.vatRate / 100);
    return { ...r, totalPrice, vatAmount, totalWithVat: totalPrice + vatAmount };
};

const patchRow = (rows: ItemRow[], key: string, patch: Partial<ItemRow>): ItemRow[] =>
    rows.map((r) => (r.key === key ? computeRow({ ...r, ...patch }) : r));

const getPurchaseRequestItemKey = (item: PurchaseRequestItem, index: number) =>
    String(item.id ?? item.materialId ?? `${item.materialName ?? 'material'}-${item.unit ?? 'unit'}-${index}`);

// ─── Shared helpers (outside ModalForm to avoid re-creation on each render) ──

const FieldLabel: React.FC<{ children: string; req?: boolean }> = ({ children, req }) => (
    <div
        style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 6,
        }}
    >
        {children} {req && <Text type='danger'>*</Text>}
    </div>
);

const ReadonlyVal: React.FC<{ value: string }> = ({ value }) => (
    <div
        style={{
            padding: '4px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            background: '#f8fafc',
            fontSize: 12,
            color: '#64748b',
            minHeight: 28,
            lineHeight: '20px',
        }}
    >
        {value}
    </div>
);

// ─── ModalForm — Purchase Request Workspace ──────────────────────────────────

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
    const { modal, notification } = App.useApp();
    const screens = useBreakpoint();
    const isEditingPending = initial?.status === 'pending';
    // workspace: 2-panel fullscreen for xl+ (≥1280px), card drawer for everything else
    const useWorkspace = Boolean(screens.xl);
    const isMobile = !screens.sm;
    const now = dayjs();
    const [month, setMonth] = useState(now.month() + 1);
    const [year, setYear] = useState(now.year());
    const [items, setItems] = useState<ItemRow[]>([newRow()]);
    const [errors, setErrors] = useState<Set<string>>(new Set());
    const [validationMessages, setValidationMessages] = useState<string[]>([]);
    const [materialSearchInput, setMaterialSearchInput] = useState('');
    const debouncedMaterialSearch = useDebouncedValue(materialSearchInput, 180);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
    const [recentlyUpdatedKeys, setRecentlyUpdatedKeys] = useState<Set<string>>(new Set());
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [aiMatches, setAiMatches] = useState<Record<string, AiMaterialMatchItem>>({});
    const [aiMatching, setAiMatching] = useState(false);
    const [scanningInvoice, setScanningInvoice] = useState(false);
    const [summaryPulse, setSummaryPulse] = useState(false);
    const [bulkProposedBy, setBulkProposedBy] = useState('');
    const [bulkSupplierId, setBulkSupplierId] = useState<string | undefined>();
    const [bulkSupplierName, setBulkSupplierName] = useState<string | undefined>();
    const [bulkPlantId, setBulkPlantId] = useState<string | undefined>();
    const [bulkVatRate, setBulkVatRate] = useState<number | null>(8);
    const lastTotalRef = React.useRef(0);

    const { data: matResp } = useQuery({
        queryKey: ['materials', 'purchase-request-picker'],
        queryFn: () => materialService.getAll({ isActive: true, limit: MATERIAL_FETCH_LIMIT }),
        enabled: open,
        placeholderData: (p) => p,
    });

    const { data: suppliersResp } = useQuery({
        queryKey: ['material-suppliers', 'all'],
        queryFn: () => materialSupplierService.getAll({ limit: 200 }),
        enabled: open,
    });

    const materialSearchIndex = useMemo(() => buildMaterialSearchIndex(getMaterialList(matResp)), [matResp]);

    const matOptions = useMemo<MaterialOptionData[]>(() => {
        const scored = materialSearchIndex
            .map((item) => ({ item, score: scoreMaterial(item, debouncedMaterialSearch) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'vi'))
            .slice(0, MATERIAL_SEARCH_LIMIT);

        return scored.map(({ item }) => ({
            key: item.id,
            value: item.id,
            label: item.code ? `[${item.code}] ${item.name}` : item.name,
            unit: item.unit,
            materialId: item.id,
            code: item.code,
            category: item.category,
            item,
        }));
    }, [debouncedMaterialSearch, materialSearchIndex]);

    const materialById = useMemo(() => {
        const map = new Map<string, MaterialSearchItem>();
        materialSearchIndex.forEach((item) => map.set(item.id, item));
        return map;
    }, [materialSearchIndex]);

    const materialMatcher = useMemo(() => buildMaterialMatcher(materialSearchIndex), [materialSearchIndex]);

    const getRowCatalogMatch = React.useCallback(
        (row: MaterialMatchSource) => findSmartMaterialMatch(row, materialMatcher),
        [materialMatcher]
    );

    const resolveRowMaterial = React.useCallback(
        (row: ItemRow) => {
            const match = getRowCatalogMatch(row);
            return match.status === 'matched'
                ? match.material
                : row.materialId
                  ? materialById.get(row.materialId)
                  : undefined;
        },
        [getRowCatalogMatch, materialById]
    );

    const supplierOptions = useMemo(() => {
        const list = Array.isArray(suppliersResp) ? suppliersResp : ((suppliersResp as any)?.data ?? []);
        return list.map((s: any) => ({ value: s.id, label: s.name }));
    }, [suppliersResp]);
    const plantOptions = useMemo(() => plants.map((p) => ({ value: p.id, label: p.name })), [plants]);

    React.useEffect(() => {
        if (!open) return;
        let loadedItems: ItemRow[];
        if (initial) {
            setMonth(initial.requestMonth ?? now.month() + 1);
            setYear(initial.requestYear ?? now.year());
            loadedItems = initial.items.map((it) =>
                computeRow({
                    key: `row-${Math.random().toString(36).slice(2)}`,
                    materialId: it.materialId,
                    materialName: it.materialName ?? '',
                    plantId: it.plantId ?? mainPlantId,
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
                    note: it.note ?? '',
                    totalPrice: 0,
                    vatAmount: 0,
                    totalWithVat: 0,
                })
            );
        } else {
            setMonth(now.month() + 1);
            setYear(now.year());
            loadedItems = [newRow()];
        }
        setItems(loadedItems);
        setSelectedKey(loadedItems[0]?.key ?? null);
        setCheckedKeys(new Set());
        setErrors(new Set());
        setValidationMessages([]);
        setShowMissingOnly(false);
        setAiMatches({});
        setAiMatching(false);
        setMaterialSearchInput('');
        lastTotalRef.current = loadedItems.reduce((s, r) => s + r.totalWithVat, 0);
    }, [open, initial]);

    const totals = useMemo(
        () => ({
            price: items.reduce((s, r) => s + r.totalPrice, 0),
            vat: items.reduce((s, r) => s + r.vatAmount, 0),
            total: items.reduce((s, r) => s + r.totalWithVat, 0),
        }),
        [items]
    );

    React.useEffect(() => {
        if (!open) return;
        if (lastTotalRef.current !== totals.total) {
            setSummaryPulse(true);
            const timer = window.setTimeout(() => setSummaryPulse(false), 280);
            lastTotalRef.current = totals.total;
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [open, totals.total]);

    const getRequiredIssues = (r: ItemRow) => {
        const issues: { key: string; label: string }[] = [];
        if (!r.materialName.trim()) issues.push({ key: 'name', label: 'Tên vật tư' });
        if (!r.plantId) issues.push({ key: 'plant', label: 'Cơ sở' });
        if (!r.proposedBy.trim()) issues.push({ key: 'proposedBy', label: 'Người đề xuất' });
        if (!r.quantityRequested || r.quantityRequested <= 0) issues.push({ key: 'qty', label: 'SL cần' });
        if (!r.unit.trim()) issues.push({ key: 'unit', label: 'ĐVT' });
        if (!r.purpose.trim()) issues.push({ key: 'purpose', label: 'Nội dung / mục đích' });
        if (r.quantityOrdered < 0) issues.push({ key: 'qtyOrdered', label: 'SL mua không hợp lệ' });
        if (r.unitPrice < 0) issues.push({ key: 'unitPrice', label: 'Đơn giá không hợp lệ' });
        if (r.vatRate < 0 || r.vatRate > 100) issues.push({ key: 'vat', label: 'VAT không hợp lệ' });
        return issues;
    };

    const validate = () => {
        const errs = new Set<string>();
        const missing: string[] = [];
        items.forEach((r, i) => {
            const issues = getRequiredIssues(r);
            issues.forEach((issue) => errs.add(`${r.key}-${issue.key}`));
            if (issues.length) {
                missing.push(`Dòng #${i + 1}: thiếu ${issues.map((issue) => issue.label).join(', ')}`);
            }
        });
        setErrors(errs);
        setValidationMessages(missing);
        // Auto-select đầu tiên dòng lỗi để user thấy ngay trong panel chi tiết
        if (errs.size > 0) {
            const firstErrKey = items.find((r) => getRequiredIssues(r).length > 0)?.key;
            if (firstErrKey) setSelectedKey(firstErrKey);
        }
        if (missing.length) {
            notification.error({
                title: `Còn ${missing.length} dòng thiếu thông tin`,
                description: missing.slice(0, 5).join(' | '),
            });
        }
        return errs.size === 0;
    };

    const buildPayload = (status: 'draft' | 'pending'): PurchaseRequestPayload => ({
        plantId: mainPlantId,
        requestMonth: month,
        requestYear: year,
        status,
        items: items.map((r) => {
            const match = getRowCatalogMatch(r);
            const matchedMaterial = match.status === 'matched' ? match.material : undefined;
            const hasExplicitMaterial = Boolean(matchedMaterial?.id || r.materialId);

            return {
                materialId: matchedMaterial?.id ?? r.materialId,
                materialName: matchedMaterial?.name ?? r.materialName,
                unit: matchedMaterial?.unit || r.unit,
                proposedBy: r.proposedBy,
                purpose: r.purpose,
                plantId: r.plantId || undefined,
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
                catalogStatus: hasExplicitMaterial ? 'matched' : 'unmatched',
                note: r.note?.trim() || undefined,
            };
        }),
    });

    const handleSubmit = async (status: 'draft' | 'pending') => {
        if (status === 'pending' && !validate()) return;
        await onSave(buildPayload(status), status);
    };

    // ── Row helpers ──
    const markRecent = (keys: string[]) => {
        setRecentlyUpdatedKeys(new Set(keys));
        window.setTimeout(() => setRecentlyUpdatedKeys(new Set()), 650);
    };

    const fieldErrorMap: Record<string, string[]> = {
        materialName: ['name'],
        plantId: ['plant'],
        proposedBy: ['proposedBy'],
        quantityRequested: ['qty'],
        unit: ['unit'],
        quantityOrdered: ['qtyOrdered'],
        unitPrice: ['unitPrice'],
        vatRate: ['vat'],
        purpose: ['purpose'],
    };

    const clearPatchedErrors = (keys: string[], patch: Partial<ItemRow>) => {
        const touchedFields = Object.keys(patch).flatMap((field) => fieldErrorMap[field] ?? []);
        if (!touchedFields.length) return;

        setErrors((prev) => {
            if (!prev.size) return prev;

            const next = new Set(prev);
            keys.forEach((key) => touchedFields.forEach((field) => next.delete(`${key}-${field}`)));
            return next;
        });
    };

    const updateRow = (key: string, patch: Partial<ItemRow>) => {
        setItems((p) => patchRow(p, key, patch));
        if ('materialName' in patch || 'materialId' in patch || 'unit' in patch) {
            setAiMatches((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
        clearPatchedErrors([key], patch);
    };

    const applyMaterialToRow = (key: string, material: MaterialSearchItem) => {
        updateRow(key, {
            materialId: material.id,
            materialName: material.name,
            unit: material.unit || '',
        });
        markRecent([key]);
    };

    const autoApplyMaterialMatch = (key: string) => {
        const row = items.find((item) => item.key === key);
        if (!row || row.materialId || !row.materialName.trim()) return;

        const match = getRowCatalogMatch(row);
        if (match.status !== 'matched' || !match.material) return;
        applyMaterialToRow(key, match.material);
    };

    const applySmartCatalogMatch = () => {
        let autoMatched = 0;
        let suggested = 0;
        let unmatched = 0;
        const updatedKeys: string[] = [];

        setItems((prev) =>
            prev.map((row) => {
                if (row.materialId || !row.materialName.trim()) return row;

                const match = getRowCatalogMatch(row);
                if (match.status === 'matched' && match.material) {
                    autoMatched += 1;
                    updatedKeys.push(row.key);
                    return computeRow({
                        ...row,
                        materialId: match.material.id,
                        materialName: match.material.name,
                        unit: row.unit || match.material.unit || '',
                    });
                }

                if (match.status === 'suggested' || match.status === 'ambiguous') suggested += 1;
                else unmatched += 1;
                return row;
            })
        );

        if (updatedKeys.length) markRecent(updatedKeys);

        if (autoMatched > 0) {
            notification.success({
                title: `Đã tự khớp ${autoMatched} dòng vật tư`,
                description:
                    suggested > 0 || unmatched > 0
                        ? `${suggested} dòng cần xác nhận gợi ý, ${unmatched} dòng chưa có danh mục.`
                        : undefined,
            });
            return;
        }

        if (suggested > 0) {
            notification.info({
                title: `${suggested} dòng có gợi ý nhưng chưa đủ chắc chắn`,
                description: 'Bấm gợi ý ở từng dòng để xác nhận vật tư đúng.',
            });
            return;
        }

        notification.warning({ title: 'Chưa tìm thấy vật tư phù hợp trong danh mục' });
    };

    const applyAiMaterialMatch = (key: string, match: AiMaterialMatchItem) => {
        if (!match.materialId && !match.candidate) return;

        const material = match.materialId ? materialById.get(match.materialId) : undefined;
        if (material) {
            applyMaterialToRow(key, material);
            return;
        }

        if (match.candidate) {
            updateRow(key, {
                materialId: match.candidate.id,
                materialName: match.candidate.name,
                unit: match.candidate.unit || '',
            });
            markRecent([key]);
        }
    };

    const handleAiMaterialMatch = async () => {
        const rows = items.filter((row) => row.materialName.trim() && !row.materialId);
        if (!rows.length) {
            notification.info({ title: 'Không có dòng vật tư cần AI so khớp' });
            return;
        }

        setAiMatching(true);
        try {
            const result = await aiMaterialMatchService.match(
                rows.map((row) => ({
                    key: row.key,
                    materialName: row.materialName,
                    unit: row.unit,
                    note: row.purpose || row.note,
                }))
            );

            const nextMatches = Object.fromEntries(result.items.map((item) => [item.key, item]));
            setAiMatches((prev) => ({ ...prev, ...nextMatches }));

            const strong = result.items.filter((item) => item.status === 'matched' && item.materialId).length;
            const needsConfirm = result.items.filter(
                (item) => item.status === 'suggested' || item.status === 'ambiguous'
            ).length;
            const unmatched = result.items.filter((item) => item.status === 'unmatched').length;

            notification.success({
                title: `AI đã phân tích ${result.items.length} dòng vật tư`,
                description: [
                    strong ? `${strong} dòng khớp mạnh` : '',
                    needsConfirm ? `${needsConfirm} dòng cần xác nhận` : '',
                    unmatched ? `${unmatched} dòng chưa tìm thấy` : '',
                    result.usedFallback ? 'Đang dùng bộ so khớp dự phòng vì AI chưa khả dụng.' : '',
                ]
                    .filter(Boolean)
                    .join(' · '),
            });
        } catch {
            notification.error({
                title: 'Không gọi được AI khớp vật tư',
                description: 'Có thể 9Router/provider đang tắt hoặc mất kết nối. Bộ tự khớp danh mục vẫn dùng được.',
            });
        } finally {
            setAiMatching(false);
        }
    };

    // Quét ảnh hóa đơn/phiếu mua -> OCR trích dòng -> đổ vào bảng -> tự khớp danh mục.
    const handleScanInvoice = async (file: File) => {
        setScanningInvoice(true);
        try {
            const result = await aiOcrService.scanPurchaseInvoice(file);
            if (!result.items.length) {
                notification.warning({
                    title: 'Chưa đọc được dòng vật tư nào',
                    description: 'Hãy chụp hóa đơn rõ nét, đủ sáng và thẳng góc rồi thử lại.',
                });
                return;
            }

            // Dò "Cơ sở"/"Nhà cung cấp" từ tên đọc được -> id (khớp không dấu, ưu tiên trùng khít).
            const findOption = (opts: { value: string; label: string }[], name?: string) => {
                const q = normalizeSearchText(name);
                if (!q) return undefined;
                return (
                    opts.find((o) => normalizeSearchText(o.label) === q) ||
                    opts.find((o) => {
                        const l = normalizeSearchText(o.label);
                        return l.includes(q) || q.includes(l);
                    })
                );
            };
            const parseDate = (value?: string) => {
                if (!value) return undefined;
                const d = dayjs(value);
                return d.isValid() ? d : undefined;
            };
            const invoiceTag = result.header?.invoiceNo ? `HĐ ${result.header.invoiceNo}` : '';

            let matchedPlants = 0;
            let matchedSuppliers = 0;
            const scannedRows = result.items.map((it) => {
                const qReq =
                    it.quantityRequested && it.quantityRequested > 0
                        ? it.quantityRequested
                        : it.quantity && it.quantity > 0
                          ? it.quantity
                          : 1;
                const qBuy = it.quantity && it.quantity > 0 ? it.quantity : qReq;
                const plant = findOption(plantOptions, it.plantName);
                const supplier = findOption(supplierOptions, it.supplierName);
                if (plant) matchedPlants += 1;
                if (supplier) matchedSuppliers += 1;
                return computeRow({
                    ...newRow(),
                    materialName: it.materialName,
                    unit: it.unit ?? '',
                    quantityRequested: qReq,
                    quantityOrdered: qBuy,
                    unitPrice: it.unitPrice ?? 0,
                    vatRate: it.vatRate != null ? it.vatRate : 8,
                    plantId: plant?.value ?? mainPlantId,
                    proposedBy: it.proposedBy ?? '',
                    supplierId: supplier?.value,
                    supplierName: supplier?.label ?? it.supplierName,
                    purpose: it.purpose ?? '',
                    note: it.note || invoiceTag,
                    orderDate: parseDate(it.orderDate),
                    receivedDate: parseDate(it.receivedDate),
                });
            });

            // Form đang trống (chỉ dòng mặc định rỗng) -> thay; ngược lại nối thêm.
            setItems((prev) => {
                const meaningful = prev.filter((r) => r.materialName.trim() || r.unitPrice > 0);
                return meaningful.length ? [...meaningful, ...scannedRows] : scannedRows;
            });
            setSelectedKey(scannedRows[0].key);
            markRecent(scannedRows.map((r) => r.key));

            notification.success({
                title: `Đã quét ${scannedRows.length} dòng từ hóa đơn`,
                description: [
                    matchedPlants ? `${matchedPlants} cơ sở` : '',
                    matchedSuppliers ? `${matchedSuppliers} NCC đã dò` : '',
                    'Đang khớp vật tư — kiểm tra lại số lượng, đơn giá & cơ sở giúp.',
                ]
                    .filter(Boolean)
                    .join(' · '),
            });

            // Khớp danh mục cho các dòng vừa quét (tái dùng AI material-match).
            try {
                const match = await aiMaterialMatchService.match(
                    scannedRows.map((r) => ({ key: r.key, materialName: r.materialName, unit: r.unit, note: r.note }))
                );
                setAiMatches((prev) => ({
                    ...prev,
                    ...Object.fromEntries(match.items.map((item) => [item.key, item])),
                }));
            } catch {
                /* Bỏ qua: người dùng vẫn có thể bấm "AI khớp vật tư" thủ công. */
            }
        } catch {
            notification.error({
                title: 'Không quét được hóa đơn',
                description: 'Có thể ảnh quá lớn/mờ hoặc AI đang bận. Thử lại với ảnh rõ hơn nhé.',
            });
        } finally {
            setScanningInvoice(false);
        }
    };

    const applyStrongAiMatches = () => {
        const strongRows = items.filter((row) => {
            const match = aiMatches[row.key];
            return !row.materialId && match?.materialId && match.status === 'matched' && match.confidence >= 92;
        });

        if (!strongRows.length) {
            notification.info({ title: 'Chưa có gợi ý AI đủ chắc để áp dụng hàng loạt' });
            return;
        }

        strongRows.forEach((row) => applyAiMaterialMatch(row.key, aiMatches[row.key]));
        notification.success({ title: `Đã áp dụng ${strongRows.length} gợi ý AI khớp mạnh` });
    };

    const renderCatalogHint = (row: ItemRow, compact = false) => {
        const aiMatch = aiMatches[row.key];
        if (!row.materialId && aiMatch && row.materialName.trim()) {
            const aiMaterial = aiMatch.materialId ? materialById.get(aiMatch.materialId) : undefined;
            const candidate = aiMaterial
                ? {
                      code: aiMaterial.code,
                      name: aiMaterial.name,
                      unit: aiMaterial.unit,
                  }
                : aiMatch.candidate;

            if (candidate && aiMatch.status !== 'unmatched') {
                const color =
                    aiMatch.status === 'matched' ? '#2563eb' : aiMatch.status === 'suggested' ? '#0891b2' : '#b45309';
                return (
                    <div style={{ marginTop: compact ? 6 : 5, lineHeight: 1.3 }}>
                        <Button
                            type='link'
                            size='small'
                            style={{
                                height: 'auto',
                                maxWidth: '100%',
                                padding: 0,
                                whiteSpace: 'normal',
                                textAlign: 'left',
                                lineHeight: 1.3,
                                color,
                                fontSize: compact ? 12 : 11,
                                fontWeight: 700,
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                                applyAiMaterialMatch(row.key, aiMatch);
                            }}
                        >
                            AI {aiMatch.status === 'matched' ? 'khớp mạnh' : 'gợi ý'} {aiMatch.confidence}%:{' '}
                            {candidate.code ? `[${candidate.code}] ` : ''}
                            {candidate.name}
                        </Button>
                        {aiMatch.warnings.length ? (
                            <Tooltip title={aiMatch.warnings.join(' · ')}>
                                <InfoCircleOutlined style={{ marginLeft: 6, color: '#f59e0b', fontSize: 11 }} />
                            </Tooltip>
                        ) : null}
                    </div>
                );
            }

            return (
                <Tag color='volcano' style={{ margin: compact ? '6px 0 0' : '6px 0 0', fontSize: 10 }}>
                    AI chưa tìm thấy danh mục phù hợp
                </Tag>
            );
        }

        const match = getRowCatalogMatch(row);
        if (!row.materialName.trim()) return null;

        if (match.status === 'matched' && match.material) {
            return (
                <Tag color='success' style={{ margin: compact ? '6px 0 0' : '6px 0 0', fontSize: 10 }}>
                    {row.materialId ? 'Đã gắn' : 'Tự khớp'} {match.material.code ? `· ${match.material.code}` : ''}
                </Tag>
            );
        }

        if ((match.status === 'suggested' || match.status === 'ambiguous') && match.material) {
            return (
                <Button
                    type='link'
                    size='small'
                    style={{
                        height: compact ? 'auto' : 22,
                        maxWidth: '100%',
                        padding: 0,
                        whiteSpace: 'normal',
                        textAlign: 'left',
                        lineHeight: 1.3,
                        fontSize: compact ? 12 : 11,
                        fontWeight: 600,
                    }}
                    onClick={(event) => {
                        event.stopPropagation();
                        applyMaterialToRow(row.key, match.material!);
                    }}
                >
                    {match.status === 'ambiguous' ? `Cần xác nhận (${match.candidateCount} mã): ` : 'Gợi ý: '}
                    {match.material.code ? `[${match.material.code}] ` : ''}
                    {match.material.name}
                </Button>
            );
        }

        if (match.status === 'ambiguous') {
            return (
                <Tag color='gold' style={{ margin: compact ? '6px 0 0' : '6px 0 0', fontSize: 10 }}>
                    Trùng tên, cần chọn mã
                </Tag>
            );
        }

        return (
            <Tag color='orange' style={{ margin: compact ? '6px 0 0' : '6px 0 0', fontSize: 10 }}>
                Chưa có danh mục
            </Tag>
        );
    };

    const addRow = () => {
        const r = newRow();
        setItems((p) => [...p, r]);
        setSelectedKey(r.key);
        markRecent([r.key]);
        window.setTimeout(() => document.querySelector<HTMLElement>(`[data-row-key="${r.key}"] input`)?.focus(), 120);
    };

    const duplicateRow = (r: ItemRow) => {
        const dup = computeRow({ ...r, key: createRowKey() });
        setItems((p) => {
            const idx = p.findIndex((x) => x.key === r.key);
            const next = [...p];
            next.splice(idx + 1, 0, dup);
            return next;
        });
        setSelectedKey(dup.key);
        markRecent([dup.key]);
    };

    const deleteRow = (key: string) => {
        if (items.length === 1) return;
        const row = items.find((x) => x.key === key);
        const hasImportantData = Boolean(
            row?.materialName.trim() || row?.purpose.trim() || row?.supplierId || row?.unitPrice || row?.totalPrice
        );
        const remove = () => {
            const idx = items.findIndex((x) => x.key === key);
            const next = items.filter((x) => x.key !== key);
            setItems(next);
            setCheckedKeys((prev) => {
                const n = new Set(prev);
                n.delete(key);
                return n;
            });
            if (selectedKey === key) {
                setSelectedKey(next.length > 0 ? next[Math.min(idx, next.length - 1)].key : null);
            }
        };
        if (hasImportantData) {
            modal.confirm({
                title: 'Xóa dòng vật tư?',
                content: 'Dòng này đã có dữ liệu nhập. Thao tác xóa không thể hoàn tác trong form hiện tại.',
                okText: 'Xóa dòng',
                cancelText: 'Giữ lại',
                okButtonProps: { danger: true },
                onOk: remove,
            });
            return;
        }
        remove();
    };

    const patchSelected = (patch: Partial<ItemRow>) => {
        if (!selectedKey) return;
        updateRow(selectedKey, patch);
    };

    const selectedRow = items.find((r) => r.key === selectedKey) ?? null;
    const selectedIdx = items.findIndex((r) => r.key === selectedKey);
    const selectedCatalogMatch = selectedRow ? getRowCatalogMatch(selectedRow) : null;

    const hasRowError = (key: string) =>
        errors.has(`${key}-name`) ||
        errors.has(`${key}-plant`) ||
        errors.has(`${key}-proposedBy`) ||
        errors.has(`${key}-qty`) ||
        errors.has(`${key}-unit`) ||
        errors.has(`${key}-purpose`) ||
        errors.has(`${key}-qtyOrdered`) ||
        errors.has(`${key}-unitPrice`) ||
        errors.has(`${key}-vat`);

    const errorRowCount = items.filter((r) => hasRowError(r.key)).length;
    const requiredIssueRows = items.filter((r) => getRequiredIssues(r).length > 0);
    const missingSupplierCount = items.filter((r) => !r.supplierId && !r.supplierName).length;
    const missingPurposeCount = items.filter((r) => !r.purpose.trim()).length;
    const missingPriceCount = items.filter((r) => !r.unitPrice || r.unitPrice <= 0).length;
    const visibleItems = showMissingOnly
        ? items.filter((r) => {
              const catalogMatch = getRowCatalogMatch(r);
              return (
                  getRequiredIssues(r).length > 0 ||
                  (!r.supplierId && !r.supplierName) ||
                  (Boolean(r.materialName.trim()) && catalogMatch.status !== 'matched')
              );
          })
        : items;
    const allVisibleChecked = visibleItems.length > 0 && visibleItems.every((r) => checkedKeys.has(r.key));
    const someVisibleChecked = visibleItems.some((r) => checkedKeys.has(r.key));
    const bulkDisabled = checkedKeys.size === 0;
    const fieldStatus = (key: string, field: string) => (errors.has(`${key}-${field}`) ? 'error' : undefined);
    const catalogMatches = items.map((row) => ({ row, match: getRowCatalogMatch(row) }));
    const suggestedCatalogCount = catalogMatches.filter(
        ({ row, match }) => row.materialName.trim() && (match.status === 'suggested' || match.status === 'ambiguous')
    ).length;
    const unmatchedCatalogCount = catalogMatches.filter(
        ({ row, match }) => row.materialName.trim() && match.status === 'unmatched'
    ).length;
    const strongAiMatchCount = items.filter((row) => {
        const match = aiMatches[row.key];
        return !row.materialId && match?.materialId && match.status === 'matched' && match.confidence >= 92;
    }).length;
    const aiSuggestionCount = items.filter((row) => {
        const match = aiMatches[row.key];
        return !row.materialId && match && match.status !== 'unmatched';
    }).length;

    const toggleAllVisible = (checked: boolean) => {
        setCheckedKeys((prev) => {
            const next = new Set(prev);
            visibleItems.forEach((r) => (checked ? next.add(r.key) : next.delete(r.key)));
            return next;
        });
    };

    const applyBulk = (patch: Partial<ItemRow>, label: string) => {
        const keys = Array.from(checkedKeys);
        if (!keys.length) {
            notification.info({ title: 'Chọn dòng cần áp dụng trước' });
            return;
        }
        setItems((prev) => prev.map((r) => (checkedKeys.has(r.key) ? computeRow({ ...r, ...patch }) : r)));
        clearPatchedErrors(keys, patch);
        markRecent(keys);
        notification.success({ title: `Đã áp dụng ${label} cho ${keys.length} dòng` });
    };

    const renderHeader = (label: string, required = false) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
            {label} {required && <Text type='danger'>*</Text>}
        </span>
    );

    const handleMaterialSearch = React.useCallback((value: string) => {
        setMaterialSearchInput(value);
    }, []);

    const focusQuantityRequested = React.useCallback((key: string) => {
        window.setTimeout(() => {
            document.querySelector<HTMLInputElement>(`[data-row-key="${key}"] .purchase-request-qty input`)?.focus();
        }, 80);
    }, []);

    const materialNotFoundContent = (
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
                <div>
                    <div>Không tìm thấy vật tư phù hợp</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>
                        Tìm theo mã, tên vật tư hoặc tên không dấu.
                    </div>
                </div>
            }
        />
    );

    const tableCellProps = () => ({ style: { verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 } });
    const controlCellStyle: React.CSSProperties = {
        minHeight: 30,
        display: 'flex',
        alignItems: 'flex-start',
    };

    // ── Grid columns for left panel (workspace mode) ──
    const gridColumns: TableColumnsType<ItemRow> = [
        {
            key: 'select',
            width: 42,
            align: 'center',
            onCell: tableCellProps,
            title: (
                <Checkbox
                    checked={allVisibleChecked}
                    indeterminate={!allVisibleChecked && someVisibleChecked}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                />
            ),
            render: (_: any, r: ItemRow) => (
                <Checkbox
                    checked={checkedKeys.has(r.key)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                        setCheckedKeys((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.key);
                            else next.delete(r.key);
                            return next;
                        })
                    }
                />
            ),
        },
        {
            key: 'stt',
            width: 48,
            align: 'center',
            onCell: tableCellProps,
            title: <span style={{ color: '#94a3b8' }}>STT</span>,
            render: (_: any, r: ItemRow) => (
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{items.findIndex((x) => x.key === r.key) + 1}</span>
            ),
        },
        {
            key: 'name',
            width: 292,
            onCell: tableCellProps,
            title: (
                <span style={{ whiteSpace: 'nowrap' }}>
                    Tên vật tư <Text type='danger'>*</Text>
                </span>
            ),
            render: (_: any, r: ItemRow) => (
                <div style={{ minWidth: 0 }}>
                    <MaterialPickerCell
                        size='small'
                        value={r.materialName}
                        material={resolveRowMaterial(r)}
                        options={matOptions}
                        status={fieldStatus(r.key, 'name')}
                        notFoundContent={materialNotFoundContent}
                        searchQuery={debouncedMaterialSearch}
                        onSearch={handleMaterialSearch}
                        onChange={(v) => updateRow(r.key, { materialName: v, materialId: undefined })}
                        onSelect={(_, opt) => {
                            updateRow(r.key, {
                                materialName: opt.item.name,
                                materialId: opt.materialId,
                                unit: opt.unit ?? '',
                            });
                            focusQuantityRequested(r.key);
                        }}
                        onBlur={() => autoApplyMaterialMatch(r.key)}
                        placeholder='Tìm mã, tên vật tư hoặc tên không dấu'
                    />
                    {renderCatalogHint(r)}
                </div>
            ),
        },
        {
            key: 'plant',
            width: 112,
            onCell: tableCellProps,
            title: (
                <span style={{ whiteSpace: 'nowrap' }}>
                    Cơ sở <Text type='danger'>*</Text>
                </span>
            ),
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <Select
                        size='small'
                        value={r.plantId || undefined}
                        style={{ width: '100%' }}
                        status={fieldStatus(r.key, 'plant')}
                        placeholder='Chọn CS'
                        options={plantOptions}
                        onChange={(v) => updateRow(r.key, { plantId: v })}
                    />
                </div>
            ),
        },
        {
            key: 'proposedBy',
            width: 150,
            onCell: tableCellProps,
            title: renderHeader('Người đề xuất', true),
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <Input
                        size='small'
                        value={r.proposedBy}
                        status={fieldStatus(r.key, 'proposedBy')}
                        placeholder='Người đề xuất'
                        onChange={(e) => updateRow(r.key, { proposedBy: e.target.value })}
                    />
                </div>
            ),
        },
        {
            key: 'qty',
            width: 76,
            onCell: tableCellProps,
            title: (
                <span style={{ whiteSpace: 'nowrap' }}>
                    SL cần <Text type='danger'>*</Text>
                </span>
            ),
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <InputNumber
                        size='small'
                        min={1}
                        value={r.quantityRequested}
                        className='purchase-request-qty'
                        style={{ width: '100%' }}
                        status={fieldStatus(r.key, 'qty')}
                        onChange={(v) => updateRow(r.key, { quantityRequested: v ?? 1, quantityOrdered: v ?? 1 })}
                    />
                </div>
            ),
        },
        {
            key: 'unit',
            width: 68,
            onCell: tableCellProps,
            title: (
                <span style={{ whiteSpace: 'nowrap' }}>
                    ĐVT <Text type='danger'>*</Text>
                </span>
            ),
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <Input
                        size='small'
                        value={r.unit}
                        status={fieldStatus(r.key, 'unit')}
                        placeholder='Cái...'
                        onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                    />
                </div>
            ),
        },
        {
            key: 'qtyO',
            width: 76,
            onCell: tableCellProps,
            title: 'SL mua',
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <InputNumber
                        size='small'
                        min={0}
                        value={r.quantityOrdered}
                        style={{ width: '100%' }}
                        status={fieldStatus(r.key, 'qtyOrdered')}
                        onChange={(v) => updateRow(r.key, { quantityOrdered: v ?? 0 })}
                    />
                </div>
            ),
        },
        {
            key: 'price',
            width: 112,
            onCell: tableCellProps,
            title: 'Đơn giá',
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    <InputNumber
                        size='small'
                        min={0}
                        value={r.unitPrice}
                        style={{ width: '100%' }}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                        status={fieldStatus(r.key, 'unitPrice')}
                        onChange={(v) => updateRow(r.key, { unitPrice: v ?? 0 })}
                    />
                </div>
            ),
        },
        {
            key: 'total',
            width: 112,
            align: 'right',
            onCell: tableCellProps,
            title: 'Thành tiền',
            render: (_: any, r: ItemRow) => (
                <div
                    style={{
                        ...controlCellStyle,
                        justifyContent: 'flex-end',
                        color: r.totalPrice > 0 ? '#1A3A5C' : '#cbd5e1',
                    }}
                >
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtVND(r.totalPrice)}</span>
                </div>
            ),
        },
        {
            key: 'supplier',
            width: 120,
            onCell: tableCellProps,
            title: renderHeader('NCC'),
            render: (_: any, r: ItemRow) => (
                <div style={controlCellStyle}>
                    {r.supplierName ? (
                        <Tag
                            color='blue'
                            style={{ maxWidth: 112, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                            {r.supplierName}
                        </Tag>
                    ) : (
                        <Tag color='warning' style={{ margin: 0 }}>
                            Thiếu NCC
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            key: 'lineStatus',
            width: 104,
            onCell: tableCellProps,
            title: renderHeader('Trạng thái'),
            render: (_: any, r: ItemRow) => {
                const catalogMatch = getRowCatalogMatch(r);
                let badge: React.ReactNode;
                if (getRequiredIssues(r).length) badge = <Badge status='error' text='Thiếu' />;
                else if (catalogMatch.status === 'unmatched') badge = <Badge status='warning' text='Chưa khớp' />;
                else if (catalogMatch.status === 'suggested' || catalogMatch.status === 'ambiguous') {
                    badge = <Badge status='processing' text='Có gợi ý' />;
                } else if (!r.supplierId && !r.supplierName) badge = <Badge status='warning' text='Thiếu NCC' />;
                else badge = <Badge status='success' text='Đủ' />;

                return <div style={controlCellStyle}>{badge}</div>;
            },
        },
        {
            key: 'rowActions',
            width: 64,
            align: 'center',
            onCell: tableCellProps,
            title: '',
            render: (_: any, r: ItemRow) => (
                <Space size={2} style={{ minHeight: 30, alignItems: 'flex-start' }}>
                    <Tooltip title='Nhân đôi dòng'>
                        <Button
                            type='text'
                            size='small'
                            icon={<CopyOutlined />}
                            style={{ color: '#94a3b8' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                duplicateRow(r);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title='Xóa dòng'>
                        <Button
                            type='text'
                            danger
                            size='small'
                            icon={<DeleteOutlined />}
                            disabled={items.length === 1}
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteRow(r.key);
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // ── Detail panel (right side) ──
    const detailPanel = (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {selectedRow ? (
                <>
                    <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                            Chi tiết dòng #{selectedIdx + 1} / {items.length}
                            {hasRowError(selectedRow.key) && (
                                <Text type='danger' style={{ marginLeft: 8, fontSize: 11 }}>
                                    · Còn thiếu thông tin
                                </Text>
                            )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A3A5C', lineHeight: 1.4, marginTop: 4 }}>
                            {selectedRow.materialName || 'Vật tư chưa có tên'}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <Alert
                                type='info'
                                showIcon
                                title='Các thông tin trong panel này chỉ áp dụng cho dòng vật tư đang chọn.'
                                style={{ borderRadius: 8, fontSize: 12 }}
                            />
                            {selectedCatalogMatch && selectedRow.materialName.trim() ? (
                                <Alert
                                    type={
                                        selectedCatalogMatch.status === 'matched'
                                            ? 'success'
                                            : selectedCatalogMatch.status === 'unmatched'
                                              ? 'warning'
                                              : 'info'
                                    }
                                    showIcon
                                    style={{ borderRadius: 8, fontSize: 12 }}
                                    title={
                                        selectedCatalogMatch.status === 'matched'
                                            ? 'Dòng này đã khớp danh mục vật tư'
                                            : selectedCatalogMatch.status === 'unmatched'
                                              ? 'Chưa tìm thấy vật tư trong danh mục'
                                              : 'Có gợi ý vật tư cần xác nhận'
                                    }
                                    description={
                                        selectedCatalogMatch.material ? (
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <span>
                                                    {selectedCatalogMatch.material.code
                                                        ? `[${selectedCatalogMatch.material.code}] `
                                                        : ''}
                                                    {selectedCatalogMatch.material.name}
                                                </span>
                                                {selectedCatalogMatch.status !== 'matched' ? (
                                                    <Button
                                                        size='small'
                                                        type='primary'
                                                        onClick={() =>
                                                            applyMaterialToRow(
                                                                selectedRow.key,
                                                                selectedCatalogMatch.material!
                                                            )
                                                        }
                                                    >
                                                        Gắn vật tư này
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : (
                                            'Nếu đây là vật tư mới, có thể tiếp tục lưu dưới dạng chưa có danh mục.'
                                        )
                                    }
                                />
                            ) : null}
                            <div>
                                <FieldLabel req>Người đề xuất</FieldLabel>
                                <Input
                                    size='small'
                                    value={selectedRow.proposedBy}
                                    status={errors.has(`${selectedKey}-proposedBy`) ? 'error' : undefined}
                                    placeholder='Họ tên người đề xuất mua...'
                                    onChange={(e) => patchSelected({ proposedBy: e.target.value })}
                                />
                                {errors.has(`${selectedKey}-proposedBy`) && (
                                    <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 3 }}>
                                        Vui lòng nhập người đề xuất
                                    </div>
                                )}
                            </div>
                            <div>
                                <FieldLabel req>Nội dung / Mục đích</FieldLabel>
                                <Input.TextArea
                                    size='small'
                                    value={selectedRow.purpose}
                                    status={errors.has(`${selectedKey}-purpose`) ? 'error' : undefined}
                                    placeholder='Mục đích mua, công trình, hạng mục áp dụng...'
                                    rows={3}
                                    onChange={(e) => patchSelected({ purpose: e.target.value })}
                                />
                                {errors.has(`${selectedKey}-purpose`) && (
                                    <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 3 }}>
                                        Vui lòng nhập nội dung / mục đích
                                    </div>
                                )}
                            </div>
                            <div>
                                <FieldLabel>Nhà cung cấp</FieldLabel>
                                <Select
                                    size='small'
                                    showSearch
                                    allowClear
                                    value={selectedRow.supplierId}
                                    style={{ width: '100%' }}
                                    placeholder='Chọn nhà cung cấp...'
                                    options={supplierOptions}
                                    filterOption={(input, opt) =>
                                        String(opt?.label ?? '')
                                            .toLowerCase()
                                            .includes(input.toLowerCase())
                                    }
                                    onChange={(v, opt: any) =>
                                        patchSelected({ supplierId: v, supplierName: opt?.label })
                                    }
                                />
                            </div>
                            <div style={{ borderTop: '1px solid #f0f0f0' }} />
                            <div>
                                <FieldLabel>Thuế &amp; Chi phí</FieldLabel>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>VAT%</div>
                                        <InputNumber
                                            size='small'
                                            min={0}
                                            max={100}
                                            value={selectedRow.vatRate}
                                            style={{ width: '100%' }}
                                            formatter={(v) => `${v}%`}
                                            parser={(v) => Number(String(v).replace('%', '')) as any}
                                            onChange={(v) => patchSelected({ vatRate: v ?? 0 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>Giá VAT</div>
                                        <ReadonlyVal value={fmtVND(selectedRow.vatAmount)} />
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>Tổng có VAT</div>
                                    <div
                                        style={{
                                            padding: '6px 12px',
                                            border: '1px solid #bfdbfe',
                                            borderRadius: 6,
                                            background: '#eff6ff',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: '#1A3A5C',
                                        }}
                                    >
                                        {fmtVND(selectedRow.totalWithVat)}
                                    </div>
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid #f0f0f0' }} />
                            <div>
                                <FieldLabel>Tiến độ</FieldLabel>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>
                                            Ngày lên đơn
                                        </div>
                                        <DatePicker
                                            size='small'
                                            value={selectedRow.orderDate}
                                            format='DD/MM/YYYY'
                                            style={{ width: '100%' }}
                                            placeholder='DD/MM/YYYY'
                                            onChange={(v) => patchSelected({ orderDate: v ?? undefined })}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>Ngày nhận</div>
                                        <DatePicker
                                            size='small'
                                            value={selectedRow.receivedDate}
                                            format='DD/MM/YYYY'
                                            style={{ width: '100%' }}
                                            placeholder='DD/MM/YYYY'
                                            onChange={(v) => patchSelected({ receivedDate: v ?? undefined })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <FieldLabel>Ghi chú dòng</FieldLabel>
                                <Input.TextArea
                                    size='small'
                                    rows={3}
                                    value={selectedRow.note}
                                    placeholder='Ghi chú riêng cho dòng vật tư này nếu có'
                                    onChange={(e) => patchSelected({ note: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 40,
                        textAlign: 'center',
                    }}
                >
                    <ShoppingOutlined style={{ fontSize: 36, marginBottom: 14, color: '#cbd5e1' }} />
                    <Text type='secondary' style={{ fontSize: 13 }}>
                        Chọn một dòng vật tư để nhập thông tin chi tiết
                    </Text>
                    {items.length > 0 && (
                        <Button style={{ marginTop: 14 }} onClick={() => setSelectedKey(items[0].key)}>
                            Chọn dòng đầu tiên
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    // ── Shared footer bar ──
    const footerBar = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 20px',
                borderTop: '1px solid #f0f0f0',
                background: '#fff',
                flexShrink: 0,
            }}
        >
            <div>
                <Text type='secondary' style={{ fontSize: 13 }}>
                    {items.length} dòng vật tư
                </Text>
                {requiredIssueRows.length > 0 && (
                    <Text type='danger' style={{ fontSize: 13 }}>
                        {' '}
                        · {requiredIssueRows.length} dòng thiếu thông tin bắt buộc
                    </Text>
                )}
            </div>
            <Space size={8}>
                <Button onClick={onClose} disabled={submitting}>
                    Hủy
                </Button>
                {!isEditingPending && (
                    <Button loading={submitting} disabled={submitting} onClick={() => handleSubmit('draft')}>
                        Lưu nháp
                    </Button>
                )}
                <Button
                    type='primary'
                    style={{ background: '#1A3A5C', minWidth: 96 }}
                    loading={submitting}
                    onClick={() => handleSubmit('pending')}
                >
                    {isEditingPending ? 'Cập nhật phiếu' : 'Gửi duyệt'}
                </Button>
            </Space>
        </div>
    );

    // ── Mobile / tablet (<1280px): bottom drawer with cards ──
    if (!useWorkspace) {
        return (
            <Drawer
                open={open}
                onClose={onClose}
                placement='bottom'
                size='95%'
                destroyOnClose
                styles={{ body: { padding: '16px', overflowY: 'auto' }, footer: { padding: '12px 16px' } }}
                title={initial ? `Chỉnh sửa — ${initial.requestCode}` : 'Tạo đề nghị mua vật tư'}
                footer={
                    <div>
                        <div className='mb-2 flex items-center justify-between'>
                            <span className='text-xs text-slate-400'>Tổng cộng</span>
                            <span className='font-bold text-[#1A3A5C]'>{fmtVND(totals.total)}</span>
                        </div>
                        <div className='flex flex-col-reverse gap-2'>
                            <Button onClick={onClose} block>
                                Hủy
                            </Button>
                            {!isEditingPending && (
                                <Button loading={submitting} onClick={() => handleSubmit('draft')} block>
                                    Lưu nháp
                                </Button>
                            )}
                            <Button
                                type='primary'
                                style={{ background: '#1A3A5C' }}
                                loading={submitting}
                                onClick={() => handleSubmit('pending')}
                                block
                            >
                                {isEditingPending ? 'Cập nhật phiếu' : 'Gửi duyệt'}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className='mb-4 grid grid-cols-2 gap-3'>
                    <div>
                        <div className='mb-1 text-xs text-slate-400'>
                            Tháng <Text type='danger'>*</Text>
                        </div>
                        <Select style={{ width: '100%' }} value={month} options={MONTH_OPTIONS} onChange={setMonth} />
                    </div>
                    <div>
                        <div className='mb-1 text-xs text-slate-400'>
                            Năm <Text type='danger'>*</Text>
                        </div>
                        <InputNumber
                            style={{ width: '100%' }}
                            value={year}
                            min={2020}
                            max={2099}
                            onChange={(v) => setYear(v ?? now.year())}
                        />
                    </div>
                </div>
                <div className='flex flex-col gap-3'>
                    {items.map((r, index) => (
                        <div key={r.key} className='min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3'>
                            <div className='mb-2 flex items-center justify-between'>
                                <span className='text-xs font-semibold text-slate-500'>Vật tư #{index + 1}</span>
                                <Button
                                    type='text'
                                    danger
                                    size='small'
                                    icon={<DeleteOutlined />}
                                    disabled={items.length === 1}
                                    onClick={() => deleteRow(r.key)}
                                />
                            </div>
                            <div className='grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2'>
                                <div className='min-w-0 sm:col-span-2'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        Tên vật tư <Text type='danger'>*</Text>
                                    </div>
                                    <MaterialPickerCell
                                        size='large'
                                        value={r.materialName}
                                        material={resolveRowMaterial(r)}
                                        options={matOptions}
                                        status={errors.has(`${r.key}-name`) ? 'error' : undefined}
                                        notFoundContent={materialNotFoundContent}
                                        searchQuery={debouncedMaterialSearch}
                                        onSearch={handleMaterialSearch}
                                        onChange={(v) => updateRow(r.key, { materialName: v, materialId: undefined })}
                                        onSelect={(_, opt) =>
                                            updateRow(r.key, {
                                                materialName: opt.item.name,
                                                materialId: opt.materialId,
                                                unit: opt.unit ?? '',
                                            })
                                        }
                                        onBlur={() => autoApplyMaterialMatch(r.key)}
                                        placeholder='Tìm mã, tên vật tư hoặc tên không dấu'
                                    />
                                    {renderCatalogHint(r, true)}
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        Cơ sở <Text type='danger'>*</Text>
                                    </div>
                                    <Select
                                        size='large'
                                        value={r.plantId || undefined}
                                        style={{ width: '100%' }}
                                        status={fieldStatus(r.key, 'plant')}
                                        placeholder='Cơ sở'
                                        options={plants.map((p) => ({ value: p.id, label: p.name }))}
                                        onChange={(v) => updateRow(r.key, { plantId: v })}
                                    />
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        Người đề xuất <Text type='danger'>*</Text>
                                    </div>
                                    <Input
                                        size='large'
                                        value={r.proposedBy}
                                        status={fieldStatus(r.key, 'proposedBy')}
                                        placeholder='Người đề xuất'
                                        onChange={(e) => updateRow(r.key, { proposedBy: e.target.value })}
                                    />
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        SL cần <Text type='danger'>*</Text>
                                    </div>
                                    <InputNumber
                                        size='large'
                                        min={1}
                                        value={r.quantityRequested}
                                        style={{ width: '100%' }}
                                        status={fieldStatus(r.key, 'qty')}
                                        onChange={(v) =>
                                            updateRow(r.key, {
                                                quantityRequested: v ?? 1,
                                                quantityOrdered: v ?? 1,
                                            })
                                        }
                                    />
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        ĐVT <Text type='danger'>*</Text>
                                    </div>
                                    <Input
                                        size='large'
                                        value={r.unit}
                                        status={fieldStatus(r.key, 'unit')}
                                        placeholder='Cái, Kg...'
                                        onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                                    />
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>Đơn giá</div>
                                    <InputNumber
                                        size='large'
                                        min={0}
                                        value={r.unitPrice}
                                        style={{ width: '100%' }}
                                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                        parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                                        status={fieldStatus(r.key, 'unitPrice')}
                                        onChange={(v) => updateRow(r.key, { unitPrice: v ?? 0 })}
                                    />
                                </div>
                                <div className='min-w-0'>
                                    <div className='mb-1 text-xs text-slate-400'>VAT%</div>
                                    <InputNumber
                                        size='large'
                                        min={0}
                                        max={100}
                                        value={r.vatRate}
                                        style={{ width: '100%' }}
                                        formatter={(v) => `${v}%`}
                                        parser={(v) => Number(String(v).replace('%', '')) as any}
                                        status={fieldStatus(r.key, 'vat')}
                                        onChange={(v) => updateRow(r.key, { vatRate: v ?? 0 })}
                                    />
                                </div>
                                <div className='min-w-0 sm:col-span-2'>
                                    <div className='mb-1 text-xs text-slate-400'>
                                        Nội dung <Text type='danger'>*</Text>
                                    </div>
                                    <Input
                                        size='large'
                                        value={r.purpose}
                                        status={errors.has(`${r.key}-purpose`) ? 'error' : undefined}
                                        placeholder='Nội dung mua...'
                                        onChange={(e) => updateRow(r.key, { purpose: e.target.value })}
                                    />
                                </div>
                                {r.totalWithVat > 0 && (
                                    <div className='min-w-0 text-right text-sm font-bold text-[#1A3A5C] sm:col-span-2'>
                                        Tổng: {fmtVND(r.totalWithVat)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <Upload
                        accept='image/*'
                        showUploadList={false}
                        maxCount={1}
                        className='block w-full [&_.ant-upload]:block'
                        beforeUpload={(file) => {
                            handleScanInvoice(file as unknown as File);
                            return false;
                        }}
                    >
                        <Button
                            block
                            icon={<CameraOutlined />}
                            loading={scanningInvoice}
                            style={{ color: '#2f51d9', borderColor: '#2f51d9' }}
                        >
                            Quét hóa đơn
                        </Button>
                    </Upload>
                    <Button type='dashed' block icon={<PlusOutlined />} onClick={addRow}>
                        Thêm vật tư
                    </Button>
                    <Button block icon={<ThunderboltOutlined />} loading={aiMatching} onClick={handleAiMaterialMatch}>
                        AI khớp vật tư
                    </Button>
                    <Button block onClick={applySmartCatalogMatch}>
                        Tự khớp danh mục vật tư
                    </Button>
                </div>
            </Drawer>
        );
    }

    // ── Desktop xl+: fullscreen 2-panel workspace ──
    return (
        <Drawer
            open={open}
            onClose={onClose}
            size='100%'
            placement='right'
            closable={false}
            destroyOnClose
            styles={{
                body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                wrapper: { boxShadow: 'none' },
            }}
        >
            {/* Workspace header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '0 20px',
                    height: 56,
                    borderBottom: '1px solid #e8ecef',
                    background: '#fff',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <ShoppingOutlined style={{ color: '#1A3A5C', fontSize: 16 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1A3A5C', whiteSpace: 'nowrap' }}>
                        {initial ? 'Chỉnh sửa phiếu đề nghị' : 'Tạo đề nghị mua vật tư'}
                    </span>
                </div>
                <div style={{ width: 1, height: 22, background: '#e2e8f0', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {initial?.requestCode ? (
                        <Tag
                            style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, flexShrink: 0, margin: 0 }}
                        >
                            {initial.requestCode}
                        </Tag>
                    ) : (
                        <Text type='secondary' style={{ fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }}>
                            Mã: Tự động tạo
                        </Text>
                    )}
                    <Select
                        size='small'
                        style={{ width: 116, flexShrink: 0 }}
                        value={month}
                        options={MONTH_OPTIONS}
                        onChange={setMonth}
                    />
                    <InputNumber
                        size='small'
                        style={{ width: 78, flexShrink: 0 }}
                        value={year}
                        min={2020}
                        max={2099}
                        onChange={(v) => setYear(v ?? now.year())}
                    />
                    <Tag color='default' style={{ margin: 0, flexShrink: 0 }}>
                        Bản nháp
                    </Tag>
                </div>
                <Button
                    type='text'
                    icon={<CloseOutlined />}
                    onClick={onClose}
                    disabled={submitting}
                    style={{ flexShrink: 0, color: '#64748b' }}
                />
            </div>

            {/* Main body: left grid + right detail */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left: items grid */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '10px 16px',
                            borderBottom: '1px solid #f0f0f0',
                            flexShrink: 0,
                            background: '#fff',
                            flexWrap: 'wrap',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text strong style={{ fontSize: 13 }}>
                                Áp dụng cho dòng đã chọn
                            </Text>
                            <Tag color={checkedKeys.size ? 'blue' : 'default'} style={{ margin: 0, fontSize: 11 }}>
                                {checkedKeys.size} dòng
                            </Tag>
                            <Input
                                size='small'
                                allowClear
                                value={bulkProposedBy}
                                disabled={bulkDisabled}
                                placeholder='Người đề xuất'
                                style={{ width: 160 }}
                                onChange={(e) => setBulkProposedBy(e.target.value)}
                            />
                            <Button
                                size='small'
                                disabled={bulkDisabled || !bulkProposedBy.trim()}
                                onClick={() => applyBulk({ proposedBy: bulkProposedBy.trim() }, 'người đề xuất')}
                            >
                                Áp dụng
                            </Button>
                            <Select
                                size='small'
                                showSearch
                                allowClear
                                disabled={bulkDisabled}
                                value={bulkSupplierId}
                                placeholder='Nhà cung cấp'
                                style={{ width: 180 }}
                                options={supplierOptions}
                                filterOption={(input, opt) =>
                                    String(opt?.label ?? '')
                                        .toLowerCase()
                                        .includes(input.toLowerCase())
                                }
                                onChange={(v, opt: any) => {
                                    setBulkSupplierId(v);
                                    setBulkSupplierName(opt?.label);
                                }}
                            />
                            <Button
                                size='small'
                                disabled={bulkDisabled || !bulkSupplierId}
                                onClick={() =>
                                    applyBulk({ supplierId: bulkSupplierId, supplierName: bulkSupplierName }, 'NCC')
                                }
                            >
                                Áp dụng
                            </Button>
                            <InputNumber
                                size='small'
                                min={0}
                                max={100}
                                value={bulkVatRate}
                                disabled={bulkDisabled}
                                style={{ width: 82 }}
                                formatter={(v) => `${v}%`}
                                parser={(v) => Number(String(v).replace('%', '')) as any}
                                onChange={(v) => setBulkVatRate(v)}
                            />
                            <Button
                                size='small'
                                disabled={bulkDisabled || bulkVatRate == null}
                                onClick={() => applyBulk({ vatRate: bulkVatRate ?? 0 }, 'VAT')}
                            >
                                Áp dụng VAT
                            </Button>
                            <Select
                                size='small'
                                allowClear
                                disabled={bulkDisabled}
                                value={bulkPlantId}
                                placeholder='Cơ sở'
                                style={{ width: 140 }}
                                options={plantOptions}
                                onChange={setBulkPlantId}
                            />
                            <Button
                                size='small'
                                disabled={bulkDisabled || !bulkPlantId}
                                onClick={() => applyBulk({ plantId: bulkPlantId }, 'cơ sở')}
                            >
                                Áp dụng
                            </Button>
                        </div>
                        <Space size={8}>
                            <Upload
                                accept='image/*'
                                showUploadList={false}
                                maxCount={1}
                                beforeUpload={(file) => {
                                    handleScanInvoice(file as unknown as File);
                                    return false;
                                }}
                            >
                                <Button
                                    size='small'
                                    icon={<CameraOutlined />}
                                    loading={scanningInvoice}
                                    style={{ color: '#2f51d9', borderColor: '#2f51d9' }}
                                >
                                    Quét hóa đơn
                                </Button>
                            </Upload>
                            <Button size='small' onClick={applySmartCatalogMatch}>
                                Tự khớp danh mục
                            </Button>
                            <Button
                                size='small'
                                icon={<ThunderboltOutlined />}
                                loading={aiMatching}
                                onClick={handleAiMaterialMatch}
                            >
                                AI khớp vật tư
                            </Button>
                            {strongAiMatchCount > 0 ? (
                                <Button size='small' type='primary' ghost onClick={applyStrongAiMatches}>
                                    Áp dụng AI ({strongAiMatchCount})
                                </Button>
                            ) : null}
                            <Button
                                size='small'
                                icon={<FilterOutlined />}
                                type={showMissingOnly ? 'primary' : 'default'}
                                ghost={showMissingOnly}
                                onClick={() => setShowMissingOnly((v) => !v)}
                            >
                                Dòng thiếu
                            </Button>
                            <Button size='small' type='primary' ghost icon={<PlusOutlined />} onClick={addRow}>
                                Thêm vật tư
                            </Button>
                        </Space>
                    </div>
                    {validationMessages.length > 0 && (
                        <Alert
                            type='error'
                            showIcon
                            style={{ borderRadius: 0, flexShrink: 0 }}
                            title={`Còn ${validationMessages.length} dòng thiếu thông tin`}
                            description={validationMessages.slice(0, 5).join(' | ')}
                        />
                    )}
                    <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
                        <Table
                            dataSource={visibleItems}
                            columns={gridColumns}
                            rowKey='key'
                            pagination={false}
                            size='small'
                            tableLayout='fixed'
                            scroll={{ x: 1220 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={
                                            showMissingOnly ? 'Không có dòng thiếu thông tin' : 'Chưa có vật tư'
                                        }
                                    />
                                ),
                            }}
                            onRow={(r) => ({
                                onClick: () => setSelectedKey(r.key),
                                style: {
                                    background:
                                        selectedKey === r.key
                                            ? '#eff6ff'
                                            : recentlyUpdatedKeys.has(r.key)
                                              ? '#ecfdf5'
                                              : hasRowError(r.key)
                                                ? '#fff5f5'
                                                : undefined,
                                    cursor: 'pointer',
                                    transition: 'background 150ms ease, box-shadow 150ms ease',
                                    borderLeft:
                                        selectedKey === r.key
                                            ? '3px solid #3b82f6'
                                            : hasRowError(r.key)
                                              ? '3px solid #fca5a5'
                                              : '3px solid transparent',
                                },
                            })}
                        />
                    </div>
                </div>

                {/* Right: detail panel */}
                <div
                    style={{
                        width: 340,
                        flexShrink: 0,
                        borderLeft: '1px solid #e8ecef',
                        background: '#fafbfc',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {detailPanel}
                </div>
            </div>

            {/* Summary bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 20,
                    padding: '10px 20px',
                    borderTop: '1px solid #f0f0f0',
                    background: summaryPulse ? '#eef6ff' : '#fafbfc',
                    flexShrink: 0,
                    transition: 'background 260ms ease',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {[
                        ['Số dòng', items.length],
                        ['Thiếu thông tin', requiredIssueRows.length],
                        ['Thiếu NCC', missingSupplierCount],
                        ['Thiếu nội dung', missingPurposeCount],
                        ['Chưa có đơn giá', missingPriceCount],
                        ['Cần xác nhận DM', suggestedCatalogCount],
                        ['Chưa có DM', unmatchedCatalogCount],
                        ['AI gợi ý', aiSuggestionCount],
                    ].map(([label, value]) => (
                        <Tag
                            key={label}
                            color={value && label !== 'Số dòng' ? 'warning' : 'default'}
                            style={{ margin: 0 }}
                        >
                            {label}: {value}
                        </Tag>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Text type='secondary' style={{ fontSize: 12 }}>
                            Thành tiền:
                        </Text>
                        <Text style={{ fontSize: 12 }}>{fmtVND(totals.price)}</Text>
                    </div>
                    <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Text type='secondary' style={{ fontSize: 12 }}>
                            Tổng VAT:
                        </Text>
                        <Text style={{ fontSize: 12 }}>{fmtVND(totals.vat)}</Text>
                    </div>
                    <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong style={{ fontSize: 13 }}>
                            TỔNG CỘNG
                        </Text>
                        <Text strong style={{ fontSize: 16, color: '#1A3A5C' }}>
                            {fmtVND(totals.total)}
                        </Text>
                    </div>
                </div>
            </div>

            {/* Footer */}
            {footerBar}
        </Drawer>
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
    record,
    loading,
    isCS1Director,
    onClose,
    onEdit,
    onApprove,
    onReject,
    onExport,
    approvingId,
}) => {
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const [chatOpen, setChatOpen] = useState(false);
    const isPending = record?.status === 'pending';
    const meta = record ? STATUS_META[record.status] : null;

    // Đóng chat khi phiếu đang xem thay đổi hoặc drawer chi tiết đóng
    useEffect(() => {
        setChatOpen(false);
    }, [record?.id]);

    const sumPrice = record?.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0) ?? 0;
    const sumVat = record?.items.reduce((s, i) => s + (i.vatAmount ?? 0), 0) ?? 0;
    const sumTotal = record?.items.reduce((s, i) => s + (i.totalWithVat ?? 0), 0) ?? 0;

    const itemCols: TableColumnsType<PurchaseRequestItem> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center', render: (_: any, __: any, i: number) => i + 1 },
        {
            title: 'Tên vật tư',
            key: 'name',
            render: (_: any, r: PurchaseRequestItem) => (
                <div>
                    <div className='font-semibold text-slate-800'>{r.materialName || '-'}</div>
                    {r.catalogStatus === 'matched' && r.materialId ? (
                        <Tag color='success' style={{ marginTop: 3, fontSize: 10 }}>
                            Đã khớp danh mục
                        </Tag>
                    ) : r.catalogStatus === 'ignored' ? (
                        <Tag color='default' style={{ marginTop: 3, fontSize: 10 }}>
                            Không quản tồn
                        </Tag>
                    ) : (
                        <Tag color='orange' style={{ marginTop: 3, fontSize: 10 }}>
                            Chưa có danh mục
                        </Tag>
                    )}
                </div>
            ),
        },
        { title: 'Người đề xuất', dataIndex: 'proposedBy', key: 'proposedBy', width: 130 },
        { title: 'SL cần', dataIndex: 'quantityRequested', key: 'qty', width: 80, align: 'right', render: fmtNum },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 70 },
        {
            title: 'SL mua',
            dataIndex: 'quantityOrdered',
            key: 'qtyO',
            width: 80,
            align: 'right',
            render: (v: any) => (v ? fmtNum(v) : '-'),
        },
        {
            title: 'Đơn giá',
            dataIndex: 'unitPrice',
            key: 'price',
            width: 120,
            align: 'right',
            render: (v: any) => (v ? fmtVND(v) : '-'),
        },
        {
            title: 'Thành tiền',
            dataIndex: 'totalPrice',
            key: 'total',
            width: 130,
            align: 'right',
            render: (v: any) => (v ? fmtVND(v) : '-'),
        },
        {
            title: 'VAT',
            dataIndex: 'vatRate',
            key: 'vat',
            width: 70,
            align: 'center',
            render: (v: any) => (v != null ? `${Math.round(v <= 1 ? v * 100 : v)}%` : '-'),
        },
        {
            title: 'Giá VAT',
            dataIndex: 'vatAmount',
            key: 'vatAmt',
            width: 120,
            align: 'right',
            render: (v: any) => (v ? fmtVND(v) : '-'),
        },
        {
            title: 'Tổng tiền',
            dataIndex: 'totalWithVat',
            key: 'totalVat',
            width: 130,
            align: 'right',
            render: (v: any) => (
                <Text strong style={{ color: '#1A3A5C' }}>
                    {fmtVND(v)}
                </Text>
            ),
        },
        { title: 'NCC', dataIndex: 'supplierName', key: 'sup', width: 150 },
        { title: 'Nội dung', dataIndex: 'purpose', key: 'purpose', width: 180 },
    ];

    return (
        <>
            <Drawer
                open={Boolean(record)}
                onClose={onClose}
                size={isMobile ? '100%' : 900}
                placement={isMobile ? 'bottom' : 'right'}
                destroyOnHidden
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                    header: { padding: isMobile ? '12px 16px' : undefined },
                }}
                title={
                    record ? (
                        <div className='flex items-center gap-2'>
                            <Text strong className='text-sm sm:text-base'>
                                {record.requestCode}
                            </Text>
                            {meta && (
                                <Tag color={meta.color} icon={meta.icon} style={{ margin: 0 }}>
                                    {meta.label}
                                </Tag>
                            )}
                        </div>
                    ) : (
                        'Chi tiết phiếu'
                    )
                }
                footer={
                    record ? (
                        <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-wrap'}`}>
                            <Button
                                icon={<MessageOutlined />}
                                className='text-blue-600'
                                block={isMobile}
                                onClick={() => setChatOpen(true)}
                            >
                                Trao đổi
                            </Button>
                            {isPending && (
                                <Button icon={<EditOutlined />} onClick={onEdit} block={isMobile}>
                                    Chỉnh sửa
                                </Button>
                            )}
                            {isPending && isCS1Director && (
                                <ConfirmAction
                                    intent='primary'
                                    title='Duyệt phiếu?'
                                    description={`Xác nhận duyệt ${record.requestCode}?`}
                                    okLabel='Duyệt'
                                    onConfirm={() => onApprove(record)}
                                >
                                    <Button
                                        type='primary'
                                        icon={<CheckOutlined />}
                                        loading={approvingId === record.id}
                                        style={{ background: '#16a34a', borderColor: '#16a34a' }}
                                        block={isMobile}
                                    >
                                        Duyệt phiếu
                                    </Button>
                                </ConfirmAction>
                            )}
                            {isPending && isCS1Director && (
                                <Button
                                    danger
                                    icon={<CloseOutlined />}
                                    onClick={() => onReject(record)}
                                    block={isMobile}
                                >
                                    Từ chối
                                </Button>
                            )}
                            <Button
                                icon={<FileExcelOutlined />}
                                style={{ color: '#16a34a', borderColor: '#16a34a' }}
                                block={isMobile}
                                onClick={() => onExport(record.id, record.requestCode ?? record.id)}
                            >
                                Xuất Excel
                            </Button>
                        </div>
                    ) : undefined
                }
            >
                {loading && <div className='py-16 text-center text-slate-400'>Đang tải...</div>}
                {!loading && record && (
                    <div className='flex-1 overflow-y-auto'>
                        <div className='flex flex-col gap-4 p-4 sm:p-5'>
                            {record.status === 'rejected' && record.rejectedReason && (
                                <Alert type='error' showIcon title={`Lý do từ chối: ${record.rejectedReason}`} />
                            )}

                            {/* Info */}
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
                                                    <span className='font-mono font-bold text-[#1A3A5C]'>
                                                        {record.requestCode ?? '-'}
                                                    </span>
                                                ),
                                            },
                                            {
                                                label: 'Tháng/Năm',
                                                value:
                                                    record.requestMonth && record.requestYear
                                                        ? `${record.requestMonth}/${record.requestYear}`
                                                        : '-',
                                            },
                                            { label: 'Ngày tạo', value: fmtDate(record.createdAt) },
                                            { label: 'Người tạo', value: resolveUserLabel(record.requestedBy) },
                                            {
                                                label: 'Trạng thái',
                                                value: meta ? (
                                                    <Tag color={meta.color} icon={meta.icon} style={{ margin: 0 }}>
                                                        {meta.label}
                                                    </Tag>
                                                ) : (
                                                    '-'
                                                ),
                                            },
                                            {
                                                label: 'Tổng tiền',
                                                value: (
                                                    <span className='font-bold text-[#1A3A5C]'>
                                                        {fmtVND(record.totalWithVat ?? sumTotal)}
                                                    </span>
                                                ),
                                            },
                                        ].map(({ label, value }) => (
                                            <div
                                                key={label}
                                                className='flex items-center justify-between gap-3 px-4 py-3'
                                            >
                                                <span className='w-24 shrink-0 text-xs text-slate-400'>{label}</span>
                                                <span className='text-right text-sm text-slate-800'>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className='p-4'>
                                        <Descriptions column={2} size='small' bordered>
                                            <Descriptions.Item label='Mã phiếu'>
                                                {record.requestCode ?? '-'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Tháng/Năm'>
                                                {record.requestMonth && record.requestYear
                                                    ? `${record.requestMonth}/${record.requestYear}`
                                                    : '-'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Ngày tạo'>
                                                {fmtDate(record.createdAt)}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Người tạo'>
                                                {resolveUserLabel(record.requestedBy)}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Trạng thái'>
                                                {meta && (
                                                    <Tag color={meta.color} icon={meta.icon}>
                                                        {meta.label}
                                                    </Tag>
                                                )}
                                            </Descriptions.Item>
                                            <Descriptions.Item label='Tổng tiền (có VAT)'>
                                                <Text strong style={{ color: '#1A3A5C' }}>
                                                    {fmtVND(record.totalWithVat ?? sumTotal)}
                                                </Text>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </div>
                                )}
                            </div>

                            {/* Items */}
                            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                                <div className='border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                                    Danh sách vật tư · {record.items.length} loại
                                </div>
                                {isMobile ? (
                                    <div className='divide-y divide-slate-100'>
                                        {record.items.map((r, idx) => (
                                            <div key={getPurchaseRequestItemKey(r, idx)} className='px-4 py-3'>
                                                <div className='mb-1 flex items-start justify-between gap-2'>
                                                    <span className='flex-1 text-sm font-semibold text-slate-800'>
                                                        {r.materialName || '—'}
                                                    </span>
                                                    <span className='shrink-0 text-xs text-slate-400'>
                                                        {r.unit || '—'}
                                                    </span>
                                                </div>
                                                <div className='mb-1'>
                                                    {r.catalogStatus === 'matched' && r.materialId ? (
                                                        <Tag color='success' className='!m-0 !text-[10px]'>
                                                            Đã khớp danh mục
                                                        </Tag>
                                                    ) : r.catalogStatus === 'ignored' ? (
                                                        <Tag color='default' className='!m-0 !text-[10px]'>
                                                            Không quản tồn
                                                        </Tag>
                                                    ) : (
                                                        <Tag color='orange' className='!m-0 !text-[10px]'>
                                                            Chưa có danh mục
                                                        </Tag>
                                                    )}
                                                </div>
                                                <div className='flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500'>
                                                    <span>
                                                        SL:{' '}
                                                        <strong className='text-slate-700'>
                                                            {fmtNum(r.quantityRequested)}
                                                        </strong>
                                                    </span>
                                                    {r.quantityOrdered ? (
                                                        <span>
                                                            Mua: <strong>{fmtNum(r.quantityOrdered)}</strong>
                                                        </span>
                                                    ) : null}
                                                    {r.unitPrice ? (
                                                        <span>
                                                            Đơn giá: <strong>{fmtVND(r.unitPrice)}</strong>
                                                        </span>
                                                    ) : null}
                                                    {r.totalWithVat ? (
                                                        <span className='font-bold text-[#1A3A5C]'>
                                                            Tổng: {fmtVND(r.totalWithVat)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {r.supplierName && (
                                                    <div className='mt-0.5 text-xs text-slate-400'>
                                                        NCC: {r.supplierName}
                                                    </div>
                                                )}
                                                {r.purpose && (
                                                    <div className='mt-0.5 text-xs text-slate-400 italic'>
                                                        {r.purpose}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        <div className='flex items-center justify-between bg-slate-50 px-4 py-3'>
                                            <span className='text-xs font-semibold text-slate-500'>Tổng cộng</span>
                                            <span className='font-bold text-[#1A3A5C]'>{fmtVND(sumTotal)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <Table
                                        dataSource={record.items}
                                        columns={itemCols}
                                        rowKey={(item, index) => getPurchaseRequestItemKey(item, index ?? 0)}
                                        pagination={false}
                                        size='small'
                                        scroll={{ x: 'max-content' }}
                                        summary={() => (
                                            <Table.Summary.Row>
                                                <Table.Summary.Cell index={0} colSpan={7}>
                                                    <Text strong>Tổng cộng</Text>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={7} align='right'>
                                                    <Text strong>{fmtVND(sumPrice)}</Text>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={8} />
                                                <Table.Summary.Cell index={9} align='right'>
                                                    <Text strong>{fmtVND(sumVat)}</Text>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={10} align='right'>
                                                    <Text strong style={{ color: '#1A3A5C' }}>
                                                        {fmtVND(sumTotal)}
                                                    </Text>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={11} colSpan={2} />
                                            </Table.Summary.Row>
                                        )}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>

            {record && chatOpen ? (
                <ContextChatDrawer
                    open={chatOpen}
                    contextType='purchase_request'
                    contextId={record.id}
                    title={`Trao đổi ${record.requestCode || 'phiếu đề xuất'}`}
                    subtitle='Đề xuất mua vật tư'
                    onClose={() => setChatOpen(false)}
                />
            ) : null}
        </>
    );
};

// ─── PurchaseRequestPage ─────────────────────────────────────────────────────

const PurchaseRequestPage: React.FC = () => {
    const { user } = useAuth();
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID as string;
    const procurementPlantIds = String(import.meta.env.VITE_PROCUREMENT_PLANT_IDS || mainPlantId || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    const currentPurchasePlantId = user?.plantId || mainPlantId;
    const CS1_MANAGER_ROLES = ['admin', 'manager', 'director'];
    const CS1_DIRECTOR_ROLES = ['admin', 'director'];

    const isCS1Manager =
        Boolean(user?.plantId && procurementPlantIds.includes(user.plantId)) &&
        CS1_MANAGER_ROLES.includes(user?.role ?? '');
    const isCS1Director =
        Boolean(user?.plantId && procurementPlantIds.includes(user.plantId)) &&
        CS1_DIRECTOR_ROLES.includes(user?.role ?? '');

    const [search, setSearch] = useState('');
    const [filterMonth, setFilterMonth] = useState<number | undefined>();
    const [filterYear, setFilterYear] = useState<number | undefined>();
    const [filterStatus, setFilterStatus] = useState<PurchaseRequestStatus | undefined>();
    const [filterOpen, setFilterOpen] = useState(false);
    const [page, setPage] = useState(1);
    const screens = useBreakpoint();
    const isMobile = !screens.sm;
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<PurchaseRequest | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

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
            search: search || undefined,
            status: filterStatus,
            page,
            limit: DEFAULT_LIMIT,
        }),
        [search, filterStatus, page]
    );

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        enabled: isCS1Manager,
    });

    const {
        data: listResp,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['purchase-requests', listParams],
        queryFn: async () => normResp(await purchaseRequestService.getAll(listParams), page, DEFAULT_LIMIT),
        placeholderData: (p) => p,
        enabled: isCS1Manager,
    });

    const { data: detailRecord, isLoading: detailLoading } = useQuery({
        queryKey: ['purchase-request', selectedId],
        queryFn: () => purchaseRequestService.getById(selectedId!),
        enabled: isCS1Manager && Boolean(selectedId),
    });

    const requests = listResp?.data ?? [];

    // Stats: count from all (no filter) for accurate numbers
    const { data: statsResp } = useQuery({
        queryKey: ['purchase-requests', 'stats'],
        queryFn: async () => {
            const [all, pending, approved, inProgress, ordered, rejected] = await Promise.all([
                purchaseRequestService.getAll({ limit: 1 }),
                purchaseRequestService.getAll({ status: 'pending', limit: 1 }),
                purchaseRequestService.getAll({ status: 'approved', limit: 1 }),
                purchaseRequestService.getAll({ status: 'in_progress', limit: 1 }),
                purchaseRequestService.getAll({ status: 'ordered', limit: 1 }),
                purchaseRequestService.getAll({ status: 'rejected', limit: 1 }),
            ]);
            return {
                total: normResp(all, 1, 1).total,
                pending: normResp(pending, 1, 1).total,
                approved: normResp(approved, 1, 1).total,
                inProgress: normResp(inProgress, 1, 1).total,
                ordered: normResp(ordered, 1, 1).total,
                rejected: normResp(rejected, 1, 1).total,
            };
        },
        placeholderData: (p) => p,
        enabled: isCS1Manager,
    });

    const stats = statsResp ?? { total: 0, pending: 0, approved: 0, inProgress: 0, ordered: 0, rejected: 0 };

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
        if (!rejectTarget || !rejectReason.trim()) {
            message.warning('Vui lòng nhập lý do');
            return;
        }
        try {
            await rejectMut.mutateAsync({ id: rejectTarget.id, reason: rejectReason.trim() });
            await invalidate(rejectTarget.id);
            message.success('Đã từ chối phiếu');
            setRejectTarget(null);
            setRejectReason('');
        } catch (e: any) {
            message.error(e?.message ?? 'Không thể từ chối');
        }
    };

    const handleExport = async (id: string, code: string) => {
        try {
            await purchaseRequestService.exportXlsx(id, code);
        } catch {
            message.error('Không thể xuất file Excel');
        }
    };

    const yearOptions = useMemo(() => {
        const y = dayjs().year();
        return [y - 1, y, y + 1].map((v) => ({ value: v, label: String(v) }));
    }, []);

    const columns: TableColumnsType<PurchaseRequest> = [
        {
            title: 'MÃ PHIẾU',
            key: 'code',
            width: 160,
            render: (_: any, r: PurchaseRequest) => (
                <div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1A3A5C', fontSize: 13 }}>
                        {r.requestCode ?? '-'}
                    </div>
                    {r.requestMonth && r.requestYear && (
                        <div style={{ color: '#888', fontSize: 11 }}>
                            Tháng {r.requestMonth}/{r.requestYear}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'VẬT TƯ',
            key: 'items',
            width: 80,
            align: 'center',
            render: (_: any, r: PurchaseRequest) => (
                <Badge count={r.items.length} style={{ backgroundColor: '#1A3A5C' }} />
            ),
        },
        {
            title: 'TỔNG TIỀN',
            key: 'total',
            width: 150,
            align: 'right',
            render: (_: any, r: PurchaseRequest) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#1A3A5C' }}>
                        {fmtVND(r.totalWithVat ?? r.totalEstimated)}
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>đã gồm VAT</div>
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
            width: 130,
            fixed: 'right' as const,
            align: 'right' as const,
            render: (_: any, r: PurchaseRequest) => (
                <Space size={2}>
                    <Tooltip title='Xem chi tiết'>
                        <Button
                            type='text'
                            size='small'
                            icon={<EyeOutlined />}
                            style={{ color: '#0284c7' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(r.id);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title='Xuất Excel'>
                        <Button
                            type='text'
                            size='small'
                            icon={<FileExcelOutlined />}
                            style={{ color: '#16a34a' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleExport(r.id, r.requestCode ?? r.id);
                            }}
                        />
                    </Tooltip>
                    {r.status === 'pending' && isCS1Director && (
                        <Tooltip title='Duyệt'>
                            <ConfirmAction
                                intent='primary'
                                title='Duyệt phiếu?'
                                description={`Duyệt ${r.requestCode}?`}
                                okLabel='Duyệt'
                                onConfirm={() => handleApprove(r)}
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
                    {r.status === 'pending' && isCS1Director && (
                        <Tooltip title='Từ chối'>
                            <Button
                                type='text'
                                size='small'
                                danger
                                icon={<CloseOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectTarget(r);
                                    setRejectReason('');
                                }}
                            />
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
                title='Đề nghị mua vật tư'
                subtitle='Quản lý phiếu đề nghị mua vật tư của cơ sở chính.'
                actions={
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        style={{ background: '#1A3A5C' }}
                        onClick={() => {
                            setEditingRecord(null);
                            setModalOpen(true);
                        }}
                    >
                        Tạo đề nghị
                    </Button>
                }
            />

            {/* Stats */}
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6'>
                {[
                    { label: 'Tổng phiếu', value: stats.total, color: '#1A3A5C', icon: <FileExcelOutlined /> },
                    { label: 'Chờ duyệt', value: stats.pending, color: '#FA8C16', icon: <ClockCircleOutlined /> },
                    { label: 'Đã duyệt', value: stats.approved, color: '#52C41A', icon: <CheckCircleOutlined /> },
                    { label: 'Đang lên đơn', value: stats.inProgress, color: '#1677ff', icon: <ShoppingOutlined /> },
                    { label: 'Đã đặt hàng', value: stats.ordered, color: '#0f766e', icon: <ShoppingOutlined /> },
                    { label: 'Từ chối', value: stats.rejected, color: '#FF4D4F', icon: <CloseCircleOutlined /> },
                ].map(({ label, value, color, icon }) => (
                    <div
                        key={label}
                        className='flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'
                    >
                        <div
                            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base'
                            style={{ background: `${color}18`, color }}
                        >
                            {icon}
                        </div>
                        <div className='min-w-0'>
                            <div className='truncate text-[10px] font-semibold tracking-wide text-slate-400 uppercase'>
                                {label}
                            </div>
                            <div className='text-xl font-bold sm:text-2xl' style={{ color }}>
                                {value}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters + List */}
            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                {/* Filter bar */}
                <div className='border-b border-slate-100 px-3 py-3 sm:px-5'>
                    {/* Mobile */}
                    <div className='flex gap-2 sm:hidden'>
                        <Input.Search
                            placeholder='Tìm mã phiếu...'
                            allowClear
                            className='flex-1'
                            onSearch={(v) => {
                                setSearch(v);
                                setPage(1);
                            }}
                            onChange={(e) => !e.target.value && setSearch('')}
                        />
                        <Button
                            icon={<FilterOutlined />}
                            type={filterStatus || filterMonth || filterYear ? 'primary' : 'default'}
                            ghost={!!(filterStatus || filterMonth || filterYear)}
                            onClick={() => setFilterOpen((v) => !v)}
                        />
                    </div>
                    {filterOpen && (
                        <div className='mt-2 flex flex-col gap-2 sm:hidden'>
                            <Select
                                allowClear
                                placeholder='Tháng'
                                className='w-full'
                                options={MONTH_OPTIONS}
                                value={filterMonth}
                                onChange={(v) => {
                                    setFilterMonth(v);
                                    setPage(1);
                                }}
                            />
                            <Select
                                allowClear
                                placeholder='Năm'
                                className='w-full'
                                options={yearOptions}
                                value={filterYear}
                                onChange={(v) => {
                                    setFilterYear(v);
                                    setPage(1);
                                }}
                            />
                            <Select
                                allowClear
                                placeholder='Trạng thái'
                                className='w-full'
                                options={STATUS_OPTIONS}
                                value={filterStatus}
                                onChange={(v) => {
                                    setFilterStatus(v as PurchaseRequestStatus);
                                    setPage(1);
                                }}
                            />
                        </div>
                    )}
                    {/* Desktop */}
                    <div className='hidden flex-wrap gap-2 sm:flex'>
                        <Input.Search
                            placeholder='Tìm mã phiếu...'
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
                            placeholder='Tháng'
                            style={{ width: 120 }}
                            options={MONTH_OPTIONS}
                            value={filterMonth}
                            onChange={(v) => {
                                setFilterMonth(v);
                                setPage(1);
                            }}
                        />
                        <Select
                            allowClear
                            placeholder='Năm'
                            style={{ width: 100 }}
                            options={yearOptions}
                            value={filterYear}
                            onChange={(v) => {
                                setFilterYear(v);
                                setPage(1);
                            }}
                        />
                        <Select
                            allowClear
                            placeholder='Trạng thái'
                            style={{ width: 160 }}
                            options={STATUS_OPTIONS}
                            value={filterStatus}
                            onChange={(v) => {
                                setFilterStatus(v as PurchaseRequestStatus);
                                setPage(1);
                            }}
                        />
                        <Button
                            onClick={() => {
                                setSearch('');
                                setFilterMonth(undefined);
                                setFilterYear(undefined);
                                setFilterStatus(undefined);
                                setPage(1);
                            }}
                        >
                            Xoá lọc
                        </Button>
                    </div>
                </div>

                {/* Mobile card list */}
                {isMobile ? (
                    <div className='divide-y divide-slate-100'>
                        {(isLoading || isFetching) && requests.length === 0 ? (
                            <div className='py-16 text-center text-sm text-slate-400'>Đang tải...</div>
                        ) : requests.length === 0 ? (
                            <div className='py-16'>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu đề nghị' />
                            </div>
                        ) : (
                            requests.map((r) => {
                                const meta = STATUS_META[r.status];
                                return (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedId(r.id)}
                                        className='flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors active:bg-slate-50'
                                    >
                                        <div
                                            className='mt-0.5 h-2 w-2 shrink-0 rounded-full'
                                            style={{
                                                backgroundColor:
                                                    meta?.color === 'default' ||
                                                    meta?.color === 'warning' ||
                                                    meta?.color === 'success' ||
                                                    meta?.color === 'error' ||
                                                    meta?.color === 'processing' ||
                                                    meta?.color === 'cyan'
                                                        ? (
                                                              {
                                                                  default: '#94a3b8',
                                                                  warning: '#FA8C16',
                                                                  success: '#52C41A',
                                                                  error: '#FF4D4F',
                                                                  processing: '#1677ff',
                                                                  cyan: '#06b6d4',
                                                              } as any
                                                          )[meta.color]
                                                        : '#94a3b8',
                                            }}
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <div className='mb-0.5 flex items-center justify-between gap-2'>
                                                <span className='truncate font-mono text-xs font-bold text-[#1A3A5C]'>
                                                    {r.requestCode ?? '—'}
                                                </span>
                                                {meta && (
                                                    <Tag color={meta.color} icon={meta.icon} style={{ margin: 0 }}>
                                                        {meta.label}
                                                    </Tag>
                                                )}
                                            </div>
                                            <div className='flex items-center gap-3 text-xs text-slate-400'>
                                                {r.requestMonth && r.requestYear && (
                                                    <span>
                                                        T{r.requestMonth}/{r.requestYear}
                                                    </span>
                                                )}
                                                <span>·</span>
                                                <span>{r.items.length} vật tư</span>
                                                <span>·</span>
                                                <span className='font-semibold text-slate-600'>
                                                    {fmtVND(r.totalWithVat ?? r.totalEstimated)}
                                                </span>
                                            </div>
                                        </div>
                                        <RightOutlined className='shrink-0 text-xs text-slate-300' />
                                    </div>
                                );
                            })
                        )}
                        {/* Mobile pagination */}
                        {(listResp?.total ?? 0) > 0 && (
                            <div className='flex items-center justify-between bg-slate-50 px-4 py-3'>
                                <Button size='small' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                    ← Trước
                                </Button>
                                <span className='text-xs text-slate-400'>
                                    {page} / {Math.max(1, Math.ceil((listResp?.total ?? 0) / DEFAULT_LIMIT))} ·{' '}
                                    {listResp?.total ?? 0} phiếu
                                </span>
                                <Button
                                    size='small'
                                    disabled={page >= Math.ceil((listResp?.total ?? 0) / DEFAULT_LIMIT)}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Sau →
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Desktop table */
                    <Table<PurchaseRequest>
                        rowKey='id'
                        columns={columns}
                        dataSource={requests}
                        loading={isLoading || isFetching}
                        size='middle'
                        scroll={{ x: 900 }}
                        locale={{
                            emptyText: (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiếu đề nghị' />
                            ),
                        }}
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
                )}
            </div>

            <ModalForm
                open={modalOpen}
                initial={editingRecord}
                plants={plants}
                mainPlantId={currentPurchasePlantId}
                submitting={createMut.isPending || updateMut.isPending}
                onClose={() => {
                    setModalOpen(false);
                    setEditingRecord(null);
                }}
                onSave={handleSave}
            />

            <DetailDrawer
                record={selectedId ? detailRecord : null}
                loading={detailLoading}
                isCS1Director={isCS1Director}
                onClose={() => setSelectedId(null)}
                onEdit={() => {
                    setEditingRecord(detailRecord ?? null);
                    setModalOpen(true);
                }}
                onApprove={handleApprove}
                onReject={(r) => {
                    setRejectTarget(r);
                    setRejectReason('');
                }}
                onExport={handleExport}
                approvingId={approvingId}
            />

            <Modal
                open={Boolean(rejectTarget)}
                title='Nhập lý do từ chối'
                okText='Xác nhận từ chối'
                cancelText='Huỷ'
                confirmLoading={rejectMut.isPending}
                onOk={handleRejectSubmit}
                onCancel={() => {
                    setRejectTarget(null);
                    setRejectReason('');
                }}
                destroyOnHidden
            >
                <div style={{ marginTop: 12 }}>
                    <Text type='secondary'>
                        Phiếu: <Text strong>{rejectTarget?.requestCode}</Text>
                    </Text>
                    <Input.TextArea
                        rows={4}
                        style={{ marginTop: 8 }}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder='Nhập lý do từ chối...'
                        maxLength={300}
                        showCount
                    />
                </div>
            </Modal>
        </div>
    );
};

export default PurchaseRequestPage;
