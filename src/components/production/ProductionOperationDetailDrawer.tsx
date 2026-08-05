import {
    ApartmentOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    EditOutlined,
    ExclamationCircleFilled,
    HistoryOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Empty, Progress, Tag } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useResponsive } from '../../core/hooks/useResponsive';
import { slotRangeLabel } from '../../core/lib/productionSlot';
import type { ProductionDay, ProductionMonitorOperation } from '../../core/types/production';

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);

type Props = {
    open: boolean;
    day: ProductionDay;
    operation?: ProductionMonitorOperation;
    onClose: () => void;
    onOpenEntry: (lineId: string, slotKey: string) => void;
};

const ProductionOperationDetailDrawer = ({ open, day, operation, onClose, onOpenEntry }: Props) => {
    const { isPhone } = useResponsive();
    const line = day.lines.find((item) => item.lineId === operation?.lineId);
    const slotIndex = useMemo(() => new Map(day.timeSlots.map((slot, index) => [slot.key, index])), [day.timeSlots]);
    const values = useMemo(
        () =>
            (line?.operationSlotValues || [])
                .filter((value) => value.trackId === operation?.trackId && (value.due || value.reported))
                .sort(
                    (left, right) =>
                        Number(slotIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
                        Number(slotIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER)
                ),
        [line?.operationSlotValues, operation?.trackId, slotIndex]
    );

    const achievement = operation?.targetToNow ? operation.achievementPercent : 0;
    const achievementTone = achievement >= 95 ? 'success' : achievement >= 80 ? 'warning' : 'danger';

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={isPhone ? 'bottom' : 'right'}
            height={isPhone ? 'min(92dvh, 860px)' : undefined}
            width={isPhone ? undefined : 620}
            className='production-operation-detail-drawer'
            destroyOnHidden
            title={
                <div className='production-operation-detail-title'>
                    <span>
                        <ApartmentOutlined />
                    </span>
                    <div>
                        <small>THEO DÕI CÔNG ĐOẠN</small>
                        <strong>{operation?.operationName || 'Chi tiết công đoạn'}</strong>
                    </div>
                </div>
            }
        >
            {!operation || !line ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không tìm thấy dữ liệu công đoạn' />
            ) : (
                <div className='production-operation-detail'>
                    <section className='production-operation-detail__identity'>
                        <div>
                            <span>{operation.lineCode}</span>
                            <div>
                                <strong>{operation.operationName}</strong>
                                <small>
                                    {operation.operationCode} · mã {operation.itemCode}
                                </small>
                            </div>
                        </div>
                        <Tag color={operation.required ? 'blue' : 'default'}>
                            {operation.required ? 'Bắt buộc' : 'Tham khảo'}
                        </Tag>
                    </section>

                    <section className='production-operation-detail__metrics'>
                        <div>
                            <span>Thực tế đến giờ</span>
                            <strong>
                                {number(operation.actualToNow)} <small>{operation.unit}</small>
                            </strong>
                            <em>/ {number(operation.targetToNow)} theo khoán</em>
                        </div>
                        <div>
                            <span>Mức đạt</span>
                            <strong className={`tone-${achievementTone}`}>
                                {operation.targetToNow > 0 ? `${operation.achievementPercent.toFixed(1)}%` : '—'}
                            </strong>
                            <em>{operation.behindSlotKeys.length} khung dưới 80%</em>
                        </div>
                        <div>
                            <span>Độ phủ nhập liệu</span>
                            <strong>
                                {operation.required && operation.expectedEntries
                                    ? `${operation.coveragePercent.toFixed(1)}%`
                                    : 'Tham khảo'}
                            </strong>
                            <em>
                                {operation.required
                                    ? `${operation.reportedEntries}/${operation.expectedEntries} lượt đến hạn`
                                    : `${operation.reportedEntries} lượt đã nhập`}
                            </em>
                        </div>
                    </section>

                    {operation.targetToNow > 0 ? (
                        <Progress
                            className='production-operation-detail__progress'
                            percent={Math.min(100, Math.round(operation.achievementPercent))}
                            showInfo={false}
                            strokeColor={
                                operation.achievementPercent >= 95
                                    ? '#067647'
                                    : operation.achievementPercent >= 80
                                      ? '#b54708'
                                      : '#b42318'
                            }
                        />
                    ) : null}

                    {operation.transitionQuantity > 0 ? (
                        <div className='production-operation-detail__transition'>
                            <HistoryOutlined />
                            <span>
                                <strong>
                                    {number(operation.transitionQuantity)} {operation.unit} hàng chuyển tiếp
                                </strong>
                                <small>Được giữ riêng, không cộng vào khoán của mã hàng hiện tại.</small>
                            </span>
                        </div>
                    ) : null}

                    <section className='production-operation-detail__timeline'>
                        <header>
                            <div>
                                <strong>Diễn biến theo giờ</strong>
                                <small>Sản lượng bán thành phẩm, không cộng vào thành phẩm tính lương.</small>
                            </div>
                            {operation.lastUpdatedAt ? (
                                <span>Cập nhật {dayjs(operation.lastUpdatedAt).format('HH:mm DD/MM')}</span>
                            ) : null}
                        </header>

                        {values.length ? (
                            <div className='production-operation-detail__slots'>
                                {values.map((value) => {
                                    const slot = day.timeSlots.find((item) => item.key === value.key);
                                    const missing = operation.missingSlotKeys.includes(value.key);
                                    const behind = operation.behindSlotKeys.includes(value.key);
                                    const current = operation.currentSlot?.key === value.key;
                                    const percent = value.target > 0 ? (value.actual / value.target) * 100 : 0;
                                    const state = value.transition
                                        ? 'transition'
                                        : missing
                                          ? 'missing'
                                          : behind
                                            ? 'behind'
                                            : value.reported
                                              ? 'complete'
                                              : current
                                                ? 'current'
                                                : 'future';
                                    return (
                                        <article className={`is-${state}`} key={`${value.trackId}-${value.key}`}>
                                            <span className='production-operation-detail__slot-state'>
                                                {state === 'complete' ? (
                                                    <CheckCircleFilled />
                                                ) : state === 'missing' || state === 'behind' ? (
                                                    <ExclamationCircleFilled />
                                                ) : (
                                                    <ClockCircleOutlined />
                                                )}
                                            </span>
                                            <div className='production-operation-detail__slot-copy'>
                                                <div>
                                                    <strong>{slot ? slotRangeLabel(slot) : value.key}</strong>
                                                    <Tag>
                                                        {value.transition
                                                            ? 'Chuyển tiếp'
                                                            : missing
                                                              ? 'Thiếu nhập'
                                                              : behind
                                                                ? `Đạt ${percent.toFixed(0)}%`
                                                                : value.reported
                                                                  ? 'Đã nhập'
                                                                  : current
                                                                    ? 'Đang chạy'
                                                                    : 'Chưa đến giờ'}
                                                    </Tag>
                                                </div>
                                                <div className='production-operation-detail__slot-numbers'>
                                                    <span>
                                                        <small>Thực tế</small>
                                                        <b>
                                                            {value.reported ? number(value.actual) : '—'} {value.unit}
                                                        </b>
                                                    </span>
                                                    <span>
                                                        <small>Khoán</small>
                                                        <b>{value.target > 0 ? number(value.target) : '—'}</b>
                                                    </span>
                                                    <span>
                                                        <small>Người nhập</small>
                                                        <b>{value.updatedByName || value.enteredByName || '—'}</b>
                                                    </span>
                                                </div>
                                                {value.note ? <p>{value.note}</p> : null}
                                            </div>
                                            {day.status === 'draft' && value.due ? (
                                                <Button
                                                    type='text'
                                                    icon={<EditOutlined />}
                                                    aria-label={`Mở ô nhập ${value.operationName} ${value.key}`}
                                                    onClick={() => onOpenEntry(operation.lineId, value.key)}
                                                />
                                            ) : null}
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa phát sinh khung theo dõi' />
                        )}
                    </section>
                </div>
            )}
        </Drawer>
    );
};

export default ProductionOperationDetailDrawer;
