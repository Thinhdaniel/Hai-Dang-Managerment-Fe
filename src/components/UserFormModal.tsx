import { useEffect } from 'react';
import { Button, Form, Input, Modal, Select, Switch } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { USER_ROLE_LABEL } from '../core/constants';
import { UserRole, type CreateUserPayload, type UpdateUserPayload, type User } from '../core/types';

type UserFormValues = {
    name: string;
    email: string;
    role: UserRole;
    password?: string;
    isActive?: boolean;
};

type BaseUserFormModalProps = {
    open: boolean;
    submitting?: boolean;
    onClose: () => void;
};

type CreateUserFormModalProps = BaseUserFormModalProps & {
    mode?: 'create';
    initialValues?: null;
    isCurrentUser?: false;
    onSubmit: (values: CreateUserPayload) => Promise<void> | void;
};

type EditUserFormModalProps = BaseUserFormModalProps & {
    mode: 'edit';
    initialValues: User;
    isCurrentUser?: boolean;
    onSubmit: (values: UpdateUserPayload) => Promise<void> | void;
};

type UserFormModalProps = CreateUserFormModalProps | EditUserFormModalProps;

const roleOptions = [
    { value: UserRole.ADMIN, label: USER_ROLE_LABEL[UserRole.ADMIN] },
    { value: UserRole.MANAGER, label: USER_ROLE_LABEL[UserRole.MANAGER] },
    { value: UserRole.STAFF, label: USER_ROLE_LABEL[UserRole.STAFF] },
];

const sanitizeValue = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');

const UserFormModal = (props: UserFormModalProps) => {
    const { mode = 'create', open, submitting, onClose } = props;
    const [form] = Form.useForm<UserFormValues>();
    const isEditMode = mode === 'edit';
    const initialValues = isEditMode ? props.initialValues : null;
    const isCurrentUser = isEditMode ? (props.isCurrentUser ?? false) : false;

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }

        if (isEditMode && initialValues) {
            form.setFieldsValue({
                name: initialValues.name,
                email: initialValues.email,
                role: initialValues.role,
                isActive: initialValues.isActive,
            });
            return;
        }

        form.setFieldsValue({
            role: UserRole.STAFF,
            isActive: true,
        });
    }, [form, initialValues, isEditMode, open]);

    const handleSubmit = async () => {
        const values = await form.validateFields();

        if (props.mode === 'edit') {
            await props.onSubmit({
                name: sanitizeValue(values.name),
                role: values.role,
                isActive: values.isActive !== false,
            });
        } else {
            await props.onSubmit({
                name: sanitizeValue(values.name),
                email: sanitizeValue(values.email).toLowerCase(),
                role: values.role,
                password: values.password || '',
            });
        }

        form.resetFields();
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onOk={handleSubmit}
            confirmLoading={submitting}
            title={
                <div className='flex items-center gap-2 border-b border-slate-100 pb-2'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600'>
                        {isEditMode ? <EditOutlined /> : <PlusOutlined />}
                    </div>
                    <span className='text-lg font-bold text-slate-800'>
                        {isEditMode ? 'Cập nhật người dùng' : 'Thêm người dùng mới'}
                    </span>
                </div>
            }
            okText={isEditMode ? 'Cập nhật' : 'Tạo mới'}
            cancelText='Hủy'
            width={620}
            destroyOnHidden
            maskClosable={false}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
            footer={[
                <Button key='cancel' onClick={onClose} className='rounded-lg'>
                    Hủy
                </Button>,
                <Button
                    key='submit'
                    type='primary'
                    loading={submitting}
                    onClick={handleSubmit}
                    className='rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700'
                >
                    {isEditMode ? 'Cập nhật' : 'Tạo mới'}
                </Button>,
            ]}
        >
            <Form
                form={form}
                layout='vertical'
                className='mt-4 flex flex-col gap-5 [&_.ant-form-item]:mb-0 [&_.ant-input]:rounded-lg [&_.ant-input-affix-wrapper]:rounded-lg [&_.ant-select-selector]:!rounded-lg'
            >
                <Form.Item
                    name='name'
                    label='Họ và tên'
                    rules={[
                        { required: true, message: 'Vui lòng nhập họ và tên' },
                        { min: 2, message: 'Tên người dùng tối thiểu 2 ký tự' },
                    ]}
                >
                    <Input placeholder='Ví dụ: Trần Văn Quản' size='large' maxLength={120} />
                </Form.Item>

                <Form.Item
                    name='email'
                    label='Email'
                    rules={[
                        { required: true, message: 'Vui lòng nhập email' },
                        { type: 'email', message: 'Email không hợp lệ' },
                    ]}
                >
                    <Input placeholder='name@company.com' size='large' maxLength={120} disabled={isEditMode} />
                </Form.Item>

                <Form.Item
                    name='role'
                    label='Phân quyền'
                    rules={[{ required: true, message: 'Vui lòng chọn phân quyền' }]}
                    extra={isCurrentUser && isEditMode ? 'Không thể tự thay đổi phân quyền của chính mình.' : undefined}
                >
                    <Select size='large' options={roleOptions} disabled={isCurrentUser && isEditMode} />
                </Form.Item>

                {isEditMode ? (
                    <Form.Item
                        name='isActive'
                        label='Trạng thái hoạt động'
                        valuePropName='checked'
                        className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'
                    >
                        <Switch checkedChildren='Hoạt động' unCheckedChildren='Ngừng hoạt động' />
                    </Form.Item>
                ) : (
                    <Form.Item
                        name='password'
                        label='Mật khẩu tạm'
                        rules={[
                            { required: true, message: 'Vui lòng nhập mật khẩu' },
                            { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                        ]}
                    >
                        <Input.Password placeholder='Tạo mật khẩu đăng nhập ban đầu' size='large' maxLength={100} />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};

export default UserFormModal;
