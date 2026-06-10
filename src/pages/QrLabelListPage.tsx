import React, { useMemo, useState } from 'react';
import {
    App,
    Button,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    FileAddOutlined,
    PrinterOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import { plantService } from '../core/services';
import { qrLabelService, type QrBatchListParams, type QrLabelListParams } from '../core/services/qr-label.service';
import { QrLabelBatchStatus, QrLabelStatus, QrLabelType, type QrLabel, type QrLabelBatch } from '../core/types';

const { Text } = Typography;

const labelStatusMeta: Record<QrLabelStatus, { label: string; color: string }> = {
    [QrLabelStatus.UNUSED]: { label: 'Chưa kích hoạt', color: 'blue' },
    [QrLabelStatus.ASSIGNED]: { label: 'Đã gán máy', color: 'green' },
    [QrLabelStatus.RETIRED]: { label: 'Đã thay thế', color: 'default' },
    [QrLabelStatus.LOST]: { label: 'Báo mất', color: 'red' },
    [QrLabelStatus.DAMAGED]: { label: 'Tem hỏng', color: 'orange' },
};

const batchStatusMeta: Record<QrLabelBatchStatus, { label: string; color: string }> = {
    [QrLabelBatchStatus.DRAFT]: { label: 'Chưa in', color: 'blue' },
    [QrLabelBatchStatus.PRINTED]: { label: 'Đã in', color: 'gold' },
    [QrLabelBatchStatus.PARTIALLY_ASSIGNED]: { label: 'Đang gán', color: 'purple' },
    [QrLabelBatchStatus.COMPLETED]: { label: 'Hoàn tất', color: 'green' },
};

const typeOptions = [{ value: QrLabelType.MACHINE, label: 'Tem máy' }];

const renderLabelStatus = (status: QrLabelStatus) => {
    const meta = labelStatusMeta[status] ?? labelStatusMeta.unused;
    return <Tag color={meta.color}>{meta.label}</Tag>;
};

const renderBatchStatus = (status: QrLabelBatchStatus) => {
    const meta = batchStatusMeta[status] ?? batchStatusMeta.draft;
    return <Tag color={meta.color}>{meta.label}</Tag>;
};

const QrLabelListPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [batchForm] = Form.useForm();
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchParams, setBatchParams] = useState<QrBatchListParams>({ page: 1, limit: 10 });
    const [labelParams, setLabelParams] = useState<QrLabelListParams>({ page: 1, limit: 10 });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                value: plant.id,
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
            })),
        [plants]
    );

    const { data: batchResponse, isLoading: isLoadingBatches } = useQuery({
        queryKey: ['qr-label-batches', batchParams],
        queryFn: () => qrLabelService.getBatches(batchParams),
    });

    const { data: labelResponse, isLoading: isLoadingLabels } = useQuery({
        queryKey: ['qr-labels', labelParams],
        queryFn: () => qrLabelService.getLabels(labelParams),
    });

    const createBatchMutation = useMutation({
        mutationFn: qrLabelService.createBatch,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            queryClient.invalidateQueries({ queryKey: ['qr-labels'] });
            setIsBatchModalOpen(false);
            batchForm.resetFields();
            message.success('Đã tạo lô tem QR');
        },
    });

    const createSingleMutation = useMutation({
        mutationFn: () => qrLabelService.createLabel({ type: QrLabelType.MACHINE }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qr-labels'] });
            message.success('Đã tạo 1 tem QR trắng');
        },
    });

    const markPrintedMutation = useMutation({
        mutationFn: qrLabelService.markBatchPrinted,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            queryClient.invalidateQueries({ queryKey: ['qr-labels'] });
            message.success('Đã đánh dấu lô tem đã in');
        },
    });

    const handleCreateBatch = async () => {
        const values = await batchForm.validateFields();
        createBatchMutation.mutate({
            type: QrLabelType.MACHINE,
            quantity: Number(values.quantity),
            plantId: values.plantId,
            area: values.area?.trim(),
            note: values.note?.trim(),
        });
    };

    const batchColumns: TableColumnsType<QrLabelBatch> = [
        {
            title: 'LÔ TEM',
            key: 'code',
            render: (_value, record) => (
                <div className='flex flex-col'>
                    <span className='font-mono text-sm font-bold text-slate-900'>{record.code}</span>
                    <Text type='secondary' className='text-xs'>
                        {record.plant?.name || 'Không gán cơ sở'} {record.area ? `- ${record.area}` : ''}
                    </Text>
                </div>
            ),
        },
        {
            title: 'LOẠI',
            dataIndex: 'type',
            width: 120,
            render: () => <Tag color='geekblue'>Tem máy</Tag>,
        },
        {
            title: 'TIẾN ĐỘ',
            key: 'progress',
            width: 170,
            render: (_value, record) => (
                <div className='flex flex-col'>
                    <span className='text-sm font-bold text-slate-800'>
                        {record.assignedCount ?? 0}/{record.quantity} đã gán
                    </span>
                    <Text type='secondary' className='text-xs'>
                        Còn {record.unusedCount ?? record.quantity} tem trắng
                    </Text>
                </div>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            width: 140,
            render: renderBatchStatus,
        },
        {
            title: 'NGÀY TẠO',
            dataIndex: 'createdAt',
            width: 130,
            render: (value: string) => new Date(value).toLocaleDateString('vi-VN'),
        },
        {
            title: 'THAO TÁC',
            key: 'actions',
            width: 230,
            align: 'right',
            render: (_value, record) => (
                <Space size='small' onClick={(e) => e.stopPropagation()}>
                    <Tooltip title='Mở trang in tem'>
                        <Button
                            icon={<PrinterOutlined />}
                            onClick={() => navigate(`/qr-labels/batches/${record.id}/print`)}
                        >
                            In tem
                        </Button>
                    </Tooltip>
                    {!record.printedAt ? (
                        <Tooltip title='Đánh dấu đã in'>
                            <Button
                                icon={<CheckCircleOutlined />}
                                loading={markPrintedMutation.isPending}
                                onClick={() => markPrintedMutation.mutate(record.id)}
                            />
                        </Tooltip>
                    ) : null}
                </Space>
            ),
        },
    ];

    const labelColumns: TableColumnsType<QrLabel> = [
        {
            title: 'MÃ QR',
            key: 'publicId',
            width: 150,
            render: (_value, record) => (
                <button
                    type='button'
                    className='font-mono text-sm font-bold text-blue-700 hover:text-blue-800'
                    onClick={() => navigate(`/qr/${record.publicId}`)}
                >
                    {record.publicId}
                </button>
            ),
        },
        {
            title: 'LÔ',
            dataIndex: 'batchCode',
            width: 140,
            render: (value?: string) => value || '-',
        },
        {
            title: 'MÁY ĐÃ GÁN',
            key: 'asset',
            render: (_value, record) =>
                record.asset ? (
                    <div className='flex flex-col'>
                        <span className='font-semibold text-slate-800'>{record.asset.name}</span>
                        <Text type='secondary' className='font-mono text-xs'>
                            {record.asset.machineCode}
                        </Text>
                    </div>
                ) : (
                    <Text type='secondary'>Chưa gán máy</Text>
                ),
        },
        {
            title: 'DỰ KIẾN',
            key: 'planned',
            render: (_value, record) => (
                <span className='text-sm text-slate-700'>
                    {record.plannedPlant?.name || '-'} {record.plannedArea ? `- ${record.plannedArea}` : ''}
                </span>
            ),
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'status',
            width: 150,
            render: renderLabelStatus,
        },
        {
            title: 'QUÉT',
            dataIndex: 'scanCount',
            width: 90,
            render: (value: number) => value || 0,
        },
    ];

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Quản Lý Tem QR'
                subtitle='Tạo tem QR trắng, in hàng loạt và theo dõi quá trình gán tem vào hồ sơ máy thực tế.'
                actions={
                    <Space wrap>
                        <Button
                            icon={<QrcodeOutlined />}
                            loading={createSingleMutation.isPending}
                            onClick={() => createSingleMutation.mutate()}
                        >
                            Tạo 1 QR trắng
                        </Button>
                        <Button type='primary' icon={<FileAddOutlined />} onClick={() => setIsBatchModalOpen(true)}>
                            Tạo lô QR
                        </Button>
                    </Space>
                }
            />

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                    <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                        <div>
                            <div className='text-base font-bold text-slate-900'>Lô in tem</div>
                            <Text type='secondary'>Quản lý batch để in và theo dõi tiến độ dán tem.</Text>
                        </div>
                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder='Tìm mã lô, khu vực...'
                            className='md:max-w-xs'
                            onPressEnter={(e) =>
                                setBatchParams((prev) => ({
                                    ...prev,
                                    search: e.currentTarget.value.trim() || undefined,
                                    page: 1,
                                }))
                            }
                        />
                    </div>
                    <Table<QrLabelBatch>
                        rowKey='id'
                        loading={isLoadingBatches}
                        columns={batchColumns}
                        dataSource={batchResponse?.data ?? []}
                        scroll={{ x: 900 }}
                        pagination={{
                            current: batchResponse?.page ?? batchParams.page,
                            pageSize: batchResponse?.limit ?? batchParams.limit,
                            total: batchResponse?.total ?? 0,
                            onChange: (page, limit) => setBatchParams((prev) => ({ ...prev, page, limit })),
                        }}
                        onRow={(record) => ({
                            onClick: () => navigate(`/qr-labels/batches/${record.id}/print`),
                            style: { cursor: 'pointer' },
                        })}
                    />
                </div>

                <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                    <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                        <div>
                            <div className='text-base font-bold text-slate-900'>Tem QR</div>
                            <Text type='secondary'>Tra nhanh tem trắng, tem đã gán và số lần quét.</Text>
                        </div>
                        <Space.Compact className='md:max-w-md'>
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder='Tìm mã QR...'
                                onPressEnter={(e) =>
                                    setLabelParams((prev) => ({
                                        ...prev,
                                        search: e.currentTarget.value.trim() || undefined,
                                        page: 1,
                                    }))
                                }
                            />
                            <Select
                                allowClear
                                placeholder='Trạng thái'
                                className='min-w-36'
                                options={Object.values(QrLabelStatus).map((status) => ({
                                    value: status,
                                    label: labelStatusMeta[status].label,
                                }))}
                                onChange={(status) => setLabelParams((prev) => ({ ...prev, status, page: 1 }))}
                            />
                        </Space.Compact>
                    </div>
                    <Table<QrLabel>
                        rowKey='id'
                        loading={isLoadingLabels}
                        columns={labelColumns}
                        dataSource={labelResponse?.data ?? []}
                        scroll={{ x: 900 }}
                        pagination={{
                            current: labelResponse?.page ?? labelParams.page,
                            pageSize: labelResponse?.limit ?? labelParams.limit,
                            total: labelResponse?.total ?? 0,
                            onChange: (page, limit) => setLabelParams((prev) => ({ ...prev, page, limit })),
                        }}
                    />
                </div>
            </div>

            <Modal
                open={isBatchModalOpen}
                title='Tạo lô tem QR trắng'
                okText='Tạo lô'
                cancelText='Hủy'
                confirmLoading={createBatchMutation.isPending}
                onOk={handleCreateBatch}
                onCancel={() => setIsBatchModalOpen(false)}
                destroyOnHidden
            >
                <Form
                    form={batchForm}
                    layout='vertical'
                    initialValues={{ quantity: 100, type: QrLabelType.MACHINE }}
                    className='mt-4'
                >
                    <Form.Item label='Loại tem' name='type'>
                        <Select disabled options={typeOptions} />
                    </Form.Item>
                    <Form.Item
                        label='Số lượng'
                        name='quantity'
                        rules={[{ required: true, message: 'Nhập số lượng tem cần tạo' }]}
                    >
                        <InputNumber min={1} max={3000} className='w-full' />
                    </Form.Item>
                    <Form.Item label='Cơ sở dự kiến' name='plantId'>
                        <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={plantOptions} />
                    </Form.Item>
                    <Form.Item label='Khu vực dự kiến' name='area'>
                        <Input allowClear placeholder='Ví dụ: Xưởng May 1' />
                    </Form.Item>
                    <Form.Item label='Ghi chú' name='note'>
                        <Input.TextArea rows={3} placeholder='Ví dụ: Lô tem dán đợt kiểm kê tháng 06/2026' />
                    </Form.Item>
                </Form>
                <div className='rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800'>
                    QR trắng chưa tạo máy. Khi quét, tài khoản có quyền sẽ vào màn kích hoạt để nhập hoặc gán hồ sơ máy.
                </div>
            </Modal>
        </div>
    );
};

export default QrLabelListPage;
