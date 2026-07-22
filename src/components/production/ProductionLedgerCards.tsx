import { DownOutlined } from '@ant-design/icons';
import { useState } from 'react';

/**
 * Sổ khoán theo giờ cho màn hình điện thoại.
 *
 * Bảng sổ khoán bản desktop rộng tối thiểu 1020px (11 khung giờ + 6 cột phụ).
 * Nhét nguyên bảng đó vào máy 390px là bắt người dùng cuộn ngang gần 3 màn hình,
 * nên ở phone đổi sang thẻ theo từng chuyền: đóng lại chỉ xem tổng, mở ra mới
 * hiện từng khung giờ theo chiều DỌC — không còn cuộn ngang.
 *
 * Bảng desktop giữ nguyên ở trang gọi, component này chỉ thay phần phone.
 */
export type LedgerCell = {
    key: string;
    label: string;
    overtime: boolean;
    /** Khung giờ này chuyền có mã đang chạy hay không */
    planned: boolean;
    reported: boolean;
    /** Đã qua giờ mà chưa báo */
    missing: boolean;
    target: number;
    actual: number;
};

export type LedgerRow = {
    id: string;
    code: string;
    sub?: string;
    itemCode?: string;
    workerCount?: number;
    totalTarget: number;
    totalActual: number;
    /** null khi không có khoán để so (vd cả ngày chỉ có giờ tăng ca) */
    percent: number | null;
    income?: number;
    cells: LedgerCell[];
};

type Props = {
    rows: LedgerRow[];
    /** Mở chi tiết chuyền; bỏ trống thì thẻ chỉ để đọc */
    onOpenLine?: (lineId: string) => void;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(value || 0)));
const money = (value = 0) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value || 0)))} đ`;
const tone = (percent: number) => (percent >= 95 ? 'ok' : percent >= 80 ? 'warn' : 'danger');

const ProductionLedgerCards = ({ rows, onOpenLine }: Props) => {
    const [openIds, setOpenIds] = useState<string[]>([]);

    const toggle = (id: string) =>
        setOpenIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

    if (!rows.length) return null;

    return (
        <div className='pd-ledger-cards'>
            {rows.map((row) => {
                const open = openIds.includes(row.id);
                const missingCount = row.cells.filter((cell) => cell.missing).length;
                return (
                    <article key={row.id} className={`pd-ledger-card ${open ? 'is-open' : ''}`}>
                        <button
                            type='button'
                            className='pd-ledger-card__head'
                            aria-expanded={open}
                            onClick={() => toggle(row.id)}
                        >
                            <span className='pd-ledger-card__id'>
                                <strong>{row.code}</strong>
                                <small>{row.itemCode || row.sub || '—'}</small>
                            </span>
                            <span className='pd-ledger-card__sum'>
                                <b>{number(row.totalActual)}</b>
                                <small>/ {number(row.totalTarget)} SP</small>
                            </span>
                            {row.percent === null ? (
                                <span className='pd-ledger-pill tone-none'>—</span>
                            ) : (
                                <span className={`pd-ledger-pill tone-${tone(row.percent)}`}>
                                    {Math.round(row.percent)}%
                                </span>
                            )}
                            <DownOutlined className='pd-ledger-card__caret' />
                        </button>

                        {missingCount > 0 && !open ? (
                            <p className='pd-ledger-card__warn'>Còn {missingCount} khung giờ chưa báo</p>
                        ) : null}

                        {open ? (
                            <div className='pd-ledger-card__body'>
                                <dl className='pd-ledger-slots'>
                                    {row.cells.map((cell) => {
                                        const percent =
                                            cell.reported && cell.target > 0 ? (cell.actual / cell.target) * 100 : null;
                                        return (
                                            <div
                                                key={cell.key}
                                                className={[
                                                    'pd-ledger-slot',
                                                    cell.missing ? 'is-missing' : '',
                                                    !cell.planned ? 'is-idle' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                            >
                                                <dt>
                                                    {cell.label}
                                                    {cell.overtime ? <em>TC</em> : null}
                                                </dt>
                                                <dd>
                                                    {!cell.planned ? (
                                                        <span className='pd-ledger-slot__idle'>không chạy</span>
                                                    ) : cell.reported ? (
                                                        <>
                                                            <b>{number(cell.actual)}</b>
                                                            <small>
                                                                {cell.overtime ? 'TC' : `/ ${number(cell.target)}`}
                                                            </small>
                                                        </>
                                                    ) : (
                                                        <span className='pd-ledger-slot__missing'>chưa báo</span>
                                                    )}
                                                </dd>
                                                <span className='pd-ledger-slot__rate'>
                                                    {percent === null ? (
                                                        ''
                                                    ) : (
                                                        <i
                                                            className={`tone-${tone(percent)}`}
                                                            style={{ width: `${Math.min(100, percent)}%` }}
                                                        />
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </dl>

                                <div className='pd-ledger-card__foot'>
                                    {row.workerCount ? <span>{row.workerCount} CN</span> : null}
                                    {row.income !== undefined ? <span>TN lũy kế {money(row.income)}</span> : null}
                                    {onOpenLine ? (
                                        <button type='button' onClick={() => onOpenLine(row.id)}>
                                            Xem chuyền
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </article>
                );
            })}
        </div>
    );
};

export default ProductionLedgerCards;
