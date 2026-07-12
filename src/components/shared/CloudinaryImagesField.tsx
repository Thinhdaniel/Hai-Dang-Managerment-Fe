import React, { useState } from 'react';
import { App, Image, Upload } from 'antd';
import { CameraOutlined, LoadingOutlined } from '@ant-design/icons';
import { APP_ENVs } from '../../core/config/enviroments';

// Field upload nhiều ảnh lên Cloudinary (unsigned preset) — dùng trong Form.Item (antd bơm value/onChange).
type Props = {
    value?: string[];
    onChange?: (value: string[]) => void;
    folder: string;
    max?: number;
    size?: number;
    emptyHint?: string;
};

const uploadToCloudinary = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', APP_ENVs.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${APP_ENVs.CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) throw new Error('Upload ảnh thất bại');
    const data = await res.json();
    return data.secure_url as string;
};

const CloudinaryImagesField: React.FC<Props> = ({ value = [], onChange, folder, max = 3, size = 64, emptyHint }) => {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);

    const pick = async (file: File) => {
        if (value.length >= max) {
            message.warning(`Tối đa ${max} ảnh`);
            return false;
        }
        setUploading(true);
        try {
            const url = await uploadToCloudinary(file, folder);
            onChange?.([...value, url]);
        } catch {
            message.error('Không tải được ảnh lên, thử lại');
        } finally {
            setUploading(false);
        }
        return false;
    };

    return (
        <div className='flex flex-wrap items-center gap-2'>
            <Image.PreviewGroup>
                {value.map((url) => (
                    <div key={url} className='relative shrink-0'>
                        <Image
                            src={url}
                            width={size}
                            height={size}
                            style={{ objectFit: 'cover', borderRadius: 10 }}
                            alt='Ảnh xác thực'
                        />
                        <button
                            type='button'
                            aria-label='Xoá ảnh'
                            onClick={() => onChange?.(value.filter((item) => item !== url))}
                            className='absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] leading-none text-white'
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </Image.PreviewGroup>
            {value.length < max && (
                <Upload accept='image/*' showUploadList={false} beforeUpload={pick} disabled={uploading}>
                    <button
                        type='button'
                        className='flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-blue-400 hover:text-blue-500'
                        style={{ width: size, height: size }}
                    >
                        {uploading ? <LoadingOutlined /> : <CameraOutlined />}
                    </button>
                </Upload>
            )}
            {!value.length && emptyHint ? <span className='text-xs text-slate-400'>{emptyHint}</span> : null}
        </div>
    );
};

export default CloudinaryImagesField;
