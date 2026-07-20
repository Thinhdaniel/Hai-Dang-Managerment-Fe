import {
    Alert,
    App,
    Button,
    DatePicker,
    Empty,
    Grid,
    Input,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    EditOutlined,
    ReloadOutlined,
    SearchOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductionDayStatusBar from '../components/production/ProductionDayStatusBar';
import ProductionEntryDrawer from '../components/production/ProductionEntryDrawer';
import ProductionSetupDrawer from '../components/production/ProductionSetupDrawer';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { can, hasManagerAccess, isAdmin, isDirector } from '../core/lib/permissions';
import { productionService } from '../core/services/production.service';
import { plantService } from '../core/services/plant.service';
import type {
    ProductionDay,
    ProductionLineRecord,
    ProductionSlotValue,
    ProductionTimeSlot,
} from '../core/types/production';

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

type MobileView = 'entry' | 'summary';

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

const ProductionPage = () => {
    const screens = useBreakpoint();
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
    const [mobileView, setMobileView] = useState<MobileView>('entry');
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
        () => filteredLines.filter((line) => line.configured && !getSlotValue(line, selectedSlotKey)?.reported),
        [filteredLines, selectedSlotKey]
    );
    const selectedLine = day?.lines.find((line) => line.lineId === selectedLineId);

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
        const nextLine = ordered.find((line) => line.configured && !getSlotValue(line, selectedSlotKey)?.reported);
        setSelectedLineId(nextLine?.lineId || null);
        if (!nextLine) message.success('Đã hoàn tất tất cả chuyền trong khung giờ này');
    };

    const renderSlotCell = (line: ProductionLineRecord, slot: ProductionTimeSlot) => {
        const value = getSlotValue(line, slot.key);
        const readOnly = day?.status !== 'draft';
        if (!line.configured) {
            return (
                <button
                    type='button'
                    className='production-grid-cell is-unconfigured'
                    onClick={() => openLine(line, slot.key)}
                >
                    {readOnly ? <span>—</span> : <SettingOutlined />}
                </button>
            );
        }
        if (!value?.reported) {
            return (
                <button
                    type='button'
                    className='production-grid-cell is-missing'
                    onClick={() => openLine(line, slot.key)}
                >
                    <span>—</span>
                    <small>{readOnly ? 'Chưa báo' : 'Nhập'}</small>
                </button>
            );
        }
        const percent = value.target > 0 ? (value.actual / value.target) * 100 : 100;
        return (
            <button
                type='button'
                className={`production-grid-cell is-reported tone-${achievementTone(percent)}`}
                onClick={() => openLine(line, slot.key)}
            >
                <strong>{number(value.actual)}</strong>
                <small>{value.target ? `${Math.round(percent)}%` : 'Đã báo'}</small>
            </button>
        );
    };

    const columns: TableColumnsType<ProductionLineRecord> = [
        {
            title: 'Chuyền',
            key: 'line',
            fixed: 'left',
            width: 176,
            render: (_, line) => (
                <button type='button' className='production-line-identity' onClick={() => openLine(line)}>
                    <strong>{line.lineCode}</strong>
                    <span>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</span>
                </button>
            ),
        },
        {
            title: 'CN',
            dataIndex: 'workerCount',
            width: 68,
            align: 'center',
            render: (value, line) => (
                <button type='button' className='production-worker-count' onClick={() => openLine(line)}>
                    {line.workerCountConfirmed ? value : '—'}
                </button>
            ),
        },
        {
            title: 'Mã đang chạy',
            key: 'item',
            width: 148,
            render: (_, line) => {
                const active = [...line.runs].reverse().find((run) => run.status === 'active');
                return active ? (
                    <div className='production-item-cell'>
                        <strong>{active.itemCode}</strong>
                        <span>Khoán {number(active.hourlyQuota)}</span>
                    </div>
                ) : (
                    <Text type='secondary'>Chưa cấu hình</Text>
                );
            },
        },
        ...activeSlots.map((slot) => ({
            title: (
                <button
                    type='button'
                    className={`production-slot-column-title ${selectedSlotKey === slot.key ? 'is-selected' : ''}`}
                    onClick={() => setSelectedSlotKey(slot.key)}
                >
                    {slot.label}
                    {slot.kind === 'overtime' ? <small>TC</small> : null}
                </button>
            ),
            key: slot.key,
            width: 88,
            align: 'center' as const,
            className: selectedSlotKey === slot.key ? 'production-selected-column' : undefined,
            render: (_: unknown, line: ProductionLineRecord) => renderSlotCell(line, slot),
        })),
        {
            title: 'Tổng',
            dataIndex: 'totalActual',
            fixed: 'right',
            width: 104,
            align: 'right',
            render: (value, line) => (
                <div className='production-total-cell'>
                    <strong>{number(value)}</strong>
                    <span>/ {number(line.totalTarget)}</span>
                </div>
            ),
        },
        {
            title: '% đạt',
            dataIndex: 'achievementPercent',
            fixed: 'right',
            width: 90,
            align: 'center',
            render: (value) => (
                <Tag
                    color={
                        achievementTone(value) === 'success'
                            ? 'green'
                            : achievementTone(value) === 'warning'
                              ? 'gold'
                              : 'red'
                    }
                >
                    {value.toFixed(1)}%
                </Tag>
            ),
        },
    ];

    const renderMobileLine = (line: ProductionLineRecord) => {
        const value: ProductionSlotValue | undefined = getSlotValue(line, selectedSlotKey);
        const run = line.runs.find((item) => item.id === value?.runId) || [...line.runs].reverse()[0];
        const percent = value?.target ? (value.actual / value.target) * 100 : value?.reported ? 100 : 0;
        const tone = achievementTone(percent);
        return (
            <article
                key={line.lineId}
                className={`production-mobile-line ${!line.configured ? 'is-unconfigured' : value?.reported ? `tone-${tone}` : 'is-missing'}`}
            >
                <button type='button' className='production-mobile-line__main' onClick={() => openLine(line)}>
                    <div className='production-mobile-line__top'>
                        <div className='production-mobile-line__identity'>
                            <span>{line.lineCode}</span>
                            <div>
                                <strong>{run?.itemCode || 'Chưa chọn mã hàng'}</strong>
                                <small>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</small>
                            </div>
                        </div>
                        {value?.reported ? (
                            <span className='production-reported-mark'>
                                <CheckCircleFilled /> Đã báo
                            </span>
                        ) : (
                            <span className='production-missing-mark'>
                                {line.configured ? 'Chưa báo' : 'Cần thiết lập'}
                            </span>
                        )}
                    </div>

                    <div className='production-mobile-line__numbers'>
                        <div>
                            <small>Thực tế</small>
                            <strong>{value?.reported ? number(value.actual) : '—'}</strong>
                        </div>
                        <div>
                            <small>Khoán giờ</small>
                            <strong>{number(value?.target || run?.hourlyQuota || 0)}</strong>
                        </div>
                        <div>
                            <small>Công nhân</small>
                            <strong>{line.workerCountConfirmed ? line.workerCount : '—'}</strong>
                        </div>
                    </div>
                    {line.configured ? (
                        <Progress
                            percent={Math.min(100, Math.round(percent))}
                            showInfo={false}
                            size='small'
                            strokeColor={tone === 'success' ? '#15803d' : tone === 'warning' ? '#d97706' : '#dc2626'}
                            trailColor='#e8edf3'
                        />
                    ) : null}
                </button>
                <Button
                    type={day?.status === 'draft' && !value?.reported ? 'primary' : 'default'}
                    icon={<EditOutlined />}
                    onClick={() => openLine(line)}
                >
                    {day?.status !== 'draft' ? 'Xem' : value?.reported ? 'Sửa' : line.configured ? 'Nhập' : 'Thiết lập'}
                </Button>
            </article>
        );
    };

    return (
        <div className='production-page'>
            <section className='production-workbench-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Điều hành tại xưởng</span>
                    <Title level={2}>Báo sản lượng theo giờ</Title>
                    <Text type='secondary'>Nhập một lần, toàn bộ màn hình quản lý cập nhật ngay.</Text>
                </div>
                <div className='production-workbench-controls'>
                    <Select
                        value={plantId || undefined}
                        onChange={(value) => {
                            setPlantId(value);
                            setSelectedLineId(null);
                            setSelectedSlotKey('');
                        }}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        placeholder='Chọn cơ sở'
                        options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                    />
                    <DatePicker
                        value={date}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        onChange={(value) => {
                            setDate(value || dayjs());
                            setSelectedSlotKey('');
                            setSelectedLineId(null);
                        }}
                    />
                    <Tooltip title='Tải lại dữ liệu'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={dayQuery.isFetching}
                            onClick={() => dayQuery.refetch()}
                        />
                    </Tooltip>
                    {canManage && (!day || day.status === 'draft') ? (
                        <Button icon={<SettingOutlined />} onClick={() => setSetupOpen(true)}>
                            {screens.sm ? 'Thiết lập' : null}
                        </Button>
                    ) : null}
                </div>
            </section>

            {day ? (
                <ProductionDayStatusBar
                    day={day}
                    canManage={canManage}
                    canReopenLocked={canReopenLocked}
                    onUpdated={async () => {
                        setSetupOpen(false);
                        setSelectedLineId(null);
                        await queryClient.invalidateQueries({
                            queryKey: ['production', 'day', plantId, productionDate],
                        });
                        await queryClient.invalidateQueries({ queryKey: ['production', 'history', plantId] });
                    }}
                />
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
                    <section className='production-kpi-strip'>
                        <div>
                            <span>Sản lượng</span>
                            <strong>{number(day.summary.totalActual)}</strong>
                            <small>/ {number(day.summary.totalTarget)} SP</small>
                        </div>
                        <div>
                            <span>Mức đạt</span>
                            <strong className={`tone-${achievementTone(day.summary.achievementPercent)}`}>
                                {day.summary.achievementPercent.toFixed(1)}%
                            </strong>
                            <small>toàn xưởng</small>
                        </div>
                        <div>
                            <span>Nhân sự</span>
                            <strong>{number(day.summary.totalWorkers)}</strong>
                            <small>
                                {day.summary.configuredLineCount}/{day.summary.lineCount} chuyền đã xác nhận
                            </small>
                        </div>
                        <div>
                            <span>Mã hàng</span>
                            <strong>{day.summary.itemCount}</strong>
                            <small>đang ghi nhận</small>
                        </div>
                        {canSeeFinancials ? (
                            <div className='production-kpi-financial'>
                                <span>Giá trị sản lượng</span>
                                <strong>{number(day.summary.totalAmount)} đ</strong>
                                <small>theo đơn giá snapshot</small>
                            </div>
                        ) : null}
                    </section>

                    <section className='production-slot-rail' aria-label='Chọn khung giờ'>
                        {activeSlots.map((slot) => {
                            const summary = day.slotSummaries.find((item) => item.key === slot.key);
                            const complete = summary?.totalLines && summary.reportedLines === summary.totalLines;
                            return (
                                <button
                                    type='button'
                                    key={slot.key}
                                    className={`${selectedSlotKey === slot.key ? 'is-selected' : ''} ${complete ? 'is-complete' : ''}`}
                                    onClick={() => setSelectedSlotKey(slot.key)}
                                >
                                    <span>{slot.label}</span>
                                    <strong>{number(summary?.actual || 0)}</strong>
                                    <small>
                                        {summary?.reportedLines || 0}/{summary?.totalLines || 0} chuyền
                                    </small>
                                </button>
                            );
                        })}
                    </section>

                    <section className='production-toolbar'>
                        <div>
                            <Title level={4}>{selectedSlot?.label || 'Khung giờ'}</Title>
                            <Text type='secondary'>
                                Đã báo {selectedSlotSummary?.reportedLines || 0}/{selectedSlotSummary?.totalLines || 0}{' '}
                                chuyền
                            </Text>
                        </div>
                        <div className='production-toolbar__actions'>
                            {isMobile ? (
                                <Segmented<MobileView>
                                    value={mobileView}
                                    onChange={setMobileView}
                                    options={[
                                        { value: 'entry', label: 'Nhập liệu' },
                                        { value: 'summary', label: 'Tổng quan' },
                                    ]}
                                />
                            ) : null}
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder='Tìm chuyền, mã hàng...'
                            />
                        </div>
                    </section>

                    {isMobile ? (
                        mobileView === 'entry' ? (
                            <section className='production-mobile-list'>
                                {filteredLines.length ? (
                                    filteredLines.map(renderMobileLine)
                                ) : (
                                    <Empty description='Không có chuyền phù hợp' />
                                )}
                            </section>
                        ) : (
                            <section className='production-mobile-summary'>
                                <div className='production-hour-summary'>
                                    <div>
                                        <span>Thực tế {selectedSlot?.label}</span>
                                        <strong>{number(selectedSlotSummary?.actual || 0)} SP</strong>
                                    </div>
                                    <Progress
                                        type='circle'
                                        size={92}
                                        percent={
                                            selectedSlotSummary?.target
                                                ? Math.min(
                                                      100,
                                                      Math.round(
                                                          (selectedSlotSummary.actual / selectedSlotSummary.target) *
                                                              100
                                                      )
                                                  )
                                                : 0
                                        }
                                    />
                                </div>
                                <div className='production-missing-panel'>
                                    <div className='production-panel-heading'>
                                        <strong>Còn thiếu {missingLines.length} chuyền</strong>
                                        <span>Chạm để nhập ngay</span>
                                    </div>
                                    {missingLines.length ? (
                                        missingLines.map((line) => (
                                            <button key={line.lineId} type='button' onClick={() => openLine(line)}>
                                                <span>{line.lineCode}</span>
                                                <small>{line.leaderName || 'Chưa có tổ trưởng'}</small>
                                                <EditOutlined />
                                            </button>
                                        ))
                                    ) : (
                                        <div className='production-all-reported'>
                                            <CheckCircleFilled /> Tất cả chuyền đã báo
                                        </div>
                                    )}
                                </div>
                            </section>
                        )
                    ) : (
                        <div className='production-desktop-workspace'>
                            <section className='production-grid-panel'>
                                <Table<ProductionLineRecord>
                                    rowKey='lineId'
                                    columns={columns}
                                    dataSource={filteredLines}
                                    pagination={false}
                                    size='middle'
                                    sticky
                                    scroll={{
                                        x: Math.max(900, 486 + activeSlots.length * 88),
                                        y: 'calc(100vh - 430px)',
                                    }}
                                    rowClassName={(line) => (!line.configured ? 'production-row-unconfigured' : '')}
                                />
                            </section>
                            <aside className='production-missing-panel'>
                                <div className='production-panel-heading'>
                                    <strong>
                                        {missingLines.length ? `${missingLines.length} chuyền chưa báo` : 'Đã báo đủ'}
                                    </strong>
                                    <span>{selectedSlot?.label}</span>
                                </div>
                                <div className='production-hour-progress'>
                                    <Progress
                                        percent={
                                            selectedSlotSummary?.totalLines
                                                ? Math.round(
                                                      (selectedSlotSummary.reportedLines /
                                                          selectedSlotSummary.totalLines) *
                                                          100
                                                  )
                                                : 0
                                        }
                                        showInfo={false}
                                        strokeColor='#0f766e'
                                    />
                                    <span>
                                        {selectedSlotSummary?.reportedLines || 0}/{selectedSlotSummary?.totalLines || 0}
                                    </span>
                                </div>
                                <div className='production-missing-list'>
                                    {missingLines.map((line) => (
                                        <button key={line.lineId} type='button' onClick={() => openLine(line)}>
                                            <span>{line.lineCode}</span>
                                            <small>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</small>
                                            <EditOutlined />
                                        </button>
                                    ))}
                                    {!missingLines.length ? (
                                        <div className='production-all-reported'>
                                            <CheckCircleFilled />
                                            <span>Khung giờ đã hoàn tất</span>
                                        </div>
                                    ) : null}
                                </div>
                            </aside>
                        </div>
                    )}
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
