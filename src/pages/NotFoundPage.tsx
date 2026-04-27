import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50">
            <Result
                status="404"
                title={<span className="text-3xl font-black text-slate-800">404</span>}
                subTitle={<span className="text-base text-slate-500">Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ.</span>}
                extra={
                    <Button type="primary" size="large" onClick={() => navigate('/')} className="mt-4 bg-blue-600 font-medium hover:bg-blue-700">
                        Về trang chủ
                    </Button>
                }
            />
        </div>
    );
};

export default NotFoundPage;
