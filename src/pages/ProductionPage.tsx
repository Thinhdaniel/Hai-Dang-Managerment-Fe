import {
    CheckCircleFilled,
    CheckOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    SettingOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Empty, Grid, Input, Skeleton, Table, type TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductionCommandRibbon from '../components/production/ProductionCommandRibbon';
import ProductionEntryDrawer from '../components/production/ProductionEntryDrawer';
import ProductionMissingDock from '../components/production/ProductionMissingDock';
import ProductionSetupDrawer from '../components/production/ProductionSetupDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { can, hasManagerAccess, isAdmin, isDirector } from '../core/lib/permissions';
import { slotRangeLabel, slotRangeLabelShort } from '../core/lib/productionSlot';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type { ProductionDay, ProductionLineRecord, ProductionTimeSlot } from '../core/types/production';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải dữ liệu');
const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);

const achievementTone = (percent: number) => {
    if (percent >= 95) return 'success';
    if (percent >= 80) return 'warning';
    return 'danger';
};

const selectDefaultSlot = (slots: ProductionTimeSlot[], date: Dayjs) => {
    const active = slots.filter((slot) => slot.isActive).sort((left, right) => left.startMinute - right.startMinute);
    if (!active.length) return '';
    if (date.isBefore(dayjs(), 'day')) return active[active.length - 1].key;
    if (date.isAfter(dayjs(), 'day')) return active[0].key;
    const minute = dayjs().hour() * 60 + dayjs().minute();
    const inside = active.find((slot) => minute >= slot.startMinute && minute < slot.endMinute);
    if (inside) return inside.key;
    return [...active].reverse().find((slot) => slot.startMinute <= minute)?.key || active[0].key;
};

const lineSearchText = (line: ProductionLineRecord) =>
    [line.lineCode, line.lineName, line.leaderName, ...line.runs.flatMap((run) => [run.itemCode, run.itemName])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi-VN');

const getSlotValue = (line: ProductionLineRecord, slotKey: string) =>
    line.slotValues.find((slot) => slot.key === slotKey);

// Chuyền chỉ "còn thiếu" khi khung giờ đó THỰC SỰ có mã đang chạy (runId) mà chưa báo.
// Thiếu check runId thì allocation kết thúc giữa ngày sẽ bị đòi báo cả buổi chiều.
const isMissingAtSlot = (line: ProductionLineRecord, slotKey: string) => {
    if (!line.configured) return false;
    const value = getSlotValue(line, slotKey);
    return Boolean(value?.runId) && !value?.reported;
};

const ProductionPage = () => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [date, setDate] = useState<Dayjs>(() => {
        const requested = searchParams.get('date');
        const parsed = requested ? dayjs(requested, 'YYYY-MM-DD', true) : dayjs();
        return parsed.isValid() ? parsed : dayjs();
    });
    const [plantId, setPlantId] = useState(() => searchParams.get('plantId') || user?.plantId || '');
    const [selectedSlotKey, setSelectedSlotKey] = useState(() => searchParams.get('slot') || '');
    const [selectedLineId, setSelectedLineId] = useState<string | null>(() => searchParams.get('lineId'));
    const [setupOpen, setSetupOpen] = useState(false);
    const [search, setSearch] = useState('');
    const productionDate = date.format('YYYY-MM-DD');
    const canManage = can(role, 'production.manage');
    const canSwitchPlant = isAdmin(role) || isDirector(role);
    const canReopenLocked = isAdmin(role) || isDirector(role);
    const canSeeFinancials = hasManagerAccess(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const linesQuery = useQuery({
        queryKey: ['production', 'lines', plantId, false],
        queryFn: () => productionService.getLines(plantId),
        enabled: Boolean(plantId),
        staleTime: 60 * 1000,
    });

    const itemsQuery = useQuery({
        queryKey: ['production', 'items', plantId, false],
        queryFn: () => productionService.getItems(plantId),
        enabled: Boolean(plantId),
        staleTime: 60 * 1000,
    });

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
            setSelectedSlotKey('');
            return;
        }
        if (!activeSlots.some((slot) => slot.key === selectedSlotKey)) {
            setSelectedSlotKey(selectDefaultSlot(activeSlots, date));
        }
    }, [activeSlots, date, selectedSlotKey]);

    useEffect(() => {
        if (!socket) return;
        const handleProductionUpdate = (payload: { plantId: string; productionDate: string; dayId: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        };
        socket.on('production:updated', handleProductionUpdate);
        return () => {
            socket.off('production:updated', handleProductionUpdate);
        };
    }, [plantId, productionDate, queryClient, socket]);

    const createDayMutation = useMutation({
        mutationFn: () => productionService.createDay({ plantId, productionDate }),
        onSuccess: async () => {
            message.success('Đã khởi tạo ngày sản xuất');
            await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    const selectedSlot = activeSlots.find((slot) => slot.key === selectedSlotKey);
    const selectedSlotSummary = day?.slotSummaries.find((slot) => slot.key === selectedSlotKey);
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    const filteredLines = useMemo(
        () => (day?.lines || []).filter((line) => !normalizedSearch || lineSearchText(line).includes(normalizedSearch)),
        [day?.lines, normalizedSearch]
    );
    const missingLines = useMemo(
        () => filteredLines.filter((line) => isMissingAtSlot(line, selectedSlotKey)),
        [filteredLines, selectedSlotKey]
    );
    const selectedLine = day?.lines.find((line) => line.lineId === selectedLineId);
    const isToday = date.isSame(dayjs(), 'day');
    const isPastDate = date.isBefore(dayjs(), 'day');
    const nowMinute = dayjs().hour() * 60 + dayjs().minute();
    const readOnly = day ? day.status !== 'draft' : true;

    const openLine = (line: ProductionLineRecord, slotKey = selectedSlotKey) => {
        setSelectedSlotKey(slotKey);
        setSelectedLineId(line.lineId);
    };

    const moveAfterSave = (moveNext: boolean) => {
        if (!moveNext || !selectedLineId) {
            setSelectedLineId(null);
            return;
        }
        const currentIndex = filteredLines.findIndex((line) => line.lineId === selectedLineId);
        const ordered = [...filteredLines.slice(currentIndex + 1), ...filteredLines.slice(0, currentIndex)];
        const nextLine = ordered.find((line) => isMissingAtSlot(line, selectedSlotKey));
        setSelectedLineId(nextLine?.lineId || null);
        if (!nextLine) message.success('Đã hoàn tất tất cả chuyền trong khung giờ này');
    };

    const refreshDayQueries = async () => {
        setSetupOpen(false);
        setSelectedLineId(null);
        await queryClient.invalidateQueries({ queryKey: ['production', 'day', plantId, productionDate] });
        await queryClient.invalidateQueries({ queryKey: ['production', 'history', plantId] });
    };

    const renderSlotChip = (slot: ProductionTimeSlot, compact = false) => {
        const summary = day?.slotSummaries.find((item) => item.key === slot.key);
        const due = summary?.totalLines || 0;
        const reported = summary?.reportedLines || 0;
        const missing = Math.max(0, due - reported);
        const complete = due > 0 && missing === 0;
        const isCurrent = isToday && nowMinute >= slot.startMinute && nowMinute < slot.endMinute;
        const isFuture = !isPastDate && (isToday ? slot.startMinute > nowMinute : true);
        const selected = selectedSlotKey === slot.key;
        return (
            <button
                type='button'
                key={`${compact ? 'm-' : ''}${slot.key}`}
                className={[
                    'pd-slot',
                    selected ? 'is-selected' : '',
                    isCurrent ? 'is-current' : '',
                    !selected && !isCurrent && isFuture && !complete ? 'is-future' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                onClick={() => setSelectedSlotKey(slot.key)}
            >
                <span className='pd-slot__head'>
                    {slotRangeLabelShort(slot)}
                    {slot.kind === 'overtime' ? <span className='pd-slot-ot'>TC</span> : null}
                    {complete ? <CheckOutlined className='pd-slot__check' /> : null}
                    {missing > 0 && !isFuture ? <span className='pd-slot__badge'>{missing}</span> : null}
                </span>
                <span className='pd-slot__sub'>
                    {due > 0 ? `${reported}/${due} chuyền` : '—'}
                </span>
            </button>
        );
    };

    const renderSlotCell = (line: ProductionLineRecord, slot: ProductionTimeSlot) => {
        const value = getSlotValue(line, slot.key);
        // Khung giờ chưa bắt đầu thì không giục "Nhập" — tránh cả bảng nhuộm vàng vào buổi sáng.
        const slotStarted = isPastDate || (isToday && slot.startMinute <= nowMinute);
        if (!line.configured) {
            return (
                <button
                    type='button'
                    className='pd-cell is-unconfigured'
                    onClick={() => openLine(line, slot.key)}
                    aria-label={`Thiết lập ${line.lineCode}`}
                >
                    {readOnly ? <span>—</span> : <SettingOutlined />}
                </button>
            );
        }
        if (!value?.reported) {
            if (!value?.runId || !slotStarted) {
                return (
                    <button type='button' className='pd-cell is-idle' onClick={() => openLine(line, slot.key)}>
                        <span>–</span>
                    </button>
                );
            }
            return (
                <button type='button' className='pd-cell is-missing' onClick={() => openLine(line, slot.key)}>
                    <span>—</span>
                    <small>{readOnly ? 'Chưa báo' : 'Nhập'}</small>
                </button>
            );
        }
        // Tăng ca không có khoán nên không có tỉ lệ để tô màu — hàng làm ra là phần vượt.
        const overtime = Boolean(value.overtime) || value.target <= 0;
        const percent = value.target > 0 ? (value.actual / value.target) * 100 : 0;
        return (
            <button
                type='button'
                className={`pd-cell ${overtime ? 'is-overtime' : `tone-${achievementTone(percent)}`}`}
                onClick={() => openLine(line, slot.key)}
            >
                <strong>{number(value.actual)}</strong>
                {overtime ? (
                    <small>TC</small>
                ) : (
                    <span className='pd-cell__bar'>
                        <i style={{ width: `${Math.min(100, Math.round(percent))}%` }} />
                    </span>
                )}
            </button>
        );
    };

    const columns: TableColumnsType<ProductionLineRecord> = [
        {
            title: 'Chuyền',
            key: 'line',
            fixed: 'left',
            width: 186,
            render: (_, line) => (
                <button type='button' className='pd-line' onClick={() => openLine(line)}>
                    <strong>{line.lineCode}</strong>
                    <span className='pd-line__meta'>
                        <span>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</span>
                        <span className='pd-line-workers'>
                            <TeamOutlined />
                            {line.workerCountConfirmed ? line.workerCount : '—'}
                        </span>
                    </span>
                </button>
            ),
        },
        {
            title: 'Mã hàng',
            key: 'item',
            width: 128,
            render: (_, line) => {
                const active = [...line.runs].reverse().find((run) => run.status === 'active');
                return active ? (
                    <div className='pd-item-cell'>
                        <strong>{active.itemCode}</strong>
                        <span>Khoán {number(active.hourlyQuota)}/giờ</span>
                    </div>
                ) : (
                    <div className='pd-item-cell'>
                        <span>Chưa cấu hình</span>
                    </div>
                );
            },
        },
        ...activeSlots.map((slot) => ({
            title: (
                <button
                    type='button'
                    className={`pd-slot-column-title ${selectedSlotKey === slot.key ? 'is-selected' : ''}`}
                    onClick={() => setSelectedSlotKey(slot.key)}
                >
                    {slotRangeLabelShort(slot)}
                    {slot.kind === 'overtime' ? <small>TC</small> : null}
                </button>
            ),
            key: slot.key,
            width: 86,
            align: 'center' as const,
            className: selectedSlotKey === slot.key ? 'production-selected-column' : undefined,
            render: (_: unknown, line: ProductionLineRecord) => renderSlotCell(line, slot),
        })),
        {
            title: 'Tổng',
            dataIndex: 'totalActual',
            fixed: 'right',
            width: 100,
            align: 'right',
            render: (value, line) => (
                <div className='pd-total-cell'>
                    <strong>{number(value)}</strong>
                    <span>/ {number(line.totalTarget)}</span>
                </div>
            ),
        },
        {
            title: '% đạt',
            dataIndex: 'achievementPercent',
            fixed: 'right',
            width: 86,
            align: 'center',
            render: (value, line) =>
                line.configured && line.totalTarget > 0 ? (
                    <span className={`pd-pill tone-${achievementTone(value)}`}>{value.toFixed(1)}%</span>
                ) : (
                    <span className='pd-pill tone-neutral'>—</span>
                ),
        },
    ];

    const renderMobileLine = (line: ProductionLineRecord) => {
        const value = getSlotValue(line, selectedSlotKey);
        const run = line.runs.find((item) => item.id === value?.runId) || [...line.runs].reverse()[0];
        const overtime = Boolean(value?.overtime);
        const percent = value?.target ? (value.actual / value.target) * 100 : value?.reported ? 100 : 0;
        const tone = achievementTone(percent);
        const cardTone = !line.configured
            ? 'is-unconfigured'
            : overtime
              ? ''
              : value?.reported
                ? `tone-${tone}`
                : value?.runId
                  ? 'tone-warning'
                  : '';
        return (
            <article key={line.lineId} className={`pd-mline ${cardTone}`}>
                <button type='button' className='pd-mline__main' onClick={() => openLine(line)}>
                    <div className='pd-mline__top'>
                        <div className='pd-mline__identity'>
                            <span>{line.lineCode}</span>
                            <div>
                                <strong>{run?.itemCode || 'Chưa chọn mã hàng'}</strong>
                                <small>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</small>
                            </div>
                        </div>
                        {value?.reported ? (
                            <span className='pd-mark pd-mark--ok'>
                                <CheckCircleFilled /> Đã báo
                            </span>
                        ) : (
                            <span
                                className={`pd-mark ${!line.configured ? 'pd-mark--muted' : value?.runId ? 'pd-mark--missing' : 'pd-mark--muted'}`}
                            >
                                {!line.configured ? 'Cần thiết lập' : value?.runId ? 'Chưa báo' : 'Không chạy giờ này'}
                            </span>
                        )}
                    </div>

                    <div className='pd-mline__numbers'>
                        <div>
                            <small>Thực tế</small>
                            <strong>{value?.reported ? number(value.actual) : '—'}</strong>
                        </div>
                        <div>
                            <small>{overtime ? 'Tăng ca' : 'Khoán'}</small>
                            <strong>{overtime ? 'Không khoán' : number(value?.target || run?.hourlyQuota || 0)}</strong>
                        </div>
                        <div>
                            <small>Công nhân</small>
                            <strong>{line.workerCountConfirmed ? line.workerCount : '—'}</strong>
                        </div>
                    </div>
                </button>
                <Button
                    type={!readOnly && isMissingAtSlot(line, selectedSlotKey) ? 'primary' : 'default'}
                    onClick={() => openLine(line)}
                >
                    {readOnly ? 'Xem' : value?.reported ? 'Sửa' : line.configured ? 'Nhập' : 'Thiết lập'}
                </Button>
            </article>
        );
    };

    const kpis =
        day && day.lines.length ? (
            <>
                <div className='pd-stat'>
                    <span>Sản lượng</span>
                    <b>
                        {number(day.summary.totalActual)}
                        <small>/ {number(day.summary.totalTarget)} SP</small>
                    </b>
                </div>
                <div className='pd-stat'>
                    <span>Mức đạt</span>
                    <b className={`tone-${achievementTone(day.summary.achievementPercent)}`}>
                        {day.summary.achievementPercent.toFixed(1)}%{' '}
                        <span className={`pd-meter tone-${achievementTone(day.summary.achievementPercent)}`}>
                            <i
                                style={{
                                    width: `${Math.min(100, Math.round(day.summary.achievementPercent))}%`,
                                }}
                            />
                        </span>
                    </b>
                </div>
                <div className='pd-stat'>
                    <span>Nhân sự</span>
                    <b>
                        {number(day.summary.totalWorkers)}
                        <small>
                            {day.summary.configuredLineCount}/{day.summary.lineCount} chuyền
                        </small>
                    </b>
                </div>
                {canSeeFinancials ? (
                    <div className='pd-stat'>
                        <span>Giá trị</span>
                        <b>
                            {number(day.summary.totalAmount)}
                            <small>đ</small>
                        </b>
                    </div>
                ) : null}
            </>
        ) : undefined;

    return (
        <div className='production-page'>
            <ProductionCommandRibbon
                date={date}
                onDateChange={(value) => {
                    setDate(value);
                    setSelectedSlotKey('');
                    setSelectedLineId(null);
                }}
                plantId={plantId}
                plants={plantsQuery.data || []}
                plantsLoading={plantsQuery.isLoading}
                canSwitchPlant={canSwitchPlant}
                onPlantChange={(value) => {
                    setPlantId(value);
                    setSelectedLineId(null);
                    setSelectedSlotKey('');
                }}
                day={day}
                kpis={kpis}
                workflow
                canManage={canManage}
                canReopenLocked={canReopenLocked}
                onSetup={canManage ? () => setSetupOpen(true) : undefined}
                onRefresh={() => dayQuery.refetch()}
                refreshing={dayQuery.isFetching}
                onUpdated={refreshDayQueries}
            />

            {day && day.lines.length && isMobile ? (
                <div className='pd-pulse'>
                    <b>{number(day.summary.totalActual)}</b>/{number(day.summary.totalTarget)} SP ·{' '}
                    <b>{day.summary.achievementPercent.toFixed(1)}%</b> · {day.summary.configuredLineCount}/
                    {day.summary.lineCount} chuyền
                </div>
            ) : null}

            {dayQuery.isLoading ? (
                <div className='production-loading-state'>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            ) : dayQuery.isError ? (
                <section className='production-load-error'>
                    <Alert
                        type='error'
                        showIcon
                        message='Không tải được dữ liệu sản xuất'
                        description={errorMessage(dayQuery.error)}
                        action={
                            <Button loading={dayQuery.isFetching} onClick={() => dayQuery.refetch()}>
                                Thử lại
                            </Button>
                        }
                    />
                </section>
            ) : !day ? (
                <section className='production-empty-day'>
                    <div className='production-empty-day__date'>
                        <ClockCircleOutlined />
                        <span>{date.format('dddd, DD/MM/YYYY')}</span>
                    </div>
                    <Empty
                        description={
                            <div>
                                <strong>Ngày này chưa được khởi tạo</strong>
                                <p>Tạo ngày để xác nhận nhân sự, mã hàng và bắt đầu nhập theo giờ.</p>
                            </div>
                        }
                    >
                        <div className='production-empty-actions'>
                            {canManage && !linesQuery.data?.length ? (
                                <Button icon={<SettingOutlined />} onClick={() => setSetupOpen(true)}>
                                    Thiết lập danh mục trước
                                </Button>
                            ) : null}
                            <Button
                                type='primary'
                                size='large'
                                loading={createDayMutation.isPending}
                                onClick={() => createDayMutation.mutate()}
                            >
                                Khởi tạo ngày sản xuất
                            </Button>
                        </div>
                    </Empty>
                </section>
            ) : day.lines.length === 0 ? (
                <section className='production-empty-day'>
                    <Empty
                        description={
                            <div>
                                <strong>Cơ sở chưa có chuyền sản xuất</strong>
                                <p>
                                    {canManage
                                        ? 'Thiết lập danh mục chuyền và mã hàng trước khi nhập sản lượng.'
                                        : 'Vui lòng liên hệ quản lý cơ sở để thiết lập danh mục chuyền.'}
                                </p>
                            </div>
                        }
                    >
                        {canManage ? (
                            <Button
                                type='primary'
                                size='large'
                                icon={<SettingOutlined />}
                                onClick={() => setSetupOpen(true)}
                            >
                                Thiết lập dữ liệu ban đầu
                            </Button>
                        ) : null}
                    </Empty>
                </section>
            ) : (
                <>
                    {isMobile ? (
                        <>
                            <div className='pd-mobile-slots'>{activeSlots.map((slot) => renderSlotChip(slot, true))}</div>
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder='Tìm chuyền, mã hàng...'
                            />
                            <section className='production-mobile-list'>
                                {filteredLines.length ? (
                                    filteredLines.map(renderMobileLine)
                                ) : (
                                    <Empty description='Không có chuyền phù hợp' />
                                )}
                            </section>
                        </>
                    ) : (
                        <section className='pd-board'>
                            <div className='pd-timeline'>{activeSlots.map((slot) => renderSlotChip(slot))}</div>
                            <div className='pd-board__bar'>
                                <div className='pd-board__bar-title'>
                                    <strong>Khung {slotRangeLabel(selectedSlot) || '—'}</strong>
                                    <span>
                                        đã báo {selectedSlotSummary?.reportedLines || 0}/
                                        {selectedSlotSummary?.totalLines || 0} chuyền
                                    </span>
                                </div>
                                <Input
                                    allowClear
                                    prefix={<SearchOutlined />}
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder='Tìm chuyền, mã hàng...'
                                />
                            </div>
                            <Table<ProductionLineRecord>
                                rowKey='lineId'
                                columns={columns}
                                dataSource={filteredLines}
                                pagination={false}
                                size='middle'
                                sticky
                                scroll={{
                                    x: Math.max(880, 500 + activeSlots.length * 86),
                                    y: 'calc(100vh - 380px)',
                                }}
                                rowClassName={(line) => (!line.configured ? 'production-row-unconfigured' : '')}
                            />
                        </section>
                    )}

                    <ProductionMissingDock
                        slotLabel={slotRangeLabel(selectedSlot)}
                        missingLines={missingLines}
                        dueCount={selectedSlotSummary?.totalLines || 0}
                        readOnly={readOnly}
                        onOpenLine={(line) => openLine(line)}
                    />
                </>
            )}

            {plantId ? (
                <ProductionSetupDrawer
                    open={setupOpen}
                    plantId={plantId}
                    day={day}
                    onClose={() => setSetupOpen(false)}
                />
            ) : null}

            {day && selectedLine ? (
                <ProductionEntryDrawer
                    open={Boolean(selectedLineId)}
                    day={day as ProductionDay}
                    line={selectedLine}
                    items={itemsQuery.data || []}
                    slotKey={selectedSlotKey}
                    onClose={() => setSelectedLineId(null)}
                    onSaved={moveAfterSave}
                />
            ) : null}
        </div>
    );
};

export default ProductionPage;
