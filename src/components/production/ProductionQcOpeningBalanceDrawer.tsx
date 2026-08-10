import {
    CheckCircleFilled,
    CloudUploadOutlined,
    DeleteOutlined,
    DownloadOutlined,
    FileExcelOutlined,
    HistoryOutlined,
    InboxOutlined,
    PlusOutlined,
    SafetyCertificateOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Skeleton,
    Table,
    Tabs,
    Tag,
    Upload,
    type TableColumnsType,
    type UploadFile,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useResponsive } from '../../core/hooks/useResponsive';
import { productionService } from '../../core/services/production.service';
import type {
    ProductionQcOpeningBalanceBatch,
    ProductionQcOpeningBalancePreview,
    ProductionQcOpeningMode,
} from '../../core/types/production';

const { Dragger } = Upload;

type Props = {
    open: boolean;
    plantId: string;
    onClose: () => void;
    onChanged: () => void;
};

type ManualValues = {
    cutoffDate: Dayjs;
    note: string;
    entries: Array<{
        lineId: string;
        itemId?: string;
        orderCode?: string;
        mode: ProductionQcOpeningMode;
        passedQuantity: number;
        defectQuantity: number;
        pendingQuantity: number;
    }>;
};

type ImportValues = { cutoffDate: Dayjs; note: string };
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý số đầu kỳ QC');
const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const ProductionQcOpeningBalanceDrawer = ({ open, plantId, onClose, onChanged }: Props) => {
    const { isCompact } = useResponsive();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [manualForm] = Form.useForm<ManualValues>();
    const [importForm] = Form.useForm<ImportValues>();
    const [activeTab, setActiveTab] = useState('overview');
    const [file, setFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<ProductionQcOpeningBalancePreview | null>(null);
    const [voidTarget, setVoidTarget] = useState<ProductionQcOpeningBalanceBatch>();
    const [voidReason, setVoidReason] = useState('');

    const qcOpeningQuery = useQuery({
        queryKey: ['production', 'qc-opening-balances', plantId],
        queryFn: () => productionService.getQcOpeningBalances(plantId),
        enabled: open && Boolean(plantId),
        staleTime: 15_000,
    });
    const productionOpeningQuery = useQuery({
        queryKey: ['production', 'opening-balances', plantId, 'qc-reference'],
        queryFn: () => productionService.getOpeningBalances(plantId),
        enabled: open && Boolean(plantId),
        staleTime: 30_000,
    });
    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, 'qc-opening'],
        queryFn: () => productionService.getLines(plantId, true),
        enabled: open && Boolean(plantId),
        staleTime: 60_000,
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, 'qc-opening'],
        queryFn: () => productionService.getItems(plantId, true),
        enabled: open && Boolean(plantId),
        staleTime: 60_000,
    });
    const cutoffDate = productionOpeningQuery.data?.coverage.cutoffDate || qcOpeningQuery.data?.coverage.cutoffDate;
    const defaultCutoff = useMemo(() => dayjs(cutoffDate || dayjs().subtract(1, 'day')), [cutoffDate]);

    useEffect(() => {
        if (!open) return;
        manualForm.setFieldsValue({
            cutoffDate: defaultCutoff,
            entries: manualForm.getFieldValue('entries')?.length
                ? manualForm.getFieldValue('entries')
                : [
                      {
                          mode: 'full',
                          passedQuantity: 0,
                          defectQuantity: 0,
                          pendingQuantity: 0,
                      },
                  ],
        });
        importForm.setFieldValue('cutoffDate', defaultCutoff);
    }, [defaultCutoff, importForm, manualForm, open]);

    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['production', 'qc-opening-balances', plantId] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'qc-report'] }),
        ]);
        onChanged();
    };

    const manualMutation = useMutation({
        mutationFn: (values: ManualValues) =>
            productionService.createManualQcOpeningBalance({
                plantId,
                cutoffDate: values.cutoffDate.format('YYYY-MM-DD'),
                note: values.note.trim(),
                entries: values.entries.map((entry) => ({
                    ...entry,
                    itemId: entry.itemId || null,
                    orderCode: entry.orderCode?.trim() || undefined,
                    passedQuantity: Number(entry.passedQuantity || 0),
                    defectQuantity: Number(entry.defectQuantity || 0),
                    pendingQuantity: Number(entry.pendingQuantity || 0),
                })),
            }),
        onSuccess: async () => {
            message.success('Đã xác nhận số đầu kỳ QC');
            manualForm.resetFields();
            setActiveTab('overview');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const previewMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error('Chọn file Excel trước khi kiểm tra');
            const values = await importForm.validateFields();
            return productionService.previewQcOpeningBalanceImport(file, {
                plantId,
                cutoffDate: values.cutoffDate.format('YYYY-MM-DD'),
                note: values.note.trim(),
            });
        },
        onSuccess: setPreview,
        onError: (error) => message.error(errorMessage(error)),
    });
    const importMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error('Chọn file Excel trước khi xác nhận');
            const values = await importForm.validateFields();
            return productionService.confirmQcOpeningBalanceImport(file, {
                plantId,
                cutoffDate: values.cutoffDate.format('YYYY-MM-DD'),
                note: values.note.trim(),
            });
        },
        onSuccess: async () => {
            message.success('Đã nhập số đầu kỳ QC');
            setFile(null);
            setFileList([]);
            setPreview(null);
            importForm.resetFields();
            setActiveTab('overview');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const voidMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            productionService.voidQcOpeningBalance(id, reason),
        onSuccess: async () => {
            message.success('Đã hủy batch QC đầu kỳ');
            setVoidTarget(undefined);
            setVoidReason('');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const templateMutation = useMutation({
        mutationFn: () => productionService.downloadQcOpeningBalanceTemplate(plantId),
        onSuccess: (blob) => download(blob, `mau-qc-dau-ky-${plantId}.xlsx`),
        onError: (error) => message.error(errorMessage(error)),
    });

    const coverage = qcOpeningQuery.data?.coverage;
    const batches = qcOpeningQuery.data?.batches || [];
    const lineOptions = (linesQuery.data || []).map((line) => ({
        value: line.id,
        label: `${line.code} · ${line.name || ''}`,
    }));
    const itemOptions = (itemsQuery.data || []).map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name || ''}`,
    }));
    const previewColumns: TableColumnsType<ProductionQcOpeningBalancePreview['rows'][number]> = [
        { title: 'Dòng', dataIndex: 'rowNumber', width: 64 },
        { title: 'Chuyền', dataIndex: 'lineCode', width: 90 },
        { title: 'Mã hàng', dataIndex: 'itemCode', width: 120, render: (value) => value || 'Chưa phân bổ' },
        { title: 'Đạt', dataIndex: 'passedQuantity', width: 90, align: 'right', render: number },
        { title: 'Lỗi', dataIndex: 'defectQuantity', width: 90, align: 'right', render: number },
        { title: 'Chưa kiểm', dataIndex: 'pendingQuantity', width: 110, align: 'right', render: number },
        {
            title: 'Kiểm tra',
            key: 'status',
            width: 230,
            render: (_, row) =>
                row.isValid ? (
                    <Tag color='success'>Hợp lệ</Tag>
                ) : (
                    <span className='qc-opening-errors'>{row.errors.join(' · ')}</span>
                ),
        },
    ];

    const overview = qcOpeningQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
    ) : (
        <div className='qc-opening-overview'>
            <section className={`qc-opening-status ${coverage?.available ? 'is-ready' : 'is-missing'}`}>
                <span>{coverage?.available ? <SafetyCertificateOutlined /> : <WarningFilled />}</span>
                <div>
                    <small>TRẠNG THÁI ĐỐI SOÁT QC</small>
                    <strong>
                        {coverage?.available
                            ? `Đã chốt đến ${dayjs(coverage.cutoffDate).format('DD/MM/YYYY')}`
                            : 'Chưa khai báo số đầu kỳ QC'}
                    </strong>
                    <p>
                        {coverage?.available
                            ? `${number(coverage.pendingQuantity)} SP chờ QC tại thời điểm chốt · phân bổ chính xác ${number(coverage.exactCoveragePercent)}%`
                            : productionOpeningQuery.data?.coverage.available
                              ? 'Đã có sản lượng đầu kỳ; cần bổ sung QC đầu kỳ để tính tồn chờ.'
                              : 'Cần khai báo sản lượng đầu kỳ trước khi nhập QC đầu kỳ.'}
                    </p>
                </div>
            </section>
            {coverage?.available ? (
                <section className='qc-opening-equation'>
                    <span>
                        <small>Đã kiểm đạt</small>
                        <strong>{number(coverage.passedQuantity)}</strong>
                    </span>
                    <i>+</i>
                    <span>
                        <small>Đã kiểm lỗi</small>
                        <strong>{number(coverage.defectQuantity)}</strong>
                    </span>
                    <i>+</i>
                    <span className='is-pending'>
                        <small>Chưa kiểm</small>
                        <strong>{number(coverage.pendingQuantity)}</strong>
                    </span>
                </section>
            ) : null}
            <div className='qc-opening-section-title'>
                <span>
                    <HistoryOutlined />
                    <strong>Lịch sử batch</strong>
                </span>
                <Button
                    type='primary'
                    icon={<PlusOutlined />}
                    disabled={!productionOpeningQuery.data?.coverage.available}
                    onClick={() => setActiveTab('manual')}
                >
                    Khai báo đầu kỳ
                </Button>
            </div>
            {!batches.length ? (
                <Empty description='Chưa có batch QC đầu kỳ' />
            ) : (
                <div className='qc-opening-batches'>
                    {batches.map((batch) => (
                        <article key={batch.id} className={`status-${batch.status}`}>
                            <header>
                                <span>{batch.status === 'confirmed' ? <CheckCircleFilled /> : <DeleteOutlined />}</span>
                                <div>
                                    <strong>{batch.code}</strong>
                                    <small>
                                        {batch.sourceType === 'excel' ? batch.sourceFileName : 'Nhập thủ công'}
                                    </small>
                                </div>
                                <Tag color={batch.status === 'confirmed' ? 'success' : 'default'}>
                                    {batch.status === 'confirmed' ? 'Hiệu lực' : 'Đã hủy'}
                                </Tag>
                            </header>
                            <div>
                                <span>
                                    <small>Đã kiểm</small>
                                    <strong>{number(batch.summary.inspectedQuantity)}</strong>
                                </span>
                                <span>
                                    <small>Chờ QC</small>
                                    <strong>{number(batch.summary.pendingQuantity)}</strong>
                                </span>
                                <span>
                                    <small>Dòng nguồn</small>
                                    <strong>{number(batch.summary.entryCount)}</strong>
                                </span>
                            </div>
                            <footer>
                                <span>
                                    {batch.confirmedBy?.name || 'Người dùng'} ·{' '}
                                    {dayjs(batch.confirmedAt).format('DD/MM/YYYY HH:mm')}
                                </span>
                                {batch.status === 'confirmed' ? (
                                    <Button danger type='text' onClick={() => setVoidTarget(batch)}>
                                        Hủy batch
                                    </Button>
                                ) : (
                                    <span>{batch.voidReason}</span>
                                )}
                            </footer>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );

    const manual = (
        <Form<ManualValues>
            form={manualForm}
            layout='vertical'
            onFinish={(values) => manualMutation.mutate(values)}
            className='qc-opening-form'
        >
            <Alert
                showIcon
                type='info'
                message='Đối soát theo đúng nguồn lịch sử'
                description='Chế độ đầy đủ phải khớp phương trình sản đầu kỳ = đạt + lỗi + chưa kiểm. Nếu hồ sơ cũ chỉ còn số tồn, chọn “Chỉ biết tồn”.'
            />
            <div className='qc-opening-meta'>
                <Form.Item name='cutoffDate' label='Chốt đến hết ngày' rules={[{ required: true }]}>
                    <DatePicker format='DD/MM/YYYY' disabled={Boolean(cutoffDate)} />
                </Form.Item>
                <Form.Item
                    name='note'
                    label='Nguồn số liệu'
                    rules={[{ required: true, min: 3, message: 'Ghi rõ nguồn số liệu' }]}
                >
                    <Input maxLength={500} placeholder='Ví dụ: Sổ QC và bảng tồn đến 31/07/2026' />
                </Form.Item>
            </div>
            <Form.List name='entries'>
                {(fields, { add, remove }) => (
                    <div className='qc-opening-manual-list'>
                        {fields.map((field, index) => (
                            <article key={field.key} className='qc-opening-manual-row'>
                                <header>
                                    <strong>Dòng {index + 1}</strong>
                                    <Button
                                        type='text'
                                        danger
                                        icon={<DeleteOutlined />}
                                        disabled={fields.length === 1}
                                        onClick={() => remove(field.name)}
                                    />
                                </header>
                                <Form.Item
                                    name={[field.name, 'lineId']}
                                    label='Chuyền'
                                    rules={[{ required: true, message: 'Chọn chuyền' }]}
                                >
                                    <Select showSearch optionFilterProp='label' options={lineOptions} />
                                </Form.Item>
                                <Form.Item name={[field.name, 'itemId']} label='Mã hàng'>
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp='label'
                                        options={itemOptions}
                                        placeholder='Để trống nếu chưa phân bổ'
                                    />
                                </Form.Item>
                                <Form.Item name={[field.name, 'orderCode']} label='Đơn hàng'>
                                    <Input maxLength={80} />
                                </Form.Item>
                                <Form.Item name={[field.name, 'mode']} label='Chế độ' rules={[{ required: true }]}>
                                    <Select
                                        options={[
                                            { value: 'full', label: 'Đầy đủ đạt/lỗi/tồn' },
                                            { value: 'backlog_only', label: 'Chỉ biết tồn chờ QC' },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, next) =>
                                        prev.entries?.[field.name]?.mode !== next.entries?.[field.name]?.mode
                                    }
                                >
                                    {({ getFieldValue }) => {
                                        const backlogOnly =
                                            getFieldValue(['entries', field.name, 'mode']) === 'backlog_only';
                                        return (
                                            <>
                                                <Form.Item name={[field.name, 'passedQuantity']} label='QC đạt'>
                                                    <InputNumber min={0} precision={0} disabled={backlogOnly} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, 'defectQuantity']} label='QC lỗi'>
                                                    <InputNumber min={0} precision={0} disabled={backlogOnly} />
                                                </Form.Item>
                                            </>
                                        );
                                    }}
                                </Form.Item>
                                <Form.Item
                                    name={[field.name, 'pendingQuantity']}
                                    label='Chưa kiểm'
                                    rules={[{ required: true, message: 'Nhập số chưa kiểm' }]}
                                >
                                    <InputNumber min={0} precision={0} />
                                </Form.Item>
                            </article>
                        ))}
                        <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                                add({ mode: 'full', passedQuantity: 0, defectQuantity: 0, pendingQuantity: 0 })
                            }
                        >
                            Thêm dòng
                        </Button>
                    </div>
                )}
            </Form.List>
            <div className='qc-opening-actions'>
                <Button onClick={() => setActiveTab('overview')}>Hủy</Button>
                <Popconfirm
                    title='Xác nhận số đầu kỳ QC?'
                    description='Báo cáo lũy kế sẽ được tính lại ngay.'
                    onConfirm={() => manualForm.submit()}
                >
                    <Button type='primary' loading={manualMutation.isPending}>
                        Xác nhận đầu kỳ
                    </Button>
                </Popconfirm>
            </div>
        </Form>
    );

    const importExcel = (
        <div className='qc-opening-import'>
            <div className='qc-opening-import__head'>
                <span>
                    <FileExcelOutlined />
                    <strong>Import có kiểm tra đối soát</strong>
                </span>
                <Button
                    icon={<DownloadOutlined />}
                    loading={templateMutation.isPending}
                    onClick={() => templateMutation.mutate()}
                >
                    Tải file mẫu
                </Button>
            </div>
            <Form<ImportValues> form={importForm} layout='vertical' className='qc-opening-meta'>
                <Form.Item name='cutoffDate' label='Chốt đến hết ngày' rules={[{ required: true }]}>
                    <DatePicker format='DD/MM/YYYY' disabled={Boolean(cutoffDate)} />
                </Form.Item>
                <Form.Item
                    name='note'
                    label='Nguồn file'
                    rules={[{ required: true, min: 3, message: 'Ghi rõ nguồn file' }]}
                >
                    <Input maxLength={500} />
                </Form.Item>
            </Form>
            <Dragger
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
                <p className='ant-upload-text'>Kéo file XLSX vào đây hoặc bấm để chọn</p>
                <p className='ant-upload-hint'>Hệ thống không xác nhận một phần và không tự đoán mã hàng.</p>
            </Dragger>
            <div className='qc-opening-actions'>
                <Button
                    icon={<CloudUploadOutlined />}
                    disabled={!file}
                    loading={previewMutation.isPending}
                    onClick={() => previewMutation.mutate()}
                >
                    Kiểm tra file
                </Button>
                <Button
                    type='primary'
                    disabled={
                        !preview || preview.summary.invalidRows > 0 || preview.summary.reconciliationInvalidCount > 0
                    }
                    loading={importMutation.isPending}
                    onClick={() => importMutation.mutate()}
                >
                    Xác nhận {preview?.summary.validRows || 0} dòng
                </Button>
            </div>
            {preview ? (
                <section className='qc-opening-preview'>
                    <div>
                        <span>
                            Tổng <strong>{preview.summary.totalRows}</strong>
                        </span>
                        <span>
                            Hợp lệ <strong>{preview.summary.validRows}</strong>
                        </span>
                        <span className={preview.summary.invalidRows ? 'is-error' : ''}>
                            Lỗi <strong>{preview.summary.invalidRows}</strong>
                        </span>
                        <span className={preview.summary.reconciliationInvalidCount ? 'is-error' : ''}>
                            Lệch đối soát <strong>{preview.summary.reconciliationInvalidCount}</strong>
                        </span>
                    </div>
                    <Table
                        rowKey='rowNumber'
                        size='small'
                        columns={previewColumns}
                        dataSource={preview.rows}
                        pagination={{ pageSize: 8, showSizeChanger: false }}
                        scroll={{ x: 820 }}
                    />
                    {preview.reconciliation.some((row) => !row.reconciled) ? (
                        <div className='qc-opening-reconciliation-issues'>
                            <strong>Các dòng chưa khớp nguồn sản lượng</strong>
                            {preview.reconciliation
                                .filter((row) => !row.reconciled)
                                .map((row) => (
                                    <article key={row.entryKey}>
                                        <span>
                                            {row.lineCode} · {row.itemCode || 'Chưa phân bổ'}
                                            {row.orderCode ? ` · ${row.orderCode}` : ''}
                                        </span>
                                        <p>{row.message}</p>
                                        <small>
                                            Nguồn {number(row.productionQuantity)} · Khai báo{' '}
                                            {number(row.declaredQuantity)}
                                        </small>
                                    </article>
                                ))}
                        </div>
                    ) : null}
                </section>
            ) : null}
        </div>
    );

    return (
        <>
            <Drawer
                open={open}
                onClose={onClose}
                placement={isCompact ? 'bottom' : 'right'}
                width={isCompact ? undefined : 900}
                height={isCompact ? '94dvh' : undefined}
                destroyOnHidden
                className='qc-opening-drawer'
                title={
                    <span className='qc-opening-title'>
                        <SafetyCertificateOutlined />
                        <span>
                            <strong>Số đầu kỳ QC</strong>
                            <small>Nền dữ liệu cho đối soát sản và lượng chờ kiểm</small>
                        </span>
                    </span>
                }
            >
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { key: 'overview', label: 'Tổng quan', children: overview },
                        { key: 'manual', label: 'Nhập thủ công', children: manual },
                        { key: 'excel', label: 'Import Excel', children: importExcel },
                    ]}
                />
            </Drawer>
            <Modal
                open={Boolean(voidTarget)}
                title={`Hủy ${voidTarget?.code || 'batch QC đầu kỳ'}`}
                okText='Hủy batch'
                cancelText='Giữ lại'
                okButtonProps={{
                    danger: true,
                    disabled: voidReason.trim().length < 5,
                    loading: voidMutation.isPending,
                }}
                onCancel={() => {
                    setVoidTarget(undefined);
                    setVoidReason('');
                }}
                onOk={() => voidTarget && voidMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() })}
            >
                <Alert type='warning' showIcon message='Lượng chờ QC lũy kế sẽ được tính lại' />
                <Input.TextArea
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder='Lý do hủy, tối thiểu 5 ký tự'
                    style={{ marginTop: 12 }}
                />
            </Modal>
        </>
    );
};

export default ProductionQcOpeningBalanceDrawer;
