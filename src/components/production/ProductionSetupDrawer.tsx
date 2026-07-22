import {
    App,
    Button,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    List,
    Popconfirm,
    Select,
    Switch,
    Tabs,
    Tag,
    TimePicker,
    Typography,
} from 'antd';
import { ClockCircleOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { buildSlotLabel, slotRangeLabelShort } from '../../core/lib/productionSlot';
import { useResponsive } from '../../core/hooks/useResponsive';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionItem, ProductionLine, ProductionTimeSlot } from '../../core/types/production';

const { Text, Title } = Typography;

type Props = {
    open: boolean;
    plantId: string;
    day: ProductionDay | null | undefined;
    onClose: () => void;
};

type LineFormValues = {
    code: string;
    name?: string;
    leaderName?: string;
    sortOrder?: number;
};

type ItemFormValues = {
    code: string;
    name?: string;
    unit?: string;
    unitPrice?: number;
};

type SlotFormValues = {
    start: Dayjs;
    end: Dayjs;
    kind: ProductionTimeSlot['kind'];
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể lưu dữ liệu');
const money = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const minuteToTime = (minute: number) => dayjs().startOf('day').add(minute, 'minute');

const ProductionSetupDrawer = ({ open, plantId, day, onClose }: Props) => {
    const { isPhone } = useResponsive();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [lineForm] = Form.useForm<LineFormValues>();
    const [itemForm] = Form.useForm<ItemFormValues>();
    const [slotForm] = Form.useForm<SlotFormValues>();
    const [editingLine, setEditingLine] = useState<ProductionLine | null>(null);
    const [editingItem, setEditingItem] = useState<ProductionItem | null>(null);
    const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
    const [draftSlots, setDraftSlots] = useState<ProductionTimeSlot[]>([]);

    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, true],
        queryFn: () => productionService.getLines(plantId, true),
        enabled: open && Boolean(plantId),
    });
    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, true],
        queryFn: () => productionService.getItems(plantId, true),
        enabled: open && Boolean(plantId),
    });

    useEffect(() => {
        setDraftSlots(day?.timeSlots.map((slot) => ({ ...slot })) || []);
    }, [day?.id, day?.timeSlots]);

    // Khung giờ sửa trên bản nháp cục bộ — phải bấm "Lưu toàn bộ khung giờ" mới áp dụng.
    // Theo dõi dirty để cảnh báo trước khi người dùng đóng drawer và mất thay đổi.
    const slotsDirty = useMemo(() => {
        const strip = (slots: ProductionTimeSlot[]) =>
            slots.map(({ key, label, startMinute, endMinute, kind, isActive }) => ({
                key,
                label,
                startMinute,
                endMinute,
                kind,
                isActive,
            }));
        return JSON.stringify(strip(draftSlots)) !== JSON.stringify(strip(day?.timeSlots || []));
    }, [day?.timeSlots, draftSlots]);

    const handleClose = () => {
        if (!slotsDirty) {
            onClose();
            return;
        }
        modal.confirm({
            title: 'Khung giờ chưa được lưu',
            content: 'Danh sách khung giờ đã thay đổi nhưng chưa bấm "Lưu toàn bộ khung giờ". Đóng bây giờ sẽ mất thay đổi.',
            okText: 'Vẫn đóng',
            okButtonProps: { danger: true },
            cancelText: 'Ở lại để lưu',
            onOk: onClose,
        });
    };

    const invalidateCatalog = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['production', 'lines', plantId] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'items', plantId] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId] }),
        ]);
    };

    const lineMutation = useMutation({
        mutationFn: async (values: LineFormValues) =>
            editingLine
                ? productionService.updateLine(editingLine.id, values)
                : productionService.createLine({ plantId, ...values }),
        onSuccess: async () => {
            message.success(editingLine ? 'Đã cập nhật chuyền' : 'Đã thêm chuyền');
            setEditingLine(null);
            lineForm.resetFields();
            await invalidateCatalog();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const itemMutation = useMutation({
        mutationFn: async (values: ItemFormValues) =>
            editingItem
                ? productionService.updateItem(editingItem.id, values)
                : productionService.createItem({ plantId, ...values }),
        onSuccess: async () => {
            message.success(editingItem ? 'Đã cập nhật mã hàng' : 'Đã thêm mã hàng');
            setEditingItem(null);
            itemForm.resetFields();
            itemForm.setFieldValue('unit', 'SP');
            await invalidateCatalog();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const timeSlotsMutation = useMutation({
        mutationFn: () => productionService.updateTimeSlots(day!.id, draftSlots),
        onSuccess: async () => {
            message.success('Đã cập nhật khung giờ của ngày');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const editLine = (line: ProductionLine) => {
        setEditingLine(line);
        lineForm.setFieldsValue({
            code: line.code,
            name: line.name,
            leaderName: line.leaderName,
            sortOrder: line.sortOrder,
        });
    };

    const editItem = (item: ProductionItem) => {
        setEditingItem(item);
        itemForm.setFieldsValue({
            code: item.code,
            name: item.name,
            unit: item.unit,
            unitPrice: item.unitPrice,
        });
    };

    const editSlot = (slot: ProductionTimeSlot) => {
        setEditingSlotKey(slot.key);
        slotForm.setFieldsValue({
            start: minuteToTime(slot.startMinute),
            end: minuteToTime(slot.endMinute),
            kind: slot.kind,
        });
    };

    const saveSlotDraft = (values: SlotFormValues) => {
        const startMinute = values.start.hour() * 60 + values.start.minute();
        const endMinute = values.end.hour() * 60 + values.end.minute();
        if (endMinute <= startMinute) {
            message.warning('Giờ kết thúc phải sau giờ bắt đầu');
            return;
        }
        // Quy tắc thật là KHÔNG ĐƯỢC CHỒNG GIỜ, không phải trùng mã. Kiểm tra chồng giờ
        // trên các khung đang bật (khung đã tắt không chiếm chỗ) và nói rõ đụng khung nào.
        const others = draftSlots.filter((slot) => slot.key !== editingSlotKey && slot.isActive !== false);
        const clash = others.find((slot) => startMinute < slot.endMinute && endMinute > slot.startMinute);
        if (clash) {
            message.warning(`Khung giờ bị chồng lên ${slotRangeLabelShort(clash)}`);
            return;
        }
        // Mã khung giờ chỉ là định danh nội bộ và dữ liệu cũ đặt mã theo giờ KẾT THÚC
        // (mã "18:00" là ca 17-18h). Nếu lấy thẳng giờ bắt đầu làm mã thì khung nối
        // ngay sau khung cuối luôn đụng mã. Vì vậy phải dò tới khi được mã còn trống.
        const buildKey = () => {
            const start = values.start.format('HH:mm');
            const taken = new Set(draftSlots.map((slot) => slot.key));
            if (!taken.has(start)) return start;
            const withEnd = `${start}-${values.end.format('HH:mm')}`;
            if (!taken.has(withEnd)) return withEnd;
            let index = 2;
            while (taken.has(`${start}_${index}`)) index += 1;
            return `${start}_${index}`;
        };
        const key = editingSlotKey || buildKey();
        const nextSlot: ProductionTimeSlot = {
            key,
            // Nhãn sinh tự động; server cũng sinh lại y hệt khi lưu (buildTimeSlotLabel).
            label: buildSlotLabel(startMinute, endMinute),
            startMinute,
            endMinute,
            kind: values.kind,
            isActive: editingSlotKey
                ? draftSlots.find((slot) => slot.key === editingSlotKey)?.isActive !== false
                : true,
        };
        setDraftSlots((current) =>
            [...current.filter((slot) => slot.key !== editingSlotKey), nextSlot].sort(
                (left, right) => left.startMinute - right.startMinute
            )
        );
        setEditingSlotKey(null);
        slotForm.resetFields();
        slotForm.setFieldValue('kind', 'regular');
        // Chỉ sửa bản nháp — không nhắc thì người dùng tưởng đã áp dụng và đóng drawer mất luôn.
        message.info('Đã thêm vào danh sách. Bấm "Lưu toàn bộ khung giờ" để áp dụng cho ngày.');
    };

    // Biên chế chuyền theo NGÀY: gộp/tách chuyền là việc thay đổi từng ngày, nên chuyền mới
    // thêm vào danh mục sẽ không tự nhảy vào các ngày đã khởi tạo — phải đưa vào từ đây.
    const dayLines = day?.lines || [];
    const dayLineIds = new Set(dayLines.map((line) => line.lineId));
    const addableLines = (linesQuery.data || []).filter((line) => line.isActive && !dayLineIds.has(line.id));

    const addDayLineMutation = useMutation({
        mutationFn: (lineId: string) => productionService.addDayLine(day!.id, lineId),
        onSuccess: async () => {
            message.success('Đã đưa chuyền vào ngày sản xuất');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const removeDayLineMutation = useMutation({
        mutationFn: (lineId: string) => productionService.removeDayLine(day!.id, lineId),
        onSuccess: async () => {
            message.success('Đã gỡ chuyền khỏi ngày sản xuất');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const dayLinesTab = day ? (
        <div className='production-setup-section'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>Chuyền chạy ngày {dayjs(day.productionDate).format('DD/MM/YYYY')}</Title>
                    <Text type='secondary'>
                        Danh sách này chốt riêng cho ngày đang xem. Gộp hai chuyền thì gỡ chuyền thừa ra, tách chuyền
                        thì thêm vào — các ngày khác không bị ảnh hưởng.
                    </Text>
                </div>
            </div>

            <Select
                className='w-full'
                placeholder={addableLines.length ? 'Chọn chuyền để đưa vào ngày' : 'Mọi chuyền đang bật đã có trong ngày'}
                value={null as unknown as string}
                disabled={!addableLines.length || addDayLineMutation.isPending}
                loading={addDayLineMutation.isPending}
                onSelect={(value) => addDayLineMutation.mutate(String(value))}
                options={addableLines.map((line) => ({
                    value: line.id,
                    label: [line.code, line.name, line.leaderName].filter(Boolean).join(' · '),
                }))}
            />

            <List
                className='production-master-list'
                dataSource={dayLines}
                locale={{ emptyText: <Empty description='Ngày này chưa có chuyền nào' /> }}
                renderItem={(line) => {
                    const locked = Boolean(line.entries.length || line.runs.length);
                    return (
                        <List.Item
                            actions={[
                                <Popconfirm
                                    key='remove'
                                    title={`Gỡ ${line.lineCode} khỏi ngày này?`}
                                    description='Danh mục chuyền và các ngày khác giữ nguyên.'
                                    disabled={locked}
                                    onConfirm={() => removeDayLineMutation.mutate(line.lineId)}
                                >
                                    <Button type='text' danger disabled={locked}>
                                        Gỡ khỏi ngày
                                    </Button>
                                </Popconfirm>,
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <span className='production-master-title'>
                                        {line.lineCode}
                                        {locked ? (
                                            <Tag color='blue'>
                                                {line.entries.length ? 'Đã có sản lượng' : 'Đã gán mã hàng'}
                                            </Tag>
                                        ) : (
                                            <Tag>Chưa có dữ liệu</Tag>
                                        )}
                                    </span>
                                }
                                description={[
                                    line.lineName,
                                    line.leaderName ? `Tổ trưởng: ${line.leaderName}` : '',
                                    `${line.workerCount || 0} CN`,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            />
                        </List.Item>
                    );
                }}
            />
        </div>
    ) : (
        <Empty description='Khởi tạo ngày sản xuất trước khi sắp chuyền' />
    );

    const lineTab = (
        <div className='production-setup-section'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>{editingLine ? `Sửa ${editingLine.code}` : 'Thêm chuyền sản xuất'}</Title>
                    <Text type='secondary'>
                        Đây là danh mục dùng chung. Thêm chuyền ở đây chưa đưa nó vào ngày nào — sang tab "Chuyền
                        trong ngày" để xếp cho ngày đang xem. Số công nhân cũng xác nhận riêng từng ngày.
                    </Text>
                </div>
                {editingLine ? (
                    <Button
                        onClick={() => {
                            setEditingLine(null);
                            lineForm.resetFields();
                        }}
                    >
                        Hủy sửa
                    </Button>
                ) : null}
            </div>
            <Form form={lineForm} layout='vertical' onFinish={(values) => lineMutation.mutate(values)}>
                <div className='production-setup-form-grid'>
                    <Form.Item label='Mã chuyền' name='code' rules={[{ required: true, message: 'Nhập mã chuyền' }]}>
                        <Input placeholder='VD: CM1' autoCapitalize='characters' />
                    </Form.Item>
                    <Form.Item label='Tên chuyền' name='name'>
                        <Input placeholder='Tên mô tả (nếu có)' />
                    </Form.Item>
                    <Form.Item label='Tổ trưởng' name='leaderName'>
                        <Input placeholder='Họ tên tổ trưởng' />
                    </Form.Item>
                    <Form.Item label='Thứ tự' name='sortOrder' initialValue={0}>
                        <InputNumber min={0} precision={0} className='w-full' />
                    </Form.Item>
                </div>
                <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={lineMutation.isPending}>
                    {editingLine ? 'Lưu thay đổi' : 'Thêm chuyền'}
                </Button>
            </Form>

            <List
                className='production-master-list'
                loading={linesQuery.isLoading}
                dataSource={linesQuery.data || []}
                locale={{ emptyText: <Empty description='Chưa có chuyền' /> }}
                renderItem={(line) => (
                    <List.Item
                        actions={[
                            <Button key='edit' type='text' icon={<EditOutlined />} onClick={() => editLine(line)}>
                                Sửa
                            </Button>,
                            <Switch
                                key='active'
                                size='small'
                                checked={line.isActive}
                                onChange={(isActive) =>
                                    productionService
                                        .updateLine(line.id, { isActive })
                                        .then(invalidateCatalog)
                                        .catch((error) => message.error(errorMessage(error)))
                                }
                            />,
                        ]}
                    >
                        <List.Item.Meta
                            title={
                                <span className='production-master-title'>
                                    {line.code}
                                    {!line.isActive ? <Tag>Đã tắt</Tag> : null}
                                </span>
                            }
                            description={[line.name, line.leaderName ? `Tổ trưởng: ${line.leaderName}` : '']
                                .filter(Boolean)
                                .join(' · ')}
                        />
                    </List.Item>
                )}
            />
        </div>
    );

    const itemTab = (
        <div className='production-setup-section'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>{editingItem ? `Sửa ${editingItem.code}` : 'Thêm mã hàng'}</Title>
                    <Text type='secondary'>Đơn giá được chụp lại khi mã hàng bắt đầu chạy.</Text>
                </div>
                {editingItem ? (
                    <Button
                        onClick={() => {
                            setEditingItem(null);
                            itemForm.resetFields();
                            itemForm.setFieldValue('unit', 'SP');
                        }}
                    >
                        Hủy sửa
                    </Button>
                ) : null}
            </div>
            <Form form={itemForm} layout='vertical' onFinish={(values) => itemMutation.mutate(values)}>
                <div className='production-setup-form-grid'>
                    <Form.Item label='Mã hàng' name='code' rules={[{ required: true, message: 'Nhập mã hàng' }]}>
                        <Input placeholder='VD: 416' autoCapitalize='characters' />
                    </Form.Item>
                    <Form.Item label='Tên hàng' name='name'>
                        <Input placeholder='Tên hoặc mô tả mã hàng' />
                    </Form.Item>
                    <Form.Item label='Đơn vị' name='unit' initialValue='SP'>
                        <Input placeholder='SP' />
                    </Form.Item>
                    <Form.Item label='Đơn giá' name='unitPrice' initialValue={0}>
                        <InputNumber min={0} precision={0} className='w-full' addonAfter='đ' />
                    </Form.Item>
                </div>
                <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={itemMutation.isPending}>
                    {editingItem ? 'Lưu thay đổi' : 'Thêm mã hàng'}
                </Button>
            </Form>

            <List
                className='production-master-list'
                loading={itemsQuery.isLoading}
                dataSource={itemsQuery.data || []}
                locale={{ emptyText: <Empty description='Chưa có mã hàng' /> }}
                renderItem={(item) => (
                    <List.Item
                        actions={[
                            <Button key='edit' type='text' icon={<EditOutlined />} onClick={() => editItem(item)}>
                                Sửa
                            </Button>,
                            <Switch
                                key='active'
                                size='small'
                                checked={item.isActive}
                                onChange={(isActive) =>
                                    productionService
                                        .updateItem(item.id, { isActive })
                                        .then(invalidateCatalog)
                                        .catch((error) => message.error(errorMessage(error)))
                                }
                            />,
                        ]}
                    >
                        <List.Item.Meta
                            title={
                                <span className='production-master-title'>
                                    {item.code}
                                    {!item.isActive ? <Tag>Đã tắt</Tag> : null}
                                </span>
                            }
                            description={`${item.name || 'Chưa đặt tên'} · ${money(item.unitPrice)} đ/${item.unit}`}
                        />
                    </List.Item>
                )}
            />
        </div>
    );

    const slotsTab = day ? (
        <div className='production-setup-section'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>Khung giờ ngày {dayjs(day.productionDate).format('DD/MM/YYYY')}</Title>
                    <Text type='secondary'>
                        Khung giờ chỉ áp dụng cho ngày đang xem, không có công thức cố định 10 tiếng.
                    </Text>
                </div>
            </div>
            <Form form={slotForm} layout='vertical' onFinish={saveSlotDraft}>
                <div className='production-slot-form-grid'>
                    <Form.Item
                        label='Bắt đầu'
                        name='start'
                        rules={[{ required: true, message: 'Chọn giờ' }]}
                        extra='Nhãn khung giờ được đặt tự động theo giờ bắt đầu–kết thúc'
                    >
                        <TimePicker format='HH:mm' minuteStep={15} className='w-full' />
                    </Form.Item>
                    <Form.Item label='Kết thúc' name='end' rules={[{ required: true, message: 'Chọn giờ' }]}>
                        <TimePicker format='HH:mm' minuteStep={15} className='w-full' />
                    </Form.Item>
                    <Form.Item label='Loại giờ' name='kind' initialValue='regular'>
                        <Select
                            options={[
                                { value: 'regular', label: 'Giờ thường' },
                                { value: 'overtime', label: 'Tăng ca' },
                            ]}
                        />
                    </Form.Item>
                </div>
                <Button htmlType='submit' icon={<PlusOutlined />}>
                    {editingSlotKey ? 'Cập nhật khung giờ' : 'Thêm khung giờ'}
                </Button>
            </Form>

            <List
                className='production-master-list production-slot-list'
                dataSource={draftSlots}
                renderItem={(slot) => (
                    <List.Item
                        actions={[
                            <Button key='edit' type='text' icon={<EditOutlined />} onClick={() => editSlot(slot)} />,
                            <Switch
                                key='active'
                                size='small'
                                checked={slot.isActive}
                                onChange={(isActive) =>
                                    setDraftSlots((current) =>
                                        current.map((row) => (row.key === slot.key ? { ...row, isActive } : row))
                                    )
                                }
                            />,
                            <Popconfirm
                                key='delete'
                                title='Xóa khung giờ này?'
                                description='Không thể lưu nếu khung giờ đã có sản lượng.'
                                onConfirm={() =>
                                    setDraftSlots((current) => current.filter((row) => row.key !== slot.key))
                                }
                            >
                                <Button type='text' danger>
                                    Xóa
                                </Button>
                            </Popconfirm>,
                        ]}
                    >
                        <List.Item.Meta
                            avatar={<ClockCircleOutlined />}
                            title={
                                <span className='production-master-title'>
                                    {slotRangeLabelShort(slot)}
                                    <Tag color={slot.kind === 'overtime' ? 'gold' : 'blue'}>
                                        {slot.kind === 'overtime' ? 'Tăng ca' : 'Giờ thường'}
                                    </Tag>
                                </span>
                            }
                            description={`${minuteToTime(slot.startMinute).format('HH:mm')}–${minuteToTime(slot.endMinute).format('HH:mm')}`}
                        />
                    </List.Item>
                )}
            />
            <div className='production-setup-sticky-action'>
                {slotsDirty ? <Tag color='warning'>Có thay đổi chưa lưu</Tag> : null}
                <Button
                    type='primary'
                    size='large'
                    icon={<SaveOutlined />}
                    loading={timeSlotsMutation.isPending}
                    onClick={() => timeSlotsMutation.mutate()}
                    block={isPhone}
                >
                    Lưu toàn bộ khung giờ
                </Button>
            </div>
        </div>
    ) : (
        <Empty description='Khởi tạo ngày sản xuất trước khi chỉnh khung giờ' />
    );

    return (
        <Drawer
            open={open}
            onClose={handleClose}
            title='Thiết lập sản xuất'
            width={isPhone ? '100%' : 760}
            className='production-setup-drawer'
            destroyOnHidden
        >
            <Tabs
                items={[
                    { key: 'day-lines', label: 'Chuyền trong ngày', children: dayLinesTab },
                    { key: 'lines', label: 'Danh mục chuyền', children: lineTab },
                    { key: 'items', label: 'Mã hàng', children: itemTab },
                    { key: 'slots', label: 'Khung giờ', children: slotsTab },
                ]}
            />
        </Drawer>
    );
};

export default ProductionSetupDrawer;
