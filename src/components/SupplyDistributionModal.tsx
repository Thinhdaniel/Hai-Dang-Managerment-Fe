import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App, Button, DatePicker, Divider, Input, InputNumber,
    Modal, Select, Skeleton, Space, Tag, Tooltip, Typography,
} from 'antd';
import { DeleteOutlined, InfoCircleOutlined, PlusOutlined, SendOutlined, ShopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    distributionService, materialService, supplyRequestService,
    type PurchaseRequestItem,
} from '../core/services/material.service';

const { Text } = Typography;

const fmt = (v?: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);

type ItemRow = {
    key: string;
    srItemIndex: number;
    srItemName: string;
    srItemUnit: string;
    quantityRequested: number;
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
    inventorySkipReason: string;
};

const compute = (r: ItemRow): ItemRow => {
    const totalPrice = r.quantity * r.unitPrice;
    const vatAmount = totalPrice * (r.vatRate / 100);
    return { ...r, totalPrice, vatAmount, totalWithVat: totalPrice + vatAmount };
};

const patch = (rows: ItemRow[], key: string, p: Partial<ItemRow>): ItemRow[] =>
    rows.map((r) => (r.key === key ? compute({ ...r, ...p }) : r));

const makeKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface Props {
    open: boolean;
    supplyRequestId: string;
    fromPlantId: string;
    toPlantId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const SupplyDistributionModal: React.FC<Props> = ({
    open, supplyRequestId, fromPlantId, toPlantId, onClose, onSuccess,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [note, setNote] = useState('');
    const [items, setItems] = useState<ItemRow[]>([]);

    const { data: sr, isLoading: srLoading } = useQuery({
        queryKey: ['supply-request', supplyRequestId],
        queryFn: () => supplyRequestService.getById(supplyRequestId),
        enabled: open && Boolean(supplyRequestId),
    });

    const { data: materialsRaw = [], refetch: refetchMaterials } = useQuery({
        queryKey: ['materials', 'with-stock-cs1'],
        queryFn: () =>
            materialService.getAll({ includeStock: true, limit: 1000, isActive: true } as any)
                .then((r: any) => (Array.isArray(r) ? r : r.data ?? [])),
        enabled: open,
        staleTime: 60_000,
    });
    const materials: any[] = materialsRaw as any[];

    React.useEffect(() => {
        if (!open) { setNote(''); setDistributedAt(dayjs()); setItems([]); return; }
        if (!sr) return;
        setItems(
            (sr.items ?? []).map((it: PurchaseRequestItem, idx: number) =>
                compute({
                    key: makeKey(),
                    srItemIndex: idx,
                    srItemName: it.materialName ?? '',
                    srItemUnit: it.unit ?? '',
                    quantityRequested: it.quantityApproved ?? it.quantityRequested,
                    materialId: '',
                    materialName: it.materialName ?? '',
                    unit: it.unit ?? '',
                    quantity: it.quantityApproved ?? it.quantityRequested,
                    unitPrice: 0, vatRate: 8, note: '',
                    totalPrice: 0, vatAmount: 0, totalWithVat: 0,
                    catalogStatus: it.materialId ? 'matched' : 'unmatched',
                    inventorySkipReason: '',
                })
            )
        );
    }, [open, sr]);

    const totals = useMemo(() => ({
        price: items.reduce((s, r) => s + r.totalPrice, 0),
        vat: items.reduce((s, r) => s + r.vatAmount, 0),
        total: items.reduce((s, r) => s + r.totalWithVat, 0),
    }), [items]);

    const { mutateAsync: createDist, isPending } = useMutation({
        mutationFn: distributionService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] });
            queryClient.invalidateQueries({ queryKey: ['materials', 'supply-requests'] });
            message.success('Tạo phiếu cấp phát thành công!');
            onSuccess();
        },
        onError: (e: any) => message.error(e?.message ?? 'Có lỗi xảy ra'),
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
            setItems((p) => patch(p, row.key, {
                materialId: material.id,
                materialName: material.name,
                unit: material.unit,
                catalogStatus: 'matched',
                inventorySkipReason: '',
            }));
            message.success('Da tao vat tu va gan vao dong cap phat');
        },
        onError: (e: any) => message.error(e?.message ?? 'Khong tao duoc vat tu'),
    });

    const addRow = (srItemIndex: number) => {
        const ref = items.find((r) => r.srItemIndex === srItemIndex);
        setItems((prev) => [
            ...prev,
            compute({
                key: makeKey(), srItemIndex,
                srItemName: ref?.srItemName ?? '', srItemUnit: ref?.srItemUnit ?? '',
                quantityRequested: ref?.quantityRequested ?? 0,
                materialId: '', materialName: '', unit: '',
                quantity: 0, unitPrice: 0, vatRate: 8, note: '',
                totalPrice: 0, vatAmount: 0, totalWithVat: 0,
                catalogStatus: 'unmatched', inventorySkipReason: '',
            }),
        ]);
    };

    const removeRow = (key: string) => {
        const row = items.find((r) => r.key === key);
        if (!row) return;
        if (items.filter((r) => r.srItemIndex === row.srItemIndex).length <= 1) {
            message.warning('Mỗi vật tư đề xuất cần ít nhất 1 dòng cấp phát');
            return;
        }
        setItems((p) => p.filter((r) => r.key !== key));
    };

    const handleSubmit = async () => {
        const missingMat = items.filter((r) => !r.materialId && r.catalogStatus !== 'ignored');
        const invalidIgnored = items.filter((r) => r.catalogStatus === 'ignored' && !(r.materialName || r.srItemName).trim());
        if (invalidIgnored.length) { message.error('Dong bo qua ton van can co ten vat tu'); return; }
        if (missingMat.length) { message.error(`${missingMat.length} dòng chưa chọn vật tư kho`); return; }
        const invalidQty = items.filter((r) => r.quantity <= 0);
        if (invalidQty.length) { message.error('Số lượng cấp phải lớn hơn 0'); return; }
        const invalidPrice = items.filter((r) => r.unitPrice < 0);
        if (invalidPrice.length) { message.error('Đơn giá không hợp lệ'); return; }

        await createDist({
            supplyRequestId, fromPlantId, toPlantId,
            distributedAt: distributedAt.toISOString(),
            note: note.trim() || undefined,
            items: items.map((r) => ({
                materialId: r.materialId || undefined,
                materialName: (r.materialName || r.srItemName).trim(),
                unit: (r.unit || r.srItemUnit).trim(),
                quantity: r.quantity, quantityRequested: r.quantityRequested,
                unitPrice: r.unitPrice, vatRate: r.vatRate,
                catalogStatus: r.materialId ? 'matched' : r.catalogStatus,
                inventorySkipReason: r.catalogStatus === 'ignored' ? (r.inventorySkipReason.trim() || 'Khong theo doi ton kho') : undefined,
                adjustReason: r.note.trim() || undefined,
            })),
        });
    };

    const materialOptions = materials.map((m: any) => ({
        value: m.id,
        label: `${m.code ? `[${m.code}] ` : ''}${m.name}`,
        unit: m.unit,
        stock: m.cs1CurrentStock ?? null,
        trackInventory: m.trackInventory !== false,
    }));

    const srItems: PurchaseRequestItem[] = sr?.items ?? [];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={1100}
            centered
            mask={{ closable: false }}
            destroyOnHidden
            styles={{ body: { padding: 0, maxHeight: '80vh', overflowY: 'auto' } }}
            title={
                <div className="flex items-center gap-3 px-2 py-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <SendOutlined />
                    </div>
                    <div>
                        <div className="text-base font-semibold text-slate-900">Tạo phiếu cấp phát vật tư</div>
                        <div className="text-xs text-slate-400">
                            Căn cứ đề xuất:{' '}
                            <span className="font-mono font-semibold text-blue-600">{sr?.requestCode ?? '...'}</span>
                        </div>
                    </div>
                </div>
            }
            footer={
                <div className="flex items-center justify-between border-t border-slate-100 px-2 pt-3">
                    {/* Totals */}
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Thành tiền</div>
                            <div className="text-sm font-semibold text-slate-700">{fmtVND(totals.price)}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-center">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng VAT</div>
                            <div className="text-sm font-semibold text-slate-700">{fmtVND(totals.vat)}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-center">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng cộng</div>
                            <div className="text-lg font-bold text-blue-700">{fmtVND(totals.total)}</div>
                        </div>
                    </div>
                    <Space>
                        <Button onClick={onClose}>Huỷ</Button>
                        <Button
                            type="primary" icon={<SendOutlined />}
                            loading={isPending} onClick={handleSubmit}
                            className="bg-blue-600 hover:!bg-blue-700"
                        >
                            Tạo phiếu cấp phát
                        </Button>
                    </Space>
                </div>
            }
        >
            {srLoading ? (
                <div className="p-6">
                    <Skeleton active paragraph={{ rows: 4 }} />
                </div>
            ) : (
                <div className="flex flex-col">
                    {/* ── Section 1: Thông tin phiếu ── */}
                    <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                            <InfoCircleOutlined /> Thông tin phiếu
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Căn cứ đề xuất</div>
                                <Input
                                    disabled value={sr?.requestCode ?? ''}
                                    className="font-mono font-semibold"
                                />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Từ kho (CS1)</div>
                                <Input disabled value="Cơ sở chính (CS1)" />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Đến cơ sở</div>
                                <Input
                                    disabled
                                    value={sr?.fromPlant?.name ?? sr?.plant?.name ?? '—'}
                                    className="font-medium"
                                />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">
                                    Ngày cấp phát <span className="text-red-500">*</span>
                                </div>
                                <DatePicker
                                    className="w-full" value={distributedAt} format="DD/MM/YYYY"
                                    onChange={(v) => v && setDistributedAt(v)}
                                />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="mb-1 text-xs font-medium text-slate-500">Ghi chú phiếu</div>
                            <Input.TextArea
                                rows={2} value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Ghi chú chung cho phiếu cấp phát (không bắt buộc)..."
                            />
                        </div>
                    </div>

                    {/* ── Section 2: Danh sách vật tư ── */}
                    <div className="px-6 py-4">
                        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                            <ShopOutlined /> Phân bổ vật tư kho
                            <Tooltip title="Mỗi vật tư đề xuất có thể được ghép từ nhiều mã vật tư trong kho">
                                <InfoCircleOutlined className="cursor-help text-slate-300" />
                            </Tooltip>
                        </div>

                        <div className="flex flex-col gap-4">
                            {srItems.map((srItem: PurchaseRequestItem, idx: number) => {
                                const rowsForItem = items.filter((r) => r.srItemIndex === idx);
                                const qtyApproved = srItem.quantityApproved ?? srItem.quantityRequested;
                                const qtyDistributed = rowsForItem.reduce((s, r) => s + r.quantity, 0);
                                const isExact = qtyDistributed === qtyApproved;
                                const isOver = qtyDistributed > qtyApproved;

                                return (
                                    <div
                                        key={idx}
                                        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                                    >
                                        {/* Group header */}
                                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-600">
                                                    {idx + 1}
                                                </span>
                                                <span className="truncate text-sm font-semibold text-slate-800">
                                                    {srItem.materialName}
                                                </span>
                                                <span className="shrink-0 text-xs text-slate-400">
                                                    ({srItem.unit})
                                                </span>
                                                <div className="ml-2 flex items-center gap-1.5 shrink-0">
                                                    <Tag color="blue" className="!text-[11px] !m-0">
                                                        Đề xuất: {fmt(srItem.quantityRequested)}
                                                    </Tag>
                                                    {srItem.quantityApproved != null &&
                                                        srItem.quantityApproved !== srItem.quantityRequested && (
                                                            <Tag color="orange" className="!text-[11px] !m-0">
                                                                Duyệt: {fmt(srItem.quantityApproved)}
                                                            </Tag>
                                                        )}
                                                    <Tag
                                                        color={isOver ? 'red' : isExact ? 'green' : 'warning'}
                                                        className="!text-[11px] !m-0"
                                                    >
                                                        Đã phân: {fmt(qtyDistributed)} / {fmt(qtyApproved)}
                                                    </Tag>
                                                </div>
                                            </div>
                                            <Button
                                                size="small" icon={<PlusOutlined />}
                                                onClick={() => addRow(idx)}
                                                className="shrink-0 ml-3"
                                            >
                                                Thêm vật tư kho
                                            </Button>
                                        </div>

                                        {/* Rows */}
                                        <div>
                                            <table className="w-full border-collapse text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                                        <th className="px-4 py-2 text-left" style={{ width: '28%' }}>Vật tư kho thực tế</th>
                                                        <th className="px-2 py-2 text-center" style={{ width: 52 }}>ĐVT</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 80 }}>SL cấp</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 100 }}>Đơn giá</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 90 }}>Thành tiền</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 60 }}>VAT%</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 90 }}>Tiền VAT</th>
                                                        <th className="px-2 py-2 text-right" style={{ width: 100 }}>Tổng tiền</th>
                                                        <th className="px-2 py-2 text-left">Ghi chú</th>
                                                        <th style={{ width: 36 }} />
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {rowsForItem.map((row) => (
                                                        <tr key={row.key} className="hover:bg-blue-50/20 transition-colors">
                                                            <td className="px-4 py-2">
                                                                <Select
                                                                    allowClear showSearch={{ optionFilterProp: 'label' }}
                                                                    placeholder="Chọn vật tư kho..." size="small"
                                                                    style={{ width: '100%' }}
                                                                    disabled={row.catalogStatus === 'ignored'}
                                                                    value={row.materialId || undefined}
                                                                    options={materialOptions}
                                                                    optionRender={(opt) => {
                                                                        const stock = (opt.data as any).stock;
                                                                        return (
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <span className="flex-1 truncate text-xs">{opt.label}</span>
                                                                                {stock === null ? (
                                                                                    <Tag color="error" className="!text-[10px] !m-0">Chưa có</Tag>
                                                                                ) : stock > 0 ? (
                                                                                    <Tag color="success" className="!text-[10px] !m-0">Còn {fmt(stock)}</Tag>
                                                                                ) : (
                                                                                    <Tag color="warning" className="!text-[10px] !m-0">Hết</Tag>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }}
                                                                    onChange={(v) => {
                                                                        const mat = materials.find((m: any) => m.id === v);
                                                                        setItems((p) => patch(p, row.key, {
                                                                            materialId: v || '',
                                                                            materialName: mat?.name ?? '',
                                                                            unit: mat?.unit ?? row.unit,
                                                                            catalogStatus: v ? 'matched' : 'unmatched',
                                                                            inventorySkipReason: '',
                                                                        }));
                                                                    }}
                                                                />
                                                                <div className="mt-1 flex items-center gap-1">
                                                                    <Button
                                                                        size="small"
                                                                        icon={<PlusOutlined />}
                                                                        loading={createMaterialMutation.isPending}
                                                                        disabled={row.catalogStatus === 'ignored' || !(row.materialName || row.srItemName).trim() || !(row.unit || row.srItemUnit).trim()}
                                                                        onClick={() => createMaterialMutation.mutate(row)}
                                                                    >
                                                                        Tao VT
                                                                    </Button>
                                                                    <Button
                                                                        size="small"
                                                                        type={row.catalogStatus === 'ignored' ? 'primary' : 'default'}
                                                                        onClick={() => setItems((p) => patch(p, row.key, {
                                                                            materialId: '',
                                                                            materialName: row.materialName || row.srItemName,
                                                                            unit: row.unit || row.srItemUnit,
                                                                            catalogStatus: row.catalogStatus === 'ignored' ? 'unmatched' : 'ignored',
                                                                            inventorySkipReason: row.catalogStatus === 'ignored' ? '' : 'Khong theo doi ton kho',
                                                                        }))}
                                                                    >
                                                                        {row.catalogStatus === 'ignored' ? 'Theo ton' : 'Bo ton'}
                                                                    </Button>
                                                                </div>
                                                                {row.catalogStatus === 'ignored' ? (
                                                                    <Tag color="orange" className="!mt-1 !text-[10px]">Khong tru ton</Tag>
                                                                ) : null}
                                                            </td>
                                                            <td className="px-2 py-2 text-center text-xs text-slate-500">{row.unit || '—'}</td>
                                                            <td className="px-2 py-2">
                                                                <InputNumber
                                                                    size="small" min={0} value={row.quantity}
                                                                    controls={false} style={{ width: '100%' }}
                                                                    onChange={(v) => setItems((p) => patch(p, row.key, { quantity: v ?? 0 }))}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <InputNumber
                                                                    size="small" min={0} value={row.unitPrice}
                                                                    controls={false} style={{ width: '100%' }}
                                                                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                                    parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                                                                    onChange={(v) => setItems((p) => patch(p, row.key, { unitPrice: v ?? 0 }))}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2 text-right text-xs font-medium text-slate-700">
                                                                {row.totalPrice > 0 ? fmt(row.totalPrice) : '—'}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <InputNumber
                                                                    size="small" min={0} max={100} value={row.vatRate}
                                                                    controls={false} style={{ width: '100%' }}
                                                                    formatter={(v) => `${v}%`}
                                                                    parser={(v) => Number(String(v).replace('%', '')) as any}
                                                                    onChange={(v) => setItems((p) => patch(p, row.key, { vatRate: v ?? 0 }))}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2 text-right text-xs text-slate-400">
                                                                {row.vatAmount > 0 ? fmt(row.vatAmount) : '—'}
                                                            </td>
                                                            <td className="px-2 py-2 text-right text-sm font-bold text-blue-700">
                                                                {row.totalWithVat > 0 ? fmt(row.totalWithVat) : '—'}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <Input
                                                                    size="small" value={row.note}
                                                                    placeholder="Ghi chú..."
                                                                    style={{ width: '100%' }}
                                                                    onChange={(e) => setItems((p) => patch(p, row.key, { note: e.target.value }))}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2 text-center">
                                                                <Tooltip title="Xoá dòng">
                                                                    <Button
                                                                        type="text" danger size="small" icon={<DeleteOutlined />}
                                                                        onClick={() => removeRow(row.key)}
                                                                    />
                                                                </Tooltip>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            {/* Sub-total per SR item */}
                                            {rowsForItem.length > 1 && (
                                                <table className="w-full border-collapse border-t border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                                                    <tbody>
                                                        <tr>
                                                            <td className="px-4 py-1.5 text-right text-slate-400" colSpan={4}>Tổng nhóm</td>
                                                            <td className="px-2 py-1.5 text-right" style={{ width: 90 }}>{fmt(rowsForItem.reduce((s, r) => s + r.totalPrice, 0))}</td>
                                                            <td style={{ width: 60 }} />
                                                            <td className="px-2 py-1.5 text-right" style={{ width: 90 }}>{fmt(rowsForItem.reduce((s, r) => s + r.vatAmount, 0))}</td>
                                                            <td className="px-2 py-1.5 text-right font-bold text-blue-700" style={{ width: 100 }}>{fmt(rowsForItem.reduce((s, r) => s + r.totalWithVat, 0))}</td>
                                                            <td /><td />
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Grand total summary */}
                        {srItems.length > 1 && (
                            <div className="mt-4 flex justify-end">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-3">
                                    <div className="flex items-center gap-8">
                                        <div className="text-center">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Thành tiền</div>
                                            <div className="text-sm font-semibold text-slate-700">{fmtVND(totals.price)}</div>
                                        </div>
                                        <Divider vertical className="!h-8" />
                                        <div className="text-center">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng VAT</div>
                                            <div className="text-sm font-semibold text-slate-700">{fmtVND(totals.vat)}</div>
                                        </div>
                                        <Divider vertical className="!h-8" />
                                        <div className="text-center">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng cộng</div>
                                            <div className="text-xl font-bold text-blue-700">{fmtVND(totals.total)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default SupplyDistributionModal;
