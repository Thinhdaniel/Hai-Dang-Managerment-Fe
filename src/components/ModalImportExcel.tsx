import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Input,
    Modal,
    Space,
    Table,
    Tag,
    Upload,
    type TableColumnsType,
    type UploadFile,
} from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../core/services/material.service';

const { Dragger } = Upload;

type PreviewRow = {
    row: number;
    materialCode: string;
    materialName?: string;
    currentStock?: number;
    newStock: number;
    note: string;
    isValid: boolean;
    reason?: string;
};

type PreviewResult = {
    summary: { totalRows: number; validRows: number; invalidRows: number };
    rows: PreviewRow[];
};

interface Props {
    open: boolean;
    plantId: string;
    onClose: () => void;
}

const columns: TableColumnsType<PreviewRow> = [
    { title: 'Dòng', dataIndex: 'row', key: 'row', width: 65, align: 'center' },
    { title: 'Mã VT', dataIndex: 'materialCode', key: 'code', width: 110 },
    { title: 'Tên vật tư', dataIndex: 'materialName', key: 'name', render: (v) => v || '-' },
    {
        title: 'Tồn hiện tại',
        dataIndex: 'currentStock',
        key: 'cur',
        width: 110,
        align: 'right',
        render: (v) => (v != null ? v.toLocaleString('vi-VN') : '-'),
    },
    {
        title: 'Tồn mới',
        dataIndex: 'newStock',
        key: 'new',
        width: 100,
        align: 'right',
        render: (v) => <span className='font-semibold'>{v.toLocaleString('vi-VN')}</span>,
    },
    {
        title: 'Kết quả',
        key: 'status',
        width: 100,
        render: (_, r) => (r.isValid ? <Tag color='success'>Hợp lệ</Tag> : <Tag color='error'>Lỗi</Tag>),
    },
    {
        title: 'Chi tiết',
        key: 'detail',
        render: (_, r) =>
            r.isValid ? (
                <span className='text-xs text-slate-400'>Sẵn sàng</span>
            ) : (
                <span className='text-xs text-rose-600'>{r.reason}</span>
            ),
    },
];

const ModalImportExcel: React.FC<Props> = ({ open, plantId, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [reason, setReason] = useState('');
    const [preview, setPreview] = useState<PreviewResult | null>(null);

    const reset = () => {
        setFileList([]);
        setFile(null);
        setReason('');
        setPreview(null);
    };
    const handleClose = () => {
        reset();
        onClose();
    };

    const previewMutation = useMutation({
        mutationFn: ({ f, pid }: { f: File; pid: string }) => inventoryService.previewImport(f, pid),
        onSuccess: (data) => setPreview(data),
        onError: (e: any) => message.error(e?.message || 'Không thể xem trước'),
    });

    const importMutation = useMutation({
        mutationFn: (fd: FormData) => inventoryService.importExcel(fd),
        onSuccess: (res: any) => {
            message.success(`Import thành công ${res.success} vật tư${res.failed > 0 ? `, ${res.failed} lỗi` : ''}`);
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            handleClose();
        },
        onError: (e: any) => message.error(e?.message || 'Import thất bại'),
    });

    const handlePreview = () => {
        if (!file) {
            message.error('Vui lòng chọn file');
            return;
        }
        if (!reason.trim()) {
            message.error('Vui lòng nhập lý do');
            return;
        }
        previewMutation.mutate({ f: file, pid: plantId });
    };

    const handleConfirm = () => {
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('plantId', plantId);
        fd.append('reason', reason.trim());
        importMutation.mutate(fd);
    };

    const canConfirm = preview && preview.summary.validRows > 0;

    return (
        <Modal
            open={open}
            title='Import tồn kho từ Excel'
            width={860}
            onCancel={handleClose}
            destroyOnClose
            maskClosable={false}
            footer={
                <div className='flex items-center justify-between'>
                    <Button icon={<DownloadOutlined />} onClick={() => inventoryService.downloadTemplate()}>
                        Tải file mẫu
                    </Button>
                    <Space>
                        <Button onClick={handleClose}>Huỷ</Button>
                        <Button
                            loading={previewMutation.isPending}
                            disabled={!file || !reason.trim()}
                            onClick={handlePreview}
                        >
                            Xem trước
                        </Button>
                        <Button
                            type='primary'
                            disabled={!canConfirm}
                            loading={importMutation.isPending}
                            onClick={handleConfirm}
                        >
                            Import {canConfirm ? `${preview.summary.validRows} dòng` : ''}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className='flex flex-col gap-4'>
                <Dragger
                    accept='.xlsx,.xls'
                    maxCount={1}
                    fileList={fileList}
                    beforeUpload={(f) => {
                        setFile(f);
                        setFileList([f]);
                        setPreview(null);
                        return false;
                    }}
                    onRemove={() => {
                        setFile(null);
                        setFileList([]);
                        setPreview(null);
                    }}
                >
                    <p className='ant-upload-drag-icon'>
                        <InboxOutlined />
                    </p>
                    <p className='ant-upload-text'>Kéo thả hoặc click để chọn file Excel</p>
                </Dragger>

                <div>
                    <div className='mb-1 text-sm font-medium'>
                        Lý do nhập <span className='text-red-500'>*</span>
                    </div>
                    <Input
                        placeholder='VD: Import tồn kho tháng 01/2026'
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setPreview(null);
                        }}
                    />
                </div>

                {preview && (
                    <div className='flex flex-col gap-3'>
                        <div className='grid grid-cols-3 gap-3'>
                            {[
                                {
                                    label: 'Tổng dòng',
                                    value: preview.summary.totalRows,
                                    cls: 'bg-slate-50 border-slate-200 text-slate-800',
                                },
                                {
                                    label: 'Hợp lệ',
                                    value: preview.summary.validRows,
                                    cls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                                },
                                {
                                    label: 'Không hợp lệ',
                                    value: preview.summary.invalidRows,
                                    cls: 'bg-rose-50 border-rose-200 text-rose-700',
                                },
                            ].map(({ label, value, cls }) => (
                                <div key={label} className={`rounded-xl border p-3 ${cls}`}>
                                    <div className='text-[11px] font-semibold tracking-wide uppercase opacity-70'>
                                        {label}
                                    </div>
                                    <div className='mt-1 text-2xl font-bold'>{value}</div>
                                </div>
                            ))}
                        </div>
                        {preview.summary.invalidRows > 0 && (
                            <Alert
                                type='warning'
                                showIcon
                                title={`${preview.summary.invalidRows} dòng lỗi sẽ bị bỏ qua khi import.`}
                            />
                        )}
                        <Table<PreviewRow>
                            rowKey='row'
                            dataSource={preview.rows}
                            columns={columns}
                            size='small'
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            scroll={{ x: 750 }}
                            rowClassName={(r) => (r.isValid ? '' : 'bg-rose-50/60')}
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ModalImportExcel;
