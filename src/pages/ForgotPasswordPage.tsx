import React, { useState } from 'react';
import { Alert, App, Button, Form, Input, Typography } from 'antd';
import { ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { Link, Navigate } from 'react-router-dom';
import AuthPageShell from '../components/auth/AuthPageShell';
import { useAuth } from '../core/contexts/AuthContext';
import { resolveAuthErrorMessage } from '../core/lib/auth';
import { authService } from '../core/services';

const { Text } = Typography;

const ForgotPasswordPage: React.FC = () => {
    const { message } = App.useApp();
    const { isAuthenticated } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

    if (isAuthenticated) {
        return <Navigate to='/dashboard' replace />;
    }

    const handleSubmit = async (values: { email: string }) => {
        try {
            setSubmitting(true);
            setErrorMessage(null);

            await authService.forgotPassword(values.email);
            setSubmittedEmail(values.email);
            message.success('Đã gửi hướng dẫn đặt lại mật khẩu');
        } catch (error) {
            setErrorMessage(
                resolveAuthErrorMessage(error, 'Không thể gửi yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau.')
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthPageShell
            eyebrow='Password Recovery'
            title='Quên mật khẩu'
            subtitle='Nhập email công việc để nhận hướng dẫn đặt lại mật khẩu từ hệ thống.'
        >
            {submittedEmail ? (
                <div className='flex flex-col gap-5'>
                    <Alert
                        type='success'
                        showIcon
                        title='Yêu cầu đã được ghi nhận'
                        description={`Nếu email ${submittedEmail} tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.`}
                        className='rounded-lg border-emerald-200 bg-emerald-50'
                    />

                    <div className='flex flex-col gap-3'>
                        <Button type='primary' size='large' className='h-12 rounded-lg bg-blue-600 font-medium'>
                            <Link to='/login'>Quay lại đăng nhập</Link>
                        </Button>
                        <Button
                            size='large'
                            className='h-12 rounded-lg'
                            onClick={() => {
                                setSubmittedEmail(null);
                                setErrorMessage(null);
                            }}
                        >
                            Gửi lại email khác
                        </Button>
                    </div>
                </div>
            ) : (
                <>
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
                            className='mb-6'
                        >
                            <Input
                                prefix={<MailOutlined className='mr-1 text-slate-400' />}
                                placeholder='name@company.com'
                                autoComplete='email'
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
                                Gửi liên kết đặt lại
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
                </>
            )}

            <Text className='mt-6 block text-xs leading-6 text-slate-400'>
                Hệ thống sẽ chỉ phản hồi chung để bảo vệ thông tin tài khoản nội bộ.
            </Text>
        </AuthPageShell>
    );
};

export default ForgotPasswordPage;
