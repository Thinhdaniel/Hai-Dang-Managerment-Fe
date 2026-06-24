import React, { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import { useNavigate, useRouteError } from 'react-router-dom';
import { maybeRecoverFromStaleError } from '../core/lib/stale-asset-recovery';

interface RouteErrorLike {
    status?: number;
    statusText?: string;
    message?: string;
}

const RouteErrorPage: React.FC = () => {
    const navigate = useNavigate();
    const error = useRouteError() as RouteErrorLike;

    // Lỗi lệch module do service worker cache chunk cũ -> tự xoá cache + reload (không bắt người dùng tự xử lý).
    const [recovering, setRecovering] = useState(false);
    useEffect(() => {
        if (maybeRecoverFromStaleError(error)) setRecovering(true);
    }, [error]);

    if (recovering) {
        return (
            <div className='flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-50'>
                <Spin size='large' />
                <div className='text-base font-medium text-slate-600'>Đang cập nhật phiên bản mới…</div>
                <div className='max-w-xs text-center text-[13px] text-slate-400'>
                    Hệ thống vừa được nâng cấp, đang làm mới dữ liệu trên máy bạn. Vui lòng đợi trong giây lát.
                </div>
            </div>
        );
    }

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
