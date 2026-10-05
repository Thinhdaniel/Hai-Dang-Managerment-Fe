import api from '../lib/api';

export type NotebookEntry = {
    _id: string;
    itemCode: string;
    operation: string;
    quantity: number;
    unit: string;
    note: string;
};

export type NotebookAttendanceType = 'full' | 'half' | 'off';
export type NotebookAttendanceInput = { attendanceType: NotebookAttendanceType; overtimeHours: number };
export type NotebookUnitTotal = { unit: string; quantity: number };

export type NotebookDay = NotebookAttendanceInput & {
    date: string;
    attended: boolean;
    attendedAt?: string;
    entries: NotebookEntry[];
};

export type NotebookMonth = {
    month: string;
    attendedDays: number;
    fullDays: number;
    halfDays: number;
    workDays: number;
    overtimeHours: number;
    productionDays: number;
    entryCount: number;
    totalsByUnit: NotebookUnitTotal[];
    days: Array<
        NotebookAttendanceInput & {
            date: string;
            attended: boolean;
            workDays: number;
            entryCount: number;
            totalsByUnit: NotebookUnitTotal[];
        }
    >;
    suggestions: Array<{ itemCode: string; operation: string; unit: string }>;
    breakdown: Array<{ itemCode: string; operation: string; unit: string; quantity: number; recordedDays: number }>;
};

export type NotebookEntryInput = Omit<NotebookEntry, '_id'>;

export const workerNotebookService = {
    month: (month: string) => api.get<NotebookMonth>('/worker-notebook/month', { params: { month } }),
    day: (date: string) => api.get<NotebookDay>(`/worker-notebook/day/${date}`),
    attendance: (date: string, attendance: NotebookAttendanceInput) =>
        api.put<NotebookDay>(`/worker-notebook/day/${date}/attendance`, attendance),
    createEntry: (date: string, entry: NotebookEntryInput) =>
        api.post<NotebookDay>(`/worker-notebook/day/${date}/entries`, entry),
    updateEntry: (date: string, id: string, entry: NotebookEntryInput) =>
        api.patch<NotebookDay>(`/worker-notebook/day/${date}/entries/${id}`, entry),
    deleteEntry: (date: string, id: string) => api.delete<NotebookDay>(`/worker-notebook/day/${date}/entries/${id}`),
};
