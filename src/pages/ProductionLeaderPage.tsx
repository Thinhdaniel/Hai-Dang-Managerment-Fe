import {
    CheckCircleFilled,
    ClockCircleOutlined,
    CloudOutlined,
    CloudSyncOutlined,
    ExclamationCircleFilled,
    ReloadOutlined,
    SearchOutlined,
    SyncOutlined,
    TeamOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, DatePicker, Empty, Input, Segmented, Skeleton, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductionLeaderEntryView, {
    type LeaderEntrySaveInput,
} from '../components/production/ProductionLeaderEntryView';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import {
    createProductionMutationId,
    listProductionOutbox,
    putProductionOutbox,
    removeProductionOutbox,
    subscribeProductionOutbox,
    updateProductionOutbox,
    type ProductionEntryOutboxItem,
} from '../core/lib/productionOutbox';
import { slotRangeLabel, slotRangeLabelShort } from '../core/lib/productionSlot';
import { productionService } from '../core/services/production.service';
import type { ProductionDay, ProductionLineRecord, ProductionTimeSlot } from '../core/types/production';
import '../styles/production-leader.css';

type FilterMode = 'missing' | 'reported' | 'all';
type SaveResult = 'synced' | 'queued' | 'conflict' | 'failed';

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) =>
    typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Không thể cập nhật sản lượng';
const errorStatus = (error: unknown) =>
    typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;

const getSlotValue = (line: ProductionLineRecord, slotKey: string) =>
    line.slotValues.find((slot) => slot.key === slotKey);

const selectDefaultSlot = (slots: ProductionTimeSlot[], date: Dayjs) => {
    const active = slots.filter((slot) => slot.isActive).sort((left, right) => left.startMinute - right.startMinute);
    if (!active.length) return '';
    if (date.isBefore(dayjs(), 'day')) return active[active.length - 1].key;
    if (date.isAfter(dayjs(), 'day')) return active[0].key;
    const minute = dayjs().hour() * 60 + dayjs().minute();
    return (
        active.find((slot) => minute >= slot.startMinute && minute < slot.endMinute)?.key ||
        [...active].reverse().find((slot) => slot.startMinute <= minute)?.key ||
        active[0].key
    );
};

const cellKey = (lineId: string, slotKey: string) => `${lineId}:${slotKey}`;

const latestOutboxByCell = (items: ProductionEntryOutboxItem[]) => {
    const result = new Map<string, ProductionEntryOutboxItem>();
    items.forEach((item) => {
        const key = cellKey(item.lineId, item.slotKey);
        const current = result.get(key);
        if (!current || current.updatedAt < item.updatedAt) result.set(key, item);
    });
    return result;
};

const ProductionLeaderPage = () => {
    const { message, modal } = App.useApp();
    const { user } = useAuth();
    const { socket } = useSocket();
    const queryClient = useQueryClient();
    const [date, setDate] = useState<Dayjs>(dayjs());
    const [slotKey, setSlotKey] = useState('');
    const [filter, setFilter] = useState<FilterMode>('missing');
    const [search, setSearch] = useState('');
    const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
    const [online, setOnline] = useState(() => navigator.onLine);
    const [outbox, setOutbox] = useState<ProductionEntryOutboxItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [flushing, setFlushing] = useState(false);
    const [receipt, setReceipt] = useState<{ mode: 'synced' | 'queued'; text: string }>();
    const flushingRef = useRef(false);
    const syncFailureNotifiedRef = useRef(false);
    const slotRailRef = useRef<HTMLDivElement>(null);
    const actorId = user?.id || '';
    const plantId = user?.plantId || '';
    const productionDate = date.format('YYYY-MM-DD');
    const retryableOutboxCount = outbox.filter((item) => item.status === 'pending' || item.status === 'syncing').length;

    const dayQuery = useQuery({
        queryKey: ['production', 'day', plantId, productionDate],
        queryFn: () => productionService.lookupDay(plantId, productionDate),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });

    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, false],
        queryFn: () => productionService.getItems(plantId),
        enabled: Boolean(plantId),
        staleTime: 5 * 60 * 1000,
    });

    const createDayMutation = useMutation({
        mutationFn: () => productionService.createDay({ plantId, productionDate }),
        onSuccess: async () => {
            message.success('Đã khởi tạo ngày sản xuất');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const reloadOutbox = useCallback(async () => {
        const entries = await listProductionOutbox();
        setOutbox(entries.filter((item) => item.actorId === actorId && item.plantId === plantId));
    }, [actorId, plantId]);

    useEffect(() => {
        void reloadOutbox();
        return subscribeProductionOutbox(() => void reloadOutbox());
    }, [reloadOutbox]);

    useEffect(() => {
        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        if (!socket) return;
        const onUpdate = (payload: { plantId: string; productionDate: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        };
        socket.on('production:updated', onUpdate);
        return () => {
            socket.off('production:updated', onUpdate);
        };
    }, [plantId, productionDate, queryClient, socket]);

    const activeSlots = useMemo(
        () =>
            (dayQuery.data?.timeSlots || [])
                .filter((slot) => slot.isActive)
                .sort((left, right) => left.startMinute - right.startMinute),
        [dayQuery.data?.timeSlots]
    );

    useEffect(() => {
        if (!activeSlots.length) {
            setSlotKey('');
            return;
        }
        if (!activeSlots.some((slot) => slot.key === slotKey)) {
            setSlotKey(selectDefaultSlot(activeSlots, date));
        }
    }, [activeSlots, date, slotKey]);

    useEffect(() => {
        if (!slotKey) return;
        const frame = requestAnimationFrame(() => {
            slotRailRef.current
                ?.querySelector<HTMLElement>('.leader-slot.is-selected')
                ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [slotKey]);

    const flushOutbox = useCallback(
        async (force = false) => {
            if (!online || !actorId || flushingRef.current) return;
            flushingRef.current = true;
            setFlushing(true);
            const synchronizedDates = new Set<string>();
            let flushFailed = false;
            try {
                const now = Date.now();
                const entries = (await listProductionOutbox()).filter(
                    (item) =>
                        item.actorId === actorId &&
                        item.plantId === plantId &&
                        item.status !== 'conflict' &&
                        (force ||
                            item.status === 'syncing' ||
                            !item.nextRetryAt ||
                            !Number.isFinite(new Date(item.nextRetryAt).getTime()) ||
                            new Date(item.nextRetryAt).getTime() <= now)
                );
                for (const item of entries) {
                    const attempts = item.attempts + 1;
                    await updateProductionOutbox(item.id, {
                        status: 'syncing',
                        attempts,
                        updatedAt: new Date().toISOString(),
                        nextRetryAt: undefined,
                        lastError: undefined,
                    });
                    try {
                        await productionService.saveEntry(item.dayId, item.lineId, item.slotKey, {
                            runId: item.runId,
                            quantity: item.quantity,
                            note: item.note,
                            clientMutationId: item.id,
                            expectedUpdatedAt: item.expectedUpdatedAt,
                        });
                        await removeProductionOutbox(item.id);
                        synchronizedDates.add(item.productionDate);
                    } catch (error) {
                        const status = errorStatus(error);
                        const permanentClientError =
                            status !== undefined && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
                        if (permanentClientError) {
                            await updateProductionOutbox(item.id, {
                                status: 'conflict',
                                attempts,
                                updatedAt: new Date().toISOString(),
                                nextRetryAt: undefined,
                                lastError: errorMessage(error),
                            });
                            continue;
                        }
                        const retryDelayMs = Math.min(5 * 60_000, 15_000 * 2 ** Math.min(attempts - 1, 5));
                        await updateProductionOutbox(item.id, {
                            status: 'pending',
                            attempts,
                            updatedAt: new Date().toISOString(),
                            nextRetryAt: new Date(Date.now() + retryDelayMs).toISOString(),
                            lastError: errorMessage(error),
                        });
                        break;
                    }
                }
            } catch (error) {
                flushFailed = true;
                if (!syncFailureNotifiedRef.current) {
                    syncFailureNotifiedRef.current = true;
                    message.error(`Không thể xử lý hàng đợi trên thiết bị: ${errorMessage(error)}`);
                }
            } finally {
                if (!flushFailed) syncFailureNotifiedRef.current = false;
                if (synchronizedDates.size) {
                    await Promise.all(
                        [...synchronizedDates].map((dateValue) =>
                            queryClient.invalidateQueries({
                                queryKey: ['production', 'day', plantId, dateValue],
                            })
                        )
                    );
                }
                await reloadOutbox();
                setFlushing(false);
                flushingRef.current = false;
            }
        },
        [actorId, message, online, plantId, queryClient, reloadOutbox]
    );

    useEffect(() => {
        if (!online || retryableOutboxCount === 0) return;
        void flushOutbox(true);
    }, [flushOutbox, online, retryableOutboxCount]);

    useEffect(() => {
        if (!online) return;
        const timer = window.setInterval(() => void flushOutbox(), 15_000);
        return () => window.clearInterval(timer);
    }, [flushOutbox, online]);

    const scopedOutbox = useMemo(
        () =>
            outbox.filter(
                (item) => item.actorId === actorId && item.plantId === plantId && item.productionDate === productionDate
            ),
        [actorId, outbox, plantId, productionDate]
    );
    const outboxByCell = useMemo(() => latestOutboxByCell(scopedOutbox), [scopedOutbox]);
    const day = dayQuery.data;
    const selectedSlot = activeSlots.find((slot) => slot.key === slotKey);
    const nowMinute = dayjs().hour() * 60 + dayjs().minute();
    const isToday = date.isSame(dayjs(), 'day');
    const selectedSlotStarted =
        date.isBefore(dayjs(), 'day') || (isToday && Boolean(selectedSlot) && selectedSlot!.startMinute <= nowMinute);

    const lineState = useCallback(
        (line: ProductionLineRecord) => {
            const canonical = getSlotValue(line, slotKey);
            const queued = outboxByCell.get(cellKey(line.lineId, slotKey));
            const due = !line.configured || Boolean(canonical?.runId);
            const reported = Boolean(canonical?.reported);
            return {
                canonical,
                queued,
                due,
                effectiveReported: reported || Boolean(queued && queued.status !== 'conflict'),
                effectiveActual: queued ? queued.quantity : Number(canonical?.actual || 0),
                conflict: queued?.status === 'conflict',
                pending: Boolean(queued && queued.status !== 'conflict'),
            };
        },
        [outboxByCell, slotKey]
    );

    const lines = useMemo(() => day?.lines || [], [day?.lines]);
    const missingLines = useMemo(
        () => lines.filter((line) => lineState(line).due && !lineState(line).effectiveReported),
        [lineState, lines]
    );
    const dueLines = useMemo(() => lines.filter((line) => lineState(line).due), [lineState, lines]);
    const reportedCount = dueLines.filter((line) => lineState(line).canonical?.reported).length;
    const pendingCount = scopedOutbox.filter((item) => item.status === 'pending' || item.status === 'syncing').length;
    const currentPendingCount = dueLines.filter((line) => {
        const state = lineState(line);
        return state.pending && !state.canonical?.reported;
    }).length;
    const effectiveReportedCount = dueLines.filter((line) => lineState(line).effectiveReported).length;
    const conflictCount = scopedOutbox.filter((item) => item.status === 'conflict').length;
    const allConflictEntries = outbox.filter((item) => item.status === 'conflict');
    const allConflictCount = allConflictEntries.length;
    const otherConflictEntry = allConflictEntries.find((item) => item.productionDate !== productionDate);
    const conflictEntryAction = otherConflictEntry || allConflictEntries[0];
    const inaccessibleCurrentConflict =
        conflictEntryAction?.productionDate === productionDate &&
        dayQuery.isFetched &&
        !lines.some((line) => line.lineId === conflictEntryAction.lineId);

    const handleConflictAction = () => {
        if (!conflictEntryAction) return;
        if (inaccessibleCurrentConflict) {
            modal.confirm({
                title: 'Bỏ bản chờ không còn đối tượng?',
                content: 'Chuyền của bản ghi này không còn trong ngày sản xuất nên hệ thống không thể đồng bộ lại.',
                okText: 'Bỏ bản chờ',
                cancelText: 'Giữ lại',
                okButtonProps: { danger: true },
                onOk: async () => {
                    await removeProductionOutbox(conflictEntryAction.id);
                    await reloadOutbox();
                    message.success('Đã bỏ bản chờ không còn hợp lệ');
                },
            });
            return;
        }
        setDate(dayjs(conflictEntryAction.productionDate));
        setSlotKey(conflictEntryAction.slotKey);
        setSelectedLineId(conflictEntryAction.lineId);
    };

    const visibleLines = useMemo(() => {
        const normalized = search.trim().toLocaleLowerCase('vi-VN');
        const filtered = lines.filter((line) => {
            const state = lineState(line);
            if (filter === 'missing' && (!state.due || state.effectiveReported)) return false;
            if (filter === 'reported' && !state.effectiveReported) return false;
            if (
                normalized &&
                ![line.lineCode, line.lineName, ...line.runs.map((run) => run.itemCode)]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase('vi-VN')
                    .includes(normalized)
            ) {
                return false;
            }
            return true;
        });
        return filtered.sort((left, right) => {
            const leftState = lineState(left);
            const rightState = lineState(right);
            const rank = (state: ReturnType<typeof lineState>) =>
                state.conflict ? 0 : !state.effectiveReported ? 1 : state.pending ? 2 : 3;
            return rank(leftState) - rank(rightState) || left.sortOrder - right.sortOrder;
        });
    }, [filter, lineState, lines, search]);

    const selectedLine = lines.find((line) => line.lineId === selectedLineId);
    const selectedPending = selectedLine ? outboxByCell.get(cellKey(selectedLine.lineId, slotKey)) : undefined;

    const advanceAfterSave = (lineId: string) => {
        const next = missingLines.find((line) => line.lineId !== lineId);
        if (next) {
            setSelectedLineId(next.lineId);
            return;
        }
        setSelectedLineId(null);
        setFilter('reported');
        message.success(`Đã hoàn tất các chuyền cần nhập trong khung ${slotRangeLabel(selectedSlot)}`);
    };

    const saveEntry = async (input: LeaderEntrySaveInput): Promise<SaveResult> => {
        const mutationId = input.existingOutboxId || createProductionMutationId();
        const now = new Date().toISOString();
        const queuedItem: ProductionEntryOutboxItem = {
            id: mutationId,
            actorId,
            plantId,
            productionDate,
            dayId: day!.id,
            lineId: input.lineId,
            lineCode: input.lineCode,
            slotKey: input.slotKey,
            runId: input.runId,
            quantity: input.quantity,
            note: input.note,
            expectedUpdatedAt: input.expectedUpdatedAt,
            status: 'pending',
            attempts: 0,
            createdAt: selectedPending?.createdAt || now,
            updatedAt: now,
        };

        setSaving(true);
        try {
            if (!online) {
                await putProductionOutbox(queuedItem);
                await reloadOutbox();
                setReceipt({
                    mode: 'queued',
                    text: `${number(input.quantity)} SP · ${input.lineCode} · ${slotRangeLabel(selectedSlot)}`,
                });
                advanceAfterSave(input.lineId);
                return 'queued';
            }

            try {
                await productionService.saveEntry(day!.id, input.lineId, input.slotKey, {
                    runId: input.runId,
                    quantity: input.quantity,
                    note: input.note,
                    clientMutationId: mutationId,
                    expectedUpdatedAt: input.expectedUpdatedAt,
                });
                if (input.existingOutboxId) await removeProductionOutbox(input.existingOutboxId);
                await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
                await reloadOutbox();
                setReceipt({
                    mode: 'synced',
                    text: `${number(input.quantity)} SP · ${input.lineCode} · ${slotRangeLabel(selectedSlot)}`,
                });
                advanceAfterSave(input.lineId);
                return 'synced';
            } catch (error) {
                const status = errorStatus(error);
                if (status === 409) {
                    await putProductionOutbox({
                        ...queuedItem,
                        status: 'conflict',
                        lastError: errorMessage(error),
                    });
                    await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
                    await reloadOutbox();
                    message.warning('Dữ liệu vừa được nhập từ thiết bị khác. Kiểm tra lại số trước khi lưu.');
                    return 'conflict';
                }
                if (!navigator.onLine || status === undefined || status >= 500 || status === 408 || status === 429) {
                    await putProductionOutbox({
                        ...queuedItem,
                        lastError: errorMessage(error),
                    });
                    await reloadOutbox();
                    setReceipt({
                        mode: 'queued',
                        text: `${number(input.quantity)} SP · ${input.lineCode} · ${slotRangeLabel(selectedSlot)}`,
                    });
                    advanceAfterSave(input.lineId);
                    return 'queued';
                }
                message.error(errorMessage(error));
                return 'failed';
            }
        } catch (error) {
            message.error(errorMessage(error));
            return 'failed';
        } finally {
            setSaving(false);
        }
    };

    const slotRemainingMinutes =
        selectedSlot && isToday && nowMinute >= selectedSlot.startMinute && nowMinute < selectedSlot.endMinute
            ? selectedSlot.endMinute - nowMinute
            : undefined;
    const completionPercent = dueLines.length ? (effectiveReportedCount / dueLines.length) * 100 : 0;

    if (selectedLine && day) {
        return (
            <ProductionLeaderEntryView
                actorId={actorId}
                day={day}
                line={selectedLine}
                slotKey={slotKey}
                items={itemsQuery.data || []}
                pendingEntry={selectedPending}
                online={online}
                saving={saving}
                onBack={() => setSelectedLineId(null)}
                onRefresh={async () => {
                    await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
                }}
                onDiscardPending={async () => {
                    if (!selectedPending) return;
                    await removeProductionOutbox(selectedPending.id);
                    await reloadOutbox();
                    await queryClient.invalidateQueries({
                        queryKey: ['production', 'day', plantId, productionDate],
                    });
                    setSelectedLineId(null);
                    message.success('Đã dùng số liệu mới nhất trên hệ thống');
                }}
                onSave={saveEntry}
            />
        );
    }

    return (
        <div className='leader-workspace'>
            <header className='leader-workspace__header'>
                <div>
                    <span>BÁO SẢN LƯỢNG</span>
                    <strong>{user?.plant?.name || 'Cơ sở sản xuất'}</strong>
                </div>
                <div className='leader-workspace__header-actions'>
                    <DatePicker
                        value={date}
                        allowClear={false}
                        format='DD/MM'
                        inputReadOnly
                        disabledDate={(current) => Boolean(current?.isAfter(dayjs(), 'day'))}
                        onChange={(value) => {
                            setDate(value || dayjs());
                            setSlotKey('');
                            setSelectedLineId(null);
                        }}
                    />
                    <Button
                        icon={<ReloadOutlined spin={dayQuery.isFetching || flushing} />}
                        aria-label='Tải lại'
                        onClick={() => {
                            void dayQuery.refetch();
                            void flushOutbox(true);
                        }}
                    />
                </div>
            </header>

            <div
                className={`leader-sync-strip ${!online ? 'is-offline' : allConflictCount ? 'is-conflict' : retryableOutboxCount ? 'is-pending' : 'is-synced'}`}
                aria-live='polite'
            >
                {!online ? (
                    <>
                        <CloudOutlined />
                        <span>Mất kết nối · vẫn có thể nhập, dữ liệu được giữ trên điện thoại</span>
                    </>
                ) : allConflictCount ? (
                    <>
                        <ExclamationCircleFilled />
                        <span>
                            {allConflictCount} bản ghi cần kiểm tra
                            {otherConflictEntry
                                ? ` · có dữ liệu ngày ${dayjs(otherConflictEntry.productionDate).format('DD/MM')}`
                                : ' do thiết bị khác đã cập nhật'}
                        </span>
                        {conflictEntryAction ? (
                            <button type='button' className='leader-sync-strip__action' onClick={handleConflictAction}>
                                {inaccessibleCurrentConflict ? 'Bỏ bản' : 'Mở'}
                            </button>
                        ) : null}
                    </>
                ) : retryableOutboxCount || flushing ? (
                    <>
                        <CloudSyncOutlined spin={flushing} />
                        <span>
                            {flushing
                                ? 'Đang đồng bộ dữ liệu...'
                                : pendingCount
                                  ? `${pendingCount} bản ghi đang chờ đồng bộ`
                                  : `${retryableOutboxCount} bản ghi ngày khác đang chờ đồng bộ`}
                        </span>
                    </>
                ) : (
                    <>
                        <WifiOutlined />
                        <span>
                            Đã đồng bộ
                            {day?.dataAsOf ? ` · ${dayjs(day.dataAsOf).format('HH:mm')}` : ''}
                        </span>
                    </>
                )}
            </div>

            {receipt ? (
                <div className={`leader-receipt is-${receipt.mode}`} role='status'>
                    {receipt.mode === 'synced' ? <CheckCircleFilled /> : <CloudSyncOutlined />}
                    <div>
                        <strong>{receipt.mode === 'synced' ? 'Đã lưu lên hệ thống' : 'Đã lưu trên điện thoại'}</strong>
                        <span>{receipt.text}</span>
                    </div>
                    <button type='button' aria-label='Đóng thông báo' onClick={() => setReceipt(undefined)}>
                        ×
                    </button>
                </div>
            ) : null}

            {!plantId ? (
                <Alert
                    type='error'
                    showIcon
                    message='Tài khoản chưa được gắn cơ sở'
                    description='Quản trị viên cần gắn đúng cơ sở trước khi tổ trưởng nhập sản lượng.'
                />
            ) : dayQuery.isLoading ? (
                <div className='leader-workspace__loading'>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            ) : dayQuery.isError && !day ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được dữ liệu sản xuất'
                    description={errorMessage(dayQuery.error)}
                    action={<Button onClick={() => dayQuery.refetch()}>Thử lại</Button>}
                />
            ) : !day && !online ? (
                <section className='leader-empty-day'>
                    <CloudOutlined />
                    <strong>Chưa có dữ liệu ngày này trên điện thoại</strong>
                    <span>Kết nối mạng để tải ngày sản xuất trước khi bắt đầu nhập.</span>
                </section>
            ) : !day ? (
                <section className='leader-empty-day'>
                    <ClockCircleOutlined />
                    <strong>Ngày sản xuất chưa được khởi tạo</strong>
                    <span>Khởi tạo ngày để tải danh sách chuyền và bắt đầu nhập số theo giờ.</span>
                    <Button
                        type='primary'
                        size='large'
                        loading={createDayMutation.isPending}
                        disabled={!plantId || !online}
                        onClick={() => createDayMutation.mutate()}
                    >
                        Bắt đầu ngày sản xuất
                    </Button>
                </section>
            ) : !day.lines.length ? (
                <Empty description='Cơ sở chưa có danh mục chuyền sản xuất' />
            ) : (
                <>
                    <section className='leader-current-slot'>
                        <div className='leader-current-slot__top'>
                            <div>
                                <span>{isToday && selectedSlotStarted ? 'KHUNG ĐANG THEO DÕI' : 'KHUNG ĐÃ CHỌN'}</span>
                                <strong>{slotRangeLabel(selectedSlot) || 'Chưa có khung giờ'}</strong>
                            </div>
                            {slotRemainingMinutes !== undefined && slotRemainingMinutes > 0 ? (
                                <Tag color={slotRemainingMinutes <= 10 ? 'orange' : 'blue'}>
                                    Còn {slotRemainingMinutes} phút
                                </Tag>
                            ) : null}
                        </div>
                        <div className='leader-current-slot__numbers'>
                            <div>
                                <strong>{reportedCount}</strong>
                                <span>Đã lên server</span>
                            </div>
                            <div>
                                <strong>{currentPendingCount}</strong>
                                <span>Chờ đồng bộ</span>
                            </div>
                            <div className={missingLines.length ? 'is-missing' : 'is-complete'}>
                                <strong>{missingLines.length}</strong>
                                <span>Còn thiếu</span>
                            </div>
                        </div>
                        <div className='leader-current-slot__progress'>
                            <span>
                                <i style={{ width: `${Math.min(100, completionPercent)}%` }} />
                            </span>
                            <small>
                                {dueLines.length
                                    ? `${effectiveReportedCount}/${dueLines.length} chuyền đã được nhập`
                                    : 'Khung giờ này chưa có chuyền cần báo'}
                            </small>
                        </div>
                        {missingLines.length && day.status === 'draft' ? (
                            <Button
                                type='primary'
                                size='large'
                                block
                                onClick={() => setSelectedLineId(missingLines[0].lineId)}
                            >
                                Nhập lần lượt {missingLines.length} chuyền
                            </Button>
                        ) : null}
                    </section>

                    <div className='leader-slot-rail' ref={slotRailRef}>
                        {activeSlots.map((slot) => {
                            const summary = day.slotSummaries.find((item) => item.key === slot.key);
                            const effectiveReported = lines.filter((line) => {
                                const canonical = getSlotValue(line, slot.key);
                                if (!line.configured || !canonical?.runId) return false;
                                const queued = outboxByCell.get(cellKey(line.lineId, slot.key));
                                return canonical.reported || Boolean(queued && queued.status !== 'conflict');
                            }).length;
                            const totalLines = Number(summary?.totalLines || 0);
                            const complete = totalLines > 0 && effectiveReported >= totalLines;
                            const current = isToday && nowMinute >= slot.startMinute && nowMinute < slot.endMinute;
                            return (
                                <button
                                    key={slot.key}
                                    type='button'
                                    className={[
                                        'leader-slot',
                                        slot.key === slotKey ? 'is-selected' : '',
                                        current ? 'is-current' : '',
                                        complete ? 'is-complete' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    onClick={() => {
                                        setSlotKey(slot.key);
                                        setSelectedLineId(null);
                                        setFilter('missing');
                                    }}
                                >
                                    <strong>{slotRangeLabelShort(slot)}</strong>
                                    <span>
                                        {complete ? (
                                            <>
                                                <CheckCircleFilled /> Đủ
                                            </>
                                        ) : (
                                            `${effectiveReported}/${totalLines}`
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <section className='leader-line-section'>
                        <div className='leader-line-tools'>
                            <Segmented<FilterMode>
                                block
                                value={filter}
                                onChange={setFilter}
                                options={[
                                    { value: 'missing', label: `Cần nhập ${missingLines.length}` },
                                    {
                                        value: 'reported',
                                        label: `Đã nhập ${dueLines.filter((line) => lineState(line).effectiveReported).length}`,
                                    },
                                    { value: 'all', label: 'Tất cả' },
                                ]}
                            />
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                value={search}
                                placeholder='Tìm chuyền hoặc mã hàng'
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>

                        <div className='leader-line-list'>
                            {visibleLines.length ? (
                                visibleLines.map((line) => {
                                    const state = lineState(line);
                                    const run =
                                        line.runs.find(
                                            (item) => item.id === (state.queued?.runId || state.canonical?.runId)
                                        ) || [...line.runs].reverse()[0];
                                    const slotDurationHours = selectedSlot
                                        ? Math.max(0, selectedSlot.endMinute - selectedSlot.startMinute) / 60
                                        : 0;
                                    const runTarget =
                                        selectedSlot?.kind === 'overtime'
                                            ? 0
                                            : Number(run?.hourlyQuota || 0) * slotDurationHours;
                                    const target =
                                        state.queued?.runId && state.queued.runId !== state.canonical?.runId
                                            ? runTarget
                                            : state.canonical?.target || runTarget;
                                    const percent = target > 0 ? (state.effectiveActual / target) * 100 : 0;
                                    const lastEntry = [...line.entries]
                                        .reverse()
                                        .find((entry) => entry.slotKey === slotKey);
                                    const tone = state.conflict
                                        ? 'conflict'
                                        : state.pending
                                          ? 'pending'
                                          : state.effectiveReported
                                            ? percent >= 95
                                                ? 'success'
                                                : 'warning'
                                            : state.due
                                              ? 'missing'
                                              : 'idle';
                                    return (
                                        <article key={line.lineId} className={`leader-line-row tone-${tone}`}>
                                            <button
                                                type='button'
                                                className='leader-line-row__main'
                                                onClick={() => setSelectedLineId(line.lineId)}
                                            >
                                                <div className='leader-line-row__identity'>
                                                    <span>{line.lineCode}</span>
                                                    <div>
                                                        <strong>{run?.itemCode || 'Chưa chọn mã hàng'}</strong>
                                                        <small>
                                                            <TeamOutlined />{' '}
                                                            {line.workerCountConfirmed
                                                                ? `${line.workerCount} công nhân`
                                                                : 'Chưa xác nhận nhân sự'}
                                                        </small>
                                                    </div>
                                                </div>
                                                <div className='leader-line-row__status'>
                                                    {state.conflict ? (
                                                        <span>
                                                            <ExclamationCircleFilled /> Kiểm tra
                                                        </span>
                                                    ) : state.pending ? (
                                                        <span>
                                                            <CloudSyncOutlined /> Chờ đồng bộ
                                                        </span>
                                                    ) : state.effectiveReported ? (
                                                        <span>
                                                            <CheckCircleFilled /> Đã báo
                                                        </span>
                                                    ) : state.due ? (
                                                        <span>
                                                            <ClockCircleOutlined /> Cần nhập
                                                        </span>
                                                    ) : (
                                                        <span>Không chạy</span>
                                                    )}
                                                </div>
                                                <div className='leader-line-row__numbers'>
                                                    <div>
                                                        <span>Thực tế</span>
                                                        <strong>
                                                            {state.effectiveReported
                                                                ? number(state.effectiveActual)
                                                                : '—'}
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        <span>Khoán</span>
                                                        <strong>{target ? number(target) : '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Mức đạt</span>
                                                        <strong>
                                                            {state.effectiveReported && target
                                                                ? `${percent.toFixed(0)}%`
                                                                : '—'}
                                                        </strong>
                                                    </div>
                                                </div>
                                                {lastEntry?.enteredByName && !state.pending ? (
                                                    <small className='leader-line-row__audit'>
                                                        {lastEntry.enteredByName}
                                                        {lastEntry.updatedAt
                                                            ? ` · ${dayjs(lastEntry.updatedAt).format('HH:mm')}`
                                                            : ''}
                                                    </small>
                                                ) : null}
                                            </button>
                                            <Button
                                                type={
                                                    day.status === 'draft' && state.due && !state.effectiveReported
                                                        ? 'primary'
                                                        : 'default'
                                                }
                                                onClick={() => setSelectedLineId(line.lineId)}
                                            >
                                                {day.status !== 'draft'
                                                    ? 'Xem'
                                                    : state.conflict
                                                      ? 'Kiểm tra'
                                                      : state.effectiveReported
                                                        ? 'Sửa'
                                                        : line.configured
                                                          ? 'Nhập'
                                                          : 'Thiết lập'}
                                            </Button>
                                        </article>
                                    );
                                })
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        filter === 'missing'
                                            ? 'Không còn chuyền cần nhập trong khung này'
                                            : 'Không có chuyền phù hợp'
                                    }
                                />
                            )}
                        </div>
                    </section>
                </>
            )}

            <footer className='leader-workspace__footer'>
                <span>
                    {day?.reportingState === 'official' ? (
                        <>
                            <CheckCircleFilled /> Báo cáo chính thức
                        </>
                    ) : (
                        <>
                            <SyncOutlined /> Báo cáo tạm tính · cập nhật realtime
                        </>
                    )}
                </span>
                {allConflictCount ? <strong>{allConflictCount} cần kiểm tra</strong> : null}
            </footer>
        </div>
    );
};

export default ProductionLeaderPage;
