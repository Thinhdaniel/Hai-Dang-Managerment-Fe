import type { NotebookAttendanceInput, NotebookEntry } from '../../core/services/worker-notebook.service';

export const notebookNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export const notebookQuantitySize = (value: number, baseSize = 21) =>
    Math.min(baseSize, Math.max(11, Math.floor(140 / notebookNumber(value).length)));

export const notebookDateLabel = (date: string) =>
    new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));

type Attendance = Partial<NotebookAttendanceInput> & { attended?: boolean; attendanceRecorded?: boolean };

export const hasNotebookAttendance = (day?: Attendance) =>
    day?.attendanceRecorded ??
    Boolean(day?.attended || day?.attendanceType === 'full' || day?.attendanceType === 'half' || day?.overtimeHours);

export const notebookAttendanceLabel = (day?: Attendance) => {
    if (!hasNotebookAttendance(day)) return 'Chưa ghi công';
    if (day?.attendanceType === 'full') return 'Cả ngày';
    if (day?.attendanceType === 'half') return 'Nửa ngày';
    return day?.overtimeHours ? 'Chỉ tăng ca' : 'Nghỉ';
};

export const notebookWorkDays = (day?: Attendance) =>
    day?.attendanceType === 'full' ? 1 : day?.attendanceType === 'half' ? 0.5 : 0;

export const groupNotebookEntries = (entries: NotebookEntry[]) => {
    const groups = new Map<string, NotebookEntry[]>();
    for (const entry of entries) groups.set(entry.itemCode, [...(groups.get(entry.itemCode) ?? []), entry]);
    return [...groups].map(([itemCode, items]) => ({ itemCode, entries: items }));
};
