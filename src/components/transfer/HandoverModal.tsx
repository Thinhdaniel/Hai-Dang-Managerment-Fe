import { useState } from 'react';
import { Button, Form, Input, Modal, Upload, message as antMessage } from 'antd';
import { CameraOutlined, CheckCircleOutlined, DeleteOutlined, LoadingOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { APP_ENVs } from '../../core/config/enviroments';

type HandoverPayload = {
    receivedBy: string;
    handoverImages: string[];
};

type Props = {
    open: boolean;
    assetName?: string;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (payload: HandoverPayload) => Promise<void>;
};

type UploadItem = {
    uid: string;
    file: File;
    previewUrl: string;
    cloudUrl?: string;
    uploading: boolean;
    error?: boolean;
};

const MAX_IMAGES = 3;

const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', APP_ENVs.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'handover');

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${APP_ENVs.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
    );

    if (!res.ok) throw new Error('Upload thất bại');
    const data = await res.json();
    return data.secure_url as string;
};

const HandoverModal = ({ open, assetName, submitting, onClose, onSubmit }: Props) => {
    const [form] = Form.useForm();
    const [images, setImages] = useState<UploadItem[]>([]);

    const handleClose = () => {
        form.resetFields();
        setImages([]);
        onClose();
    };

    const handleFileSelect = async (file: File) => {
        if (images.length >= MAX_IMAGES) {
            antMessage.warning(`Tối đa ${MAX_IMAGES} ảnh`);
            return;
        }

        const uid = `${Date.now()}-${Math.random()}`;
        const previewUrl = URL.createObjectURL(file);
        const item: UploadItem = { uid, file, previewUrl, uploading: true };

        setImages((prev) => [...prev, item]);

        try {
            const cloudUrl = await uploadToCloudinary(file);
            setImages((prev) =>
                prev.map((i) => (i.uid === uid ? { ...i, cloudUrl, uploading: false } : i))
            );
        } catch {
            setImages((prev) =>
                prev.map((i) => (i.uid === uid ? { ...i, uploading: false, error: true } : i))
            );
            antMessage.error('Upload ảnh thất bại, thử lại');
        }
    };

    const removeImage = (uid: string) => {
        setImages((prev) => {
            const item = prev.find((i) => i.uid === uid);
            if (item) URL.revokeObjectURL(item.previewUrl);
            return prev.filter((i) => i.uid !== uid);
        });
    };

    const handleFinish = async (values: { receivedBy: string }) => {
        const uploading = images.some((i) => i.uploading);
        if (uploading) {
            antMessage.warning('Đang upload ảnh, vui lòng chờ...');
            return;
        }
        const cloudUrls = images.filter((i) => i.cloudUrl && !i.error).map((i) => i.cloudUrl!);
        await onSubmit({ receivedBy: values.receivedBy.trim(), handoverImages: cloudUrls });
        handleClose();
    };

    const isUploading = images.some((i) => i.uploading);

    return (
        <Modal
            open={open}
            title={
                <div className='flex items-center gap-2 pb-2 border-b border-slate-100'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600'>
                        <CheckCircleOutlined />
                    </div>
                    <span className='text-base font-bold text-slate-800'>Xác nhận bàn giao thiết bị</span>
                </div>
            }
            onCancel={handleClose}
            width={560}
            maskClosable={false}
            destroyOnHidden
            footer={[
                <Button key='cancel' onClick={handleClose} className='rounded-lg'>Hủy</Button>,
                <Button
                    key='submit'
                    type='primary'
                    loading={submitting || isUploading}
                    onClick={() => form.submit()}
                    className='rounded-lg bg-emerald-600 font-medium hover:!bg-emerald-700'
                    icon={<CheckCircleOutlined />}
                >
                    {isUploading ? 'Đang upload...' : 'Xác nhận hoàn tất'}
                </Button>,
            ]}
        >
            {/* Asset info */}
            {assetName && (
                <div className='mb-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3'>
                    <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Thiết bị</span>
                    <div className='mt-0.5 font-semibold text-slate-800'>{assetName}</div>
                </div>
            )}

            <Form form={form} layout='vertical' onFinish={handleFinish} className='flex flex-col gap-4 [&_.ant-form-item]:mb-0'>
                {/* Người nhận */}
                <Form.Item
                    label={<span className='font-medium text-slate-700'>Người nhận bàn giao <span className='text-rose-500'>*</span></span>}
                    name='receivedBy'
                    rules={[{ required: true, message: 'Vui lòng nhập tên người nhận' }]}
                >
                    <Input
                        size='large'
                        placeholder='Họ tên người nhận thiết bị...'
                        className='rounded-lg'
                        prefix={<span className='text-slate-300 mr-1'>👤</span>}
                    />
                </Form.Item>

                {/* Upload ảnh */}
                <div>
                    <div className='mb-2 font-medium text-slate-700'>
                        Ảnh xác nhận bàn giao
                        <span className='ml-1.5 text-xs font-normal text-slate-400'>(tùy chọn, tối đa {MAX_IMAGES} ảnh)</span>
                    </div>

                    <div className='flex flex-wrap gap-3'>
                        {/* Preview ảnh đã chọn */}
                        {images.map((item) => (
                            <div
                                key={item.uid}
                                className='relative h-24 w-24 overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50'
                            >
                                <img
                                    src={item.previewUrl}
                                    alt='preview'
                                    className='h-full w-full object-cover'
                                />
                                {/* Overlay trạng thái */}
                                {item.uploading && (
                                    <div className='absolute inset-0 flex items-center justify-center bg-black/40'>
                                        <LoadingOutlined className='text-xl text-white' />
                                    </div>
                                )}
                                {item.error && (
                                    <div className='absolute inset-0 flex items-center justify-center bg-rose-500/60'>
                                        <span className='text-xs font-bold text-white'>Lỗi</span>
                                    </div>
                                )}
                                {!item.uploading && (
                                    <button
                                        type='button'
                                        onClick={() => removeImage(item.uid)}
                                        className='absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70'
                                    >
                                        <DeleteOutlined style={{ fontSize: 10 }} />
                                    </button>
                                )}
                                {item.cloudUrl && !item.uploading && (
                                    <div className='absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500'>
                                        <CheckCircleOutlined style={{ fontSize: 9, color: 'white' }} />
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Nút thêm ảnh */}
                        {images.length < MAX_IMAGES && (
                            <label className='flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-500'>
                                <CameraOutlined className='text-xl' />
                                <span className='text-xs font-medium'>Thêm ảnh</span>
                                <input
                                    type='file'
                                    accept='image/jpeg,image/png,image/webp'
                                    style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileSelect(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        )}
                    </div>

                    {images.length > 0 && (
                        <p className='mt-2 text-xs text-slate-400'>
                            {images.filter((i) => i.cloudUrl).length}/{images.length} ảnh đã upload thành công
                        </p>
                    )}
                </div>
            </Form>
        </Modal>
    );
};

export default HandoverModal;
