import {
    CheckCircleFilled,
    ClockCircleOutlined,
    DollarOutlined,
    ExpandOutlined,
    FullscreenExitOutlined,
    ReloadOutlined,
    TeamOutlined,
    ThunderboltOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Empty, Segmented, Select, Skeleton, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { slotRangeLabel, slotRangeLabelShort } from '../core/lib/productionSlot';
import { plantService } from '../core/services/plant.service';
import ProductionLedgerCards, { type LedgerRow } from '../components/production/ProductionLedgerCards';
import { useResponsive } from '../core/hooks/useResponsive';
import { productionService } from '../core/services/production.service';
import type {
    ProductionBoard,
    ProductionBoardLine,
    ProductionBoardLineStatus,
    ProductionBoardSlot,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const money = (value = 0) =>
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    }).format(value);
// Tiền rút gọn theo quy ước Việt: dưới 1 triệu ghi đủ, trên thì "triệu"/"tỷ".
// KHÔNG dùng Intl notation:compact vì vi-VN sinh "114 N" (N = nghìn) gây khó hiểu.
const shortMoney = (value = 0) => {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value / 1e9)} tỷ`;
    if (abs >= 1e6) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / 1e6)} triệu`;
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} đ`;
};
const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);
const cacheKey = (plantId: string, date: string) => `production-board:${plantId}:${date}`;

type BoardMode = 'overview' | 'line';

const statusMeta: Record<
    ProductionBoardLineStatus,
    { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
    not_configured: { label: 'Chưa thiết lập', tone: 'neutral' },
    waiting: { label: 'Đang khởi động', tone: 'info' },
    missing: { label: 'Thiếu báo cáo', tone: 'warning' },
    critical: { label: 'Chậm nghiêm trọng', tone: 'danger' },
    at_risk: { label: 'Cần bù nhịp', tone: 'warning' },
    on_track: { label: 'Đúng nhịp', tone: 'success' },
    ahead: { label: 'Vượt nhịp', tone: 'success' },
};

const readCachedBoard = (plantId: string, date: string): ProductionBoard | null => {
    if (!plantId) return null;
    try {
        const value = sessionStorage.getItem(cacheKey(plantId, date));
        return value ? (JSON.parse(value) as ProductionBoard) : null;
    } catch {
        return null;
    }
};

const ProgressTrack = ({ value, tone }: { value: number; tone: string }) => (
    <div className='production-board-progress' aria-label={`Đạt ${number(value)} phần trăm`}>
        <span className={`tone-${tone}`} style={{ width: `${clampPercent(value)}%` }} />
    </div>
);

const LineCard = ({ line, onOpen }: { line: ProductionBoardLine; onOpen: () => void }) => {
    const meta = statusMeta[line.status];
    const incomeGap = line.day.projectedIncomeGap;
    // Con số quản trị quan tâm nhất: hụt/vượt bao nhiêu SP so với khoán các giờ đã chốt.
    const hasCheckpoint = line.checkpoint.target > 0;
    const gap = line.checkpoint.gap;
    const gapTone = !hasCheckpoint ? 'neutral' : gap < 0 ? 'behind' : 'ahead';
    return (
        <button type='button' className={`production-board-line-card tone-${meta.tone}`} onClick={onOpen}>
            <span className='production-board-line-card__header'>
                <span>
                    <strong>{line.lineCode}</strong>
                    <small>
                        {line.leaderName || line.lineName || 'Chưa đặt tên chuyền'} · {line.workerCount} CN
                    </small>
                </span>
                <em className={`production-board-status tone-${meta.tone}`}>
                    {meta.tone === 'success' ? (
                        <CheckCircleFilled />
                    ) : meta.tone === 'danger' ? (
                        <WarningFilled />
                    ) : null}
                    {meta.label}
                </em>
            </span>

            <span className='production-board-line-card__hero'>
                <span className={`production-board-line-card__gap is-${gapTone}`}>
                    <small>So với khoán đến giờ</small>
                    <strong>
                        {hasCheckpoint ? (
                            <>
                                {gap < 0 ? '−' : gap > 0 ? '+' : ''}
                                {number(Math.abs(gap))} <i>SP</i>
                            </>
                        ) : (
                            '—'
                        )}
                    </strong>
                </span>
                <span className='production-board-line-card__percent'>
                    <small>Mức đạt</small>
                    <b>{hasCheckpoint ? `${number(line.checkpoint.achievementPercent)}%` : '—'}</b>
                </span>
            </span>
            <ProgressTrack value={line.checkpoint.achievementPercent} tone={meta.tone} />
            <span className='production-board-line-card__meta'>
                <span>
                    Đã chốt <b>{number(line.checkpoint.actual)}</b> / {number(line.checkpoint.target)} SP
                </span>
                <span>{line.activeItem ? `Mã ${line.activeItem.itemCode}` : 'Chưa có mã hàng'}</span>
            </span>

            <span className='production-board-line-card__money'>
                <span>
                    <small>Giá trị đã làm</small>
                    <strong>{shortMoney(line.day.actualAmount)}</strong>
                </span>
                <span>
                    <small>TN BQ/người</small>
                    <strong>{shortMoney(line.day.averageIncome)}</strong>
                </span>
                <span>
                    <small>Cuối ngày/người</small>
                    <strong
                        className={
                            incomeGap === undefined ? 'is-pending' : incomeGap < 0 ? 'is-behind' : 'is-on-track'
                        }
                    >
                        {line.day.projectedAverageIncome === undefined
                            ? 'Chờ số liệu'
                            : shortMoney(line.day.projectedAverageIncome)}
                    </strong>
                </span>
            </span>

            <span className={`production-board-line-card__guidance tone-${line.guidance.tone}`}>
                <b>{line.guidance.title}</b>
                <small>{line.guidance.description}</small>
            </span>
        </button>
    );
};

const rateTone = (percent: number) => (percent >= 95 ? 'is-ok' : percent >= 80 ? 'is-warn' : 'is-danger');

// Sổ khoán theo giờ — trình bày quen thuộc như bảng Excel của xưởng:
// mỗi chuyền 3 dòng (Khoán / Thực tế / Tỉ lệ) chạy ngang các khung giờ.
// Phân cấp thị giác: Thực tế là dòng chính, Khoán là nền tham chiếu, Tỉ lệ kèm micro-bar.
const BoardLedger = ({
    board,
    onOpenLine,
    isPhone,
}: {
    board: ProductionBoard;
    onOpenLine: (lineId: string) => void;
    isPhone: boolean;
}) => {
    const slotColumns = board.lines.find((line) => line.slots.length)?.slots || [];
    if (!slotColumns.length) return null;

    if (isPhone) {
        const rows: LedgerRow[] = board.lines.map((line) => ({
            id: line.lineId,
            code: line.lineCode,
            sub: line.leaderName || line.lineName,
            itemCode: line.activeItem?.itemCode,
            workerCount: line.workerCount,
            totalTarget: line.day.target,
            totalActual: line.day.actual,
            percent: line.day.target > 0 ? (line.day.actual / line.day.target) * 100 : null,
            income: line.day.actualAmount,
            cells: line.slots.map((slot) => ({
                key: slot.key,
                label: slotRangeLabelShort(slot),
                overtime: Boolean(slot.overtime),
                planned: slot.state !== 'not_planned',
                reported: slot.reported,
                missing: slot.due && !slot.reported && slot.state !== 'not_planned',
                target: slot.target,
                actual: slot.actual,
            })),
        }));
        return <ProductionLedgerCards rows={rows} onOpenLine={onOpenLine} />;
    }

    return (
        <div className='production-board-ledger-wrap'>
            <table className='production-board-ledger'>
                <thead>
                    <tr>
                        <th className='lg-line'>Chuyền</th>
                        <th>Mã hàng</th>
                        <th>CN</th>
                        <th>Đơn giá</th>
                        <th className='lg-kind' aria-label='Chỉ tiêu' />
                        {slotColumns.map((slot) => (
                            <th key={slot.key} className={slot.current ? 'is-current' : undefined}>
                                {slotRangeLabelShort(slot)}
                                {slot.current ? <i aria-label='đang chạy' /> : null}
                            </th>
                        ))}
                        <th className='lg-total'>Tổng</th>
                        <th className='lg-income'>TN lũy kế</th>
                    </tr>
                </thead>
                <tbody>
                    {board.lines.map((line) => {
                        const dayPercent = line.day.target > 0 ? (line.day.actual / line.day.target) * 100 : null;
                        return (
                            <Fragment key={line.lineId}>
                                <tr className='lg-row-quota'>
                                    <th rowSpan={3} className='lg-line'>
                                        <button type='button' onClick={() => onOpenLine(line.lineId)}>
                                            <b>{line.lineCode}</b>
                                            <small>{line.leaderName || line.lineName || '—'}</small>
                                        </button>
                                    </th>
                                    <td rowSpan={3} className='lg-item'>
                                        {line.activeItem?.itemCode || '—'}
                                    </td>
                                    <td rowSpan={3} className='lg-worker'>
                                        {line.workerCount || '—'}
                                    </td>
                                    <td rowSpan={3} className='lg-price'>
                                        {line.activeItem ? (
                                            <>
                                                {number(line.activeItem.unitPrice)}
                                                <i>đ</i>
                                            </>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <th className='lg-kind'>Khoán</th>
                                    {line.slots.map((slot) => (
                                        <td
                                            key={slot.key}
                                            className={[slot.current ? 'is-current' : '', slot.overtime ? 'is-ot' : '']
                                                .filter(Boolean)
                                                .join(' ')}
                                        >
                                            {slot.state === 'not_planned'
                                                ? ''
                                                : slot.overtime
                                                  ? 'TC'
                                                  : number(slot.target)}
                                        </td>
                                    ))}
                                    <td className='lg-total'>{number(line.day.target)}</td>
                                    <td rowSpan={3} className='lg-income'>
                                        {number(line.day.actualAmount)}
                                        <i>đ</i>
                                    </td>
                                </tr>
                                <tr className='lg-row-actual'>
                                    <th className='lg-kind'>Thực tế</th>
                                    {line.slots.map((slot) => {
                                        const missing = slot.due && !slot.reported && slot.state !== 'not_planned';
                                        return (
                                            <td
                                                key={slot.key}
                                                className={[
                                                    missing ? 'is-missing' : '',
                                                    slot.current ? 'is-current' : '',
                                                    !slot.due && !slot.current ? 'is-future' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                            >
                                                {slot.reported ? (
                                                    number(slot.actual)
                                                ) : missing ? (
                                                    <span className='lg-missing-dot' />
                                                ) : (
                                                    ''
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className='lg-total'>{number(line.day.actual)}</td>
                                </tr>
                                <tr className='lg-row-rate'>
                                    <th className='lg-kind'>Tỉ lệ</th>
                                    {line.slots.map((slot) => {
                                        const percent =
                                            slot.reported && slot.target > 0 ? (slot.actual / slot.target) * 100 : null;
                                        return (
                                            <td
                                                key={slot.key}
                                                className={[
                                                    percent === null ? '' : `${rateTone(percent)} has-bar`,
                                                    slot.current ? 'is-current' : '',
                                                    !slot.due && !slot.current ? 'is-future' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                style={
                                                    percent === null
                                                        ? undefined
                                                        : ({
                                                              '--lg-rate': Math.min(1, percent / 100),
                                                          } as React.CSSProperties)
                                                }
                                            >
                                                {percent === null ? '' : `${Math.round(percent)}%`}
                                            </td>
                                        );
                                    })}
                                    <td
                                        className={`lg-total ${dayPercent === null ? '' : rateTone(dayPercent)}`}
                                    >
                                        {dayPercent === null ? '' : `${Math.round(dayPercent)}%`}
                                    </td>
                                </tr>
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const IncomeMetric = ({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) => (
    <div className={`production-board-income-metric ${tone ? `tone-${tone}` : ''}`}>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
    </div>
);

const FocusLineBoard = ({ line }: { line: ProductionBoardLine }) => {
    const meta = statusMeta[line.status];
    const projectedGap = line.day.projectedIncomeGap;
    const projectedPercent =
        line.day.projectedAverageIncome !== undefined && line.day.targetAverageIncome > 0
            ? (line.day.projectedAverageIncome / line.day.targetAverageIncome) * 100
            : 0;

    return (
        <div className={`production-board-focus tone-${meta.tone}`}>
            <section className='production-board-focus__identity'>
                <div>
                    <span className='production-board-focus__eyebrow'>BẢNG NHỊP CHUYỀN</span>
                    <h1>{line.lineCode}</h1>
                    <p>{line.lineName || line.leaderName || 'Chuyền sản xuất'}</p>
                </div>
                <div className='production-board-focus__order'>
                    <small>Mã hàng đang chạy</small>
                    <strong>{line.activeItem?.itemCode || 'Chưa thiết lập'}</strong>
                    <span>{line.activeItem?.itemName || line.activeItem?.orderCode || 'Chờ xác nhận đầu ngày'}</span>
                    {line.activeItem?.orderCode && line.activeItem?.itemName ? (
                        <em>{line.activeItem.orderCode}</em>
                    ) : null}
                </div>
                <div className='production-board-focus__workers'>
                    <TeamOutlined />
                    <strong>{line.workerCount}</strong>
                    <span>công nhân</span>
                </div>
                <div className={`production-board-status production-board-status--large tone-${meta.tone}`}>
                    {meta.tone === 'success' ? <CheckCircleFilled /> : <WarningFilled />}
                    {meta.label}
                </div>
            </section>

            <section className='production-board-focus__main'>
                <div className='production-board-score'>
                    <div
                        className={`production-board-score__ring tone-${meta.tone}`}
                        style={
                            {
                                '--board-score': `${clampPercent(line.checkpoint.achievementPercent) * 3.6}deg`,
                            } as React.CSSProperties
                        }
                    >
                        <div>
                            <strong>{number(line.checkpoint.achievementPercent)}%</strong>
                            <span>nhịp đã chốt</span>
                        </div>
                    </div>
                    <p>
                        <strong>{number(line.checkpoint.actual)}</strong>
                        <span>/ {number(line.checkpoint.target)} SP</span>
                    </p>
                    <small>Các khung giờ đã kết thúc</small>
                </div>

                <div className='production-board-focus__numbers'>
                    <div>
                        <small>Sản lượng hôm nay</small>
                        <strong>{number(line.day.actual)} SP</strong>
                        <span>Khoán ngày {number(line.day.target)} SP</span>
                    </div>
                    <div className={line.checkpoint.gap < 0 ? 'is-behind' : 'is-ahead'}>
                        <small>Chênh lệch đã chốt</small>
                        <strong>
                            {line.checkpoint.gap > 0 ? '+' : ''}
                            {number(line.checkpoint.gap)} SP
                        </strong>
                        <span>
                            {line.checkpoint.amountGap >= 0 ? 'Vượt' : 'Thiếu'}{' '}
                            {money(Math.abs(line.checkpoint.amountGap))}
                        </span>
                    </div>
                    <div>
                        <small>Khoán đã tạo</small>
                        <strong>{money(line.day.actualAmount)}</strong>
                        <span>
                            {line.activeItem ? `${money(line.activeItem.unitPrice)}/SP hiện tại` : 'Chưa có đơn giá'}
                        </span>
                    </div>
                    <div>
                        <small>Còn lại để đạt khoán</small>
                        <strong>{number(line.day.remaining)} SP</strong>
                        <span>Cần bình quân {number(line.day.requiredPer15)} SP/15 phút</span>
                    </div>
                </div>

                <div className={`production-board-guidance tone-${line.guidance.tone}`}>
                    <span className='production-board-guidance__icon'>
                        {line.guidance.tone === 'success' ? <CheckCircleFilled /> : <ThunderboltOutlined />}
                    </span>
                    <span>
                        <strong>{line.guidance.title}</strong>
                        <p>{line.guidance.description}</p>
                    </span>
                </div>
            </section>

            <section className='production-board-focus__lower'>
                <div className='production-board-income-panel'>
                    <div className='production-board-section-title'>
                        <span>
                            <DollarOutlined />
                            <b>Thu nhập khoán tạm tính</b>
                        </span>
                        <small>Tính trên {line.workerCount} công nhân đã xác nhận</small>
                    </div>
                    <div className='production-board-income-grid'>
                        <IncomeMetric
                            label='Hiện tại/người'
                            value={money(line.day.averageIncome)}
                            note={`Tổng giá trị ${money(line.day.actualAmount)}`}
                        />
                        <IncomeMetric
                            label='Mức khi đạt khoán'
                            value={money(line.day.targetAverageIncome)}
                            note={`Tổng khoán ${money(line.day.targetAmount)}`}
                        />
                        <IncomeMetric
                            label='Dự kiến cuối ngày'
                            value={
                                line.day.projectedAverageIncome === undefined
                                    ? 'Chờ đủ báo cáo'
                                    : money(line.day.projectedAverageIncome)
                            }
                            note={
                                projectedGap === undefined
                                    ? 'Không dự báo khi đang thiếu dữ liệu'
                                    : projectedGap >= 0
                                      ? `Cao hơn mức khoán ${money(projectedGap)}`
                                      : `Thấp hơn mức khoán ${money(Math.abs(projectedGap))}`
                            }
                            tone={projectedGap === undefined ? 'neutral' : projectedGap < 0 ? 'danger' : 'success'}
                        />
                    </div>
                    {line.day.projectedAverageIncome !== undefined ? (
                        <div className='production-board-income-track'>
                            <span style={{ width: `${clampPercent(projectedPercent)}%` }} />
                            <small>{number(projectedPercent)}% mức thu nhập khoán</small>
                        </div>
                    ) : null}
                    {line.day.overQuotaAmount > 0 ? (
                        <div className='production-board-overquota'>
                            <CheckCircleFilled />
                            <span>
                                Đã vượt toàn bộ khoán ngày <b>{number(line.day.overQuotaQuantity)} SP</b>, giá trị vượt{' '}
                                <b>{money(line.day.overQuotaAmount)}</b>
                            </span>
                        </div>
                    ) : null}
                </div>

                <div className='production-board-slot-panel'>
                    <div className='production-board-section-title'>
                        <span>
                            <ClockCircleOutlined />
                            <b>Khung hiện tại</b>
                        </span>
                        <small>{slotRangeLabel(line.currentSlot) || 'Ngoài giờ sản xuất'}</small>
                    </div>
                    {line.currentSlot ? (
                        <>
                            <div className='production-board-slot-clock'>
                                <span>
                                    <small>Còn lại</small>
                                    <strong>{line.currentSlot.remainingMinutes} phút</strong>
                                </span>
                                <span>
                                    <small>Mục tiêu khung</small>
                                    <strong>{number(line.currentSlot.target)} SP</strong>
                                </span>
                            </div>
                            <div className='production-board-slot-requirement'>
                                <small>Cần đạt trong khung này để bắt kịp</small>
                                <strong>{number(line.currentSlot.requiredQuantity)} SP</strong>
                                <span>{number(line.currentSlot.requiredPer15)} SP mỗi 15 phút</span>
                            </div>
                            <div className='production-board-slot-live'>
                                <span>Kế hoạch tới phút này: {number(line.live.targetToNow)} SP</span>
                                <span>Hệ thống đã ghi nhận: {number(line.live.actualToNow)} SP</span>
                            </div>
                            {line.currentSlot.carryShortfall > 0 ? (
                                <p className='production-board-slot-carry'>
                                    Đã cộng {number(line.currentSlot.carryShortfall)} SP còn thiếu từ các giờ trước.
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có khung sản xuất đang chạy' />
                    )}
                </div>
            </section>

            <section className='production-board-timeline' aria-label='Tiến độ theo khung giờ'>
                {line.slots.map((slot) => (
                    <div key={slot.key} className={`production-board-timeline__slot state-${slot.state}`}>
                        <span>{slotRangeLabelShort(slot)}</span>
                        <strong>{slot.reported ? number(slot.actual) : slot.current ? 'Đang chạy' : '—'}</strong>
                        <small>{slot.overtime ? 'Tăng ca' : `Khoán ${number(slot.target)}`}</small>
                    </div>
                ))}
            </section>
        </div>
    );
};

const ProductionBoardPage = () => {
    const { isPhone, isCompact, isWide } = useResponsive();
    const pageRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const requestedPlant = searchParams.get('plantId') || '';
    const requestedDate = searchParams.get('date');
    const requestedLine = searchParams.get('lineId') || '';
    const [plantId, setPlantId] = useState(requestedPlant || user?.plantId || '');
    const [date, setDate] = useState<Dayjs>(() => (requestedDate ? dayjs(requestedDate) : dayjs()));
    const [mode, setMode] = useState<BoardMode>(requestedLine ? 'line' : 'overview');
    const [selectedLineId, setSelectedLineId] = useState(requestedLine);
    const [pageIndex, setPageIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [online, setOnline] = useState(() => navigator.onLine);
    const [realtimeConnected, setRealtimeConnected] = useState(() => Boolean(socket?.connected));
    const [now, setNow] = useState(() => Date.now());
    const productionDate = date.format('YYYY-MM-DD');
    const canSwitchPlant = isAdmin(role) || isDirector(role);

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

    const boardQuery = useQuery({
        queryKey: ['production', 'board', plantId, productionDate],
        queryFn: () => productionService.getBoard(plantId, productionDate),
        enabled: Boolean(plantId),
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
        retry: 1,
    });

    const [cachedBoard, setCachedBoard] = useState<ProductionBoard | null>(() =>
        readCachedBoard(plantId, productionDate)
    );

    useEffect(() => {
        setCachedBoard(readCachedBoard(plantId, productionDate));
    }, [plantId, productionDate]);

    useEffect(() => {
        if (!boardQuery.data) return;
        setCachedBoard(boardQuery.data);
        try {
            sessionStorage.setItem(cacheKey(plantId, productionDate), JSON.stringify(boardQuery.data));
        } catch {
            // Bộ nhớ riêng tư hoặc đầy không được làm gián đoạn màn hình chuyền.
        }
    }, [boardQuery.data, plantId, productionDate]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleConnect = () => setRealtimeConnected(true);
        const handleDisconnect = () => setRealtimeConnected(false);
        const handleUpdate = (payload: { plantId: string; productionDate: string }) => {
            if (payload.plantId !== plantId || payload.productionDate !== productionDate) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'board', plantId, productionDate] });
        };
        setRealtimeConnected(socket.connected);
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('production:updated', handleUpdate);
        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('production:updated', handleUpdate);
        };
    }, [plantId, productionDate, queryClient, socket]);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === pageRef.current);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const matchingCachedBoard =
        cachedBoard?.plantId === plantId && cachedBoard.productionDate === productionDate ? cachedBoard : null;
    const board = boardQuery.data === undefined ? matchingCachedBoard : boardQuery.data;
    const lines = board?.lines || [];
    const selectedLine = lines.find((line) => line.lineId === selectedLineId) || lines[0];
    const pageSize = isCompact ? Math.max(lines.length, 1) : isWide ? 8 : 6;
    const pageCount = Math.max(1, Math.ceil(lines.length / pageSize));
    const visibleLines = lines.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

    useEffect(() => {
        if (!lines.length) return;
        if (!selectedLineId || !lines.some((line) => line.lineId === selectedLineId)) {
            setSelectedLineId(lines[0].lineId);
        }
    }, [lines, selectedLineId]);

    useEffect(() => {
        setPageIndex(0);
    }, [plantId, productionDate, pageSize]);

    useEffect(() => {
        if (!isFullscreen || mode !== 'overview' || pageCount <= 1) return;
        const timer = window.setInterval(() => setPageIndex((current) => (current + 1) % pageCount), 12_000);
        return () => window.clearInterval(timer);
    }, [isFullscreen, mode, pageCount]);

    const sourceAgeSeconds = board ? Math.max(0, Math.floor((now - new Date(board.asOf).getTime()) / 1_000)) : 0;
    const stale = !online || !realtimeConnected || boardQuery.isError || sourceAgeSeconds > 45;
    const usingCache = Boolean(boardQuery.data === undefined && matchingCachedBoard);
    const currentClock = useMemo(
        () =>
            new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }).format(now),
        [now]
    );

    const updateUrl = (changes: Record<string, string | undefined>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(changes).forEach(([key, value]) => {
            if (value) next.set(key, value);
            else next.delete(key);
        });
        setSearchParams(next, { replace: true });
    };

    const changeMode = (nextMode: BoardMode) => {
        setMode(nextMode);
        updateUrl({ lineId: nextMode === 'line' ? selectedLine?.lineId : undefined });
    };

    const openLine = (lineId: string) => {
        setSelectedLineId(lineId);
        setMode('line');
        updateUrl({ lineId });
    };

    const toggleFullscreen = async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }
        await pageRef.current?.requestFullscreen();
    };

    return (
        <div ref={pageRef} className={`production-board-page ${isFullscreen ? 'is-fullscreen' : ''}`}>
            <section className='production-board-toolbar'>
                <div>
                    <Title level={3}>Bảng nhịp chuyền</Title>
                    <Text>Tiến độ, giá trị khoán và thu nhập dự kiến theo thời gian thực</Text>
                </div>
                <div className='production-board-toolbar__controls'>
                    <DatePicker
                        value={date}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        onChange={(value) => {
                            if (!value) return;
                            setDate(value);
                            updateUrl({ date: value.format('YYYY-MM-DD') });
                        }}
                    />
                    <Select
                        value={plantId || undefined}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        placeholder='Chọn cơ sở'
                        options={(plantsQuery.data || []).map((plant) => ({ label: plant.name, value: plant.id }))}
                        onChange={(value) => {
                            setPlantId(value);
                            updateUrl({ plantId: value, lineId: undefined });
                        }}
                    />
                    <Segmented<BoardMode>
                        value={mode}
                        options={[
                            { label: 'Toàn cơ sở', value: 'overview' },
                            { label: 'Một chuyền', value: 'line' },
                        ]}
                        onChange={changeMode}
                    />
                    {mode === 'line' ? (
                        <Select
                            value={selectedLine?.lineId}
                            placeholder='Chọn chuyền'
                            options={lines.map((line) => ({
                                label: `${line.lineCode}${line.lineName ? ` · ${line.lineName}` : ''}`,
                                value: line.lineId,
                            }))}
                            onChange={openLine}
                        />
                    ) : null}
                    <Tooltip title='Tải lại số liệu'>
                        <Button
                            icon={<ReloadOutlined spin={boardQuery.isFetching} />}
                            onClick={() => void boardQuery.refetch()}
                        />
                    </Tooltip>
                    <Button type='primary' icon={<ExpandOutlined />} onClick={() => void toggleFullscreen()}>
                        Toàn màn hình
                    </Button>
                </div>
            </section>

            {stale && board ? (
                <Alert
                    className='production-board-stale'
                    type='warning'
                    showIcon
                    message={
                        usingCache || !online ? 'Đang hiển thị bản lưu gần nhất' : 'Kết nối realtime đang gián đoạn'
                    }
                    description={`Số liệu được máy chủ xác nhận cách đây ${sourceAgeSeconds} giây. Không dùng để kết luận tiến độ cho tới khi kết nối trở lại.`}
                />
            ) : null}

            {boardQuery.isLoading && !board ? (
                <div className='production-board-loading'>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            ) : boardQuery.isError && !board ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được bảng nhịp chuyền'
                    description='Kiểm tra kết nối mạng hoặc quyền truy cập rồi thử lại.'
                    action={<Button onClick={() => void boardQuery.refetch()}>Thử lại</Button>}
                />
            ) : !board ? (
                <Empty
                    className='production-board-empty'
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={`Chưa khởi tạo ngày sản xuất ${date.format('DD/MM/YYYY')}`}
                />
            ) : (
                <section className='production-board-stage'>
                    <header className='production-board-stage__header'>
                        <div className='production-board-stage__brand'>
                            <img src='/brand/company-logo.png' alt='' />
                            <span>
                                <small>HẢI ĐĂNG PRODUCTION</small>
                                <strong>{board.plantName || board.plantCode || 'Bảng sản xuất'}</strong>
                            </span>
                        </div>
                        <div className='production-board-stage__session'>
                            <span>
                                Ngày {dayjs(board.productionDate).format('DD/MM/YYYY')}
                                {board.currentSlot
                                    ? ` · ${slotRangeLabel(board.currentSlot)}`
                                    : ' · Ngoài khung sản xuất'}
                            </span>
                            <strong>{currentClock}</strong>
                            <em className={stale ? 'is-stale' : 'is-live'}>
                                <i /> {stale ? 'Chờ đồng bộ' : 'Đang trực tuyến'}
                            </em>
                        </div>
                        {isFullscreen ? (
                            <Tooltip title='Thoát toàn màn hình'>
                                <button
                                    type='button'
                                    className='production-board-exit-fullscreen'
                                    onClick={() => void toggleFullscreen()}
                                >
                                    <FullscreenExitOutlined />
                                </button>
                            </Tooltip>
                        ) : null}
                    </header>

                    {mode === 'overview' ? (
                        <>
                            <div className='production-board-overview-kpis'>
                                <div className='is-primary'>
                                    <small>{isPhone ? 'Nhịp đã chốt' : 'Nhịp đã chốt toàn cơ sở'}</small>
                                    <strong>{number(board.summary.checkpointAchievementPercent)}%</strong>
                                    <span
                                        className={
                                            board.summary.checkpointGap < 0
                                                ? 'production-board-gap is-behind'
                                                : 'production-board-gap is-ahead'
                                        }
                                    >
                                        {board.summary.checkpointGap < 0
                                            ? `Hụt ${number(Math.abs(board.summary.checkpointGap))} SP`
                                            : `Vượt ${number(board.summary.checkpointGap)} SP`}{' '}
                                        · {number(board.summary.checkpointActual)}/
                                        {number(board.summary.checkpointTarget)} SP
                                    </span>
                                </div>
                                <div>
                                    <small>{isPhone ? 'Sản lượng' : 'Sản lượng hôm nay'}</small>
                                    <strong>{number(board.summary.actual)} SP</strong>
                                    <span>Khoán ngày {number(board.summary.target)} SP</span>
                                </div>
                                <div>
                                    <small>{isPhone ? 'Giá trị khoán' : 'Giá trị khoán hiện tại'}</small>
                                    <strong>{money(board.summary.actualAmount)}</strong>
                                    <span>Mục tiêu {money(board.summary.targetAmount)}</span>
                                </div>
                                <div>
                                    <small>{isPhone ? 'Bình quân' : 'Bình quân hiện tại'}</small>
                                    <strong>{money(board.summary.averageIncome)}</strong>
                                    <span>
                                        Dự kiến{' '}
                                        {board.summary.projectedAverageIncome === undefined
                                            ? 'chờ đủ số liệu'
                                            : money(board.summary.projectedAverageIncome)}
                                    </span>
                                </div>
                                <div className='production-board-overview-kpis__health'>
                                    <span className='is-good'>{board.summary.onTrackLines} đúng nhịp</span>
                                    <span className='is-warning'>{board.summary.attentionLines} cần bù</span>
                                    <span className='is-missing'>{board.summary.missingLines} thiếu báo</span>
                                </div>
                            </div>

                            {visibleLines.length ? (
                                <div className='production-board-line-grid'>
                                    {visibleLines.map((line) => (
                                        <LineCard key={line.lineId} line={line} onOpen={() => openLine(line.lineId)} />
                                    ))}
                                </div>
                            ) : (
                                <Empty description='Cơ sở chưa có chuyền sản xuất' />
                            )}

                            {pageCount > 1 ? (
                                <div className='production-board-pagination' aria-label='Trang chuyền'>
                                    {Array.from({ length: pageCount }).map((_, index) => (
                                        <button
                                            type='button'
                                            key={index}
                                            className={pageIndex === index ? 'is-active' : ''}
                                            onClick={() => setPageIndex(index)}
                                            aria-label={`Trang ${index + 1}`}
                                        />
                                    ))}
                                </div>
                            ) : null}

                            {!isFullscreen && lines.length ? (
                                <div className='production-board-ledger-panel'>
                                    <div className='production-board-section-title'>
                                        <span>
                                            <b>Sổ khoán theo giờ</b>
                                        </span>
                                        <small className='production-board-ledger-legend'>
                                            <span className='lg-missing-dot' /> chưa báo · Khoán / Thực tế / Tỉ lệ
                                            từng khung giờ
                                        </small>
                                    </div>
                                    <BoardLedger board={board} onOpenLine={openLine} isPhone={isPhone} />
                                </div>
                            ) : null}
                        </>
                    ) : selectedLine ? (
                        <FocusLineBoard line={selectedLine} />
                    ) : (
                        <Empty description='Chưa có chuyền để hiển thị' />
                    )}
                </section>
            )}
        </div>
    );
};

export default ProductionBoardPage;
