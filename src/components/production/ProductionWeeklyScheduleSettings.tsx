import {
    CalendarOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    SaveOutlined,
    UndoOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    Empty,
    Form,
    Popconfirm,
    Select,
    Skeleton,
    Switch,
    Tag,
    TimePicker,
    Tooltip,
    Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { buildSlotLabel, slotRangeLabelShort } from '../../core/lib/productionSlot';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionScheduleTemplate, ProductionTimeSlot } from '../../core/types/production';

const { Text, Title } = Typography;

type Props = {
    plantId: string;
    day?: ProductionDay | null;
};

type SlotFormValues = {
    start: Dayjs;
    end: Dayjs;
    kind: ProductionTimeSlot['kind'];
};

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const minuteToTime = (minute: number) => dayjs().startOf('day').add(minute, 'minute');
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể lưu lịch sản xuất');
const cloneSlots = (slots: ProductionTimeSlot[]) => slots.map((slot) => ({ ...slot }));
const comparable = (working: boolean, slots: ProductionTimeSlot[]) =>
    JSON.stringify({
        working,
        slots: slots.map(({ key, startMinute, endMinute, kind, isActive }) => ({
            key,
            startMinute,
            endMinute,
            kind,
            isActive,
        })),
    });
const durationLabel = (minutes: number) => {
    if (!minutes) return '0 giờ';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
};

const ProductionWeeklyScheduleSettings = ({ plantId, day }: Props) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [slotForm] = Form.useForm<SlotFormValues>();
    const currentWeekday = day ? dayjs(day.productionDate).day() : dayjs().day();
    const [weekday, setWeekday] = useState<number>(currentWeekday);
    const [isWorkingDay, setIsWorkingDay] = useState(true);
    const [draftSlots, setDraftSlots] = useState<ProductionTimeSlot[]>([]);
    const [editingKey, setEditingKey] = useState<string | null>(null);

    useEffect(() => {
        setWeekday(currentWeekday);
    }, [currentWeekday, plantId]);

    const queryKey = ['production', 'schedule-templates', plantId] as const;
    const scheduleQuery = useQuery({
        queryKey,
        queryFn: () => productionService.getScheduleTemplates(plantId),
        enabled: Boolean(plantId),
    });
    const templates = scheduleQuery.data || [];
    const selected = templates.find((template) => template.weekday === weekday);

    useEffect(() => {
        if (!selected) return;
        setIsWorkingDay(selected.isWorkingDay);
        setDraftSlots(cloneSlots(selected.timeSlots));
        setEditingKey(null);
        slotForm.resetFields();
        slotForm.setFieldValue('kind', 'regular');
    }, [selected, slotForm]);

    const summary = useMemo(() => {
        const minutes = (kind: ProductionTimeSlot['kind']) =>
            draftSlots
                .filter((slot) => slot.isActive && slot.kind === kind)
                .reduce((sum, slot) => sum + Math.max(0, slot.endMinute - slot.startMinute), 0);
        return { regular: minutes('regular'), overtime: minutes('overtime') };
    }, [draftSlots]);
    const dirty = Boolean(
        selected && comparable(isWorkingDay, draftSlots) !== comparable(selected.isWorkingDay, selected.timeSlots)
    );

    const saveMutation = useMutation({
        mutationFn: () =>
            productionService.updateScheduleTemplate(plantId, weekday, {
                isWorkingDay,
                timeSlots: draftSlots,
            }),
        onSuccess: async (saved) => {
            message.success(`Đã lưu lịch ${saved.weekdayLabel}`);
            await queryClient.invalidateQueries({ queryKey });
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const resetMutation = useMutation({
        mutationFn: () => productionService.resetScheduleTemplate(plantId, weekday),
        onSuccess: async (saved) => {
            message.success(`Đã khôi phục lịch mặc định ${saved.weekdayLabel}`);
            await queryClient.invalidateQueries({ queryKey });
        },
        onError: (error) => message.error(errorMessage(error)),
    });
    const applyMutation = useMutation({
        mutationFn: () => productionService.applyScheduleTemplate(day!.id),
        onSuccess: async () => {
            message.success('Đã áp dụng mẫu lịch cho ngày đang xem');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const editSlot = (slot: ProductionTimeSlot) => {
        setEditingKey(slot.key);
        slotForm.setFieldsValue({
            start: minuteToTime(slot.startMinute),
            end: minuteToTime(slot.endMinute),
            kind: slot.kind,
        });
    };

    const saveSlot = (values: SlotFormValues) => {
        const startMinute = values.start.hour() * 60 + values.start.minute();
        const endMinute = values.end.hour() * 60 + values.end.minute();
        if (endMinute <= startMinute) {
            message.warning('Giờ kết thúc phải sau giờ bắt đầu');
            return;
        }
        const overlap = draftSlots.find(
            (slot) =>
                slot.key !== editingKey && slot.isActive && startMinute < slot.endMinute && endMinute > slot.startMinute
        );
        if (overlap) {
            message.warning(`Khung giờ bị chồng lên ${slotRangeLabelShort(overlap)}`);
            return;
        }
        const taken = new Set(draftSlots.map((slot) => slot.key));
        const baseKey = values.start.format('HH:mm');
        let key = editingKey || baseKey;
        let suffix = 2;
        while (!editingKey && taken.has(key)) {
            key = `${baseKey}_${suffix}`;
            suffix += 1;
        }
        const previous = draftSlots.find((slot) => slot.key === editingKey);
        const next: ProductionTimeSlot = {
            key,
            label: buildSlotLabel(startMinute, endMinute),
            startMinute,
            endMinute,
            kind: values.kind,
            isActive: previous?.isActive ?? true,
        };
        setDraftSlots((current) =>
            [...current.filter((slot) => slot.key !== editingKey), next].sort(
                (left, right) => left.startMinute - right.startMinute
            )
        );
        setEditingKey(null);
        slotForm.resetFields();
        slotForm.setFieldValue('kind', 'regular');
    };

    const copyFrom = (sourceWeekday: number) => {
        const source = templates.find((template) => template.weekday === sourceWeekday);
        if (!source) return;
        setIsWorkingDay(source.isWorkingDay);
        setDraftSlots(cloneSlots(source.timeSlots));
        message.info(`Đã sao chép lịch ${source.weekdayLabel}. Bấm Lưu mẫu để áp dụng.`);
    };

    if (scheduleQuery.isLoading) return <Skeleton active paragraph={{ rows: 7 }} />;
    if (!selected) return <Empty description='Không tải được mẫu lịch tuần' />;

    return (
        <div className='production-weekly-schedule'>
            <div className='production-setup-heading'>
                <div>
                    <Title level={5}>Lịch làm việc theo tuần</Title>
                    <Text type='secondary'>Mẫu chỉ áp dụng khi tạo ngày hoặc kế hoạch mới.</Text>
                </div>
                <Tag color={selected.source === 'custom' ? 'blue' : 'default'}>
                    {selected.source === 'custom' ? `Mẫu riêng v${selected.revision}` : 'Mặc định hệ thống'}
                </Tag>
            </div>

            <div className='production-weekday-picker' role='tablist' aria-label='Chọn ngày trong tuần'>
                {[1, 2, 3, 4, 5, 6, 0].map((value) => (
                    <button
                        key={value}
                        type='button'
                        className={weekday === value ? 'is-active' : ''}
                        onClick={() => setWeekday(value)}
                    >
                        <span>{WEEKDAY_SHORT[value]}</span>
                        <small>
                            {templates.find((item) => item.weekday === value)?.isWorkingDay ? 'Làm việc' : 'Nghỉ'}
                        </small>
                    </button>
                ))}
            </div>

            <div className='production-schedule-toolbar'>
                <label>
                    <span>Trạng thái ngày</span>
                    <strong>{isWorkingDay ? 'Ngày làm việc' : 'Ngày nghỉ'}</strong>
                </label>
                <Switch
                    checked={isWorkingDay}
                    onChange={(checked) => {
                        setIsWorkingDay(checked);
                        if (!checked) setDraftSlots((slots) => slots.map((slot) => ({ ...slot, isActive: false })));
                    }}
                    checkedChildren='Làm'
                    unCheckedChildren='Nghỉ'
                />
                <Select
                    className='production-schedule-copy'
                    placeholder='Sao chép lịch từ...'
                    suffixIcon={<CopyOutlined />}
                    value={undefined}
                    onChange={copyFrom}
                    options={templates
                        .filter((template) => template.weekday !== weekday)
                        .map((template) => ({ value: template.weekday, label: template.weekdayLabel }))}
                />
            </div>

            <div className='production-schedule-summary'>
                <div>
                    <span>Giờ sản xuất thường</span>
                    <strong>{durationLabel(summary.regular)}</strong>
                </div>
                <div>
                    <span>Tăng ca đang bật</span>
                    <strong>{durationLabel(summary.overtime)}</strong>
                </div>
                <div>
                    <span>Khung đang hoạt động</span>
                    <strong>{draftSlots.filter((slot) => slot.isActive).length}</strong>
                </div>
            </div>

            {weekday === 6 ? (
                <Alert
                    type='info'
                    showIcon
                    message='Quy tắc Thứ Bảy'
                    description='08-17h (trừ giờ nghỉ trưa) là 8 giờ sản xuất thường. Từ 17h là tăng ca và chỉ bật khi thực tế có làm.'
                />
            ) : null}

            <Form form={slotForm} layout='vertical' onFinish={saveSlot} className='production-schedule-slot-form'>
                <div className='production-slot-form-grid'>
                    <Form.Item label='Bắt đầu' name='start' rules={[{ required: true, message: 'Chọn giờ' }]}>
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
                <Button
                    htmlType='submit'
                    icon={editingKey ? <EditOutlined /> : <PlusOutlined />}
                    disabled={!isWorkingDay}
                >
                    {editingKey ? 'Cập nhật khung' : 'Thêm khung'}
                </Button>
            </Form>

            <div className={`production-schedule-slots ${!isWorkingDay ? 'is-disabled' : ''}`}>
                {draftSlots.map((slot) => (
                    <div key={slot.key} className='production-schedule-slot-row'>
                        <div className={`production-schedule-slot-icon is-${slot.kind}`}>
                            <CalendarOutlined />
                        </div>
                        <div className='production-schedule-slot-copy'>
                            <strong>{slotRangeLabelShort(slot)}</strong>
                            <span>
                                {minuteToTime(slot.startMinute).format('HH:mm')}–
                                {minuteToTime(slot.endMinute).format('HH:mm')}
                            </span>
                        </div>
                        <Tag color={slot.kind === 'overtime' ? 'gold' : 'blue'}>
                            {slot.kind === 'overtime' ? 'Tăng ca' : 'Thường'}
                        </Tag>
                        <Switch
                            size='small'
                            checked={slot.isActive && isWorkingDay}
                            disabled={!isWorkingDay}
                            onChange={(isActive) =>
                                setDraftSlots((current) =>
                                    current.map((item) => (item.key === slot.key ? { ...item, isActive } : item))
                                )
                            }
                        />
                        <Tooltip title='Sửa khung giờ'>
                            <Button
                                type='text'
                                icon={<EditOutlined />}
                                onClick={() => editSlot(slot)}
                                disabled={!isWorkingDay}
                            />
                        </Tooltip>
                        <Popconfirm
                            title='Xóa khung giờ này?'
                            onConfirm={() =>
                                setDraftSlots((current) => current.filter((item) => item.key !== slot.key))
                            }
                        >
                            <Tooltip title='Xóa khung giờ'>
                                <Button type='text' danger icon={<DeleteOutlined />} disabled={!isWorkingDay} />
                            </Tooltip>
                        </Popconfirm>
                    </div>
                ))}
            </div>

            <div className='production-schedule-actions'>
                <Popconfirm
                    title='Khôi phục lịch mặc định?'
                    description='Mẫu riêng của ngày này trong tuần sẽ bị xóa.'
                    onConfirm={() => resetMutation.mutate()}
                >
                    <Button
                        icon={<UndoOutlined />}
                        loading={resetMutation.isPending}
                        disabled={selected.source !== 'custom'}
                    >
                        Khôi phục
                    </Button>
                </Popconfirm>
                {day && currentWeekday === weekday ? (
                    <Popconfirm
                        title='Áp dụng mẫu cho ngày đang xem?'
                        description='Không thể thay khung giờ đã có sản lượng hoặc phân bổ.'
                        onConfirm={() => applyMutation.mutate()}
                    >
                        <Button icon={<CalendarOutlined />} loading={applyMutation.isPending}>
                            Áp dụng cho ngày này
                        </Button>
                    </Popconfirm>
                ) : null}
                <Button
                    type='primary'
                    icon={<SaveOutlined />}
                    loading={saveMutation.isPending}
                    disabled={!dirty || !draftSlots.length}
                    onClick={() => saveMutation.mutate()}
                >
                    Lưu mẫu {WEEKDAY_SHORT[weekday]}
                </Button>
            </div>
        </div>
    );
};

export default ProductionWeeklyScheduleSettings;
