import {
    DownloadOutlined,
    HistoryOutlined,
    LockOutlined,
    MoreOutlined,
    ReloadOutlined,
    SendOutlined,
    SettingOutlined,
    UnlockOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { App, Button, DatePicker, Dropdown, Input, Modal, Select, Typography, type MenuProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState, type ReactNode } from 'react';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionDayStatus, ProductionDayStatusEvent } from '../../core/types/production';

const { Text } = Typography;

const statusMeta: Record<ProductionDayStatus, { label: string; className: string }> = {
    draft: { label: 'Đang nhập', className: 'pd-chip--draft' },
    submitted: { label: 'Chờ duyệt', className: 'pd-chip--submitted' },
    locked: { label: 'Đã khóa sổ', className: 'pd-chip--locked' },
};

const eventLabel = (event: ProductionDayStatusEvent) => {
    if (event.to === 'submitted') return 'Gửi duyệt';
    if (event.to === 'locked') return 'Khóa sổ';
    return 'Mở lại';
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể cập nhật trạng thái');

type Props = {
    date: Dayjs;
    onDateChange: (value: Dayjs) => void;
    plantId?: string;
    plants: { id: string; name: string }[];
    plantsLoading?: boolean;
    canSwitchPlant: boolean;
    onPlantChange?: (plantId: string) => void;
    day?: ProductionDay | null;
    /** KPI hiển thị ở giữa ribbon (desktop). */
    kpis?: ReactNode;
    /** Bật các nút gửi duyệt / khóa sổ / mở lại (trang nhập liệu). */
    workflow?: boolean;
    canManage?: boolean;
    canReopenLocked?: boolean;
    onSetup?: () => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    onUpdated?: () => void | Promise<void>;
    /** Nút bổ sung bên phải (vd: toàn màn hình ở trang Điều hành). */
    extraActions?: ReactNode;
};

const ProductionCommandRibbon = ({
    date,
    onDateChange,
    plantId,
    plants,
    plantsLoading,
    canSwitchPlant,
    onPlantChange,
    day,
    kpis,
    workflow = false,
    canManage = false,
    canReopenLocked = false,
    onSetup,
    onRefresh,
    refreshing,
    onUpdated,
    extraActions,
}: Props) => {
    const { message, modal } = App.useApp();
    const [reopenOpen, setReopenOpen] = useState(false);
    const [reopenNote, setReopenNote] = useState('');
    const [auditOpen, setAuditOpen] = useState(false);

    const statusMutation = useMutation({
        mutationFn: async ({ action, note }: { action: 'submit' | 'lock' | 'reopen'; note?: string }) => {
            if (!day) throw new Error('Ngày sản xuất chưa được khởi tạo');
            if (action === 'submit') return productionService.submitDay(day.id, note);
            if (action === 'lock') return productionService.lockDay(day.id, note);
            return productionService.reopenDay(day.id, note || '');
        },
        onSuccess: async (_, variables) => {
            message.success(
                variables.action === 'submit'
                    ? 'Đã gửi quản lý duyệt'
                    : variables.action === 'lock'
                      ? 'Đã khóa sổ ngày sản xuất'
                      : 'Đã mở lại để chỉnh sửa'
            );
            setReopenOpen(false);
            setReopenNote('');
            await onUpdated?.();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const exportMutation = useMutation({
        mutationFn: async () => {
            if (!day) throw new Error('Ngày sản xuất chưa được khởi tạo');
            return productionService.exportDay(day.id);
        },
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-san-luong-${day?.productionDate}.xlsx`;
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

    const menuItems: MenuProps['items'] = [
        canManage && day
            ? { key: 'export', icon: <DownloadOutlined />, label: 'Xuất Excel báo cáo ngày' }
            : null,
        onSetup && (!day || day.status === 'draft') && canManage
            ? { key: 'setup', icon: <SettingOutlined />, label: 'Thiết lập danh mục & khung giờ' }
            : null,
        day ? { key: 'audit', icon: <HistoryOutlined />, label: 'Lịch sử trạng thái' } : null,
        onRefresh ? { key: 'refresh', icon: <ReloadOutlined />, label: 'Tải lại dữ liệu' } : null,
    ].filter(Boolean) as MenuProps['items'];

    const handleMenu: MenuProps['onClick'] = ({ key }) => {
        if (key === 'export') exportMutation.mutate();
        if (key === 'setup') onSetup?.();
        if (key === 'audit') setAuditOpen(true);
        if (key === 'refresh') onRefresh?.();
    };

    const status = day ? statusMeta[day.status] : undefined;

    return (
        <section className='pd-ribbon'>
            <div className='pd-ribbon__context'>
                <DatePicker
                    value={date}
                    allowClear={false}
                    format='DD/MM/YYYY'
                    onChange={(value) => onDateChange(value || dayjs())}
                />
                {canSwitchPlant ? (
                    <Select
                        value={plantId || undefined}
                        onChange={(value) => onPlantChange?.(value)}
                        loading={plantsLoading}
                        placeholder='Chọn cơ sở'
                        popupMatchSelectWidth={false}
                        options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                        style={{ minWidth: 140 }}
                    />
                ) : null}
                {status ? <span className={`pd-chip ${status.className}`}>{status.label}</span> : null}
            </div>

            {kpis ? <div className='pd-ribbon__kpis'>{kpis}</div> : null}

            <div className='pd-ribbon__actions'>
                {extraActions}
                {workflow && day?.status === 'draft' ? (
                    <Button
                        type='primary'
                        icon={<SendOutlined />}
                        loading={statusMutation.isPending}
                        onClick={confirmSubmit}
                    >
                        Gửi duyệt
                    </Button>
                ) : null}
                {workflow && day?.status === 'submitted' && canManage ? (
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
                {workflow && day?.status === 'locked' && canReopenLocked ? (
                    <Button icon={<UnlockOutlined />} onClick={() => setReopenOpen(true)}>
                        Mở lại
                    </Button>
                ) : null}
                {menuItems && menuItems.length ? (
                    <Dropdown menu={{ items: menuItems, onClick: handleMenu }} trigger={['click']}>
                        <Button icon={<MoreOutlined />} loading={exportMutation.isPending || refreshing} />
                    </Dropdown>
                ) : null}
            </div>

            <Modal
                open={auditOpen}
                title='Lịch sử trạng thái'
                footer={null}
                onCancel={() => setAuditOpen(false)}
            >
                <div className='production-status-audit'>
                    {day?.statusHistory?.length ? (
                        [...day.statusHistory]
                            .reverse()
                            .slice(0, 12)
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
            </Modal>

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

export default ProductionCommandRibbon;
