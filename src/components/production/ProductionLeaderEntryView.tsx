import {
    ArrowLeftOutlined,
    CheckCircleFilled,
    EditOutlined,
    HistoryOutlined,
    RetweetOutlined,
    SaveOutlined,
    SyncOutlined,
    TeamOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Input, InputNumber, Select, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getProductionEntryDraft,
    removeProductionEntryDraft,
    saveProductionEntryDraft,
} from '../../core/lib/productionDraft';
import { evaluateProductionEntry } from '../../core/lib/productionEntryGuard';
import { slotRangeLabel } from '../../core/lib/productionSlot';
import { productionService } from '../../core/services/production.service';
import type { ProductionDay, ProductionItem, ProductionLineRecord, ProductionRun } from '../../core/types/production';
import type { ProductionEntryOutboxItem } from '../../core/lib/productionOutbox';

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) =>
    typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Không thể lưu dữ liệu';

const REASONS = ['Thiếu người', 'Hỏng máy', 'Thiếu vật tư', 'Đổi mã hàng', 'Hàng lỗi', 'Dừng chuyền'];

const splitEntryNote = (value?: string) => {
    const normalized = value?.trim() || '';
    const matchedReason = REASONS.find((item) => normalized === item || normalized.startsWith(`${item} · `));
    return {
        reason: matchedReason || '',
        note: matchedReason ? normalized.slice(matchedReason.length).replace(/^ · /, '') : normalized,
    };
};

export type LeaderEntrySaveInput = {
    lineId: string;
    lineCode: string;
    slotKey: string;
    runId: string;
    quantity: number;
    note?: string;
    expectedUpdatedAt: string | null;
    existingOutboxId?: string;
};

type Props = {
    actorId: string;
    day: ProductionDay;
    line: ProductionLineRecord;
    slotKey: string;
    items: ProductionItem[];
    pendingEntry?: ProductionEntryOutboxItem;
    online: boolean;
    saving: boolean;
    onBack: () => void;
    onRefresh: () => Promise<unknown>;
    onDiscardPending: () => Promise<void>;
    onSave: (input: LeaderEntrySaveInput) => Promise<'synced' | 'queued' | 'conflict' | 'failed'>;
};

const runsForSlot = (day: ProductionDay, line: ProductionLineRecord, slotKey: string) => {
    const slotIndex = day.timeSlots.findIndex((slot) => slot.key === slotKey);
    return line.runs.filter((run) => {
        const startIndex = day.timeSlots.findIndex((slot) => slot.key === run.startedSlotKey);
        const endIndex = run.endedSlotKey
            ? day.timeSlots.findIndex((slot) => slot.key === run.endedSlotKey)
            : day.timeSlots.length - 1;
        return slotIndex >= startIndex && slotIndex <= endIndex;
    });
};

const ProductionLeaderEntryView = ({
    actorId,
    day,
    line,
    slotKey,
    items,
    pendingEntry,
    online,
    saving,
    onBack,
    onRefresh,
    onDiscardPending,
    onSave,
}: Props) => {
    const { message, modal } = App.useApp();
    const [runId, setRunId] = useState('');
    const [quantity, setQuantity] = useState<number | null>(null);
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [editWorkers, setEditWorkers] = useState(false);
    const [workerCount, setWorkerCount] = useState(line.workerCount);
    const [showChangeRun, setShowChangeRun] = useState(false);
    const [nextItemId, setNextItemId] = useState('');
    const [nextQuota, setNextQuota] = useState<number | null>(null);
    const [nextSlotKey, setNextSlotKey] = useState(slotKey);
    const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
    const [formDirty, setFormDirty] = useState(false);
    const [remoteChanged, setRemoteChanged] = useState(false);
    const [restoredAt, setRestoredAt] = useState<string>();
    const hydrationKeyRef = useRef('');
    const draftSuppressedRef = useRef(false);
    const eligibleRuns = useMemo(() => runsForSlot(day, line, slotKey), [day, line, slotKey]);
    const slot = day.timeSlots.find((item) => item.key === slotKey);
    const slotValue = line.slotValues.find((item) => item.key === slotKey);
    const selectedRun = line.runs.find((run) => run.id === runId);
    const existingEntry = line.entries.find((entry) => entry.slotKey === slotKey && entry.runId === runId);
    const previousEntry = useMemo(() => {
        if (!runId) return undefined;
        const currentSlotIndex = day.timeSlots.findIndex((item) => item.key === slotKey);
        if (currentSlotIndex <= 0) return undefined;

        return line.entries
            .filter((entry) => {
                const entrySlotIndex = day.timeSlots.findIndex((item) => item.key === entry.slotKey);
                return entry.runId === runId && entrySlotIndex >= 0 && entrySlotIndex < currentSlotIndex;
            })
            .sort(
                (left, right) =>
                    day.timeSlots.findIndex((item) => item.key === right.slotKey) -
                    day.timeSlots.findIndex((item) => item.key === left.slotKey)
            )[0];
    }, [day.timeSlots, line.entries, runId, slotKey]);
    const previousSlot = previousEntry ? day.timeSlots.find((item) => item.key === previousEntry.slotKey) : undefined;
    const readOnly = day.status !== 'draft';
    const draftScope = useMemo(
        () => ({
            actorId,
            plantId: day.plantId,
            productionDate: day.productionDate,
            lineId: line.lineId,
            slotKey,
        }),
        [actorId, day.plantId, day.productionDate, line.lineId, slotKey]
    );
    const hydrationKey = [
        line.id,
        slotKey,
        pendingEntry?.id || '',
        pendingEntry?.status === 'conflict' ? 'conflict' : 'queued',
        slotValue?.runId || '',
        eligibleRuns.map((run) => run.id).join(','),
    ].join(':');

    useEffect(() => {
        if (hydrationKeyRef.current === hydrationKey) return;
        hydrationKeyRef.current = hydrationKey;
        const localDraft = !pendingEntry && !readOnly && actorId ? getProductionEntryDraft(draftScope) : undefined;
        const draftRunId =
            localDraft && eligibleRuns.some((run) => run.id === localDraft.runId) ? localDraft.runId : '';
        const defaultRunId =
            pendingEntry?.runId || draftRunId || slotValue?.runId || eligibleRuns[eligibleRuns.length - 1]?.id || '';
        const canonical = line.entries.find((entry) => entry.slotKey === slotKey && entry.runId === defaultRunId);
        const restoredDraft = localDraft?.runId === defaultRunId ? localDraft : undefined;
        const hydratedNote = splitEntryNote(pendingEntry ? pendingEntry.note : canonical?.note);
        draftSuppressedRef.current = false;
        setRunId(defaultRunId);
        setQuantity(
            pendingEntry
                ? pendingEntry.quantity
                : restoredDraft
                  ? restoredDraft.quantity
                  : (canonical?.quantity ?? null)
        );
        setNote(restoredDraft ? restoredDraft.note : hydratedNote.note);
        setReason(restoredDraft ? restoredDraft.reason : hydratedNote.reason);
        setBaseUpdatedAt(
            pendingEntry
                ? pendingEntry.status === 'conflict'
                    ? canonical?.updatedAt || null
                    : pendingEntry.expectedUpdatedAt
                : restoredDraft
                  ? restoredDraft.baseUpdatedAt
                  : canonical?.updatedAt || null
        );
        setFormDirty(Boolean(restoredDraft));
        setRemoteChanged(Boolean(restoredDraft && (canonical?.updatedAt || null) !== restoredDraft.baseUpdatedAt));
        setRestoredAt(restoredDraft?.savedAt);
        setShowChangeRun(false);
        if (pendingEntry) removeProductionEntryDraft(draftScope);
        const currentRun = line.runs.find((run) => run.id === defaultRunId) || eligibleRuns[eligibleRuns.length - 1];
        setNextItemId(currentRun?.itemId || '');
        setNextQuota(currentRun?.hourlyQuota ?? null);
        setNextSlotKey(slotKey);
    }, [
        actorId,
        draftScope,
        eligibleRuns,
        hydrationKey,
        line.entries,
        line.runs,
        pendingEntry,
        readOnly,
        slotKey,
        slotValue?.runId,
    ]);

    useEffect(() => {
        setWorkerCount(line.workerCount);
        setEditWorkers(false);
    }, [line.id, line.workerCount]);

    useEffect(() => {
        if (!runId || pendingEntry?.runId === runId) return;
        const currentVersion = existingEntry?.updatedAt || null;
        if (currentVersion === baseUpdatedAt) return;
        if (formDirty) {
            setRemoteChanged(true);
            return;
        }
        const parsedNote = splitEntryNote(existingEntry?.note);
        setQuantity(existingEntry?.quantity ?? null);
        setNote(parsedNote.note);
        setReason(parsedNote.reason);
        setBaseUpdatedAt(currentVersion);
        setRemoteChanged(false);
    }, [
        baseUpdatedAt,
        existingEntry?.note,
        existingEntry?.quantity,
        existingEntry?.updatedAt,
        formDirty,
        pendingEntry?.runId,
        runId,
    ]);

    const workerMutation = useMutation({
        mutationFn: () =>
            productionService.configureLine(day.id, line.lineId, {
                workerCount,
                workerCountConfirmed: true,
            }),
        onSuccess: async () => {
            message.success('Đã cập nhật số công nhân');
            setEditWorkers(false);
            await onRefresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const setupMutation = useMutation({
        mutationFn: () => {
            const hasPlan = line.runs.some((run) => run.source === 'plan');
            return productionService.configureLine(
                day.id,
                line.lineId,
                hasPlan
                    ? { workerCount, workerCountConfirmed: true }
                    : {
                          workerCount,
                          workerCountConfirmed: true,
                          itemId: nextItemId,
                          hourlyQuota: nextQuota ?? undefined,
                          startSlotKey: nextSlotKey,
                      }
            );
        },
        onSuccess: async () => {
            message.success('Chuyền đã sẵn sàng nhập sản lượng');
            await onRefresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const runMutation = useMutation({
        mutationFn: () =>
            productionService.createRun(day.id, line.lineId, {
                itemId: nextItemId,
                hourlyQuota: nextQuota || 0,
                startedSlotKey: nextSlotKey,
            }),
        onSuccess: async () => {
            message.success('Đã áp dụng mã hàng và khoán mới');
            setShowChangeRun(false);
            await onRefresh();
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const changeQuantity = (value: number | null) => {
        draftSuppressedRef.current = false;
        setQuantity(value);
        setFormDirty(true);
    };
    const adjustQuantity = (delta: number) => {
        draftSuppressedRef.current = false;
        setQuantity((current) => Math.max(0, Number(current || 0) + delta));
        setFormDirty(true);
    };
    const selectRun = (nextRunId: string) => {
        draftSuppressedRef.current = true;
        removeProductionEntryDraft(draftScope);
        const canonical = line.entries.find((entry) => entry.slotKey === slotKey && entry.runId === nextRunId);
        const queued = pendingEntry?.runId === nextRunId ? pendingEntry : undefined;
        const parsedNote = splitEntryNote(queued ? queued.note : canonical?.note);
        setRunId(nextRunId);
        setQuantity(queued ? queued.quantity : (canonical?.quantity ?? null));
        setNote(parsedNote.note);
        setReason(parsedNote.reason);
        setBaseUpdatedAt(
            queued
                ? queued.status === 'conflict'
                    ? canonical?.updatedAt || null
                    : queued.expectedUpdatedAt
                : canonical?.updatedAt || null
        );
        setFormDirty(false);
        setRemoteChanged(false);
        setRestoredAt(undefined);
    };
    const useLatestServerValue = () => {
        const parsedNote = splitEntryNote(existingEntry?.note);
        draftSuppressedRef.current = true;
        removeProductionEntryDraft(draftScope);
        setQuantity(existingEntry?.quantity ?? null);
        setNote(parsedNote.note);
        setReason(parsedNote.reason);
        setBaseUpdatedAt(existingEntry?.updatedAt || null);
        setFormDirty(false);
        setRemoteChanged(false);
        setRestoredAt(undefined);
    };
    const keepLocalValue = () => {
        draftSuppressedRef.current = false;
        setBaseUpdatedAt(existingEntry?.updatedAt || null);
        setRemoteChanged(false);
    };
    const slotDurationHours = slot ? Math.max(0, slot.endMinute - slot.startMinute) / 60 : 0;
    const selectedRunTarget = slot?.kind === 'overtime' ? 0 : Number(selectedRun?.hourlyQuota || 0) * slotDurationHours;
    const target = slotValue?.runId === runId ? slotValue.target : selectedRunTarget;
    const actual = quantity ?? 0;
    const achievement = target > 0 ? (actual / target) * 100 : actual > 0 ? 100 : 0;
    const combinedNote = [reason, note.trim()].filter(Boolean).join(' · ').slice(0, 500) || undefined;
    const guardSignals = evaluateProductionEntry({
        quantity,
        target,
        previousQuantity: previousEntry?.quantity,
        existingQuantity: existingEntry?.quantity,
        hasExplanation: Boolean(combinedNote),
    });
    const guardRequiresConfirmation = guardSignals.some((signal) => signal.requiresConfirmation);
    const entryUnchanged =
        !pendingEntry &&
        Boolean(existingEntry) &&
        quantity === existingEntry?.quantity &&
        (combinedNote || '') === (existingEntry?.note || '');
    const persistDraft = useCallback(() => {
        if (draftSuppressedRef.current || !formDirty || readOnly || !actorId || !runId) return;
        saveProductionEntryDraft({
            ...draftScope,
            version: 1,
            runId,
            quantity,
            reason,
            note,
            baseUpdatedAt,
            savedAt: new Date().toISOString(),
        });
    }, [actorId, baseUpdatedAt, draftScope, formDirty, note, quantity, readOnly, reason, runId]);

    useEffect(() => {
        if (!formDirty) return;
        const timer = window.setTimeout(persistDraft, 250);
        return () => window.clearTimeout(timer);
    }, [formDirty, persistDraft]);

    useEffect(() => {
        const onPageHide = () => persistDraft();
        window.addEventListener('pagehide', onPageHide);
        return () => window.removeEventListener('pagehide', onPageHide);
    }, [persistDraft]);

    const handleBack = () => {
        persistDraft();
        onBack();
    };

    const confirmGuardedEntry = () =>
        new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (value: boolean) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            modal.confirm({
                className: 'production-entry-guard-modal',
                centered: true,
                width: 430,
                icon: <WarningFilled />,
                title: 'Kiểm tra lại sản lượng',
                content: (
                    <div className='production-entry-guard-confirm'>
                        <div>
                            <span>
                                {line.lineCode} · {slotRangeLabel(slot) || slotKey}
                            </span>
                            <strong>{number(actual)} SP</strong>
                        </div>
                        <ul>
                            {guardSignals
                                .filter((signal) => signal.requiresConfirmation)
                                .map((signal) => (
                                    <li key={signal.code}>
                                        <strong>{signal.title}</strong>
                                        <span>{signal.detail}</span>
                                    </li>
                                ))}
                        </ul>
                    </div>
                ),
                okText: 'Số liệu đúng, tiếp tục lưu',
                cancelText: 'Quay lại kiểm tra',
                okButtonProps: { danger: true },
                onOk: () => settle(true),
                onCancel: () => settle(false),
                afterClose: () => settle(false),
            });
        });

    const discardPendingEntry = () => {
        modal.confirm({
            title: 'Dùng số liệu đang có trên hệ thống?',
            content: 'Bản chờ trên điện thoại của ô này sẽ bị xóa và không tự đồng bộ lại.',
            okText: 'Dùng số trên hệ thống',
            cancelText: 'Giữ bản đang nhập',
            okButtonProps: { danger: true },
            onOk: onDiscardPending,
        });
    };

    const submit = async () => {
        if (!runId) {
            message.warning('Khung giờ này chưa có mã hàng hoạt động');
            return;
        }
        if (quantity === null || quantity < 0) {
            message.warning('Nhập sản lượng, kể cả khi bằng 0');
            return;
        }
        if (entryUnchanged) {
            message.info('Số liệu chưa có thay đổi');
            return;
        }
        if (guardRequiresConfirmation && !(await confirmGuardedEntry())) return;

        const result = await onSave({
            lineId: line.lineId,
            lineCode: line.lineCode,
            slotKey,
            runId,
            quantity,
            note: combinedNote,
            expectedUpdatedAt: baseUpdatedAt,
            existingOutboxId: pendingEntry?.id,
        });
        if (result !== 'failed') {
            draftSuppressedRef.current = true;
            removeProductionEntryDraft(draftScope);
            setFormDirty(false);
            setRestoredAt(undefined);
        }
    };

    if (!line.configured && !readOnly) {
        const hasPlan = line.runs.some((run) => run.source === 'plan');
        const setupReady = workerCount >= 0 && (hasPlan || (Boolean(nextItemId) && nextQuota !== null));
        return (
            <section className='leader-entry-view'>
                <header className='leader-entry-view__header'>
                    <Button type='text' icon={<ArrowLeftOutlined />} aria-label='Quay lại' onClick={onBack} />
                    <div>
                        <span>Thông tin đầu ngày</span>
                        <strong>{line.lineCode}</strong>
                    </div>
                    <Tag color='gold'>Chưa sẵn sàng</Tag>
                </header>

                <div className='leader-entry-setup'>
                    <div className='leader-entry-setup__intro'>
                        <TeamOutlined />
                        <div>
                            <strong>Xác nhận thông tin chuyền</strong>
                            <span>Chỉ cần thực hiện một lần trước khi nhập sản lượng.</span>
                        </div>
                    </div>
                    <label>
                        <span>Số công nhân hôm nay</span>
                        <InputNumber
                            min={0}
                            max={1000}
                            precision={0}
                            inputMode='numeric'
                            value={workerCount}
                            onChange={(value) => setWorkerCount(Number(value || 0))}
                        />
                    </label>
                    {hasPlan ? (
                        <Alert type='success' showIcon message='Mã hàng và mức khoán đã được quản lý ban hành' />
                    ) : (
                        <>
                            <label>
                                <span>Mã hàng đang chạy</span>
                                <Select
                                    showSearch
                                    optionFilterProp='label'
                                    value={nextItemId || undefined}
                                    placeholder='Chọn mã hàng'
                                    onChange={setNextItemId}
                                    options={items.map((item) => ({
                                        value: item.id,
                                        label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                    }))}
                                />
                            </label>
                            <label>
                                <span>Khoán mỗi giờ</span>
                                <InputNumber
                                    min={0}
                                    precision={0}
                                    inputMode='numeric'
                                    value={nextQuota}
                                    addonAfter='SP/giờ'
                                    onChange={(value) => setNextQuota(value === null ? null : Number(value))}
                                />
                            </label>
                            <label>
                                <span>Bắt đầu từ khung</span>
                                <Select
                                    value={nextSlotKey}
                                    onChange={setNextSlotKey}
                                    options={day.timeSlots
                                        .filter((item) => item.isActive)
                                        .map((item) => ({ value: item.key, label: slotRangeLabel(item) }))}
                                />
                            </label>
                        </>
                    )}
                    {!online ? (
                        <Alert type='warning' showIcon message='Cần kết nối mạng để xác nhận thông tin đầu ngày' />
                    ) : null}
                </div>

                <footer className='leader-entry-view__footer'>
                    <Button
                        type='primary'
                        size='large'
                        block
                        icon={<CheckCircleFilled />}
                        disabled={!setupReady || !online}
                        loading={setupMutation.isPending}
                        onClick={() => setupMutation.mutate()}
                    >
                        Xác nhận và bắt đầu nhập
                    </Button>
                </footer>
            </section>
        );
    }

    return (
        <section className='leader-entry-view'>
            <header className='leader-entry-view__header'>
                <Button type='text' icon={<ArrowLeftOutlined />} aria-label='Quay lại' onClick={handleBack} />
                <div>
                    <span>{slotRangeLabel(slot) || slotKey}</span>
                    <strong>{line.lineCode}</strong>
                </div>
                {pendingEntry ? (
                    <Tag color={pendingEntry.status === 'conflict' ? 'red' : 'gold'} icon={<SyncOutlined />}>
                        {pendingEntry.status === 'conflict' ? 'Cần kiểm tra' : 'Chờ đồng bộ'}
                    </Tag>
                ) : existingEntry ? (
                    <Tag color='green' icon={<CheckCircleFilled />}>
                        Đã báo
                    </Tag>
                ) : (
                    <Tag color='blue'>Đang nhập</Tag>
                )}
            </header>

            <div className='leader-entry-context'>
                <div className='leader-entry-context__item'>
                    <span>Mã hàng</span>
                    <strong>{selectedRun?.itemCode || 'Chưa có mã hàng'}</strong>
                    <small>{selectedRun?.itemName || 'Kiểm tra kế hoạch sản xuất'}</small>
                </div>
                <div className='leader-entry-context__workers'>
                    <span>Nhân sự</span>
                    {editWorkers && !readOnly ? (
                        <div>
                            <InputNumber
                                min={0}
                                max={1000}
                                precision={0}
                                inputMode='numeric'
                                value={workerCount}
                                onChange={(value) => setWorkerCount(Number(value || 0))}
                            />
                            <Button
                                type='primary'
                                icon={<SaveOutlined />}
                                disabled={!online}
                                loading={workerMutation.isPending}
                                onClick={() => workerMutation.mutate()}
                            />
                        </div>
                    ) : (
                        <button type='button' disabled={readOnly} onClick={() => setEditWorkers(true)}>
                            <TeamOutlined />
                            <strong>{line.workerCount}</strong>
                            <small>người</small>
                            {!readOnly ? <EditOutlined /> : null}
                        </button>
                    )}
                </div>
            </div>

            {restoredAt ? (
                <Alert
                    className='leader-entry-draft-alert'
                    type='info'
                    showIcon
                    icon={<HistoryOutlined />}
                    message='Đã khôi phục bản nhập dở'
                    description={`Lưu trên điện thoại lúc ${new Date(restoredAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}`}
                />
            ) : null}

            {pendingEntry?.status === 'conflict' ? (
                <Alert
                    type='warning'
                    showIcon
                    message='Ô này đã được cập nhật từ thiết bị khác'
                    description={
                        readOnly
                            ? 'Ngày đã chốt nên bản chờ trên điện thoại không thể ghi đè. Dùng số trên hệ thống để kết thúc cảnh báo.'
                            : 'Số trên server đã được giữ nguyên. Kiểm tra lại rồi bấm lưu nếu bạn muốn dùng số đang nhập.'
                    }
                    action={
                        <Button size='small' danger onClick={discardPendingEntry}>
                            Dùng số trên hệ thống
                        </Button>
                    }
                />
            ) : null}

            {remoteChanged ? (
                <Alert
                    type='warning'
                    showIcon
                    message='Thiết bị khác vừa cập nhật số liệu này'
                    description='Số bạn đang gõ vẫn được giữ. Hãy chọn dữ liệu muốn tiếp tục trước khi lưu.'
                    action={
                        <div className='leader-entry-conflict-actions'>
                            <Button size='small' onClick={useLatestServerValue}>
                                Lấy số mới
                            </Button>
                            <Button size='small' type='primary' onClick={keepLocalValue}>
                                Giữ số đang nhập
                            </Button>
                        </div>
                    }
                />
            ) : null}

            {readOnly ? (
                <div className='leader-entry-readonly'>
                    <CheckCircleFilled />
                    <span>Số liệu ngày này đã được chốt</span>
                    <strong>{existingEntry ? `${number(existingEntry.quantity)} SP` : 'Chưa báo sản lượng'}</strong>
                    {existingEntry?.enteredByName ? (
                        <small>
                            Nhập bởi {existingEntry.enteredByName}
                            {existingEntry.updatedAt
                                ? ` · ${new Date(existingEntry.updatedAt).toLocaleString('vi-VN')}`
                                : ''}
                        </small>
                    ) : null}
                </div>
            ) : eligibleRuns.length ? (
                <>
                    <div className='leader-entry-quantity'>
                        <div className='leader-entry-quantity__head'>
                            <span>Sản lượng trong giờ</span>
                            <strong>
                                {target > 0
                                    ? `Khoán ${number(target)} SP`
                                    : slot?.kind === 'overtime'
                                      ? 'Không tính khoán'
                                      : 'Chưa có mức khoán'}
                            </strong>
                        </div>
                        {eligibleRuns.length > 1 ? (
                            <Select
                                value={runId}
                                onChange={selectRun}
                                options={eligibleRuns.map((run) => ({
                                    value: run.id,
                                    label: `${run.itemCode}${run.itemName ? ` · ${run.itemName}` : ''}`,
                                }))}
                            />
                        ) : null}
                        <InputNumber
                            min={0}
                            max={100000000}
                            precision={0}
                            controls={false}
                            inputMode='numeric'
                            value={quantity}
                            placeholder='0'
                            addonAfter='SP'
                            onChange={(value) => changeQuantity(value === null ? null : Number(value))}
                        />
                        <div className='leader-entry-benchmarks'>
                            <div>
                                <span>Khoán</span>
                                <strong>{target ? `${number(target)} SP` : 'Không áp dụng'}</strong>
                            </div>
                            <div>
                                <span>Giờ trước</span>
                                <strong>{previousEntry ? `${number(previousEntry.quantity)} SP` : 'Chưa có số'}</strong>
                                {previousSlot ? <small>{slotRangeLabel(previousSlot)}</small> : null}
                            </div>
                            <div>
                                <span>Trên server</span>
                                <strong>{existingEntry ? `${number(existingEntry.quantity)} SP` : 'Chưa báo'}</strong>
                            </div>
                        </div>
                        <div className='leader-entry-quantity__steps'>
                            {target > 0 ? (
                                <button
                                    type='button'
                                    className='is-quota'
                                    onClick={() => changeQuantity(Math.round(target))}
                                >
                                    Đạt khoán
                                </button>
                            ) : null}
                            {[10, 50, 100].map((step) => (
                                <button key={step} type='button' onClick={() => adjustQuantity(step)}>
                                    +{step}
                                </button>
                            ))}
                            <button type='button' aria-label='Đặt về 0' onClick={() => changeQuantity(0)}>
                                0
                            </button>
                        </div>
                        <div className='leader-entry-achievement'>
                            <span>
                                <i style={{ width: `${Math.min(100, Math.round(achievement))}%` }} />
                            </span>
                            <small>
                                {target > 0
                                    ? achievement >= 100
                                        ? `Vượt ${number(Math.max(0, actual - target))} SP`
                                        : `Còn ${number(Math.max(0, target - actual))} SP để đạt khoán`
                                    : slot?.kind === 'overtime'
                                      ? 'Khung tăng ca không tính khoán'
                                      : 'Chưa cấu hình mức khoán cho mã hàng này'}
                            </small>
                        </div>
                        {guardSignals.length ? (
                            <div
                                className={`leader-entry-guard ${guardRequiresConfirmation ? 'is-critical' : 'is-advisory'}`}
                                role='status'
                            >
                                <WarningFilled />
                                <div>
                                    {guardSignals.map((signal) => (
                                        <span key={signal.code}>
                                            <strong>{signal.title}</strong>
                                            <small>{signal.detail}</small>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className='leader-entry-reason'>
                        <span>Nguyên nhân hoặc ghi chú</span>
                        <div>
                            {REASONS.map((item) => (
                                <button
                                    key={item}
                                    type='button'
                                    className={reason === item ? 'is-selected' : ''}
                                    onClick={() => {
                                        draftSuppressedRef.current = false;
                                        setReason((current) => (current === item ? '' : item));
                                        setFormDirty(true);
                                    }}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <Input.TextArea
                            rows={2}
                            maxLength={500}
                            value={note}
                            placeholder='Ghi thêm nếu cần...'
                            onChange={(event) => {
                                draftSuppressedRef.current = false;
                                setNote(event.target.value);
                                setFormDirty(true);
                            }}
                        />
                    </div>
                </>
            ) : (
                <Alert
                    type='warning'
                    showIcon
                    icon={<WarningFilled />}
                    message='Khung giờ này chưa có mã hàng hoạt động'
                    description='Mở mục đổi mã hàng để chọn mã và mức khoán áp dụng.'
                    action={<Button onClick={() => setShowChangeRun(true)}>Chọn mã</Button>}
                />
            )}

            {!readOnly ? (
                <>
                    <button
                        type='button'
                        className='leader-entry-change-run'
                        disabled={!online}
                        onClick={() => setShowChangeRun((current) => !current)}
                    >
                        <RetweetOutlined />
                        <span>
                            <strong>Đổi mã hàng hoặc mức khoán</strong>
                            <small>Áp dụng từ một khung giờ, số cũ được giữ nguyên</small>
                        </span>
                    </button>

                    {showChangeRun ? (
                        <div className='leader-entry-change-run-form'>
                            <label>
                                <span>Mã hàng</span>
                                <Select
                                    showSearch
                                    optionFilterProp='label'
                                    value={nextItemId || undefined}
                                    onChange={setNextItemId}
                                    options={items.map((item) => ({
                                        value: item.id,
                                        label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                    }))}
                                />
                            </label>
                            <label>
                                <span>Khoán mỗi giờ</span>
                                <InputNumber
                                    min={0}
                                    precision={0}
                                    inputMode='numeric'
                                    value={nextQuota}
                                    addonAfter='SP/giờ'
                                    onChange={(value) => setNextQuota(value === null ? null : Number(value))}
                                />
                            </label>
                            <label>
                                <span>Áp dụng từ</span>
                                <Select
                                    value={nextSlotKey}
                                    onChange={setNextSlotKey}
                                    options={day.timeSlots
                                        .filter((item) => item.isActive)
                                        .map((item) => ({ value: item.key, label: slotRangeLabel(item) }))}
                                />
                            </label>
                            <Button
                                type='primary'
                                block
                                icon={<RetweetOutlined />}
                                disabled={!nextItemId || nextQuota === null || !online}
                                loading={runMutation.isPending}
                                onClick={() => runMutation.mutate()}
                            >
                                Áp dụng mã và khoán mới
                            </Button>
                        </div>
                    ) : null}
                </>
            ) : null}

            {!readOnly && eligibleRuns.length ? (
                <footer className='leader-entry-view__footer'>
                    <Button
                        type='primary'
                        size='large'
                        block
                        icon={pendingEntry ? <SyncOutlined /> : <SaveOutlined />}
                        loading={saving}
                        disabled={remoteChanged || entryUnchanged}
                        onClick={() => void submit()}
                    >
                        {remoteChanged
                            ? 'Chọn dữ liệu trước khi lưu'
                            : entryUnchanged
                              ? 'Số liệu chưa thay đổi'
                              : guardRequiresConfirmation
                                ? 'Kiểm tra và lưu'
                                : 'Lưu và sang chuyền tiếp'}
                    </Button>
                    <small>
                        {navigator.onLine
                            ? 'Dữ liệu được đồng bộ ngay với màn hình quản lý'
                            : 'Đang mất mạng · dữ liệu sẽ lưu trên điện thoại và tự đồng bộ'}
                    </small>
                </footer>
            ) : null}
        </section>
    );
};

export default ProductionLeaderEntryView;
