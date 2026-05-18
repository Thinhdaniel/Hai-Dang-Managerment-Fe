import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate, useRouteError } from 'react-router-dom';

interface RouteErrorLike {
    status?: number;
    statusText?: string;
    message?: string;
}

const RouteErrorPage: React.FC = () => {
    const navigate = useNavigate();
    const error = useRouteError() as RouteErrorLike;

    const statusCode = error?.status === 404 ? '404' : '500';
    const title = statusCode === '404' ? '404' : 'Đã xảy ra lỗi';
    const subTitle =
        error?.statusText ||
        error?.message ||
        (statusCode === '404'
            ? 'Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ.'
            : 'Ứng dụng gặp lỗi không mong muốn. Vui lòng tải lại trang hoặc quay lại trang chủ.');

    return (
        <div className='flex h-screen w-full flex-col items-center justify-center bg-slate-50'>
            <Result
                status={statusCode}
                title={<span className='text-3xl font-black text-slate-800'>{title}</span>}
                subTitle={<span className='text-base text-slate-500'>{subTitle}</span>}
                extra={
                    <div className='mt-4 flex items-center gap-3'>
                        <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
                        <Button type='primary' onClick={() => navigate('/dashboard')}>
                            Về Dashboard
                        </Button>
                    </div>
                }
            />
        </div>
    );
};

export default RouteErrorPage;
