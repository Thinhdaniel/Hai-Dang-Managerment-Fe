import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Grid, Input, Modal, Tag, Typography } from 'antd';
import {
    CheckCircleOutlined,
    CloseOutlined,
    EnvironmentOutlined,
    SaveOutlined,
    ScanOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { ASSET_STATUS_LABEL } from '../core/constants';
import { assetService } from '../core/services/asset.service';
import { AssetOwnershipType, AssetStatus, type Asset } from '../core/types';

const { Text } = Typography;
const { useBreakpoint } = Grid;

type QrQuickUpdateModalProps = {
    open: boolean;
    asset: Asset | null;
    onClose: () => void;
    onUpdated?: (asset: Asset) => void;
    onScanNext?: () => void;
};

const baseStatusOptions = [
    AssetStatus.ACTIVE,
    AssetStatus.MAINTENANCE,
    AssetStatus.BROKEN,
    AssetStatus.STORAGE,
    AssetStatus.PENDING_DISPOSAL,
] satisfies AssetStatus[];

const statusTone: Record<AssetStatus, string> = {
    [AssetStatus.ACTIVE]: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:!border-emerald-300',
    [AssetStatus.MAINTENANCE]: 'border-amber-200 bg-amber-50 text-amber-700 hover:!border-amber-300',
    [AssetStatus.BROKEN]: 'border-rose-200 bg-rose-50 text-rose-700 hover:!border-rose-300',
    [AssetStatus.BORROWING]: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:!border-indigo-300',
    [AssetStatus.STORAGE]: 'border-slate-300 bg-slate-50 text-slate-700 hover:!border-slate-400',
    [AssetStatus.PENDING_DISPOSAL]: 'border-orange-200 bg-orange-50 text-orange-700 hover:!border-orange-300',
    [AssetStatus.DISPOSED]: 'border-slate-300 bg-slate-100 text-slate-600 hover:!border-slate-400',
    [AssetStatus.RETURNED_TO_PARTNER]: 'border-violet-200 bg-violet-50 text-violet-700 hover:!border-violet-300',
};

const canReturnToPartner = (asset: Asset) => asset.ownershipType !== AssetOwnershipType.OWNED;

const buildStatusOptions = (asset: Asset) => {
    const options = canReturnToPartner(asset)
        ? [...baseStatusOptions, AssetStatus.RETURNED_TO_PARTNER]
        : [...baseStatusOptions];

    return options.includes(asset.status) ? options : [asset.status, ...options];
};

const QrQuickUpdateModal: React.FC<QrQuickUpdateModalProps> = ({ open, asset, onClose, onUpdated, onScanNext }) => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [status, setStatus] = useState<AssetStatus>(AssetStatus.ACTIVE);
    const [area, setArea] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!asset || !open) return;
        setStatus(asset.status);
        setArea(asset.area ?? '');
        setNote('');
    }, [asset, open]);

    const statusOptions = useMemo(() => (asset ? buildStatusOptions(asset) : baseStatusOptions), [asset]);
    const normalizedArea = area.trim();
    const statusChanged = Boolean(asset && status !== asset.status);
    const areaChanged = Boolean(asset && normalizedArea !== (asset.area ?? '').trim());
    const canSave = Boolean(asset && (statusChanged || areaChanged));

    const handleSave = async () => {
        if (!asset || !canSave) return;
        setSaving(true);

        let nextAsset = asset;
        let statusUpdated = false;

        try {
            if (statusChanged) {
                nextAsset = await assetService.updateStatus(asset.id, status, note.trim() || undefined);
                statusUpdated = true;
            }

            if (areaChanged) {
                try {
                    nextAsset = await assetService.update(asset.id, { area: normalizedArea });
                } catch (error) {
                    if (statusUpdated) {
                        onUpdated?.(nextAsset);
                        queryClient.invalidateQueries({ queryKey: ['assets'] });
                        queryClient.invalidateQueries({ queryKey: ['asset', asset.id] });
                        message.warning('Đã cập nhật trạng thái, nhưng cập nhật khu vực chưa thành công.');
                        return;
                    }
                    throw error;
                }
            }

            onUpdated?.(nextAsset);
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['asset', asset.id] });
            message.success(`Đã cập nhật "${asset.name}"`);
        } catch (error) {
            const errorMessage =
                error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
                    ? error.message
                    : 'Cập nhật nhanh chưa thành công';
            message.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const content = asset ? (
        <div className='flex flex-col gap-4'>
            <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <div className='truncate text-base font-bold text-slate-900'>{asset.name}</div>
                        <div className='mt-1 flex flex-wrap items-center gap-2'>
                            <Tag color='blue' className='!m-0 font-mono'>
                                {asset.machineCode}
                            </Tag>
                            <Tag className='!m-0'>{ASSET_STATUS_LABEL[asset.status]}</Tag>
                        </div>
                    </div>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white'>
                        <ToolOutlined />
                    </div>
                </div>
                <div className='mt-3 flex items-center gap-2 text-sm text-slate-600'>
                    <EnvironmentOutlined className='text-slate-400' />
                    <span className='font-semibold'>{asset.plant?.name || 'Chưa rõ cơ sở'}</span>
                    <span className='text-slate-300'>/</span>
                    <span>{asset.area?.trim() || 'Chưa gắn khu vực'}</span>
                </div>
            </div>

            <div>
                <Text className='mb-2 block text-sm font-bold text-slate-800'>Trạng thái mới</Text>
                <div className='grid grid-cols-2 gap-2 md:grid-cols-5'>
                    {statusOptions.map((option) => {
                        const active = option === status;
                        return (
                            <button
                                key={option}
                                type='button'
                                onClick={() => setStatus(option)}
                                className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                                    statusTone[option]
                                } ${active ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                            >
                                {ASSET_STATUS_LABEL[option]}
                            </button>
                        );
                    })}
                </div>
            </div>

            <label className='block'>
                <Text className='mb-2 block text-sm font-bold text-slate-800'>Khu vực</Text>
                <Input
                    size='large'
                    value={area}
                    placeholder='Nhập khu vực hiện tại của máy'
                    onChange={(event) => setArea(event.target.value)}
                    allowClear
                />
            </label>

            <label className='block'>
                <Text className='mb-2 block text-sm font-bold text-slate-800'>Ghi chú đổi trạng thái</Text>
                <Input.TextArea
                    value={note}
                    placeholder='Ví dụ: kiểm kê phát hiện tại khu may A, đổi về tồn kho...'
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={300}
                    showCount
                />
            </label>

            <div className='sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 bg-white/95 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:flex-row md:justify-end md:bg-transparent md:pt-0'>
                <Button size='large' icon={<CloseOutlined />} onClick={onClose}>
                    Xong
                </Button>
                {onScanNext ? (
                    <Button size='large' icon={<ScanOutlined />} onClick={onScanNext}>
                        Quét tiếp
                    </Button>
                ) : null}
                <Button
                    type='primary'
                    size='large'
                    icon={<SaveOutlined />}
                    loading={saving}
                    disabled={!canSave}
                    onClick={handleSave}
                    className='md:min-w-[132px]'
                >
                    Lưu
                </Button>
            </div>
        </div>
    ) : (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500'>
            <CheckCircleOutlined className='mb-2 text-2xl text-slate-400' />
            <div>Chưa chọn máy để cập nhật.</div>
        </div>
    );

    if (isMobile) {
        return (
            <Drawer
                open={open}
                placement='bottom'
                size='auto'
                onClose={onClose}
                destroyOnHidden
                title='Cập nhật nhanh máy'
                styles={{
                    body: { padding: 16 },
                    section: { borderRadius: '20px 20px 0 0' },
                }}
            >
                {content}
            </Drawer>
        );
    }

    return (
        <Modal
            open={open}
            centered
            width={560}
            footer={null}
            destroyOnHidden
            onCancel={onClose}
            title='Cập nhật nhanh máy'
        >
            {content}
        </Modal>
    );
};

export default QrQuickUpdateModal;
