import {
    CheckCircleOutlined,
    DownloadOutlined,
    HistoryOutlined,
    LockOutlined,
    SendOutlined,
    UnlockOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { App, Button, Input, Modal, Popover, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionDayStatus, ProductionDayStatusEvent } from '../../core/types/production';

const { Text } = Typography;

type Props = {
    day: ProductionDay;
    canManage: boolean;
    canReopenLocked: boolean;
    onUpdated: (day: ProductionDay) => void | Promise<void>;
};

const statusMeta: Record<ProductionDayStatus, { label: string; color: string; description: string }> = {
    draft: { label: 'Đang nhập', color: 'gold', description: 'Dữ liệu còn có thể chỉnh sửa' },
    submitted: { label: 'Chờ duyệt', color: 'blue', description: 'Đã ngừng nhập, chờ quản lý kiểm tra' },
    locked: { label: 'Đã khóa sổ', color: 'green', description: 'Số liệu chính thức, chỉ đọc' },
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể cập nhật trạng thái');

const eventLabel = (event: ProductionDayStatusEvent) => {
    if (event.to === 'submitted') return 'Gửi duyệt';
    if (event.to === 'locked') return 'Khóa sổ';
    return 'Mở lại';
};

const ProductionDayStatusBar = ({ day, canManage, canReopenLocked, onUpdated }: Props) => {
    const { message, modal } = App.useApp();
    const [reopenOpen, setReopenOpen] = useState(false);
    const [reopenNote, setReopenNote] = useState('');
    const meta = statusMeta[day.status];

    const statusMutation = useMutation({
        mutationFn: async ({ action, note }: { action: 'submit' | 'lock' | 'reopen'; note?: string }) => {
            if (action === 'submit') return productionService.submitDay(day.id, note);
            if (action === 'lock') return productionService.lockDay(day.id, note);
            return productionService.reopenDay(day.id, note || '');
        },
        onSuccess: async (updated, variables) => {
            message.success(
                variables.action === 'submit'
                    ? 'Đã gửi quản lý duyệt'
                    : variables.action === 'lock'
                      ? 'Đã khóa sổ ngày sản xuất'
                      : 'Đã mở lại để chỉnh sửa'
            );
            setReopenOpen(false);
            setReopenNote('');
            await onUpdated(updated);
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const exportMutation = useMutation({
        mutationFn: () => productionService.exportDay(day.id),
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-san-luong-${day.productionDate}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success('Đã xuất báo cáo Excel');
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const confirmSubmit = () => {
        modal.confirm({
            title: 'Gửi ngày sản xuất để duyệt?',
            content: 'Sau khi gửi, số liệu sẽ chuyển sang chỉ đọc cho đến khi quản lý mở lại.',
            okText: 'Gửi duyệt',
            cancelText: 'Kiểm tra thêm',
            icon: <SendOutlined />,
            onOk: () => statusMutation.mutateAsync({ action: 'submit' }),
        });
    };

    const confirmLock = () => {
        modal.confirm({
            title: 'Khóa sổ ngày sản xuất?',
            content: 'Số liệu sẽ trở thành dữ liệu chính thức dùng cho báo cáo ngày và tháng.',
            okText: 'Khóa sổ',
            cancelText: 'Chưa khóa',
            icon: <LockOutlined />,
            onOk: () => statusMutation.mutateAsync({ action: 'lock' }),
        });
    };

    const auditContent = (
        <div className='production-status-audit'>
            <strong>Lịch sử trạng thái</strong>
            {day.statusHistory?.length ? (
                [...day.statusHistory]
                    .reverse()
                    .slice(0, 8)
                    .map((event, index) => (
                        <div key={event.id || `${event.at}-${index}`}>
                            <span className={`status-${event.to}`} />
                            <div>
                                <strong>{eventLabel(event)}</strong>
                                <small>
                                    {event.actor?.name || 'Người dùng'} ·{' '}
                                    {event.at ? dayjs(event.at).format('DD/MM/YYYY HH:mm') : ''}
                                </small>
                                {event.note ? <p>{event.note}</p> : null}
                            </div>
                        </div>
                    ))
            ) : (
                <Text type='secondary'>Chưa phát sinh thay đổi trạng thái.</Text>
            )}
        </div>
    );

    return (
        <section className={`production-day-status status-${day.status}`}>
            <div className='production-day-status__summary'>
                <span className='production-day-status__icon'>
                    {day.status === 'locked' ? (
                        <CheckCircleOutlined />
                    ) : day.status === 'submitted' ? (
                        <SendOutlined />
                    ) : (
                        <HistoryOutlined />
                    )}
                </span>
                <div>
                    <span>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        <strong>{meta.description}</strong>
                    </span>
                    <small>
                        {day.status === 'submitted' && day.submittedBy
                            ? `${day.submittedBy.name || 'Người dùng'} gửi lúc ${dayjs(day.submittedAt).format('DD/MM HH:mm')}`
                            : day.status === 'locked' && day.lockedBy
                              ? `${day.lockedBy.name || 'Quản lý'} khóa lúc ${dayjs(day.lockedAt).format('DD/MM HH:mm')}`
                              : `Cập nhật ${dayjs(day.updatedAt).format('DD/MM HH:mm')}`}
                    </small>
                </div>
            </div>

            <div className='production-day-status__actions'>
                <Popover content={auditContent} placement='bottomRight' trigger='click'>
                    <Button icon={<HistoryOutlined />}>Lịch sử</Button>
                </Popover>
                {canManage ? (
                    <Button
                        icon={<DownloadOutlined />}
                        loading={exportMutation.isPending}
                        onClick={() => exportMutation.mutate()}
                    >
                        Xuất Excel
                    </Button>
                ) : null}
                {day.status === 'draft' ? (
                    <Button
                        type='primary'
                        icon={<SendOutlined />}
                        loading={statusMutation.isPending}
                        onClick={confirmSubmit}
                    >
                        Gửi duyệt
                    </Button>
                ) : null}
                {day.status === 'submitted' && canManage ? (
                    <>
                        <Button icon={<UnlockOutlined />} onClick={() => setReopenOpen(true)}>
                            Mở lại
                        </Button>
                        <Button
                            type='primary'
                            icon={<LockOutlined />}
                            loading={statusMutation.isPending}
                            onClick={confirmLock}
                        >
                            Khóa sổ
                        </Button>
                    </>
                ) : null}
                {day.status === 'locked' && canReopenLocked ? (
                    <Button icon={<UnlockOutlined />} onClick={() => setReopenOpen(true)}>
                        Mở lại
                    </Button>
                ) : null}
            </div>

            <Modal
                open={reopenOpen}
                title='Mở lại ngày sản xuất'
                okText='Xác nhận mở lại'
                cancelText='Hủy'
                okButtonProps={{ disabled: !reopenNote.trim(), loading: statusMutation.isPending }}
                onCancel={() => {
                    setReopenOpen(false);
                    setReopenNote('');
                }}
                onOk={() => statusMutation.mutate({ action: 'reopen', note: reopenNote.trim() })}
            >
                <Text type='secondary'>Lý do được lưu trong lịch sử để truy vết khi số liệu thay đổi.</Text>
                <Input.TextArea
                    className='production-reopen-note'
                    rows={4}
                    maxLength={500}
                    showCount
                    value={reopenNote}
                    onChange={(event) => setReopenNote(event.target.value)}
                    placeholder='Ví dụ: Chuyền CM2 báo nhầm sản lượng khung 14h...'
                />
            </Modal>
        </section>
    );
};

export default ProductionDayStatusBar;
