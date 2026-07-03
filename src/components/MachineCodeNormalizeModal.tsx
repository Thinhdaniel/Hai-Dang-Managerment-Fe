import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Table, Tag, Tooltip, Typography } from 'antd';
import { ArrowRightOutlined, RobotOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { assetService } from '../core/services/asset.service';
import type { MachineTypeCodeRow, NormalizeCodePreview, NormalizeCodeRow } from '../core/types';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
}

// Dòng mã loại đang chỉnh trong modal: giá trị ô nhập + mốc ban đầu để biết dòng nào đổi.
type EditableTypeRow = MachineTypeCodeRow & { editedCode: string; initialCode: string };

const normalizeCodeInput = (value: string) =>
    value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12);

const MachineCodeNormalizeModal: React.FC<Props> = ({ open, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<NormalizeCodePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const [typeRows, setTypeRows] = useState<EditableTypeRow[]>([]);
    const [typeLoading, setTypeLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [savingCodes, setSavingCodes] = useState(false);

    const toEditable = (rows: MachineTypeCodeRow[], previous?: EditableTypeRow[]): EditableTypeRow[] =>
        rows.map((row) => {
            const prev = previous?.find((p) => p.typeKey === row.typeKey);
            const base = row.currentCode ?? row.suggestedCode;
            return {
                ...row,
                // AI trả mã -> điền sẵn vào ô nhập; người dùng vẫn sửa tay được trước khi lưu.
                editedCode: normalizeCodeInput(row.aiCode ?? prev?.editedCode ?? base),
                initialCode: prev?.initialCode ?? base,
            };
        });

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

    const loadTypeCodes = async () => {
        try {
            setTypeLoading(true);
            const data = await assetService.getTypeCodes();
            setTypeRows(toEditable(data.rows));
        } catch {
            message.error('Không tải được bảng mã loại máy');
        } finally {
            setTypeLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setPreview(null);
            setTypeRows([]);
            loadPreview();
            loadTypeCodes();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const dirtyTypeRows = useMemo(
        () => typeRows.filter((row) => row.editedCode && row.editedCode !== (row.currentCode ?? '')),
        [typeRows]
    );

    const handleAiSuggest = async () => {
        try {
            setAiLoading(true);
            const data = await assetService.aiSuggestTypeCodes();
            setTypeRows((prev) => toEditable(data.rows, prev));
            const changed = data.rows.filter((row) => row.aiCode && row.aiCode !== (row.currentCode ?? '')).length;
            message.success(changed ? `AI đề xuất đổi ${changed} mã loại — xem lại rồi bấm Lưu` : 'AI thấy mã hiện tại đã ổn');
        } catch {
            message.error('AI gợi ý thất bại, thử lại sau');
        } finally {
            setAiLoading(false);
        }
    };

    const handleSaveTypeCodes = async () => {
        if (!dirtyTypeRows.length) return;
        try {
            setSavingCodes(true);
            await assetService.saveTypeCodes(dirtyTypeRows.map((row) => ({ label: row.label, code: row.editedCode })));
            message.success(`Đã lưu ${dirtyTypeRows.length} mã loại`);
            // Mã loại đổi -> phương án chuẩn hoá bên dưới phải tính lại.
            await Promise.all([loadTypeCodes(), loadPreview()]);
        } catch {
            message.error('Lưu mã loại thất bại');
        } finally {
            setSavingCodes(false);
        }
    };

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

    const typeColumns = [
        {
            title: 'Loại máy',
            dataIndex: 'label',
            key: 'label',
            render: (label: string, row: EditableTypeRow) => (
                <div>
                    <div className='font-medium text-slate-800'>{label || '—'}</div>
                    <div className='text-xs text-slate-400'>{row.assetCount} máy</div>
                </div>
            ),
        },
        {
            title: 'Mã đang dùng',
            dataIndex: 'currentCode',
            key: 'currentCode',
            width: 120,
            render: (code: string | null) =>
                code ? <Text className='text-slate-600'>{code}</Text> : <Text type='secondary'>chưa lưu</Text>,
        },
        {
            title: 'Mã sẽ lưu',
            key: 'editedCode',
            width: 150,
            render: (_: unknown, row: EditableTypeRow) => {
                const changed = row.editedCode !== (row.currentCode ?? '');
                const fromAi = !!row.aiCode && row.editedCode === normalizeCodeInput(row.aiCode);
                return (
                    <div className='flex items-center gap-1.5'>
                        <Input
                            size='small'
                            value={row.editedCode}
                            status={row.editedCode ? undefined : 'error'}
                            className={changed ? 'font-semibold' : undefined}
                            onChange={(e) => {
                                const editedCode = normalizeCodeInput(e.target.value);
                                setTypeRows((prev) =>
                                    prev.map((r) => (r.typeKey === row.typeKey ? { ...r, editedCode } : r))
                                );
                            }}
                        />
                        {changed && fromAi ? (
                            <Tooltip title='Mã do AI đề xuất'>
                                <RobotOutlined className='text-violet-500' />
                            </Tooltip>
                        ) : null}
                    </div>
                );
            },
        },
    ];

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
            width={860}
            footer={[
                <Button key='cancel' onClick={onClose}>
                    Đóng
                </Button>,
                <Button
                    key='confirm'
                    type='primary'
                    loading={confirming}
                    disabled={loading || willChange === 0 || dirtyTypeRows.length > 0}
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
                description='Bước 1: rà mã viết tắt loại máy (sửa tay hoặc để AI gợi ý, rồi Lưu). Bước 2: xem phương án đổi mã bên dưới và xác nhận. Mã cũ được lưu vào ghi chú của máy; tem QR không ảnh hưởng.'
            />

            <div className='mb-1 flex items-center justify-between gap-2'>
                <Text strong>Mã viết tắt loại máy</Text>
                <div className='flex items-center gap-2'>
                    <Button size='small' icon={<RobotOutlined />} loading={aiLoading} onClick={handleAiSuggest}>
                        AI gợi ý
                    </Button>
                    <Button
                        size='small'
                        type='primary'
                        icon={<SaveOutlined />}
                        loading={savingCodes}
                        disabled={!dirtyTypeRows.length || typeRows.some((row) => !row.editedCode)}
                        onClick={handleSaveTypeCodes}
                    >
                        Lưu mã loại {dirtyTypeRows.length ? `(${dirtyTypeRows.length})` : ''}
                    </Button>
                </div>
            </div>
            <Table<EditableTypeRow>
                rowKey='typeKey'
                size='small'
                loading={typeLoading}
                columns={typeColumns}
                dataSource={typeRows}
                pagination={typeRows.length > 6 ? { pageSize: 6, size: 'small' } : false}
                className='mb-4'
            />
            {dirtyTypeRows.length ? (
                <Alert
                    type='info'
                    showIcon
                    className='mb-3'
                    message={`Có ${dirtyTypeRows.length} mã loại chưa lưu — bấm "Lưu mã loại" để phương án bên dưới tính theo mã mới.`}
                />
            ) : null}

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
