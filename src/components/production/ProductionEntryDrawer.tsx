import { Alert, App, Button, Drawer, Form, Grid, Input, InputNumber, Popconfirm, Select, Tag, Typography } from 'antd';
import {
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    RetweetOutlined,
    SaveOutlined,
    SettingOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { slotRangeLabel } from '../../core/lib/productionSlot';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionItem, ProductionLineRecord } from '../../core/types/production';

const { Text, Title } = Typography;

type Props = {
    open: boolean;
    day: ProductionDay;
    line?: ProductionLineRecord;
    items: ProductionItem[];
    slotKey: string;
    onClose: () => void;
    onSaved: (moveNext: boolean) => void;
};

type SetupValues = {
    workerCount: number;
    itemId?: string;
    hourlyQuota?: number;
    startSlotKey?: string;
};

type EntryValues = {
    runId: string;
    quantity: number;
    note?: string;
};

type RunValues = {
    itemId: string;
    hourlyQuota: number;
    startedSlotKey: string;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể lưu dữ liệu');

const ProductionEntryDrawer = ({ open, day, line, items, slotKey, onClose, onSaved }: Props) => {
    const screens = Grid.useBreakpoint();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [setupForm] = Form.useForm<SetupValues>();
    const [entryForm] = Form.useForm<EntryValues>();
    const [runForm] = Form.useForm<RunValues>();
    const [showSetup, setShowSetup] = useState(false);
    const [showChangeItem, setShowChangeItem] = useState(false);
    const selectedRunId = Form.useWatch('runId', entryForm);
    const runDraftSlotKey = Form.useWatch('startedSlotKey', runForm);
    const slot = day.timeSlots.find((item) => item.key === slotKey);
    const slotValue = line?.slotValues.find((item) => item.key === slotKey);
    const isReadOnly = day.status !== 'draft';
    const hasPlannedRuns = Boolean(line?.runs.some((run) => run.source === 'plan'));
    // Đã có sản lượng: chỉ sửa được số CN + khoán giờ; đổi mã hàng phải dùng chức năng riêng (BE chặn).
    const hasEntries = Boolean(line?.entries.length);
    const runDraftSlot = day.timeSlots.find((item) => item.key === runDraftSlotKey);

    const eligibleRuns = useMemo(() => {
        if (!line) return [];
        const slotIndex = day.timeSlots.findIndex((item) => item.key === slotKey);
        return line.runs.filter((run) => {
            const startIndex = day.timeSlots.findIndex((item) => item.key === run.startedSlotKey);
            const endIndex = run.endedSlotKey
                ? day.timeSlots.findIndex((item) => item.key === run.endedSlotKey)
                : day.timeSlots.length - 1;
            return slotIndex >= startIndex && slotIndex <= endIndex;
        });
    }, [day.timeSlots, line, slotKey]);

    const existingEntry = useMemo(
        () => line?.entries.find((entry) => entry.slotKey === slotKey && entry.runId === selectedRunId),
        [line?.entries, selectedRunId, slotKey]
    );

    useEffect(() => {
        if (!open || !line) return;
        const activeRun = [...line.runs].reverse().find((run) => run.status === 'active') || line.runs[0];
        setupForm.setFieldsValue({
            workerCount: line.workerCount,
            itemId: activeRun?.itemId,
            hourlyQuota: activeRun?.hourlyQuota,
            startSlotKey: activeRun?.startedSlotKey || day.timeSlots.find((item) => item.isActive)?.key,
        });
        setShowSetup(!isReadOnly && !line.configured);
        setShowChangeItem(false);
    }, [day.timeSlots, isReadOnly, line, open, setupForm]);

    useEffect(() => {
        if (!open || !line) return;
        const defaultRunId = slotValue?.runId || eligibleRuns[eligibleRuns.length - 1]?.id;
        const entry = line.entries.find((item) => item.slotKey === slotKey && item.runId === defaultRunId);
        entryForm.setFieldsValue({
            runId: defaultRunId,
            quantity: entry?.quantity,
            note: entry?.note,
        });
        // Điền sẵn mã hàng + khoán đang chạy: đa số trường hợp người dùng chỉ đổi
        // mức khoán từ giờ này trở đi, không đổi mã hàng.
        const currentRun = eligibleRuns[eligibleRuns.length - 1];
        runForm.setFieldsValue({
            startedSlotKey: slotKey,
            itemId: currentRun?.itemId,
            hourlyQuota: currentRun?.hourlyQuota,
        });
    }, [eligibleRuns, entryForm, line, open, runForm, slotKey, slotValue?.runId]);

    useEffect(() => {
        if (!open || !line || !selectedRunId) return;
        const entry = line.entries.find((item) => item.slotKey === slotKey && item.runId === selectedRunId);
        entryForm.setFieldsValue({ quantity: entry?.quantity, note: entry?.note });
    }, [entryForm, line, open, selectedRunId, slotKey]);

    const refreshDay = () => queryClient.invalidateQueries({ queryKey: ['production', 'day', day.plantId] });

    const setupMutation = useMutation({
        mutationFn: (values: SetupValues) =>
            productionService.configureLine(
                day.id,
                line!.lineId,
                hasPlannedRuns
                    ? { workerCount: values.workerCount, workerCountConfirmed: true }
                    : { ...values, workerCountConfirmed: true }
            ),
        onSuccess: async () => {
            message.success('Đã xác nhận thông tin chuyền');
            setShowSetup(false);
            await refreshDay();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const entryMutation = useMutation({
        mutationFn: (values: EntryValues) => productionService.saveEntry(day.id, line!.lineId, slotKey, values),
        onSuccess: async (_, variables) => {
            message.success(`Đã lưu ${variables.quantity.toLocaleString('vi-VN')} sản phẩm`);
            await refreshDay();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const runMutation = useMutation({
        mutationFn: (values: RunValues) => productionService.createRun(day.id, line!.lineId, values),
        onSuccess: async () => {
            message.success('Đã bắt đầu mã hàng mới');
            setShowChangeItem(false);
            runForm.resetFields();
            await refreshDay();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const deleteEntryMutation = useMutation({
        mutationFn: (entryId: string) => productionService.deleteEntry(day.id, line!.lineId, entryId),
        onSuccess: async () => {
            message.success('Đã xóa số liệu của khung giờ');
            entryForm.setFieldsValue({ quantity: undefined, note: undefined });
            await refreshDay();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const submitEntry = async (moveNext: boolean) => {
        try {
            const values = await entryForm.validateFields();
            await entryMutation.mutateAsync(values);
            onSaved(moveNext);
        } catch {
            // Form hoặc mutation đã hiển thị lỗi tại đúng vị trí.
        }
    };

    if (!line) return null;

    const selectedRun = line.runs.find((run) => run.id === selectedRunId);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={screens.md ? 'right' : 'bottom'}
            width={screens.md ? 480 : undefined}
            height={screens.md ? undefined : '88dvh'}
            className='production-entry-drawer'
            title={
                <div className='production-entry-title'>
                    <span>{line.lineCode}</span>
                    <small>{slotRangeLabel(slot) || slotKey}</small>
                </div>
            }
            destroyOnHidden
        >
            <div className='production-entry-context'>
                <div>
                    <Text type='secondary'>Tổ trưởng</Text>
                    <strong>{line.leaderName || 'Chưa cập nhật'}</strong>
                </div>
                <div>
                    <Text type='secondary'>Nhân sự hôm nay</Text>
                    <strong>
                        <TeamOutlined /> {line.workerCount} người
                    </strong>
                </div>
                {!isReadOnly ? (
                    <Button type='text' icon={<EditOutlined />} onClick={() => setShowSetup((value) => !value)}>
                        Cấu hình
                    </Button>
                ) : (
                    <Tag color={day.status === 'locked' ? 'green' : 'blue'}>
                        {day.status === 'locked' ? 'Đã khóa' : 'Chờ duyệt'}
                    </Tag>
                )}
            </div>

            {isReadOnly ? (
                <section className='production-drawer-section production-readonly-entry'>
                    <Alert
                        type='info'
                        showIcon
                        message={day.status === 'locked' ? 'Số liệu đã khóa sổ' : 'Số liệu đang chờ duyệt'}
                        description='Bạn vẫn có thể xem chi tiết, nhưng cần mở lại ngày sản xuất trước khi chỉnh sửa.'
                    />
                    <div className='production-readonly-entry__numbers'>
                        <div>
                            <span>Sản lượng</span>
                            <strong>
                                {slotValue?.reported ? slotValue.actual.toLocaleString('vi-VN') : 'Chưa báo'}
                            </strong>
                        </div>
                        <div>
                            <span>Khoán</span>
                            <strong>{(slotValue?.target || 0).toLocaleString('vi-VN')}</strong>
                        </div>
                        <div>
                            <span>Mã hàng</span>
                            <strong>{selectedRun?.itemCode || '—'}</strong>
                        </div>
                    </div>
                    {existingEntry ? (
                        <div className='production-entry-audit'>
                            <span>Người nhập</span>
                            <strong>{existingEntry.enteredByName || 'Không xác định'}</strong>
                            <small>
                                {existingEntry.enteredAt
                                    ? new Date(existingEntry.enteredAt).toLocaleString('vi-VN')
                                    : ''}
                                {existingEntry.updatedByName &&
                                existingEntry.updatedByName !== existingEntry.enteredByName
                                    ? ` · sửa bởi ${existingEntry.updatedByName}`
                                    : ''}
                            </small>
                            {existingEntry.note ? <p>{existingEntry.note}</p> : null}
                        </div>
                    ) : null}
                </section>
            ) : null}

            {!isReadOnly && showSetup ? (
                <section className='production-drawer-section production-drawer-section--setup'>
                    <div className='production-section-title'>
                        <div>
                            <Title level={5}>{line.configured ? 'Sửa thiết lập chuyền' : 'Thông tin đầu ngày'}</Title>
                            <Text type='secondary'>
                                {hasEntries
                                    ? 'Đã có sản lượng — sửa được số công nhân và khoán giờ.'
                                    : 'Số công nhân được xác nhận riêng cho ngày này.'}
                            </Text>
                        </div>
                    </div>
                    {hasEntries ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Sửa khoán ở đây tính lại cả những giờ đã báo'
                            description='Chỉ dùng khi đặt sai khoán từ đầu ngày. Nếu khoán thay đổi giữa ngày, hãy dùng "Đổi mã hàng hoặc mức khoán từ khung giờ này" để giữ nguyên số của các giờ trước.'
                        />
                    ) : null}
                    <Form form={setupForm} layout='vertical' onFinish={(values) => setupMutation.mutate(values)}>
                        <div className='production-form-two-columns'>
                            <Form.Item
                                label='Số công nhân'
                                name='workerCount'
                                rules={[{ required: true, message: 'Nhập số công nhân' }]}
                            >
                                <InputNumber min={0} max={1000} precision={0} className='w-full' />
                            </Form.Item>
                            {!hasPlannedRuns && !hasEntries ? (
                                <Form.Item label='Bắt đầu từ' name='startSlotKey'>
                                    <Select
                                        options={day.timeSlots
                                            .filter((item) => item.isActive)
                                            .map((item) => ({ value: item.key, label: slotRangeLabel(item) }))}
                                    />
                                </Form.Item>
                            ) : null}
                        </div>
                        {hasPlannedRuns ? (
                            <Alert
                                type='success'
                                showIcon
                                message='Mã hàng và khoán đã được ban hành'
                                description={`${line.runs.filter((run) => run.source === 'plan').length} phân bổ trong kế hoạch ngày`}
                            />
                        ) : (
                            <>
                                <Form.Item
                                    label='Mã hàng đang chạy'
                                    name='itemId'
                                    rules={[{ required: !line.runs.length, message: 'Chọn mã hàng' }]}
                                >
                                    <Select
                                        showSearch
                                        disabled={hasEntries}
                                        optionFilterProp='label'
                                        placeholder='Chọn mã hàng'
                                        options={items.map((item) => ({
                                            value: item.id,
                                            label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                        }))}
                                    />
                                </Form.Item>
                                <Form.Item
                                    label='Khoán mỗi giờ'
                                    name='hourlyQuota'
                                    rules={[{ required: !line.runs.length, message: 'Nhập khoán giờ' }]}
                                >
                                    <InputNumber min={0} precision={0} className='w-full' addonAfter='SP/giờ' />
                                </Form.Item>
                            </>
                        )}
                        <div className='production-setup-actions'>
                            <Button
                                type='primary'
                                htmlType='submit'
                                icon={<CheckOutlined />}
                                loading={setupMutation.isPending}
                                block={!line.configured}
                            >
                                {line.configured ? 'Lưu thay đổi' : 'Xác nhận thông tin chuyền'}
                            </Button>
                            {line.configured ? (
                                <Button onClick={() => setShowSetup(false)}>Quay lại nhập liệu</Button>
                            ) : null}
                        </div>
                    </Form>
                </section>
            ) : null}

            {!isReadOnly && !line.configured && !showSetup ? (
                <Alert
                    type='warning'
                    showIcon
                    message='Chuyền chưa sẵn sàng nhập'
                    description='Cần xác nhận số công nhân và mã hàng đầu tiên.'
                    action={<Button onClick={() => setShowSetup(true)}>Thiết lập</Button>}
                />
            ) : null}

            {!isReadOnly && line.configured && !showSetup ? (
                <>
                    <section className='production-drawer-section production-drawer-section--entry'>
                        <div className='production-entry-item-line'>
                            <div>
                                <Text type='secondary'>Mã hàng tại {slotRangeLabel(slot)}</Text>
                                <strong>
                                    {selectedRun?.itemCode || 'Chưa có mã hàng'}
                                    {selectedRun?.itemName ? ` · ${selectedRun.itemName}` : ''}
                                </strong>
                            </div>
                            {selectedRun ? (
                                <div className='production-entry-plan-tags'>
                                    {selectedRun.source === 'plan' ? <Tag color='green'>Theo kế hoạch</Tag> : null}
                                    <Tag color='blue'>Khoán {selectedRun.hourlyQuota}/giờ</Tag>
                                    <Button
                                        size='small'
                                        icon={<SettingOutlined />}
                                        onClick={() => setShowSetup(true)}
                                    >
                                        Sửa thiết lập
                                    </Button>
                                </div>
                            ) : null}
                        </div>

                        {eligibleRuns.length ? (
                            <Form form={entryForm} layout='vertical'>
                                {eligibleRuns.length > 1 ? (
                                    <Form.Item label='Đợt mã hàng' name='runId' rules={[{ required: true }]}>
                                        <Select
                                            options={eligibleRuns.map((run) => ({
                                                value: run.id,
                                                label: `${run.itemCode}${run.itemName ? ` · ${run.itemName}` : ''}`,
                                            }))}
                                        />
                                    </Form.Item>
                                ) : (
                                    <Form.Item name='runId' hidden>
                                        <Input />
                                    </Form.Item>
                                )}
                                <Form.Item
                                    label='Sản lượng trong giờ'
                                    name='quantity'
                                    rules={[{ required: true, message: 'Nhập sản lượng, kể cả khi bằng 0' }]}
                                >
                                    <InputNumber
                                        min={0}
                                        max={100000000}
                                        precision={0}
                                        controls={false}
                                        inputMode='numeric'
                                        placeholder='0'
                                        className='production-quantity-input'
                                        addonAfter='SP'
                                        autoFocus
                                    />
                                </Form.Item>
                                <Form.Item label='Ghi chú' name='note'>
                                    <Input.TextArea
                                        rows={2}
                                        maxLength={500}
                                        placeholder='Lý do hụt, dừng chuyền hoặc ghi chú khác...'
                                    />
                                </Form.Item>
                            </Form>
                        ) : (
                            <Alert
                                type='warning'
                                showIcon
                                message='Chưa có mã hàng hoạt động trong khung giờ này'
                                action={<Button onClick={() => setShowChangeItem(true)}>Chọn mã</Button>}
                            />
                        )}
                    </section>

                    <button
                        type='button'
                        className='production-change-item-trigger'
                        onClick={() => setShowChangeItem((value) => !value)}
                    >
                        <RetweetOutlined />
                        <span>
                            <strong>Đổi mã hàng hoặc mức khoán từ khung giờ này</strong>
                            <small>Các giờ trước giữ nguyên mã và khoán cũ</small>
                        </span>
                    </button>

                    {showChangeItem ? (
                        <section className='production-drawer-section production-drawer-section--change'>
                            <Form form={runForm} layout='vertical' onFinish={(values) => runMutation.mutate(values)}>
                                <Form.Item
                                    label='Mã hàng'
                                    name='itemId'
                                    rules={[{ required: true, message: 'Chọn mã hàng' }]}
                                    extra='Giữ nguyên mã đang chạy nếu chỉ đổi mức khoán'
                                >
                                    <Select
                                        showSearch
                                        optionFilterProp='label'
                                        options={items.map((item) => ({
                                            value: item.id,
                                            label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                        }))}
                                    />
                                </Form.Item>
                                <div className='production-form-two-columns'>
                                    <Form.Item
                                        label='Khoán mỗi giờ'
                                        name='hourlyQuota'
                                        rules={[{ required: true, message: 'Nhập khoán giờ' }]}
                                    >
                                        <InputNumber
                                            min={0}
                                            precision={0}
                                            className='w-full'
                                            addonAfter='SP/giờ'
                                        />
                                    </Form.Item>
                                    <Form.Item label='Áp dụng từ' name='startedSlotKey' rules={[{ required: true }]}>
                                        <Select
                                            options={day.timeSlots
                                                .filter((item) => item.isActive)
                                                .map((item) => ({ value: item.key, label: slotRangeLabel(item) }))}
                                        />
                                    </Form.Item>
                                </div>
                                <Alert
                                    type='info'
                                    showIcon
                                    className='production-run-hint'
                                    message={
                                        runDraftSlot
                                            ? `Áp dụng từ khung ${slotRangeLabel(runDraftSlot)} trở đi`
                                            : 'Chọn khung giờ bắt đầu áp dụng'
                                    }
                                    description='Các khung giờ trước đó giữ nguyên mã hàng và mức khoán cũ, số đã báo không bị tính lại.'
                                />
                                <Button
                                    type='primary'
                                    htmlType='submit'
                                    icon={<RetweetOutlined />}
                                    loading={runMutation.isPending}
                                    block
                                >
                                    Xác nhận áp dụng
                                </Button>
                            </Form>
                        </section>
                    ) : null}
                </>
            ) : null}

            {!isReadOnly && line.configured && !showSetup && eligibleRuns.length ? (
                <div className='production-entry-actions'>
                    {existingEntry ? (
                        <Popconfirm
                            title='Xóa số liệu giờ này?'
                            description='Ô sẽ trở lại trạng thái chưa báo.'
                            onConfirm={() => deleteEntryMutation.mutate(existingEntry.id)}
                        >
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                loading={deleteEntryMutation.isPending}
                                aria-label='Xóa số liệu'
                            />
                        </Popconfirm>
                    ) : null}
                    <Button
                        size='large'
                        icon={<SaveOutlined />}
                        loading={entryMutation.isPending}
                        onClick={() => void submitEntry(false)}
                    >
                        Lưu
                    </Button>
                    <Button
                        type='primary'
                        size='large'
                        loading={entryMutation.isPending}
                        onClick={() => void submitEntry(true)}
                    >
                        Lưu & chuyền tiếp
                    </Button>
                </div>
            ) : null}
        </Drawer>
    );
};

export default ProductionEntryDrawer;
