import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { App, Button, DatePicker, Input, InputNumber, Modal, Space, Table, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { distributionService, supplyRequestService, type PurchaseRequestItem } from '../core/services/material.service';

const { Text } = Typography;
const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);

type ItemRow = {
    key: string;
    materialId: string;
    materialName: string;
    unit: string;
    quantityRequested: number;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    adjustReason: string;
    totalPrice: number;
    vatAmount: number;
    totalWithVat: number;
};

const computeRow = (r: ItemRow): ItemRow => {
    const totalPrice = r.quantity * r.unitPrice;
    const vatAmount = totalPrice * (r.vatRate / 100);
    return { ...r, totalPrice, vatAmount, totalWithVat: totalPrice + vatAmount };
};

const patchRow = (rows: ItemRow[], key: string, patch: Partial<ItemRow>): ItemRow[] =>
    rows.map((r) => (r.key === key ? computeRow({ ...r, ...patch }) : r));

interface Props {
    open: boolean;
    supplyRequestId: string;
    fromPlantId: string;
    toPlantId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const SupplyDistributionModal: React.FC<Props> = ({ open, supplyRequestId, fromPlantId, toPlantId, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [note, setNote] = useState('');
    const [items, setItems] = useState<ItemRow[]>([]);

    const { data: sr, isLoading } = useQuery({
        queryKey: ['supply-request', supplyRequestId],
        queryFn: () => supplyRequestService.getById(supplyRequestId),
        enabled: open && Boolean(supplyRequestId),
    });

    React.useEffect(() => {
        if (!open) { setNote(''); setDistributedAt(dayjs()); return; }
        if (!sr) return;
        setItems(
            (sr.items ?? []).map((it: PurchaseRequestItem) =>
                computeRow({
                    key: String(it.materialId ?? Math.random()),
                    materialId: it.materialId ?? '',
                    materialName: it.materialName ?? '',
                    unit: it.unit ?? '',
                    quantityRequested: it.quantityRequested,
                    quantity: it.quantityApproved ?? it.quantityRequested,
                    unitPrice: 0, vatRate: 8, adjustReason: '',
                    totalPrice: 0, vatAmount: 0, totalWithVat: 0,
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

    const handleSubmit = async () => {
        if (!items.length) { message.error('Phải có ít nhất 1 vật tư'); return; }

        const invalidQty = items.filter((r) => r.quantity <= 0);
        if (invalidQty.length) {
            message.error(`Số lượng phải > 0: ${invalidQty.map((r) => r.materialName).join(', ')}`);
            return;
        }

        const invalidPrice = items.filter((r) => r.unitPrice < 0);
        if (invalidPrice.length) {
            message.error(`Đơn giá không hợp lệ: ${invalidPrice.map((r) => r.materialName).join(', ')}`);
            return;
        }

        const invalidVat = items.filter((r) => r.vatRate < 0);
        if (invalidVat.length) {
            message.error(`VAT không hợp lệ: ${invalidVat.map((r) => r.materialName).join(', ')}`);
            return;
        }

        const missing = items.filter((r) => r.quantity !== r.quantityRequested && !r.adjustReason.trim());
        if (missing.length) {
            message.error(`Nhập lý do điều chỉnh cho: ${missing.map((r) => r.materialName).join(', ')}`);
            return;
        }
        await createDist({
            supplyRequestId,
            fromPlantId,
            toPlantId,
            distributedAt: distributedAt.toISOString(),
            note: note.trim() || undefined,
            items: items.map((r) => ({
                materialId: r.materialId,
                quantity: r.quantity,
                quantityRequested: r.quantityRequested,
                unitPrice: r.unitPrice,
                vatRate: r.vatRate,
                adjustReason: r.adjustReason.trim() || undefined,
            })),
        });
    };

    const handleDelete = (key: string) => {
        let reason = '';
        Modal.confirm({
            title: 'Bỏ vật tư khỏi phiếu?',
            content: (
                <div>
                    <div style={{ marginBottom: 8 }}>Lý do bỏ <Text type="danger">*</Text></div>
                    <Input.TextArea rows={2} placeholder="Bắt buộc nhập lý do..."
                        onChange={(e) => { reason = e.target.value; }} />
                </div>
            ),
            okText: 'Xác nhận bỏ', okButtonProps: { danger: true },
            onOk: () => {
                if (!reason.trim()) { message.error('Vui lòng nhập lý do'); return Promise.reject(); }
                setItems((p) => p.filter((r) => r.key !== key));
            },
        });
    };

    const columns: TableColumnsType<ItemRow> = [
        { title: 'STT', key: 'stt', width: 46, align: 'center', render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Tên vật tư', dataIndex: 'materialName', key: 'name', width: 180 },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 60, align: 'center' },
        { title: 'SL đề xuất', dataIndex: 'quantityRequested', key: 'qtyR', width: 90, align: 'center',
          render: (v: number) => <Text type="secondary">{v}</Text> },
        { title: <span>SL cấp <Text type="danger">*</Text></span>, key: 'qty', width: 90,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} value={r.quantity} style={{ width: 80,
                ...(r.quantity !== r.quantityRequested ? { borderColor: '#faad14' } : {}) }}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { quantity: v ?? 0 }))} />
          ) },
        { title: 'Đơn giá', key: 'price', width: 110,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} value={r.unitPrice} style={{ width: 100 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(String(v).replace(/,/g, '')) as any}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { unitPrice: v ?? 0 }))} />
          ) },
        { title: 'Thành tiền', key: 'total', width: 120, align: 'right',
          render: (_: any, r: ItemRow) => <Text style={{ color: '#1A3A5C' }}>{fmtVND(r.totalPrice)}</Text> },
        { title: 'VAT%', key: 'vat', width: 70,
          render: (_: any, r: ItemRow) => (
            <InputNumber size="small" min={0} max={100} value={r.vatRate} style={{ width: 60 }}
                formatter={(v) => `${v}%`} parser={(v) => Number(String(v).replace('%', '')) as any}
                onChange={(v) => setItems((p) => patchRow(p, r.key, { vatRate: v ?? 0 }))} />
          ) },
        { title: 'Giá VAT', key: 'vatAmt', width: 110, align: 'right',
          render: (_: any, r: ItemRow) => <Text type="secondary">{fmtVND(r.vatAmount)}</Text> },
        { title: 'Tổng tiền', key: 'totalVat', width: 120, align: 'right',
          render: (_: any, r: ItemRow) => <Text strong style={{ color: '#1A3A5C' }}>{fmtVND(r.totalWithVat)}</Text> },
        { title: 'Lý do điều chỉnh', key: 'reason', width: 180,
          render: (_: any, r: ItemRow) => (
            <Input size="small" value={r.adjustReason}
                disabled={r.quantity === r.quantityRequested}
                style={{ width: 170, ...(r.quantity !== r.quantityRequested && !r.adjustReason.trim() ? { borderColor: '#faad14' } : {}) }}
                placeholder={r.quantity !== r.quantityRequested ? 'Bắt buộc khi thay đổi SL' : ''}
                onChange={(e) => setItems((p) => patchRow(p, r.key, { adjustReason: e.target.value }))} />
          ) },
        { title: '', key: 'del', width: 46, align: 'center',
          render: (_: any, r: ItemRow) => (
            <Button type="text" danger size="small" icon={<DeleteOutlined />}
                disabled={items.length === 1} onClick={() => handleDelete(r.key)} />
          ) },
    ];

    return (
        <Modal open={open} title={`Tạo phiếu cấp phát — ${sr?.requestCode ?? ''}`}
            width={1100} centered maskClosable={false} destroyOnClose onCancel={onClose}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, color: '#888' }}>Thành tiền: {fmtVND(totals.price)}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>Tổng VAT: {fmtVND(totals.vat)}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A3A5C' }}>TỔNG CỘNG: {fmtVND(totals.total)}</div>
                    </div>
                    <Space>
                        <Button onClick={onClose}>Huỷ</Button>
                        <Button type="primary" style={{ background: '#1A3A5C' }} loading={isPending} onClick={handleSubmit}>
                            Tạo phiếu cấp phát →
                        </Button>
                    </Space>
                </div>
            }
        >
            {isLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Đang tải...</div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Căn cứ đề xuất</div>
                            <Input disabled value={sr?.requestCode ?? ''} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Từ cơ sở (CS1)</div>
                            <Input disabled value="CS1" />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Đến cơ sở</div>
                            <Input disabled value={sr?.fromPlant?.name ?? sr?.plant?.name ?? ''} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Ngày cấp phát <Text type="danger">*</Text></div>
                            <DatePicker style={{ width: '100%' }} value={distributedAt} format="DD/MM/YYYY"
                                onChange={(v) => v && setDistributedAt(v)} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Ghi chú</div>
                        <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                            placeholder="Ghi chú cho phiếu cấp phát..." />
                    </div>
                    <Table dataSource={items} columns={columns} rowKey="key"
                        pagination={false} size="small" scroll={{ x: 'max-content' }} />
                </>
            )}
        </Modal>
    );
};

export default SupplyDistributionModal;
