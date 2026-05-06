import React, { useState } from 'react';
import {
    Alert,
    Button,
    Input,
    Modal,
    Space,
    Table,
    Typography,
    Upload,
    App,
    type UploadFile,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../core/services/material.service';

const { Dragger } = Upload;
const { Text } = Typography;

interface ImportResult {
    success: number;
    failed: number;
    errors: Array<{ row: number; materialCode: string; reason: string }>;
}

interface Props {
    open: boolean;
    plantId: string;
    onClose: () => void;
}

const ModalImportExcel: React.FC<Props> = ({ open, plantId, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [reason, setReason] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);

    const { mutateAsync: doImport, isPending } = useMutation({
        mutationFn: inventoryService.importExcel,
        onSuccess: (res: any) => {
            setResult(res);
            if (res.failed === 0) {
                queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
            }
        },
        onError: (err: any) => {
            message.error(err?.message || 'Import thất bại');
        },
    });

    const handleClose = () => {
        setFileList([]);
        setReason('');
        setResult(null);
        if (result && result.success > 0) {
            queryClient.invalidateQueries({ queryKey: ['materials', 'inventory'] });
        }
        onClose();
    };

    const handleImport = async () => {
        if (!reason.trim()) {
            message.error('Vui lòng nhập lý do');
            return;
        }
        if (fileList.length === 0 || !fileList[0].originFileObj) {
            message.error('Vui lòng chọn file Excel');
            return;
        }
        const formData = new FormData();
        formData.append('file', fileList[0].originFileObj);
        formData.append('plantId', plantId);
        formData.append('reason', reason.trim());
        await doImport(formData);
    };

    const errorColumns = [
        { title: 'Dòng', dataIndex: 'row', key: 'row', width: 70 },
        { title: 'Mã vật tư', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
        { title: 'Lý do lỗi', dataIndex: 'reason', key: 'reason' },
    ];

    return (
        <Modal
            open={open}
            title="Import tồn kho từ Excel"
            width={640}
            onCancel={handleClose}
            footer={
                result ? (
                    <Button type="primary" onClick={handleClose}>
                        Đóng
                    </Button>
                ) : (
                    <Space>
                        <Button onClick={handleClose}>Huỷ</Button>
                        <Button type="primary" loading={isPending} onClick={handleImport}>
                            Bắt đầu Import
                        </Button>
                    </Space>
                )
            }
            destroyOnClose
        >
            {result ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Alert
                        type={result.failed === 0 ? 'success' : 'warning'}
                        icon={result.failed === 0 ? <CheckCircleOutlined /> : undefined}
                        showIcon
                        message={
                            <Space direction="vertical" size={2}>
                                <Text>
                                    <CheckCircleOutlined style={{ color: '#16a34a' }} /> Thành công:{' '}
                                    <strong>{result.success}</strong> vật tư
                                </Text>
                                {result.failed > 0 && (
                                    <Text>
                                        <CloseCircleOutlined style={{ color: '#dc2626' }} /> Thất bại:{' '}
                                        <strong>{result.failed}</strong> dòng
                                    </Text>
                                )}
                            </Space>
                        }
                    />
                    {result.errors.length > 0 && (
                        <Table
                            dataSource={result.errors}
                            columns={errorColumns}
                            rowKey="row"
                            size="small"
                            pagination={false}
                            scroll={{ y: 200 }}
                        />
                    )}
                </Space>
            ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Space>
                        <Text>Chưa có file mẫu?</Text>
                        <Button
                            icon={<DownloadOutlined />}
                            size="small"
                            onClick={() => inventoryService.downloadTemplate()}
                        >
                            Tải file mẫu
                        </Button>
                    </Space>

                    <Dragger
                        accept=".xlsx"
                        maxCount={1}
                        fileList={fileList}
                        beforeUpload={() => false}
                        onChange={({ fileList: fl }) => setFileList(fl)}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Kéo thả file .xlsx vào đây hoặc click để chọn</p>
                        <p className="ant-upload-hint">Chỉ chấp nhận file .xlsx</p>
                    </Dragger>

                    <div>
                        <Text strong>
                            Lý do nhập <Text type="danger">*</Text>
                        </Text>
                        <Input
                            style={{ marginTop: 4 }}
                            placeholder="VD: Import tồn kho tháng 01/2026"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    {isPending && (
                        <Alert type="info" showIcon message="Đang xử lý..." />
                    )}
                </Space>
            )}
        </Modal>
    );
};

export default ModalImportExcel;
