import { ChevronRight } from 'lucide-react';
import type { NotebookMonth } from '../../core/services/worker-notebook.service';

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

type Props = { report: NotebookMonth; onSelectDate: (date: string) => void };

export default function WorkerNotebookMonthReport({ report, onSelectDate }: Props) {
    return (
        <div className='wn-report'>
            <section className='wn-report-attendance' aria-label='Tổng hợp công tháng'>
                <div>
                    <strong>{report.fullDays}</strong>
                    <span>Ngày làm cả ngày</span>
                </div>
                <div>
                    <strong>{report.halfDays}</strong>
                    <span>Ngày làm nửa ngày</span>
                </div>
                <div>
                    <strong>{report.productionDays}</strong>
                    <span>Ngày có sản lượng</span>
                </div>
                <div>
                    <strong>{report.entryCount}</strong>
                    <span>Dòng công đoạn</span>
                </div>
            </section>
            <section className='wn-report-section' aria-label='Tổng sản lượng tháng'>
                <div className='wn-section-heading'>
                    <div>
                        <h2>Tổng sản lượng tháng</h2>
                        <p>Sản lượng tự kê của các công đoạn, không phải số thành phẩm.</p>
                    </div>
                </div>
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
                    <p className='wn-breakdown-empty'>Tháng này chưa có sản lượng.</p>
                )}
            </section>
            <section className='wn-report-section' aria-label='Sản lượng theo mã hàng và công đoạn'>
                <div className='wn-section-heading'>
                    <div>
                        <h2>Mã hàng & công đoạn</h2>
                        <p>Tổng hợp toàn bộ ngày đã ghi trong tháng</p>
                    </div>
                </div>
                {report.breakdown.length ? (
                    report.breakdown.map((item) => (
                        <div
                            className='wn-breakdown-row'
                            key={JSON.stringify([item.itemCode, item.operation, item.unit])}
                        >
                            <span>
                                <b>{item.itemCode}</b>
                                <span>{item.operation}</span>
                                <small>{item.recordedDays} ngày có ghi</small>
                            </span>
                            <strong>
                                {number(item.quantity)} <small>{item.unit}</small>
                            </strong>
                        </div>
                    ))
                ) : (
                    <p className='wn-breakdown-empty'>Chưa có công đoạn nào trong tháng này.</p>
                )}
            </section>
            <section className='wn-report-section' aria-label='Chi tiết từng ngày'>
                <div className='wn-section-heading'>
                    <div>
                        <h2>Chi tiết từng ngày</h2>
                        <p>Công, tăng ca và sản lượng tự kê</p>
                    </div>
                </div>
                <div className='wn-daily-report'>
                    {report.days.length ? (
                        report.days.map((day) => (
                            <button type='button' key={day.date} onClick={() => onSelectDate(day.date)}>
                                <div className='wn-daily-date'>
                                    <strong>
                                        {day.date.slice(8)}/{day.date.slice(5, 7)}
                                    </strong>
                                    <span>
                                        {day.attendanceType === 'full'
                                            ? 'Cả ngày'
                                            : day.attendanceType === 'half'
                                              ? 'Nửa ngày'
                                              : day.overtimeHours
                                                ? 'Chỉ tăng ca'
                                                : 'Chưa ghi công / nghỉ'}
                                    </span>
                                </div>
                                <div className='wn-daily-values'>
                                    <span>
                                        <b>{number(day.workDays)}</b> công <i /> <b>{number(day.overtimeHours)}</b> giờ
                                        tăng ca
                                    </span>
                                    <span>
                                        {day.totalsByUnit.length
                                            ? day.totalsByUnit
                                                  .map((total) => `${number(total.quantity)} ${total.unit}`)
                                                  .join(' · ')
                                            : 'Chưa ghi sản lượng'}
                                    </span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
                        ))
                    ) : (
                        <p className='wn-breakdown-empty'>Tháng này chưa có ghi chép.</p>
                    )}
                </div>
            </section>
        </div>
    );
}
