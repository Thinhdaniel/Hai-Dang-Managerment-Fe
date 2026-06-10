import React, { useState } from 'react';
import { App, Modal } from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import QrCameraScanner from './QrCameraScanner';
import { resolveAssetByScan } from '../core/lib/qrScan';
import type { Asset } from '../core/types';

type QrScanLookupModalProps = {
    open: boolean;
    onClose: () => void;
    onResolved: (asset: Asset) => void;
};

const QrScanLookupModal: React.FC<QrScanLookupModalProps> = ({ open, onClose, onResolved }) => {
    const { message } = App.useApp();
    const [resolving, setResolving] = useState(false);

    const handleDetected = async (rawValue: string) => {
        if (resolving) return;
        setResolving(true);
        try {
            const { asset, ambiguous } = await resolveAssetByScan(rawValue);
            if (!asset) {
                if (ambiguous) {
                    message.warning('Mã nhập vào khớp nhiều máy — hãy nhập chính xác mã máy hoặc quét QR.');
                } else {
                    message.error('Không tìm thấy máy từ mã vừa quét.');
                }
                return;
            }
            message.success(`Mở hồ sơ "${asset.name}"`);
            onResolved(asset);
        } finally {
            setResolving(false);
        }
    };

    return (
        <Modal
            open={open}
            centered
            width={460}
            destroyOnHidden
            footer={null}
            onCancel={onClose}
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm'>
                        <ScanOutlined />
                    </div>
                    <div>
                        <div className='text-base font-bold text-slate-900'>Quét QR mở hồ sơ máy</div>
                        <div className='text-xs font-normal text-slate-500'>
                            Đưa tem QR trên máy vào khung để mở nhanh chi tiết
                        </div>
                    </div>
                </div>
            }
        >
            <QrCameraScanner active={open} onDetected={handleDetected} />
        </Modal>
    );
};

export default QrScanLookupModal;
