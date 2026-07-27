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
    <div className={`leader-desktop-workspace ${inspector ? 'has-inspector' : ''}`}>
        <aside className='leader-desktop-rail' aria-label='Tiến độ theo khung giờ'>
            <section className='leader-desktop-summary'>
                <div className='leader-desktop-summary__head'>
                    <div>
                        <span>Khung đang theo dõi</span>
                        <strong>{selectedSlotLabel || 'Chưa chọn'}</strong>
                    </div>
                    {remainingMinutes !== undefined && remainingMinutes > 0 ? (
                        <Tag color={remainingMinutes <= 10 ? 'orange' : 'blue'}>Còn {remainingMinutes} phút</Tag>
                    ) : null}
                </div>

                <div className='leader-desktop-summary__numbers'>
                    <div>
                        <strong>{serverCount}</strong>
                        <span>Đã lên server</span>
                    </div>
                    <div>
                        <strong>{pendingCount}</strong>
                        <span>Chờ đồng bộ</span>
                    </div>
                    <div className={missingCount ? 'is-missing' : 'is-complete'}>
                        <strong>{missingCount}</strong>
                        <span>Còn thiếu</span>
                    </div>
                </div>

                <div className='leader-desktop-summary__progress'>
                    <span>
                        <i style={{ width: `${Math.min(100, completionPercent)}%` }} />
                    </span>
                    <small>
                        {totalCount ? `${effectiveCount}/${totalCount} chuyền đã được nhập` : 'Chưa có chuyền cần báo'}
                    </small>
                </div>

                {editable && missingCount ? (
                    <Button type='primary' block onClick={onStartMissing}>
                        Nhập {missingCount} chuyền còn thiếu
                    </Button>
                ) : null}
            </section>

            <nav className='leader-desktop-slots' aria-label='Chọn khung giờ'>
                <div className='leader-desktop-slots__title'>
                    <span>Tiến độ trong ngày</span>
                    <small>{slots.length} khung giờ</small>
                </div>
                {slots.map((slot) => (
                    <button
                        key={slot.key}
                        type='button'
                        className={[
                            'leader-desktop-slot',
                            slot.selected ? 'is-selected' : '',
                            slot.current ? 'is-current' : '',
                            slot.complete ? 'is-complete' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        aria-current={slot.selected ? 'true' : undefined}
                        onClick={() => onSelectSlot(slot.key)}
                    >
                        <span className='leader-desktop-slot__marker' />
                        <span className='leader-desktop-slot__content'>
                            <strong>{slot.shortLabel}</strong>
                            <small>{slot.label}</small>
                        </span>
                        <span className='leader-desktop-slot__count'>
                            {slot.complete ? <CheckCircleFilled /> : `${slot.reported}/${slot.total}`}
                        </span>
                    </button>
                ))}
            </nav>
        </aside>

        <section className='leader-desktop-lines'>
            <header className='leader-desktop-lines__toolbar'>
                <div>
                    <strong>Danh sách chuyền</strong>
                    <span>{lines.length} kết quả trong khung đã chọn</span>
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

            <div className='leader-desktop-table' role='table' aria-label='Sản lượng các chuyền'>
                <div className='leader-desktop-table__header' role='row'>
                    <span role='columnheader'>Chuyền</span>
                    <span role='columnheader'>Mã hàng</span>
                    <span role='columnheader'>Nhân sự</span>
                    <span role='columnheader'>Thực tế</span>
                    <span role='columnheader'>Khoán</span>
                    <span role='columnheader'>Mức đạt</span>
                    <span role='columnheader'>Trạng thái</span>
                    <span role='columnheader' aria-label='Thao tác' />
                </div>

                <div className='leader-desktop-table__body' role='rowgroup'>
                    {lines.length ? (
                        lines.map((line) => (
                            <div
                                key={line.lineId}
                                role='row'
                                className={[
                                    'leader-desktop-line',
                                    `tone-${line.tone}`,
                                    selectedLineId === line.lineId ? 'is-selected' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                onDoubleClick={() => onSelectLine(line.lineId)}
                            >
                                <button
                                    type='button'
                                    role='cell'
                                    className='leader-desktop-line__identity'
                                    onClick={() => onSelectLine(line.lineId)}
                                >
                                    <span>{line.lineCode}</span>
                                    <span>
                                        <strong>{line.lineName || line.lineCode}</strong>
                                        <small>
                                            {line.updatedBy
                                                ? `${line.updatedBy}${line.updatedAt ? ` · ${line.updatedAt}` : ''}`
                                                : 'Chưa có người cập nhật'}
                                        </small>
                                    </span>
                                </button>
                                <button
                                    type='button'
                                    role='cell'
                                    className='leader-desktop-line__item'
                                    onClick={() => onSelectLine(line.lineId)}
                                >
                                    <strong>{line.itemCode || 'Chưa chọn mã'}</strong>
                                    <small>{line.itemName || 'Chưa có thông tin mã hàng'}</small>
                                </button>
                                <span role='cell' className='leader-desktop-line__workers'>
                                    <TeamOutlined />
                                    <strong>{line.workerCountConfirmed ? number(line.workerCount) : '—'}</strong>
                                </span>
                                <strong role='cell' className='leader-desktop-line__number'>
                                    {line.effectiveReported ? number(line.actual) : '—'}
                                </strong>
                                <strong role='cell' className='leader-desktop-line__number is-muted'>
                                    {line.target ? number(line.target) : '—'}
                                </strong>
                                <span role='cell' className='leader-desktop-line__achievement'>
                                    <strong>
                                        {line.effectiveReported && line.target ? `${line.percent.toFixed(0)}%` : '—'}
                                    </strong>
                                    <span>
                                        <i style={{ width: `${Math.min(100, line.percent)}%` }} />
                                    </span>
                                </span>
                                <span role='cell' className='leader-desktop-line__status'>
                                    {statusContent(line)}
                                </span>
                                <span role='cell' className='leader-desktop-line__action'>
                                    <Button
                                        type={editable && line.due && !line.effectiveReported ? 'primary' : 'default'}
                                        onClick={() => onSelectLine(line.lineId)}
                                    >
                                        {actionLabel(line, editable)}
                                    </Button>
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className='leader-desktop-table__empty'>
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

        <aside className='leader-desktop-inspector' aria-label='Nhập sản lượng chuyền'>
            {inspector || (
                <div className='leader-desktop-inspector__empty'>
                    <span>
                        <ClockCircleOutlined />
                    </span>
                    <strong>Chọn một chuyền để thao tác</strong>
                    <p>Số liệu của khung giờ vẫn được giữ nguyên khi chuyển qua lại giữa các chuyền.</p>
                </div>
            )}
        </aside>
    </div>
);

export default ProductionLeaderDesktopWorkspace;
