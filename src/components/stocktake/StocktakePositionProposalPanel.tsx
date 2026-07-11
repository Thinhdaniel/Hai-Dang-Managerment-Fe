import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Progress, Table, Tag, type TableColumnsType } from 'antd';
import { CheckOutlined, CloseOutlined, EnvironmentOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { StocktakePositionProposal, StocktakePositionProposalStatus } from '../../core/types';

type Props = {
    proposals: StocktakePositionProposal[];
    canReview: boolean;
    loading?: boolean;
    onReview: (action: 'approve' | 'reject', assetIds: string[]) => void;
};

const STATUS_META: Record<StocktakePositionProposalStatus, { label: string; color: string; className: string }> = {
    pending: { label: 'Chờ duyệt', color: 'gold', className: 'text-amber-700' },
    approved: { label: 'Đã áp dụng', color: 'green', className: 'text-emerald-700' },
    rejected: { label: 'Đã từ chối', color: 'default', className: 'text-slate-500' },
    conflict: { label: 'Có xung đột', color: 'red', className: 'text-red-600' },
};

const coordinate = (x?: number, y?: number) =>
    typeof x === 'number' && typeof y === 'number' ? `${x.toFixed(1)} · ${y.toFixed(1)}` : 'Chưa xếp';

const StocktakePositionProposalPanel: React.FC<Props> = ({ proposals, canReview, loading, onReview }) => {
    const reviewableIds = useMemo(
        () =>
            proposals
                .filter((item) => ['pending', 'conflict'].includes(item.status ?? 'pending'))
                .map((item) => item.assetId),
        [proposals]
    );
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selectedHasConflict = proposals.some(
        (item) => selectedIds.includes(item.assetId) && item.status === 'conflict'
    );

    useEffect(() => {
        setSelectedIds((current) => current.filter((id) => reviewableIds.includes(id)));
    }, [reviewableIds]);

    const toggle = (assetId: string, checked: boolean) =>
        setSelectedIds((current) =>
            checked ? Array.from(new Set([...current, assetId])) : current.filter((id) => id !== assetId)
        );

    const columns: TableColumnsType<StocktakePositionProposal> = [
        {
            title: 'Máy',
            key: 'asset',
            width: 190,
            render: (_, item) => (
                <div>
                    <div className='font-semibold text-slate-900'>{item.machineCode || '-'}</div>
                    <div className='truncate text-xs text-slate-500'>{item.name || 'Chưa có tên'}</div>
                </div>
            ),
        },
        { title: 'Vùng quan sát', dataIndex: 'zoneName', width: 150 },
        {
            title: 'Tọa độ cũ',
            key: 'current',
            width: 110,
            render: (_, item) => <span className='font-mono text-xs'>{coordinate(item.currentX, item.currentY)}</span>,
        },
        {
            title: 'Đề xuất',
            key: 'proposed',
            width: 105,
            render: (_, item) => (
                <span className='font-mono text-xs font-bold text-cyan-700'>
                    {coordinate(item.proposedX, item.proposedY)}
                </span>
            ),
        },
        {
            title: 'Tin cậy',
            key: 'confidence',
            width: 105,
            render: (_, item) => <Progress percent={Math.round(item.confidence * 100)} size='small' showInfo={false} />,
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 125,
            render: (_, item) => {
                const status = item.status ?? 'pending';
                return (
                    <div>
                        <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
                        {item.conflictReason ? (
                            <div className='mt-1 text-[11px] leading-4 text-red-600'>{item.conflictReason}</div>
                        ) : null}
                    </div>
                );
            },
        },
    ];

    if (!proposals.length) return null;

    return (
        <section className='border-t border-slate-200 pt-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <div className='flex items-center gap-2 text-base font-bold text-slate-900'>
                        <EnvironmentOutlined className='text-cyan-700' /> Đề xuất vị trí từ lộ trình quét
                    </div>
                    <div className='mt-1 text-xs leading-5 text-slate-500'>
                        Chỉ là tọa độ gợi ý từ thứ tự quét trong vùng đã hoàn tất. Hệ thống chưa thay đổi sơ đồ cho tới
                        khi được duyệt.
                    </div>
                </div>
                <Tag icon={<SafetyCertificateOutlined />} color='cyan' className='!m-0'>
                    {proposals.length} đề xuất
                </Tag>
            </div>

            {proposals.some((item) => item.status === 'conflict') ? (
                <Alert
                    className='mt-3'
                    type='warning'
                    showIcon
                    message='Có đề xuất không còn khớp dữ liệu hiện tại'
                    description='Kiểm tra máy trên sơ đồ trước khi xử lý tiếp. Hệ thống không tự ghi đè tọa độ đã thay đổi.'
                />
            ) : null}

            <div className='mt-3 hidden md:block'>
                <Table<StocktakePositionProposal>
                    size='small'
                    rowKey='assetId'
                    columns={columns}
                    dataSource={proposals}
                    pagination={false}
                    scroll={{ x: 820 }}
                    rowSelection={
                        canReview
                            ? {
                                  selectedRowKeys: selectedIds,
                                  onChange: (keys) => setSelectedIds(keys.map(String)),
                                  getCheckboxProps: (item) => ({
                                      disabled: !reviewableIds.includes(item.assetId),
                                  }),
                              }
                            : undefined
                    }
                />
            </div>

            <div className='mt-3 space-y-2 md:hidden'>
                {proposals.map((item) => {
                    const status = item.status ?? 'pending';
                    const selectable = canReview && reviewableIds.includes(item.assetId);
                    return (
                        <div key={item.assetId} className='rounded-xl border border-slate-200 bg-white p-3'>
                            <div className='flex items-start gap-3'>
                                {canReview ? (
                                    <Checkbox
                                        className='mt-0.5'
                                        checked={selectedIds.includes(item.assetId)}
                                        disabled={!selectable}
                                        onChange={(event) => toggle(item.assetId, event.target.checked)}
                                    />
                                ) : null}
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='min-w-0'>
                                            <div className='truncate font-bold text-slate-900'>
                                                {item.machineCode || '-'}
                                            </div>
                                            <div className='truncate text-xs text-slate-500'>
                                                {item.name || 'Chưa có tên'}
                                            </div>
                                        </div>
                                        <Tag color={STATUS_META[status].color} className='!m-0 shrink-0'>
                                            {STATUS_META[status].label}
                                        </Tag>
                                    </div>
                                    <div className='mt-3 grid grid-cols-3 gap-2 text-xs'>
                                        <div>
                                            <div className='text-slate-400'>Vùng</div>
                                            <div className='mt-0.5 truncate font-semibold'>{item.zoneName}</div>
                                        </div>
                                        <div>
                                            <div className='text-slate-400'>Tọa độ cũ</div>
                                            <div className='mt-0.5 font-mono'>
                                                {coordinate(item.currentX, item.currentY)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className='text-slate-400'>Đề xuất</div>
                                            <div className='mt-0.5 font-mono font-bold text-cyan-700'>
                                                {coordinate(item.proposedX, item.proposedY)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className='mt-2 flex items-center gap-2 text-[11px] text-slate-500'>
                                        <span>Tin cậy {Math.round(item.confidence * 100)}%</span>
                                        <Progress
                                            className='!m-0 flex-1'
                                            percent={Math.round(item.confidence * 100)}
                                            size='small'
                                            showInfo={false}
                                        />
                                    </div>
                                    {item.conflictReason ? (
                                        <div className='mt-2 text-xs leading-5 text-red-600'>{item.conflictReason}</div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {canReview && reviewableIds.length ? (
                <div className='sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur'>
                    <Checkbox
                        checked={selectedIds.length > 0 && selectedIds.length === reviewableIds.length}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < reviewableIds.length}
                        onChange={(event) => setSelectedIds(event.target.checked ? reviewableIds : [])}
                    >
                        Chọn {selectedIds.length}/{reviewableIds.length}
                    </Checkbox>
                    <div className='flex gap-2'>
                        <Button
                            icon={<CloseOutlined />}
                            disabled={!selectedIds.length}
                            loading={loading}
                            onClick={() => onReview('reject', selectedIds)}
                        >
                            Từ chối
                        </Button>
                        <Button
                            type='primary'
                            icon={<CheckOutlined />}
                            disabled={!selectedIds.length || selectedHasConflict}
                            loading={loading}
                            onClick={() => onReview('approve', selectedIds)}
                        >
                            Duyệt vị trí
                        </Button>
                    </div>
                </div>
            ) : canReview && !reviewableIds.length ? (
                <Empty
                    className='mt-3'
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description='Không còn đề xuất chờ xử lý'
                />
            ) : null}
        </section>
    );
};

export default StocktakePositionProposalPanel;
