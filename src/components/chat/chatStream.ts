import type { ChatMessage, ChatWorkflowContextType } from '../../core/types';

export const CONTEXT_TYPE_LABEL: Partial<Record<ChatWorkflowContextType, string>> = {
    maintenance: 'Bảo trì',
    transfer: 'Điều chuyển',
    purchase_request: 'Đề xuất mua',
    supply_request: 'Yêu cầu vật tư',
    distribution: 'Cấp phát',
};

// Tin liên tiếp của cùng người trong cửa sổ này được gộp thành 1 cụm
const GROUP_WINDOW_MS = 7 * 60 * 1000;

export type ChatBubbleShape = 'single' | 'first' | 'middle' | 'last';

export type ChatStreamRow =
    | { kind: 'date'; key: string; label: string }
    | { kind: 'system'; key: string; message: ChatMessage }
    | {
          kind: 'message';
          key: string;
          message: ChatMessage;
          isGroupStart: boolean;
          isGroupEnd: boolean;
          shape: ChatBubbleShape;
      };

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const formatDayLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) return 'Hôm nay';
    if (isSameDay(date, yesterday)) return 'Hôm qua';

    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    }).format(date);
};

export const formatTimeShort = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date);
};

export const formatFullTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
};

export const buildChatStream = (messages: ChatMessage[]): ChatStreamRow[] => {
    const rows: ChatStreamRow[] = [];
    let previous: ChatMessage | undefined;

    for (const message of messages) {
        const date = new Date(message.createdAt);
        if (!previous || !isSameDay(new Date(previous.createdAt), date)) {
            rows.push({ kind: 'date', key: `date-${message.id}`, label: formatDayLabel(message.createdAt) });
        }

        if (message.system) {
            rows.push({ kind: 'system', key: message.id, message });
        } else {
            rows.push({
                kind: 'message',
                key: message.id,
                message,
                isGroupStart: true,
                isGroupEnd: true,
                shape: 'single',
            });
        }

        previous = message;
    }

    for (let index = 1; index < rows.length; index++) {
        const row = rows[index];
        const prevRow = rows[index - 1];
        if (row.kind !== 'message' || prevRow.kind !== 'message') continue;

        const gap = new Date(row.message.createdAt).getTime() - new Date(prevRow.message.createdAt).getTime();
        if (row.message.senderId === prevRow.message.senderId && gap <= GROUP_WINDOW_MS) {
            row.isGroupStart = false;
            prevRow.isGroupEnd = false;
        }
    }

    for (const row of rows) {
        if (row.kind !== 'message') continue;
        row.shape = row.isGroupStart ? (row.isGroupEnd ? 'single' : 'first') : row.isGroupEnd ? 'last' : 'middle';
    }

    return rows;
};
