import React, { useMemo, useRef } from 'react';
import { App, Button, Divider, Modal, QRCode, Space, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';

const { Paragraph, Text, Title } = Typography;

type AssetQrModalProps = {
    open: boolean;
    assetName: string;
    machineCode: string;
    publicId?: string;
    onClose: () => void;
};

const AssetQrModal: React.FC<AssetQrModalProps> = ({ open, assetName, machineCode, publicId, onClose }) => {
    const { message } = App.useApp();
    const qrContainerRef = useRef<HTMLDivElement | null>(null);

    const publicUrl = useMemo(() => {
        if (!publicId) {
            return '';
        }

        return new URL(`/public/machines/${publicId}`, window.location.origin).toString();
    }, [publicId]);

    const handleCopyLink = async () => {
        if (!publicUrl) {
            return;
        }

        await navigator.clipboard.writeText(publicUrl);
        message.success('Đã sao chép liên kết công khai');
    };

    const handleDownload = () => {
        const canvas = qrContainerRef.current?.querySelector('canvas');
        if (!canvas || !publicId) {
            return;
        }

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${machineCode || publicId}-qr.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <Modal
            title='QR công khai thiết bị'
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={420}
            destroyOnHidden
        >
            <div className='flex flex-col gap-6'>
                {/* ── BẢN PRVIEW TEM TÀI SẢN ── */}
                <div className='relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-black/5'>
                    {/* Header: Logo & Tên Công ty */}
                    <div className='flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4'>
                        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm'>
                            <img
                                src='https://res.cloudinary.com/dn0kgs7mi/image/upload/v1777042068/461879796_122098397930558026_2620600354798656289_n_zi0tf9.jpg'
                                alt='Hải Đăng Logo'
                                className='h-9 w-9 rounded-lg object-cover'
                            />
                        </div>
                        <div className='flex flex-col justify-center'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>
                                Công ty TNHH May Xuất Khẩu
                            </span>
                            <span className='text-sm font-black uppercase tracking-wide text-blue-700'>
                                Hải Đăng
                            </span>
                        </div>
                    </div>

                    {/* Body: Mã QR và Thông tin thiết bị */}
                    <div className='flex flex-col items-center px-6 pb-6 pt-5'>
                        {/* Box chứa QR */}
                        <div className='relative mb-5 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]'>
                            {publicUrl ? (
                                <div ref={qrContainerRef}>
                                    <QRCode
                                        value={publicUrl}
                                        type='canvas'
                                        size={180}
                                        bordered={false}
                                        color='#0f172a'
                                    />
                                </div>
                            ) : (
                                <div className='flex h-[180px] w-[180px] items-center justify-center text-sm font-medium text-slate-400'>
                                    Chưa có mã QR
                                </div>
                            )}
                        </div>

                        {/* Thông tin máy */}
                        <div className='w-full text-center'>
                            <h3 className='mb-2 text-base font-bold leading-snug text-slate-800 line-clamp-2'>
                                {assetName}
                            </h3>
                            <div className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm'>
                                <span className='text-[11px] font-bold uppercase tracking-wide text-slate-500'>
                                    Mã máy
                                </span>
                                <span className='font-mono text-sm font-bold text-slate-900'>{machineCode}</span>
                            </div>
                            
                            {publicId && (
                                <div className='mt-4 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400'>
                                    <span>ID:</span>
                                    <span className='font-mono'>{publicId}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── THÔNG TIN KHÁC & HÀNH ĐỘNG ── */}
                <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                    <Text className='block text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                        Liên kết trực tuyến
                    </Text>
                    <Paragraph copyable={false} className='!mb-0 !mt-1.5 break-all font-mono text-[13px] text-slate-700'>
                        {publicUrl || '-'}
                    </Paragraph>
                </div>

                <Space.Compact block size='large'>
                    <Button icon={<CopyOutlined />} onClick={handleCopyLink} disabled={!publicUrl}>
                        Copy link
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!publicUrl}>
                        Tải QR
                    </Button>
                    <Button
                        type='primary'
                        icon={<LinkOutlined />}
                        onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                        disabled={!publicUrl}
                        className='bg-blue-600 font-medium hover:bg-blue-700'
                    >
                        Mở trang public
                    </Button>
                </Space.Compact>
            </div>
        </Modal>
    );
};

export default AssetQrModal;
