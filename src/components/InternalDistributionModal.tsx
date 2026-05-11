import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App, Button, DatePicker, Divider, Input, InputNumber,
    Modal, Select, Space, Tag, Tooltip,
} from 'antd';
import {
    CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined,
    PlusOutlined, SaveOutlined, SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    distributionService, inventoryService,
    type Distribution, type MaterialInventory,
} from '../core/services/material.service';

const fmt = (v?: number) => (v ?? 0).toLocaleString('vi-VN');

type ItemRow = {
    key: string;
    materialId?: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    note: string;
};

const newRow = (): ItemRow => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialId: undefined, quantity: 1, unitPrice: 0, vatRate: 0, note: '',
});

type Props = {
    open: boolean;
    plantId: string;
    existingDraft?: Distribution | null;
    onClose: () => void;
    onSuccess: (distribution: Distribution) => void;
};

const InternalDistributionModal: React.FC<Props> = ({ open, plantId, existingDraft, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const [requesterName, setRequesterName] = useState('');
    const [targetDepartment, setTargetDepartment] = useState('');
    const [targetLine, setTargetLine] = useState('');
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [noteGeneral, setNoteGeneral] = useState('');
    const [rows, setRows] = useState<ItemRow[]>([newRow()]);

    const isDraftMode = Boolean(existingDraft);

    useEffect(() => {
        if (!open) return;
        setRows([newRow()]);
        if (!existingDraft) {
            setRequesterName('');
            setTargetDepartment('');
            setTargetLine('');
            setDistributedAt(dayjs());
            setNoteGeneral('');
        }
    }, [open, existingDraft]);

    const { data: inventoryRows = [], isLoading: invLoading } = useQuery({
        queryKey: ['materials', 'inventory', 'internal-options', plantId],
        queryFn: async () => {
            const res = await inventoryService.getAll({ plantId, limit: 500, page: 1 });
            return Array.isArray(res) ? res : res.data;
        },
        enabled: open && Boolean(plantId),
        staleTime: 60_000,
    });

    const inventoryMap = useMemo(
        () => new Map((inventoryRows as MaterialInventory[]).map((r) => [r.materialId, r])),
        [inventoryRows]
    );

    const materialOptions = useMemo(
        () => (inventoryRows as MaterialInventory[]).map((r) => ({
            value: r.materialId,
            label: `${r.material?.code ? `[${r.material.code}] ` : ''}${r.material?.name || r.materialId}`,
            stock: r.currentStock ?? 0,
            unit: r.material?.unit || '',
        })),
        [inventoryRows]
    );

    const patchRow = (key: string, changes: Partial<ItemRow>) =>
        setRows((p) => p.map((r) => (r.key === key ? { ...r, ...changes } : r)));

    const removeRow = (key: string) =>
        setRows((p) => p.length > 1 ? p.filter((r) => r.key !== key) : p);

    const totals = useMemo(() => rows.reduce((acc, r) => {
        const tp = Number((r.quantity * r.unitPrice).toFixed(2));
        const va = Number((tp * r.vatRate / 100).toFixed(2));
        return { price: acc.price + tp, vat: acc.vat + va, total: acc.total + tp + va };
    }, { price: 0, vat: 0, total: 0 }), [rows]);

    const buildItems = () => rows.map((r) => ({
        materialId: r.materialId!,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        vatRate: r.vatRate,
        note: r.note.trim() || undefined,
    }));

    const validate = (checkStock = true) => {
        if (!isDraftMode && !requesterName.trim()) {
            message.error('Vui lòng nhập tên người xin cấp'); return false;
        }
        for (const [i, r] of rows.entries()) {
            if (!r.materialId) { message.error(`Dòng ${i + 1}: chưa chọn vật tư`); return false; }
            if (r.quantity <= 0) { message.error(`Dòng ${i + 1}: số lượng phải > 0`); return false; }
            if (checkStock) {
                const stock = inventoryMap.get(r.materialId)?.currentStock ?? 0;
                if (r.quantity > stock) {
                    message.error(`Dòng ${i + 1}: tồn kho không đủ (còn ${fmt(stock)})`); return false;
                }
            }
        }
        return true;
    };

    const invalidate = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] }),
        queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['materials', 'distributions', 'draft-internal'] }),
    ]);

    // ── Mutation: tạo nháp (KHÔNG đóng modal, chỉ thông báo)
    const saveDraftMutation = useMutation({
        mutationFn: () =>
            distributionService.createInternal({
                requesterName: requesterName.trim(),
                targetDepartment: targetDepartment.trim() || undefined,
                targetLine: targetLine.trim() || undefined,
                distributedAt: distributedAt.toISOString(),
                note: noteGeneral.trim() || undefined,
                status: 'draft',
                items: buildItems(),
            }),
        onSuccess: async (dist) => {
            await invalidate();
            message.success(`Đã lưu phiếu nháp ${dist.distributionCode}`);
            // Không đóng modal — chuyển sang draft mode với phiếu vừa tạo
            onSuccess(dist);
        },
        onError: (e: any) => message.error(e?.message ?? 'Có lỗi xảy ra'),
    });

    // ── Mutation: tạo và xác nhận ngay (trừ kho)
    const confirmMutation = useMutation({
        mutationFn: () =>
            distributionService.createInternal({
                requesterName: requesterName.trim(),
                targetDepartment: targetDepartment.trim() || undefined,
                targetLine: targetLine.trim() || undefined,
                distributedAt: distributedAt.toISOString(),
                note: noteGeneral.trim() || undefined,
                status: 'confirmed',
                items: buildItems(),
            }),
        onSuccess: async (dist) => {
            await invalidate();
            message.success('Tạo phiếu cấp phát thành công — tồn kho đã cập nhật!');
            onSuccess(dist);
        },
        onError: (e: any) => message.error(e?.message ?? 'Có lỗi xảy ra'),
    });

    // ── Mutation: thêm vật tư vào draft
    const appendMutation = useMutation({
        mutationFn: () =>
            distributionService.appendInternalItems(existingDraft!.id, buildItems()),
        onSuccess: async (dist) => {
            await invalidate();
            message.success('Đã thêm vật tư vào phiếu nháp');
            onSuccess(dist);
        },
        onError: (e: any) => message.error(e?.message ?? 'Có lỗi xảy ra'),
    });

    // ── Mutation: chốt phiếu draft
    const finalizeMutation = useMutation({
        mutationFn: () => distributionService.finalizeInternalDraft(existingDraft!.id),
        onSuccess: async (dist) => {
            await invalidate();
            message.success('Đã chốt phiếu — tồn kho đã được cập nhật!');
            onSuccess(dist);
        },
        onError: (e: any) => message.error(e?.message ?? 'Có lỗi xảy ra'),
    });

    const handleSaveDraft = () => { if (validate(false)) saveDraftMutation.mutate(); };
    const handleConfirm = () => { if (validate()) confirmMutation.mutate(); };
    const handleAppend = () => { if (validate(false)) appendMutation.mutate(); };
    const handleFinalize = () => {
        Modal.confirm({
            title: 'Chốt phiếu cấp phát nội bộ?',
            content: 'Tồn kho sẽ bị trừ ngay lập tức. Không thể hoàn tác.',
            okText: 'Chốt phiếu', okButtonProps: { className: 'bg-green-600' },
            onOk: () => finalizeMutation.mutateAsync(),
        });
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={1060}
            centered
            maskClosable={false}
            destroyOnClose
            styles={{ body: { padding: 0, maxHeight: '82vh', overflowY: 'auto' } }}
            title={
                <div className="flex items-center gap-3 px-1 py-0.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <SendOutlined />
                    </div>
                    <div>
                        <div className="text-base font-semibold text-slate-900">
                            {isDraftMode ? 'Thêm vật tư vào phiếu nháp' : 'Cấp phát vật tư nội bộ'}
                        </div>
                        {isDraftMode ? (
                            <div className="flex items-center gap-2 text-xs">
                                <Tag color="orange" icon={<ClockCircleOutlined />} className="!m-0">Nháp</Tag>
                                <span className="font-mono font-semibold text-slate-600">{existingDraft?.distributionCode}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-400">{existingDraft?.targetDepartment || existingDraft?.requesterName}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-400">{existingDraft?.items?.length ?? 0} dòng hiện có</span>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">Cấp phát trực tiếp trong nội bộ cơ sở</div>
                        )}
                    </div>
                </div>
            }
            footer={
                <div className="flex items-center justify-between border-t border-slate-100 px-1 pt-3">
                    <div className="flex items-center gap-5">
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Thành tiền</div>
                            <div className="text-sm font-semibold text-slate-700">{fmt(totals.price)}</div>
                        </div>
                        <Divider type="vertical" className="!h-7" />
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng VAT</div>
                            <div className="text-sm font-semibold text-slate-700">{fmt(totals.vat)}</div>
                        </div>
                        <Divider type="vertical" className="!h-7" />
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng cộng</div>
                            <div className="text-lg font-bold text-emerald-700">{fmt(totals.total)}</div>
                        </div>
                    </div>

                    {isDraftMode ? (
                        <Space>
                            <Button onClick={onClose}>Đóng</Button>
                            <Button icon={<PlusOutlined />} loading={appendMutation.isPending} onClick={handleAppend}>
                                Thêm vào phiếu nháp
                            </Button>
                            <Button
                                type="primary" icon={<CheckCircleOutlined />}
                                loading={finalizeMutation.isPending} onClick={handleFinalize}
                                className="bg-emerald-600 hover:!bg-emerald-700"
                            >
                                Chốt phiếu — trừ kho
                            </Button>
                        </Space>
                    ) : (
                        <Space>
                            <Button onClick={onClose}>Huỷ</Button>
                            <Button
                                icon={<SaveOutlined />}
                                loading={saveDraftMutation.isPending}
                                onClick={handleSaveDraft}
                            >
                                Lưu nháp
                            </Button>
                            <Button
                                type="primary" icon={<CheckCircleOutlined />}
                                loading={confirmMutation.isPending}
                                onClick={handleConfirm}
                                className="bg-emerald-600 hover:!bg-emerald-700"
                            >
                                Xác nhận — trừ kho ngay
                            </Button>
                        </Space>
                    )}
                </div>
            }
        >
            <div className="flex flex-col">
                {/* ── Section 1: Thông tin phiếu ── */}
                {!isDraftMode && (
                    <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                            Thông tin phiếu
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">
                                    Người xin cấp <span className="text-red-500">*</span>
                                </div>
                                <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Nguyễn Văn A" />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Bộ phận</div>
                                <Input value={targetDepartment} onChange={(e) => setTargetDepartment(e.target.value)} placeholder="Chuyền may, Kỹ thuật..." />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Chuyền / Tổ</div>
                                <Input value={targetLine} onChange={(e) => setTargetLine(e.target.value)} placeholder="Chuyền 1, Tổ cắt..." />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-medium text-slate-500">Thời gian cấp</div>
                                <DatePicker showTime className="w-full" format="DD/MM/YYYY HH:mm" value={distributedAt} onChange={(v) => v && setDistributedAt(v)} />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="mb-1 text-xs font-medium text-slate-500">Ghi chú / Mục đích</div>
                            <Input.TextArea rows={2} value={noteGeneral} onChange={(e) => setNoteGeneral(e.target.value)} placeholder="Mục đích sử dụng, lý do cấp phát..." />
                        </div>
                    </div>
                )}

                {/* ── Section 2: Danh sách vật tư ── */}
                <div className="px-6 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                            Danh sách vật tư cấp phát
                        </span>
                        <Button size="small" icon={<PlusOutlined />} onClick={() => setRows((p) => [...p, newRow()])}>
                            Thêm dòng
                        </Button>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-200">
                        {/* Table layout - tránh vỡ cột với Ant Design components */}
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    <th className="px-3 py-2 text-left" style={{ width: '30%' }}>Vật tư</th>
                                    <th className="px-2 py-2 text-center" style={{ width: 52 }}>ĐVT</th>
                                    <th className="px-2 py-2 text-right" style={{ width: 72 }}>Tồn kho</th>
                                    <th className="px-2 py-2 text-right" style={{ width: 80 }}>SL cấp</th>
                                    <th className="px-2 py-2 text-right" style={{ width: 100 }}>Đơn giá</th>
                                    <th className="px-2 py-2 text-right" style={{ width: 60 }}>VAT%</th>
                                    <th className="px-2 py-2 text-right" style={{ width: 90 }}>Tổng tiền</th>
                                    <th className="px-2 py-2 text-left">Ghi chú</th>
                                    <th style={{ width: 36 }} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row) => {
                                    const inv = row.materialId ? inventoryMap.get(row.materialId) : undefined;
                                    const stock = inv?.currentStock ?? 0;
                                    const unit = inv?.material?.unit || '';
                                    const totalPrice = row.quantity * row.unitPrice;
                                    const isOver = Boolean(row.materialId && row.quantity > stock);

                                    return (
                                        <tr key={row.key} className={isOver ? 'bg-red-50/50' : 'hover:bg-slate-50/60'}>
                                            <td className="px-3 py-2">
                                                <Select
                                                    showSearch optionFilterProp="label"
                                                    placeholder="Chọn vật tư..." size="small"
                                                    loading={invLoading} style={{ width: '100%' }}
                                                    value={row.materialId}
                                                    options={materialOptions}
                                                    optionRender={(opt) => {
                                                        const s = (opt.data as any).stock;
                                                        return (
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="flex-1 truncate text-xs">{opt.label}</span>
                                                                <Tag color={s > 0 ? 'success' : 'warning'} className="!m-0 !text-[10px]">
                                                                    {fmt(s)} {(opt.data as any).unit}
                                                                </Tag>
                                                            </div>
                                                        );
                                                    }}
                                                    onChange={(v) => patchRow(row.key, { materialId: v })}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-center text-xs text-slate-500">{unit || '—'}</td>
                                            <td className={`px-2 py-2 text-right text-xs font-medium ${isOver ? 'text-red-500' : 'text-slate-400'}`}>
                                                {row.materialId ? fmt(stock) : '—'}
                                            </td>
                                            <td className="px-2 py-2">
                                                <InputNumber
                                                    size="small" min={0} value={row.quantity}
                                                    controls={false} style={{ width: '100%' }}
                                                    className={isOver ? '[&_input]:!text-red-600 [&_input]:!font-semibold' : ''}
                                                    onChange={(v) => patchRow(row.key, { quantity: Number(v ?? 0) })}
                                                />
                                            </td>
                                            <td className="px-2 py-2">
                                                <InputNumber
                                                    size="small" min={0} value={row.unitPrice}
                                                    controls={false} style={{ width: '100%' }}
                                                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                    parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                                                    onChange={(v) => patchRow(row.key, { unitPrice: Number(v ?? 0) })}
                                                />
                                            </td>
                                            <td className="px-2 py-2">
                                                <InputNumber
                                                    size="small" min={0} max={100} value={row.vatRate}
                                                    controls={false} style={{ width: '100%' }}
                                                    formatter={(v) => `${v}%`}
                                                    parser={(v) => Number(String(v).replace('%', '')) as any}
                                                    onChange={(v) => patchRow(row.key, { vatRate: Number(v ?? 0) })}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-right text-sm font-bold text-emerald-700">
                                                {totalPrice > 0 ? fmt(totalPrice) : '—'}
                                            </td>
                                            <td className="px-2 py-2">
                                                <Input
                                                    size="small" value={row.note}
                                                    placeholder="Ghi chú..."
                                                    style={{ width: '100%' }}
                                                    onChange={(e) => patchRow(row.key, { note: e.target.value })}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                                <Tooltip title="Xoá dòng">
                                                    <Button
                                                        type="text" danger size="small" icon={<DeleteOutlined />}
                                                        disabled={rows.length === 1}
                                                        onClick={() => removeRow(row.key)}
                                                    />
                                                </Tooltip>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default InternalDistributionModal;
