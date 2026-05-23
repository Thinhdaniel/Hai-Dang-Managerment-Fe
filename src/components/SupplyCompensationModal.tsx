import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    distributionService,
    materialService,
    type SupplyShortage,
} from '../core/services/material.service';

const { Text } = Typography;
const fmt = (value?: number) => (value ?? 0).toLocaleString('vi-VN');

type Row = {
    key: string;
    shortageId: string;
    materialName: string;
    unit?: string;
    outstanding: number;
    materialId?: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    note?: string;
};

type Props = {
    open: boolean;
    shortages: SupplyShortage[];
    onClose: () => void;
    onSuccess: () => void;
};

const getStock = (material?: any) =>
    material && typeof material.cs1CurrentStock === 'number' ? material.cs1CurrentStock : null;

const SupplyCompensationModal: React.FC<Props> = ({ open, shortages, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<Row[]>([]);

    const { data: materialsRaw = [] } = useQuery({
        queryKey: ['materials', 'with-stock-cs1'],
        queryFn: () =>
            materialService
                .getAll({ includeStock: true, limit: 1000, isActive: true } as any)
                .then((res: any) => (Array.isArray(res) ? res : res.data ?? [])),
        enabled: open,
        staleTime: 60_000,
    });
    const materials = materialsRaw as any[];

    useEffect(() => {
        if (!open) {
            setRows([]);
            setNote('');
            setDistributedAt(dayjs());
            return;
        }
        setRows(
            shortages.map((shortage) => {
                const material = materials.find((item: any) => item.id === shortage.materialId);
                const stock = getStock(material);
                return {
                    key: shortage.id,
                    shortageId: shortage.id,
                    materialName: shortage.materialName,
                    unit: shortage.unit,
                    outstanding: shortage.quantityOutstanding,
                    materialId: shortage.materialId,
                    quantity: typeof stock === 'number' ? Math.min(shortage.quantityOutstanding, Math.max(0, stock)) : shortage.quantityOutstanding,
                    unitPrice: 0,
                    vatRate: 8,
                    note: '',
                };
            })
        );
    }, [open, shortages, materials]);

    const createMutation = useMutation({
        mutationFn: () =>
            distributionService.createCompensation({
                shortageIds: shortages.map((item) => item.id),
                distributedAt: distributedAt.toISOString(),
                note: note.trim() || undefined,
                items: rows.map((row) => ({
                    sourceShortageId: row.shortageId,
                    materialId: row.materialId,
                    materialName: row.materialName,
                    unit: row.unit,
                    quantity: row.quantity,
                    quantityRequested: row.outstanding,
                    unitPrice: row.unitPrice,
                    vatRate: row.vatRate,
                    note: row.note?.trim() || undefined,
                })),
            }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['materials', 'distributions'] }),
                queryClient.invalidateQueries({ queryKey: ['materials', 'supply-shortages'] }),
            ]);
            message.success('Đã tạo phiếu cấp bù');
            onSuccess();
        },
        onError: (error: any) => message.error(error?.message ?? 'Không tạo được phiếu cấp bù'),
    });

    const totals = useMemo(
        () => ({
            quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
            remaining: rows.reduce((sum, row) => sum + Math.max(0, row.outstanding - row.quantity), 0),
        }),
        [rows]
    );

    const materialOptions = materials.map((material: any) => ({
        value: material.id,
        label: `${material.code ? `[${material.code}] ` : ''}${material.name}`,
        stock: getStock(material),
        unit: material.unit,
    }));

    const patch = (key: string, changes: Partial<Row>) =>
        setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));

    const handleSubmit = () => {
        const invalid = rows.find((row) => !row.materialId || row.quantity <= 0 || row.quantity > row.outstanding);
        if (invalid) {
            message.error('Vui lòng chọn vật tư và nhập số lượng cấp bù hợp lệ');
            return;
        }
        createMutation.mutate();
    };

    const columns: TableColumnsType<Row> = [
        { title: 'Vật tư còn thiếu', dataIndex: 'materialName', key: 'materialName', width: 230, render: (value) => <span className="font-semibold text-slate-800">{value}</span> },
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 70, align: 'center' },
        { title: 'Còn thiếu', dataIndex: 'outstanding', key: 'outstanding', width: 95, align: 'right', render: (value) => <span className="font-semibold text-orange-600">{fmt(value)}</span> },
        {
            title: 'Vật tư kho',
            key: 'materialId',
            width: 300,
            render: (_value, row) => (
                <Select
                    showSearch
                    optionFilterProp='label'
                    value={row.materialId}
                    options={materialOptions}
                    style={{ width: '100%' }}
                    optionRender={(option) => {
                        const stock = (option.data as any).stock;
                        return (
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs">{option.label}</span>
                                <Tag color={stock > 0 ? 'success' : 'warning'} className="!m-0 !text-[10px]">
                                    {stock === null ? 'Chưa có tồn' : `Tồn ${fmt(stock)}`}
                                </Tag>
                            </div>
                        );
                    }}
                    onChange={(value) => {
                        const material = materials.find((item: any) => item.id === value);
                        patch(row.key, { materialId: value, unit: material?.unit ?? row.unit });
                    }}
                />
            ),
        },
        {
            title: 'SL cấp bù',
            key: 'quantity',
            width: 110,
            align: 'right',
            render: (_value, row) => (
                <InputNumber min={0} max={row.outstanding} controls={false} value={row.quantity} style={{ width: '100%' }} onChange={(value) => patch(row.key, { quantity: Number(value ?? 0) })} />
            ),
        },
        {
            title: 'Ghi chú',
            key: 'note',
            render: (_value, row) => <Input value={row.note} placeholder="Ghi chú cấp bù" onChange={(event) => patch(row.key, { note: event.target.value })} />,
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={980}
            centered
            title="Tạo phiếu cấp bù"
            footer={
                <div className="flex items-center justify-between">
                    <Space size={16}>
                        <Text type="secondary">SL cấp bù: <strong>{fmt(totals.quantity)}</strong></Text>
                        <Text type="secondary">Còn lại sau phiếu này: <strong className={totals.remaining ? 'text-orange-600' : 'text-emerald-600'}>{fmt(totals.remaining)}</strong></Text>
                    </Space>
                    <Space>
                        <Button onClick={onClose}>Hủy</Button>
                        <Button type="primary" icon={<SendOutlined />} loading={createMutation.isPending} onClick={handleSubmit}>Tạo phiếu cấp bù</Button>
                    </Space>
                </div>
            }
            destroyOnHidden
        >
            <div className="mb-4 grid grid-cols-3 gap-3">
                <DatePicker className="w-full" value={distributedAt} format="DD/MM/YYYY" onChange={(value) => value && setDistributedAt(value)} />
                <Input className="col-span-2" value={note} placeholder="Ghi chú phiếu cấp bù" onChange={(event) => setNote(event.target.value)} />
            </div>
            <Table<Row> rowKey="key" columns={columns} dataSource={rows} pagination={false} size="small" scroll={{ x: 900 }} />
        </Modal>
    );
};

export default SupplyCompensationModal;
