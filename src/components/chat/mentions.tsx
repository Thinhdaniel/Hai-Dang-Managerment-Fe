import React, { useCallback, useRef, useState } from 'react';
import type { ChatMessage, ChatUserSummary } from '../../core/types';

// Token đặc biệt khi nhắc cả nhóm (@all). Hiển thị tiếng Việt cho thân thiện.
export const ALL_MENTION_TOKEN = '@Tất cả';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalize = (value?: string) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

export type MentionCandidate = { id: string; name: string; subtitle?: string };

// Suy ra token mention từ nội dung soạn: id thành viên có "@Tên" + '@all' nếu có "@Tất cả".
export const extractMentionTokens = (text: string, participants: { id: string; name: string }[]): string[] => {
    if (!text || !text.includes('@')) return [];
    const tokens = new Set<string>();
    if (text.includes(ALL_MENTION_TOKEN)) tokens.add('@all');
    for (const participant of participants) {
        if (!participant.name) continue;
        const re = new RegExp(`@${escapeRegExp(participant.name)}(?![\\p{L}\\p{N}])`, 'u');
        if (re.test(text)) tokens.add(participant.id);
    }
    return Array.from(tokens);
};

// Tên cần tô sáng trong 1 tin = tên các thành viên được nhắc + 'Tất cả' nếu nội dung có @Tất cả.
export const mentionHighlightNames = (message: ChatMessage, participants: ChatUserSummary[]): string[] => {
    const names: string[] = [];
    const ids = new Set(message.mentions ?? []);
    if (ids.size) {
        participants.forEach((participant) => {
            if (ids.has(participant.id) && participant.name) names.push(participant.name);
        });
    }
    if (message.body?.includes(ALL_MENTION_TOKEN)) names.push('Tất cả');
    return names;
};

// Render nội dung tin, tô sáng các @mention.
export const MentionText: React.FC<{ text: string; names: string[] }> = ({ text, names }) => {
    if (!text || !names.length) return <>{text}</>;
    const tokens = names.map((name) => `@${name}`);
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'g');
    const parts = text.split(pattern);
    return (
        <>
            {parts.map((part, index) =>
                tokens.includes(part) ? (
                    <span key={index} className='rounded bg-blue-100 px-0.5 font-semibold text-blue-700'>
                        {part}
                    </span>
                ) : (
                    <React.Fragment key={index}>{part}</React.Fragment>
                )
            )}
        </>
    );
};

// Hook quản lý gợi ý @mention trong ô soạn dựa vào vị trí con trỏ.
export const useMentionInput = () => {
    const [query, setQuery] = useState<string | null>(null);
    const anchorRef = useRef(0); // vị trí ký tự '@'
    const caretRef = useRef(0);

    const analyze = useCallback(
        (value: string, caret: number) => {
            const upToCaret = value.slice(0, caret);
            const match = /(?:^|\s)@([^\s@]*)$/.exec(upToCaret);
            if (match) {
                anchorRef.current = caret - match[1].length - 1;
                caretRef.current = caret;
                setQuery(match[1]);
            } else if (query !== null) {
                setQuery(null);
            }
        },
        [query]
    );

    const apply = useCallback((value: string, candidate: MentionCandidate) => {
        const start = anchorRef.current;
        const end = caretRef.current;
        const label = candidate.id === '@all' ? ALL_MENTION_TOKEN : `@${candidate.name}`;
        const insert = `${label} `;
        const nextValue = value.slice(0, start) + insert + value.slice(end);
        setQuery(null);
        return { value: nextValue, caret: start + insert.length };
    }, []);

    const close = useCallback(() => setQuery(null), []);

    return { query, isOpen: query !== null, analyze, apply, close };
};

// Danh sách gợi ý: @Tất cả (nếu khớp) + thành viên khớp từ khoá, tối đa 8.
export const filterMentionCandidates = (
    participants: ChatUserSummary[],
    query: string | null,
    currentUserId?: string
): MentionCandidate[] => {
    const q = normalize(query ?? '');
    const allMatches = !q || 'tat ca'.includes(q);
    const all: MentionCandidate[] = allMatches
        ? [{ id: '@all', name: 'Tất cả', subtitle: 'Nhắc mọi người trong nhóm' }]
        : [];
    const people = participants
        .filter((participant) => participant.id !== currentUserId)
        .filter((participant) => !q || normalize(participant.name).includes(q))
        .map((participant) => ({ id: participant.id, name: participant.name, subtitle: participant.plant?.name }));
    return [...all, ...people].slice(0, 8);
};

// Lấy phần tử <textarea> thật bên trong AntD TextArea để đặt lại con trỏ sau khi chèn mention.
export const focusTextAreaCaret = (composerRef: React.MutableRefObject<any>, caret: number) => {
    window.requestAnimationFrame(() => {
        const el = composerRef.current?.resizableTextArea?.textArea as HTMLTextAreaElement | undefined;
        if (el) {
            el.focus();
            el.setSelectionRange(caret, caret);
        } else {
            composerRef.current?.focus?.();
        }
    });
};
