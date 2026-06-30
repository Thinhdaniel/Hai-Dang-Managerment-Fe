import { useMemo, useState } from 'react';
import { App, Button, Checkbox, Drawer, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    materialService,
    MATERIAL_COST_TYPE_LABEL,
    MATERIAL_COST_TYPE_OPTIONS,
    type MaterialCostType,
    type MaterialCostTypeSuggestion,
} from '../../core/services/material.service';

type Row = MaterialCostTypeSuggestion & { chosen?: MaterialCostType };

const COST_TAG_COLOR: Record<MaterialCostType, string> = {
    consumable: 'blue',
    spare_part: 'gold',
    tool: 'purple',
    asset: 'red',
};

const MaterialCostTypeDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [onlyUnclassified, setOnlyUnclassified] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);

    const suggestMutation = useMutation({
        mutationFn: () => materialService.suggestCostTypes(onlyUnclassified),
        onSuccess: (res) => {
            setRows(res.items.map((it) => ({ ...it, chosen: it.suggestedCostType ?? it.currentCostType })));
            message.success(`AI đã gợi ý ${res.items.length} mục${res.model ? ` · ${res.model}` : ''}`);
        },
        onError: () => message.error('Không chạy được AI gợi ý. Thử lại sau.'),
    });

    const saveMutation = useMutation({
        mutationFn: () => materialService.saveCostTypes(rows.map((r) => ({ id: r.id, costType: r.chosen ?? null }))),
        onSuccess: (res) => {
            message.success(`Đã lưu phân loại ${res.updated} mục`);
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            onClose();
        },
        onError: () => message.error('Không lưu được phân loại.'),
    });

    const setChosen = (id: string, value?: MaterialCostType) =>
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, chosen: value } : r)));

    const applyAllSuggestions = () =>
        setRows((prev) => prev.map((r) => ({ ...r, chosen: r.suggestedCostType ?? r.chosen })));

    const stats = useMemo(() => {
        const chosen = rows.filter((r) => r.chosen).length;
        return { total: rows.length, chosen, pending: rows.length - chosen };
    }, [rows]);

    const columns: ColumnsType<Row> = [
        {
            title: 'Vật tư',
            dataIndex: 'name',
            key: 'name',
            render: (_, r) => (
                <div>
                    <div className='font-medium text-slate-800'>{r.name}</div>
                    <div className='text-xs text-slate-400'>{[r.code, r.category].filter(Boolean).join(' · ')}</div>
                </div>
            ),
        },
        {
            title: 'Hiện tại',
            key: 'current',
            width: 120,
            render: (_, r) =>
                r.currentCostType ? (
                    <Tag color={COST_TAG_COLOR[r.currentCostType]}>{MATERIAL_COST_TYPE_LABEL[r.currentCostType]}</Tag>
                ) : (
                    <span className='text-xs text-slate-400'>Chưa phân loại</span>
                ),
        },
        {
            title: 'AI gợi ý',
            key: 'suggested',
            width: 150,
            render: (_, r) =>
                r.suggestedCostType ? (
                    <span className='inline-flex items-center gap-1'>
                        <Tag color={COST_TAG_COLOR[r.suggestedCostType]}>
                            {MATERIAL_COST_TYPE_LABEL[r.suggestedCostType]}
                        </Tag>
                        {typeof r.confidence === 'number' ? (
                            <span className='text-[11px] text-slate-400'>{Math.round(r.confidence * 100)}%</span>
                        ) : null}
                    </span>
                ) : (
                    <span className='text-xs text-slate-300'>—</span>
                ),
        },
        {
            title: 'Chốt nhóm',
            key: 'chosen',
            width: 190,
            render: (_, r) => (
                <Select
                    allowClear
                    size='small'
                    style={{ width: '100%' }}
                    value={r.chosen}
                    placeholder='Chọn nhóm'
                    options={MATERIAL_COST_TYPE_OPTIONS}
                    onChange={(v) => setChosen(r.id, v as MaterialCostType | undefined)}
                />
            ),
        },
    ];

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={780}
            title='Phân loại chi phí vật tư (AI)'
            extra={
                <Button
                    type='primary'
                    icon={<SaveOutlined />}
                    loading={saveMutation.isPending}
                    disabled={!rows.length}
                    onClick={() => saveMutation.mutate()}
                >
                    Lưu phân loại
                </Button>
            }
        >
            <div className='mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-600'>
                AI đề xuất nhóm chi phí cho từng vật tư/máy: <b>Tiêu hao</b> & <b>Linh kiện</b> tính vào chi phí vận
                hành; <b>CCDC</b> & <b>Máy móc</b> tách sang mua sắm/đầu tư. Hãy rà lại cột "Chốt nhóm" rồi lưu.
            </div>
            <div className='mb-3 flex flex-wrap items-center gap-2'>
                <Checkbox checked={onlyUnclassified} onChange={(e) => setOnlyUnclassified(e.target.checked)}>
                    Chỉ mục chưa phân loại
                </Checkbox>
                <Button
                    type='primary'
                    ghost
                    icon={<ThunderboltOutlined />}
                    loading={suggestMutation.isPending}
                    onClick={() => suggestMutation.mutate()}
                >
                    Chạy AI gợi ý
                </Button>
                {rows.length ? <Button onClick={applyAllSuggestions}>Áp tất cả gợi ý</Button> : null}
                {rows.length ? (
                    <span className='text-xs text-slate-500'>
                        Đã chốt {stats.chosen}/{stats.total}
                        {stats.pending ? ` · còn ${stats.pending} chưa chọn` : ''}
                    </span>
                ) : null}
            </div>
            <Table
                rowKey='id'
                size='small'
                columns={columns}
                dataSource={rows}
                loading={suggestMutation.isPending}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                locale={{ emptyText: 'Bấm "Chạy AI gợi ý" để AI phân loại danh mục' }}
            />
        </Drawer>
    );
};

export default MaterialCostTypeDrawer;
