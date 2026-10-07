import { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, DatePicker, Dropdown, Input, InputNumber, Segmented, Spin } from 'antd';
import datePickerLocale from 'antd/es/date-picker/locale/vi_VN';
import {
    CalendarDays,
    ChartNoAxesCombined,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock3,
    LockKeyhole,
    LogOut,
    MoreHorizontal,
    Pencil,
    Plus,
    Trash2,
    UserRound,
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
import NotebookCalendar from '../components/worker-notebook/NotebookCalendar';
import NotebookEditorShell from '../components/worker-notebook/NotebookEditorShell';
import WorkerChangePasswordModal from '../components/worker-notebook/WorkerChangePasswordModal';
import ProfileAvatarModal from '../components/profile/ProfileAvatarModal';
import {
    groupNotebookEntries,
    hasNotebookAttendance,
    notebookAttendanceLabel,
    notebookDateLabel,
    notebookNumber as number,
    notebookQuantitySize,
    notebookWorkDays,
} from '../components/worker-notebook/notebook-view';
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
const emptyEntry: NotebookEntryInput = { itemCode: '', operation: '', quantity: 1, unit: 'SP', note: '' };
const tabs = [
    { key: 'day' as const, label: 'Ghi ngày', icon: ClipboardList },
    { key: 'month' as const, label: 'Lịch công', icon: CalendarDays },
    { key: 'report' as const, label: 'Tổng hợp', icon: ChartNoAxesCombined },
];

export default function WorkerNotebookPage() {
    const { user, logout } = useAuth();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const today = vietnamToday();
    const [selectedDate, setSelectedDate] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [view, setView] = useState<'day' | 'month' | 'report'>('day');
    const [previewDate, setPreviewDate] = useState(today);
    const [profileOpen, setProfileOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [attendanceOpen, setAttendanceOpen] = useState(false);
    const [attendanceDraft, setAttendanceDraft] = useState<NotebookAttendanceInput>({
        attendanceType: 'off',
        overtimeHours: 0,
    });
    const [attendanceBaseline, setAttendanceBaseline] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<NotebookEntryInput>(emptyEntry);
    const [entryBaseline, setEntryBaseline] = useState('');
    const dirty =
        (editorOpen && JSON.stringify(draft) !== entryBaseline) ||
        (attendanceOpen && JSON.stringify(attendanceDraft) !== attendanceBaseline);
    useEffect(() => {
        if (!dirty) return;
        const preventLoss = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventLoss);
        return () => window.removeEventListener('beforeunload', preventLoss);
    }, [dirty]);

    const monthQuery = useQuery({
        queryKey: ['worker-notebook', user?.id, 'month', month],
        queryFn: () => workerNotebookService.month(month),
        enabled: !!user?.id,
    });
    const dayQuery = useQuery({
        queryKey: ['worker-notebook', user?.id, 'day', selectedDate],
        queryFn: () => workerNotebookService.day(selectedDate),
        enabled: !!user?.id,
    });
    const day = dayQuery.data;
    const report = monthQuery.data;
    const entryGroups = useMemo(() => groupNotebookEntries(day?.entries ?? []), [day?.entries]);
    const summaries = new Map(report?.days.map((item) => [item.date, item]) ?? []);
    const weekStart = dayjs(selectedDate).subtract((dayjs(selectedDate).day() + 6) % 7, 'day');
    const week = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day').format('YYYY-MM-DD'));
    const refresh = async (date: string) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['worker-notebook', user?.id, 'day', date] }),
            queryClient.invalidateQueries({ queryKey: ['worker-notebook', user?.id, 'month'] }),
        ]);
    };
    const attendance = useMutation({
        mutationFn: ({ date, input }: { date: string; input: NotebookAttendanceInput }) =>
            workerNotebookService.attendance(date, input),
        onSuccess: async (_, variables) => {
            setAttendanceOpen(false);
            await refresh(variables.date);
            message.success('Đã lưu chấm công');
        },
        onError: () => message.error('Không lưu được chấm công. Thử lại, dữ liệu nhập vẫn được giữ.'),
    });
    const saveEntry = useMutation({
        mutationFn: ({ date, entry, id }: { date: string; entry: NotebookEntryInput; id: string | null }) =>
            id ? workerNotebookService.updateEntry(date, id, entry) : workerNotebookService.createEntry(date, entry),
        onSuccess: async (_, variables) => {
            setEditorOpen(false);
            await refresh(variables.date);
            message.success('Đã lưu công đoạn');
        },
        onError: () => message.error('Không lưu được công đoạn. Kiểm tra dữ liệu và thử lại.'),
    });
    const removeEntry = useMutation({
        mutationFn: ({ date, id }: { date: string; id: string }) => workerNotebookService.deleteEntry(date, id),
        onSuccess: async (_, variables) => {
            await refresh(variables.date);
            message.success('Đã xóa dòng ghi');
        },
        onError: () => message.error('Không xóa được công đoạn. Vui lòng thử lại.'),
    });
    const openEditor = (entry?: NotebookEntry) => {
        const next = entry
            ? {
                  itemCode: entry.itemCode,
                  operation: entry.operation,
                  quantity: entry.quantity,
                  unit: entry.unit,
                  note: entry.note || '',
              }
            : { ...emptyEntry };
        setEditingId(entry?._id ?? null);
        setDraft(next);
        setEntryBaseline(JSON.stringify(next));
        setEditorOpen(true);
    };
    const openAttendance = () => {
        const next = { attendanceType: day?.attendanceType ?? 'off', overtimeHours: day?.overtimeHours ?? 0 };
        setAttendanceDraft(next);
        setAttendanceBaseline(JSON.stringify(next));
        setAttendanceOpen(true);
    };
    const closeEditor = (kind: 'entry' | 'attendance') => {
        if (saveEntry.isPending || attendance.isPending) return;
        const close = () => (kind === 'entry' ? setEditorOpen(false) : setAttendanceOpen(false));
        const changed =
            kind === 'entry'
                ? JSON.stringify(draft) !== entryBaseline
                : JSON.stringify(attendanceDraft) !== attendanceBaseline;
        if (!changed) return close();
        modal.confirm({
            title: 'Bỏ thay đổi chưa lưu?',
            content: 'Các thay đổi vừa nhập sẽ không được lưu.',
            okText: 'Bỏ thay đổi',
            cancelText: 'Tiếp tục nhập',
            okButtonProps: { danger: true },
            onOk: close,
        });
    };
    const confirmDelete = (entry: NotebookEntry) =>
        modal.confirm({
            title: 'Xóa công đoạn này?',
            content: `${entry.itemCode} · ${entry.operation} · ${number(entry.quantity)} ${entry.unit}`,
            okText: 'Xóa',
            cancelText: 'Giữ lại',
            okButtonProps: { danger: true },
            onOk: () => removeEntry.mutateAsync({ date: selectedDate, id: entry._id }),
        });
    const switchView = (next: typeof view, date = selectedDate) => {
        if (next === 'day') setMonth(date.slice(0, 7));
        setView(next);
        window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const selectDate = (date: string) => {
        setSelectedDate(date);
        setMonth(date.slice(0, 7));
        setPreviewDate(date);
        switchView('day', date);
    };
    const changeMonth = (next: string) => {
        if (next > today.slice(0, 7)) return;
        setMonth(next);
        setPreviewDate(next === today.slice(0, 7) ? today : `${next}-01`);
    };

    return (
        <div className='wn-page'>
            <header className='wn-header'>
                <div className='wn-header-inner'>
                    <div className='wn-brand'>
                        <img src='/brand/company-logo.png' alt='Hải Đăng' />
                        <div>
                            <small>Hải Đăng</small>
                            <strong>Sổ của tôi</strong>
                        </div>
                    </div>
                    <nav
                        className={`wn-navigation ${editorOpen || attendanceOpen ? 'editor-open' : ''}`}
                        role='tablist'
                        aria-label='Xem sổ'
                        onKeyDown={(event) => {
                            const index = tabs.findIndex((tab) => tab.key === view);
                            const next =
                                event.key === 'ArrowRight'
                                    ? (index + 1) % 3
                                    : event.key === 'ArrowLeft'
                                      ? (index + 2) % 3
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? 2
                                          : -1;
                            if (next < 0) return;
                            event.preventDefault();
                            switchView(tabs[next].key);
                            event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
                        }}
                    >
                        {tabs.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                id={`wn-tab-${key}`}
                                type='button'
                                role='tab'
                                aria-controls='wn-panel'
                                aria-selected={view === key}
                                tabIndex={view === key ? 0 : -1}
                                className={view === key ? 'active' : ''}
                                onClick={() => switchView(key)}
                            >
                                <Icon size={20} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </nav>
                    <Dropdown
                        trigger={['click']}
                        menu={{
                            items: [
                                {
                                    key: 'identity',
                                    disabled: true,
                                    label: (
                                        <div className='wn-account-identity'>
                                            <strong>{user?.name}</strong>
                                            <span>{user?.plant?.name || 'Sổ cá nhân'}</span>
                                        </div>
                                    ),
                                },
                                { type: 'divider' },
                                { key: 'profile', label: 'Hồ sơ cá nhân', icon: <UserRound size={16} /> },
                                { key: 'password', label: 'Đổi mật khẩu', icon: <LockKeyhole size={16} /> },
                                { key: 'logout', label: 'Đăng xuất', icon: <LogOut size={16} />, danger: true },
                            ],
                            onClick: ({ key }) => {
                                if (key === 'profile') setProfileOpen(true);
                                if (key === 'password') setPasswordOpen(true);
                                if (key === 'logout')
                                    modal.confirm({
                                        title: 'Đăng xuất khỏi sổ?',
                                        okText: 'Đăng xuất',
                                        cancelText: 'Ở lại',
                                        onOk: () => logout(),
                                    });
                            },
                        }}
                    >
                        <button type='button' className='wn-account-button' aria-label='Tài khoản' title='Tài khoản'>
                            <Avatar size={34} src={user?.avatarUrl} className='wn-avatar'>
                                {user?.name?.trim().split(' ').at(-1)?.slice(0, 1) || 'C'}
                            </Avatar>
                            <span className='wn-account-name'>{user?.name}</span>
                            <ChevronDown size={16} />
                        </button>
                    </Dropdown>
                </div>
            </header>
            <main id='wn-panel' className='wn-main' role='tabpanel' aria-labelledby={`wn-tab-${view}`}>
                <div className='wn-page-heading'>
                    <div>
                        <h1>
                            {view === 'day'
                                ? selectedDate === today
                                    ? 'Hôm nay'
                                    : 'Ghi chép ngày'
                                : view === 'month'
                                  ? 'Lịch công của tôi'
                                  : 'Tổng hợp tháng'}
                        </h1>
                        <p>{view === 'day' ? notebookDateLabel(selectedDate) : user?.plant?.name || user?.name}</p>
                    </div>
                    {view === 'day' ? (
                        <DatePicker
                            locale={datePickerLocale}
                            value={dayjs(selectedDate)}
                            format='DD/MM/YYYY'
                            allowClear={false}
                            inputReadOnly
                            aria-label='Chọn ngày ghi chép'
                            disabledDate={(date) => date.format('YYYY-MM-DD') > today}
                            onChange={(date) => {
                                if (date) selectDate(date.format('YYYY-MM-DD'));
                            }}
                        />
                    ) : (
                        <button type='button' className='wn-secondary-button' onClick={() => selectDate(today)}>
                            <CalendarDays size={17} /> Hôm nay
                        </button>
                    )}
                </div>
                {view === 'day' ? (
                    <>
                        <div className='wn-week-bar'>
                            <button
                                type='button'
                                className='wn-icon-button'
                                aria-label='Tuần trước'
                                onClick={() => selectDate(dayjs(selectedDate).subtract(7, 'day').format('YYYY-MM-DD'))}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <div className='wn-week-strip'>
                                {week.map((date, i) => (
                                    <button
                                        key={date}
                                        type='button'
                                        disabled={date > today}
                                        aria-pressed={date === selectedDate}
                                        aria-label={notebookDateLabel(date)}
                                        className={date === selectedDate ? 'selected' : ''}
                                        onClick={() => selectDate(date)}
                                    >
                                        <span>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</span>
                                        <strong>{Number(date.slice(-2))}</strong>
                                        <i className={hasNotebookAttendance(summaries.get(date)) ? 'recorded' : ''} />
                                    </button>
                                ))}
                            </div>
                            <button
                                type='button'
                                className='wn-icon-button'
                                aria-label='Tuần sau'
                                disabled={week[6] >= today}
                                onClick={() =>
                                    selectDate(
                                        [dayjs(selectedDate).add(7, 'day').format('YYYY-MM-DD'), today].sort()[0]
                                    )
                                }
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                        {dayQuery.isLoading ? (
                            <div className='wn-loading'>
                                <Spin />
                            </div>
                        ) : dayQuery.isError ? (
                            <div className='wn-feedback'>
                                <strong>Không tải được ghi chép ngày.</strong>
                                <Button onClick={() => void dayQuery.refetch()}>Thử lại</Button>
                            </div>
                        ) : (
                            <div className='wn-day-layout'>
                                <aside className='wn-day-aside'>
                                    <section className='wn-attendance' aria-label='Chấm công'>
                                        <div className='wn-tool-heading'>
                                            <span>
                                                <Check size={18} /> Chấm công ngày
                                            </span>
                                            <button
                                                className='wn-icon-button'
                                                type='button'
                                                title='Sửa chấm công'
                                                aria-label='Sửa chấm công'
                                                onClick={openAttendance}
                                            >
                                                <Pencil size={17} />
                                            </button>
                                        </div>
                                        <span
                                            className={`wn-status ${hasNotebookAttendance(day) ? day?.attendanceType : 'unmarked'}`}
                                        >
                                            {notebookAttendanceLabel(day)}
                                        </span>
                                        <div className='wn-attendance-values'>
                                            <div>
                                                <strong>{number(notebookWorkDays(day))}</strong>
                                                <span>Công trong ngày</span>
                                            </div>
                                            <div>
                                                <strong>{number(day?.overtimeHours ?? 0)}</strong>
                                                <span>
                                                    <Clock3 size={14} /> Giờ tăng ca
                                                </span>
                                            </div>
                                        </div>
                                        {!hasNotebookAttendance(day) && (
                                            <button
                                                className='wn-secondary-button'
                                                type='button'
                                                onClick={openAttendance}
                                            >
                                                <Pencil size={16} />{' '}
                                                {selectedDate === today ? 'Ghi công hôm nay' : 'Ghi công ngày này'}
                                            </button>
                                        )}
                                    </section>
                                    <section className='wn-aside-month' aria-label='Tóm tắt tháng'>
                                        <h2>Tháng {dayjs(`${month}-01`).format('MM/YYYY')}</h2>
                                        {monthQuery.isError ? (
                                            <Button onClick={() => void monthQuery.refetch()}>
                                                Tải lại tổng tháng
                                            </Button>
                                        ) : (
                                            <>
                                                <div>
                                                    <span>Tổng công</span>
                                                    <strong>
                                                        {monthQuery.isLoading ? '…' : number(report?.workDays ?? 0)}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span>Tăng ca</span>
                                                    <strong>
                                                        {monthQuery.isLoading
                                                            ? '…'
                                                            : `${number(report?.overtimeHours ?? 0)} giờ`}
                                                    </strong>
                                                </div>
                                                <button type='button' onClick={() => switchView('report')}>
                                                    Xem tổng hợp <ChevronRight size={16} />
                                                </button>
                                            </>
                                        )}
                                    </section>
                                </aside>
                                <section className='wn-entries' aria-label='Công đoạn đã làm'>
                                    <div className='wn-section-heading'>
                                        <div>
                                            <h2>Công đoạn đã làm</h2>
                                            <p>
                                                {day?.entries.length ?? 0} công đoạn · {entryGroups.length} mã hàng
                                            </p>
                                        </div>
                                        <Button
                                            className='wn-primary-button'
                                            type='primary'
                                            size='large'
                                            icon={<Plus size={19} />}
                                            onClick={() => openEditor()}
                                        >
                                            Ghi sản lượng
                                        </Button>
                                    </div>
                                    {entryGroups.length ? (
                                        <div className='wn-entry-groups'>
                                            {entryGroups.map((group) => (
                                                <article className='wn-entry-group' key={group.itemCode}>
                                                    <header>
                                                        <span>
                                                            Mã hàng <strong>{group.itemCode}</strong>
                                                        </span>
                                                        <small>{group.entries.length} công đoạn</small>
                                                    </header>
                                                    {group.entries.map((entry) => (
                                                        <div className='wn-entry-row' key={entry._id}>
                                                            <button
                                                                className='wn-entry-content'
                                                                type='button'
                                                                onClick={() => openEditor(entry)}
                                                                aria-label={`Sửa ${entry.operation}`}
                                                            >
                                                                <span>
                                                                    <strong>{entry.operation}</strong>
                                                                    {entry.note && <small>{entry.note}</small>}
                                                                </span>
                                                                <span className='wn-entry-quantity'>
                                                                    <strong
                                                                        style={{
                                                                            fontSize: notebookQuantitySize(
                                                                                entry.quantity
                                                                            ),
                                                                        }}
                                                                    >
                                                                        {number(entry.quantity)}
                                                                    </strong>
                                                                    <small>{entry.unit}</small>
                                                                </span>
                                                            </button>
                                                            <Dropdown
                                                                trigger={['click']}
                                                                menu={{
                                                                    items: [
                                                                        {
                                                                            key: 'edit',
                                                                            label: 'Sửa',
                                                                            icon: <Pencil size={16} />,
                                                                        },
                                                                        {
                                                                            key: 'delete',
                                                                            label: 'Xóa',
                                                                            icon: <Trash2 size={16} />,
                                                                            danger: true,
                                                                        },
                                                                    ],
                                                                    onClick: ({ key }) =>
                                                                        key === 'edit'
                                                                            ? openEditor(entry)
                                                                            : confirmDelete(entry),
                                                                }}
                                                            >
                                                                <button
                                                                    type='button'
                                                                    className='wn-icon-button wn-entry-menu'
                                                                    disabled={removeEntry.isPending}
                                                                    title='Thao tác công đoạn'
                                                                    aria-label={`Thao tác ${entry.operation}`}
                                                                >
                                                                    <MoreHorizontal size={20} />
                                                                </button>
                                                            </Dropdown>
                                                        </div>
                                                    ))}
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className='wn-empty'>
                                            <ClipboardList size={30} />
                                            <h3>Chưa có công đoạn nào</h3>
                                            <p>Ghi lại công việc đã làm trong ngày.</p>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className='wn-month-heading'>
                            <button
                                type='button'
                                className='wn-icon-button'
                                aria-label='Tháng trước'
                                onClick={() => changeMonth(dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM'))}
                            >
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
                                value={dayjs(`${month}-01`)}
                                disabledDate={(date) => date.format('YYYY-MM') > today.slice(0, 7)}
                                onChange={(date) => {
                                    if (date) changeMonth(date.format('YYYY-MM'));
                                }}
                            />
                            <button
                                type='button'
                                className='wn-icon-button'
                                aria-label='Tháng sau'
                                disabled={month >= today.slice(0, 7)}
                                onClick={() => changeMonth(dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM'))}
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
                                <strong>Không tải được dữ liệu tháng.</strong>
                                <Button onClick={() => void monthQuery.refetch()}>Thử lại</Button>
                            </div>
                        ) : (
                            report && (
                                <>
                                    <div className='wn-month-stats'>
                                        <div>
                                            <span>Tổng công tháng</span>
                                            <strong>
                                                {number(report.workDays)} <small>công</small>
                                            </strong>
                                        </div>
                                        <div>
                                            <span>
                                                <Clock3 size={15} /> Tăng ca
                                            </span>
                                            <strong>
                                                {number(report.overtimeHours)} <small>giờ</small>
                                            </strong>
                                        </div>
                                    </div>
                                    {view === 'report' ? (
                                        <WorkerNotebookMonthReport
                                            key={month}
                                            report={report}
                                            onSelectDate={selectDate}
                                        />
                                    ) : (
                                        <NotebookCalendar
                                            report={report}
                                            today={today}
                                            selectedDate={
                                                previewDate.slice(0, 7) === month ? previewDate : `${month}-01`
                                            }
                                            onPreview={setPreviewDate}
                                            onOpenDay={selectDate}
                                        />
                                    )}
                                </>
                            )
                        )}
                    </>
                )}
                <footer className='wn-page-footer'>Sổ ghi chép cá nhân · Hải Đăng</footer>
            </main>
            {profileOpen && <ProfileAvatarModal onClose={() => setProfileOpen(false)} />}
            {passwordOpen && <WorkerChangePasswordModal onClose={() => setPasswordOpen(false)} />}
            <NotebookEditorShell
                open={attendanceOpen}
                title='Chấm công ngày'
                formId='wn-attendance-form'
                saveLabel='Lưu chấm công'
                saving={attendance.isPending}
                onClose={() => closeEditor('attendance')}
            >
                <form
                    id='wn-attendance-form'
                    className='wn-form'
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (attendance.isPending) return;
                        attendance.mutate({ date: selectedDate, input: attendanceDraft });
                    }}
                >
                    <p className='wn-form-date'>{notebookDateLabel(selectedDate)}</p>
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
                            inputMode='decimal'
                            value={attendanceDraft.overtimeHours}
                            required
                            onChange={(value) =>
                                setAttendanceDraft({ ...attendanceDraft, overtimeHours: Number(value ?? 0) })
                            }
                        />
                    </label>
                    <div className='wn-attendance-preview'>
                        <span>
                            {attendanceDraft.attendanceType === 'full'
                                ? '1'
                                : attendanceDraft.attendanceType === 'half'
                                  ? '0,5'
                                  : '0'}{' '}
                            công
                        </span>
                        <span>{number(attendanceDraft.overtimeHours)} giờ tăng ca</span>
                    </div>
                </form>
            </NotebookEditorShell>
            <NotebookEditorShell
                open={editorOpen}
                title={editingId ? 'Sửa công đoạn' : 'Ghi sản lượng'}
                formId='wn-entry-form'
                saveLabel='Lưu công đoạn'
                saving={saveEntry.isPending}
                onClose={() => closeEditor('entry')}
            >
                <form
                    id='wn-entry-form'
                    className='wn-form'
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (saveEntry.isPending) return;
                        if (
                            draft.itemCode.trim() &&
                            draft.operation.trim() &&
                            draft.quantity >= 0.01 &&
                            draft.unit.trim()
                        )
                            saveEntry.mutate({ date: selectedDate, entry: draft, id: editingId });
                        else message.warning('Điền mã hàng, công đoạn, đơn vị và số lượng từ 0,01.');
                    }}
                >
                    <p className='wn-form-date'>{notebookDateLabel(selectedDate)}</p>
                    {!!report?.suggestions.length && !editingId && (
                        <div className='wn-suggestions'>
                            <span>Đã nhập gần đây</span>
                            <div>
                                {report.suggestions.slice(0, 6).map((item) => (
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
                    <label>
                        Mã hàng
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
                        Công đoạn
                        <Input
                            size='large'
                            maxLength={120}
                            placeholder='Ví dụ: May túi'
                            value={draft.operation}
                            onChange={(event) => setDraft({ ...draft, operation: event.target.value })}
                            required
                        />
                    </label>
                    <div className='wn-form-row'>
                        <label>
                            Số lượng
                            <InputNumber
                                aria-label='Số lượng'
                                size='large'
                                min={0.01}
                                max={10000000}
                                inputMode='decimal'
                                value={draft.quantity}
                                onChange={(value) => setDraft({ ...draft, quantity: Number(value ?? 0) })}
                                required
                            />
                        </label>
                        <label>
                            Đơn vị
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
                        Ghi chú <small>Không bắt buộc</small>
                        <Input.TextArea
                            rows={2}
                            maxLength={300}
                            value={draft.note}
                            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                        />
                    </label>
                </form>
            </NotebookEditorShell>
        </div>
    );
}
