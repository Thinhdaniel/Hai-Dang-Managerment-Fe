import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Drawer, Input, InputNumber, Popconfirm, Segmented, Spin } from 'antd';
import datePickerLocale from 'antd/es/date-picker/locale/vi_VN';
import {
    CalendarDays,
    ChartNoAxesCombined,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    LogOut,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAuth } from '../core/contexts/AuthContext';
import {
    workerNotebookService,
    type NotebookEntry,
    type NotebookEntryInput,
    type NotebookAttendanceInput,
} from '../core/services/worker-notebook.service';
import WorkerNotebookMonthReport from '../components/worker-notebook/WorkerNotebookMonthReport';
import '../styles/worker-notebook.css';

const vietnamToday = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const value = (part: string) => parts.find((item) => item.type === part)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
};

const dateLabel = (date: string) =>
    new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));

const emptyEntry: NotebookEntryInput = { itemCode: '', operation: '', quantity: 1, unit: 'SP', note: '' };
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

const WorkerNotebookPage = () => {
    const { user, logout } = useAuth();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const today = vietnamToday();
    const [selectedDate, setSelectedDate] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [view, setView] = useState<'day' | 'month' | 'report'>('day');
    const [attendanceOpen, setAttendanceOpen] = useState(false);
    const [attendanceDraft, setAttendanceDraft] = useState<NotebookAttendanceInput>({
        attendanceType: 'off',
        overtimeHours: 0,
    });
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<NotebookEntryInput>(emptyEntry);

    const monthQuery = useQuery({
        queryKey: ['worker-notebook', 'month', month],
        queryFn: () => workerNotebookService.month(month),
    });
    const dayQuery = useQuery({
        queryKey: ['worker-notebook', 'day', selectedDate],
        queryFn: () => workerNotebookService.day(selectedDate),
    });
    const day = dayQuery.data;
    const daysByDate = useMemo(
        () => new Map(monthQuery.data?.days.map((item) => [item.date, item]) ?? []),
        [monthQuery.data]
    );

    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['worker-notebook', 'day', selectedDate] }),
            queryClient.invalidateQueries({ queryKey: ['worker-notebook', 'month'] }),
        ]);
    };

    const attendance = useMutation({
        mutationFn: (input: NotebookAttendanceInput) => workerNotebookService.attendance(selectedDate, input),
        onSuccess: async () => {
            setAttendanceOpen(false);
            await refresh();
            message.success('Đã lưu chấm công');
        },
        onError: () => message.error('Không lưu được chấm công. Vui lòng thử lại.'),
    });
    const saveEntry = useMutation({
        mutationFn: () =>
            editingId
                ? workerNotebookService.updateEntry(selectedDate, editingId, draft)
                : workerNotebookService.createEntry(selectedDate, draft),
        onSuccess: async () => {
            setEditorOpen(false);
            await refresh();
            message.success('Đã lưu công đoạn');
        },
        onError: () => message.error('Không lưu được công đoạn. Vui lòng kiểm tra và thử lại.'),
    });
    const removeEntry = useMutation({
        mutationFn: (id: string) => workerNotebookService.deleteEntry(selectedDate, id),
        onSuccess: async () => {
            await refresh();
            message.success('Đã xóa dòng ghi');
        },
        onError: () => message.error('Không xóa được. Vui lòng thử lại.'),
    });

    const openEditor = (entry?: NotebookEntry) => {
        setEditingId(entry?._id ?? null);
        setDraft(
            entry
                ? {
                      itemCode: entry.itemCode,
                      operation: entry.operation,
                      quantity: entry.quantity,
                      unit: entry.unit,
                      note: entry.note || '',
                  }
                : emptyEntry
        );
        setEditorOpen(true);
    };
    const selectDate = (date: string) => {
        setSelectedDate(date);
        setMonth(date.slice(0, 7));
        setView('day');
    };
    const changeMonth = (offset: number) => {
        const next = dayjs(`${month}-01`).add(offset, 'month').format('YYYY-MM');
        if (next > today.slice(0, 7)) return;
        setMonth(next);
    };
    const monthStart = dayjs(`${month}-01`);
    const leadingDays = (monthStart.day() + 6) % 7;
    const monthDays = Array.from(
        { length: monthStart.daysInMonth() },
        (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
    );

    return (
        <div className='wn-page'>
            <header className='wn-header'>
                <div className='wn-header-inner'>
                    <div className='wn-brand'>
                        <span className='wn-brand-mark'>
                            <ClipboardList size={22} />
                        </span>
                        <span>Sổ của tôi</span>
                    </div>
                    <div className='wn-header-right'>
                        <span className='wn-user'>{user?.name}</span>
                        <button
                            type='button'
                            className='wn-icon-button'
                            title='Đăng xuất'
                            aria-label='Đăng xuất'
                            onClick={() => void logout()}
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <main className='wn-main'>
                <div className='wn-intro'>
                    <div>
                        <h1>Chào {user?.name?.split(' ').at(-1) || 'bạn'}</h1>
                        <p>{user?.plant?.name || 'Sổ ghi chép cá nhân'}</p>
                    </div>
                    <button className='wn-today-link' type='button' onClick={() => selectDate(today)}>
                        Hôm nay
                    </button>
                </div>

                <div className='wn-tabs' role='tablist' aria-label='Xem sổ'>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={view === 'day'}
                        className={view === 'day' ? 'active' : ''}
                        onClick={() => setView('day')}
                    >
                        <ClipboardList size={18} /> Ghi ngày
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={view === 'month'}
                        className={view === 'month' ? 'active' : ''}
                        onClick={() => setView('month')}
                    >
                        <CalendarDays size={18} /> Lịch tháng
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={view === 'report'}
                        className={view === 'report' ? 'active' : ''}
                        onClick={() => setView('report')}
                    >
                        <ChartNoAxesCombined size={18} /> Báo cáo
                    </button>
                </div>

                {view === 'day' ? (
                    <>
                        <div className='wn-date-bar'>
                            <div>
                                <span>Ngày đang xem</span>
                                <strong>{dateLabel(selectedDate)}</strong>
                            </div>
                            <input
                                type='date'
                                value={selectedDate}
                                max={today}
                                onChange={(event) => {
                                    if (event.target.value && event.target.value <= today)
                                        selectDate(event.target.value);
                                }}
                                aria-label='Chọn ngày ghi chép'
                            />
                        </div>
                        {dayQuery.isLoading ? (
                            <div className='wn-loading'>
                                <Spin />
                            </div>
                        ) : dayQuery.isError ? (
                            <div className='wn-feedback'>
                                Không tải được sổ. <Button onClick={() => void dayQuery.refetch()}>Thử lại</Button>
                            </div>
                        ) : (
                            <>
                                <section className='wn-attendance' aria-label='Chấm công'>
                                    <span className={`wn-attendance-icon ${day?.attended ? 'is-marked' : ''}`}>
                                        <Check size={24} />
                                    </span>
                                    <div className='wn-attendance-text'>
                                        <strong>
                                            {day?.attendanceType === 'full'
                                                ? 'Cả ngày · 1 công'
                                                : day?.attendanceType === 'half'
                                                  ? 'Nửa ngày · 0,5 công'
                                                  : day?.overtimeHours
                                                    ? 'Chỉ tăng ca'
                                                    : 'Chưa ghi công / nghỉ'}
                                        </strong>
                                        <small>Tăng ca: {number(day?.overtimeHours ?? 0)} giờ</small>
                                    </div>
                                    <Button
                                        type={day?.attended ? 'default' : 'primary'}
                                        loading={attendance.isPending}
                                        onClick={() => {
                                            setAttendanceDraft({
                                                attendanceType: day?.attendanceType ?? 'off',
                                                overtimeHours: day?.overtimeHours ?? 0,
                                            });
                                            setAttendanceOpen(true);
                                        }}
                                    >
                                        <Pencil size={15} /> Chấm công
                                    </Button>
                                </section>

                                <section className='wn-entries' aria-label='Công đoạn đã làm'>
                                    <div className='wn-section-heading'>
                                        <div>
                                            <h2>Công đoạn đã làm</h2>
                                            <p>{day?.entries?.length || 0} dòng ghi trong ngày</p>
                                        </div>
                                        <button type='button' className='wn-add-button' onClick={() => openEditor()}>
                                            <Plus size={18} /> Thêm
                                        </button>
                                    </div>
                                    {day?.entries?.length ? (
                                        <div className='wn-entry-list'>
                                            {day.entries.map((entry) => (
                                                <article className='wn-entry' key={entry._id}>
                                                    <div className='wn-entry-main'>
                                                        <span className='wn-entry-code'>{entry.itemCode}</span>
                                                        <h3>{entry.operation}</h3>
                                                        {entry.note && <p>{entry.note}</p>}
                                                    </div>
                                                    <div className='wn-entry-side'>
                                                        <strong>
                                                            {number(entry.quantity)} <small>{entry.unit}</small>
                                                        </strong>
                                                        <div>
                                                            <button
                                                                type='button'
                                                                title='Sửa dòng'
                                                                aria-label={`Sửa ${entry.operation}`}
                                                                onClick={() => openEditor(entry)}
                                                            >
                                                                <Pencil size={17} />
                                                            </button>
                                                            <Popconfirm
                                                                title='Xóa dòng ghi này?'
                                                                okText='Xóa'
                                                                cancelText='Hủy'
                                                                onConfirm={() => removeEntry.mutate(entry._id)}
                                                            >
                                                                <button
                                                                    type='button'
                                                                    title='Xóa dòng'
                                                                    aria-label={`Xóa ${entry.operation}`}
                                                                >
                                                                    <Trash2 size={17} />
                                                                </button>
                                                            </Popconfirm>
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className='wn-empty'>
                                            <ClipboardList size={30} />
                                            <strong>Chưa ghi công đoạn nào</strong>
                                            <span>Thêm công đoạn bạn đã làm để theo dõi sản lượng của mình.</span>
                                            <button type='button' onClick={() => openEditor()}>
                                                <Plus size={18} /> Thêm công đoạn
                                            </button>
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className='wn-month-heading'>
                            <button type='button' aria-label='Tháng trước' onClick={() => changeMonth(-1)}>
                                <ChevronLeft size={20} />
                            </button>
                            <DatePicker
                                id='wn-report-month'
                                picker='month'
                                locale={datePickerLocale}
                                format='[Tháng] MM/YYYY'
                                inputReadOnly
                                allowClear={false}
                                aria-label='Chọn tháng báo cáo'
                                value={monthStart}
                                disabledDate={(date) => date.format('YYYY-MM') > today.slice(0, 7)}
                                onChange={(date) => {
                                    if (date) setMonth(date.format('YYYY-MM'));
                                }}
                            />
                            <button
                                type='button'
                                aria-label='Tháng sau'
                                disabled={month >= today.slice(0, 7)}
                                onClick={() => changeMonth(1)}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                        {monthQuery.isLoading ? (
                            <div className='wn-loading'>
                                <Spin />
                            </div>
                        ) : monthQuery.isError ? (
                            <div className='wn-feedback'>
                                Không tải được dữ liệu tháng. <Button onClick={() => void monthQuery.refetch()}>Thử lại</Button>
                            </div>
                        ) : (
                            <>
                                <div className='wn-month-stats'>
                                    <div>
                                        <strong>{number(monthQuery.data?.workDays || 0)}</strong>
                                        <span>Công trong tháng</span>
                                    </div>
                                    <div>
                                        <strong>{number(monthQuery.data?.overtimeHours || 0)}</strong>
                                        <span>Giờ tăng ca</span>
                                    </div>
                                </div>
                                {view === 'report' && monthQuery.data ? (
                                    <WorkerNotebookMonthReport report={monthQuery.data} onSelectDate={selectDate} />
                                ) : (
                                    <>
                                        <section className='wn-calendar' aria-label='Lịch ghi chép tháng'>
                                            <div className='wn-weekdays'>
                                                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => (
                                                    <span key={label}>{label}</span>
                                                ))}
                                            </div>
                                            <div className='wn-calendar-grid'>
                                                {Array.from({ length: leadingDays }, (_, index) => (
                                                    <span key={`blank-${index}`} />
                                                ))}
                                                {monthDays.map((date) => {
                                                    const summary = daysByDate.get(date);
                                                    return (
                                                        <button
                                                            type='button'
                                                            key={date}
                                                            disabled={date > today}
                                                            onClick={() => selectDate(date)}
                                                            className={[
                                                                date === today ? 'today' : '',
                                                                summary?.attended ? 'attended' : '',
                                                                summary?.attendanceType === 'half' ? 'half-day' : '',
                                                                summary?.entryCount ? 'has-entries' : '',
                                                            ].join(' ')}
                                                            aria-label={`${date}, ${summary?.attendanceType === 'full' ? 'cả ngày' : summary?.attendanceType === 'half' ? 'nửa ngày' : 'chưa ghi công / nghỉ'}, tăng ca ${summary?.overtimeHours || 0} giờ, ${summary?.entryCount || 0} dòng ghi`}
                                                        >
                                                            <span>{Number(date.slice(-2))}</span>
                                                            {summary?.attendanceType === 'half' && <small>½</small>}
                                                            <i />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className='wn-legend'>
                                                <span>
                                                    <i className='marked' /> Cả ngày
                                                </span>
                                                <span>
                                                    <i className='half-marked' /> Nửa ngày
                                                </span>
                                                <span>
                                                    <i className='noted' /> Có ghi sản lượng
                                                </span>
                                            </div>
                                        </section>
                                        <section className='wn-breakdown'>
                                            <div className='wn-section-heading'>
                                                <div>
                                                    <h2>Sản lượng đã kê</h2>
                                                    <p>Theo mã hàng và công đoạn bạn nhập</p>
                                                </div>
                                            </div>
                                            {monthQuery.data?.breakdown?.length ? (
                                                monthQuery.data.breakdown.map((item) => (
                                                    <div
                                                        className='wn-breakdown-row'
                                                        key={JSON.stringify([item.itemCode, item.operation, item.unit])}
                                                    >
                                                        <span>
                                                            <b>{item.itemCode}</b>
                                                            <small>{item.operation}</small>
                                                        </span>
                                                        <strong>
                                                            {number(item.quantity)} {item.unit}
                                                        </strong>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className='wn-breakdown-empty'>Tháng này chưa có sản lượng tự kê.</p>
                                            )}
                                        </section>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>

            <Drawer
                title='Chấm công ngày'
                placement='bottom'
                height='auto'
                open={attendanceOpen}
                onClose={() => setAttendanceOpen(false)}
                className='wn-drawer'
                destroyOnHidden
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        attendance.mutate(attendanceDraft);
                    }}
                >
                    <p className='wn-form-date'>{dateLabel(selectedDate)}</p>
                    <label>
                        Công trong ngày
                        <Segmented
                            block
                            options={[
                                { label: 'Nghỉ', value: 'off' },
                                { label: 'Nửa ngày', value: 'half' },
                                { label: 'Cả ngày', value: 'full' },
                            ]}
                            value={attendanceDraft.attendanceType}
                            onChange={(value) =>
                                setAttendanceDraft({
                                    ...attendanceDraft,
                                    attendanceType: value as NotebookAttendanceInput['attendanceType'],
                                })
                            }
                        />
                    </label>
                    <label>
                        Số giờ tăng ca
                        <InputNumber
                            aria-label='Số giờ tăng ca'
                            size='large'
                            min={0}
                            max={24}
                            step={0.5}
                            precision={2}
                            value={attendanceDraft.overtimeHours}
                            style={{ width: '100%' }}
                            required
                            onChange={(value) =>
                                setAttendanceDraft({ ...attendanceDraft, overtimeHours: Number(value ?? 0) })
                            }
                        />
                    </label>
                    <div className='wn-attendance-preview'>
                        <span>
                            {attendanceDraft.attendanceType === 'full'
                                ? '1 công'
                                : attendanceDraft.attendanceType === 'half'
                                  ? '0,5 công'
                                  : '0 công'}
                        </span>
                        <span>{number(attendanceDraft.overtimeHours)} giờ tăng ca</span>
                    </div>
                    <Button type='primary' htmlType='submit' size='large' block loading={attendance.isPending}>
                        Lưu chấm công
                    </Button>
                </form>
            </Drawer>

            <Drawer
                title={editingId ? 'Sửa công đoạn' : 'Thêm công đoạn'}
                placement='bottom'
                height='auto'
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                className='wn-drawer'
                destroyOnHidden
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.itemCode.trim() && draft.operation.trim() && draft.quantity > 0 && draft.unit.trim())
                            saveEntry.mutate();
                    }}
                >
                    <label>
                        Mã hàng{' '}
                        <Input
                            size='large'
                            maxLength={100}
                            placeholder='Ví dụ: 416'
                            value={draft.itemCode}
                            onChange={(event) => setDraft({ ...draft, itemCode: event.target.value })}
                            required
                        />
                    </label>
                    <label>
                        Công đoạn{' '}
                        <Input
                            size='large'
                            maxLength={120}
                            placeholder='Ví dụ: May túi'
                            value={draft.operation}
                            onChange={(event) => setDraft({ ...draft, operation: event.target.value })}
                            required
                        />
                    </label>
                    {!!monthQuery.data?.suggestions?.length && !editingId && (
                        <div className='wn-suggestions'>
                            <span>Đã nhập gần đây</span>
                            <div>
                                {monthQuery.data.suggestions.slice(0, 6).map((item) => (
                                    <button
                                        type='button'
                                        key={JSON.stringify([item.itemCode, item.operation, item.unit])}
                                        onClick={() => setDraft({ ...draft, ...item })}
                                    >
                                        {item.itemCode} · {item.operation}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className='wn-form-row'>
                        <label>
                            Số lượng{' '}
                            <InputNumber
                                size='large'
                                min={0.01}
                                max={10000000}
                                value={draft.quantity}
                                onChange={(value) => setDraft({ ...draft, quantity: Number(value || 0) })}
                                style={{ width: '100%' }}
                                required
                            />
                        </label>
                        <label>
                            Đơn vị{' '}
                            <Input
                                size='large'
                                maxLength={30}
                                value={draft.unit}
                                onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                                required
                            />
                        </label>
                    </div>
                    <label>
                        Ghi chú{' '}
                        <Input.TextArea
                            rows={2}
                            maxLength={300}
                            placeholder='Không bắt buộc'
                            value={draft.note}
                            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                        />
                    </label>
                    <Button type='primary' htmlType='submit' size='large' block loading={saveEntry.isPending}>
                        Lưu công đoạn
                    </Button>
                </form>
            </Drawer>
        </div>
    );
};

export default WorkerNotebookPage;
