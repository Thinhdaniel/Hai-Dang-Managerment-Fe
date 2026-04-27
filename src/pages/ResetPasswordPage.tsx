import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, Typography } from 'antd';
import { ArrowLeftOutlined, LockOutlined } from '@ant-design/icons';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AuthPageShell from '../components/auth/AuthPageShell';
import { useAuth } from '../core/contexts/AuthContext';
import { resolveAuthErrorMessage } from '../core/lib/auth';
import { authService } from '../core/services';

const { Text } = Typography;

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { isAuthenticated } = useAuth();
    const [searchParams] = useSearchParams();
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);

    if (isAuthenticated) {
        return <Navigate to='/dashboard' replace />;
    }

    const handleSubmit = async (values: { password: string; confirmPassword: string }) => {
        try {
            setSubmitting(true);
            setErrorMessage(null);

            await authService.resetPassword(token, values.password);
            message.success('Đặt lại mật khẩu thành công');
            navigate('/login', { replace: true });
        } catch (error) {
            setErrorMessage(
                resolveAuthErrorMessage(error, 'Không thể đặt lại mật khẩu. Vui lòng thử lại hoặc yêu cầu liên kết mới.')
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthPageShell
            eyebrow='Password Reset'
            title='Đặt lại mật khẩu'
            subtitle='Tạo mật khẩu mới để tiếp tục truy cập vào hệ thống quản lý thiết bị.'
        >
            {errorMessage ? (
                <Alert
                    type='error'
                    showIcon
                    message={errorMessage}
                    className='mb-6 rounded-lg border-rose-200 bg-rose-50 text-rose-700'
                />
            ) : null}

            {!token ? (
                <div className='flex flex-col gap-5'>
                    <Alert
                        type='warning'
                        showIcon
                        message='Liên kết đặt lại không hợp lệ'
                        description='Không tìm thấy token đặt lại mật khẩu trong đường dẫn. Vui lòng yêu cầu một liên kết mới từ màn hình quên mật khẩu.'
                        className='rounded-lg border-amber-200 bg-amber-50'
                    />

                    <div className='flex flex-col gap-3'>
                        <Button type='primary' size='large' className='h-12 rounded-lg bg-blue-600 font-medium'>
                            <Link to='/forgot-password'>Yêu cầu liên kết mới</Link>
                        </Button>
                        <Link
                            to='/login'
                            className='inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700'
                        >
                            <ArrowLeftOutlined />
                            Quay lại đăng nhập
                        </Link>
                    </div>
                </div>
            ) : (
                <>
                    <Form layout='vertical' size='large' onFinish={handleSubmit} autoComplete='off' requiredMark={false}>
                        <Form.Item
                            label={<span className='text-sm font-medium text-slate-700'>Mật khẩu mới</span>}
                            name='password'
                            rules={[
                                { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                                { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                            ]}
                            className='mb-5'
                        >
                            <Input.Password
                                prefix={<LockOutlined className='mr-1 text-slate-400' />}
                                placeholder='Tạo mật khẩu mới'
                                autoComplete='new-password'
                                className='h-12 rounded-lg'
                            />
                        </Form.Item>

                        <Form.Item
                            label={<span className='text-sm font-medium text-slate-700'>Xác nhận mật khẩu mới</span>}
                            name='confirmPassword'
                            dependencies={['password']}
                            rules={[
                                { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('password') === value) {
                                            return Promise.resolve();
                                        }

                                        return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                                    },
                                }),
                            ]}
                            className='mb-6'
                        >
                            <Input.Password
                                prefix={<LockOutlined className='mr-1 text-slate-400' />}
                                placeholder='Nhập lại mật khẩu mới'
                                autoComplete='new-password'
                                className='h-12 rounded-lg'
                            />
                        </Form.Item>

                        <div className='flex flex-col gap-4'>
                            <Button
                                type='primary'
                                htmlType='submit'
                                loading={submitting}
                                className='h-12 w-full rounded-lg bg-blue-600 text-base font-medium hover:!bg-blue-700'
                            >
                                Cập nhật mật khẩu
                            </Button>

                            <Link
                                to='/login'
                                className='inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700'
                            >
                                <ArrowLeftOutlined />
                                Quay lại đăng nhập
                            </Link>
                        </div>
                    </Form>

                    <Text className='mt-6 block text-xs leading-6 text-slate-400'>
                        Liên kết đặt lại chỉ có hiệu lực trong thời gian giới hạn theo chính sách bảo mật của hệ thống.
                    </Text>
                </>
            )}
        </AuthPageShell>
    );
};

export default ResetPasswordPage;
