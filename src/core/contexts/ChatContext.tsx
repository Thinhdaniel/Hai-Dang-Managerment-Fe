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

export type ChatReadEvent = {
    conversationId: string;
    unreadCount?: number;
    totalUnread: number;
};

type ChatContextValue = {
    unreadCount: number;
    refreshUnread: () => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, user } = useAuth();
    const { socket } = useSocket();
    const [unreadCount, setUnreadCount] = useState(0);

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

        socket.on('chat:message:new', onMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:read', onRead);

        return () => {
            socket.off('chat:message:new', onMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:read', onRead);
        };
    }, [isAuthenticated, socket, user?.id]);

    const value = useMemo(
        () => ({
            unreadCount,
            refreshUnread,
        }),
        [refreshUnread, unreadCount]
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
