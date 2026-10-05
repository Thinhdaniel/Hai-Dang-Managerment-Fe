import { CalendarDays, ChevronRight, Clock3 } from 'lucide-react';
import dayjs from 'dayjs';
import type { NotebookMonth } from '../../core/services/worker-notebook.service';
import { hasNotebookAttendance, notebookAttendanceLabel, notebookDateLabel, notebookNumber } from './notebook-view';

type Props = {
    report: NotebookMonth;
    today: string;
    selectedDate: string;
    onPreview: (date: string) => void;
    onOpenDay: (date: string) => void;
};

export default function NotebookCalendar({ report, today, selectedDate, onPreview, onOpenDay }: Props) {
    const monthStart = dayjs(`${report.month}-01`);
    const leading = (monthStart.day() + 6) % 7;
    const daysByDate = new Map(report.days.map((day) => [day.date, day]));
    const summary = daysByDate.get(selectedDate);
    const days = Array.from(
        { length: monthStart.daysInMonth() },
        (_, i) => `${report.month}-${String(i + 1).padStart(2, '0')}`
    );
    return (
        <div className='wn-calendar-layout'>
            <section className='wn-calendar' aria-label='Lịch công tháng'>
                <div className='wn-weekdays'>
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>
                <div className='wn-calendar-grid'>
                    {Array.from({ length: leading }, (_, i) => (
                        <span key={`blank-${i}`} />
                    ))}
                    {days.map((date) => {
                        const day = daysByDate.get(date);
                        const recorded = hasNotebookAttendance(day);
                        return (
                            <button
                                type='button'
                                key={date}
                                disabled={date > today}
                                onClick={() => onPreview(date)}
                                aria-pressed={date === selectedDate}
                                aria-label={`${notebookDateLabel(date)}, ${notebookAttendanceLabel(day)}, tăng ca ${day?.overtimeHours || 0} giờ`}
                                className={[
                                    date === today ? 'today' : '',
                                    date === selectedDate ? 'selected' : '',
                                    recorded ? `attendance-${day?.attendanceType}` : '',
                                    day?.entryCount ? 'has-entries' : '',
                                ].join(' ')}
                            >
                                <span>{Number(date.slice(-2))}</span>
                                <small>
                                    {recorded
                                        ? day?.attendanceType === 'full'
                                            ? '1'
                                            : day?.attendanceType === 'half'
                                              ? '½'
                                              : '–'
                                        : ''}
                                </small>
                                <div className='wn-calendar-marks'>
                                    <i className={day?.entryCount ? 'noted' : ''} />
                                    <i className={day?.overtimeHours ? 'overtime' : ''} />
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className='wn-legend'>
                    <span>
                        <i className='full' />
                        Cả ngày
                    </span>
                    <span>
                        <i className='half' />
                        Nửa ngày
                    </span>
                    <span>
                        <i className='off' />
                        Nghỉ
                    </span>
                    <span>
                        <i className='unmarked' />
                        Chưa ghi công
                    </span>
                    <span>
                        <i className='noted' />
                        Sản lượng
                    </span>
                    <span>
                        <i className='overtime' />
                        Tăng ca
                    </span>
                </div>
            </section>
            <section className='wn-calendar-detail' aria-label='Ngày đang chọn'>
                <CalendarDays size={22} />
                <h2>{notebookDateLabel(selectedDate)}</h2>
                <span className={`wn-status ${hasNotebookAttendance(summary) ? summary?.attendanceType : 'unmarked'}`}>
                    {notebookAttendanceLabel(summary)}
                </span>
                <div className='wn-preview-stats'>
                    <div>
                        <span>Công</span>
                        <strong>{notebookNumber(summary?.workDays ?? 0)}</strong>
                    </div>
                    <div>
                        <span>
                            <Clock3 size={14} /> Tăng ca
                        </span>
                        <strong>
                            {notebookNumber(summary?.overtimeHours ?? 0)} <small>giờ</small>
                        </strong>
                    </div>
                </div>
                <div className='wn-calendar-production'>
                    <span>{summary?.entryCount ?? 0} công đoạn đã ghi</span>
                    {summary?.totalsByUnit.map((total) => (
                        <strong key={total.unit}>
                            {notebookNumber(total.quantity)} <small>{total.unit}</small>
                        </strong>
                    ))}
                </div>
                <button type='button' className='wn-secondary-button' onClick={() => onOpenDay(selectedDate)}>
                    Mở ghi chép ngày <ChevronRight size={17} />
                </button>
            </section>
        </div>
    );
}
