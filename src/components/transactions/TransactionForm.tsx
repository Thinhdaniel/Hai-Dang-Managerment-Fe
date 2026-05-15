import { useEffect, useMemo } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { isOwnedAsset, isReturnedToPartner } from '../../core/constants';
import { AssetOwnershipType, BorrowingType, type Asset, type CreateBorrowingPayload } from '../../core/types';
import { borrowingTypeMeta, borrowingTypeOptions } from '../../core/constants/transactions';

const { Text, Title } = Typography;
const { TextArea } = Input;

type TransactionFormValues = {
    assetId: string;
    type: BorrowingType;
    borrowerName?: string;
    partnerName?: string;
    borrowTime: dayjs.Dayjs;
    purpose?: string;
    location?: string;
    cost?: number;
    note?: string;
};

type TransactionFormProps = {
    assets: Asset[];
    initialAssetId?: string;
    submitting?: boolean;
    onSubmit: (payload: CreateBorrowingPayload) => Promise<void> | void;
    submitLabel?: string;
};

const typeDescriptions: Record<BorrowingType, string> = {
    internal: 'Thiết bị được cấp cho công nhân hoặc tổ sản xuất sử dụng nội bộ.',
    external: 'Công ty đang mượn thiết bị từ đối tác hoặc đơn vị bên ngoài, không tính vào đội máy Hải Đăng.',
    rental: 'Thiết bị được thuê có phát sinh chi phí sử dụng, không tính vào đội máy Hải Đăng.',
};

const sectionClassName = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const formControlClassName =
    '[&_.ant-form-item-label>label]:font-semibold [&_.ant-form-item-label>label]:text-slate-700 [&_.ant-input-number]:w-full [&_.ant-input-number]:rounded-lg [&_.ant-input]:rounded-lg [&_.ant-picker]:rounded-lg [&_.ant-select-selector]:!rounded-lg';

const TransactionForm = ({
    assets,
    initialAssetId,
    submitting,
    onSubmit,
    submitLabel = 'Tạo giao dịch',
}: TransactionFormProps) => {
    const [form] = Form.useForm<TransactionFormValues>();
    const type = Form.useWatch('type', form) ?? BorrowingType.INTERNAL;
    const selectableAssets = useMemo(
        () =>
            assets.filter((asset) => {
                if (type === BorrowingType.INTERNAL) {
                    return isOwnedAsset(asset.ownershipType) && !isReturnedToPartner(asset.status);
                }

                if (type === BorrowingType.EXTERNAL) {
                    return (
                        asset.ownershipType === AssetOwnershipType.PARTNER_BORROWED || isReturnedToPartner(asset.status)
                    );
                }

                return asset.ownershipType === AssetOwnershipType.RENTAL || isReturnedToPartner(asset.status);
            }),
        [assets, type]
    );

    useEffect(() => {
        form.setFieldsValue({
            assetId: initialAssetId,
            type: BorrowingType.INTERNAL,
            borrowTime: dayjs(),
        });
    }, [form, initialAssetId]);

    const handleValuesChange = (changedValues: Partial<TransactionFormValues>) => {
        if (!('type' in changedValues)) {
            return;
        }

        form.setFieldsValue({
            borrowerName: undefined,
            partnerName: undefined,
            purpose: undefined,
            cost: undefined,
            location: form.getFieldValue('location'),
            note: form.getFieldValue('note'),
            assetId: undefined,
            borrowTime: form.getFieldValue('borrowTime'),
            type: changedValues.type,
        });
    };

    const handleFinish = async (values: TransactionFormValues) => {
        await onSubmit({
            assetId: values.assetId,
            type: values.type,
            borrowerName: values.type === BorrowingType.INTERNAL ? values.borrowerName?.trim() || undefined : undefined,
            partnerName: values.type === BorrowingType.INTERNAL ? undefined : values.partnerName?.trim() || undefined,
            borrowTime: values.borrowTime.toISOString(),
            purpose: values.purpose?.trim() || undefined,
            location: values.location?.trim() || undefined,
            cost: values.type === BorrowingType.RENTAL ? values.cost : undefined,
            note: values.note?.trim() || undefined,
        });
    };

    return (
        <Form
            form={form}
            layout='vertical'
            onFinish={handleFinish}
            onValuesChange={handleValuesChange}
            className={`flex flex-col gap-5 ${formControlClassName}`}
        >
            <section className={sectionClassName}>
                <div className='mb-5 flex flex-col gap-1 border-b border-slate-100 pb-4'>
                    <Title level={5} className='!mb-0 !text-slate-800'>
                        Thông Tin Chung
                    </Title>
                    <Text type='secondary'>Chọn thiết bị và loại giao dịch để hệ thống áp đúng luồng mượn / thuê.</Text>
                </div>

                <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                    <Form.Item label='' name='assetId' rules={[{ required: true, message: 'Vui lòng chọn thiết bị' }]}>
                        <Select
                            showSearch={{ optionFilterProp: 'label' }}
                            size='large'
                            placeholder='Chọn thiết bị'
                            options={selectableAssets.map((asset) => ({
                                value: asset.id,
                                label: `${asset.machineCode} - ${asset.name}`,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item
                        label='Loại giao dịch'
                        name='type'
                        rules={[{ required: true, message: 'Vui lòng chọn loại giao dịch' }]}
                    >
                        <Select size='large' options={borrowingTypeOptions} />
                    </Form.Item>
                </div>

                <div className='mt-1 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                    <div className='text-sm font-semibold text-slate-800'>{borrowingTypeMeta[type].label}</div>
                    <div className='mt-1 text-sm text-slate-500'>{typeDescriptions[type]}</div>
                </div>
            </section>

            <section className={sectionClassName}>
                <div className='mb-5 flex flex-col gap-1 border-b border-slate-100 pb-4'>
                    <Title level={5} className='!mb-0 !text-slate-800'>
                        Thời Gian Và Bối Cảnh
                    </Title>
                    <Text type='secondary'>Mọi giao dịch đều cần timestamp rõ ràng để theo dõi lịch sử thiết bị.</Text>
                </div>

                <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                    <Form.Item
                        label={type === BorrowingType.RENTAL ? 'Thời gian thuê' : 'Thời gian bắt đầu'}
                        name='borrowTime'
                        rules={[{ required: true, message: 'Vui lòng chọn thời gian bắt đầu' }]}
                    >
                        <DatePicker showTime size='large' className='w-full' format='DD/MM/YYYY HH:mm' />
                    </Form.Item>

                    <Form.Item label='Vị trí sử dụng' name='location'>
                        <Input size='large' placeholder='Ví dụ: chuyền 2, kho ngoài, xưởng mẫu...' />
                    </Form.Item>
                </div>
            </section>

            <section className={sectionClassName}>
                <div className='mb-5 flex flex-col gap-1 border-b border-slate-100 pb-4'>
                    <Title level={5} className='!mb-0 !text-slate-800'>
                        Thông Tin Đối Tượng
                    </Title>
                    <Text type='secondary'>
                        Các trường bên dưới thay đổi theo loại giao dịch để tránh nhập dư dữ liệu.
                    </Text>
                </div>

                {type === BorrowingType.INTERNAL ? (
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <Form.Item
                            label='Tên công nhân / người mượn'
                            name='borrowerName'
                            rules={[{ required: true, message: 'Vui lòng nhập tên người mượn' }]}
                        >
                            <Input size='large' placeholder='Nhập tên công nhân hoặc người mượn nội bộ' />
                        </Form.Item>

                        <Form.Item
                            label='Mục đích sử dụng'
                            name='purpose'
                            rules={[{ required: true, message: 'Vui lòng nhập mục đích sử dụng' }]}
                        >
                            <Input size='large' placeholder='Ví dụ: hỗ trợ đơn hàng gấp, test line mới...' />
                        </Form.Item>
                    </div>
                ) : null}

                {type === BorrowingType.EXTERNAL ? (
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <Form.Item
                            label='Đối tác / công ty'
                            name='partnerName'
                            rules={[{ required: true, message: 'Vui lòng nhập tên đối tác / công ty' }]}
                        >
                            <Input size='large' placeholder='Nhập tên công ty hoặc đối tác' />
                        </Form.Item>

                        <Form.Item label='Mục đích / ghi chú sử dụng' name='purpose'>
                            <Input size='large' placeholder='Ví dụ: mượn phục vụ bảo trì hoặc pilot line' />
                        </Form.Item>
                    </div>
                ) : null}

                {type === BorrowingType.RENTAL ? (
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <Form.Item
                            label='Đối tác / công ty'
                            name='partnerName'
                            rules={[{ required: true, message: 'Vui lòng nhập tên đối tác / công ty' }]}
                        >
                            <Input size='large' placeholder='Nhập tên công ty cho thuê hoặc đối tác' />
                        </Form.Item>

                        <Form.Item
                            label='Chi phí'
                            name='cost'
                            rules={[{ required: true, message: 'Vui lòng nhập chi phí thuê' }]}
                        >
                            <InputNumber size='large' min={0} step={1000} placeholder='Nhập chi phí' suffix='VND' />
                        </Form.Item>
                    </div>
                ) : null}
            </section>

            <section className={sectionClassName}>
                <div className='mb-5 flex flex-col gap-1 border-b border-slate-100 pb-4'>
                    <Title level={5} className='!mb-0 !text-slate-800'>
                        Ghi Chú Bàn Giao
                    </Title>
                    <Text type='secondary'>
                        Lưu lại điều kiện vận hành, người liên hệ và các lưu ý khi sử dụng thiết bị.
                    </Text>
                </div>

                <Form.Item label='Ghi chú' name='note' className='!mb-0'>
                    <TextArea rows={4} placeholder='Thông tin bàn giao, liên hệ, điều kiện vận hành...' />
                </Form.Item>
            </section>

            <div className='flex justify-end'>
                <Button
                    type='primary'
                    htmlType='submit'
                    size='large'
                    loading={submitting}
                    className='rounded-lg border-none bg-blue-600 px-6 font-medium hover:bg-blue-700'
                >
                    {submitLabel}
                </Button>
            </div>
        </Form>
    );
};

export default TransactionForm;
