import { useMemo, useState } from 'react';
import { Input } from 'antd';
import { ChevronDown, ChevronRight, ListChecks, Search } from 'lucide-react';
import type { NotebookMonth } from '../../core/services/worker-notebook.service';
import { notebookAttendanceLabel, notebookNumber as number, notebookQuantitySize } from './notebook-view';

type Props = { report: NotebookMonth; onSelectDate: (date: string) => void };

export default function WorkerNotebookMonthReport({ report, onSelectDate }: Props) {
    const [search, setSearch] = useState('');
    const groups = useMemo(() => {
        const map = new Map<string, NotebookMonth['breakdown']>();
        const keyword = search.trim().toLocaleLowerCase('vi');
        for (const item of report.breakdown) {
            if (keyword && !`${item.itemCode} ${item.operation}`.toLocaleLowerCase('vi').includes(keyword)) continue;
            map.set(item.itemCode, [...(map.get(item.itemCode) ?? []), item]);
        }
        return [...map].map(([itemCode, entries]) => ({ itemCode, entries }));
    }, [report.breakdown, search]);
    return (
        <div className='wn-report'>
            <div className='wn-report-layout'>
                <section className='wn-report-attendance' aria-label='Tổng hợp công tháng'>
                    <h2>Công trong tháng</h2>
                    <dl>
                        <div>
                            <dt>Ngày làm cả ngày</dt>
                            <dd>{report.fullDays}</dd>
                        </div>
                        <div>
                            <dt>Ngày làm nửa ngày</dt>
                            <dd>{report.halfDays}</dd>
                        </div>
                        <div>
                            <dt>Ngày có sản lượng</dt>
                            <dd>{report.productionDays}</dd>
                        </div>
                        <div>
                            <dt>Công đoạn đã ghi</dt>
                            <dd>{report.entryCount}</dd>
                        </div>
                    </dl>
                </section>
                <div className='wn-report-production'>
                    <section className='wn-production-total' aria-label='Khối lượng công đoạn đã kê'>
                        <h2>Khối lượng công đoạn đã kê</h2>
                        <p>Không phải số thành phẩm; tổng riêng theo đơn vị.</p>
                        {report.totalsByUnit.length ? (
                            <div className='wn-unit-totals'>
                                {report.totalsByUnit.map((total) => (
                                    <div key={total.unit}>
                                        <strong>{number(total.quantity)}</strong>
                                        <span>{total.unit}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className='wn-empty-copy'>Tháng này chưa có sản lượng.</p>
                        )}
                    </section>
                    <section className='wn-report-section' aria-label='Sản lượng theo mã hàng và công đoạn'>
                        <div className='wn-section-heading'>
                            <div>
                                <h2>Mã hàng & công đoạn</h2>
                                <p>{report.breakdown.length} nhóm công đoạn trong tháng</p>
                            </div>
                        </div>
                        {!!report.breakdown.length && (
                            <Input
                                className='wn-report-search'
                                prefix={<Search size={17} />}
                                placeholder='Tìm mã hàng, công đoạn'
                                aria-label='Tìm mã hàng, công đoạn'
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                allowClear
                            />
                        )}
                        <div className='wn-report-groups'>
                            {groups.map((group) => (
                                <details open className='wn-report-item' key={group.itemCode}>
                                    <summary>
                                        <span>
                                            Mã hàng <strong>{group.itemCode}</strong>
                                        </span>
                                        <span>
                                            {group.entries.length} công đoạn <ChevronDown size={16} />
                                        </span>
                                    </summary>
                                    {group.entries.map((entry) => (
                                        <div
                                            className='wn-breakdown-row'
                                            key={JSON.stringify([entry.itemCode, entry.operation, entry.unit])}
                                        >
                                            <span>
                                                <strong>{entry.operation}</strong>
                                                <small>{entry.recordedDays} ngày có ghi</small>
                                            </span>
                                            <span className='wn-breakdown-quantity'>
                                                <strong style={{ fontSize: notebookQuantitySize(entry.quantity, 20) }}>
                                                    {number(entry.quantity)}
                                                </strong>
                                                <small>{entry.unit}</small>
                                            </span>
                                        </div>
                                    ))}
                                </details>
                            ))}
                        </div>
                        {!groups.length && (
                            <p className='wn-empty-copy'>
                                {search
                                    ? 'Không có công đoạn khớp với từ khóa.'
                                    : 'Chưa có công đoạn nào trong tháng này.'}
                            </p>
                        )}
                    </section>
                </div>
            </div>
            <details className='wn-daily-details'>
                <summary>
                    <div>
                        <ListChecks size={20} />
                        <span>
                            <strong>Chi tiết từng ngày</strong>
                            <small>{report.days.length} ngày có ghi chép</small>
                        </span>
                    </div>
                    <ChevronDown size={18} />
                </summary>
                {report.days.length ? (
                    <table className='wn-daily-report'>
                        <thead>
                            <tr>
                                <th scope='col'>Ngày</th>
                                <th scope='col'>Công</th>
                                <th scope='col'>Tăng ca</th>
                                <th scope='col'>Công đoạn đã kê</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.days.map((day) => (
                                <tr key={day.date}>
                                    <td>
                                        <button
                                            type='button'
                                            aria-label={`Mở ngày ${day.date}`}
                                            onClick={() => onSelectDate(day.date)}
                                        >
                                            <span>
                                                <strong>
                                                    {day.date.slice(8)}/{day.date.slice(5, 7)}
                                                </strong>
                                                <small>{notebookAttendanceLabel(day)}</small>
                                            </span>
                                            <ChevronRight size={16} />
                                        </button>
                                    </td>
                                    <td data-label='Công'>{number(day.workDays)}</td>
                                    <td data-label='Tăng ca'>{number(day.overtimeHours)} giờ</td>
                                    <td>
                                        {day.totalsByUnit.length
                                            ? day.totalsByUnit
                                                  .map((total) => `${number(total.quantity)} ${total.unit}`)
                                                  .join(' · ')
                                            : 'Chưa ghi sản lượng'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className='wn-empty-copy'>Tháng này chưa có ghi chép.</p>
                )}
            </details>
        </div>
    );
}
