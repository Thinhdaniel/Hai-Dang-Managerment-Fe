export type StoredAssistantMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export const ASSISTANT_CONTEXT_LIMIT = 18;

const SESSION_PREFIX = 'hd-operations-assistant-chat:';
const LEGACY_LOCAL_STORAGE_KEY = 'hd-asset-assistant-chat';

const keyFor = (userId?: string) => (userId ? `${SESSION_PREFIX}${userId}` : '');

export const loadAssistantSession = (userId?: string): StoredAssistantMessage[] => {
    if (!userId) return [];
    try {
        // Xóa bản legacy từng lưu cả structured data trong localStorage.
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
        const raw = sessionStorage.getItem(keyFor(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (item): item is StoredAssistantMessage =>
                    item &&
                    (item.role === 'user' || item.role === 'assistant') &&
                    typeof item.content === 'string' &&
                    Boolean(item.content.trim())
            )
            .slice(-ASSISTANT_CONTEXT_LIMIT);
    } catch {
        return [];
    }
};

export const saveAssistantSession = (userId: string | undefined, messages: StoredAssistantMessage[]) => {
    if (!userId) return;
    try {
        const safe = messages
            .slice(-ASSISTANT_CONTEXT_LIMIT)
            .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
        sessionStorage.setItem(keyFor(userId), JSON.stringify(safe));
    } catch {
        // Storage có thể bị chặn ở chế độ riêng tư; chat vẫn hoạt động trong state.
    }
};

export const clearAssistantSession = (userId?: string) => {
    try {
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
        if (userId) sessionStorage.removeItem(keyFor(userId));
    } catch {
        // noop
    }
};

export const clearAllAssistantSessions = () => {
    try {
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(key);
        }
    } catch {
        // noop
    }
};
