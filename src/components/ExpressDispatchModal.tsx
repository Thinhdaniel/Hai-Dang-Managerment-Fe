import React, { useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Divider,
    Input,
    InputNumber,
    Modal,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined, ShopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plantService, supplierService } from '../core/services';
import {
    expressDispatchService,
    type ExpressDispatchItem,
    type ExpressDispatchPayload,
    type QuickSupplier,
} from '../core/services/material.service';

const { Text } = Typography;

const fmtVND = (v?: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v ?? 0);

type ItemRow = ExpressDispatchItem & { key: string; totalPrice: number; vatAmount: number; totalWithVat: number; showQuickSupplier?: boolean };

const EMPTY_ROW = (): ItemRow => ({
    key: String(Date.now() + Math.random()),
    materialName: '',
    unit: '',
    quantity: 1,
    unitPrice: 0,
    vatRate: 8,
    supplierId: '',
    note: '',
    totalPrice: 0,
    vatAmount: 0,
    totalWithVat: 0,
    showQuickSupplier: false,
});

const compute = (r: ItemRow): ItemRow => {
    const totalPrice = r.quantity * r.unitPrice;
    const vatAmount = totalPrice * ((r.vatRate ?? 0) / 100);
    return { ...r, totalPrice, vatAmount, totalWithVat: totalPrice + vatAmount };
};

const patch = (rows: ItemRow[], key: string, changes: Partial<ItemRow>): ItemRow[] =>
    rows.map((r) => (r.key === key ? compute({ ...r, ...changes }) : r));

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ExpressDispatchModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [toPlantId, setToPlantId] = useState<string | undefined>();
    const [globalNote, setGlobalNote] = useState('');
    const [rows, setRows] = useState<ItemRow[]>([EMPTY_ROW()]);
    const [submitted, setSubmitted] = useState(false);

    const MAIN_PLANT_ID = import.meta.env.VITE_MAIN_PLANT_ID as string;

    const { data: plantsRes } = useQuery({
        queryKey: ['plants-for-dispatch'],
        queryFn: () => plantService.getAll({}),
        enabled: open,
    });

    const { data: suppliersRes } = useQuery({
        queryKey: ['suppliers-for-dispatch'],
        queryFn: () => supplierService.getAll({ limit: 1000 }),
        enabled: open,
    });

    const plants = Array.isArray(plantsRes) ? plantsRes : (plantsRes as any)?.data ?? [];
    const receiverPlants = plants.filter((p: any) => p.id !== MAIN_PLANT_ID);
    
    const suppliers = Array.isArray(suppliersRes) 
        ? suppliersRes 
        : (suppliersRes as any)?.data ?? [];

    const grandTotal = rows.reduce((s, r) => s + r.totalPrice, 0);
    const grandVat = rows.reduce((s, r) => s + r.vatAmount, 0);
    const grandWithVat = rows.reduce((s, r) => s + r.totalWithVat, 0);

    const mutation = useMutation({
        mutationFn: (data: ExpressDispatchPayload) => expressDispatchService.create(data),
        onSuccess: (res) => {
            message.success(
                <span>
                    Xuất thẳng thành công!&nbsp;
                    <Text strong className='text-blue-600'>{res.orderCode}</Text>
                    &nbsp;→&nbsp;
                    <Text strong className='text-green-600'>{res.distributionCode}</Text>
                </span>
            );
            queryClient.invalidateQueries({ queryKey: ['distributions'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            handleClose();
            onSuccess();
        },
        onError: (e: any) => message.error(e?.message ?? 'Xuất thẳng thất bại'),
    });

    const handleClose = () => {
        setRows([EMPTY_ROW()]);
        setToPlantId(undefined);
        setGlobalNote('');
        setSubmitted(false);
        onClose();
    };

    useEffect(() => {
        if (!open) { 
            setRows([EMPTY_ROW()]); 
            setToPlantId(undefined); 
            setGlobalNote(''); 
            setSubmitted(false);
        }
    }, [open]);

    const handleSubmit = async () => {
        setSubmitted(true);
        const invalid = rows.find((r) => {
            if (!r.materialName.trim() || !r.unit.trim() || r.quantity < 1 || r.unitPrice < 0) return true;
            if (!r.supplierId && !r.quickSupplier) return true;
            if (r.quickSupplier) {
                if (!r.quickSupplier.name?.trim()) return true;
                if (r.quickSupplier.phone && !/^[0-9]{10,11}$/.test(r.quickSupplier.phone)) return true;
            }
            return false;
        });
        
        if (invalid) { 
            message.warning('Vui lòng điền đầy đủ và đúng định dạng cho tất cả các dòng'); 
            return; 
        }
        if (!toPlantId) { message.warning('Vui lòng chọn cơ sở nhận'); return; }

        const payload: ExpressDispatchPayload = {
            items: rows.map(({ key, totalPrice, vatAmount, totalWithVat, showQuickSupplier, ...item }) => ({
                ...item,
                quickSupplier: item.quickSupplier ? {
                    name: item.quickSupplier.name,
                    phone: item.quickSupplier.phone || undefined,
                    address: item.quickSupplier.address || undefined,
                } : undefined,
            })),
            toPlantId,
            note: globalNote.trim() || undefined,
        };
        mutation.mutate(payload);
    };

    const columns: TableColumnsType<ItemRow> = [
        {
            title: 'Tên vật tư',
            dataIndex: 'materialName',
            width: 180,
            render: (v, r) => (
                <Input
                    size='small' value={v} placeholder='Aptomat 40A...'
                    onChange={(e) => setRows((prev) => patch(prev, r.key, { materialName: e.target.value }))}
                    status={submitted && !v.trim() ? 'error' : undefined}
                />
            ),
        },
        {
            title: 'ĐVT',
            dataIndex: 'unit',
            width: 80,
            render: (v, r) => (
                <Input
                    size='small' value={v} placeholder='cái'
                    onChange={(e) => setRows((prev) => patch(prev, r.key, { unit: e.target.value }))}
                    status={submitted && !v.trim() ? 'error' : undefined}
                />
            ),
        },
        {
            title: 'SL',
            dataIndex: 'quantity',
            width: 80,
            render: (v, r) => (
                <InputNumber
                    size='small' min={1} value={v} className='w-full'
                    onChange={(val) => setRows((prev) => patch(prev, r.key, { quantity: Number(val ?? 1) }))}
                />
            ),
        },
        {
            title: 'Đơn giá',
            dataIndex: 'unitPrice',
            width: 120,
            render: (v, r) => (
                <InputNumber
                    size='small' min={0} value={v} className='w-full'
                    formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(val) => Number(val?.replace(/,/g, '') ?? 0) as any}
                    onChange={(val) => setRows((prev) => patch(prev, r.key, { unitPrice: Number(val ?? 0) }))}
                />
            ),
        },
        {
            title: 'VAT%',
            dataIndex: 'vatRate',
            width: 70,
            render: (v, r) => (
                <InputNumber
                    size='small' min={0} max={100} value={v} className='w-full'
                    onChange={(val) => setRows((prev) => patch(prev, r.key, { vatRate: Number(val ?? 0) }))}
                />
            ),
        },
        {
            title: 'Thành tiền',
            dataIndex: 'totalWithVat',
            width: 110,
            align: 'right',
            render: (v) => <Text className='text-sm font-medium text-slate-700'>{fmtVND(v)}</Text>,
        },
        {
            title: 'NCC',
            dataIndex: 'supplierId',
            width: 200,
            render: (v, r) => (
                <div>
                    {!r.showQuickSupplier ? (
                        <div className='flex gap-1'>
                            <Select
                                size='small' className='flex-1' placeholder='Chọn NCC'
                                value={v || undefined}
                                onChange={(val) => setRows((prev) => patch(prev, r.key, { supplierId: val, quickSupplier: undefined }))}
                                options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                                showSearch
                                filterOption={(input, opt) =>
                                    String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                status={submitted && !v && !r.quickSupplier ? 'error' : undefined}
                            />
                            <Tooltip title='Tạo NCC mới'>
                                <Button
                                    size='small'
                                    icon={<ShopOutlined />}
                                    onClick={() => setRows((prev) => patch(prev, r.key, { showQuickSupplier: true, supplierId: undefined }))}
                                />
                            </Tooltip>
                        </div>
                    ) : (
                        <div className='space-y-1'>
                            <Input
                                size='small'
                                placeholder='Tên NCC *'
                                value={r.quickSupplier?.name || ''}
                                onChange={(e) => setRows((prev) => patch(prev, r.key, { 
                                    quickSupplier: { ...r.quickSupplier, name: e.target.value } as QuickSupplier 
                                }))}
                                status={submitted && !r.quickSupplier?.name?.trim() ? 'error' : undefined}
                            />
                            <div className='flex gap-1'>
                                <Input
                                    size='small'
                                    placeholder='SĐT (10-11 số)'
                                    value={r.quickSupplier?.phone || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setRows((prev) => patch(prev, r.key, { 
                                            quickSupplier: { ...r.quickSupplier, phone: val } as QuickSupplier 
                                        }));
                                    }}
                                    maxLength={11}
                                    status={submitted && r.quickSupplier?.phone && !/^[0-9]{10,11}$/.test(r.quickSupplier.phone) ? 'error' : undefined}
                                />
                                <Tooltip title='Chọn từ danh sách'>
                                    <Button
                                        size='small'
                                        icon={<ShopOutlined />}
                                        onClick={() => setRows((prev) => patch(prev, r.key, { showQuickSupplier: false, quickSupplier: undefined }))}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '',
            width: 36,
            render: (_, r) => (
                <Tooltip title='Xóa dòng'>
                    <Button
                        size='small' type='text' danger icon={<DeleteOutlined />}
                        disabled={rows.length === 1}
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    />
                </Tooltip>
            ),
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={
                <Space>
                    <ThunderboltOutlined className='text-orange-500' />
                    <span>Xuất thẳng khẩn cấp</span>
                    <Tag color='orange' className='ml-1 font-normal'>Fast-track</Tag>
                </Space>
            }
            width={1000}
            footer={
                <div className='flex items-center justify-between'>
                    <Text className='text-sm text-slate-500'>
                        Tạo <Text strong>PO + Phiếu cấp phát</Text> trong 1 thao tác
                    </Text>
                    <Space>
                        <Button onClick={handleClose} disabled={mutation.isPending}>Hủy</Button>
                        <Button
                            type='primary' icon={<ThunderboltOutlined />}
                            loading={mutation.isPending} onClick={handleSubmit}
                            className='bg-orange-500 hover:!bg-orange-600 border-orange-500 hover:!border-orange-600'
                        >
                            Xác nhận xuất thẳng
                        </Button>
                    </Space>
                </div>
            }
            destroyOnClose
        >
            <div className='mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700'>
                <ThunderboltOutlined className='mr-2' />
                Dành cho trường hợp <strong>mua và xuất ngay</strong> không qua quy trình duyệt.
                Hệ thống tự ghi nhận lịch sử nhập/xuất kho để phục vụ thống kê cuối tháng.
            </div>

            <Row gutter={16} className='mb-3'>
                <Col span={10}>
                    <div className='mb-1 text-sm font-medium text-slate-700'>
                        Cơ sở nhận <span className='text-red-500'>*</span>
                    </div>
                    <Select
                        className='w-full' placeholder='Chọn cơ sở nhận hàng'
                        value={toPlantId} onChange={setToPlantId}
                        options={receiverPlants.map((p: any) => ({ value: p.id, label: p.name }))}
                        showSearch
                        filterOption={(input, opt) =>
                            String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        status={submitted && !toPlantId ? 'error' : undefined}
                    />
                </Col>
                <Col span={14}>
                    <div className='mb-1 text-sm font-medium text-slate-700'>Ghi chú / Lý do khẩn cấp</div>
                    <Input
                        value={globalNote} onChange={(e) => setGlobalNote(e.target.value)}
                        placeholder='VD: Alo khẩn từ anh Hùng - Yên Bái cần gấp...'
                    />
                </Col>
            </Row>

            <div className='overflow-hidden rounded-lg border border-slate-200'>
                <Table<ItemRow>
                    rowKey='key'
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                    size='small'
                    scroll={{ x: 900 }}
                    className='[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-xs [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-slate-500'
                />
            </div>

            <Button
                type='dashed' icon={<PlusOutlined />} className='mt-2 w-full'
                onClick={() => setRows((prev) => [...prev, EMPTY_ROW()])}
            >
                Thêm vật tư
            </Button>

            {grandWithVat > 0 && (
                <>
                    <Divider className='my-3' />
                    <div className='rounded-lg bg-slate-50 px-4 py-3'>
                        <div className='flex justify-between text-sm text-slate-600'>
                            <span>Tổng thành tiền ({rows.length} vật tư)</span>
                            <span>{fmtVND(grandTotal)}</span>
                        </div>
                        <div className='flex justify-between text-sm text-slate-600'>
                            <span>Tổng VAT</span>
                            <span>{fmtVND(grandVat)}</span>
                        </div>
                        <Divider className='my-2' />
                        <div className='flex justify-between font-semibold text-slate-800'>
                            <span>Tổng cộng</span>
                            <span className='text-base text-orange-600'>{fmtVND(grandWithVat)}</span>
                        </div>
                    </div>
                </>
            )}
        </Modal>
    );
};

export default ExpressDispatchModal;
