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
};

const buildAttachmentFormData = (body: string, images: File[]) => {
    const formData = new FormData();
    if (body.trim()) {
        formData.append('body', body.trim());
    }
    images.forEach((file) => formData.append('images', file));
    return formData;
};

export const chatService = {
    getAvailableUsers: (params?: { search?: string; limit?: number }): Promise<ChatUserSummary[]> =>
        api.get<ChatUserSummary[]>('/chat/users', { params }),

    getUnreadSummary: (): Promise<ChatUnreadSummary> => api.get<ChatUnreadSummary>('/chat/unread'),

    getConversations: (params?: { limit?: number }): Promise<ChatConversationListResponse> =>
        api.get<ChatConversationListResponse>('/chat/conversations', { params }),

    getContextConversation: (type: string, id: string): Promise<ChatConversation> =>
        api.get<ChatConversation>(`/chat/context/${type}/${id}`),

    createConversation: (payload: CreateChatConversationPayload): Promise<ChatConversation> =>
        api.post<ChatConversation, CreateChatConversationPayload>('/chat/conversations', payload),

    getMessages: (conversationId: string, params?: { limit?: number; before?: string }): Promise<ChatMessage[]> =>
        api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`, { params }),

    sendMessage: (conversationId: string, payload: SendChatMessagePayload): Promise<ChatMessage> =>
        api.post<ChatMessage, SendChatMessagePayload>(`/chat/conversations/${conversationId}/messages`, payload),

    sendAttachmentMessage: (conversationId: string, body: string, images: File[]): Promise<ChatMessage> =>
        api.post<ChatMessage, FormData>(
            `/chat/conversations/${conversationId}/attachments`,
            buildAttachmentFormData(body, images),
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
};
