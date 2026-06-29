import React, { useState } from 'react';
import { Alert, App, Button, Form, Input, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthPageShell from '../components/auth/AuthPageShell';
import { useAuth } from '../core/contexts/AuthContext';
import { resolveAuthErrorMessage } from '../core/lib/auth';

const { Text } = Typography;

const getSafeRedirectPath = (value: string | null) => {
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
        return '/dashboard';
    }

    return value;
};

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { message } = App.useApp();
    const { login, isAuthenticated } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const redirectPath = getSafeRedirectPath(searchParams.get('redirect'));

    if (isAuthenticated) {
        return <Navigate to={redirectPath} replace />;
    }

    const handleSubmit = async (values: { email: string; password: string }) => {
        try {
            setSubmitting(true);
            setErrorMessage(null);
            await login(values.email, values.password);
            message.success('Đăng nhập thành công');
            navigate(redirectPath, { replace: true });
        } catch (error) {
            setErrorMessage(
                resolveAuthErrorMessage(error, 'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.')
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthPageShell
            eyebrow='Secure Sign In'
            title='Đăng nhập'
            subtitle='Sử dụng tài khoản được cấp để tiếp tục truy cập hệ thống quản lý thiết bị.'
        >
            {errorMessage ? (
                <Alert
                    type='error'
                    showIcon
                    title={errorMessage}
                    className='mb-6 rounded-lg border-rose-200 bg-rose-50 text-rose-700'
                />
            ) : null}

            <Form layout='vertical' size='large' onFinish={handleSubmit} autoComplete='on' requiredMark={false}>
                <Form.Item
                    label={<span className='text-sm font-medium text-slate-700'>Email công việc</span>}
                    name='email'
                    rules={[
                        { required: true, message: 'Vui lòng nhập email' },
                        { type: 'email', message: 'Email không hợp lệ' },
                    ]}
                    className='mb-5'
                >
                    <Input
                        prefix={<MailOutlined className='mr-1 text-slate-400' />}
                        placeholder='name@company.com'
                        autoComplete='email'
                        className='h-12 rounded-lg'
                    />
                </Form.Item>

                <Form.Item
                    label={<span className='text-sm font-medium text-slate-700'>Mật khẩu</span>}
                    name='password'
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                    className='mb-3'
                >
                    <Input.Password
                        prefix={<LockOutlined className='mr-1 text-slate-400' />}
                        placeholder='••••••••'
                        autoComplete='current-password'
                        className='h-12 rounded-lg'
                    />
                </Form.Item>

                <div className='mb-6 flex justify-end'>
                    <Link to='/forgot-password' className='text-sm font-medium text-blue-600 hover:text-blue-700'>
                        Quên mật khẩu?
                    </Link>
                </div>
                <div className='flex flex-col gap-4'>
                    <Button
                        type='primary'
                        htmlType='submit'
                        loading={submitting}
                        icon={!submitting ? <ArrowRightOutlined /> : undefined}
                        className='h-12 w-full rounded-lg bg-blue-600 text-base font-medium hover:!bg-blue-700'
                    >
                        Đăng nhập
                    </Button>

                    <Text className='text-center text-xs leading-6 text-slate-400'>
                        Phiên làm việc của bạn sẽ được đồng bộ với hệ thống xác thực hiện có của backend.
                    </Text>
                </div>
            </Form>
        </AuthPageShell>
    );
};

export default LoginPage;
