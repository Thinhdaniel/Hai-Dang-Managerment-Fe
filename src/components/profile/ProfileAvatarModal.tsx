import { useEffect, useRef, useState } from 'react';
import { Alert, App, Avatar, Button, Modal } from 'antd';
import { Camera, Check, Trash2, X } from 'lucide-react';
import { useAuth } from '../../core/contexts/AuthContext';
import { userService } from '../../core/services';
import '../../styles/profile-avatar.css';

type Props = { onClose: () => void };

export default function ProfileAvatarModal({ onClose }: Props) {
    const { user, updateProfile } = useAuth();
    const { message, modal } = App.useApp();
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string>();
    const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const close = () => {
        if (busy) return;
        if (!file) return onClose();
        modal.confirm({
            title: 'Bỏ ảnh chưa lưu?',
            okText: 'Bỏ thay đổi',
            cancelText: 'Tiếp tục sửa',
            onOk: onClose,
        });
    };
    const pick = (chosen?: File) => {
        if (!chosen) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) {
            setError('Chọn ảnh JPG, PNG hoặc WEBP.');
            return;
        }
        if (chosen.size > 5 * 1024 * 1024) {
            setError('Ảnh không được lớn hơn 5 MB.');
            return;
        }
        setFile(chosen);
        setError('');
    };
    const save = async () => {
        if (!file || busy) return;
        setBusy('save');
        setError('');
        try {
            const updated = await userService.updateMyAvatar(file);
            updateProfile(updated);
            message.success('Đã lưu ảnh đại diện');
            onClose();
        } catch {
            setError('Không lưu được ảnh. Kiểm tra kết nối và thử lại, ảnh đã chọn vẫn được giữ.');
        } finally {
            setBusy(null);
        }
    };
    const remove = () =>
        modal.confirm({
            title: 'Gỡ ảnh đại diện?',
            okText: 'Gỡ ảnh',
            cancelText: 'Giữ lại',
            okButtonProps: { danger: true },
            onOk: async () => {
                setBusy('remove');
                setError('');
                try {
                    const updated = await userService.removeMyAvatar();
                    updateProfile(updated);
                    setFile(null);
                    setPreview(undefined);
                    message.success('Đã gỡ ảnh đại diện');
                } catch {
                    setError('Không gỡ được ảnh đại diện. Vui lòng thử lại.');
                } finally {
                    setBusy(null);
                }
            },
        });

    return (
        <Modal
            open
            title='Hồ sơ cá nhân'
            onCancel={close}
            width={460}
            className='profile-avatar-modal'
            maskClosable={!busy}
            closable={!busy}
            keyboard={!busy}
            footer={
                <div className='profile-avatar-actions'>
                    <Button onClick={close} disabled={Boolean(busy)}>
                        Đóng
                    </Button>
                    <Button
                        type='primary'
                        icon={<Check size={17} />}
                        onClick={() => void save()}
                        loading={busy === 'save'}
                        disabled={!file || busy === 'remove'}
                    >
                        Lưu ảnh
                    </Button>
                </div>
            }
        >
            <div className='profile-avatar-editor'>
                <Avatar size={112} src={file ? preview : user?.avatarUrl}>
                    {user?.name?.trim().split(' ').at(-1)?.slice(0, 1) || 'C'}
                </Avatar>
                <strong className='profile-avatar-name'>{user?.name}</strong>
                <div className='profile-avatar-picker'>
                    <Button icon={<Camera size={17} />} onClick={() => input.current?.click()} disabled={Boolean(busy)}>
                        {file || user?.avatarUrl ? 'Chọn ảnh khác' : 'Thêm ảnh đại diện'}
                    </Button>
                    {file && (
                        <Button
                            type='text'
                            icon={<X size={17} />}
                            title='Bỏ ảnh đã chọn'
                            aria-label='Bỏ ảnh đã chọn'
                            disabled={Boolean(busy)}
                            onClick={() => {
                                setFile(null);
                                setPreview(undefined);
                                setError('');
                            }}
                        />
                    )}
                </div>
                <input
                    ref={input}
                    type='file'
                    accept='image/jpeg,image/png,image/webp'
                    hidden
                    aria-label='Chọn ảnh đại diện'
                    onChange={(event) => {
                        pick(event.target.files?.[0]);
                        event.target.value = '';
                    }}
                />
                <small className='profile-avatar-format'>JPG, PNG, WEBP · Tối đa 5 MB</small>
                {file && <small className='profile-avatar-selected'>{file.name} · Chưa lưu</small>}
            </div>
            {error && <Alert type='error' showIcon title={error} className='profile-avatar-error' />}
            <dl className='profile-avatar-info'>
                <div>
                    <dt>Tên đăng nhập</dt>
                    <dd>{user?.username || '—'}</dd>
                </div>
                {user?.email && (
                    <div>
                        <dt>Email</dt>
                        <dd>{user.email}</dd>
                    </div>
                )}
                {user?.plant?.name && (
                    <div>
                        <dt>Cơ sở</dt>
                        <dd>{user.plant.name}</dd>
                    </div>
                )}
            </dl>
            {user?.avatarUrl && (
                <Button
                    danger
                    type='text'
                    icon={<Trash2 size={16} />}
                    onClick={remove}
                    disabled={Boolean(busy)}
                    loading={busy === 'remove'}
                >
                    Gỡ ảnh đại diện
                </Button>
            )}
        </Modal>
    );
}
