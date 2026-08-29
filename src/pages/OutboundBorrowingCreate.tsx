import React from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import {
    ArrowLeftOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    EnvironmentOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { borrowingService } from '../core/services/borrowing.service';
import { plantService } from '../core/services';
import { BorrowingDirection, BorrowingType } from '../core/types';

type FormValues = {
    partnerName: string;
    contactName?: string;
    contactPhone?: string;
    partnerAddress?: string;
    contractNo?: string;
    plantId: string;
    area?: string;
    borrowTime: Dayjs;
    expectedReturnTime: Dayjs;
    plannedQuantity: number;
    purpose: string;
    note?: string;
};

const sectionClassName = 'border-b border-slate-200 px-4 py-5 sm:px-6 sm:py-6';
const labelClassName = 'text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase';

const OutboundBorrowingCreate: React.FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { user } = useAuth();
    const [form] = Form.useForm<FormValues>();

    const { data: plants = [], isLoading: loadingPlants } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const createMutation = useMutation({
        mutationFn: borrowingService.createBatch,
        onSuccess: (batch) => {
            message.success(`Đã tạo lô ${batch.code}`);
            navigate(`/borrowings/outbound/${batch.id}`);
        },
    });

    const handleSubmit = async () => {
        const values = await form.validateFields();
        await createMutation.mutateAsync({
            type: BorrowingType.EXTERNAL,
            direction: BorrowingDirection.OUTBOUND,
            partnerName: values.partnerName.trim(),
            contactName: values.contactName?.trim() || undefined,
            contactPhone: values.contactPhone?.trim() || undefined,
            partnerAddress: values.partnerAddress?.trim() || undefined,
            contractNo: values.contractNo?.trim() || undefined,
            plantId: values.plantId,
            area: values.area?.trim() || undefined,
            borrowTime: values.borrowTime.toISOString(),
            expectedReturnTime: values.expectedReturnTime.toISOString(),
            plannedQuantity: Number(values.plannedQuantity),
            purpose: values.purpose.trim(),
            note: values.note?.trim() || undefined,
            createQrBatch: false,
        });
    };

    return (
        <div className='flex flex-col gap-5 pb-24 lg:pb-8'>
            <PageHeader
                title='Tạo lô cho đối tác mượn máy'
                subtitle='Lập hồ sơ xuất máy Hải Đăng ra ngoài, duyệt trước khi bàn giao và theo dõi nhận lại từng máy.'
                actions={
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/borrowings')}>
                        Quay lại
                    </Button>
                }
            />

            <Alert
                showIcon
                type='info'
                icon={<SafetyCertificateOutlined />}
                message='QR trên máy là mã định danh vĩnh viễn'
                description='Luồng này chỉ chọn máy Hải Đăng đã có trong hệ thống. Không tạo QR tạm và không gỡ tem khi máy được nhận lại.'
                className='border-cyan-200 bg-cyan-50/70'
            />

            <Form<FormValues>
                form={form}
                layout='vertical'
                initialValues={{
                    plantId: user?.plantId,
                    borrowTime: dayjs(),
                    expectedReturnTime: dayjs().add(30, 'day'),
                    plannedQuantity: 1,
                }}
                className='overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm [&_.ant-form-item]:mb-0'
            >
                <section className={sectionClassName}>
                    <div className='mb-5 flex items-start gap-3'>
                        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700'>
                            <TeamOutlined />
                        </div>
                        <div>
                            <div className={labelClassName}>Đối tác nhận máy</div>
                            <h2 className='mt-1 mb-0 text-lg font-black text-slate-950'>Thông tin liên hệ và hồ sơ</h2>
                        </div>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <Form.Item
                            name='partnerName'
                            label='Tên đơn vị / đối tác'
                            rules={[{ required: true, whitespace: true, message: 'Nhập tên đối tác nhận máy' }]}
                        >
                            <Input size='large' placeholder='Ví dụ: Công ty May An Phú' maxLength={160} />
                        </Form.Item>
                        <Form.Item name='contractNo' label='Số hợp đồng / biên bản'>
                            <Input size='large' placeholder='Có thể bổ sung sau' maxLength={80} />
                        </Form.Item>
                        <Form.Item name='contactName' label='Người liên hệ'>
                            <Input size='large' placeholder='Họ tên người nhận / đầu mối' maxLength={100} />
                        </Form.Item>
                        <Form.Item
                            name='contactPhone'
                            label='Số điện thoại'
                            rules={[{ pattern: /^[0-9+().\s-]{8,20}$/, message: 'Số điện thoại không hợp lệ' }]}
                        >
                            <Input size='large' inputMode='tel' placeholder='Số điện thoại đầu mối' maxLength={20} />
                        </Form.Item>
                        <Form.Item name='partnerAddress' label='Địa điểm đặt máy' className='md:col-span-2'>
                            <Input
                                size='large'
                                prefix={<EnvironmentOutlined />}
                                placeholder='Địa chỉ nơi đối tác sử dụng máy'
                                maxLength={240}
                            />
                        </Form.Item>
                    </div>
                </section>

                <section className={sectionClassName}>
                    <div className='mb-5 flex items-start gap-3'>
                        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700'>
                            <EnvironmentOutlined />
                        </div>
                        <div>
                            <div className={labelClassName}>Phạm vi xuất máy</div>
                            <h2 className='mt-1 mb-0 text-lg font-black text-slate-950'>Cơ sở và số lượng dự kiến</h2>
                        </div>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                        <Form.Item
                            name='plantId'
                            label='Cơ sở xuất máy'
                            rules={[{ required: true, message: 'Chọn cơ sở xuất máy' }]}
                        >
                            <Select
                                size='large'
                                loading={loadingPlants}
                                showSearch
                                optionFilterProp='label'
                                placeholder='Chọn cơ sở'
                                options={plants.map((plant) => ({
                                    value: plant.id,
                                    label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item name='area' label='Khu vực xuất'>
                            <Input size='large' placeholder='Kho / chuyền / khu vực hiện tại' maxLength={120} />
                        </Form.Item>
                        <Form.Item
                            name='plannedQuantity'
                            label='Số máy dự kiến'
                            rules={[{ required: true, message: 'Nhập số lượng máy' }]}
                        >
                            <InputNumber
                                size='large'
                                min={1}
                                max={1000}
                                precision={0}
                                className='!w-full'
                                addonAfter='máy'
                            />
                        </Form.Item>
                    </div>
                </section>

                <section className={sectionClassName}>
                    <div className='mb-5 flex items-start gap-3'>
                        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700'>
                            <CalendarOutlined />
                        </div>
                        <div>
                            <div className={labelClassName}>Điều kiện bàn giao</div>
                            <h2 className='mt-1 mb-0 text-lg font-black text-slate-950'>
                                Thời gian và mục đích sử dụng
                            </h2>
                        </div>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <Form.Item
                            name='borrowTime'
                            label='Ngày dự kiến bàn giao'
                            rules={[{ required: true, message: 'Chọn ngày bàn giao' }]}
                        >
                            <DatePicker showTime size='large' format='DD/MM/YYYY HH:mm' className='w-full' />
                        </Form.Item>
                        <Form.Item
                            name='expectedReturnTime'
                            label='Hạn nhận lại máy'
                            dependencies={['borrowTime']}
                            rules={[
                                { required: true, message: 'Chọn hạn nhận lại máy' },
                                ({ getFieldValue }) => ({
                                    validator: (_rule, value?: Dayjs) =>
                                        !value ||
                                        !getFieldValue('borrowTime') ||
                                        value.isAfter(getFieldValue('borrowTime'))
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('Hạn nhận lại phải sau thời điểm bàn giao')),
                                }),
                            ]}
                        >
                            <DatePicker showTime size='large' format='DD/MM/YYYY HH:mm' className='w-full' />
                        </Form.Item>
                        <Form.Item
                            name='purpose'
                            label='Mục đích cho mượn'
                            className='md:col-span-2'
                            rules={[{ required: true, whitespace: true, message: 'Nhập mục đích cho mượn' }]}
                        >
                            <Input.TextArea
                                rows={3}
                                placeholder='Nêu rõ mục đích, phạm vi sử dụng hoặc điều kiện kèm theo'
                                maxLength={500}
                                showCount
                            />
                        </Form.Item>
                        <Form.Item name='note' label='Ghi chú nội bộ' className='md:col-span-2'>
                            <Input.TextArea
                                rows={3}
                                placeholder='Thông tin chỉ dùng trong quá trình quản lý lô'
                                maxLength={500}
                                showCount
                            />
                        </Form.Item>
                    </div>
                </section>

                <div className='hidden items-center justify-between gap-4 px-6 py-5 sm:flex'>
                    <p className='m-0 text-sm font-medium text-slate-500'>
                        Sau khi tạo, thêm đúng số máy rồi gửi giám đốc duyệt.
                    </p>
                    <div className='flex gap-2'>
                        <Button size='large' onClick={() => navigate('/borrowings')}>
                            Hủy
                        </Button>
                        <Button
                            type='primary'
                            size='large'
                            icon={<CheckCircleOutlined />}
                            loading={createMutation.isPending}
                            onClick={handleSubmit}
                            className='bg-cyan-700 hover:!bg-cyan-800'
                        >
                            Tạo lô và chọn máy
                        </Button>
                    </div>
                </div>
            </Form>

            <div className='fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden'>
                <Button
                    block
                    type='primary'
                    size='large'
                    icon={<CheckCircleOutlined />}
                    loading={createMutation.isPending}
                    onClick={handleSubmit}
                    className='h-12 bg-cyan-700 font-bold hover:!bg-cyan-800'
                >
                    Tạo lô và chọn máy
                </Button>
            </div>
        </div>
    );
};

export default OutboundBorrowingCreate;
