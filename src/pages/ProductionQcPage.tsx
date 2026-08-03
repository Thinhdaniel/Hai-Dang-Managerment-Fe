import {
    AuditOutlined,
    CalendarOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    ReloadOutlined,
    SearchOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, DatePicker, Empty, Input, Segmented, Select, Skeleton, Tag } from 'antd';
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

const searchText = (line: ProductionLineRecord) =>
    [line.lineCode, line.lineName, line.leaderName, ...line.runs.flatMap((run) => [run.itemCode, run.itemName])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi-VN');

const ProductionQcPage = () => {
    const { message } = App.useApp();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const { isPhone, isCompact } = useResponsive();
    const queryClient = useQueryClient();
    const slotRailRef = useRef<HTMLDivElement>(null);
    const [date, setDate] = useState<Dayjs>(() => dayjs());
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [slotKey, setSlotKey] = useState('');
    const [filter, setFilter] = useState<QcFilter>('all');
    const [search, setSearch] = useState('');
    const [selectedLineId, setSelectedLineId] = useState<string>();
    const productionDate = date.format('YYYY-MM-DD');
    const canSwitchPlant = isAdmin(role) || isDirector(role);

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
        if (!slotKey) return;
        const frame = requestAnimationFrame(() => {
            slotRailRef.current
                ?.querySelector<HTMLElement>('.pd-qc-slot.is-selected')
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
            message.success('Đã lưu kết quả QC');
            setSelectedLineId(undefined);
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
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    const eligibleLines = useMemo(
        () =>
            (day?.lines || []).filter((line) => {
                const value = getQcValue(line, slotKey);
                return Boolean(value?.runId);
            }),
        [day?.lines, slotKey]
    );
    const filteredLines = useMemo(
        () =>
            eligibleLines.filter((line) => {
                const value = getQcValue(line, slotKey);
                if (normalizedSearch && !searchText(line).includes(normalizedSearch)) return false;
                if (filter === 'pending') return !value?.reported;
                if (filter === 'defect') return Number(value?.defectQuantity || 0) > 0;
                return true;
            }),
        [eligibleLines, filter, normalizedSearch, slotKey]
    );
    const selectedLine = day?.lines.find((line) => line.lineId === selectedLineId);
    const selectedValue = selectedLine ? getQcValue(selectedLine, slotKey) : undefined;
    const slotTotal = eligibleLines.reduce(
        (sum, line) => sum + Number(getQcValue(line, slotKey)?.totalQuantity || 0),
        0
    );
    const slotPassed = eligibleLines.reduce(
        (sum, line) => sum + Number(getQcValue(line, slotKey)?.passedQuantity || 0),
        0
    );
    const slotDefect = eligibleLines.reduce(
        (sum, line) => sum + Number(getQcValue(line, slotKey)?.defectQuantity || 0),
        0
    );
    const pendingLines = eligibleLines.filter((line) => !getQcValue(line, slotKey)?.reported).length;
    const readOnly = day?.status !== 'draft';

    const renderLine = (line: ProductionLineRecord) => {
        const value = getQcValue(line, slotKey)!;
        const run = line.runs.find((item) => item.id === value.runId);
        return (
            <article
                key={line.lineId}
                className={`pd-qc-line ${value.reported ? 'is-reported' : 'is-pending'} ${value.defectQuantity ? 'has-defect' : ''}`}
            >
                <div className='pd-qc-line__identity'>
                    <span className='pd-qc-line__mark'>{line.lineCode.slice(0, 3).toUpperCase()}</span>
                    <div>
                        <strong>{line.lineCode}</strong>
                        <small>{line.leaderName || line.lineName || 'Chưa có tên chuyền'}</small>
                    </div>
                </div>
                <div className='pd-qc-line__item'>
                    <span>{run?.itemCode || 'Chưa có mã hàng'}</span>
                    <small>Sản lượng báo: {number(value.productionActual)}</small>
                </div>
                <div className='pd-qc-line__metrics'>
                    <span>
                        <small>Tổng</small>
                        <strong>{value.reported ? number(value.totalQuantity) : '—'}</strong>
                    </span>
                    <span className='is-passed'>
                        <small>Đạt</small>
                        <strong>{value.reported ? number(value.passedQuantity) : '—'}</strong>
                    </span>
                    <span className='is-defect'>
                        <small>Lỗi</small>
                        <strong>{value.reported ? number(value.defectQuantity) : '—'}</strong>
                    </span>
                </div>
                <div className='pd-qc-line__state'>
                    {value.reported ? (
                        value.defectQuantity ? (
                            <Tag color='error' icon={<WarningFilled />}>
                                Lỗi {value.defectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%
                            </Tag>
                        ) : (
                            <Tag color='success' icon={<CheckCircleFilled />}>
                                Đã kiểm
                            </Tag>
                        )
                    ) : (
                        <Tag icon={<ClockCircleOutlined />}>Chưa kiểm</Tag>
                    )}
                </div>
                <Button type={value.reported ? 'default' : 'primary'} onClick={() => setSelectedLineId(line.lineId)}>
                    {readOnly ? 'Xem' : value.reported ? 'Sửa kết quả' : 'Nhập QC'}
                </Button>
            </article>
        );
    };

    return (
        <div className='pd-qc-page'>
            <header className='pd-qc-hero'>
                <div className='pd-qc-hero__title'>
                    <span className='pd-qc-hero__icon'>
                        <AuditOutlined />
                    </span>
                    <div>
                        <small>KIỂM SOÁT CHẤT LƯỢNG</small>
                        <h1>QC theo giờ</h1>
                        <p>Đối chiếu nhanh số đạt, lỗi và tổng kiểm theo từng chuyền.</p>
                    </div>
                </div>
                <div className='pd-qc-hero__controls'>
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
                                <small>
                                    Quản lý hoặc tổ trưởng cần tạo ngày và thiết lập chuyền trước khi QC nhập.
                                </small>
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
                            message={day.status === 'locked' ? 'Ngày đã khóa sổ' : 'Ngày đã gửi duyệt'}
                            description='Kết quả QC đang ở chế độ chỉ xem.'
                        />
                    ) : null}

                    <section className='pd-qc-summary' aria-label='Tổng hợp QC trong ngày'>
                        <div className='is-total'>
                            <small>Tổng đã kiểm</small>
                            <strong>{number(day.summary.qcTotalQuantity)}</strong>
                            <span>{number(day.summary.totalActual)} SP đã báo</span>
                        </div>
                        <div className='is-passed'>
                            <small>Đạt</small>
                            <strong>{number(day.summary.qcPassedQuantity)}</strong>
                            <span>Đủ tiêu chuẩn</span>
                        </div>
                        <div className='is-defect'>
                            <small>Lỗi</small>
                            <strong>{number(day.summary.qcDefectQuantity)}</strong>
                            <span>
                                {day.summary.qcDefectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}% lỗi
                            </span>
                        </div>
                        <div className='is-pending'>
                            <small>Chờ kiểm</small>
                            <strong>{number(day.summary.qcPendingQuantity)}</strong>
                            <span>So với sản lượng báo</span>
                        </div>
                    </section>

                    <section className='pd-qc-workspace'>
                        <div className='pd-qc-slot-section'>
                            <header>
                                <div>
                                    <strong>Khung giờ kiểm</strong>
                                    <small>Chọn đúng giờ trước khi nhập kết quả.</small>
                                </div>
                                <span>
                                    {selectedSummary?.qcReportedLines || 0}/{selectedSummary?.totalLines || 0} chuyền
                                </span>
                            </header>
                            <div className='pd-qc-slots' ref={slotRailRef}>
                                {activeSlots.map((slot) => {
                                    const summary = day.slotSummaries.find((item) => item.key === slot.key);
                                    const complete =
                                        Boolean(summary?.totalLines) &&
                                        summary?.qcReportedLines === summary?.totalLines;
                                    return (
                                        <button
                                            key={slot.key}
                                            type='button'
                                            className={`pd-qc-slot ${slot.key === slotKey ? 'is-selected' : ''} ${complete ? 'is-complete' : ''}`}
                                            onClick={() => setSlotKey(slot.key)}
                                        >
                                            <span>{slotRangeLabelShort(slot)}</span>
                                            <small>
                                                {summary?.qcReportedLines || 0}/{summary?.totalLines || 0}
                                            </small>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className='pd-qc-slot-totals'>
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
                                <strong>{number(pendingLines)} chuyền</strong>
                            </span>
                        </div>

                        <div className='pd-qc-toolbar'>
                            <Segmented<QcFilter>
                                value={filter}
                                onChange={setFilter}
                                options={[
                                    { label: 'Tất cả', value: 'all' },
                                    { label: `Chưa kiểm (${pendingLines})`, value: 'pending' },
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

                        <div className='pd-qc-list-head' aria-hidden='true'>
                            <span>Chuyền</span>
                            <span>Mã hàng / sản lượng</span>
                            <span>Kết quả QC</span>
                            <span>Trạng thái</span>
                            <span>Thao tác</span>
                        </div>
                        <div className='pd-qc-lines'>
                            {filteredLines.length ? (
                                filteredLines.map(renderLine)
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        eligibleLines.length
                                            ? 'Không có chuyền phù hợp bộ lọc'
                                            : 'Khung giờ chưa có mã hàng cần kiểm'
                                    }
                                />
                            )}
                        </div>
                    </section>
                </>
            )}

            <ProductionQcEntryDrawer
                open={Boolean(selectedLine && selectedSlot && selectedValue)}
                mobile={isCompact}
                line={selectedLine}
                slot={selectedSlot}
                value={selectedValue}
                readOnly={readOnly}
                saving={saveMutation.isPending}
                deleting={deleteMutation.isPending}
                onClose={() => setSelectedLineId(undefined)}
                onSave={(payload) => selectedLine && saveMutation.mutate({ lineId: selectedLine.lineId, payload })}
                onDelete={(entryId) => selectedLine && deleteMutation.mutate({ lineId: selectedLine.lineId, entryId })}
            />
        </div>
    );
};

export default ProductionQcPage;
