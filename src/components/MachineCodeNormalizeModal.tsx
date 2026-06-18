import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Table, Tag, Typography } from 'antd';
import { ArrowRightOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { assetService } from '../core/services/asset.service';
import type { NormalizeCodePreview, NormalizeCodeRow } from '../core/types';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
}

const MachineCodeNormalizeModal: React.FC<Props> = ({ open, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<NormalizeCodePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const loadPreview = async () => {
        try {
            setLoading(true);
            setPreview(await assetService.previewNormalizeCodes());
        } catch {
            message.error('Không tải được phương án chuẩn hoá');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setPreview(null);
            loadPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleConfirm = async () => {
        try {
            setConfirming(true);
            const result = await assetService.confirmNormalizeCodes();
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            message.success(
                `Đã chuẩn hoá ${result.updated} mã máy${result.failed ? `, lỗi ${result.failed} máy` : ''}`
            );
            onClose();
        } catch {
            message.error('Chuẩn hoá mã máy thất bại');
        } finally {
            setConfirming(false);
        }
    };

    const columns = [
        {
            title: 'Máy',
            dataIndex: 'name',
            key: 'name',
            render: (_: unknown, row: NormalizeCodeRow) => (
                <div>
                    <div className='font-medium text-slate-800'>{row.name || '—'}</div>
                    {row.plantName ? <div className='text-xs text-slate-400'>{row.plantName}</div> : null}
                </div>
            ),
        },
        {
            title: 'Mã cũ',
            dataIndex: 'oldCode',
            key: 'oldCode',
            render: (oldCode?: string) => <Text className='text-slate-500'>{oldCode || '—'}</Text>,
        },
        {
            title: '',
            key: 'arrow',
            width: 36,
            render: () => <ArrowRightOutlined className='text-slate-300' />,
        },
        {
            title: 'Mã mới',
            dataIndex: 'newCode',
            key: 'newCode',
            render: (newCode: string, row: NormalizeCodeRow) =>
                row.changed ? (
                    <Tag color='blue' className='font-semibold'>
                        {newCode}
                    </Tag>
                ) : (
                    <Text type='secondary'>{newCode} (giữ nguyên)</Text>
                ),
        },
    ];

    const willChange = preview?.summary.willChange ?? 0;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className='flex items-center gap-2'>
                    <ThunderboltOutlined className='text-blue-600' />
                    <span>Chuẩn hoá mã máy theo chuẩn</span>
                </div>
            }
            width={760}
            footer={[
                <Button key='cancel' onClick={onClose}>
                    Đóng
                </Button>,
                <Button
                    key='confirm'
                    type='primary'
                    loading={confirming}
                    disabled={loading || willChange === 0}
                    onClick={handleConfirm}
                >
                    Xác nhận chuẩn hoá {willChange ? `(${willChange} máy)` : ''}
                </Button>,
            ]}
            destroyOnHidden
        >
            <Alert
                type='warning'
                showIcon
                className='mb-3'
                message='Đặt lại mã máy theo chuẩn LOẠI - NHÃN - NGUỒN - STT'
                description='Mã cũ sẽ được lưu vào ghi chú của máy để tra cứu. Tem QR không ảnh hưởng (QR dùng mã định danh riêng). Hãy xem kỹ phương án trước khi xác nhận.'
            />

            {preview ? (
                <div className='mb-2 text-sm text-slate-600'>
                    Tổng <b>{preview.summary.total}</b> máy · sẽ đổi mã <b className='text-blue-600'>{willChange}</b> ·
                    giữ nguyên {preview.summary.unchanged}
                </div>
            ) : null}

            <Table<NormalizeCodeRow>
                rowKey='id'
                size='small'
                loading={loading}
                columns={columns}
                dataSource={preview?.rows ?? []}
                pagination={{ pageSize: 8, size: 'small' }}
                scroll={{ y: 360 }}
            />
        </Modal>
    );
};

export default MachineCodeNormalizeModal;
