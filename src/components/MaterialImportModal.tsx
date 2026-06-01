import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Tag, Upload, type TableColumnsType, type UploadFile } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { materialService } from '../core/services/material.service';

const { Dragger } = Upload;

type PreviewRow = {
    rowNumber: number;
    isValid: boolean;
    action?: string;
    values: { code: string; name: string; category: string; unit: string; minStockLevel: number };
    errors: string[];
};

type PreviewResult = {
    summary: { totalRows: number; validRows: number; invalidRows: number; toCreate: number; toUpdate: number };
    rows: PreviewRow[];
};

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const columns: TableColumnsType<PreviewRow> = [
    { title: 'Dòng', dataIndex: 'rowNumber', key: 'row', width: 65, align: 'center' },
    { title: 'Mã VT', key: 'code', width: 120, render: (_, r) => r.values.code || '-' },
    { title: 'Tên vật tư', key: 'name', render: (_, r) => r.values.name || '-' },
    { title: 'ĐVT', key: 'unit', width: 80, render: (_, r) => r.values.unit || '-' },
    {
        title: 'Thao tác',
        key: 'action',
        width: 100,
        render: (_, r) =>
            !r.isValid ? null : r.action === 'update' ? (
                <Tag color='blue'>Cập nhật</Tag>
            ) : (
                <Tag color='success'>Tạo mới</Tag>
            ),
    },
    {
        title: 'Kết quả',
        key: 'status',
        width: 100,
        render: (_, r) =>
            r.isValid ? <Tag color='success'>Hợp lệ</Tag> : <Tag color='error'>{r.errors.length} lỗi</Tag>,
    },
    {
        title: 'Chi tiết lỗi',
        key: 'errors',
        render: (_, r) =>
            r.errors.length > 0 ? (
                <div className='flex flex-col gap-0.5'>
                    {r.errors.map((e) => (
                        <span key={e} className='text-xs text-rose-600'>
                            {e}
                        </span>
                    ))}
                </div>
            ) : (
                <span className='text-xs text-slate-400'>Sẵn sàng</span>
            ),
    },
];

const MaterialImportModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const [file, setFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!open) {
            setFile(null);
            setFileList([]);
            setPreview(null);
        }
    }, [open]);

    const previewMutation = useMutation({
        mutationFn: (f: File) => materialService.previewImport(f),
        onSuccess: (data) => setPreview(data),
        onError: (e: any) => message.error(e?.message ?? 'Không thể xem trước file'),
    });

    const confirmMutation = useMutation({
        mutationFn: (f: File) => materialService.confirmImport(f),
        onSuccess: (data) => {
            message.success(`Import hoàn tất: ${data.created} tạo mới, ${data.updated} cập nhật`);
            onSuccess();
        },
        onError: (e: any) => message.error(e?.message ?? 'Import thất bại'),
    });

    const handleDownloadTemplate = async () => {
        try {
            setDownloading(true);
            await materialService.downloadTemplate();
        } catch {
            message.error('Không thể tải mẫu');
        } finally {
            setDownloading(false);
        }
    };

    const canConfirm = preview && preview.summary.validRows > 0;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title='Import danh mục vật tư từ Excel'
            width={980}
            destroyOnHidden
            maskClosable={false}
            footer={
                <div className='flex items-center justify-between'>
                    <Button icon={<DownloadOutlined />} loading={downloading} onClick={handleDownloadTemplate}>
                        Tải file mẫu
                    </Button>
                    <Space>
                        <Button onClick={onClose}>Đóng</Button>
                        <Button
                            disabled={!file}
                            loading={previewMutation.isPending}
                            onClick={() => file && previewMutation.mutate(file)}
                        >
                            Xem trước
                        </Button>
                        <Button
                            type='primary'
                            disabled={!canConfirm}
                            loading={confirmMutation.isPending}
                            onClick={() => file && confirmMutation.mutate(file)}
                        >
                            Import {canConfirm ? `${preview.summary.validRows} dòng hợp lệ` : ''}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className='flex flex-col gap-4'>
                <Alert
                    type='info'
                    showIcon
                    title='Hướng dẫn'
                    description='Tải file mẫu, điền thông tin rồi bấm "Xem trước" để kiểm tra. Nếu mã đã tồn tại → cập nhật. Chưa có → tạo mới. Bắt buộc: Mã vật tư, Tên vật tư, Đơn vị tính.'
                />

                <Dragger
                    accept='.xlsx,.xls'
                    fileList={fileList}
                    maxCount={1}
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
                    <p className='ant-upload-hint'>.xlsx, .xls</p>
                </Dragger>

                {preview && (
                    <div className='flex flex-col gap-3'>
                        <div className='grid grid-cols-5 gap-3'>
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
                                {
                                    label: 'Tạo mới',
                                    value: preview.summary.toCreate,
                                    cls: 'bg-green-50 border-green-200 text-green-700',
                                },
                                {
                                    label: 'Cập nhật',
                                    value: preview.summary.toUpdate,
                                    cls: 'bg-blue-50 border-blue-200 text-blue-700',
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
                        <Table<PreviewRow>
                            rowKey='rowNumber'
                            dataSource={preview.rows}
                            columns={columns}
                            size='small'
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            scroll={{ x: 800 }}
                            rowClassName={(r) => (r.isValid ? '' : 'bg-rose-50/60')}
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default MaterialImportModal;
