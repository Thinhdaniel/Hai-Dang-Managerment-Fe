// A one-off campaign, not an annually recurring holiday theme.
export const WOMENS_DAY_EVENT = {
    id: 'women-day-2026-v1',
    startDate: '2026-10-18',
    endDate: '2026-10-20',
    holidayDate: '2026-10-20',
} as const;

const vietnamDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function notebookVietnamDate(now: Date = new Date()): string {
    const parts = vietnamDateFormatter.formatToParts(now);
    const value = (part: string) => parts.find((item) => item.type === part)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isNotebookWomensDayActive(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= WOMENS_DAY_EVENT.startDate && date <= WOMENS_DAY_EVENT.endDate;
}

export function notebookEventStorageKey(userId: string, preference: 'collapsed' | 'seen'): string {
    return `hd:notebook:${WOMENS_DAY_EVENT.id}:${encodeURIComponent(userId)}:${preference}`;
}
