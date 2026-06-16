import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from '../hooks/useSocket';
import { chatService } from '../services/chat.service';
import { playNotificationSound } from '../lib/notificationSound';
import type { ChatConversation, ChatMessage } from '../types';

export type ChatMessageEvent = {
    conversation: ChatConversation;
    message: ChatMessage;
    totalUnread: number;
};

export type ChatConversationUpdateEvent = {
    conversation: ChatConversation;
    totalUnread: number;
};

export type ChatMessageRecalledEvent = {
    conversationId: string;
    message: ChatMessage;
};

export type ChatMessageUpdatedEvent = {
    conversationId: string;
    message: ChatMessage;
};

export type ChatTypingEvent = {
    conversationId: string;
    userId: string;
    name: string;
};

export type ChatReadEvent = {
    conversationId: string;
    unreadCount?: number;
    totalUnread: number;
};

export type ChatConversationReadEvent = {
    conversationId: string;
    userId: string;
    lastReadAt: string;
};

export type ChatPresenceEvent = {
    userId: string;
    online: boolean;
};

type ChatContextValue = {
    unreadCount: number;
    refreshUnread: () => Promise<void>;
    onlineUserIds: Set<string>;
    isUserOnline: (userId?: string | null) => boolean;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, user } = useAuth();
    const { socket } = useSocket();
    const [unreadCount, setUnreadCount] = useState(0);
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    const refreshUnread = useCallback(async () => {
        if (!isAuthenticated) {
            setUnreadCount(0);
            return;
        }

        try {
            const summary = await chatService.getUnreadSummary();
            setUnreadCount(Number(summary.unreadCount ?? 0));
        } catch {
            setUnreadCount(0);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        void refreshUnread();
    }, [refreshUnread]);

    useEffect(() => {
        if (!isAuthenticated || !socket) return;

        const onMessage = (payload: ChatMessageEvent) => {
            setUnreadCount(Number(payload.totalUnread ?? 0));

            // Chuông cho tin nhắn mới của người khác (tin của chính mình thì không kêu)
            if (payload.message.senderId !== user?.id) {
                playNotificationSound();
            }
        };

        const onConversationUpdate = (payload: ChatConversationUpdateEvent) => {
            setUnreadCount(Number(payload.totalUnread ?? 0));
        };

        const onRead = (payload: ChatReadEvent) => {
            setUnreadCount(Number(payload.totalUnread ?? 0));
        };

        const onPresenceInit = (payload: { userIds?: string[] }) => {
            setOnlineUserIds(new Set(payload.userIds ?? []));
        };

        const onPresence = (payload: ChatPresenceEvent) => {
            setOnlineUserIds((prev) => {
                const next = new Set(prev);
                if (payload.online) next.add(payload.userId);
                else next.delete(payload.userId);
                return next;
            });
        };

        socket.on('chat:message:new', onMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:read', onRead);
        socket.on('chat:presence:init', onPresenceInit);
        socket.on('chat:presence', onPresence);

        // Xin ảnh chụp online ngay (và mỗi lần socket kết nối lại) để không lỡ snapshot ban đầu
        const requestPresence = () => socket.emit('chat:presence:sync');
        if (socket.connected) requestPresence();
        socket.on('connect', requestPresence);

        return () => {
            socket.off('chat:message:new', onMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:read', onRead);
            socket.off('chat:presence:init', onPresenceInit);
            socket.off('chat:presence', onPresence);
            socket.off('connect', requestPresence);
        };
    }, [isAuthenticated, socket, user?.id]);

    const value = useMemo(
        () => ({
            unreadCount,
            refreshUnread,
            onlineUserIds,
            isUserOnline: (userId?: string | null) => Boolean(userId && onlineUserIds.has(userId)),
        }),
        [refreshUnread, unreadCount, onlineUserIds]
    );

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChatContext must be used within ChatProvider');
    }
    return context;
};
