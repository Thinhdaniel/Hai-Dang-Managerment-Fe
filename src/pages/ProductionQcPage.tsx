import {
    AuditOutlined,
    CalendarOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    ReloadOutlined,
    SearchOutlined,
    SyncOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, DatePicker, Empty, Input, Segmented, Select, Skeleton } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import ProductionQcEntryDrawer from '../components/production/ProductionQcEntryDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { createProductionMutationId } from '../core/lib/productionOutbox';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { slotRangeLabelShort } from '../core/lib/productionSlot';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionDay,
    ProductionLineRecord,
    ProductionQcSlotValue,
    ProductionTimeSlot,
    SaveProductionQcEntryPayload,
} from '../core/types/production';
import '../styles/production-qc.css';

type QcFilter = 'all' | 'pending' | 'defect';

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể cập nhật kết quả QC');

const selectDefaultSlot = (slots: ProductionTimeSlot[], date: Dayjs) => {
    const active = slots.filter((slot) => slot.isActive).sort((left, right) => left.startMinute - right.startMinute);
    if (!active.length) return '';
    if (date.isBefore(dayjs(), 'day')) return active[active.length - 1].key;
    const minute = dayjs().hour() * 60 + dayjs().minute();
    return (
        active.find((slot) => minute >= slot.startMinute && minute < slot.endMinute)?.key ||
        [...active].reverse().find((slot) => slot.startMinute <= minute)?.key ||
        active[0].key
    );
};

const getQcValue = (line: ProductionLineRecord, slotKey: string) =>
    line.qcSlotValues.find((value) => value.key === slotKey);

const productionReference = (value?: ProductionQcSlotValue) =>
    Number(value?.productionActualReference ?? value?.productionActual ?? 0);

const searchText = (line: ProductionLineRecord) =>
    [line.lineCode, line.lineName, line.leaderName, ...line.runs.flatMap((run) => [run.itemCode, run.itemName])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi-VN');

const ProductionQcPage = () => {
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isPhone, isCompact, isWide } = useResponsive();
    const queryClient = useQueryClient();
    const slotRailRef = useRef<HTMLDivElement>(null);
    const [date, setDate] = useState<Dayjs>(() => dayjs());
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [slotKey, setSlotKey] = useState('');
    const [filter, setFilter] = useState<QcFilter>('all');
    const [search, setSearch] = useState('');
    const [selectedLineId, setSelectedLineId] = useState<string>();
    const [recentlySavedLineId, setRecentlySavedLineId] = useState<string>();
    const productionDate = date.format('YYYY-MM-DD');
    const canSwitchPlant = isAdmin(role) || isDirector(role);
    const overlayEditor = !isWide;

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        enabled: canSwitchPlant,
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (plantId) return;
        const fallback = user?.plantId || plantsQuery.data?.[0]?.id;
        if (fallback) setPlantId(fallback);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const dayQuery = useQuery({
        queryKey: ['production', 'day', plantId, productionDate],
        queryFn: () => productionService.lookupDay(plantId, productionDate),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });
    const day = dayQuery.data;
    const activeSlots = useMemo(
        () => day?.timeSlots.filter((slot) => slot.isActive).sort((a, b) => a.startMinute - b.startMinute) || [],
        [day?.timeSlots]
    );

    useEffect(() => {
        if (!activeSlots.length) {
            setSlotKey('');
            return;
        }
        if (!activeSlots.some((slot) => slot.key === slotKey)) setSlotKey(selectDefaultSlot(activeSlots, date));
    }, [activeSlots, date, slotKey]);

    useEffect(() => {
        setSelectedLineId(undefined);
    }, [plantId, productionDate, slotKey]);

    useEffect(() => {
        if (!recentlySavedLineId) return;
        const timer = window.setTimeout(() => setRecentlySavedLineId(undefined), 900);
        return () => window.clearTimeout(timer);
    }, [recentlySavedLineId]);

    useEffect(() => {
        if (!slotKey) return;
        const frame = requestAnimationFrame(() => {
            slotRailRef.current
                ?.querySelector<HTMLElement>('.pd-qc-time.is-selected')
                ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [activeSlots.length, slotKey]);

    useEffect(() => {
        if (!socket) return;
        const onUpdate = (payload: { plantId?: string; productionDate?: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        };
        socket.on('production:updated', onUpdate);
        return () => {
            socket.off('production:updated', onUpdate);
        };
    }, [plantId, productionDate, queryClient, socket]);

    const replaceLineInCache = (updatedLine: ProductionLineRecord) => {
        queryClient.setQueryData<ProductionDay | null>(['production', 'day', plantId, productionDate], (current) =>
            current
                ? {
                      ...current,
                      lines: current.lines.map((line) => (line.lineId === updatedLine.lineId ? updatedLine : line)),
                  }
                : current
        );
    };

    const saveMutation = useMutation({
        mutationFn: ({ lineId, payload }: { lineId: string; payload: SaveProductionQcEntryPayload }) =>
            productionService.saveQcEntry(day!.id, lineId, slotKey, {
                ...payload,
                clientMutationId: createProductionMutationId(),
            }),
        onSuccess: async (updatedLine) => {
            replaceLineInCache(updatedLine);
            setRecentlySavedLineId(updatedLine.lineId);
            message.success('Đã lưu kết quả QC');
            if (overlayEditor) setSelectedLineId(undefined);
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        },
        onError: (error) => {
            message.error(errorMessage(error));
            void dayQuery.refetch();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: ({ lineId, entryId }: { lineId: string; entryId: string }) =>
            productionService.deleteQcEntry(day!.id, lineId, entryId),
        onSuccess: async (updatedLine) => {
            replaceLineInCache(updatedLine);
            message.success('Đã xóa kết quả QC');
            setSelectedLineId(undefined);
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const selectedSlot = activeSlots.find((slot) => slot.key === slotKey);
    const selectedSummary = day?.slotSummaries.find((slot) => slot.key === slotKey);
    const lines = day?.lines || [];
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    const filteredLines = useMemo(
        () =>
            lines.filter((line) => {
                const value = getQcValue(line, slotKey);
                if (normalizedSearch && !searchText(line).includes(normalizedSearch)) return false;
                if (filter === 'pending') return !value?.reported;
                if (filter === 'defect') return Number(value?.defectQuantity || 0) > 0;
                return true;
            }),
        [filter, lines, normalizedSearch, slotKey]
    );
    const selectedLine = lines.find((line) => line.lineId === selectedLineId);
    const selectedValue = selectedLine ? getQcValue(selectedLine, slotKey) : undefined;
    const slotTotal = lines.reduce((sum, line) => sum + Number(getQcValue(line, slotKey)?.totalQuantity || 0), 0);
    const slotPassed = lines.reduce((sum, line) => sum + Number(getQcValue(line, slotKey)?.passedQuantity || 0), 0);
    const slotDefect = lines.reduce((sum, line) => sum + Number(getQcValue(line, slotKey)?.defectQuantity || 0), 0);
    const pendingLines = lines.filter((line) => !getQcValue(line, slotKey)?.reported).length;
    const expectedLines = Number(selectedSummary?.qcExpectedLines ?? lines.length);
    const reportedLines = Number(selectedSummary?.qcReportedLines || 0);
    const dayExpected = Number(day?.summary.qcExpectedLineSlots ?? lines.length * activeSlots.length);
    const dayReported = Number(
        day?.summary.qcReportedLineSlots ?? lines.reduce((sum, line) => sum + line.qcReportedSlots, 0)
    );
    const dayCoverage = dayExpected > 0 ? (dayReported / dayExpected) * 100 : 0;
    const readOnly = day?.status === 'locked';

    const renderLine = (line: ProductionLineRecord) => {
        const value = getQcValue(line, slotKey);
        const referenceRun = line.runs.find((run) => run.id === (value?.referenceRunId || value?.runId));
        const hasDefect = Number(value?.defectQuantity || 0) > 0;
        const state = !value?.reported ? 'pending' : hasDefect ? 'defect' : 'passed';
        return (
            <button
                key={line.lineId}
                type='button'
                className={`pd-qc-row is-${state} ${selectedLineId === line.lineId ? 'is-selected' : ''} ${recentlySavedLineId === line.lineId ? 'is-saved' : ''}`}
                onClick={() => setSelectedLineId(line.lineId)}
            >
                <span className='pd-qc-row__line'>
                    <i aria-hidden='true'>{line.lineCode.slice(0, 3).toUpperCase()}</i>
                    <span>
                        <strong>{line.lineCode}</strong>
                        <small>{line.leaderName || line.lineName || 'Chưa có tên chuyền'}</small>
                    </span>
                </span>
                <span className='pd-qc-row__reference'>
                    <strong>{referenceRun?.itemCode || 'Không chạy mã'}</strong>
                    <small>SL giờ: {number(productionReference(value))} · tham khảo</small>
                </span>
                <span className='pd-qc-row__numbers'>
                    <span>
                        <small>Tổng</small>
                        <strong>{value?.reported ? number(value.totalQuantity) : '—'}</strong>
                    </span>
                    <span className='is-passed'>
                        <small>Đạt</small>
                        <strong>{value?.reported ? number(value.passedQuantity) : '—'}</strong>
                    </span>
                    <span className='is-defect'>
                        <small>Lỗi</small>
                        <strong>{value?.reported ? number(value.defectQuantity) : '—'}</strong>
                    </span>
                </span>
                <span className={`pd-qc-row__status is-${state}`}>
                    {state === 'pending' ? <ClockCircleOutlined /> : null}
                    {state === 'passed' ? <CheckCircleFilled /> : null}
                    {state === 'defect' ? <WarningFilled /> : null}
                    {state === 'pending'
                        ? 'Chưa nhập'
                        : state === 'passed'
                          ? 'Đã kiểm'
                          : `Lỗi ${value?.defectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`}
                </span>
                <span className='pd-qc-row__action'>{readOnly ? 'Xem' : value?.reported ? 'Sửa' : 'Nhập'}</span>
            </button>
        );
    };

    return (
        <div className='pd-qc-page'>
            <header className='pd-qc-topbar'>
                <div className='pd-qc-title'>
                    <span>
                        <AuditOutlined />
                    </span>
                    <div>
                        <small>KIỂM SOÁT CHẤT LƯỢNG</small>
                        <h1>QC theo giờ</h1>
                    </div>
                </div>
                <div className='pd-qc-topbar__tools'>
                    <span className={`pd-qc-live ${socket?.connected ? 'is-online' : 'is-offline'}`}>
                        <i /> {socket?.connected ? 'Đồng bộ trực tiếp' : 'Đang kết nối'}
                    </span>
                    {canSwitchPlant ? (
                        <Select
                            value={plantId || undefined}
                            onChange={setPlantId}
                            options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                            placeholder='Chọn cơ sở'
                            aria-label='Chọn cơ sở'
                        />
                    ) : (
                        <span className='pd-qc-plant'>{user?.plant?.name || 'Cơ sở được phân công'}</span>
                    )}
                    <DatePicker
                        value={date}
                        onChange={(next) => next && setDate(next)}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        suffixIcon={<CalendarOutlined />}
                        disabledDate={(current) => current.isAfter(dayjs(), 'day')}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => void dayQuery.refetch()}
                        loading={dayQuery.isFetching}
                        aria-label='Làm mới dữ liệu QC'
                    >
                        {isPhone ? null : 'Làm mới'}
                    </Button>
                </div>
            </header>

            {dayQuery.isLoading ? (
                <div className='pd-qc-loading'>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            ) : dayQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được dữ liệu QC'
                    description={errorMessage(dayQuery.error)}
                />
            ) : !day ? (
                <section className='pd-qc-empty'>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <span>
                                <strong>Ngày này chưa được khởi tạo</strong>
                                <small>Quản lý hoặc tổ trưởng cần tạo ngày trước khi QC nhập.</small>
                            </span>
                        }
                    />
                </section>
            ) : (
                <>
                    {readOnly ? (
                        <Alert
                            className='pd-qc-lock-alert'
                            type='info'
                            showIcon
                            message='Ngày đã khóa sổ'
                            description='Kết quả QC đang ở chế độ chỉ xem.'
                        />
                    ) : day.status === 'submitted' ? (
                        <div className='pd-qc-submitted-note'>
                            <SyncOutlined /> Ngày sản xuất đã gửi duyệt; bộ phận QC vẫn có thể hoàn thiện số kiểm.
                        </div>
                    ) : null}

                    <section className='pd-qc-overview' aria-label='Tổng hợp QC trong ngày'>
                        <div className='is-total'>
                            <small>Tổng kiểm</small>
                            <strong>{number(day.summary.qcTotalQuantity)}</strong>
                            <span>Khối lượng QC thực tế</span>
                        </div>
                        <div className='is-passed'>
                            <small>Đạt</small>
                            <strong>{number(day.summary.qcPassedQuantity)}</strong>
                            <span>Sản phẩm đạt chuẩn</span>
                        </div>
                        <div className='is-defect'>
                            <small>Lỗi</small>
                            <strong>{number(day.summary.qcDefectQuantity)}</strong>
                            <span>Sản phẩm cần xử lý</span>
                        </div>
                        <div className='is-rate'>
                            <small>Tỷ lệ lỗi</small>
                            <strong>
                                {day.summary.qcDefectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%
                            </strong>
                            <span>
                                Đã nhập {number(dayReported)}/{number(dayExpected)} lượt
                            </span>
                        </div>
                        <div className='pd-qc-overview__progress' aria-hidden='true'>
                            <span style={{ width: `${Math.min(100, dayCoverage)}%` }} />
                        </div>
                    </section>

                    <section className={`pd-qc-console ${isWide ? 'has-editor' : ''}`}>
                        <nav className='pd-qc-time-panel' aria-label='Chọn khung giờ kiểm'>
                            <header>
                                <div>
                                    <strong>Khung giờ</strong>
                                    <small>
                                        {number(reportedLines)}/{number(expectedLines)} chuyền đã nhập
                                    </small>
                                </div>
                                <span>{Math.round(Number(selectedSummary?.qcCoveragePercent || 0))}%</span>
                            </header>
                            <div className='pd-qc-times' ref={slotRailRef}>
                                {activeSlots.map((slot) => {
                                    const summary = day.slotSummaries.find((item) => item.key === slot.key);
                                    const expected = Number(summary?.qcExpectedLines ?? lines.length);
                                    const reported = Number(summary?.qcReportedLines || 0);
                                    const complete = expected > 0 && reported === expected;
                                    return (
                                        <button
                                            key={slot.key}
                                            type='button'
                                            className={`pd-qc-time ${slot.key === slotKey ? 'is-selected' : ''} ${complete ? 'is-complete' : ''}`}
                                            onClick={() => setSlotKey(slot.key)}
                                        >
                                            <span>{slotRangeLabelShort(slot)}</span>
                                            <small>
                                                {reported}/{expected}
                                            </small>
                                            <i aria-hidden='true' />
                                        </button>
                                    );
                                })}
                            </div>
                        </nav>

                        <main className='pd-qc-main'>
                            <div className='pd-qc-slot-summary'>
                                <div>
                                    <small>Khung đang xem</small>
                                    <strong>{selectedSlot ? slotRangeLabelShort(selectedSlot) : '—'}</strong>
                                </div>
                                <span>
                                    <small>Tổng</small>
                                    <strong>{number(slotTotal)}</strong>
                                </span>
                                <span className='is-passed'>
                                    <small>Đạt</small>
                                    <strong>{number(slotPassed)}</strong>
                                </span>
                                <span className='is-defect'>
                                    <small>Lỗi</small>
                                    <strong>{number(slotDefect)}</strong>
                                </span>
                                <span className='is-pending'>
                                    <small>Chưa nhập</small>
                                    <strong>{number(pendingLines)}</strong>
                                </span>
                            </div>

                            <div className='pd-qc-toolbar'>
                                <Segmented<QcFilter>
                                    value={filter}
                                    onChange={setFilter}
                                    options={[
                                        { label: 'Tất cả', value: 'all' },
                                        { label: `Chưa nhập (${pendingLines})`, value: 'pending' },
                                        { label: 'Có lỗi', value: 'defect' },
                                    ]}
                                    block={isCompact}
                                />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    allowClear
                                    prefix={<SearchOutlined />}
                                    placeholder='Tìm chuyền hoặc mã hàng'
                                />
                            </div>

                            <div className='pd-qc-table-head' aria-hidden='true'>
                                <span>Chuyền</span>
                                <span>Mã đang chạy · tham khảo</span>
                                <span>Kết quả QC</span>
                                <span>Trạng thái</span>
                                <span />
                            </div>
                            <div className='pd-qc-rows'>
                                {filteredLines.length ? (
                                    filteredLines.map(renderLine)
                                ) : (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={
                                            lines.length ? 'Không có chuyền phù hợp bộ lọc' : 'Ngày chưa có chuyền'
                                        }
                                    />
                                )}
                            </div>
                        </main>

                        {isWide ? (
                            <ProductionQcEntryDrawer
                                open={Boolean(selectedLine && selectedSlot && selectedValue)}
                                mobile={false}
                                line={selectedLine}
                                slot={selectedSlot}
                                value={selectedValue}
                                readOnly={readOnly}
                                saving={saveMutation.isPending}
                                deleting={deleteMutation.isPending}
                                onClose={() => setSelectedLineId(undefined)}
                                onSave={(payload) =>
                                    selectedLine && saveMutation.mutate({ lineId: selectedLine.lineId, payload })
                                }
                                onDelete={(entryId) =>
                                    selectedLine && deleteMutation.mutate({ lineId: selectedLine.lineId, entryId })
                                }
                            />
                        ) : null}
                    </section>
                </>
            )}

            {overlayEditor ? (
                <ProductionQcEntryDrawer
                    open={Boolean(selectedLine && selectedSlot && selectedValue)}
                    mobile
                    line={selectedLine}
                    slot={selectedSlot}
                    value={selectedValue}
                    readOnly={readOnly}
                    saving={saveMutation.isPending}
                    deleting={deleteMutation.isPending}
                    onClose={() => setSelectedLineId(undefined)}
                    onSave={(payload) => selectedLine && saveMutation.mutate({ lineId: selectedLine.lineId, payload })}
                    onDelete={(entryId) =>
                        selectedLine && deleteMutation.mutate({ lineId: selectedLine.lineId, entryId })
                    }
                />
            ) : null}
        </div>
    );
};

export default ProductionQcPage;
