import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Table, Tag, Typography, Upload, type TableColumnsType, type UploadFile } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { assetService } from '../core/services/asset.service';
import type { AssetImportPreview, AssetImportResult, AssetImportRow } from '../core/types';

const { Dragger } = Upload;
const { Text } = Typography;

interface AssetImportModalProps {
    open: boolean;
    onClose: () => void;
    onImported: (result: AssetImportResult) => void;
}

const AssetImportModal: React.FC<AssetImportModalProps> = ({ open, onClose, onImported }) => {
    const { message } = App.useApp();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<AssetImportPreview | null>(null);

    useEffect(() => {
        if (open) return;
        setSelectedFile(null);
        setFileList([]);
        setPreview(null);
    }, [open]);

    const previewMutation = useMutation({
        mutationFn: assetService.previewImport,
        onSuccess: (data) => {
            setPreview(data);
        },
    });

    const confirmMutation = useMutation({
        mutationFn: assetService.confirmImport,
        onSuccess: (data) => {
            onImported(data);
        },
    });

    const columns: TableColumnsType<AssetImportRow> = [
        {
            title: 'Dòng',
            dataIndex: 'rowNumber',
            key: 'rowNumber',
            width: 72,
        },
        {
            title: 'Mã máy',
            key: 'machineCode',
            render: (_, record) => record.values.machineCode || '-',
        },
        {
            title: 'Tên máy',
            key: 'name',
            render: (_, record) => record.values.name || '-',
        },
        {
            title: 'Model',
            key: 'model',
            render: (_, record) => record.values.model || '-',
        },
        {
            title: 'Loại máy',
            key: 'type',
            render: (_, record) => record.values.type || '-',
        },
        {
            title: 'Kết quả',
            key: 'status',
            width: 120,
            render: (_, record) =>
                record.isValid ? (
                    <Tag color='success'>Hợp lệ</Tag>
                ) : (
                    <Tag color='error'>{record.errors.length} loi</Tag>
                ),
        },
        {
            title: 'Chi tiết',
            key: 'errors',
            render: (_, record) =>
                record.errors.length > 0 ? (
                    <div className='flex flex-col gap-1'>
                        {record.errors.map((error) => (
                            <Text key={error} type='danger'>
                                {error}
                            </Text>
                        ))}
                    </div>
                ) : (
                    <Text type='secondary'>Sẵn sàng import</Text>
                ),
        },
    ];

    const previewRows = useMemo(() => preview?.rows ?? [], [preview]);

    const handlePreview = async () => {
        if (!selectedFile) {
            message.warning('Vui lòng chọn file Excel trước khi xem trước');
            return;
        }

        await previewMutation.mutateAsync(selectedFile);
    };

    const handleConfirm = async () => {
        if (!selectedFile) {
            message.warning('Vui lòng chọn file Excel trước khi import');
            return;
        }

        await confirmMutation.mutateAsync(selectedFile);
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title='Import Excel'
            width={980}
            destroyOnHidden
            footer={[
                <Button key='cancel' onClick={onClose}>
                    Đóng
                </Button>,
                <Button
                    key='preview'
                    onClick={handlePreview}
                    loading={previewMutation.isPending}
                    disabled={!selectedFile}
                >
                    Xem trước
                </Button>,
                <Button
                    key='confirm'
                    type='primary'
                    onClick={handleConfirm}
                    loading={confirmMutation.isPending}
                    disabled={!selectedFile || !preview || preview.summary.validRows === 0}
                >
                    Import {preview?.summary.validRows ?? 0} dong hop le
                </Button>,
            ]}
            className='[&_.ant-modal-content]:rounded-2xl [&_.ant-modal-content]:p-6'
        >
            <div className='flex flex-col gap-5'>
                <Alert
                    type='info'
                    showIcon
                    message='Các cột bắt buộc'
                    description='Cần có ít nhất: name, machineCode, model, type, brand hoac brandId, plantCode/plant/plantId.'
                />

                <Dragger
                    accept='.xlsx,.xls'
                    beforeUpload={(file) => {
                        setSelectedFile(file);
                        setFileList([file]);
                        setPreview(null);
                        return false;
                    }}
                    fileList={fileList}
                    maxCount={1}
                    onRemove={() => {
                        setSelectedFile(null);
                        setFileList([]);
                        setPreview(null);
                    }}
                    className='rounded-2xl'
                >
                    <p className='ant-upload-drag-icon'>
                        <InboxOutlined />
                    </p>
                    <p className='ant-upload-text'>Tải file Excel danh sách máy</p>
                    <p className='ant-upload-hint'>Hệ thống sẽ validate và cho xem trước trước khi import.</p>
                </Dragger>

                {preview && (
                    <div className='flex flex-col gap-4'>
                        <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                            <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Tổng dòng</div>
                                <div className='mt-2 text-3xl font-bold text-slate-800'>{preview.summary.totalRows}</div>
                            </div>
                            <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-4'>
                                <div className='text-xs font-semibold uppercase tracking-wide text-emerald-700'>Hợp lệ</div>
                                <div className='mt-2 text-3xl font-bold text-emerald-700'>{preview.summary.validRows}</div>
                            </div>
                            <div className='rounded-xl border border-rose-200 bg-rose-50 p-4'>
                                <div className='text-xs font-semibold uppercase tracking-wide text-rose-700'>Không hợp lệ</div>
                                <div className='mt-2 text-3xl font-bold text-rose-700'>{preview.summary.invalidRows}</div>
                            </div>
                        </div>

                        <Table<AssetImportRow>
                            rowKey={(record) => String(record.rowNumber)}
                            columns={columns}
                            dataSource={previewRows}
                            pagination={{ pageSize: 8, showSizeChanger: false }}
                            scroll={{ x: 960 }}
                            size='small'
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AssetImportModal;
