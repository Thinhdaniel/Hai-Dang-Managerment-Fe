import React, { useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Descriptions,
    Empty,
    Input,
    Modal,
    Spin,
    Steps,
    Table,
    Tag,
    Timeline,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    CheckOutlined,
    CloseCircleOutlined,
    CloseOutlined,
    DownloadOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    InfoCircleOutlined,
    PictureOutlined,
    StopOutlined,
    SwapOutlined,
    TruckOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import AppBreadcrumb from '../components/navigation/AppBreadcrumb';
import ConfirmAction from '../components/shared/ConfirmAction';
import HandoverModal from '../components/transfer/HandoverModal';
import TransferStatusBadge from '../components/transfer/TransferStatusBadge';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess, hasDirectorAccess } from '../core/lib/permissions';
import { transferService } from '../core/services/transfer.service';
import type { Asset, Transfer } from '../core/types';

const { Text, Title } = Typography;

const formatDateTime = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-');
const formatDate = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '-');

const STEP_MAP: Record<string, number> = { pending: 0, approved: 1, completed: 2 };

const statusMeta: Record<
    string,
    { type: 'info' | 'success' | 'warning' | 'error'; message: string; description: string }
> = {
    pending: {
        type: 'warning',
        message: 'Lệnh đang chờ duyệt',
        description: 'Máy chưa được cập nhật vị trí. Người quản lý cần duyệt lệnh trước khi vận chuyển.',
    },
    approved: {
        type: 'info',
        message: 'Lệnh đã duyệt, đang vận chuyển',
        description: 'Khi bàn giao xong, xác nhận hoàn tất để cập nhật vị trí cho toàn bộ máy trong lệnh.',
    },
    completed: {
        type: 'success',
        message: 'Lệnh đã hoàn tất',
        description: 'Vị trí của các máy trong lệnh đã được cập nhật theo điểm đến.',
    },
    rejected: {
        type: 'error',
        message: 'Lệnh đã bị từ chối',
        description: 'Lệnh không còn hiệu lực. Kiểm tra lý do từ chối trong phần chi tiết xử lý.',
    },
    cancelled: {
        type: 'info',
        message: 'Lệnh đã hủy',
        description: 'Lệnh không còn hiệu lực. Kiểm tra lý do hủy trong phần chi tiết xử lý.',
    },
};

const assetStatusLabel: Record<string, string> = {
    active: 'Đang hoạt động',
    maintenance: 'Đang bảo trì',
    broken: 'Lỗi / hỏng',
    borrowing: 'Đang mượn',
    storage: 'Tồn kho',
    returned_to_partner: 'Đã trả đối tác',
};

const assetStatusColor: Record<string, string> = {
    active: 'green',
    maintenance: 'gold',
    broken: 'red',
    borrowing: 'purple',
    storage: 'default',
    returned_to_partner: 'default',
};

const getTransferAssets = (transfer: Transfer) => {
    if (transfer.assets?.length) return transfer.assets;
    return transfer.asset ? [transfer.asset] : [];
};

const getTransferAssetLabel = (transfer: Transfer) => {
    const assets = getTransferAssets(transfer);
    if (assets.length === 1) return assets[0].name;
    if (assets.length > 1) return `${assets.length} máy`;
    return 'Máy';
};

const getTransferCode = (transfer: Transfer) =>
    `TRF-${new Date(transfer.createdAt).getFullYear()}-${transfer.id.slice(-4).toUpperCase()}`;

const getTransferFromPlantId = (transfer: Transfer) => transfer.fromPlantId || transfer.fromPlant?.id;

const TransferDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { role, user } = useAuth();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const canManage = hasManagerAccess(role);

    const [rejectModal, setRejectModal] = useState({ open: false, reason: '' });
    const [cancelModal, setCancelModal] = useState({ open: false, reason: '' });
    const [handoverOpen, setHandoverOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const { data: transfer, isLoading } = useQuery({
        queryKey: ['transfer', id],
        queryFn: () => transferService.getById(id),
        enabled: Boolean(id),
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['transfer', id] });
        queryClient.invalidateQueries({ queryKey: ['transfers'] });
        queryClient.invalidateQueries({ queryKey: ['transfers-stats'] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
    };

    const approveMutation = useMutation({
        mutationFn: () => transferService.approve(id),
        onSuccess: () => {
            invalidate();
            message.success('Đã duyệt lệnh điều chuyển');
        },
    });

    const completeMutation = useMutation({
        mutationFn: (payload: { receivedBy: string; handoverImages?: string[] }) =>
            transferService.complete(id, payload),
        onSuccess: () => {
            invalidate();
            setHandoverOpen(false);
            message.success('Đã hoàn tất điều chuyển và cập nhật vị trí máy');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (reason: string) => transferService.reject(id, reason),
        onSuccess: () => {
            invalidate();
            message.success('Đã từ chối lệnh điều chuyển');
            setRejectModal({ open: false, reason: '' });
        },
    });

    const cancelMutation = useMutation({
        mutationFn: (reason: string) => transferService.cancel(id, reason),
        onSuccess: () => {
            invalidate();
            message.success('Đã hủy lệnh điều chuyển');
            setCancelModal({ open: false, reason: '' });
        },
    });

    const assets = useMemo(() => (transfer ? getTransferAssets(transfer) : []), [transfer]);

    const assetColumns: TableColumnsType<Asset> = [
        {
            title: 'Máy',
            key: 'machine',
            width: 280,
            render: (_value, asset) => (
                <div className='flex flex-col gap-1'>
                    <Text strong>{asset.name}</Text>
                    <div className='flex flex-wrap gap-1'>
                        <Tag color='blue'>{asset.machineCode || '-'}</Tag>
                        {asset.publicId ? <Tag>{asset.publicId}</Tag> : null}
                    </div>
                </div>
            ),
        },
        {
            title: 'Serial / Model',
            key: 'serial',
            width: 220,
            render: (_value, asset) => (
                <div className='flex flex-col gap-1'>
                    <Text>{asset.serial || '-'}</Text>
                    <Text type='secondary' className='text-xs'>
                        {asset.model || asset.type || '-'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Nhãn hiệu',
            key: 'brand',
            width: 160,
            render: (_value, asset) => asset.brand?.name || '-',
        },
        {
            title: 'Vị trí hiện tại',
            key: 'currentLocation',
            width: 220,
            render: (_value, asset) => (
                <div className='flex flex-col gap-1'>
                    <Text>{asset.plant?.name || '-'}</Text>
                    <Text type='secondary' className='text-xs'>
                        {asset.area || 'Chưa chỉ định khu vực'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Trạng thái máy',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (status: string) => (
                <Tag color={assetStatusColor[status] || 'default'}>{assetStatusLabel[status] || status}</Tag>
            ),
        },
        {
            title: '',
            key: 'action',
            width: 110,
            align: 'right',
            render: (_value, asset) => (
                <Button size='small' onClick={() => navigate(`/assets/${asset.id}`)}>
                    Xem máy
                </Button>
            ),
        },
    ];

    if (isLoading) {
        return (
            <div className='flex min-h-[50vh] items-center justify-center'>
                <Spin size='large' />
            </div>
        );
    }

    if (!transfer) {
        return <Empty description='Không tìm thấy lệnh điều chuyển' className='py-20' />;
    }

    const stepIndex = STEP_MAP[transfer.status] ?? 0;
    const isClosed = ['rejected', 'cancelled', 'completed'].includes(transfer.status);
    const transferCode = getTransferCode(transfer);
    const status = statusMeta[transfer.status] || statusMeta.pending;
    const canExportStockOut = ['approved', 'completed'].includes(transfer.status);
    const canRejectOrCancelTransfer =
        canManage && (!user?.plantId || getTransferFromPlantId(transfer) === user.plantId);
    // Hủy lệnh: chỉ Giám đốc trở lên (admin/director), tách khỏi quyền quản lý chung
    const canCancel =
        hasDirectorAccess(role) && (!user?.plantId || getTransferFromPlantId(transfer) === user.plantId);

    const handleExportStockOut = async () => {
        try {
            setExporting(true);
            await transferService.exportStockOutXlsx(transfer.id, transferCode);
        } catch {
            message.error('Không thể xuất phiếu xuất kho');
        } finally {
            setExporting(false);
        }
    };

    const timelineItems = [
        {
            dot: <FileTextOutlined className='text-slate-400' />,
            children: (
                <div>
                    <Text type='secondary' className='text-xs font-semibold'>
                        Tạo lệnh
                    </Text>
                    <div className='font-medium text-slate-800'>{formatDateTime(transfer.createdAt)}</div>
                </div>
            ),
        },
        ...(transfer.approvedAt
            ? [
                  {
                      dot:
                          transfer.status === 'rejected' ? (
                              <CloseCircleOutlined className='text-rose-500' />
                          ) : (
                              <CheckOutlined className='text-blue-500' />
                          ),
                      children: (
                          <div>
                              <Text
                                  type={transfer.status === 'rejected' ? 'danger' : 'secondary'}
                                  className='text-xs font-semibold'
                              >
                                  {transfer.status === 'rejected' ? 'Từ chối' : 'Duyệt lệnh'}
                              </Text>
                              <div className='font-medium text-slate-800'>{formatDateTime(transfer.approvedAt)}</div>
                              {transfer.rejectReason ? (
                                  <Text type='danger' className='text-xs'>
                                      Lý do: {transfer.rejectReason}
                                  </Text>
                              ) : null}
                          </div>
                      ),
                  },
              ]
            : []),
        ...(transfer.completedAt
            ? [
                  {
                      dot: <CheckCircleOutlined className='text-emerald-500' />,
                      children: (
                          <div>
                              <Text type='success' className='text-xs font-semibold'>
                                  Hoàn tất bàn giao
                              </Text>
                              <div className='font-medium text-slate-800'>{formatDateTime(transfer.completedAt)}</div>
                              {transfer.receivedBy ? (
                                  <Text type='secondary' className='text-xs'>
                                      Người nhận: {transfer.receivedBy}
                                  </Text>
                              ) : null}
                          </div>
                      ),
                  },
              ]
            : []),
        ...(transfer.cancelledAt
            ? [
                  {
                      dot: <StopOutlined className='text-slate-400' />,
                      children: (
                          <div>
                              <Text type='secondary' className='text-xs font-semibold'>
                                  Hủy lệnh
                              </Text>
                              <div className='font-medium text-slate-800'>{formatDateTime(transfer.cancelledAt)}</div>
                              {transfer.cancelReason ? (
                                  <Text type='secondary' className='text-xs'>
                                      Lý do: {transfer.cancelReason}
                                  </Text>
                              ) : null}
                          </div>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <Card variant='outlined'>
                <div className='flex flex-col gap-5'>
                    <div className='flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-start'>
                        <div className='flex min-w-0 flex-col gap-3'>
                            <AppBreadcrumb />
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate('/transfers')}
                                className='w-fit'
                            >
                                Quay lại danh sách
                            </Button>
                            <div className='flex flex-wrap items-center gap-3'>
                                <Title level={3} className='!mb-0'>
                                    Chi tiết lệnh điều chuyển
                                </Title>
                                <Tag color='geekblue' className='font-mono text-sm'>
                                    {transferCode}
                                </Tag>
                                <TransferStatusBadge status={transfer.status} />
                            </div>
                            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500'>
                                <span>
                                    Ngày tạo:{' '}
                                    <strong className='text-slate-800'>{formatDateTime(transfer.createdAt)}</strong>
                                </span>
                                <span>
                                    Số máy: <strong className='text-slate-800'>{assets.length || 1}</strong>
                                </span>
                                <span>
                                    Ngày điều chuyển:{' '}
                                    <strong className='text-slate-800'>{formatDate(transfer.transferDate)}</strong>
                                </span>
                            </div>
                        </div>

                        <div className='flex flex-wrap items-center gap-2'>
                            {canExportStockOut ? (
                                <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportStockOut}>
                                    Xuất phiếu xuất kho
                                </Button>
                            ) : null}
                            {transfer.status === 'pending' && canManage ? (
                                <ConfirmAction
                                    intent='warning'
                                    title='Duyệt lệnh điều chuyển'
                                    description='Sau khi duyệt, lệnh chuyển sang trạng thái đang vận chuyển.'
                                    okLabel='Duyệt'
                                    onConfirm={() => approveMutation.mutate()}
                                >
                                    <Button icon={<CheckOutlined />} loading={approveMutation.isPending}>
                                        Duyệt lệnh
                                    </Button>
                                </ConfirmAction>
                            ) : null}
                            {transfer.status === 'approved' && canManage ? (
                                <Button
                                    type='primary'
                                    icon={<CheckCircleOutlined />}
                                    onClick={() => setHandoverOpen(true)}
                                    loading={completeMutation.isPending}
                                >
                                    Hoàn tất bàn giao
                                </Button>
                            ) : null}
                            {transfer.status === 'pending' && canRejectOrCancelTransfer ? (
                                <Button
                                    danger
                                    icon={<CloseOutlined />}
                                    onClick={() => setRejectModal({ open: true, reason: '' })}
                                >
                                    Từ chối
                                </Button>
                            ) : null}
                            {transfer.status === 'pending' && canCancel ? (
                                <Button
                                    icon={<StopOutlined />}
                                    onClick={() => setCancelModal({ open: true, reason: '' })}
                                >
                                    Hủy lệnh
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <Alert showIcon type={status.type} title={status.message} description={status.description} />

                    {!isClosed ? (
                        <Steps
                            current={stepIndex}
                            size='small'
                            responsive
                            items={[
                                { title: 'Chờ duyệt', description: formatDateTime(transfer.createdAt) },
                                {
                                    title: 'Đang vận chuyển',
                                    description: transfer.approvedAt
                                        ? formatDateTime(transfer.approvedAt)
                                        : 'Chưa duyệt',
                                },
                                {
                                    title: 'Hoàn tất',
                                    description: transfer.completedAt
                                        ? formatDateTime(transfer.completedAt)
                                        : 'Chờ bàn giao',
                                },
                            ]}
                        />
                    ) : null}
                </div>
            </Card>

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
                <div className='flex flex-col gap-6 xl:col-span-2'>
                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <EnvironmentOutlined />
                                <span>Lộ trình điều chuyển</span>
                            </div>
                        }
                    >
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch'>
                            <div className='rounded-2xl border border-slate-200 bg-slate-50 p-5'>
                                <Text type='secondary' className='text-xs font-bold tracking-wide uppercase'>
                                    Xuất phát
                                </Text>
                                <div className='mt-2 text-lg font-bold text-slate-900'>
                                    {transfer.fromPlant?.name || '-'}
                                </div>
                                <div className='text-sm text-slate-600'>
                                    {transfer.fromArea || 'Chưa chỉ định khu vực'}
                                </div>
                                {transfer.fromPlant?.address ? (
                                    <div className='mt-2 text-xs text-slate-500'>{transfer.fromPlant.address}</div>
                                ) : null}
                            </div>
                            <div className='flex items-center justify-center text-blue-600'>
                                <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-50'>
                                    <TruckOutlined className='text-xl' />
                                </div>
                            </div>
                            <div className='rounded-2xl border border-blue-100 bg-blue-50 p-5'>
                                <Text type='secondary' className='text-xs font-bold tracking-wide uppercase'>
                                    Điểm đến
                                </Text>
                                <div className='mt-2 text-lg font-bold text-slate-900'>
                                    {transfer.toPlant?.name || '-'}
                                </div>
                                <div className='text-sm text-slate-600'>
                                    {transfer.toArea || 'Chưa chỉ định khu vực'}
                                </div>
                                {transfer.toPlant?.address ? (
                                    <div className='mt-2 text-xs text-slate-500'>{transfer.toPlant.address}</div>
                                ) : null}
                            </div>
                        </div>
                    </Card>

                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <SwapOutlined />
                                <span>Danh sách máy trong lệnh</span>
                            </div>
                        }
                        extra={<Tag color='blue'>{assets.length || 1} máy</Tag>}
                    >
                        {assets.length ? (
                            <Table<Asset>
                                rowKey='id'
                                columns={assetColumns}
                                dataSource={assets}
                                pagination={false}
                                scroll={{ x: 1120 }}
                                size='middle'
                            />
                        ) : (
                            <Empty description='Không có dữ liệu máy trong lệnh' />
                        )}
                    </Card>

                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <FileTextOutlined />
                                <span>Nội dung lệnh</span>
                            </div>
                        }
                    >
                        <Descriptions
                            layout='vertical'
                            column={{ xs: 1, sm: 2 }}
                            bordered
                            size='small'
                            items={[
                                {
                                    key: 'transferDate',
                                    label: 'Ngày điều chuyển',
                                    children: formatDate(transfer.transferDate),
                                },
                                {
                                    key: 'status',
                                    label: 'Trạng thái',
                                    children: <TransferStatusBadge status={transfer.status} />,
                                },
                                { key: 'assetCount', label: 'Số máy', children: getTransferAssetLabel(transfer) },
                                { key: 'createdAt', label: 'Ngày tạo', children: formatDateTime(transfer.createdAt) },
                                {
                                    key: 'reason',
                                    label: 'Lý do điều chuyển',
                                    span: 2,
                                    children: transfer.reason || '-',
                                },
                                { key: 'note', label: 'Ghi chú', span: 2, children: transfer.note || '-' },
                                {
                                    key: 'receivedBy',
                                    label: 'Người nhận bàn giao',
                                    span: 2,
                                    children: transfer.receivedBy ? (
                                        <span className='inline-flex items-center gap-2'>
                                            <UserOutlined />
                                            {transfer.receivedBy}
                                        </span>
                                    ) : (
                                        '-'
                                    ),
                                },
                                ...(transfer.rejectReason
                                    ? [
                                          {
                                              key: 'rejectReason',
                                              label: 'Lý do từ chối',
                                              span: 2,
                                              children: <Text type='danger'>{transfer.rejectReason}</Text>,
                                          },
                                      ]
                                    : []),
                                ...(transfer.cancelReason
                                    ? [
                                          {
                                              key: 'cancelReason',
                                              label: 'Lý do hủy',
                                              span: 2,
                                              children: transfer.cancelReason,
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                    </Card>
                </div>

                <div className='flex flex-col gap-6'>
                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <InfoCircleOutlined />
                                <span>Tóm tắt</span>
                            </div>
                        }
                    >
                        <div className='grid grid-cols-2 gap-3'>
                            <div className='rounded-xl bg-slate-50 p-4'>
                                <Text type='secondary' className='text-xs'>
                                    Mã lệnh
                                </Text>
                                <div className='mt-1 font-mono font-bold text-slate-900'>{transferCode}</div>
                            </div>
                            <div className='rounded-xl bg-slate-50 p-4'>
                                <Text type='secondary' className='text-xs'>
                                    Số máy
                                </Text>
                                <div className='mt-1 text-xl font-bold text-slate-900'>{assets.length || 1}</div>
                            </div>
                            <div className='col-span-2 rounded-xl bg-slate-50 p-4'>
                                <Text type='secondary' className='text-xs'>
                                    Tuyến chuyển
                                </Text>
                                <div className='mt-1 font-semibold text-slate-900'>
                                    {transfer.fromPlant?.name || '-'} → {transfer.toPlant?.name || '-'}
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <CheckCircleOutlined />
                                <span>Lịch sử xử lý</span>
                            </div>
                        }
                    >
                        <Timeline items={timelineItems} />
                    </Card>

                    <Card
                        variant='outlined'
                        title={
                            <div className='flex items-center gap-2'>
                                <PictureOutlined />
                                <span>Ảnh bàn giao</span>
                            </div>
                        }
                        extra={
                            transfer.handoverImages?.length ? (
                                <Tag color='green'>{transfer.handoverImages.length} ảnh</Tag>
                            ) : null
                        }
                    >
                        {transfer.handoverImages?.length ? (
                            <div className='grid grid-cols-2 gap-3'>
                                {transfer.handoverImages.map((url, index) => (
                                    <a
                                        key={`${url}-${index}`}
                                        href={url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='block overflow-hidden rounded-xl border border-slate-200 bg-slate-50'
                                    >
                                        <img
                                            src={url}
                                            alt={`Ảnh bàn giao ${index + 1}`}
                                            className='h-32 w-full object-cover transition-transform hover:scale-105'
                                        />
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có ảnh bàn giao' />
                        )}
                    </Card>
                </div>
            </div>

            <Modal
                open={rejectModal.open}
                title='Từ chối lệnh điều chuyển'
                okText='Xác nhận từ chối'
                cancelText='Hủy'
                okButtonProps={{
                    danger: true,
                    loading: rejectMutation.isPending,
                    disabled: !rejectModal.reason.trim() || transfer.status !== 'pending' || !canRejectOrCancelTransfer,
                }}
                onOk={() => {
                    if (transfer.status !== 'pending' || !canRejectOrCancelTransfer) return;
                    rejectMutation.mutate(rejectModal.reason.trim());
                }}
                onCancel={() => setRejectModal({ open: false, reason: '' })}
                destroyOnHidden
                mask={{ closable: false }}
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Lệnh này gồm <strong>{assets.length || 1} máy</strong>. Nhập lý do từ chối để lưu vào lịch sử xử lý.
                </p>
                <Input.TextArea
                    rows={4}
                    placeholder='Nhập lý do từ chối...'
                    value={rejectModal.reason}
                    onChange={(event) => setRejectModal((prev) => ({ ...prev, reason: event.target.value }))}
                    autoFocus
                />
            </Modal>

            <Modal
                open={cancelModal.open}
                title='Hủy lệnh điều chuyển'
                okText='Xác nhận hủy'
                cancelText='Đóng'
                okButtonProps={{
                    danger: true,
                    loading: cancelMutation.isPending,
                    disabled: !cancelModal.reason.trim() || transfer.status !== 'pending' || !canCancel,
                }}
                onOk={() => {
                    if (transfer.status !== 'pending' || !canCancel) return;
                    cancelMutation.mutate(cancelModal.reason.trim());
                }}
                onCancel={() => setCancelModal({ open: false, reason: '' })}
                destroyOnHidden
                mask={{ closable: false }}
            >
                <p className='mb-3 text-sm text-slate-600'>
                    Lệnh này gồm <strong>{assets.length || 1} máy</strong>. Nhập lý do hủy để lưu vào lịch sử xử lý.
                </p>
                <Input.TextArea
                    rows={4}
                    placeholder='Nhập lý do hủy...'
                    value={cancelModal.reason}
                    onChange={(event) => setCancelModal((prev) => ({ ...prev, reason: event.target.value }))}
                    autoFocus
                />
            </Modal>

            <HandoverModal
                open={handoverOpen}
                assetName={getTransferAssetLabel(transfer)}
                submitting={completeMutation.isPending}
                onClose={() => setHandoverOpen(false)}
                onSubmit={async (payload) => {
                    await completeMutation.mutateAsync(payload);
                }}
            />
        </div>
    );
};

export default TransferDetail;
