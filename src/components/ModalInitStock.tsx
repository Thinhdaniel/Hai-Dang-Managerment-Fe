import React, { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Typography, App } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryService, materialService, type Material } from '../core/services/material.service';

const { Text } = Typography;

interface InitStockItem {
    key: string;
    materialId?: string;
    material?: Material;
    currentSystemStock: number;
    actualStock?: number;
    note?: string;
}

interface Props {
    open: boolean;
    plantId: string;
    onClose: () => void;
}

const ModalInitStock: React.FC<Props> = ({ open, plantId, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [reason, setReason] = useState('');
    const [items, setItems] = useState<InitStockItem[]>([{ key: 'initial-row', currentSystemStock: 0 }]);

    const { data: materialsData } = useQuery({
        queryKey: ['materials', 'all-for-init'],
        queryFn: () => materialService.getAll({ limit: 500 }),
        enabled: open,
    });

    const materials: Material[] = Array.isArray(materialsData) ? materialsData : ((materialsData as any)?.data ?? []);

    const { mutateAsync: doInitialize, isPending } = useMutation({
        mutationFn: inventoryService.initialize,
        onSuccess: (result: any) => {
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            const { success, failed } = result;
            if (failed > 0) {
                message.warning(`Đã nhập ${success} vật tư, ${failed} lỗi`);
            } else {
                message.success(`Đã nhập tồn kho cho ${success} vật tư thành công`);
            }
            handleClose();
        },
        onError: (err: any) => {
            message.error(err?.message || 'Không thể nhập tồn kho');
        },
    });

    const handleClose = () => {
        setReason('');
        setItems([{ key: Date.now().toString(), currentSystemStock: 0 }]);
        onClose();
    };

    const addRow = () => {
        setItems((prev) => [...prev, { key: Date.now().toString(), currentSystemStock: 0 }]);
    };

    const removeRow = (key: string) => {
        setItems((prev) => prev.filter((i) => i.key !== key));
    };

    const updateRow = (key: string, patch: Partial<InitStockItem>) => {
        setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    };

    const handleMaterialSelect = (key: string, materialId: string) => {
        const mat = materials.find((m) => m.id === materialId);
        updateRow(key, { materialId, material: mat, currentSystemStock: 0 });
    };

    const handleSubmit = async () => {
        if (!reason.trim()) {
            message.error('Vui lòng nhập lý do');
            return;
        }
        const validItems = items.filter((i) => i.materialId && i.actualStock !== undefined && i.actualStock >= 0);
        if (validItems.length === 0) {
            message.error('Vui lòng thêm ít nhất 1 vật tư với số lượng hợp lệ');
            return;
        }
        await doInitialize({
            plantId,
            reason: reason.trim(),
            items: validItems.map((i) => ({
                materialId: i.materialId!,
                currentStock: i.actualStock!,
                note: i.note,
            })),
        });
    };

    const selectedMaterialIds = items.map((i) => i.materialId).filter(Boolean);

    const columns = [
        {
            title: 'Vật tư',
            key: 'material',
            width: 220,
            render: (_: any, record: InitStockItem) => (
                <Select
                    showSearch
                    placeholder='Chọn vật tư...'
                    value={record.materialId}
                    style={{ width: '100%' }}
                    filterOption={(input, option) =>
                        String(option?.label ?? '')
                            .toLowerCase()
                            .includes(input.toLowerCase())
                    }
                    options={materials
                        .filter(
                            (m) => m.isActive && (!selectedMaterialIds.includes(m.id) || m.id === record.materialId)
                        )
                        .map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))}
                    onChange={(val) => handleMaterialSelect(record.key, val)}
                />
            ),
        },
        {
            title: 'ĐVT',
            key: 'unit',
            width: 80,
            render: (_: any, record: InitStockItem) => <Text type='secondary'>{record.material?.unit || '-'}</Text>,
        },
        {
            title: 'Tồn hệ thống',
            key: 'systemStock',
            width: 110,
            render: (_: any, record: InitStockItem) => (
                <Text type='secondary'>{record.currentSystemStock.toLocaleString('vi-VN')}</Text>
            ),
        },
        {
            title: 'Số lượng thực tế*',
            key: 'actualStock',
            width: 130,
            render: (_: any, record: InitStockItem) => (
                <InputNumber
                    min={0}
                    value={record.actualStock}
                    style={{ width: '100%' }}
                    onChange={(val) => updateRow(record.key, { actualStock: val ?? undefined })}
                />
            ),
        },
        {
            title: 'Chênh lệch',
            key: 'diff',
            width: 90,
            render: (_: any, record: InitStockItem) => {
                if (record.actualStock === undefined) return <Text type='secondary'>-</Text>;
                const diff = record.actualStock - record.currentSystemStock;
                if (diff === 0) return <Text type='secondary'>0</Text>;
                return (
                    <Text style={{ color: diff > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {diff > 0 ? `+${diff}` : diff}
                    </Text>
                );
            },
        },
        {
            title: 'Ghi chú',
            key: 'note',
            render: (_: any, record: InitStockItem) => (
                <Input
                    placeholder='Ghi chú...'
                    value={record.note}
                    onChange={(e) => updateRow(record.key, { note: e.target.value })}
                />
            ),
        },
        {
            title: '',
            key: 'action',
            width: 40,
            render: (_: any, record: InitStockItem) => (
                <Button
                    type='text'
                    danger
                    icon={<DeleteOutlined />}
                    disabled={items.length === 1}
                    onClick={() => removeRow(record.key)}
                />
            ),
        },
    ];

    const validCount = items.filter((i) => i.materialId && i.actualStock !== undefined && i.actualStock >= 0).length;

    return (
        <Modal
            open={open}
            title='Nhập tồn kho ban đầu — CS1'
            width={900}
            onCancel={handleClose}
            footer={
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text type='secondary'>Tổng số loại vật tư: {validCount}</Text>
                    <Space>
                        <Button onClick={handleClose}>Huỷ</Button>
                        <Button type='primary' loading={isPending} onClick={handleSubmit}>
                            Xác nhận nhập kho
                        </Button>
                    </Space>
                </Space>
            }
            destroyOnClose
        >
            <Alert
                type='info'
                showIcon
                title='Chức năng này dùng để nhập số liệu tồn kho thực tế vào hệ thống. Chỉ dùng khi khởi tạo hoặc sau kiểm kê.'
                style={{ marginBottom: 16 }}
            />

            <Form.Item label='Lý do nhập' required style={{ marginBottom: 16 }}>
                <Input
                    placeholder='VD: Nhập tồn kho ban đầu tháng 01/2026'
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </Form.Item>

            <Table
                dataSource={items}
                columns={columns}
                rowKey='key'
                pagination={false}
                size='small'
                scroll={{ x: 700 }}
            />

            <Button type='dashed' icon={<PlusOutlined />} style={{ marginTop: 8, width: '100%' }} onClick={addRow}>
                Thêm vật tư
            </Button>
        </Modal>
    );
};

export default ModalInitStock;
