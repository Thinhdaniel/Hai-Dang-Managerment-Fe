import {
    CheckCircleFilled,
    ClockCircleOutlined,
    CloudSyncOutlined,
    ExclamationCircleFilled,
    SearchOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { Button, Empty, Input, Segmented, Tag } from 'antd';
import type { ReactNode } from 'react';

export type LeaderDesktopFilter = 'missing' | 'reported' | 'all';

export type LeaderDesktopSlot = {
    key: string;
    label: string;
    shortLabel: string;
    reported: number;
    total: number;
    complete: boolean;
    current: boolean;
    selected: boolean;
};

export type LeaderDesktopLine = {
    lineId: string;
    lineCode: string;
    lineName?: string;
    itemCode?: string;
    itemName?: string;
    workerCount: number;
    workerCountConfirmed: boolean;
    actual: number;
    target: number;
    percent: number;
    effectiveReported: boolean;
    due: boolean;
    pending: boolean;
    conflict: boolean;
    configured: boolean;
    tone: 'conflict' | 'pending' | 'success' | 'warning' | 'missing' | 'idle';
    updatedBy?: string;
    updatedAt?: string;
};

type Props = {
    selectedSlotLabel: string;
    remainingMinutes?: number;
    serverCount: number;
    pendingCount: number;
    missingCount: number;
    effectiveCount: number;
    totalCount: number;
    completionPercent: number;
    slots: LeaderDesktopSlot[];
    lines: LeaderDesktopLine[];
    filter: LeaderDesktopFilter;
    search: string;
    selectedLineId?: string | null;
    editable: boolean;
    inspector?: ReactNode;
    onSelectSlot: (slotKey: string) => void;
    onFilterChange: (filter: LeaderDesktopFilter) => void;
    onSearchChange: (value: string) => void;
    onSelectLine: (lineId: string) => void;
    onStartMissing: () => void;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);

const statusContent = (line: LeaderDesktopLine) => {
    if (line.conflict) {
        return (
            <>
                <ExclamationCircleFilled /> Kiểm tra
            </>
        );
    }
    if (line.pending) {
        return (
            <>
                <CloudSyncOutlined /> Chờ đồng bộ
            </>
        );
    }
    if (line.effectiveReported) {
        return (
            <>
                <CheckCircleFilled /> Đã báo
            </>
        );
    }
    if (line.due) {
        return (
            <>
                <ClockCircleOutlined /> Cần nhập
            </>
        );
    }
    return <>Không chạy</>;
};

const actionLabel = (line: LeaderDesktopLine, editable: boolean) => {
    if (!editable) return 'Xem';
    if (line.conflict) return 'Kiểm tra';
    if (line.effectiveReported) return 'Sửa';
    return line.configured ? 'Nhập' : 'Thiết lập';
};

const ProductionLeaderDesktopWorkspace = ({
    selectedSlotLabel,
    remainingMinutes,
    serverCount,
    pendingCount,
    missingCount,
    effectiveCount,
    totalCount,
    completionPercent,
    slots,
    lines,
    filter,
    search,
    selectedLineId,
    editable,
    inspector,
    onSelectSlot,
    onFilterChange,
    onSearchChange,
    onSelectLine,
    onStartMissing,
}: Props) => (
    <div className={`leader-v2-workspace ${inspector ? 'has-inspector' : ''}`}>
        <main className='leader-v2-main'>
            <section className='leader-v2-overview' aria-label='Tiến độ khung giờ'>
                <header className='leader-v2-overview__heading'>
                    <div>
                        <span>Khung giờ đang theo dõi</span>
                        <strong>{selectedSlotLabel || 'Chưa chọn khung giờ'}</strong>
                    </div>
                    {remainingMinutes !== undefined && remainingMinutes > 0 ? (
                        <Tag color={remainingMinutes <= 10 ? 'orange' : 'blue'}>Còn {remainingMinutes} phút</Tag>
                    ) : null}
                </header>

                <div className='leader-v2-metrics'>
                    <div>
                        <span>Tổng chuyền</span>
                        <strong>{totalCount}</strong>
                    </div>
                    <div>
                        <span>Đã lên hệ thống</span>
                        <strong>{serverCount}</strong>
                    </div>
                    <div className={pendingCount ? 'is-pending' : ''}>
                        <span>Chờ đồng bộ</span>
                        <strong>{pendingCount}</strong>
                    </div>
                    <div className={missingCount ? 'is-missing' : 'is-complete'}>
                        <span>Còn thiếu</span>
                        <strong>{missingCount}</strong>
                    </div>
                </div>

                <footer className='leader-v2-overview__footer'>
                    <div className='leader-v2-overview__progress'>
                        <div>
                            <span>
                                <i style={{ width: `${Math.min(100, completionPercent)}%` }} />
                            </span>
                            <strong>{Math.round(completionPercent)}%</strong>
                        </div>
                        <small>
                            {totalCount
                                ? `${effectiveCount}/${totalCount} chuyền đã hoàn thành báo số`
                                : 'Khung giờ này chưa có chuyền cần báo'}
                        </small>
                    </div>
                    {editable && missingCount ? (
                        <Button type='primary' onClick={onStartMissing}>
                            Nhập {missingCount} chuyền còn thiếu
                        </Button>
                    ) : null}
                </footer>
            </section>

            <section className='leader-v2-slot-section'>
                <header>
                    <div>
                        <strong>Tiến độ trong ngày</strong>
                        <span>Chọn khung giờ để xem và nhập sản lượng</span>
                    </div>
                    <small>{slots.length} khung giờ</small>
                </header>
                <nav className='leader-v2-slots' aria-label='Chọn khung giờ'>
                    {slots.map((slot) => (
                        <button
                            key={slot.key}
                            type='button'
                            className={[
                                'leader-v2-slot',
                                slot.selected ? 'is-selected' : '',
                                slot.current ? 'is-current' : '',
                                slot.complete ? 'is-complete' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            aria-current={slot.selected ? 'true' : undefined}
                            onClick={() => onSelectSlot(slot.key)}
                        >
                            <span className='leader-v2-slot__time'>
                                {slot.current ? <i /> : null}
                                <strong>{slot.shortLabel}</strong>
                            </span>
                            <span className='leader-v2-slot__state'>
                                {slot.complete ? (
                                    <>
                                        <CheckCircleFilled /> Hoàn thành
                                    </>
                                ) : (
                                    `${slot.reported}/${slot.total} chuyền`
                                )}
                            </span>
                        </button>
                    ))}
                </nav>
            </section>

            <section className='leader-v2-lines'>
                <header className='leader-v2-lines__toolbar'>
                    <div>
                        <strong>Danh sách chuyền</strong>
                        <span>{lines.length} chuyền đang hiển thị</span>
                    </div>
                    <Segmented<LeaderDesktopFilter>
                        value={filter}
                        onChange={onFilterChange}
                        options={[
                            { value: 'missing', label: `Cần nhập ${missingCount}` },
                            { value: 'reported', label: `Đã nhập ${effectiveCount}` },
                            { value: 'all', label: 'Tất cả' },
                        ]}
                    />
                    <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        value={search}
                        placeholder='Tìm chuyền hoặc mã hàng'
                        aria-label='Tìm chuyền hoặc mã hàng'
                        onChange={(event) => onSearchChange(event.target.value)}
                    />
                </header>

                <div className='leader-v2-table' role='table' aria-label='Sản lượng các chuyền'>
                    <div className='leader-v2-table__header' role='row'>
                        <span role='columnheader'>Chuyền và mã hàng</span>
                        <span role='columnheader'>Nhân sự</span>
                        <span role='columnheader'>Sản lượng</span>
                        <span role='columnheader'>Mức đạt</span>
                        <span role='columnheader'>Trạng thái</span>
                        <span role='columnheader' aria-label='Thao tác' />
                    </div>

                    <div className='leader-v2-table__body' role='rowgroup'>
                        {lines.length ? (
                            lines.map((line) => (
                                <div
                                    key={line.lineId}
                                    role='row'
                                    className={[
                                        'leader-v2-line',
                                        `tone-${line.tone}`,
                                        selectedLineId === line.lineId ? 'is-selected' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                >
                                    <button
                                        type='button'
                                        role='cell'
                                        className='leader-v2-line__identity'
                                        title={`${line.lineName || line.lineCode} · ${line.itemCode || 'Chưa chọn mã hàng'}${line.itemName ? ` · ${line.itemName}` : ''}`}
                                        onClick={() => onSelectLine(line.lineId)}
                                    >
                                        <span className='leader-v2-line__code'>{line.lineCode}</span>
                                        <span className='leader-v2-line__detail'>
                                            <strong>{line.lineName || line.lineCode}</strong>
                                            <span>
                                                <b>{line.itemCode || 'Chưa chọn mã hàng'}</b>
                                                {line.itemName ? ` · ${line.itemName}` : ''}
                                            </span>
                                            <small>
                                                {line.updatedBy
                                                    ? `Cập nhật bởi ${line.updatedBy}${line.updatedAt ? ` lúc ${line.updatedAt}` : ''}`
                                                    : 'Chưa có dữ liệu cập nhật'}
                                            </small>
                                        </span>
                                    </button>

                                    <span role='cell' className='leader-v2-line__workers'>
                                        <TeamOutlined />
                                        <strong>{line.workerCountConfirmed ? number(line.workerCount) : '—'}</strong>
                                        <small>{line.workerCountConfirmed ? 'công nhân' : 'chưa xác nhận'}</small>
                                    </span>

                                    <span role='cell' className='leader-v2-line__output'>
                                        <strong>{line.effectiveReported ? number(line.actual) : '—'}</strong>
                                        <small>/ {line.target ? number(line.target) : 'không khoán'} SP</small>
                                    </span>

                                    <span role='cell' className='leader-v2-line__achievement'>
                                        <span>
                                            <i style={{ width: `${Math.min(100, line.percent)}%` }} />
                                        </span>
                                        <strong>
                                            {line.effectiveReported && line.target
                                                ? `${line.percent.toFixed(0)}%`
                                                : '—'}
                                        </strong>
                                    </span>

                                    <span role='cell' className='leader-v2-line__status'>
                                        {statusContent(line)}
                                    </span>

                                    <span role='cell' className='leader-v2-line__action'>
                                        <Button
                                            type={
                                                editable && line.due && !line.effectiveReported ? 'primary' : 'default'
                                            }
                                            onClick={() => onSelectLine(line.lineId)}
                                        >
                                            {actionLabel(line, editable)}
                                        </Button>
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className='leader-v2-table__empty'>
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        filter === 'missing'
                                            ? 'Không còn chuyền cần nhập trong khung này'
                                            : 'Không có chuyền phù hợp'
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>

        {inspector ? (
            <aside className='leader-v2-inspector' aria-label='Nhập sản lượng chuyền'>
                {inspector}
            </aside>
        ) : null}
    </div>
);

export default ProductionLeaderDesktopWorkspace;
