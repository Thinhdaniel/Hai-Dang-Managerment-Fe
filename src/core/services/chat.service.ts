import api from '../lib/api';
import type {
    ChatConversation,
    ChatConversationListResponse,
    ChatMessage,
    ChatUnreadSummary,
    ChatUserSummary,
} from '../types';

export type CreateChatConversationPayload = {
    participantIds: string[];
    title?: string;
};

export type SendChatMessagePayload = {
    body: string;
    replyTo?: string;
    mentions?: string[];
};

export type SendChatAttachmentPayload = {
    images?: File[];
    audio?: File;
    audioDurationMs?: number;
};

const buildAttachmentFormData = (
    body: string,
    attachments: SendChatAttachmentPayload,
    replyTo?: string,
    mentions?: string[]
) => {
    const formData = new FormData();
    if (body.trim()) {
        formData.append('body', body.trim());
    }
    if (replyTo) {
        formData.append('replyTo', replyTo);
    }
    if (mentions && mentions.length) {
        formData.append('mentions', JSON.stringify(mentions));
    }
    (attachments.images ?? []).forEach((file) => formData.append('images', file));
    if (attachments.audio) {
        formData.append('audio', attachments.audio);
    }
    if (attachments.audioDurationMs) {
        formData.append('audioDurationMs', String(Math.round(attachments.audioDurationMs)));
    }
    return formData;
};

export const chatService = {
    getAvailableUsers: (params?: { search?: string; limit?: number }): Promise<ChatUserSummary[]> =>
        api.get<ChatUserSummary[]>('/chat/users', { params }),

    getUnreadSummary: (): Promise<ChatUnreadSummary> => api.get<ChatUnreadSummary>('/chat/unread'),

    getConversations: (params?: { limit?: number; archived?: boolean }): Promise<ChatConversationListResponse> =>
        api.get<ChatConversationListResponse>('/chat/conversations', { params }),

    getContextConversation: (type: string, id: string): Promise<ChatConversation> =>
        api.get<ChatConversation>(`/chat/context/${type}/${id}`),

    createConversation: (payload: CreateChatConversationPayload): Promise<ChatConversation> =>
        api.post<ChatConversation, CreateChatConversationPayload>('/chat/conversations', payload),

    getMessages: (conversationId: string, params?: { limit?: number; before?: string }): Promise<ChatMessage[]> =>
        api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`, { params }),

    sendMessage: (conversationId: string, payload: SendChatMessagePayload): Promise<ChatMessage> =>
        api.post<ChatMessage, SendChatMessagePayload>(`/chat/conversations/${conversationId}/messages`, payload),

    sendAttachmentMessage: (
        conversationId: string,
        body: string,
        attachments: SendChatAttachmentPayload,
        replyTo?: string,
        mentions?: string[]
    ): Promise<ChatMessage> =>
        api.post<ChatMessage, FormData>(
            `/chat/conversations/${conversationId}/attachments`,
            buildAttachmentFormData(body, attachments, replyTo, mentions),
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                timeout: 120000,
            }
        ),

    markAsRead: (
        conversationId: string
    ): Promise<{ conversationId: string; unreadCount: number; totalUnread: number }> =>
        api.patch<{ conversationId: string; unreadCount: number; totalUnread: number }>(
            `/chat/conversations/${conversationId}/read`
        ),

    setMuted: (conversationId: string, muted: boolean): Promise<{ conversationId: string; muted: boolean }> =>
        api.patch<{ conversationId: string; muted: boolean }, { muted: boolean }>(
            `/chat/conversations/${conversationId}/mute`,
            { muted }
        ),

    recallMessage: (conversationId: string, messageId: string): Promise<ChatMessage> =>
        api.delete<ChatMessage>(`/chat/conversations/${conversationId}/messages/${messageId}`),

    toggleReaction: (conversationId: string, messageId: string, emoji: string): Promise<ChatMessage> =>
        api.post<ChatMessage, { emoji: string }>(
            `/chat/conversations/${conversationId}/messages/${messageId}/reactions`,
            { emoji }
        ),

    togglePin: (conversationId: string, messageId: string): Promise<ChatMessage> =>
        api.patch<ChatMessage>(`/chat/conversations/${conversationId}/messages/${messageId}/pin`),

    getPinned: (conversationId: string): Promise<ChatMessage[]> =>
        api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/pinned`),

    searchMessages: (conversationId: string, q: string): Promise<ChatMessage[]> =>
        api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages/search`, { params: { q } }),

    getMyMentions: (): Promise<ChatMessage[]> => api.get<ChatMessage[]>('/chat/mentions'),
};
