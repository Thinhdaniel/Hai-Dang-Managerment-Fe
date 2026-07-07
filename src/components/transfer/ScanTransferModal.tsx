import React, { useMemo, useState } from 'react';
import { App, Button, Empty, Modal, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EnvironmentOutlined, QrcodeOutlined, ScanOutlined, SwapOutlined } from '@ant-design/icons';
import QrCameraScanner from '../QrCameraScanner';
import { resolveAssetByScan } from '../../core/lib/qrScan';
import { recordQrScan } from '../../core/lib/qrScanAudit';
import { isReturnedToPartner } from '../../core/constants';
import type { Asset } from '../../core/types';

type ScanTransferModalProps = {
    open: boolean;
    onClose: () => void;
    onProceed: (assets: Asset[]) => void;
};

const ScanTransferModal: React.FC<ScanTransferModalProps> = ({ open, onClose, onProceed }) => {
    const { message } = App.useApp();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [resolving, setResolving] = useState(false);

    const firstAsset = assets[0];
    const idSet = useMemo(() => new Set(assets.map((asset) => asset.id)), [assets]);

    const handleDetected = async (rawValue: string) => {
        if (resolving) return;
        setResolving(true);
        try {
            const { asset, ambiguous, publicId, labelId, source, inactiveLabelStatus } =
                await resolveAssetByScan(rawValue);
            const logBase = {
                rawValue,
                publicId,
                labelId,
                action: 'transfer_scan' as const,
                source,
            };
            if (!asset) {
                recordQrScan({
                    ...logBase,
                    result: ambiguous ? 'ambiguous' : 'not_found',
                });
                if (inactiveLabelStatus) {
                    message.warning('Tem QR này đã bị thay thế/thu hồi — dùng tem mới đang dán trên máy.');
                } else if (ambiguous) {
                    message.warning('Mã nhập vào khớp nhiều máy — hãy nhập chính xác mã máy hoặc quét QR.');
                } else {
                    message.error('Không tìm thấy máy từ mã vừa quét.');
                }
                return;
            }
            if (idSet.has(asset.id)) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'duplicate',
                });
                message.info(`"${asset.name}" đã có trong danh sách.`);
                return;
            }
            if (isReturnedToPartner(asset.status)) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'failed',
                    metadata: { reason: 'returned_to_partner' },
                });
                message.warning(`"${asset.name}" đã trả đối tác, không thể điều chuyển.`);
                return;
            }
            if (asset.hasOpenTransfer) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'failed',
                    metadata: { reason: 'has_open_transfer' },
                });
                message.warning(`"${asset.name}" đang có lệnh điều chuyển chờ xử lý.`);
                return;
            }
            if (firstAsset) {
                const samePlant = asset.plantId === firstAsset.plantId;
                if (!samePlant) {
                    recordQrScan({
                        ...logBase,
                        assetId: asset.id,
                        result: 'failed',
                        metadata: {
                            reason: 'different_origin',
                            firstAssetId: firstAsset.id,
                            firstPlantId: firstAsset.plantId,
                            currentPlantId: asset.plantId,
                        },
                    });
                    message.warning(`"${asset.name}" khác cơ sở xuất phát với máy đầu tiên — không thể chung một lệnh.`);
                    return;
                }
            }
            recordQrScan({
                ...logBase,
                assetId: asset.id,
                result: 'resolved',
            });
            setAssets((current) => [...current, asset]);
            message.success(`Đã thêm "${asset.name}".`);
        } finally {
            setResolving(false);
        }
    };

    const handleRemove = (id: string) => setAssets((current) => current.filter((asset) => asset.id !== id));

    const handleClose = () => {
        setAssets([]);
        onClose();
    };

    const handleProceed = () => {
        if (!assets.length) return;
        onProceed(assets);
        setAssets([]);
    };

    return (
        <Modal
            open={open}
            centered
            width={900}
            destroyOnHidden
            onCancel={handleClose}
            title={
                <div className='flex items-center gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm'>
                        <ScanOutlined />
                    </div>
                    <div>
                        <div className='text-base font-bold text-slate-900'>Quét QR để điều chuyển</div>
                        <div className='text-xs font-normal text-slate-500'>
                            Quét nhiều máy cùng cơ sở để gộp vào một lệnh
                        </div>
                    </div>
                </div>
            }
            styles={{ body: { paddingTop: 8 } }}
            footer={[
                <Button key='cancel' size='large' onClick={handleClose}>
                    Hủy
                </Button>,
                <Button
                    key='proceed'
                    type='primary'
                    size='large'
                    icon={<SwapOutlined />}
                    disabled={!assets.length}
                    onClick={handleProceed}
                >
                    Tiếp tục tạo lệnh ({assets.length})
                </Button>,
            ]}
        >
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div>
                    <QrCameraScanner active={open} onDetected={handleDetected} cooldownMs={1600} />
                </div>

                <div className='flex min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white'>
                    <div className='flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3'>
                        <div className='flex items-center gap-2 text-sm font-bold text-slate-900'>
                            <QrcodeOutlined className='text-blue-600' />
                            Máy đã quét
                        </div>
                        <Tag color='blue' className='!m-0'>
                            {assets.length}
                        </Tag>
                    </div>

                    {firstAsset ? (
                        <div className='flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600'>
                            <EnvironmentOutlined className='text-slate-400' />
                            <span className='font-semibold'>{firstAsset.plant?.name || 'Cơ sở'}</span>
                            <span className='text-slate-400'>·</span>
                            <span>{firstAsset.area?.trim() || 'Chưa chỉ định khu vực'}</span>
                        </div>
                    ) : null}

                    <div className='min-h-0 flex-1 overflow-auto p-2'>
                        {assets.length === 0 ? (
                            <div className='flex h-full items-center justify-center'>
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description='Chưa quét máy nào. Hãy đưa QR vào khung.'
                                />
                            </div>
                        ) : (
                            assets.map((asset) => (
                                <div
                                    key={asset.id}
                                    className='flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50'
                                >
                                    <div className='min-w-0'>
                                        <div className='truncate text-sm font-semibold text-slate-900'>
                                            {asset.name}
                                        </div>
                                        <div className='mt-0.5 flex items-center gap-2'>
                                            <span className='rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-700'>
                                                {asset.machineCode}
                                            </span>
                                            <span className='truncate text-xs text-slate-400'>
                                                {asset.model || asset.type || '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <Tooltip title='Bỏ khỏi danh sách'>
                                        <Button
                                            type='text'
                                            size='small'
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleRemove(asset.id)}
                                        />
                                    </Tooltip>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ScanTransferModal;
