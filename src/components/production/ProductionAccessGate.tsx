import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Spin } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/contexts/AuthContext';
import { isProductionOperator } from '../../core/lib/permissions';
import { productionService } from '../../core/services/production.service';

const COMPANY_LOGO_URL = '/brand/company-logo.png';

const AccessState = ({
    title,
    description,
    error,
    retrying,
    onRetry,
}: {
    title: string;
    description: string;
    error?: boolean;
    retrying?: boolean;
    onRetry?: () => void;
}) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const operatorOnly = isProductionOperator(user?.role);

    return (
        <main className='flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10'>
            <section className='w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70'>
                <div className='border-b border-slate-100 bg-slate-950 px-6 py-5 text-white'>
                    <div className='flex items-center gap-3'>
                        <img
                            src={COMPANY_LOGO_URL}
                            alt='Hải Đăng'
                            className='h-11 w-11 rounded-md bg-white object-contain'
                        />
                        <div>
                            <span className='text-xs font-semibold text-blue-300 uppercase'>Hải Đăng Production</span>
                            <h1 className='text-lg font-bold'>{user?.plant?.name || 'Phân hệ Sản xuất'}</h1>
                        </div>
                    </div>
                </div>
                <div className='p-6 sm:p-8'>
                    <div className='mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-xl text-blue-700'>
                        <SafetyCertificateOutlined />
                    </div>
                    <h2 className='text-xl font-bold text-slate-900'>{title}</h2>
                    <p className='mt-2 text-sm leading-6 text-slate-600'>{description}</p>

                    {error ? (
                        <Alert
                            className='mt-5 rounded-md'
                            type='warning'
                            showIcon
                            title='Kết nối kiểm tra quyền đang gián đoạn'
                            description='Hệ thống chưa kết luận tài khoản bị khóa. Hãy thử tải lại để tránh thao tác nhầm.'
                        />
                    ) : null}

                    <div className='mt-7 flex flex-col gap-2 sm:flex-row'>
                        {onRetry ? (
                            <Button
                                type='primary'
                                icon={<ReloadOutlined />}
                                loading={retrying}
                                onClick={onRetry}
                                className='sm:flex-1'
                            >
                                Kiểm tra lại
                            </Button>
                        ) : null}
                        {!operatorOnly ? (
                            <Button onClick={() => navigate('/dashboard')} className='sm:flex-1'>
                                Về hệ thống quản lý
                            </Button>
                        ) : null}
                        <Button
                            danger
                            onClick={() => {
                                void logout();
                                navigate('/login', { replace: true });
                            }}
                            className='sm:flex-1'
                        >
                            Đăng xuất
                        </Button>
                    </div>
                </div>
            </section>
        </main>
    );
};

const ProductionAccessGate = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const accessQuery = useQuery({
        queryKey: ['production-access', user?.plantId],
        queryFn: () => productionService.getAccess(),
        enabled: Boolean(user),
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
    });

    if (accessQuery.isPending) {
        return (
            <div className='flex min-h-dvh items-center justify-center bg-slate-100'>
                <Spin size='large' tip='Đang kiểm tra quyền Sản xuất...' />
            </div>
        );
    }

    if (accessQuery.isError) {
        return (
            <AccessState
                title='Chưa kiểm tra được quyền truy cập'
                description='Kết nối tới máy chủ đang gián đoạn. Hệ thống tạm dừng mở dữ liệu Sản xuất để bảo vệ phạm vi cơ sở.'
                error
                retrying={accessQuery.isFetching}
                onRetry={() => void accessQuery.refetch()}
            />
        );
    }

    if (!accessQuery.data?.canAccess) {
        return (
            <AccessState
                title='Cơ sở chưa triển khai Sản xuất'
                description='Phân hệ này hiện mới được triển khai tại các cơ sở đã kích hoạt. Các quyền và dữ liệu ở những phần khác của hệ thống không bị thay đổi.'
                retrying={accessQuery.isFetching}
                onRetry={() => void accessQuery.refetch()}
            />
        );
    }

    return children;
};

export default ProductionAccessGate;
