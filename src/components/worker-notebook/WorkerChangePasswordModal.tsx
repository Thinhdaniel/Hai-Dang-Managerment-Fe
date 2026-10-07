import { useRef, useState } from 'react';
import { Alert, App, Button, Form, Input, Modal } from 'antd';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../core/contexts/AuthContext';
import { resolveAuthErrorMessage } from '../../core/lib/auth';
import { UserRole } from '../../core/types';
import '../../styles/worker-password.css';

type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };
type Props = { onClose: () => void };

const visibilityIcon = (label: string, disabled: boolean) => (visible: boolean) => (
    <button type='button' aria-label={`${visible ? 'Ẩn' : 'Hiện'} ${label}`} aria-pressed={visible} disabled={disabled}>
        {visible ? <EyeOff size={18} aria-hidden='true' /> : <Eye size={18} aria-hidden='true' />}
    </button>
);

export default function WorkerChangePasswordModal({ onClose }: Props) {
    const { user, changePassword } = useAuth();
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<PasswordValues>();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);

    const close = () => {
        if (pending.current) return;
        const discard = () => {
            form.resetFields();
            onClose();
        };
        if (!Object.values(form.getFieldsValue()).some(Boolean)) return discard();
        modal.confirm({
            title: 'Bỏ thay đổi mật khẩu?',
            content: 'Mật khẩu chưa được đổi. Các thông tin vừa nhập sẽ được xóa.',
            okText: 'Bỏ thay đổi',
            cancelText: 'Tiếp tục nhập',
            onOk: discard,
        });
    };

    const save = async (values: PasswordValues) => {
        if (pending.current) return;
        pending.current = true;
        setSubmitting(true);
        setError('');
        try {
            await changePassword(values);
            form.resetFields();
            message.success('Đã đổi mật khẩu. Các phiên đăng nhập cũ đã được đăng xuất.');
            onClose();
        } catch (cause) {
            if (cause && typeof cause === 'object' && 'errors' in cause && Array.isArray(cause.errors)) {
                const fields = cause.errors.filter(
                    (item): item is { field: keyof PasswordValues; message: string } =>
                        item &&
                        ['currentPassword', 'newPassword', 'confirmPassword'].includes(item.field) &&
                        typeof item.message === 'string'
                );
                form.setFields(fields.map((item) => ({ name: item.field, errors: [item.message] })));
            }
            const fallback = 'Không đổi được mật khẩu. Kiểm tra kết nối và thử lại.';
            const detail = resolveAuthErrorMessage(cause, fallback);
            setError(detail === 'Network Error' ? fallback : detail);
        } finally {
            pending.current = false;
            setSubmitting(false);
        }
    };

    if (user?.role !== UserRole.WORKER) return null;

    return (
        <Modal
            open
            title='Đổi mật khẩu'
            width={460}
            className='wn-password-modal'
            onCancel={close}
            afterOpenChange={(open) => {
                if (open) form.focusField('currentPassword');
            }}
            maskClosable={!submitting}
            closable={!submitting}
            keyboard={!submitting}
            footer={
                <div className='wn-password-actions'>
                    <Button onClick={close} disabled={submitting}>
                        Hủy
                    </Button>
                    <Button
                        type='primary'
                        htmlType='submit'
                        form='worker-change-password'
                        icon={<LockKeyhole size={17} />}
                        loading={submitting}
                    >
                        Lưu mật khẩu
                    </Button>
                </div>
            }
        >
            <div className='wn-password-note' id='worker-password-description'>
                <ShieldCheck size={22} aria-hidden='true' />
                <p>
                    Mật khẩu mới không hiển thị cho quản trị viên. Sau khi đổi, các phiên đăng nhập cũ sẽ bị đăng xuất;
                    bạn vẫn tiếp tục dùng sổ trên thiết bị này.
                </p>
            </div>
            {error && <Alert type='error' showIcon title={error} role='alert' className='wn-password-error' />}
            <Form
                id='worker-change-password'
                name='worker-change-password'
                form={form}
                layout='vertical'
                size='large'
                requiredMark={false}
                disabled={submitting}
                onFinish={save}
                aria-describedby='worker-password-description'
                onValuesChange={() => setError('')}
            >
                <Form.Item
                    name='currentPassword'
                    label='Mật khẩu hiện tại'
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
                >
                    <Input.Password
                        autoComplete='current-password'
                        autoFocus
                        placeholder='Nhập mật khẩu đang dùng'
                        iconRender={visibilityIcon('mật khẩu hiện tại', submitting)}
                    />
                </Form.Item>
                <Form.Item
                    name='newPassword'
                    label='Mật khẩu mới'
                    dependencies={['currentPassword']}
                    extra='Ít nhất 8 ký tự. Không dùng lại mật khẩu hiện tại.'
                    rules={[
                        { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                        { min: 8, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' },
                        {
                            validator: (_, value: string) =>
                                !value || new TextEncoder().encode(value).length <= 72
                                    ? Promise.resolve()
                                    : Promise.reject(
                                          new Error(
                                              'Mật khẩu quá dài. Tối đa 72 ký tự nếu chỉ dùng chữ và số không dấu.'
                                          )
                                      ),
                        },
                        ({ getFieldValue }) => ({
                            validator: (_, value: string) =>
                                !value || value !== getFieldValue('currentPassword')
                                    ? Promise.resolve()
                                    : Promise.reject(new Error('Mật khẩu mới phải khác mật khẩu hiện tại')),
                        }),
                    ]}
                >
                    <Input.Password
                        autoComplete='new-password'
                        placeholder='Tạo mật khẩu riêng của bạn'
                        iconRender={visibilityIcon('mật khẩu mới', submitting)}
                    />
                </Form.Item>
                <Form.Item
                    name='confirmPassword'
                    label='Xác nhận mật khẩu mới'
                    dependencies={['newPassword']}
                    rules={[
                        { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
                        ({ getFieldValue }) => ({
                            validator: (_, value: string) =>
                                !value || value === getFieldValue('newPassword')
                                    ? Promise.resolve()
                                    : Promise.reject(new Error('Mật khẩu xác nhận không khớp')),
                        }),
                    ]}
                >
                    <Input.Password
                        autoComplete='new-password'
                        placeholder='Nhập lại mật khẩu mới'
                        iconRender={visibilityIcon('mật khẩu xác nhận', submitting)}
                    />
                </Form.Item>
                <p className='wn-password-help'>Quên mật khẩu hiện tại? Liên hệ quản trị viên để được đặt lại.</p>
            </Form>
        </Modal>
    );
}
