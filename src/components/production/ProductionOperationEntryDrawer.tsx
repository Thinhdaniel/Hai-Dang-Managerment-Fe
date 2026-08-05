import {
    ApartmentOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    CloudSyncOutlined,
    DeleteOutlined,
    ExclamationCircleFilled,
    SaveOutlined,
} from '@ant-design/icons';
import { App, Button, Drawer, Empty, Input, InputNumber, Popconfirm, Switch, Tag } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useResponsive } from '../../core/hooks/useResponsive';
import {
    getProductionOperationDraft,
    removeProductionOperationDraft,
    saveProductionOperationDraft,
} from '../../core/lib/productionOperationDraft';
import {
    listProductionOperationOutbox,
    putProductionOperationOutbox,
    removeProductionOperationOutbox,
    subscribeProductionOperationOutbox,
    type ProductionOperationOutboxItem,
} from '../../core/lib/productionOperationOutbox';
import { createProductionMutationId } from '../../core/lib/productionOutbox';
import { slotRangeLabel } from '../../core/lib/productionSlot';
import { productionService } from '../../core/services/production.service';
import type {
    ProductionDay,
    ProductionItem,
    ProductionLineRecord,
    ProductionOperationSlotValue,
    SaveProductionOperationEntryPayload,
} from '../../core/types/production';

type Props = {
    open: boolean;
    actorId: string;
    day: ProductionDay;
    line: ProductionLineRecord;
    slotKey: string;
    items: ProductionItem[];
    online: boolean;
    onClose: () => void;
    onSaved: () => Promise<unknown>;
};

type EditorValue = {
    quantity: number | null;
    note: string;
    expectedUpdatedAt: string | null;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) =>
    typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Không thể lưu công đoạn';
const errorStatus = (error: unknown) =>
    typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;

const ProductionOperationEntryDrawer = ({
    open,
    actorId,
    day,
    line,
    slotKey,
    items,
    online,
    onClose,
    onSaved,
}: Props) => {
    const { message } = App.useApp();
    const { isPhone } = useResponsive();
    const [values, setValues] = useState<Record<string, EditorValue>>({});
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
    const [showTransition, setShowTransition] = useState(false);
    const [saving, setSaving] = useState(false);
    const [configuring, setConfiguring] = useState(false);
    const [deletingId, setDeletingId] = useState<string>();
    const [queued, setQueued] = useState<ProductionOperationOutboxItem>();
    const hydrationRef = useRef('');
    const slot = day.timeSlots.find((item) => item.key === slotKey);
    const productionSlot = line.slotValues.find((value) => value.key === slotKey);
    const currentRun =
        line.runs.find((run) => run.id === productionSlot?.runId) ||
        [...line.runs].reverse().find((run) => run.status === 'active') ||
        [...line.runs].reverse()[0];
    const currentItem = items.find((item) => item.id === currentRun?.itemId);
    const allSlotValues = useMemo(
        () => (line.operationSlotValues || []).filter((value) => value.key === slotKey),
        [line.operationSlotValues, slotKey]
    );
    const currentValues = useMemo(
        () => allSlotValues.filter((value) => value.sourceRunId === currentRun?.id && (value.due || value.reported)),
        [allSlotValues, currentRun?.id]
    );
    const transitionValues = useMemo(
        () =>
            allSlotValues.filter(
                (value) => value.sourceRunId !== currentRun?.id && (value.reported || value.transition || !value.due)
            ),
        [allSlotValues, currentRun?.id]
    );
    const displayedValues = showTransition ? [...currentValues, ...transitionValues] : currentValues;
    const hasTrackedValues = currentValues.length > 0 || transitionValues.length > 0;
    const readOnly = day.status !== 'draft';
    const scope = useMemo(
        () => ({
            actorId,
            plantId: day.plantId,
            productionDate: day.productionDate,
            lineId: line.lineId,
            slotKey,
        }),
        [actorId, day.plantId, day.productionDate, line.lineId, slotKey]
    );

    useEffect(() => {
        const load = () => {
            const latest = listProductionOperationOutbox()
                .filter(
                    (item) =>
                        item.actorId === actorId &&
                        item.lineId === line.lineId &&
                        item.productionDate === day.productionDate &&
                        item.slotKey === slotKey
                )
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
            setQueued(latest);
        };
        load();
        return subscribeProductionOperationOutbox(load);
    }, [actorId, day.productionDate, line.lineId, slotKey]);

    useEffect(() => {
        if (!open) return;
        const signature = [
            line.id,
            slotKey,
            (line.operationEntries || []).map((entry) => `${entry.id}:${entry.updatedAt}`).join(','),
            queued?.id || '',
            queued?.updatedAt || '',
        ].join('|');
        if (hydrationRef.current === signature) return;
        hydrationRef.current = signature;
        const draft = !queued ? getProductionOperationDraft(scope) : undefined;
        const draftById = new Map((draft?.values || []).map((value) => [value.trackId, value]));
        const queuedById = new Map((queued?.entries || []).map((entry) => [entry.trackId, entry]));
        const nextValues: Record<string, EditorValue> = {};
        allSlotValues.forEach((value) => {
            const pending = queuedById.get(value.trackId);
            const restored = draftById.get(value.trackId);
            nextValues[value.trackId] = {
                quantity: pending?.quantity ?? restored?.quantity ?? (value.reported ? value.actual : null),
                note: pending?.note ?? restored?.note ?? value.note ?? '',
                expectedUpdatedAt: pending?.expectedUpdatedAt ?? restored?.expectedUpdatedAt ?? value.updatedAt ?? null,
            };
        });
        setValues(nextValues);
        setDirtyIds(
            new Set(queued?.entries.map((entry) => entry.trackId) || draft?.values.map((value) => value.trackId))
        );
        setShowTransition(
            Boolean(queued?.entries.some((entry) => transitionValues.some((v) => v.trackId === entry.trackId)))
        );
    }, [allSlotValues, open, queued, scope, slotKey, transitionValues]);

    useEffect(() => {
        if (!open || !dirtyIds.size || queued) return;
        const timer = window.setTimeout(() => {
            saveProductionOperationDraft({
                ...scope,
                version: 1,
                values: [...dirtyIds].map((trackId) => ({
                    trackId,
                    quantity: values[trackId]?.quantity ?? null,
                    note: values[trackId]?.note || '',
                    expectedUpdatedAt: values[trackId]?.expectedUpdatedAt ?? null,
                })),
                savedAt: new Date().toISOString(),
            });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [dirtyIds, open, queued, scope, values]);

    const updateValue = (trackId: string, patch: Partial<EditorValue>) => {
        setValues((current) => {
            const existing = current[trackId] || { quantity: null, note: '', expectedUpdatedAt: null };
            return { ...current, [trackId]: { ...existing, ...patch } };
        });
        setDirtyIds((current) => new Set(current).add(trackId));
    };

    const enableTracking = async () => {
        if (!currentRun || !currentItem?.operationTemplates?.length) return;
        setConfiguring(true);
        try {
            await productionService.configureOperationTracks(day.id, line.lineId, {
                runId: currentRun.id,
                enabled: true,
                operations: (currentItem.operationTemplates || []).map((template, index) => ({
                    operationId: template.operationId,
                    hourlyQuota: template.hourlyQuota,
                    required: template.required,
                    sortOrder: index,
                })),
            });
            message.success('Đã bật theo dõi công đoạn cho tổ');
            await onSaved();
        } catch (error) {
            message.error(errorMessage(error));
        } finally {
            setConfiguring(false);
        }
    };

    const save = async () => {
        const selected = [...dirtyIds]
            .map((trackId) => ({ trackId, ...values[trackId] }))
            .filter((value) => value.quantity !== null);
        if (!selected.length) {
            message.info('Chưa có số công đoạn mới để lưu');
            return;
        }
        const missingZeroNote = selected.find((value) => value.quantity === 0 && value.note.trim().length < 3);
        if (missingZeroNote) {
            const operation = allSlotValues.find((value) => value.trackId === missingZeroNote.trackId);
            message.warning(`Cần ghi chú khi ${operation?.operationName || 'công đoạn'} bằng 0`);
            return;
        }
        const batchId = queued?.id || createProductionMutationId();
        const entries: SaveProductionOperationEntryPayload[] = selected.map((value) => ({
            trackId: value.trackId,
            quantity: Number(value.quantity),
            note: value.note.trim() || undefined,
            expectedUpdatedAt: value.expectedUpdatedAt,
            clientMutationId: `${batchId}:${value.trackId}`.slice(0, 100),
        }));
        const now = new Date().toISOString();
        const outboxItem: ProductionOperationOutboxItem = {
            id: batchId,
            actorId,
            plantId: day.plantId,
            productionDate: day.productionDate,
            dayId: day.id,
            lineId: line.lineId,
            lineCode: line.lineCode,
            slotKey,
            entries,
            status: 'pending',
            attempts: 0,
            createdAt: queued?.createdAt || now,
            updatedAt: now,
        };

        setSaving(true);
        try {
            if (!online) {
                putProductionOperationOutbox(outboxItem);
                removeProductionOperationDraft(scope);
                message.success('Đã lưu công đoạn trên điện thoại, sẽ tự đồng bộ khi có mạng');
                onClose();
                return;
            }
            try {
                await productionService.saveOperationEntries(day.id, line.lineId, slotKey, entries);
                if (queued) removeProductionOperationOutbox(queued.id);
                removeProductionOperationDraft(scope);
                setDirtyIds(new Set());
                message.success('Đã lưu sản lượng công đoạn');
                await onSaved();
                onClose();
            } catch (error) {
                const status = errorStatus(error);
                if (status === 409) {
                    putProductionOperationOutbox({ ...outboxItem, status: 'conflict', lastError: errorMessage(error) });
                    message.warning('Công đoạn vừa được sửa trên thiết bị khác. Hãy tải lại và kiểm tra.');
                    return;
                }
                if (!navigator.onLine || status === undefined || status >= 500 || status === 408 || status === 429) {
                    putProductionOperationOutbox({ ...outboxItem, lastError: errorMessage(error) });
                    removeProductionOperationDraft(scope);
                    message.success('Kết nối không ổn định, số công đoạn đã được giữ để tự đồng bộ');
                    onClose();
                    return;
                }
                message.error(errorMessage(error));
            }
        } catch (error) {
            message.error(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const removeEntry = async (value: ProductionOperationSlotValue) => {
        const entryId = value.entryIds[0];
        if (!entryId) return;
        setDeletingId(entryId);
        try {
            await productionService.deleteOperationEntry(day.id, line.lineId, entryId);
            message.success('Đã xóa số công đoạn');
            await onSaved();
        } catch (error) {
            message.error(errorMessage(error));
        } finally {
            setDeletingId(undefined);
        }
    };

    const reported = currentValues.filter((value) => value.reported).length;
    const content = hasTrackedValues ? (
        <>
            {readOnly ? (
                <div className='production-operation-readonly'>
                    <CheckCircleFilled />
                    <span>Ngày sản xuất đã nộp hoặc khóa sổ. Số liệu công đoạn chỉ được xem.</span>
                </div>
            ) : null}
            {queued ? (
                <div className={`production-operation-queue is-${queued.status}`}>
                    {queued.status === 'conflict' ? <ExclamationCircleFilled /> : <CloudSyncOutlined />}
                    <div>
                        <strong>{queued.status === 'conflict' ? 'Cần kiểm tra xung đột' : 'Đang chờ đồng bộ'}</strong>
                        <span>{queued.lastError || 'Số liệu đã được giữ an toàn trên thiết bị.'}</span>
                    </div>
                </div>
            ) : null}

            <div className='production-operation-summary'>
                <div>
                    <small>Khung giờ</small>
                    <strong>{slotRangeLabel(slot) || slotKey}</strong>
                </div>
                <div>
                    <small>Đã nhập</small>
                    <strong>
                        {reported}/{currentValues.length}
                    </strong>
                </div>
                <div>
                    <small>Mã hàng</small>
                    <strong>{currentRun?.itemCode || '—'}</strong>
                </div>
            </div>

            <div className='production-operation-entry-list'>
                {displayedValues.map((value) => {
                    const editor = values[value.trackId] || {
                        quantity: value.reported ? value.actual : null,
                        note: value.note || '',
                        expectedUpdatedAt: value.updatedAt || null,
                    };
                    const percent = value.target > 0 ? (Number(editor.quantity || 0) / value.target) * 100 : 0;
                    return (
                        <article
                            className={`production-operation-entry ${value.sourceRunId !== currentRun?.id ? 'is-transition' : ''}`}
                            key={value.trackId}
                        >
                            <header>
                                <span className='production-operation-entry__order'>
                                    <ApartmentOutlined />
                                </span>
                                <div>
                                    <strong>{value.operationName}</strong>
                                    <small>
                                        {value.operationCode} · {value.itemCode}
                                    </small>
                                </div>
                                <Tag color={value.required ? 'blue' : 'default'}>
                                    {value.required ? 'Bắt buộc' : 'Tham khảo'}
                                </Tag>
                            </header>
                            <div className='production-operation-entry__input'>
                                <InputNumber
                                    min={0}
                                    max={100_000_000}
                                    precision={0}
                                    controls={false}
                                    inputMode='numeric'
                                    value={editor.quantity}
                                    placeholder='0'
                                    addonAfter={value.unit}
                                    disabled={readOnly}
                                    onChange={(quantity) =>
                                        updateValue(value.trackId, {
                                            quantity: quantity === null ? null : Number(quantity),
                                        })
                                    }
                                />
                                <div>
                                    <span>Khoán {value.target ? number(value.target) : '—'}</span>
                                    <strong className={percent >= 100 ? 'is-good' : percent > 0 ? 'is-watch' : ''}>
                                        {value.target > 0 && editor.quantity !== null ? `${percent.toFixed(0)}%` : '—'}
                                    </strong>
                                </div>
                            </div>
                            <div className='production-operation-entry__steps'>
                                {value.target > 0 ? (
                                    <button
                                        type='button'
                                        disabled={readOnly}
                                        onClick={() =>
                                            updateValue(value.trackId, { quantity: Math.round(value.target) })
                                        }
                                    >
                                        Đạt khoán
                                    </button>
                                ) : null}
                                {[10, 50, 100].map((step) => (
                                    <button
                                        type='button'
                                        key={step}
                                        disabled={readOnly}
                                        onClick={() =>
                                            updateValue(value.trackId, {
                                                quantity: Math.max(0, Number(editor.quantity || 0) + step),
                                            })
                                        }
                                    >
                                        +{step}
                                    </button>
                                ))}
                            </div>
                            <Input
                                value={editor.note}
                                maxLength={500}
                                placeholder={editor.quantity === 0 ? 'Ghi chú bắt buộc khi bằng 0' : 'Ghi chú nếu cần'}
                                disabled={readOnly}
                                onChange={(event) => updateValue(value.trackId, { note: event.target.value })}
                            />
                            <footer>
                                <span>
                                    {value.reported ? (
                                        <>
                                            <CheckCircleFilled /> Đã nhập {number(value.actual)} {value.unit}
                                        </>
                                    ) : (
                                        <>
                                            <ClockCircleOutlined /> Chưa nhập
                                        </>
                                    )}
                                </span>
                                {value.entryIds.length && day.status === 'draft' ? (
                                    <Popconfirm
                                        title='Xóa số công đoạn này?'
                                        okText='Xóa'
                                        cancelText='Giữ lại'
                                        onConfirm={() => removeEntry(value)}
                                    >
                                        <Button
                                            type='text'
                                            danger
                                            icon={<DeleteOutlined />}
                                            loading={deletingId === value.entryIds[0]}
                                        />
                                    </Popconfirm>
                                ) : null}
                            </footer>
                        </article>
                    );
                })}
            </div>

            {transitionValues.length ? (
                <label className='production-operation-transition-toggle'>
                    <span>
                        <strong>Hàng chuyển tiếp mã trước</strong>
                        <small>Cho phép ghi nhận bán thành phẩm còn lại sau khi đổi mã.</small>
                    </span>
                    <Switch checked={showTransition} onChange={setShowTransition} />
                </label>
            ) : null}
        </>
    ) : currentItem?.operationTemplates?.length ? (
        <div className='production-operation-empty-setup'>
            <span>
                <ApartmentOutlined />
            </span>
            <strong>Chưa bật theo dõi công đoạn</strong>
            <p>
                Mã {currentItem.code} có {currentItem.operationTemplates.length} công đoạn trong template.
            </p>
            {day.status === 'draft' ? (
                <Button type='primary' loading={configuring} disabled={!online} onClick={enableTracking}>
                    Bật cho tổ {line.lineCode}
                </Button>
            ) : null}
        </div>
    ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Mã hàng này chưa có template công đoạn trọng yếu' />
    );

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={isPhone ? 'bottom' : 'right'}
            height={isPhone ? 'min(92dvh, 820px)' : undefined}
            width={isPhone ? undefined : 580}
            className='production-operation-entry-drawer'
            title={
                <div className='production-operation-entry-title'>
                    <span>
                        <ApartmentOutlined />
                    </span>
                    <div>
                        <small>CÔNG ĐOẠN TRỌNG YẾU</small>
                        <strong>{line.lineCode}</strong>
                    </div>
                </div>
            }
            footer={
                displayedValues.length && day.status === 'draft' ? (
                    <Button
                        type='primary'
                        size='large'
                        block
                        icon={online ? <SaveOutlined /> : <CloudSyncOutlined />}
                        loading={saving}
                        disabled={!dirtyIds.size}
                        onClick={save}
                    >
                        {online ? `Lưu ${dirtyIds.size || ''} công đoạn` : 'Lưu trên điện thoại'}
                    </Button>
                ) : null
            }
            destroyOnHidden
        >
            {content}
        </Drawer>
    );
};

export default ProductionOperationEntryDrawer;
