import React from 'react';
import { Alert, Button, Drawer, Empty, Popconfirm, Spin, Tag } from 'antd';
import { ClockCircleOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { FloorMapRevision } from '../../core/types';

type Props = {
    open: boolean;
    revisions: FloorMapRevision[];
    loading?: boolean;
    rollingBackId?: string | null;
    canRollback: boolean;
    onClose: () => void;
    onRollback: (revision: FloorMapRevision) => void;
};

const positionLabel = (position: { x: number; y: number } | null) =>
    position ? `${position.x.toFixed(1)} · ${position.y.toFixed(1)}` : 'Chưa xếp';

const statusMeta = {
    applied: { label: 'Đang áp dụng', color: 'cyan' },
    reverted: { label: 'Đã hoàn tác', color: 'default' },
    partial: { label: 'Hoàn tác một phần', color: 'orange' },
} as const;

const FloorMapRevisionDrawer: React.FC<Props> = ({
    open,
    revisions,
    loading,
    rollingBackId,
    canRollback,
    onClose,
    onRollback,
}) => (
    <Drawer
        open={open}
        onClose={onClose}
        width='min(560px, 100vw)'
        title={
            <div>
                <div className='font-bold text-slate-900'>Lịch sử phiên bản sơ đồ</div>
                <div className='mt-0.5 text-xs font-normal text-slate-500'>
                    Theo dõi và hoàn tác thay đổi vị trí máy
                </div>
            </div>
        }
    >
        <Alert
            className='mb-4'
            type='info'
            showIcon
            message='Hoàn tác có kiểm tra xung đột'
            description='Chỉ máy vẫn còn ở đúng tọa độ của phiên bản được chọn mới quay lại vị trí cũ. Các thay đổi mới hơn luôn được giữ nguyên.'
        />
        {loading ? (
            <div className='flex min-h-48 items-center justify-center'>
                <Spin />
            </div>
        ) : revisions.length ? (
            <div className='divide-y divide-slate-200'>
                {revisions.map((revision) => {
                    const meta = statusMeta[revision.status];
                    return (
                        <section key={revision.id} className='py-4 first:pt-0'>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='min-w-0'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <Tag
                                            color={revision.source === 'stocktake' ? 'purple' : 'blue'}
                                            className='!m-0'
                                        >
                                            {revision.source === 'stocktake'
                                                ? 'Duyệt từ kiểm kê'
                                                : 'Thiết lập thủ công'}
                                        </Tag>
                                        <Tag color={meta.color} className='!m-0'>
                                            {meta.label}
                                        </Tag>
                                    </div>
                                    <div className='mt-2 flex items-center gap-1.5 text-xs text-slate-500'>
                                        <ClockCircleOutlined />
                                        {new Date(revision.createdAt).toLocaleString('vi-VN')} ·{' '}
                                        {revision.changedByName || 'Không rõ người thực hiện'}
                                    </div>
                                </div>
                                <div className='shrink-0 text-right'>
                                    <div className='text-lg font-black text-slate-900'>{revision.changes.length}</div>
                                    <div className='text-[11px] text-slate-400'>máy thay đổi</div>
                                </div>
                            </div>

                            <details className='group mt-3 rounded-lg border border-slate-200 bg-slate-50 open:bg-white'>
                                <summary className='cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600'>
                                    Xem tọa độ trước và sau
                                </summary>
                                <div className='border-t border-slate-200 px-3 py-2'>
                                    {revision.changes.map((change) => (
                                        <div
                                            key={change.assetId}
                                            className='flex items-center gap-2 border-b border-slate-100 py-2 text-xs last:border-0'
                                        >
                                            <div className='min-w-0 flex-1'>
                                                <div className='truncate font-bold text-slate-800'>
                                                    {change.machineCode || '-'}
                                                </div>
                                                <div className='truncate text-slate-400'>
                                                    {change.name || 'Chưa có tên'}
                                                </div>
                                            </div>
                                            <span className='font-mono text-slate-500'>
                                                {positionLabel(change.before)}
                                            </span>
                                            <span className='text-slate-300'>→</span>
                                            <span className='font-mono font-bold text-cyan-700'>
                                                {positionLabel(change.after)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            {revision.status === 'partial' ? (
                                <div className='mt-2 text-xs leading-5 text-amber-700'>
                                    {revision.conflictAssetIds?.length ?? 0} máy đã có thay đổi mới hơn nên không được
                                    hoàn tác.
                                </div>
                            ) : null}

                            {canRollback && revision.status === 'applied' ? (
                                <div className='mt-3 flex justify-end'>
                                    <Popconfirm
                                        title={`Hoàn tác vị trí của ${revision.changes.length} máy?`}
                                        description='Máy đã được sửa sau phiên bản này sẽ tự động bị bỏ qua.'
                                        okText='Hoàn tác an toàn'
                                        cancelText='Hủy'
                                        onConfirm={() => onRollback(revision)}
                                    >
                                        <Button
                                            size='small'
                                            icon={<RollbackOutlined />}
                                            loading={rollingBackId === revision.id}
                                        >
                                            Hoàn tác phiên bản
                                        </Button>
                                    </Popconfirm>
                                </div>
                            ) : revision.status !== 'applied' ? (
                                <div className='mt-2 flex items-center gap-1.5 text-xs text-slate-400'>
                                    <SafetyCertificateOutlined />
                                    {revision.revertedAt
                                        ? `${new Date(revision.revertedAt).toLocaleString('vi-VN')} bởi ${revision.revertedByName || 'người có quyền'}`
                                        : 'Phiên bản đã được xử lý'}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
            </div>
        ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiên bản thay đổi vị trí' />
        )}
    </Drawer>
);

export default FloorMapRevisionDrawer;
