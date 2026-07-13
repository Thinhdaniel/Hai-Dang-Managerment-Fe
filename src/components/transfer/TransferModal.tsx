import { useEffect } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, Modal, Select, Tag } from 'antd';
import {
    ArrowRightOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    InboxOutlined,
    SwapOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Asset, CreateTransferPayload, Plant } from '../../core/types';

const { TextArea } = Input;

type TransferModalFormValues = {
    toPlantId: string;
    toArea?: string;
    reason: string;
    transferDate: dayjs.Dayjs;
    note?: string;
};

type TransferModalProps = {
    open: boolean;
    asset: Asset | null;
    assets?: Asset[];
    plants: Plant[];
    submitting?: boolean;
    /** Chọn sẵn cơ sở đích (vd trợ lý soạn lệnh điều chuyển). */
    defaultToPlantId?: string;
    /** Nâng zIndex khi mở trên 1 lớp nổi khác (vd panel trợ lý). */
    zIndex?: number;
    onClose: () => void;
    onSubmit: (payload: CreateTransferPayload) => Promise<void> | void;
};

const renderArea = (value?: string) => value?.trim() || 'Chưa chỉ định khu vực';
const normalizeArea = (value?: string) => value?.trim() || undefined;

const getSourceAreaSummary = (items: Asset[]) => {
    const areas = Array.from(new Set(items.map((item) => normalizeArea(item.area)).filter(Boolean)));
    if (!areas.length) return 'Chưa chỉ định khu vực';
    if (areas.length === 1) return areas[0]!;
    return 'Nhiều khu vực';
};

const TransferModal = ({
    open,
    asset,
    assets = [],
    plants,
    submitting,
    defaultToPlantId,
    zIndex,
    onClose,
    onSubmit,
}: TransferModalProps) => {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<TransferModalFormValues>();
    const transferAssets = assets.length ? assets : asset ? [asset] : [];
    const firstAsset = transferAssets[0] ?? null;
    const sourcePlantId = firstAsset?.plantId;
    const toPlantId = Form.useWatch('toPlantId', form);
    const toArea = Form.useWatch('toArea', form);
    const selectedPlant = plants.find((plant) => plant.id === toPlantId);
    const sourceAreaSummary = getSourceAreaSummary(transferAssets);
    const hasMultipleSourceAreas = sourceAreaSummary === 'Nhiều khu vực';
    const isSamePlant = Boolean(toPlantId && sourcePlantId && toPlantId === sourcePlantId);

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }

        form.setFieldsValue({
            toPlantId: defaultToPlantId ?? firstAsset?.plantId,
            toArea: hasMultipleSourceAreas ? undefined : firstAsset?.area,
            transferDate: dayjs(),
            reason: '',
            note: '',
        });
    }, [firstAsset, form, hasMultipleSourceAreas, open, defaultToPlantId]);

    const handleFinish = async (values: TransferModalFormValues) => {
        if (!transferAssets.length) return;

        const targetArea = normalizeArea(values.toArea);
        const unchangedAssets = transferAssets.filter(
            (item) => item.plantId === values.toPlantId && normalizeArea(item.area) === targetArea
        );
        if (unchangedAssets.length) {
            message.warning(
                `Điểm đến đang trùng vị trí hiện tại của: ${unchangedAssets.map((item) => item.name).join(', ')}`
            );
            return;
        }

        const submit = async () => {
            await onSubmit({
                assetId: transferAssets[0].id,
                assetIds: transferAssets.map((item) => item.id),
                toPlantId: values.toPlantId,
                toArea: values.toArea?.trim() || undefined,
                reason: values.reason.trim(),
                transferDate: values.transferDate.toISOString(),
                note: values.note?.trim() || undefined,
            });

            form.resetFields();
        };

        // Cơ sở đến trùng cơ sở nguồn -> nhiều khả năng chọn nhầm, xác nhận lại
        if (values.toPlantId === sourcePlantId) {
            const plantName = firstAsset?.plant?.name || 'cùng cơ sở';
            modal.confirm({
                title: 'Điều chuyển trong cùng một cơ sở?',
                content: `Cơ sở đến (${plantName}) đang trùng cơ sở xuất phát. Nếu bạn muốn chuyển máy sang cơ sở khác thì hãy chọn lại. Chỉ tiếp tục nếu đây là điều chuyển nội bộ giữa các khu vực trong cùng cơ sở.`,
                okText: 'Đúng, điều chuyển nội bộ',
                cancelText: 'Chọn lại cơ sở',
                centered: true,
                zIndex: (zIndex ?? 1000) + 10,
                onOk: submit,
            });
            return;
        }

        await submit();
    };

    return (
        <Modal
            open={open}
            centered
            width={980}
            zIndex={zIndex}
            destroyOnHidden
            focusable={{ trap: true }}
            mask={{ closable: false, blur: true }}
            onCancel={onClose}
            title={
                <div className='flex items-start justify-between gap-4'>
                    <div className='flex min-w-0 items-start gap-3'>
                        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm'>
                            <SwapOutlined />
                        </div>
                        <div className='min-w-0'>
                            <div className='text-lg font-bold text-slate-900'>Tạo lệnh điều chuyển</div>
                            <div className='mt-1 text-sm font-normal text-slate-500'>
                                {transferAssets.length === 1
                                    ? transferAssets[0].name
                                    : `${transferAssets.length} thiết bị được chọn`}
                            </div>
                        </div>
                    </div>
                    <Tag color='blue' variant='outlined' className='mt-1 shrink-0 font-semibold'>
                        {transferAssets.length || 0} máy
                    </Tag>
                </div>
            }
            classNames={{
                root: 'overflow-hidden rounded-2xl',
                header: 'border-b border-slate-100 px-6 py-5',
                body: 'bg-slate-50 px-6 py-5',
                footer: 'border-t border-slate-100 bg-white px-6 py-4',
            }}
            styles={{
                root: { padding: 0 },
                body: { maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' },
            }}
            footer={[
                <Button key='cancel' size='large' variant='filled' onClick={onClose}>
                    Hủy
                </Button>,
                <Button
                    key='submit'
                    type='primary'
                    size='large'
                    icon={<SwapOutlined />}
                    loading={submitting}
                    onClick={() => form.submit()}
                >
                    Tạo lệnh điều chuyển
                </Button>,
            ]}
        >
            <div className='flex flex-col gap-4'>
                <Alert
                    showIcon
                    type='info'
                    title='Lệnh chỉ được tạo khi điểm đến khác vị trí hiện tại.'
                    description='Các thiết bị trong cùng một lệnh phải cùng cơ sở xuất phát. Khu vực xuất phát có thể khác nhau để thao tác linh hoạt hơn.'
                    classNames={{ root: 'rounded-xl border-blue-100 bg-blue-50/80' }}
                />

                <section className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                    <div className='mb-3 flex items-center gap-2 text-sm font-bold text-slate-900'>
                        <EnvironmentOutlined className='text-blue-600' />
                        Tuyến điều chuyển
                    </div>
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch'>
                        <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
                            <div className='text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                                Xuất phát
                            </div>
                            <div className='mt-2 truncate text-base font-bold text-slate-900'>
                                {firstAsset?.plant?.name || '-'}
                            </div>
                            <div className='mt-1 truncate text-sm text-slate-500'>{sourceAreaSummary}</div>
                        </div>
                        <div className='flex items-center justify-center'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm'>
                                <ArrowRightOutlined />
                            </div>
                        </div>
                        <div
                            className={`rounded-lg border p-4 ${
                                isSamePlant ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'
                            }`}
                        >
                            <div
                                className={`text-xs font-semibold tracking-wide uppercase ${
                                    isSamePlant ? 'text-amber-700' : 'text-blue-700'
                                }`}
                            >
                                Điểm đến
                            </div>
                            <div className='mt-2 truncate text-base font-bold text-slate-900'>
                                {selectedPlant?.name || 'Chưa chọn cơ sở'}
                            </div>
                            <div className='mt-1 truncate text-sm text-slate-600'>{renderArea(toArea)}</div>
                            {isSamePlant && (
                                <div className='mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700'>
                                    <WarningOutlined className='mt-0.5 shrink-0' />
                                    <span>Trùng cơ sở xuất phát — chỉ dùng khi chuyển nội bộ giữa các khu vực.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <div className='grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]'>
                    <section className='flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm'>
                        <div className='flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3'>
                            <div className='flex items-center gap-2 text-sm font-bold text-slate-900'>
                                <InboxOutlined className='text-blue-600' />
                                Danh sách thiết bị
                            </div>
                            <Tag variant='outlined' color='default'>
                                {transferAssets.length || 0}
                            </Tag>
                        </div>
                        <div className='min-h-0 flex-1 overflow-auto p-3'>
                            {transferAssets.map((item) => (
                                <div
                                    key={item.id}
                                    className='flex items-start justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50'
                                >
                                    <div className='min-w-0'>
                                        <div className='truncate text-sm font-semibold text-slate-900'>{item.name}</div>
                                        <div className='mt-1 truncate text-xs text-slate-500'>
                                            {item.model || item.type || '-'}
                                        </div>
                                        <div className='mt-1 truncate text-xs font-medium text-slate-500'>
                                            {item.plant?.name || firstAsset?.plant?.name || '-'} ·{' '}
                                            {renderArea(item.area)}
                                        </div>
                                    </div>
                                    <Tag color='blue' variant='outlined' className='shrink-0 font-mono'>
                                        {item.machineCode || item.id}
                                    </Tag>
                                </div>
                            ))}
                        </div>
                    </section>

                    <Form
                        form={form}
                        layout='vertical'
                        variant='filled'
                        requiredMark='optional'
                        clearOnDestroy
                        scrollToFirstError={{ focus: true }}
                        onFinish={handleFinish}
                        className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm [&_.ant-form-item]:mb-4 [&_.ant-form-item-label_label]:font-semibold [&_.ant-form-item-label_label]:text-slate-700 [&_.ant-form-item:last-child]:mb-0'
                    >
                        <div className='mb-4 flex items-center gap-2 text-sm font-bold text-slate-900'>
                            <FileTextOutlined className='text-blue-600' />
                            Thông tin lệnh
                        </div>

                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                            <Form.Item
                                label='Cơ sở đến'
                                name='toPlantId'
                                rules={[{ required: true, message: 'Vui lòng chọn cơ sở đến' }]}
                            >
                                <Select
                                    allowClear
                                    placeholder='Chọn cơ sở đến'
                                    size='large'
                                    showSearch={{ optionFilterProp: 'label' }}
                                    prefix={<EnvironmentOutlined />}
                                    options={plants.map((plant) => ({
                                        value: plant.id,
                                        label: plant.name,
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item label='Khu vực đến' name='toArea'>
                                <Input
                                    size='large'
                                    prefix={<EnvironmentOutlined />}
                                    placeholder='Chuyền 2, kho trung tâm...'
                                />
                            </Form.Item>
                        </div>

                        <Form.Item
                            label='Ngày điều chuyển'
                            name='transferDate'
                            rules={[{ required: true, message: 'Vui lòng chọn ngày điều chuyển' }]}
                        >
                            <DatePicker
                                className='w-full'
                                format='DD/MM/YYYY'
                                size='large'
                                prefix={<CalendarOutlined />}
                                allowClear={false}
                            />
                        </Form.Item>

                        <Form.Item
                            label='Lý do điều chuyển'
                            name='reason'
                            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập lý do điều chuyển' }]}
                        >
                            <TextArea
                                rows={4}
                                placeholder='Ví dụ: điều phối máy sang chuyền mới để đáp ứng kế hoạch sản xuất...'
                            />
                        </Form.Item>

                        <Form.Item label='Ghi chú bàn giao' name='note'>
                            <TextArea rows={3} placeholder='Người nhận, yêu cầu lắp đặt, tình trạng bàn giao...' />
                        </Form.Item>
                    </Form>
                </div>
            </div>
        </Modal>
    );
};

export default TransferModal;
