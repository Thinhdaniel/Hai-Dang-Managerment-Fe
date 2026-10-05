import api from '../lib/api';

export type NotebookEntry = {
    _id: string;
    itemCode: string;
    operation: string;
    quantity: number;
    unit: string;
    note: string;
};

export type NotebookDay = {
    date: string;
    attended: boolean;
    attendedAt?: string;
    entries: NotebookEntry[];
};

export type NotebookMonth = {
    month: string;
    attendedDays: number;
    entryCount: number;
    days: Array<{ date: string; attended: boolean; entryCount: number; totalQuantity: number }>;
    suggestions: Array<{ itemCode: string; operation: string; unit: string }>;
    breakdown: Array<{ itemCode: string; operation: string; unit: string; quantity: number }>;
};

export type NotebookEntryInput = Omit<NotebookEntry, '_id'>;

export const workerNotebookService = {
    month: (month: string) => api.get<NotebookMonth>('/worker-notebook/month', { params: { month } }),
    day: (date: string) => api.get<NotebookDay>(`/worker-notebook/day/${date}`),
    attendance: (date: string, attended: boolean) =>
        api.put<NotebookDay>(`/worker-notebook/day/${date}/attendance`, { attended }),
    createEntry: (date: string, entry: NotebookEntryInput) =>
        api.post<NotebookDay>(`/worker-notebook/day/${date}/entries`, entry),
    updateEntry: (date: string, id: string, entry: NotebookEntryInput) =>
        api.patch<NotebookDay>(`/worker-notebook/day/${date}/entries/${id}`, entry),
    deleteEntry: (date: string, id: string) => api.delete<NotebookDay>(`/worker-notebook/day/${date}/entries/${id}`),
};
