import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Tag, Upload, type TableColumnsType, type UploadFile } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { materialCustodyService, type RecipientImportPreview } from '../../core/services/material-custody.service';

type PreviewRow = RecipientImportPreview['rows'][number];

interface Props {
    open: boolean;
    plantId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

const columns: TableColumnsType<PreviewRow> = [
    { title: 'Dòng', dataIndex: 'rowNumber', width: 65, align: 'center' },
    { title: 'Mã CN', width: 115, render: (_, row) => row.values.employeeCode || '-' },
    { title: 'Họ tên', render: (_, row) => row.values.fullName || '-' },
    {
        title: 'Bộ phận / chuyền',
        render: (_, row) => [row.values.department, row.values.lineName].filter(Boolean).join(' · ') || '-',
    },
    {
        title: 'Thao tác',
        width: 105,
        render: (_, row) =>
            row.isValid ? (
                <Tag color={row.action === 'update' ? 'blue' : 'green'}>
                    {row.action === 'update' ? 'Cập nhật' : 'Tạo mới'}
                </Tag>
            ) : null,
    },
    {
        title: 'Kết quả',
        width: 210,
        render: (_, row) =>
            row.isValid ? (
                <Tag color='success'>Hợp lệ</Tag>
            ) : (
                <span className='text-xs text-red-600'>{row.errors.join(' · ')}</span>
            ),
    },
];

const RecipientImportModal: React.FC<Props> = ({ open, plantId, onClose, onSuccess }) => {
    const { message } = App.useApp();
    const [file, setFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<RecipientImportPreview | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!open) {
            setFile(null);
            setFileList([]);
            setPreview(null);
        }
    }, [open]);

    const previewMutation = useMutation({
        mutationFn: (selected: File) => materialCustodyService.previewRecipientImport(selected, plantId),
        onSuccess: setPreview,
        onError: (error: any) => message.error(error?.message || 'Không thể đọc file Excel'),
    });
    const confirmMutation = useMutation({
        mutationFn: (selected: File) => materialCustodyService.confirmRecipientImport(selected, plantId),
        onSuccess: (result) => {
            message.success(`Đã import: ${result.created} tạo mới, ${result.updated} cập nhật, ${result.errors} lỗi`);
            onSuccess();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể import người nhận'),
    });

    const downloadTemplate = async () => {
        try {
            setDownloading(true);
            const blob = await materialCustodyService.downloadRecipientTemplate(plantId);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'mau-nguoi-nhan-vat-tu.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            message.error(error?.message || 'Không thể tải file mẫu');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title='Import người nhận vật tư'
            width={920}
            destroyOnHidden
            maskClosable={false}
            footer={
                <div className='flex flex-wrap items-center justify-between gap-2'>
                    <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void downloadTemplate()}>
                        Tải file mẫu
                    </Button>
                    <Space wrap>
                        <Button onClick={onClose}>Đóng</Button>
                        <Button
                            disabled={!file}
                            loading={previewMutation.isPending}
                            onClick={() => file && previewMutation.mutate(file)}
                        >
                            Kiểm tra file
                        </Button>
                        <Button
                            type='primary'
                            disabled={!file || !preview?.summary.validRows}
                            loading={confirmMutation.isPending}
                            onClick={() => file && confirmMutation.mutate(file)}
                        >
                            Import {preview?.summary.validRows ? `${preview.summary.validRows} dòng` : ''}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className='space-y-4'>
                <Alert
                    showIcon
                    type='info'
                    message='Mã công nhân là duy nhất trong từng cơ sở'
                    description='Hệ thống chỉ tạo mới mã chưa có và cập nhật mã đã tồn tại. File có dòng lỗi vẫn cho phép import các dòng hợp lệ sau khi bạn kiểm tra.'
                />
                <Upload.Dragger
                    accept='.xlsx'
                    maxCount={1}
                    fileList={fileList}
                    beforeUpload={(selected) => {
                        setFile(selected);
                        setFileList([selected]);
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
                    <p className='ant-upload-text'>Kéo thả hoặc chọn file danh sách công nhân</p>
                    <p className='ant-upload-hint'>Hỗ trợ XLSX; nên dùng đúng file mẫu của hệ thống</p>
                </Upload.Dragger>
                {preview ? (
                    <>
                        <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
                            {[
                                ['Tổng dòng', preview.summary.totalRows, 'border-slate-200 bg-slate-50'],
                                ['Hợp lệ', preview.summary.validRows, 'border-emerald-200 bg-emerald-50'],
                                ['Có lỗi', preview.summary.invalidRows, 'border-red-200 bg-red-50'],
                                ['Tạo mới', preview.summary.toCreate, 'border-blue-200 bg-blue-50'],
                                ['Cập nhật', preview.summary.toUpdate, 'border-violet-200 bg-violet-50'],
                            ].map(([label, value, tone]) => (
                                <div key={String(label)} className={`rounded-md border p-3 ${tone}`}>
                                    <div className='text-xs text-slate-500'>{label}</div>
                                    <div className='mt-1 text-xl font-bold text-slate-900'>{value}</div>
                                </div>
                            ))}
                        </div>
                        <Table
                            rowKey='rowNumber'
                            size='small'
                            columns={columns}
                            dataSource={preview.rows}
                            scroll={{ x: 780 }}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            rowClassName={(row) => (row.isValid ? '' : 'bg-red-50/60')}
                        />
                    </>
                ) : null}
            </div>
        </Modal>
    );
};

export default RecipientImportModal;
