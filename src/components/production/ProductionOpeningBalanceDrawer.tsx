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
    ProductionOpeningBalanceBatch,
    ProductionOpeningBalancePreview,
    ProductionOpeningBalancePreviewRow,
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
        quantity: number;
        unitPrice?: number | null;
    }>;
};

type ImportValues = {
    cutoffDate: Dayjs;
    note: string;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const money = (value = 0) => `${number(value)} đ`;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý sản lượng đầu kỳ');

const ProductionOpeningBalanceDrawer = ({ open, plantId, onClose, onChanged }: Props) => {
    const { isCompact: isMobile } = useResponsive();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [manualForm] = Form.useForm<ManualValues>();
    const [importForm] = Form.useForm<ImportValues>();
    const [activeTab, setActiveTab] = useState('overview');
    const [file, setFile] = useState<File | null>(null);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<ProductionOpeningBalancePreview | null>(null);
    const [voidTarget, setVoidTarget] = useState<ProductionOpeningBalanceBatch | null>(null);
    const [voidReason, setVoidReason] = useState('');

    const balanceQuery = useQuery({
        queryKey: ['production', 'opening-balances', plantId],
        queryFn: () => productionService.getOpeningBalances(plantId),
        enabled: open && Boolean(plantId),
        staleTime: 15_000,
    });
    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, 'opening-balance'],
        queryFn: () => productionService.getLines(plantId, true),
        enabled: open && Boolean(plantId),
        staleTime: 60_000,
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, 'opening-balance'],
        queryFn: () => productionService.getItems(plantId, true),
        enabled: open && Boolean(plantId),
        staleTime: 60_000,
    });

    const defaultCutoff = useMemo(
        () =>
            balanceQuery.data?.coverage.cutoffDate
                ? dayjs(balanceQuery.data.coverage.cutoffDate)
                : dayjs().subtract(1, 'day'),
        [balanceQuery.data]
    );

    useEffect(() => {
        if (!open) return;
        if (!manualForm.isFieldTouched('cutoffDate')) {
            manualForm.setFieldsValue({
                cutoffDate: defaultCutoff,
                entries: manualForm.getFieldValue('entries')?.length
                    ? manualForm.getFieldValue('entries')
                    : [{ quantity: 1 }],
            });
        }
        if (!importForm.isFieldTouched('cutoffDate')) {
            importForm.setFieldsValue({ cutoffDate: defaultCutoff });
        }
    }, [defaultCutoff, importForm, manualForm, open]);

    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['production', 'opening-balances', plantId] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'report'] }),
        ]);
        onChanged();
    };

    const manualMutation = useMutation({
        mutationFn: (values: ManualValues) =>
            productionService.createManualOpeningBalance({
                plantId,
                cutoffDate: values.cutoffDate.format('YYYY-MM-DD'),
                note: values.note.trim(),
                entries: values.entries.map((entry) => ({
                    ...entry,
                    itemId: entry.itemId || null,
                    orderCode: entry.orderCode?.trim() || undefined,
                    unitPrice: entry.unitPrice ?? null,
                })),
            }),
        onSuccess: async () => {
            message.success('Đã xác nhận sản lượng đầu kỳ');
            manualForm.resetFields();
            manualForm.setFieldsValue({ cutoffDate: defaultCutoff, entries: [{ quantity: 1 }] });
            setActiveTab('overview');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const previewMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error('Chọn file Excel trước khi xem trước');
            const values = await importForm.validateFields();
            return productionService.previewOpeningBalanceImport(file, {
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
            return productionService.confirmOpeningBalanceImport(file, {
                plantId,
                cutoffDate: values.cutoffDate.format('YYYY-MM-DD'),
                note: values.note.trim(),
            });
        },
        onSuccess: async () => {
            message.success('Đã nhập sản lượng đầu kỳ từ Excel');
            setFile(null);
            setFileList([]);
            setPreview(null);
            importForm.resetFields();
            importForm.setFieldsValue({ cutoffDate: defaultCutoff });
            setActiveTab('overview');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const voidMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            productionService.voidOpeningBalance(id, reason),
        onSuccess: async () => {
            message.success('Đã hủy batch đầu kỳ và cập nhật lại lũy kế');
            setVoidTarget(null);
            setVoidReason('');
            await refresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const downloadTemplate = async () => {
        try {
            const blob = await productionService.downloadOpeningBalanceTemplate(plantId);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `mau-san-luong-dau-ky-${balanceQuery.data?.plant.code || 'san-xuat'}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            message.error(errorMessage(error));
        }
    };

    const previewColumns: TableColumnsType<ProductionOpeningBalancePreviewRow> = [
        { title: 'Dòng', dataIndex: 'rowNumber', width: 64 },
        {
            title: 'Chuyền',
            key: 'line',
            width: 130,
            render: (_, row) => (
                <span className='pd-opening-cell'>
                    <strong>{row.lineCode || '—'}</strong>
                    <small>{row.lineName || 'Không khớp danh mục'}</small>
                </span>
            ),
        },
        {
            title: 'Mã hàng / đơn',
            key: 'item',
            width: 190,
            render: (_, row) => (
                <span className='pd-opening-cell'>
                    <strong>{row.itemCode || 'Chưa phân bổ'}</strong>
                    <small>{row.orderCode || row.itemName || '—'}</small>
                </span>
            ),
        },
        {
            title: 'Sản lượng',
            dataIndex: 'quantity',
            width: 110,
            align: 'right',
            render: (value) => (value === undefined ? '—' : number(value)),
        },
        {
            title: 'Kết quả',
            key: 'result',
            width: 220,
            render: (_, row) =>
                row.isValid ? (
                    <Tag color={row.allocationState === 'exact' ? 'success' : 'warning'}>
                        {row.allocationState === 'exact' ? 'Khớp chính xác' : 'Chưa phân bổ'}
                    </Tag>
                ) : (
                    <span className='pd-opening-errors'>{row.errors.join(' · ')}</span>
                ),
        },
    ];

    const coverage = balanceQuery.data?.coverage;
    const batches = balanceQuery.data?.batches || [];
    const lineOptions = (linesQuery.data || []).map((line) => ({
        value: line.id,
        label: `${line.code}${line.name ? ` - ${line.name}` : ''}`,
    }));
    const itemOptions = (itemsQuery.data || []).map((item) => ({
        value: item.id,
        label: `${item.code}${item.name ? ` - ${item.name}` : ''}`,
    }));

    const overview = balanceQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
    ) : (
        <div className='pd-opening-overview'>
            <section className={`pd-opening-coverage ${coverage?.available ? 'is-ready' : 'is-empty'}`}>
                <span className='pd-opening-coverage__icon'>
                    {coverage?.available ? <SafetyCertificateOutlined /> : <WarningFilled />}
                </span>
                <div className='pd-opening-coverage__copy'>
                    <small>TRẠNG THÁI ĐỐI SOÁT</small>
                    <strong>
                        {coverage?.available
                            ? `Đã chốt đến hết ${dayjs(coverage.cutoffDate).format('DD/MM/YYYY')}`
                            : 'Chưa có sản lượng đầu kỳ'}
                    </strong>
                    <p>
                        {coverage?.available
                            ? `${coverage.batchCount} batch đang hiệu lực · ${number(coverage.entryCount)} dòng nguồn`
                            : 'Hãy nhập số chuyển tiếp trước khi dùng lũy kế để ra quyết định.'}
                    </p>
                </div>
            </section>

            {coverage?.available ? (
                <section className='pd-opening-equation'>
                    <div>
                        <span>Tổng chuyển tiếp</span>
                        <strong>{number(coverage.totalQuantity)} SP</strong>
                    </div>
                    <i>=</i>
                    <div>
                        <span>Đã phân bổ</span>
                        <strong>{number(coverage.exactQuantity)} SP</strong>
                    </div>
                    <i>+</i>
                    <div className={coverage.unallocatedQuantity > 0 ? 'has-warning' : ''}>
                        <span>Chưa phân bổ</span>
                        <strong>{number(coverage.unallocatedQuantity)} SP</strong>
                    </div>
                    <div>
                        <span>Phủ đơn giá</span>
                        <strong>{number(coverage.amountCoveragePercent)}%</strong>
                    </div>
                </section>
            ) : null}

            <div className='pd-opening-section-title'>
                <div>
                    <HistoryOutlined />
                    <span>
                        <strong>Lịch sử xác nhận</strong>
                        <small>Batch đã hủy vẫn được giữ để truy vết.</small>
                    </span>
                </div>
                <Button icon={<PlusOutlined />} type='primary' onClick={() => setActiveTab('manual')}>
                    Nhập đầu kỳ
                </Button>
            </div>

            {!batches.length ? (
                <Empty description='Chưa có batch sản lượng đầu kỳ' />
            ) : (
                <div className='pd-opening-batches'>
                    {batches.map((batch) => (
                        <article key={batch.id} className={`pd-opening-batch status-${batch.status}`}>
                            <header>
                                <span className='pd-opening-batch__mark'>
                                    {batch.status === 'confirmed' ? <CheckCircleFilled /> : <DeleteOutlined />}
                                </span>
                                <div>
                                    <strong>{batch.code}</strong>
                                    <small>
                                        {batch.sourceType === 'excel'
                                            ? batch.sourceFileName || 'Excel'
                                            : 'Nhập thủ công'}
                                        {' · '}
                                        {dayjs(batch.confirmedAt).format('DD/MM/YYYY HH:mm')}
                                    </small>
                                </div>
                                <Tag color={batch.status === 'confirmed' ? 'success' : 'default'}>
                                    {batch.status === 'confirmed' ? 'Đang hiệu lực' : 'Đã hủy'}
                                </Tag>
                            </header>
                            <div className='pd-opening-batch__metrics'>
                                <span>
                                    <small>Sản lượng</small>
                                    <strong>{number(batch.summary.totalQuantity)} SP</strong>
                                </span>
                                <span>
                                    <small>Chi tiết</small>
                                    <strong>{batch.summary.entryCount} dòng</strong>
                                </span>
                                <span>
                                    <small>Giá trị có dữ liệu</small>
                                    <strong>{money(batch.summary.totalAmount)}</strong>
                                </span>
                            </div>
                            <footer>
                                <span>
                                    {batch.confirmedBy?.name || 'Người dùng'} · chốt đến{' '}
                                    {dayjs(batch.cutoffDate).format('DD/MM/YYYY')}
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
            className='pd-opening-form'
        >
            <Alert
                showIcon
                type='info'
                message='Nhập đúng cấp dữ liệu đang có'
                description='Có mã hàng thì hệ thống đối soát được theo mã hàng/đơn hàng. Để trống mã hàng khi nguồn cũ chỉ có tổng chuyền; hệ thống sẽ không tự đoán.'
            />
            <div className='pd-opening-form__meta'>
                <Form.Item
                    name='cutoffDate'
                    label='Số liệu đã cộng đến hết ngày'
                    rules={[{ required: true, message: 'Chọn ngày chốt' }]}
                >
                    <DatePicker format='DD/MM/YYYY' allowClear={false} />
                </Form.Item>
                <Form.Item
                    name='note'
                    label='Nguồn và lý do'
                    rules={[{ required: true, min: 3, message: 'Ghi rõ nguồn số liệu' }]}
                >
                    <Input placeholder='Ví dụ: Đối chiếu sổ chuyền đến 20/07/2026' maxLength={500} />
                </Form.Item>
            </div>
            <Form.List name='entries'>
                {(fields, { add, remove }) => (
                    <div className='pd-opening-manual-list'>
                        {fields.map((field, index) => (
                            <article key={field.key} className='pd-opening-manual-row'>
                                <span className='pd-opening-manual-row__index'>{index + 1}</span>
                                <Form.Item
                                    {...field}
                                    name={[field.name, 'lineId']}
                                    label='Chuyền'
                                    rules={[{ required: true, message: 'Chọn chuyền' }]}
                                >
                                    <Select
                                        showSearch
                                        optionFilterProp='label'
                                        options={lineOptions}
                                        placeholder='Chọn chuyền'
                                    />
                                </Form.Item>
                                <Form.Item {...field} name={[field.name, 'itemId']} label='Mã hàng'>
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp='label'
                                        options={itemOptions}
                                        placeholder='Để trống nếu chưa phân bổ'
                                        onChange={(itemId) => {
                                            const item = itemsQuery.data?.find((candidate) => candidate.id === itemId);
                                            manualForm.setFieldValue(
                                                ['entries', field.name, 'unitPrice'],
                                                item ? item.unitPrice : null
                                            );
                                            if (!itemId) {
                                                manualForm.setFieldValue(
                                                    ['entries', field.name, 'orderCode'],
                                                    undefined
                                                );
                                            }
                                        }}
                                    />
                                </Form.Item>
                                <Form.Item {...field} name={[field.name, 'orderCode']} label='Đơn hàng'>
                                    <Input placeholder='Không bắt buộc' maxLength={80} />
                                </Form.Item>
                                <Form.Item
                                    {...field}
                                    name={[field.name, 'quantity']}
                                    label='Sản lượng'
                                    rules={[{ required: true, message: 'Nhập sản lượng' }]}
                                >
                                    <InputNumber min={1} max={1_000_000_000} precision={0} />
                                </Form.Item>
                                <Form.Item {...field} name={[field.name, 'unitPrice']} label='Đơn giá lịch sử'>
                                    <InputNumber min={0} max={1_000_000_000} precision={0} />
                                </Form.Item>
                                <Button
                                    type='text'
                                    danger
                                    icon={<DeleteOutlined />}
                                    disabled={fields.length === 1}
                                    onClick={() => remove(field.name)}
                                    aria-label='Xóa dòng'
                                />
                            </article>
                        ))}
                        <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                            Thêm dòng
                        </Button>
                    </div>
                )}
            </Form.List>
            <div className='pd-opening-form__footer'>
                <Button onClick={() => setActiveTab('overview')}>Hủy</Button>
                <Popconfirm
                    title='Xác nhận số đầu kỳ?'
                    description='Batch sẽ tác động ngay đến toàn bộ báo cáo lũy kế.'
                    onConfirm={() => manualForm.submit()}
                    okText='Xác nhận'
                    cancelText='Kiểm tra lại'
                >
                    <Button type='primary' loading={manualMutation.isPending}>
                        Xác nhận số đầu kỳ
                    </Button>
                </Popconfirm>
            </div>
        </Form>
    );

    const importExcel = (
        <div className='pd-opening-import'>
            <div className='pd-opening-import__toolbar'>
                <div>
                    <FileExcelOutlined />
                    <span>
                        <strong>Import có kiểm tra trước</strong>
                        <small>Toàn bộ file phải hợp lệ mới được xác nhận.</small>
                    </span>
                </div>
                <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                    Tải file mẫu
                </Button>
            </div>
            <Form<ImportValues> form={importForm} layout='vertical' className='pd-opening-form__meta'>
                <Form.Item
                    name='cutoffDate'
                    label='Số liệu đã cộng đến hết ngày'
                    rules={[{ required: true, message: 'Chọn ngày chốt' }]}
                >
                    <DatePicker format='DD/MM/YYYY' allowClear={false} />
                </Form.Item>
                <Form.Item
                    name='note'
                    label='Nguồn file'
                    rules={[{ required: true, min: 3, message: 'Ghi rõ nguồn file' }]}
                >
                    <Input placeholder='Ví dụ: File tổng hợp sản lượng trước khi chạy hệ thống' maxLength={500} />
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
                <p className='ant-upload-hint'>Không tự cộng các dòng lỗi và không tự đoán mã hàng.</p>
            </Dragger>
            <div className='pd-opening-import__actions'>
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
                    disabled={!preview || preview.summary.invalidRows > 0 || preview.summary.validRows === 0}
                    loading={importMutation.isPending}
                    onClick={() => importMutation.mutate()}
                >
                    Xác nhận {preview?.summary.validRows || 0} dòng
                </Button>
            </div>
            {preview ? (
                <section className='pd-opening-preview'>
                    <div className='pd-opening-preview__summary'>
                        <span>
                            <small>Tổng dòng</small>
                            <strong>{preview.summary.totalRows}</strong>
                        </span>
                        <span className='is-valid'>
                            <small>Hợp lệ</small>
                            <strong>{preview.summary.validRows}</strong>
                        </span>
                        <span className={preview.summary.invalidRows ? 'is-invalid' : ''}>
                            <small>Cần sửa</small>
                            <strong>{preview.summary.invalidRows}</strong>
                        </span>
                        <span>
                            <small>Tổng sản lượng</small>
                            <strong>{number(preview.summary.totalQuantity)} SP</strong>
                        </span>
                    </div>
                    <Table
                        rowKey='rowNumber'
                        size='small'
                        columns={previewColumns}
                        dataSource={preview.rows}
                        pagination={{ pageSize: 8, showSizeChanger: false }}
                        scroll={{ x: 720 }}
                    />
                </section>
            ) : null}
        </div>
    );

    return (
        <>
            <Drawer
                open={open}
                onClose={onClose}
                placement={isMobile ? 'bottom' : 'right'}
                width={isMobile ? undefined : 860}
                height={isMobile ? '94dvh' : undefined}
                destroyOnHidden
                className='pd-opening-drawer'
                title={
                    <span className='pd-opening-drawer__title'>
                        <SafetyCertificateOutlined />
                        <span>
                            <strong>Sản lượng đầu kỳ</strong>
                            <small>Đối soát dữ liệu chuyển tiếp trước hệ thống</small>
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
                title={`Hủy ${voidTarget?.code || 'batch đầu kỳ'}`}
                okText='Hủy batch'
                okButtonProps={{
                    danger: true,
                    disabled: voidReason.trim().length < 5,
                    loading: voidMutation.isPending,
                }}
                cancelText='Giữ lại'
                onCancel={() => {
                    setVoidTarget(null);
                    setVoidReason('');
                }}
                onOk={() => {
                    if (!voidTarget || voidReason.trim().length < 5) return;
                    voidMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() });
                }}
            >
                <Alert
                    type='warning'
                    showIcon
                    message='Lũy kế sẽ được tính lại ngay'
                    description='Batch vẫn nằm trong lịch sử nhưng không còn được cộng vào báo cáo.'
                />
                <Input.TextArea
                    className='pd-opening-void-reason'
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                    placeholder='Nhập lý do hủy, tối thiểu 5 ký tự'
                    maxLength={500}
                    rows={4}
                />
            </Modal>
        </>
    );
};

export default ProductionOpeningBalanceDrawer;
