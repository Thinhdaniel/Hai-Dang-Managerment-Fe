import React from 'react';
import { Button, Result } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const ComingSoonPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-full min-h-[70vh] flex-col items-center justify-center">
            <Result
                icon={<CodeOutlined className="text-blue-500" />}
                title={<span className="text-2xl font-bold text-slate-800">Tính năng đang phát triển</span>}
                subTitle={
                    <span className="text-slate-500">
                        Module này hiện chưa hoàn thiện. Đội ngũ kỹ thuật của chúng tôi đang nỗ lực cập nhật trong thời gian sớm nhất!
                    </span>
                }
                extra={
                    <Button type="primary" onClick={() => navigate('/')} className="bg-blue-600 px-6 font-medium hover:bg-blue-700">
                        Quay lại Trang Chủ
                    </Button>
                }
            />
        </div>
    );
};

export default ComingSoonPage;
