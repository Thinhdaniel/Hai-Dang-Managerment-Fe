import React, { useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Input,
    InputNumber,
    Modal,
    Progress,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    DeleteOutlined,
    InfoCircleOutlined,
    PlusOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    distributionService,
    materialService,
    supplyRequestService,
    type Material,
    type PurchaseRequestItem,
} from '../core/services/material.service';

const { Text } = Typography;

const fmt = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);

const EMPTY_MATERIALS: any[] = [];
const EMPTY_SR_ITEMS: PurchaseRequestItem[] = [];
const EMPTY_MATERIAL_OPTIONS: any[] = [];

type ItemRow = {
    key: string;
    srItemIndex: number;
    srItemName: string;
    srItemUnit: string;
    quantityRequested: number;
    quantityApproved: number;
    materialId: string;
    materialName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    note: string;
    totalPrice: number;
    vatAmount: number;
    totalWithVat: number;
    catalogStatus: 'matched' | 'unmatched' | 'ignored';
    fulfillmentStatus: 'fulfilled' | 'partial' | 'not_supplied';
    inventorySkipReason: string;
};

interface Props {
    open: boolean;
    supplyRequestId: string;
    fromPlantId: string;
    toPlantId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const makeKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeText = (value?: string) =>
    (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const scoreMaterial = (query: string, material: Material) => {
    const source = normalizeText(query);
    const name = normalizeText(material.name);
    const code = normalizeText(material.code);
    if (!source || !name) return 0;
    if (name === source || code === source) return 100;
    if (name.includes(source) || source.includes(name)) return 86;

    const sourceTokens = source.split(' ').filter(Boolean);
    const nameTokens = new Set(name.split(' ').filter(Boolean));
    const matched = sourceTokens.filter((token) => nameTokens.has(token)).length;
    const tokenScore = sourceTokens.length ? Math.round((matched / sourceTokens.length) * 72) : 0;
    const prefixBonus = sourceTokens.some((token) => name.startsWith(token)) ? 10 : 0;
    return Math.min(85, tokenScore + prefixBonus);
};

const getStock = (material?: any) => {
    if (!material) return null;
    return typeof material.cs1CurrentStock === 'number' ? material.cs1CurrentStock : null;
};

const compute = (row: ItemRow): ItemRow => {
    const totalPrice = Number((row.quantity * row.unitPrice).toFixed(2));
    const vatAmount = Number((totalPrice * (row.vatRate / 100)).toFixed(2));
    return { ...row, totalPrice, vatAmount, totalWithVat: Number((totalPrice + vatAmount).toFixed(2)) };
};

const patchRows = (rows: ItemRow[], key: string, patch: Partial<ItemRow>): ItemRow[] =>
    rows.map((row) => (row.key === key ? compute({ ...row, ...patch }) : row));

const findBestMaterial = (item: PurchaseRequestItem, materials: any[]) => {
    const query = item.materialName || '';
    const sameUnit = (material: any) =>
        normalizeText(material.unit) && normalizeText(material.unit) === normalizeText(item.unit);

    return materials
        .map((material) => {
            const score =
                scoreMaterial(query, material) +
                (sameUnit(material) ? 12 : 0) +
                ((getStock(material) ?? 0) > 0 ? 8 : 0);
            return { material, score };
        })
        .filter((entry) => entry.score >= 68)
        .sort((a, b) => b.score - a.score)[0]?.material;
};

const buildInitialRows = (items: PurchaseRequestItem[], materials: any[]) =>
    items.map((item, idx) => {
        const approved = Number(item.quantityApproved ?? item.quantityRequested ?? 0);
        const best = findBestMaterial(item, materials);
        const stock = getStock(best);
        const quantity = best && typeof stock === 'number' ? Math.min(approved, Math.max(0, stock)) : approved;

        return compute({
            key: makeKey(),
            srItemIndex: idx,
            srItemName: item.materialName ?? '',
            srItemUnit: item.unit ?? '',
            quantityRequested: Number(item.quantityRequested ?? 0),
            quantityApproved: approved,
            materialId: best?.id ?? '',
            materialName: best?.name ?? item.materialName ?? '',
            unit: best?.unit ?? item.unit ?? '',
            quantity,
            unitPrice: 0,
            vatRate: 8,
            note: '',
            totalPrice: 0,
            vatAmount: 0,
            totalWithVat: 0,
            catalogStatus: best ? 'matched' : 'unmatched',
            fulfillmentStatus:
                quantity > 0 && quantity < approved ? 'partial' : quantity === 0 ? 'not_supplied' : 'fulfilled',
            inventorySkipReason: '',
        });
    });

const SupplyDistributionModal: React.FC<Props> = ({
    open,
    supplyRequestId,
    fromPlantId,
    toPlantId,
    onClose,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<ItemRow[]>([]);
    const initializedKeyRef = useRef('');

    const { data: sr, isLoading: srLoading } = useQuery({
        queryKey: ['supply-request', supplyRequestId],
        queryFn: () => supplyRequestService.getById(supplyRequestId),
        enabled: open && Boolean(supplyRequestId),
    });

    const { data: materialsRaw, refetch: refetchMaterials } = useQuery({
        queryKey: ['materials', 'with-stock-cs1'],
        queryFn: () =>
            materialService
                .getAll({ includeStock: true, limit: 1000, isActive: true } as any)
                .then((res: any) => (Array.isArray(res) ? res : (res.data ?? []))),
        enabled: open,
        staleTime: 60_000,
    });

    const materials = useMemo(() => (materialsRaw as any[] | undefined) ?? EMPTY_MATERIALS, [materialsRaw]);
    const srItems = useMemo<PurchaseRequestItem[]>(() => sr?.items ?? EMPTY_SR_ITEMS, [sr?.items]);
    const currentInitKey = `${open ? '1' : '0'}:${supplyRequestId}:${srItems.length}:${materials.length}`;

    React.useEffect(() => {
        if (!open) {
            setNote('');
            setDistributedAt(dayjs());
            setRows([]);
            initializedKeyRef.current = '';
            return;
        }
        if (!sr || initializedKeyRef.current === currentInitKey) return;
        setRows(buildInitialRows(srItems, materials));
        initializedKeyRef.current = currentInitKey;
    }, [open, sr, srItems, materials, currentInitKey]);

    const createDistMutation = useMutation({
        mutationFn: distributionService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] });
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-shortages'] });
            message.success('Tạo phiếu cấp phát thành công');
            onSuccess();
        },
        onError: (error: any) => message.error(error?.message ?? 'Không tạo được phiếu cấp phát'),
    });

    const createMaterialMutation = useMutation({
        mutationFn: (row: ItemRow) =>
            materialService.create({
                name: (row.materialName || row.srItemName).trim(),
                unit: (row.unit || row.srItemUnit).trim(),
                trackInventory: true,
                isActive: true,
            }),
        onSuccess: async (material, row) => {
            await refetchMaterials();
            setRows((prev) =>
                patchRows(prev, row.key, {
                    materialId: material.id,
                    materialName: material.name,
                    unit: material.unit,
                    catalogStatus: 'matched',
                    fulfillmentStatus: row.quantity > 0 ? 'fulfilled' : 'not_supplied',
                    inventorySkipReason: '',
                })
            );
            message.success('Đã tạo và gán vật tư kho');
        },
        onError: (error: any) => message.error(error?.message ?? 'Không tạo được vật tư'),
    });

    const rowsByItem = useMemo(
        () =>
            srItems.map((_, idx) => {
                const itemRows = rows.filter((row) => row.srItemIndex === idx);
                const approved = Number(srItems[idx]?.quantityApproved ?? srItems[idx]?.quantityRequested ?? 0);
                const distributed = itemRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
                return {
                    rows: itemRows,
                    approved,
                    distributed,
                    shortage: Math.max(0, approved - distributed),
                    over: distributed > approved,
                };
            }),
        [rows, srItems]
    );

    const totals = useMemo(
        () => ({
            price: rows.reduce((sum, row) => sum + row.totalPrice, 0),
            vat: rows.reduce((sum, row) => sum + row.vatAmount, 0),
            total: rows.reduce((sum, row) => sum + row.totalWithVat, 0),
            distributed: rows.reduce((sum, row) => sum + row.quantity, 0),
            shortage: rowsByItem.reduce((sum, group) => sum + group.shortage, 0),
        }),
        [rows, rowsByItem]
    );

    const materialOptionsBySrItem = useMemo(
        () =>
            srItems.map((item) =>
                materials
                    .map((material: any) => {
                        const score =
                            scoreMaterial(item.materialName ?? '', material) +
                            (normalizeText(material.unit) === normalizeText(item.unit) ? 12 : 0) +
                            ((getStock(material) ?? 0) > 0 ? 8 : 0);
                        return {
                            value: material.id,
                            label: `${material.code ? `[${material.code}] ` : ''}${material.name}`,
                            material,
                            score,
                            stock: getStock(material),
                        };
                    })
                    .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label), 'vi'))
            ),
        [materials, srItems]
    );

    const addRow = (srItemIndex: number) => {
        const group = rowsByItem[srItemIndex];
        const ref = rows.find((row) => row.srItemIndex === srItemIndex);
        setRows((prev) => [
            ...prev,
            compute({
                key: makeKey(),
                srItemIndex,
                srItemName: ref?.srItemName ?? srItems[srItemIndex]?.materialName ?? '',
                srItemUnit: ref?.srItemUnit ?? srItems[srItemIndex]?.unit ?? '',
                quantityRequested: ref?.quantityRequested ?? Number(srItems[srItemIndex]?.quantityRequested ?? 0),
                quantityApproved:
                    ref?.quantityApproved ??
                    Number(srItems[srItemIndex]?.quantityApproved ?? srItems[srItemIndex]?.quantityRequested ?? 0),
                materialId: '',
                materialName: '',
                unit: '',
                quantity: group?.shortage ?? 0,
                unitPrice: 0,
                vatRate: 8,
                note: '',
                totalPrice: 0,
                vatAmount: 0,
                totalWithVat: 0,
                catalogStatus: 'unmatched',
                fulfillmentStatus: 'partial',
                inventorySkipReason: '',
            }),
        ]);
    };

    const removeRow = (key: string) => {
        const row = rows.find((item) => item.key === key);
        if (!row) return;
        if (rows.filter((item) => item.srItemIndex === row.srItemIndex).length <= 1) {
            message.warning('Mỗi dòng đề xuất cần giữ ít nhất một dòng xử lý');
            return;
        }
        setRows((prev) => prev.filter((item) => item.key !== key));
    };

    const markNotSupplied = (srItemIndex: number) => {
        setRows((prev) => {
            const targetRows = prev.filter((row) => row.srItemIndex === srItemIndex);
            const first = targetRows[0];
            const next = prev.filter((row) => row.srItemIndex !== srItemIndex);
            return [
                ...next,
                compute({
                    ...(first ?? buildInitialRows([srItems[srItemIndex]], materials)[0]),
                    key: first?.key ?? makeKey(),
                    srItemIndex,
                    materialId: '',
                    materialName: srItems[srItemIndex]?.materialName ?? first?.srItemName ?? '',
                    unit: srItems[srItemIndex]?.unit ?? first?.srItemUnit ?? '',
                    quantity: 0,
                    unitPrice: 0,
                    catalogStatus: 'ignored',
                    fulfillmentStatus: 'not_supplied',
                    inventorySkipReason: 'Chua the cap trong dot nay',
                    note: first?.note || 'Chua the cap trong dot nay',
                }),
            ].sort((a, b) => a.srItemIndex - b.srItemIndex);
        });
    };

    const handleSubmit = async () => {
        for (const [idx, group] of rowsByItem.entries()) {
            if (group.over) {
                message.error(`Dòng ${idx + 1}: số lượng cấp vượt số lượng duyệt`);
                return;
            }
            if (group.shortage > 0 && !group.rows.some((row) => row.note.trim())) {
                message.error(`Dòng ${idx + 1}: vui lòng nhập lý do cấp thiếu hoặc chưa cấp`);
                return;
            }
        }

        const missingMaterial = rows.filter(
            (row) => row.quantity > 0 && !row.materialId && row.catalogStatus !== 'ignored'
        );
        if (missingMaterial.length) {
            message.error(`${missingMaterial.length} dòng chưa chọn vật tư kho`);
            return;
        }

        const invalidQty = rows.filter(
            (row) => row.quantity < 0 || (row.quantity === 0 && row.fulfillmentStatus !== 'not_supplied')
        );
        if (invalidQty.length) {
            message.error('Số lượng cấp không hợp lệ');
            return;
        }

        await createDistMutation.mutateAsync({
            supplyRequestId,
            fromPlantId,
            toPlantId,
            distributedAt: distributedAt.toISOString(),
            note: note.trim() || undefined,
            items: rows.map((row) => {
                const group = rowsByItem[row.srItemIndex];
                const isNotSupplied = row.fulfillmentStatus === 'not_supplied' || row.quantity === 0;
                return {
                    materialId: row.materialId || undefined,
                    materialName: (row.materialName || row.srItemName).trim(),
                    unit: (row.unit || row.srItemUnit).trim(),
                    quantity: row.quantity,
                    quantityRequested: row.quantityApproved,
                    quantityDistributed: row.quantity,
                    quantityShortage: group?.shortage ?? 0,
                    sourceRequestItemIndex: row.srItemIndex,
                    fulfillmentStatus: isNotSupplied ? 'not_supplied' : group?.shortage ? 'partial' : 'fulfilled',
                    unitPrice: row.unitPrice,
                    vatRate: row.vatRate,
                    catalogStatus: isNotSupplied ? 'ignored' : row.materialId ? 'matched' : row.catalogStatus,
                    inventorySkipReason: isNotSupplied
                        ? row.inventorySkipReason || 'Chua the cap trong dot nay'
                        : undefined,
                    adjustReason: row.note.trim() || undefined,
                    note: row.note.trim() || undefined,
                };
            }),
        });
    };

    const buildColumns = (groupIndex: number): TableColumnsType<ItemRow> => [
        {
            title: 'Vật tư cấp thực tế',
            key: 'material',
            width: 320,
            render: (_value, row) => (
                <div className='flex flex-col gap-1'>
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp='label'
                        placeholder='Chọn vật tư kho'
                        disabled={row.fulfillmentStatus === 'not_supplied'}
                        value={row.materialId || undefined}
                        options={materialOptionsBySrItem[row.srItemIndex] ?? EMPTY_MATERIAL_OPTIONS}
                        optionRender={(option) => {
                            const data = option.data as any;
                            const stock = data.stock;
                            const isSuggested = data.score >= 68;
                            return (
                                <div className='flex items-center justify-between gap-2'>
                                    <span className='min-w-0 flex-1 truncate text-xs'>{option.label}</span>
                                    <Space size={4}>
                                        {isSuggested && (
                                            <Tag color='blue' className='!m-0 !text-[10px]'>
                                                Gợi ý
                                            </Tag>
                                        )}
                                        <Tag
                                            color={stock === null ? 'default' : stock > 0 ? 'success' : 'warning'}
                                            className='!m-0 !text-[10px]'
                                        >
                                            {stock === null ? 'Chưa có tồn' : `Tồn ${fmt(stock)}`}
                                        </Tag>
                                    </Space>
                                </div>
                            );
                        }}
                        onChange={(value) => {
                            const material = materials.find((item: any) => item.id === value);
                            setRows((prev) =>
                                patchRows(prev, row.key, {
                                    materialId: value || '',
                                    materialName: material?.name ?? '',
                                    unit: material?.unit ?? row.unit,
                                    catalogStatus: value ? 'matched' : 'unmatched',
                                    fulfillmentStatus: row.quantity > 0 ? 'fulfilled' : 'not_supplied',
                                    inventorySkipReason: '',
                                })
                            );
                        }}
                    />
                    <Space size={6}>
                        <Button
                            size='small'
                            icon={<PlusOutlined />}
                            loading={createMaterialMutation.isPending}
                            disabled={
                                row.fulfillmentStatus === 'not_supplied' ||
                                !(row.materialName || row.srItemName).trim() ||
                                !(row.unit || row.srItemUnit).trim()
                            }
                            onClick={() => createMaterialMutation.mutate(row)}
                        >
                            Tạo VT
                        </Button>
                        {row.fulfillmentStatus === 'not_supplied' && (
                            <Tag color='red' className='!m-0'>
                                Không cấp đợt này
                            </Tag>
                        )}
                    </Space>
                </div>
            ),
        },
        {
            title: 'ĐVT',
            key: 'unit',
            width: 70,
            align: 'center',
            render: (_value, row) => row.unit || row.srItemUnit || '-',
        },
        {
            title: 'Tồn CS1',
            key: 'stock',
            width: 90,
            align: 'right',
            render: (_value, row) => {
                const stock = getStock(materials.find((item: any) => item.id === row.materialId));
                return stock === null ? (
                    <span className='text-slate-400'>-</span>
                ) : (
                    <span className={stock > 0 ? 'text-emerald-600' : 'text-orange-500'}>{fmt(stock)}</span>
                );
            },
        },
        {
            title: 'SL cấp',
            key: 'quantity',
            width: 95,
            align: 'right',
            render: (_value, row) => (
                <InputNumber
                    min={0}
                    controls={false}
                    value={row.quantity}
                    disabled={row.fulfillmentStatus === 'not_supplied'}
                    style={{ width: '100%' }}
                    onChange={(value) => setRows((prev) => patchRows(prev, row.key, { quantity: Number(value ?? 0) }))}
                />
            ),
        },
        {
            title: 'Đơn giá',
            key: 'unitPrice',
            width: 120,
            align: 'right',
            render: (_value, row) => (
                <InputNumber
                    min={0}
                    controls={false}
                    value={row.unitPrice}
                    disabled={row.fulfillmentStatus === 'not_supplied'}
                    style={{ width: '100%' }}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => Number(String(value).replace(/,/g, '')) as any}
                    onChange={(value) => setRows((prev) => patchRows(prev, row.key, { unitPrice: Number(value ?? 0) }))}
                />
            ),
        },
        {
            title: 'VAT',
            key: 'vat',
            width: 78,
            align: 'right',
            render: (_value, row) => (
                <InputNumber
                    min={0}
                    max={100}
                    controls={false}
                    value={row.vatRate}
                    disabled={row.fulfillmentStatus === 'not_supplied'}
                    style={{ width: '100%' }}
                    formatter={(value) => `${value}%`}
                    parser={(value) => Number(String(value).replace('%', '')) as any}
                    onChange={(value) => setRows((prev) => patchRows(prev, row.key, { vatRate: Number(value ?? 0) }))}
                />
            ),
        },
        {
            title: 'Tổng tiền',
            key: 'total',
            width: 120,
            align: 'right',
            render: (_value, row) => (
                <span className='font-semibold text-slate-900'>{row.totalWithVat ? fmt(row.totalWithVat) : '-'}</span>
            ),
        },
        {
            title: 'Ghi chú / lý do thiếu',
            key: 'note',
            width: 230,
            render: (_value, row) => (
                <Input
                    value={row.note}
                    placeholder={rowsByItem[groupIndex]?.shortage ? 'Bắt buộc nếu cấp thiếu' : 'Ghi chú'}
                    onChange={(event) => setRows((prev) => patchRows(prev, row.key, { note: event.target.value }))}
                />
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 52,
            align: 'center',
            render: (_value, row) => (
                <Tooltip title='Xóa dòng'>
                    <Button type='text' danger icon={<DeleteOutlined />} onClick={() => removeRow(row.key)} />
                </Tooltip>
            ),
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={1280}
            centered
            mask={{ closable: false }}
            destroyOnHidden
            styles={{ body: { padding: 0, maxHeight: '82vh', overflowY: 'auto' } }}
            title={
                <div className='flex items-center gap-3 px-1 py-0.5'>
                    <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600'>
                        <SendOutlined />
                    </div>
                    <div>
                        <div className='text-base font-semibold text-slate-900'>Tạo phiếu cấp phát vật tư</div>
                        <div className='text-xs text-slate-400'>
                            Căn cứ đề xuất{' '}
                            <span className='font-mono font-semibold text-blue-600'>{sr?.requestCode ?? '...'}</span>
                        </div>
                    </div>
                </div>
            }
            footer={
                <div className='flex items-center justify-between border-t border-slate-100 px-1 pt-3'>
                    <div className='grid grid-cols-4 gap-4 text-sm'>
                        <div>
                            <Text type='secondary'>SL cấp</Text>
                            <div className='font-semibold'>{fmt(totals.distributed)}</div>
                        </div>
                        <div>
                            <Text type='secondary'>SL thiếu</Text>
                            <div
                                className={
                                    totals.shortage ? 'font-semibold text-orange-600' : 'font-semibold text-emerald-600'
                                }
                            >
                                {fmt(totals.shortage)}
                            </div>
                        </div>
                        <div>
                            <Text type='secondary'>Tiền VAT</Text>
                            <div className='font-semibold'>{fmtVND(totals.vat)}</div>
                        </div>
                        <div>
                            <Text type='secondary'>Tổng cộng</Text>
                            <div className='font-bold text-blue-700'>{fmtVND(totals.total)}</div>
                        </div>
                    </div>
                    <Space>
                        <Button onClick={onClose}>Hủy</Button>
                        <Button
                            type='primary'
                            icon={<SendOutlined />}
                            loading={createDistMutation.isPending}
                            onClick={handleSubmit}
                        >
                            Tạo phiếu cấp phát
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className='flex flex-col'>
                <div className='border-b border-slate-100 bg-slate-50 px-6 py-4'>
                    <div className='mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-400 uppercase'>
                        <InfoCircleOutlined /> Thông tin phiếu
                    </div>
                    <div className='grid grid-cols-4 gap-4'>
                        <Input disabled value={sr?.requestCode ?? ''} className='font-mono font-semibold' />
                        <Input disabled value='Cơ sở chính (CS1)' />
                        <Input disabled value={sr?.fromPlant?.name ?? sr?.plant?.name ?? 'Cơ sở nhận'} />
                        <DatePicker
                            className='w-full'
                            value={distributedAt}
                            format='DD/MM/YYYY'
                            onChange={(value) => value && setDistributedAt(value)}
                        />
                    </div>
                    <Input.TextArea
                        className='mt-3'
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder='Ghi chú chung cho phiếu cấp phát'
                    />
                </div>

                <div className='px-6 py-4'>
                    <Alert
                        type='info'
                        showIcon
                        className='mb-4'
                        title='Hệ thống tự gợi ý vật tư kho theo tên đề xuất, đơn vị tính và tồn CS1. Các dòng cấp thiếu sẽ được ghi nhận để tạo phiếu cấp bù.'
                    />

                    {srLoading ? (
                        <div className='py-12 text-center text-slate-400'>Đang tải đề xuất...</div>
                    ) : (
                        <div className='flex flex-col gap-4'>
                            {srItems.map((item, idx) => {
                                const group = rowsByItem[idx];
                                const percent = group?.approved
                                    ? Math.min(100, Math.round((group.distributed / group.approved) * 100))
                                    : 0;
                                const statusColor = group?.over ? 'red' : group?.shortage ? 'orange' : 'green';

                                return (
                                    <div
                                        key={idx}
                                        className='overflow-hidden rounded-lg border border-slate-200 bg-white'
                                    >
                                        <div className='flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3'>
                                            <div className='min-w-0 flex-1'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs font-bold text-blue-700'>
                                                        {idx + 1}
                                                    </span>
                                                    <span className='truncate font-semibold text-slate-900'>
                                                        {item.materialName}
                                                    </span>
                                                    <Tag className='!m-0'>{item.unit}</Tag>
                                                    <Tag color={statusColor} className='!m-0'>
                                                        Cấp {fmt(group?.distributed)} / duyệt {fmt(group?.approved)}
                                                    </Tag>
                                                    {group?.shortage ? (
                                                        <Tag color='orange' className='!m-0'>
                                                            Thiếu {fmt(group.shortage)}
                                                        </Tag>
                                                    ) : (
                                                        <Tag
                                                            color='green'
                                                            className='!m-0'
                                                            icon={<CheckCircleOutlined />}
                                                        >
                                                            Đủ
                                                        </Tag>
                                                    )}
                                                </div>
                                                <div className='mt-2 grid grid-cols-[160px_1fr] items-center gap-3'>
                                                    <span className='text-xs text-slate-400'>Tiến độ cấp phát</span>
                                                    <Progress
                                                        percent={percent}
                                                        size='small'
                                                        status={
                                                            group?.over
                                                                ? 'exception'
                                                                : group?.shortage
                                                                  ? 'active'
                                                                  : 'success'
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <Space>
                                                <Button
                                                    size='small'
                                                    icon={<PlusOutlined />}
                                                    onClick={() => addRow(idx)}
                                                >
                                                    Ghép thêm vật tư
                                                </Button>
                                                <Button
                                                    size='small'
                                                    danger
                                                    icon={<StopOutlined />}
                                                    onClick={() => markNotSupplied(idx)}
                                                >
                                                    Không cấp
                                                </Button>
                                            </Space>
                                        </div>

                                        <Table<ItemRow>
                                            rowKey='key'
                                            size='small'
                                            columns={buildColumns(idx)}
                                            dataSource={group?.rows ?? []}
                                            pagination={false}
                                            scroll={{ x: 1110 }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default SupplyDistributionModal;
