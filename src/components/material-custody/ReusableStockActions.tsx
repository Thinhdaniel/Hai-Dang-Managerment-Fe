import { useState } from 'react';
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Pagination, Select, Space, Tooltip } from 'antd';
import { HistoryOutlined, ToolOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    materialCustodyService,
    type ReusableMaterialStock,
    type ReusableProcessPayload,
    type ReusableBucket,
} from '../../core/services/material-custody.service';

const buckets = { available: 'Dùng được', repair: 'Chờ sửa', damaged: 'Hỏng' };
const actions = {
    repair_complete: 'Sửa xong',
    mark_damaged: 'Chuyển hỏng',
    dispose: 'Loại bỏ',
    return: 'Thu hồi',
    reissue: 'Cấp lại',
};
export default function ReusableStockActions({
    row,
    onSuccess,
}: {
    row: ReusableMaterialStock;
    onSuccess: () => Promise<void>;
}) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState(false);
    const [page, setPage] = useState(1);
    const [form] = Form.useForm<ReusableProcessPayload>();
    const bucket: ReusableBucket = Form.useWatch('fromBucket', form) || 'repair';
    const quantity = row[`${bucket}Quantity`];
    const value = row[`${bucket}ReferenceValue`];
    const historyQuery = useQuery({
        queryKey: ['material-custody', 'pool-history', row.id, page, row.lastMovementAt],
        queryFn: () => materialCustodyService.getReusableMovements(row.id, page),
        enabled: history,
    });
    const mutation = useMutation({
        mutationFn: (data: ReusableProcessPayload) => materialCustodyService.processReusableStock(row.id, data),
        onSuccess: async () => {
            await onSuccess();
            setOpen(false);
            form.resetFields();
            message.success('Đã xử lý và lưu lịch sử');
        },
        onError: (error: Error) => message.error(error.message || 'Không thể xử lý vật tư'),
    });
    return (
        <div className='mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3'>
            <Button
                icon={<ToolOutlined />}
                onClick={() => {
                    form.setFieldsValue({ fromBucket: 'repair', action: 'repair_complete', quantity: 1 });
                    setOpen(true);
                }}
            >
                Xử lý tồn
            </Button>
            <Tooltip title='Lịch sử kho thu hồi'>
                <Button aria-label='Lịch sử kho thu hồi' icon={<HistoryOutlined />} onClick={() => setHistory(true)} />
            </Tooltip>
            <Modal
                title={`Xử lý tồn · ${row.materialName}`}
                open={open}
                onCancel={() => {
                    if (!mutation.isPending) {
                        setOpen(false);
                        form.resetFields();
                    }
                }}
                onOk={() => form.submit()}
                confirmLoading={mutation.isPending}
                okText='Xác nhận xử lý'
                cancelText='Hủy'
                width={520}
            >
                <Form
                    form={form}
                    layout='vertical'
                    onFinish={(values) => {
                        if (values.action === 'dispose')
                            Modal.confirm({
                                title: 'Xác nhận loại bỏ vật tư?',
                                content: `${values.quantity} ${row.unit} sẽ ra khỏi kho tái sử dụng. Thao tác được lưu lịch sử, không tự ghi chi phí.`,
                                okText: 'Loại bỏ',
                                okButtonProps: { danger: true },
                                onOk: () => mutation.mutateAsync(values),
                            });
                        else mutation.mutate(values);
                    }}
                >
                    <Form.Item name='fromBucket' label='Tình trạng hiện tại' rules={[{ required: true }]}>
                        <Select
                            options={Object.entries(buckets).map(([value, label]) => ({ value, label }))}
                            onChange={(value) => {
                                form.setFieldsValue({
                                    action: value === 'repair' ? 'repair_complete' : 'dispose',
                                    referenceUnitPrice: undefined,
                                });
                            }}
                        />
                    </Form.Item>
                    <Form.Item name='action' label='Kết quả xử lý' rules={[{ required: true }]}>
                        <Select
                            options={(['repair_complete', 'mark_damaged', 'dispose'] as const)
                                .filter((action) =>
                                    action === 'repair_complete'
                                        ? bucket === 'repair'
                                        : action === 'mark_damaged'
                                          ? bucket !== 'damaged'
                                          : true
                                )
                                .map((value) => ({ value, label: actions[value] }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name='quantity'
                        label={`Số lượng (còn ${quantity} ${row.unit})`}
                        rules={[{ required: true }, { type: 'number', min: 0.000001, max: quantity }]}
                    >
                        <InputNumber
                            min={0.000001}
                            max={quantity}
                            precision={row.trackingMode === 'serialized' ? 0 : 6}
                            className='w-full'
                        />
                    </Form.Item>
                    {value === undefined && quantity > 0 && (
                        <Form.Item
                            name='referenceUnitPrice'
                            label='Xác nhận đơn giá tham chiếu tồn cũ (đ)'
                            rules={[{ required: true }]}
                            extra='Không phát sinh chi phí mới.'
                        >
                            <InputNumber min={0} className='w-full' />
                        </Form.Item>
                    )}
                    <Form.Item
                        name='note'
                        label='Lý do / kết quả kiểm tra'
                        rules={[{ required: true, whitespace: true }]}
                    >
                        <Input.TextArea maxLength={1000} rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
            <Drawer
                title={`Lịch sử kho · ${row.materialName}`}
                open={history}
                onClose={() => setHistory(false)}
                width={480}
            >
                <Space direction='vertical' size='middle' className='w-full'>
                    {historyQuery.isLoading && <div>Đang tải...</div>}
                    {historyQuery.isError && (
                        <Button onClick={() => void historyQuery.refetch()}>Tải lại lịch sử</Button>
                    )}
                    {historyQuery.data?.data.map((item) => (
                        <div key={item.id} className='border-b border-gray-200 pb-3'>
                            <strong>
                                {actions[item.type]} · {item.quantity} {row.unit}
                            </strong>
                            <div>
                                {item.fromBucket ? buckets[item.fromBucket] : 'Người giữ'} →{' '}
                                {item.toBucket
                                    ? buckets[item.toBucket]
                                    : item.type === 'dispose'
                                      ? 'Loại bỏ'
                                      : 'Người giữ'}
                            </div>
                            <div>{item.note}</div>
                            <div className='text-xs text-gray-500'>
                                {new Date(item.occurredAt).toLocaleString('vi-VN')} ·{' '}
                                {item.performedBy?.fullName || item.performedBy?.name || item.performedBy?.email || ''}
                            </div>
                        </div>
                    ))}
                    {historyQuery.data?.total === 0 && <div>Chưa có lịch sử kho được ghi nhận.</div>}
                    <Pagination
                        simple
                        current={page}
                        pageSize={15}
                        total={historyQuery.data?.total || 0}
                        showSizeChanger={false}
                        onChange={setPage}
                    />
                </Space>
            </Drawer>
        </div>
    );
}
