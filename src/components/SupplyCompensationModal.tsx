import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { distributionService, materialService, type SupplyShortage } from '../core/services/material.service';

const { Text } = Typography;
const fmt = (value?: number) => (value ?? 0).toLocaleString('vi-VN');
const EMPTY_MATERIALS: any[] = [];

type Row = {
    key: string;
    shortageId: string;
    materialName: string;
    srCode?: string;
    unit?: string;
    outstanding: number;
    materialId?: string;
    suggested?: boolean;
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
    title?: string;
};

const getStock = (material?: any) =>
    material && typeof material.cs1CurrentStock === 'number' ? material.cs1CurrentStock : null;

// Chuẩn hoá tên (bỏ dấu, thường hoá) để gợi ý vật tư kho khớp tên vật tư còn thiếu.
const normalizeName = (value?: string) =>
    (value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

const suggestMaterialByName = (materials: any[], name: string): any | undefined => {
    const target = normalizeName(name);
    if (!target) return undefined;
    // 1) Khớp tuyệt đối
    let match = materials.find((m) => normalizeName(m.name) === target);
    if (match) return match;
    // 2) Chứa nhau (tên kho chứa tên thiếu hoặc ngược lại)
    match = materials.find((m) => {
        const n = normalizeName(m.name);
        return n && (n.includes(target) || target.includes(n));
    });
    if (match) return match;
    // 3) Đủ tất cả từ khoá (>1 ký tự) của tên thiếu
    const tokens = target.split(' ').filter((token) => token.length > 1);
    if (tokens.length) {
        match = materials.find((m) => {
            const n = normalizeName(m.name);
            return tokens.every((token) => n.includes(token));
        });
    }
    return match;
};

const lineTotal = (row: Row) => {
    const total = Number((row.quantity * row.unitPrice).toFixed(2));
    return Number((total * (1 + (row.vatRate || 0) / 100)).toFixed(2));
};

const SupplyCompensationModal: React.FC<Props> = ({ open, shortages, onClose, onSuccess, title }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [distributedAt, setDistributedAt] = useState<Dayjs>(dayjs());
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const didInit = useRef(false);

    const { data: materialsRaw } = useQuery({
        queryKey: ['materials', 'with-stock-cs1'],
        queryFn: () =>
            materialService
                .getAll({ includeStock: true, limit: 1000, isActive: true } as any)
                .then((res: any) => (Array.isArray(res) ? res : (res.data ?? []))),
        enabled: open,
        staleTime: 60_000,
    });
    const materials = useMemo(() => (materialsRaw as any[] | undefined) ?? EMPTY_MATERIALS, [materialsRaw]);

    // Khởi tạo một lần khi mở modal — không reset chỉnh sửa của user khi materials refetch.
    useEffect(() => {
        if (!open) {
            didInit.current = false;
            return;
        }
        if (didInit.current) return;
        // Chờ danh sách vật tư load xong để gợi ý đúng (materialsRaw === undefined nghĩa là query chưa xong).
        if (materialsRaw === undefined) return;
        didInit.current = true;
        setNote('');
        setDistributedAt(dayjs());

        const built = shortages.map((shortage) => {
            const linked = shortage.materialId
                ? materials.find((item: any) => item.id === shortage.materialId)
                : undefined;
            // Chưa link sẵn → tự gợi ý vật tư kho theo tên.
            const suggestion = linked ?? suggestMaterialByName(materials, shortage.materialName);
            const materialId = shortage.materialId ?? suggestion?.id;
            const stock = getStock(suggestion);
            return {
                key: shortage.id,
                shortageId: shortage.id,
                materialName: shortage.materialName,
                srCode: shortage.originalSupplyRequestCode,
                unit: shortage.unit ?? suggestion?.unit,
                outstanding: shortage.quantityOutstanding,
                materialId,
                suggested: !shortage.materialId && Boolean(suggestion),
                quantity:
                    typeof stock === 'number'
                        ? Math.min(shortage.quantityOutstanding, Math.max(0, stock))
                        : shortage.quantityOutstanding,
                unitPrice: 0,
                vatRate: 8,
                note: '',
            } as Row;
        });
        setRows(built);
        // Mặc định tick các dòng cấp được ngay (đã có vật tư kho + còn tồn).
        setSelectedKeys(
            built
                .filter((row) => {
                    if (!row.materialId) return false;
                    const stock = getStock(materials.find((item: any) => item.id === row.materialId));
                    return typeof stock === 'number' && stock > 0 && row.quantity > 0;
                })
                .map((row) => row.key)
        );
    }, [open, shortages, materials, materialsRaw]);

    const createMutation = useMutation({
        mutationFn: (activeRows: Row[]) =>
            distributionService.createCompensation({
                shortageIds: Array.from(new Set(activeRows.map((row) => row.shortageId))),
                distributedAt: distributedAt.toISOString(),
                note: note.trim() || undefined,
                items: activeRows.map((row) => ({
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

    const totals = useMemo(() => {
        let quantity = 0;
        let amount = 0;
        let remaining = 0;
        rows.forEach((row) => {
            const picked = selectedKeys.includes(row.key);
            const qty = picked ? row.quantity : 0;
            quantity += qty;
            amount += picked ? lineTotal(row) : 0;
            remaining += Math.max(0, row.outstanding - qty);
        });
        return { quantity, amount, remaining };
    }, [rows, selectedKeys]);

    const materialOptions = useMemo(
        () =>
            materials.map((material: any) => ({
                value: material.id,
                label: `${material.code ? `[${material.code}] ` : ''}${material.name}`,
                stock: getStock(material),
                unit: material.unit,
            })),
        [materials]
    );

    const patch = (key: string, changes: Partial<Row>) =>
        setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));

    const liveStock = (row: Row) => getStock(materials.find((item: any) => item.id === row.materialId));

    // Gộp nhiều đề xuất gốc (cấp bù theo cơ sở) → hiển thị cột "Đề xuất gốc" để phân biệt nguồn.
    const multiSR = useMemo(() => new Set(rows.map((row) => row.srCode).filter(Boolean)).size > 1, [rows]);

    const handleSubmit = () => {
        // Cấp bù một phần: chỉ những dòng được tick mới vào phiếu + bị kiểm tra.
        const activeRows = rows.filter((row) => selectedKeys.includes(row.key));
        if (activeRows.length === 0) {
            message.error('Chọn ít nhất 1 vật tư để cấp bù');
            return;
        }
        for (const row of activeRows) {
            const stock = liveStock(row);
            if (!row.materialId) {
                message.error(`Dòng "${row.materialName}": chưa chọn vật tư kho`);
                return;
            }
            if (row.quantity <= 0) {
                message.error(`Dòng "${row.materialName}": nhập SL cấp bù lớn hơn 0`);
                return;
            }
            if (typeof stock === 'number' && row.quantity > stock) {
                message.error(`Dòng "${row.materialName}": SL cấp bù vượt tồn kho CS1 (còn ${fmt(stock)})`);
                return;
            }
            // Cấp vượt số còn thiếu (cấp thêm) được phép nhưng bắt buộc ghi chú lý do.
            if (row.quantity > row.outstanding && !(row.note ?? '').trim()) {
                message.error(
                    `Dòng "${row.materialName}": cấp vượt số còn thiếu (${fmt(row.outstanding)}), cần nhập ghi chú lý do`
                );
                return;
            }
        }
        createMutation.mutate(activeRows);
    };

    const columns: TableColumnsType<Row> = [
        {
            title: 'Vật tư còn thiếu',
            dataIndex: 'materialName',
            key: 'materialName',
            width: 200,
            fixed: 'left',
            render: (value) => <span className='font-semibold text-slate-800'>{value}</span>,
        },
        ...(multiSR
            ? [
                  {
                      title: 'Đề xuất gốc',
                      dataIndex: 'srCode',
                      key: 'srCode',
                      width: 130,
                      render: (value: string) =>
                          value ? (
                              <Tag color='blue' className='!m-0 font-mono text-[11px]'>
                                  {value}
                              </Tag>
                          ) : (
                              <span className='text-slate-400'>-</span>
                          ),
                  } as TableColumnsType<Row>[number],
              ]
            : []),
        { title: 'ĐVT', dataIndex: 'unit', key: 'unit', width: 64, align: 'center' },
        {
            title: 'Còn thiếu',
            dataIndex: 'outstanding',
            key: 'outstanding',
            width: 88,
            align: 'right',
            render: (value) => <span className='font-semibold text-orange-600'>{fmt(value)}</span>,
        },
        {
            title: 'Vật tư kho',
            key: 'materialId',
            width: 260,
            render: (_value, row) => (
                <div className='flex flex-col gap-0.5'>
                    <Select
                        showSearch
                        optionFilterProp='label'
                        placeholder='Chọn vật tư kho'
                        value={row.materialId}
                        options={materialOptions}
                        style={{ width: '100%' }}
                        status={!row.materialId ? 'warning' : undefined}
                        optionRender={(option) => {
                            const stock = (option.data as any).stock;
                            return (
                                <div className='flex items-center justify-between gap-2'>
                                    <span className='truncate text-xs'>{option.label}</span>
                                    <Tag color={stock > 0 ? 'success' : 'warning'} className='!m-0 !text-[10px]'>
                                        {stock === null ? 'Chưa có tồn' : `Tồn ${fmt(stock)}`}
                                    </Tag>
                                </div>
                            );
                        }}
                        onChange={(value) => {
                            const material = materials.find((item: any) => item.id === value);
                            patch(row.key, { materialId: value, unit: material?.unit ?? row.unit, suggested: false });
                        }}
                    />
                    {row.suggested && row.materialId && (
                        <span className='text-[10px] text-blue-500'>Gợi ý tự động · kiểm tra lại</span>
                    )}
                </div>
            ),
        },
        {
            title: 'Tồn CS1',
            key: 'stock',
            width: 88,
            align: 'right',
            render: (_value, row) => {
                const stock = liveStock(row);
                if (stock === null) return <span className='text-slate-400'>-</span>;
                const enough = stock >= row.outstanding;
                return <span className={enough ? 'text-emerald-600' : 'text-orange-500'}>{fmt(stock)}</span>;
            },
        },
        {
            title: 'SL cấp bù',
            key: 'quantity',
            width: 104,
            align: 'right',
            render: (_value, row) => {
                const stock = liveStock(row);
                // Cho phép cấp vượt số còn thiếu (cấp thêm), chỉ chặn vượt tồn kho CS1.
                const max = typeof stock === 'number' ? stock : undefined;
                return (
                    <InputNumber
                        min={0}
                        max={max}
                        controls={false}
                        value={row.quantity}
                        status={row.quantity > row.outstanding ? 'warning' : undefined}
                        style={{ width: '100%' }}
                        onChange={(value) => patch(row.key, { quantity: Number(value ?? 0) })}
                    />
                );
            },
        },
        {
            title: 'Đơn giá',
            key: 'unitPrice',
            width: 118,
            align: 'right',
            render: (_value, row) => (
                <InputNumber
                    min={0}
                    controls={false}
                    value={row.unitPrice}
                    style={{ width: '100%' }}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => Number(String(value).replace(/,/g, '')) as any}
                    onChange={(value) => patch(row.key, { unitPrice: Number(value ?? 0) })}
                />
            ),
        },
        {
            title: 'VAT',
            key: 'vatRate',
            width: 76,
            align: 'right',
            render: (_value, row) => (
                <InputNumber
                    min={0}
                    max={100}
                    controls={false}
                    value={row.vatRate}
                    style={{ width: '100%' }}
                    formatter={(value) => `${value}%`}
                    parser={(value) => Number(String(value).replace('%', '')) as any}
                    onChange={(value) => patch(row.key, { vatRate: Number(value ?? 0) })}
                />
            ),
        },
        {
            title: 'Thành tiền',
            key: 'total',
            width: 118,
            align: 'right',
            render: (_value, row) => (
                <span className='font-semibold text-slate-900'>{row.quantity ? fmt(lineTotal(row)) : '-'}</span>
            ),
        },
        {
            title: 'Ghi chú',
            key: 'note',
            width: 180,
            render: (_value, row) => (
                <Input
                    value={row.note}
                    placeholder='Ghi chú cấp bù'
                    onChange={(event) => patch(row.key, { note: event.target.value })}
                />
            ),
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width='min(96vw, 1080px)'
            centered
            title={title ?? 'Tạo phiếu cấp bù'}
            footer={
                <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <Space size={16} wrap>
                        <Text type='secondary'>
                            Đã chọn:{' '}
                            <strong className='text-slate-800'>
                                {selectedKeys.length}/{rows.length}
                            </strong>{' '}
                            vật tư
                        </Text>
                        <Text type='secondary'>
                            SL cấp bù: <strong>{fmt(totals.quantity)}</strong>
                        </Text>
                        <Text type='secondary'>
                            Thành tiền: <strong className='text-slate-800'>{fmt(totals.amount)}</strong>
                        </Text>
                        <Text type='secondary'>
                            Còn lại sau phiếu này:{' '}
                            <strong className={totals.remaining ? 'text-orange-600' : 'text-emerald-600'}>
                                {fmt(totals.remaining)}
                            </strong>
                        </Text>
                    </Space>
                    <Space>
                        <Button onClick={onClose}>Hủy</Button>
                        <Button
                            type='primary'
                            icon={<SendOutlined />}
                            loading={createMutation.isPending}
                            onClick={handleSubmit}
                        >
                            Tạo phiếu cấp bù
                        </Button>
                    </Space>
                </div>
            }
            destroyOnHidden
        >
            <div className='mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                <DatePicker
                    className='w-full'
                    value={distributedAt}
                    format='DD/MM/YYYY'
                    onChange={(value) => value && setDistributedAt(value)}
                />
                <Input
                    className='sm:col-span-2'
                    value={note}
                    placeholder='Ghi chú phiếu cấp bù'
                    onChange={(event) => setNote(event.target.value)}
                />
            </div>
            <Tooltip title='Đơn giá để 0 nếu chưa có giá; nên nhập để báo cáo giá trị cấp phát đúng.'>
                <Text type='secondary' className='mb-2 block text-xs'>
                    Tích chọn các vật tư muốn cấp bù trong phiếu này (không cần cấp đủ tất cả). Vật tư kho được gợi ý tự
                    động theo tên — kiểm tra lại trước khi tạo. Có thể cấp vượt số còn thiếu (cấp thêm — bắt buộc ghi
                    chú lý do); SL bị giới hạn theo tồn kho CS1.
                </Text>
            </Tooltip>
            <Table<Row>
                rowKey='key'
                columns={columns}
                dataSource={rows}
                pagination={false}
                size='small'
                scroll={{ x: multiSR ? 1310 : 1180 }}
                rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys) => setSelectedKeys(keys as string[]),
                    columnWidth: 44,
                    fixed: true,
                }}
                rowClassName={(row) => (selectedKeys.includes(row.key) ? '' : 'opacity-50')}
            />
        </Modal>
    );
};

export default SupplyCompensationModal;
