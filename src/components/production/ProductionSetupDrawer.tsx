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
    List,
    Popconfirm,
    Radio,
    Select,
    Switch,
    Tabs,
    Tag,
    TimePicker,
    Typography,
} from 'antd';
import {
    ApartmentOutlined,
    ClockCircleOutlined,
    EditOutlined,
    HistoryOutlined,
    PlusOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { buildSlotLabel, slotRangeLabelShort } from '../../core/lib/productionSlot';
import { useResponsive } from '../../core/hooks/useResponsive';
import { productionService } from '../../core/services/production.service';
import type {
    ProductionDay,
    ProductionItem,
    ProductionLine,
    ProductionOperation,
    ProductionTimeSlot,
    ProductionUnitPriceMode,
} from '../../core/types/production';
import ProductionOperationTemplateModal from './ProductionOperationTemplateModal';

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
    unitPriceMode?: ProductionUnitPriceMode;
    unitPriceEffectiveFrom?: Dayjs;
    unitPriceChangeReason?: string;
};

type OperationFormValues = {
    code: string;
    name: string;
    unit?: string;
    sortOrder?: number;
};

type SlotFormValues = {
    start: Dayjs;
    end: Dayjs;
    kind: ProductionTimeSlot['kind'];
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể lưu dữ liệu');
const money = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const minuteToTime = (minute: number) => dayjs().startOf('day').add(minute, 'minute');
const normalizedLineText = (value?: string) => String(value || '').trim();

const ProductionSetupDrawer = ({ open, plantId, day, onClose }: Props) => {
    const { isPhone } = useResponsive();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [lineForm] = Form.useForm<LineFormValues>();
    const [itemForm] = Form.useForm<ItemFormValues>();
    const [operationForm] = Form.useForm<OperationFormValues>();
    const [slotForm] = Form.useForm<SlotFormValues>();
    const [editingLine, setEditingLine] = useState<ProductionLine | null>(null);
    const [editingItem, setEditingItem] = useState<ProductionItem | null>(null);
    const [editingOperation, setEditingOperation] = useState<ProductionOperation | null>(null);
    const [templateItem, setTemplateItem] = useState<ProductionItem | null>(null);
    const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
    const [draftSlots, setDraftSlots] = useState<ProductionTimeSlot[]>([]);
    const [forcePriceRecalculation, setForcePriceRecalculation] = useState(false);
    const watchedUnitPrice = Form.useWatch('unitPrice', itemForm);
    const watchedUnitPriceMode = Form.useWatch('unitPriceMode', itemForm);
    const effectiveWatchedUnitPrice = watchedUnitPrice ?? editingItem?.unitPrice ?? 0;
    const itemPriceChanged = Boolean(
        editingItem && Number(effectiveWatchedUnitPrice) !== Number(editingItem.unitPrice || 0)
    );
    const itemPriceUpdateRequested = itemPriceChanged || forcePriceRecalculation;

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
    const operationsQuery = useQuery({
        queryKey: ['production', 'operations', plantId, true],
        queryFn: () => productionService.getOperations(plantId, true),
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
            content:
                'Danh sách khung giờ đã thay đổi nhưng chưa bấm "Lưu toàn bộ khung giờ". Đóng bây giờ sẽ mất thay đổi.',
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
            queryClient.invalidateQueries({ queryKey: ['production', 'operations', plantId] }),
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
        mutationFn: async (values: ItemFormValues) => {
            const catalogValues = {
                code: values.code,
                name: values.name,
                unit: values.unit,
                unitPrice: values.unitPrice,
            };
            if (!editingItem) return productionService.createItem({ plantId, ...catalogValues });

            const priceChanged = Number(values.unitPrice || 0) !== Number(editingItem.unitPrice || 0);
            const correctionRequested = forcePriceRecalculation && values.unitPriceMode === 'recalculate_from_date';
            return productionService.updateItem(editingItem.id, {
                ...catalogValues,
                ...(priceChanged || correctionRequested
                    ? {
                          unitPriceMode: values.unitPriceMode || 'recalculate_from_date',
                          unitPriceEffectiveFrom:
                              values.unitPriceMode === 'future_only'
                                  ? undefined
                                  : values.unitPriceEffectiveFrom?.format('YYYY-MM-DD'),
                          unitPriceChangeReason: values.unitPriceChangeReason?.trim(),
                      }
                    : {}),
            });
        },
        onSuccess: async (result) => {
            if (result.priceUpdate?.mode === 'recalculate_from_date') {
                const { affectedEntryCount, affectedRunCount, affectedDayCount } = result.priceUpdate;
                if (affectedRunCount > 0) {
                    message.success(
                        `Đã tính lại ${affectedEntryCount} khung nhập, ${affectedRunCount} lần chạy trên ${affectedDayCount} ngày`
                    );
                } else {
                    message.info('Đã cập nhật đơn giá; không có dữ liệu cũ phù hợp để tính lại');
                }
            } else if (result.priceUpdate?.mode === 'future_only') {
                message.success('Đã lưu đơn giá mới; dữ liệu đã nhập vẫn giữ nguyên');
            } else {
                message.success(editingItem ? 'Đã cập nhật mã hàng' : 'Đã thêm mã hàng');
            }
            setEditingItem(null);
            setForcePriceRecalculation(false);
            itemForm.resetFields();
            itemForm.setFieldValue('unit', 'SP');
            if (result.priceUpdate?.mode === 'recalculate_from_date') {
                await queryClient.invalidateQueries({ queryKey: ['production'] });
            } else {
                await invalidateCatalog();
            }
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const operationMutation = useMutation({
        mutationFn: async (values: OperationFormValues) =>
            editingOperation
                ? productionService.updateOperation(editingOperation.id, values)
                : productionService.createOperation({ plantId, ...values }),
        onSuccess: async () => {
            message.success(editingOperation ? 'Đã cập nhật công đoạn' : 'Đã thêm công đoạn');
            setEditingOperation(null);
            operationForm.resetFields();
            operationForm.setFieldsValue({ unit: 'SP', sortOrder: 0 });
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
        setForcePriceRecalculation(false);
        itemForm.setFieldsValue({
            code: item.code,
            name: item.name,
            unit: item.unit,
            unitPrice: item.unitPrice,
            unitPriceMode: 'recalculate_from_date',
            unitPriceEffectiveFrom: dayjs(day?.productionDate || undefined),
            unitPriceChangeReason: undefined,
        });
    };

    const submitItemForm = (values: ItemFormValues) => {
        const priceChanged = Boolean(
            editingItem && Number(values.unitPrice || 0) !== Number(editingItem.unitPrice || 0)
        );
        const priceUpdateRequested = priceChanged || forcePriceRecalculation;
        if (!editingItem || !priceUpdateRequested || values.unitPriceMode === 'future_only') {
            itemMutation.mutate(values);
            return;
        }

        const effectiveFrom = values.unitPriceEffectiveFrom?.format('DD/MM/YYYY');
        modal.confirm({
            title: 'Xác nhận tính lại đơn giá lịch sử',
            content: (
                <div className='production-price-confirm'>
                    <p>
                        {priceChanged ? (
                            <>
                                Mã <strong>{editingItem.code}</strong> sẽ đổi từ{' '}
                                <strong>{money(editingItem.unitPrice)}đ</strong> sang{' '}
                                <strong>{money(values.unitPrice)}đ</strong> từ ngày <strong>{effectiveFrom}</strong>.
                            </>
                        ) : (
                            <>
                                Mã <strong>{editingItem.code}</strong> sẽ áp dụng lại đơn giá hiện tại{' '}
                                <strong>{money(values.unitPrice)}đ</strong> cho dữ liệu từ ngày{' '}
                                <strong>{effectiveFrom}</strong>.
                            </>
                        )}
                    </p>
                    <p>
                        Hệ thống sẽ tính lại giá trị sản lượng, thu nhập và báo cáo liên quan, kể cả ngày đã khóa. Sản
                        lượng gốc không thay đổi.
                    </p>
                </div>
            ),
            okText: 'Tính lại và lưu',
            cancelText: 'Kiểm tra lại',
            okButtonProps: { danger: true },
            onOk: () => itemMutation.mutateAsync(values),
        });
    };

    const editOperation = (operation: ProductionOperation) => {
        setEditingOperation(operation);
        operationForm.setFieldsValue({
            code: operation.code,
            name: operation.name,
            unit: operation.unit,
            sortOrder: operation.sortOrder,
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
    const catalogLineById = new Map((linesQuery.data || []).map((line) => [line.id, line]));
    const driftedDayLines = dayLines.filter((line) => {
        const catalogLine = catalogLineById.get(line.lineId);
        if (!catalogLine) return false;
        return (
            normalizedLineText(line.lineCode).toUpperCase() !== normalizedLineText(catalogLine.code).toUpperCase() ||
            normalizedLineText(line.lineName) !== normalizedLineText(catalogLine.name) ||
            normalizedLineText(line.leaderName) !== normalizedLineText(catalogLine.leaderName) ||
            Number(line.sortOrder || 0) !== Number(catalogLine.sortOrder || 0)
        );
    });
    const inactiveDayLineIds = new Set(
        dayLines.filter((line) => catalogLineById.get(line.lineId)?.isActive === false).map((line) => line.lineId)
    );

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

    const syncDayLinesMutation = useMutation({
        mutationFn: () => productionService.syncDayLineMetadata(day!.id),
        onSuccess: async () => {
            message.success('Đã đồng bộ tên chuyền và tổ trưởng, số liệu sản xuất được giữ nguyên');
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

            {driftedDayLines.length ? (
                <Alert
                    type='warning'
                    showIcon
                    message={`${driftedDayLines.length} chuyền đang dùng thông tin cũ`}
                    description='Chỉ cập nhật mã, tên, tổ trưởng và thứ tự từ danh mục. Sản lượng, mã hàng, QC, công đoạn và số công nhân trong ngày được giữ nguyên.'
                    action={
                        <Button
                            size='small'
                            type='primary'
                            disabled={day.status !== 'draft'}
                            loading={syncDayLinesMutation.isPending}
                            onClick={() => syncDayLinesMutation.mutate()}
                        >
                            Đồng bộ ngay
                        </Button>
                    }
                />
            ) : null}

            <Select
                className='w-full'
                placeholder={
                    addableLines.length ? 'Chọn chuyền để đưa vào ngày' : 'Mọi chuyền đang bật đã có trong ngày'
                }
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
                                        {driftedDayLines.some((item) => item.lineId === line.lineId) ? (
                                            <Tag color='orange'>Thông tin cũ</Tag>
                                        ) : null}
                                        {inactiveDayLineIds.has(line.lineId) ? <Tag>Đã tắt trong danh mục</Tag> : null}
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
                        Đây là danh mục dùng chung. Thêm chuyền ở đây chưa đưa nó vào ngày nào — sang tab "Chuyền trong
                        ngày" để xếp cho ngày đang xem. Số công nhân cũng xác nhận riêng từng ngày.
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

    const operationTab = (
        <div className='production-setup-section'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>
                        {editingOperation ? `Sửa ${editingOperation.code}` : 'Danh mục công đoạn trọng yếu'}
                    </Title>
                    <Text type='secondary'>
                        Chỉ tạo các công đoạn cần theo dõi nhịp. Danh sách này không làm thay đổi sản lượng thành phẩm.
                    </Text>
                </div>
                {editingOperation ? (
                    <Button
                        onClick={() => {
                            setEditingOperation(null);
                            operationForm.resetFields();
                            operationForm.setFieldsValue({ unit: 'SP', sortOrder: 0 });
                        }}
                    >
                        Hủy sửa
                    </Button>
                ) : null}
            </div>
            <Form
                form={operationForm}
                layout='vertical'
                initialValues={{ unit: 'SP', sortOrder: 0 }}
                onFinish={(values) => operationMutation.mutate(values)}
            >
                <div className='production-setup-form-grid'>
                    <Form.Item
                        label='Mã công đoạn'
                        name='code'
                        rules={[{ required: true, message: 'Nhập mã công đoạn' }]}
                    >
                        <Input placeholder='VD: TRA_CO' autoCapitalize='characters' />
                    </Form.Item>
                    <Form.Item
                        label='Tên công đoạn'
                        name='name'
                        rules={[{ required: true, message: 'Nhập tên công đoạn' }]}
                    >
                        <Input placeholder='VD: Tra cổ' />
                    </Form.Item>
                    <Form.Item label='Đơn vị' name='unit'>
                        <Input placeholder='SP' />
                    </Form.Item>
                    <Form.Item label='Thứ tự' name='sortOrder'>
                        <InputNumber min={0} precision={0} className='w-full' />
                    </Form.Item>
                </div>
                <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={operationMutation.isPending}>
                    {editingOperation ? 'Lưu thay đổi' : 'Thêm công đoạn'}
                </Button>
            </Form>

            <List
                className='production-master-list'
                loading={operationsQuery.isLoading}
                dataSource={operationsQuery.data || []}
                locale={{ emptyText: <Empty description='Chưa có công đoạn' /> }}
                renderItem={(operation) => (
                    <List.Item
                        actions={[
                            <Button
                                key='edit'
                                type='text'
                                icon={<EditOutlined />}
                                onClick={() => editOperation(operation)}
                            >
                                Sửa
                            </Button>,
                            <Switch
                                key='active'
                                size='small'
                                checked={operation.isActive}
                                onChange={(isActive) =>
                                    productionService
                                        .updateOperation(operation.id, { isActive })
                                        .then(invalidateCatalog)
                                        .catch((error) => message.error(errorMessage(error)))
                                }
                            />,
                        ]}
                    >
                        <List.Item.Meta
                            avatar={<ApartmentOutlined />}
                            title={
                                <span className='production-master-title'>
                                    {operation.code}
                                    {!operation.isActive ? <Tag>Đã tắt</Tag> : null}
                                </span>
                            }
                            description={`${operation.name} · ${operation.unit}`}
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
                    <Text type='secondary'>
                        Khi đổi đơn giá, hệ thống sẽ yêu cầu chọn rõ có tính lại dữ liệu cũ hay không.
                    </Text>
                </div>
                {editingItem ? (
                    <Button
                        onClick={() => {
                            setEditingItem(null);
                            setForcePriceRecalculation(false);
                            itemForm.resetFields();
                            itemForm.setFieldsValue({ unit: 'SP', unitPrice: 0 });
                        }}
                    >
                        Hủy sửa
                    </Button>
                ) : null}
            </div>
            <Form form={itemForm} layout='vertical' onFinish={submitItemForm}>
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
                    <Form.Item
                        label='Đơn giá'
                        name='unitPrice'
                        initialValue={0}
                        rules={[{ required: true, message: 'Nhập đơn giá' }]}
                    >
                        <InputNumber min={0} precision={0} className='w-full' addonAfter='đ' />
                    </Form.Item>
                </div>
                {editingItem && !itemPriceChanged && !forcePriceRecalculation ? (
                    <div className='production-price-recalculate-prompt'>
                        <div>
                            <strong>Dữ liệu cũ chưa đúng đơn giá?</strong>
                            <span>Dùng đơn giá hiện tại {money(editingItem.unitPrice)}đ để tính lại theo ngày.</span>
                        </div>
                        <Button
                            icon={<HistoryOutlined />}
                            onClick={() => {
                                setForcePriceRecalculation(true);
                                itemForm.setFieldsValue({
                                    unitPriceMode: 'recalculate_from_date',
                                    unitPriceEffectiveFrom: dayjs(day?.productionDate || undefined),
                                    unitPriceChangeReason: undefined,
                                });
                            }}
                        >
                            Tính lại dữ liệu cũ
                        </Button>
                    </div>
                ) : null}
                {itemPriceUpdateRequested ? (
                    <div className='production-price-change-panel'>
                        <Alert
                            type={itemPriceChanged ? 'warning' : 'info'}
                            showIcon
                            message={
                                itemPriceChanged
                                    ? `Đơn giá thay đổi: ${money(editingItem?.unitPrice)}đ → ${money(Number(effectiveWatchedUnitPrice))}đ`
                                    : `Tính lại theo đơn giá hiện tại: ${money(editingItem?.unitPrice)}đ`
                            }
                            description={
                                itemPriceChanged
                                    ? 'Hãy chọn đúng phạm vi áp dụng. Lựa chọn này quyết định số liệu trên bảng chuyền, báo cáo và thu nhập.'
                                    : 'Hệ thống sẽ chỉ sửa snapshot đơn giá cũ; không thay đổi sản lượng đã nhập.'
                            }
                            action={
                                !itemPriceChanged ? (
                                    <Button size='small' onClick={() => setForcePriceRecalculation(false)}>
                                        Hủy
                                    </Button>
                                ) : undefined
                            }
                        />
                        {itemPriceChanged ? (
                            <Form.Item
                                label='Cách áp dụng đơn giá'
                                name='unitPriceMode'
                                rules={[{ required: true, message: 'Chọn cách áp dụng đơn giá' }]}
                            >
                                <Radio.Group className='production-price-mode-list'>
                                    <Radio value='recalculate_from_date'>
                                        <span className='production-price-mode-copy'>
                                            <strong>Sửa đơn giá đã khai báo sai</strong>
                                            <small>Tính lại dữ liệu từ ngày chọn, kể cả báo cáo đã khóa.</small>
                                        </span>
                                    </Radio>
                                    <Radio value='future_only'>
                                        <span className='production-price-mode-copy'>
                                            <strong>Chỉ áp dụng cho lần chạy mới</strong>
                                            <small>Giữ nguyên đơn giá của mọi dữ liệu và lần chạy đã tạo.</small>
                                        </span>
                                    </Radio>
                                </Radio.Group>
                            </Form.Item>
                        ) : null}
                        {watchedUnitPriceMode !== 'future_only' ? (
                            <Form.Item
                                label='Tính lại từ ngày'
                                name='unitPriceEffectiveFrom'
                                rules={[{ required: true, message: 'Chọn ngày bắt đầu tính lại' }]}
                            >
                                <DatePicker
                                    className='w-full'
                                    format='DD/MM/YYYY'
                                    allowClear={false}
                                    disabledDate={(date) => date.isAfter(dayjs(), 'day')}
                                />
                            </Form.Item>
                        ) : null}
                        <Form.Item
                            label='Lý do thay đổi'
                            name='unitPriceChangeReason'
                            rules={[
                                { required: true, whitespace: true, message: 'Nhập lý do để truy vết thay đổi' },
                                { min: 3, message: 'Lý do cần có ít nhất 3 ký tự' },
                                { max: 500, message: 'Lý do không vượt quá 500 ký tự' },
                            ]}
                        >
                            <Input.TextArea
                                rows={2}
                                maxLength={500}
                                showCount
                                placeholder='VD: Đơn giá ban đầu nhập sai theo báo giá'
                            />
                        </Form.Item>
                    </div>
                ) : null}
                <div className='production-item-save-action'>
                    <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={itemMutation.isPending}>
                        {forcePriceRecalculation && !itemPriceChanged
                            ? 'Tính lại và lưu'
                            : editingItem
                              ? 'Lưu thay đổi'
                              : 'Thêm mã hàng'}
                    </Button>
                </div>
            </Form>

            <List
                className='production-master-list'
                loading={itemsQuery.isLoading}
                dataSource={itemsQuery.data || []}
                locale={{ emptyText: <Empty description='Chưa có mã hàng' /> }}
                renderItem={(item) => (
                    <List.Item
                        actions={[
                            <Button
                                key='operations'
                                type='text'
                                icon={<ApartmentOutlined />}
                                onClick={() => setTemplateItem(item)}
                            >
                                Công đoạn
                            </Button>,
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
                            description={`${item.name || 'Chưa đặt tên'} · ${money(item.unitPrice)} đ/${item.unit} · ${(item.operationTemplates || []).length} công đoạn`}
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
                    { key: 'operations', label: 'Công đoạn', children: operationTab },
                    { key: 'slots', label: 'Khung giờ', children: slotsTab },
                ]}
            />
            <ProductionOperationTemplateModal
                open={Boolean(templateItem)}
                item={templateItem}
                operations={operationsQuery.data || []}
                onClose={() => setTemplateItem(null)}
                onSaved={async () => {
                    await invalidateCatalog();
                }}
            />
        </Drawer>
    );
};

export default ProductionSetupDrawer;
