import React from 'react';
import { Button, Card, Result, Skeleton, Tag, Typography } from 'antd';
import {
    EditOutlined,
    LoginOutlined,
    QrcodeOutlined,
    SafetyCertificateOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { qrLabelService } from '../core/services/qr-label.service';
import { QrLabelStatus } from '../core/types';

const { Text } = Typography;

const statusMeta: Record<QrLabelStatus, { label: string; color: string }> = {
    [QrLabelStatus.UNUSED]: { label: 'Tem chưa kích hoạt', color: 'blue' },
    [QrLabelStatus.ASSIGNED]: { label: 'Đã gán máy', color: 'green' },
    [QrLabelStatus.RETIRED]: { label: 'Tem đã thay thế', color: 'default' },
    [QrLabelStatus.LOST]: { label: 'Tem báo mất', color: 'red' },
    [QrLabelStatus.DAMAGED]: { label: 'Tem hỏng', color: 'orange' },
};

const QrResolverPage: React.FC = () => {
    const { publicId = '' } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, role } = useAuth();
    const canManage = hasManagerAccess(role);

    const {
        data: publicData,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['public-qr', publicId],
        queryFn: () => qrLabelService.resolvePublic(publicId),
        enabled: Boolean(publicId),
        retry: false,
    });

    const { data: internalData } = useQuery({
        queryKey: ['internal-qr', publicId],
        queryFn: () => qrLabelService.resolveInternal(publicId),
        enabled: Boolean(publicId && isAuthenticated && canManage),
        retry: false,
    });

    if (isLoading) {
        return (
            <div className='min-h-screen bg-slate-100 px-4 py-6'>
                <div className='mx-auto max-w-md'>
                    <Skeleton active paragraph={{ rows: 8 }} className='rounded-3xl bg-white p-6' />
                </div>
            </div>
        );
    }

    if (isError || !publicData) {
        const message =
            typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
                ? error.message
                : 'Không tìm thấy QR này.';

        return (
            <div className='min-h-screen bg-slate-100 px-4 py-6'>
                <div className='mx-auto max-w-md'>
                    <Card className='rounded-3xl border-slate-200 shadow-sm'>
                        <Result status='404' title='Không tìm thấy QR' subTitle={message} />
                    </Card>
                </div>
            </div>
        );
    }

    const meta = statusMeta[publicData.status] ?? statusMeta.unused;
    const asset = publicData.asset;
    const internalAsset = internalData?.asset;
    const canActivate = Boolean(internalData?.canActivate);
    const canOpenInternalAsset = Boolean(internalAsset?.id);

    return (
        <div className='min-h-screen bg-slate-100 px-4 py-6 selection:bg-blue-100 sm:px-6'>
            <div className='mx-auto flex w-full max-w-md flex-col gap-4'>
                <Card className='overflow-hidden rounded-3xl border-slate-200 shadow-sm'>
                    <div className='mb-5 flex items-start justify-between gap-3'>
                        <div className='flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5'>
                            <QrcodeOutlined className='text-blue-600' />
                            <span className='text-[10px] font-bold tracking-wider text-blue-700 uppercase'>Tem QR</span>
                        </div>
                        <Tag color={meta.color} className='m-0 rounded-full px-3 py-1 text-sm font-bold'>
                            {meta.label}
                        </Tag>
                    </div>

                    <div className='mb-5'>
                        <Text type='secondary' className='text-xs font-bold tracking-wide uppercase'>
                            Mã tem
                        </Text>
                        <h1 className='m-0 mt-1 font-mono text-2xl font-black text-slate-900'>{publicData.publicId}</h1>
                    </div>

                    {asset ? (
                        <div className='grid gap-3'>
                            <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                                <Text type='secondary' className='text-xs font-bold tracking-wide uppercase'>
                                    Máy đã gán
                                </Text>
                                <h2 className='m-0 mt-1 text-xl font-bold text-slate-900'>{asset.name}</h2>
                                <p className='m-0 mt-2 font-mono text-sm font-semibold text-slate-600'>
                                    {asset.machineCode || '-'}
                                </p>
                            </div>
                            <div className='grid grid-cols-2 gap-3'>
                                <div className='rounded-2xl border border-slate-200 p-3'>
                                    <Text type='secondary' className='text-[11px] font-bold uppercase'>
                                        Model
                                    </Text>
                                    <div className='mt-1 font-semibold text-slate-800'>{asset.model || '-'}</div>
                                </div>
                                <div className='rounded-2xl border border-slate-200 p-3'>
                                    <Text type='secondary' className='text-[11px] font-bold uppercase'>
                                        Cơ sở
                                    </Text>
                                    <div className='mt-1 font-semibold text-slate-800'>
                                        {asset.facility?.name || '-'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className='rounded-2xl border border-blue-100 bg-blue-50 p-4'>
                            <div className='flex gap-3'>
                                <SafetyCertificateOutlined className='mt-1 text-xl text-blue-600' />
                                <div>
                                    <div className='font-bold text-blue-900'>Tem QR chưa được kích hoạt</div>
                                    <p className='m-0 mt-1 text-sm leading-6 text-blue-800'>
                                        Tem này có thể được dán lên máy thực tế. Tài khoản có quyền sẽ kích hoạt và nhập
                                        hồ sơ máy đầy đủ.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                <Card className='rounded-3xl border-slate-200 shadow-sm'>
                    <div className='grid gap-2'>
                        {canActivate ? (
                            <Button
                                type='primary'
                                size='large'
                                icon={<EditOutlined />}
                                onClick={() => navigate(`/qr/${publicData.publicId}/activate`)}
                            >
                                Cập nhật thông tin máy cho tem này
                            </Button>
                        ) : null}
                        {canOpenInternalAsset ? (
                            <Button
                                size='large'
                                icon={<ToolOutlined />}
                                onClick={() => navigate(`/assets/${internalAsset?.id}`)}
                            >
                                Mở hồ sơ nội bộ
                            </Button>
                        ) : null}
                        {!isAuthenticated ? (
                            <Button
                                size='large'
                                icon={<LoginOutlined />}
                                onClick={() =>
                                    navigate(`/login?redirect=${encodeURIComponent(`/qr/${publicData.publicId}`)}`)
                                }
                            >
                                Đăng nhập để cập nhật
                            </Button>
                        ) : null}
                        {isAuthenticated && !canManage ? (
                            <Text type='secondary' className='text-center text-sm'>
                                Tài khoản hiện tại không có quyền kích hoạt hoặc cập nhật tem QR.
                            </Text>
                        ) : null}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default QrResolverPage;
