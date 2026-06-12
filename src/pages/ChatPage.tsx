import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Avatar,
    Badge,
    Button,
    Drawer,
    Dropdown,
    Empty,
    Grid,
    Image,
    Input,
    Select,
    Skeleton,
    Space,
    Spin,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    BellFilled,
    BellOutlined,
    CameraOutlined,
    DeleteOutlined,
    MessageOutlined,
    MoreOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SendOutlined,
    TeamOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import {
    type ChatConversationUpdateEvent,
    type ChatMessageEvent,
    type ChatMessageRecalledEvent,
    useChatContext,
} from '../core/contexts/ChatContext';
import { useSocket } from '../core/hooks/useSocket';
import { chatService } from '../core/services/chat.service';
import type { ChatConversation, ChatMessage, ChatUserSummary, UserRole } from '../core/types';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const MAX_CHAT_IMAGES = 4;
const MAX_CHAT_IMAGE_SIZE = 8 * 1024 * 1024;
const MESSAGE_PAGE_SIZE = 80;

const roleLabel: Record<UserRole, string> = {
    admin: 'Admin',
    director: 'Giám đốc',
    manager: 'Quản lý',
    staff: 'Nhân viên',
};

const formatChatTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        ...(sameDay ? {} : { day: '2-digit', month: '2-digit' }),
    }).format(date);
};

const getInitials = (name?: string) => {
    const parts = String(name || 'HD')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return 'HD';
    return parts
        .slice(-2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
};

const getConversationSubtitle = (conversation: ChatConversation, currentUserId?: string) => {
    const others = conversation.participants.filter((participant) => participant.id !== currentUserId);
    const names = others.map((participant) => participant.name).filter(Boolean);

    if (conversation.context?.label) return conversation.context.label;
    if (conversation.type === 'direct') return others[0]?.plant?.name || others[0]?.email || 'Trao đổi trực tiếp';
    if (names.length) return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
    return 'Trao đổi nội bộ';
};

const upsertConversation = (items: ChatConversation[], next: ChatConversation) => {
    const existing = items.find((item) => item.id === next.id);
    const merged = existing
        ? items.map((item) => (item.id === next.id ? { ...item, ...next } : item))
        : [next, ...items];

    return merged.sort((a, b) => {
        const left = new Date(a.lastMessageAt ?? a.updatedAt ?? a.createdAt).getTime();
        const right = new Date(b.lastMessageAt ?? b.updatedAt ?? b.createdAt).getTime();
        return right - left;
    });
};

type SelectedImage = {
    uid: string;
    file: File;
    previewUrl: string;
};

const ChatPage: React.FC = () => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const { message, modal } = App.useApp();
    const { user } = useAuth();
    const { socket } = useSocket();
    const { refreshUnread } = useChatContext();
    const [searchParams, setSearchParams] = useSearchParams();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const selectedIdRef = useRef<string | undefined>(undefined);
    const conversationsRef = useRef<ChatConversation[]>([]);
    const messageCacheRef = useRef<Record<string, ChatMessage[]>>({});
    const messageRequestSeqRef = useRef(0);
    const readDelayTimerRef = useRef<number | undefined>(undefined);
    const readInFlightRef = useRef<Set<string>>(new Set());
    const hasMoreRef = useRef<Record<string, boolean>>({});
    const loadingOlderRef = useRef(false);
    // Khoảng cách scrollTop tới đáy trước khi prepend tin cũ, để giữ nguyên vị trí nhìn
    const pendingScrollRestoreRef = useRef<number | null>(null);

    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [selectedId, setSelectedId] = useState<string | undefined>(
        () => searchParams.get('conversation') ?? undefined
    );
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});
    const [conversationLoading, setConversationLoading] = useState(true);
    const [messageLoading, setMessageLoading] = useState(false);
    const [composer, setComposer] = useState('');
    const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
    const [conversationSearch, setConversationSearch] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [newConversationOpen, setNewConversationOpen] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<ChatUserSummary[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [groupTitle, setGroupTitle] = useState('');
    const [creatingConversation, setCreatingConversation] = useState(false);

    const selectedConversation = useMemo(
        () => conversations.find((conversation) => conversation.id === selectedId),
        [conversations, selectedId]
    );

    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        messageCacheRef.current = messageCache;
    }, [messageCache]);

    useEffect(
        () => () => {
            if (readDelayTimerRef.current) {
                window.clearTimeout(readDelayTimerRef.current);
            }
        },
        []
    );

    const clearSelectedImages = useCallback(() => {
        setSelectedImages((prev) => {
            prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            return [];
        });
    }, []);

    const replaceCachedMessages = useCallback((conversationId: string, nextMessages: ChatMessage[]) => {
        setMessageCache((prev) => {
            const next = { ...prev, [conversationId]: nextMessages };
            messageCacheRef.current = next;
            return next;
        });
    }, []);

    const appendCachedMessage = useCallback((conversationId: string, nextMessage: ChatMessage) => {
        const append = (items: ChatMessage[]) =>
            items.some((item) => item.id === nextMessage.id) ? items : [...items, nextMessage];

        setMessageCache((prev) => {
            const next = { ...prev, [conversationId]: append(prev[conversationId] ?? []) };
            messageCacheRef.current = next;
            return next;
        });

        if (selectedIdRef.current === conversationId) {
            setMessages((prev) => append(prev));
        }
    }, []);

    const updateCachedMessage = useCallback((conversationId: string, nextMessage: ChatMessage) => {
        const replace = (items: ChatMessage[]) =>
            items.map((item) => (item.id === nextMessage.id ? nextMessage : item));

        setMessageCache((prev) => {
            if (!prev[conversationId]) return prev;
            const next = { ...prev, [conversationId]: replace(prev[conversationId]) };
            messageCacheRef.current = next;
            return next;
        });

        if (selectedIdRef.current === conversationId) {
            setMessages((prev) => replace(prev));
        }
    }, []);

    const markConversationRead = useCallback(
        async (conversationId: string, force = false) => {
            if (readInFlightRef.current.has(conversationId)) return;

            const currentConversation = conversationsRef.current.find(
                (conversation) => conversation.id === conversationId
            );
            if (!force && (!currentConversation || Number(currentConversation.unreadCount ?? 0) <= 0)) return;

            readInFlightRef.current.add(conversationId);
            setConversations((prev) =>
                prev.map((conversation) =>
                    conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
                )
            );

            try {
                await chatService.markAsRead(conversationId);
                void refreshUnread();
            } catch {
                // Keep the chat usable even if the read receipt fails; the next refresh will reconcile it.
            } finally {
                readInFlightRef.current.delete(conversationId);
            }
        },
        [refreshUnread]
    );

    const scheduleMarkConversationRead = useCallback(
        (conversationId: string, force = false) => {
            if (readDelayTimerRef.current) {
                window.clearTimeout(readDelayTimerRef.current);
            }

            readDelayTimerRef.current = window.setTimeout(() => {
                if (selectedIdRef.current === conversationId) {
                    void markConversationRead(conversationId, force);
                }
            }, 320);
        },
        [markConversationRead]
    );

    const loadConversations = useCallback(async () => {
        setConversationLoading(true);
        try {
            const result = await chatService.getConversations({ limit: 80 });
            setConversations(result.conversations);
            void refreshUnread();

            if (!isMobile && !selectedIdRef.current && result.conversations[0]) {
                setSelectedId(result.conversations[0].id);
                setSearchParams({ conversation: result.conversations[0].id }, { replace: true });
            }
        } catch {
            message.error('Không tải được danh sách tin nhắn');
        } finally {
            setConversationLoading(false);
        }
    }, [isMobile, message, refreshUnread, setSearchParams]);

    const selectConversation = useCallback(
        (conversationId: string) => {
            setSelectedId(conversationId);
            setSearchParams({ conversation: conversationId });
        },
        [setSearchParams]
    );

    const loadMessages = useCallback(
        async (conversationId: string) => {
            const requestSeq = messageRequestSeqRef.current + 1;
            messageRequestSeqRef.current = requestSeq;
            const cachedMessages = messageCacheRef.current[conversationId];

            setMessages(cachedMessages ?? []);
            setMessageLoading(true);
            try {
                const result = await chatService.getMessages(conversationId, { limit: MESSAGE_PAGE_SIZE });
                if (messageRequestSeqRef.current !== requestSeq || selectedIdRef.current !== conversationId) return;

                hasMoreRef.current[conversationId] = result.length >= MESSAGE_PAGE_SIZE;
                replaceCachedMessages(conversationId, result);
                setMessages(result);
                scheduleMarkConversationRead(conversationId, true);
            } catch {
                if (messageRequestSeqRef.current === requestSeq) {
                    message.error('Không tải được nội dung hội thoại');
                }
            } finally {
                if (messageRequestSeqRef.current === requestSeq) {
                    setMessageLoading(false);
                }
            }
        },
        [message, replaceCachedMessages, scheduleMarkConversationRead]
    );

    const loadOlderMessages = useCallback(async () => {
        const conversationId = selectedIdRef.current;
        if (!conversationId || loadingOlderRef.current) return;
        if (hasMoreRef.current[conversationId] === false) return;

        const current = messageCacheRef.current[conversationId] ?? [];
        const oldest = current[0];
        if (!oldest) return;

        loadingOlderRef.current = true;
        setLoadingOlder(true);
        const container = messagesContainerRef.current;
        pendingScrollRestoreRef.current = container ? container.scrollHeight - container.scrollTop : null;

        try {
            const older = await chatService.getMessages(conversationId, {
                limit: MESSAGE_PAGE_SIZE,
                before: oldest.createdAt,
            });
            hasMoreRef.current[conversationId] = older.length >= MESSAGE_PAGE_SIZE;

            if (selectedIdRef.current !== conversationId) {
                pendingScrollRestoreRef.current = null;
                return;
            }

            if (older.length) {
                const known = new Set(current.map((item) => item.id));
                const merged = [...older.filter((item) => !known.has(item.id)), ...current];
                replaceCachedMessages(conversationId, merged);
                setMessages(merged);
            } else {
                pendingScrollRestoreRef.current = null;
            }
        } catch {
            pendingScrollRestoreRef.current = null;
            message.error('Không tải được tin nhắn cũ hơn');
        } finally {
            loadingOlderRef.current = false;
            setLoadingOlder(false);
        }
    }, [message, replaceCachedMessages]);

    const handleMessagesScroll = useCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            if (event.currentTarget.scrollTop > 48) return;
            void loadOlderMessages();
        },
        [loadOlderMessages]
    );

    // Giữ nguyên vị trí đang đọc sau khi prepend tin cũ vào đầu danh sách
    useLayoutEffect(() => {
        const container = messagesContainerRef.current;
        if (pendingScrollRestoreRef.current !== null && container) {
            container.scrollTop = container.scrollHeight - pendingScrollRestoreRef.current;
            pendingScrollRestoreRef.current = null;
        }
    }, [messages]);

    useEffect(() => {
        void loadConversations();
    }, [loadConversations]);

    useEffect(() => {
        const fromUrl = searchParams.get('conversation') ?? undefined;
        if (fromUrl && fromUrl !== selectedId) {
            setSelectedId(fromUrl);
        }
    }, [searchParams, selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setMessages([]);
            clearSelectedImages();
            return;
        }

        if (readDelayTimerRef.current) {
            window.clearTimeout(readDelayTimerRef.current);
        }

        clearSelectedImages();
        void loadMessages(selectedId);
    }, [clearSelectedImages, loadMessages, selectedId]);

    // Chỉ kéo xuống đáy khi có tin mới ở cuối (đổi last id) hoặc đổi hội thoại,
    // không kéo khi prepend tin cũ hoặc một tin bị thu hồi.
    const lastMessageId = messages.length ? messages[messages.length - 1].id : undefined;
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ block: 'end' });
    }, [lastMessageId, selectedId]);

    useEffect(() => {
        if (!newConversationOpen) return;

        const timeout = window.setTimeout(async () => {
            try {
                const users = await chatService.getAvailableUsers({ search: userSearch, limit: 30 });
                setAvailableUsers(users);
            } catch {
                setAvailableUsers([]);
            }
        }, 220);

        return () => window.clearTimeout(timeout);
    }, [newConversationOpen, userSearch]);

    useEffect(() => {
        if (!socket) return;

        const onChatMessage = (payload: ChatMessageEvent) => {
            const activeConversationId = selectedIdRef.current;
            const nextConversation =
                payload.conversation.id === activeConversationId
                    ? { ...payload.conversation, unreadCount: 0 }
                    : payload.conversation;

            setConversations((prev) => upsertConversation(prev, nextConversation));
            appendCachedMessage(payload.message.conversationId, payload.message);

            if (payload.message.conversationId === activeConversationId && payload.message.senderId !== user?.id) {
                scheduleMarkConversationRead(payload.message.conversationId, true);
            }
        };

        const onConversationUpdate = (payload: ChatConversationUpdateEvent) => {
            const activeConversationId = selectedIdRef.current;
            const nextConversation =
                payload.conversation.id === activeConversationId
                    ? { ...payload.conversation, unreadCount: 0 }
                    : payload.conversation;
            setConversations((prev) => upsertConversation(prev, nextConversation));
        };

        const onMessageRecalled = (payload: ChatMessageRecalledEvent) => {
            updateCachedMessage(payload.conversationId, payload.message);
        };

        socket.on('chat:message:new', onChatMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:message:recalled', onMessageRecalled);

        return () => {
            socket.off('chat:message:new', onChatMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:message:recalled', onMessageRecalled);
        };
    }, [appendCachedMessage, scheduleMarkConversationRead, socket, updateCachedMessage, user?.id]);

    const handleSend = async () => {
        const body = composer.trim();
        if (!selectedId || (!body && !selectedImages.length) || sending) return;

        setSending(true);
        try {
            const sent = selectedImages.length
                ? await chatService.sendAttachmentMessage(
                      selectedId,
                      body,
                      selectedImages.map((item) => item.file)
                  )
                : await chatService.sendMessage(selectedId, { body });
            setComposer('');
            clearSelectedImages();
            appendCachedMessage(selectedId, sent);
        } catch {
            message.error('Không gửi được tin nhắn');
        } finally {
            setSending(false);
        }
    };

    const handleRecallMessage = useCallback(
        (item: ChatMessage) => {
            modal.confirm({
                title: 'Thu hồi tin nhắn này?',
                content: 'Tin nhắn sẽ bị ẩn với tất cả thành viên trong hội thoại.',
                okText: 'Thu hồi',
                okButtonProps: { danger: true },
                cancelText: 'Đóng',
                onOk: async () => {
                    try {
                        const recalled = await chatService.recallMessage(item.conversationId, item.id);
                        updateCachedMessage(item.conversationId, recalled);
                    } catch (error: any) {
                        message.error(error?.message || 'Không thu hồi được tin nhắn');
                    }
                },
            });
        },
        [message, modal, updateCachedMessage]
    );

    const handleToggleMute = useCallback(async () => {
        const conversation = conversationsRef.current.find((item) => item.id === selectedIdRef.current);
        if (!conversation) return;

        const nextMuted = !conversation.muted;
        setConversations((prev) =>
            prev.map((item) => (item.id === conversation.id ? { ...item, muted: nextMuted } : item))
        );

        try {
            await chatService.setMuted(conversation.id, nextMuted);
            message.success(nextMuted ? 'Đã tắt thông báo của hội thoại này' : 'Đã bật lại thông báo');
        } catch {
            setConversations((prev) =>
                prev.map((item) => (item.id === conversation.id ? { ...item, muted: conversation.muted } : item))
            );
            message.error('Không thay đổi được cài đặt thông báo');
        }
    }, [message]);

    const filteredConversations = useMemo(() => {
        const keyword = conversationSearch.trim().toLowerCase();
        if (!keyword) return conversations;

        return conversations.filter((conversation) => {
            const haystack = [
                conversation.title,
                getConversationSubtitle(conversation, user?.id),
                conversation.lastMessagePreview,
                conversation.plant?.name,
                ...conversation.participants.map((participant) => participant.name),
                ...conversation.participants.map((participant) => participant.email),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(keyword);
        });
    }, [conversationSearch, conversations, user?.id]);

    const handleImageSelect = (files: FileList | null) => {
        if (!files?.length) return;

        const slotsLeft = MAX_CHAT_IMAGES - selectedImages.length;
        if (slotsLeft <= 0) {
            message.warning(`Tối đa ${MAX_CHAT_IMAGES} ảnh mỗi lần gửi`);
            return;
        }

        const accepted: SelectedImage[] = [];
        for (const file of Array.from(files).slice(0, slotsLeft)) {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                message.warning('Chỉ hỗ trợ JPG, PNG hoặc WebP');
                continue;
            }

            if (file.size > MAX_CHAT_IMAGE_SIZE) {
                message.warning('Ảnh vượt quá 8MB');
                continue;
            }

            accepted.push({
                uid: `${Date.now()}-${Math.random()}`,
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }

        if (accepted.length) {
            setSelectedImages((prev) => [...prev, ...accepted]);
        }
    };

    const removeSelectedImage = (uid: string) => {
        setSelectedImages((prev) => {
            const item = prev.find((image) => image.uid === uid);
            if (item) URL.revokeObjectURL(item.previewUrl);
            return prev.filter((image) => image.uid !== uid);
        });
    };

    const handleCreateConversation = async () => {
        if (!selectedUserIds.length) {
            message.warning('Chọn người cần trao đổi trước');
            return;
        }

        setCreatingConversation(true);
        try {
            const conversation = await chatService.createConversation({
                participantIds: selectedUserIds,
                title: selectedUserIds.length > 1 ? groupTitle.trim() || undefined : undefined,
            });
            setConversations((prev) => upsertConversation(prev, conversation));
            selectConversation(conversation.id);
            setSelectedUserIds([]);
            setGroupTitle('');
            setUserSearch('');
            setNewConversationOpen(false);
        } catch (error: any) {
            message.error(error?.message || 'Không tạo được hội thoại');
        } finally {
            setCreatingConversation(false);
        }
    };

    const conversationList = (
        <aside className='chat-page__sidebar'>
            <div className='chat-page__sidebar-header'>
                <div>
                    <Title level={4} className='!mb-0 !text-[20px] !font-black !text-slate-950'>
                        Tin nhắn
                    </Title>
                    <Text className='text-xs font-semibold text-slate-500'>Trao đổi vận hành nội bộ</Text>
                </div>
                <Space size={8}>
                    <Tooltip title='Tải lại'>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => void loadConversations()}
                            className='chat-page__icon-button'
                        />
                    </Tooltip>
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        onClick={() => setNewConversationOpen(true)}
                        className='rounded-xl font-bold shadow-sm'
                    >
                        {!isMobile ? 'Tạo' : null}
                    </Button>
                </Space>
            </div>

            <Input
                allowClear
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                prefix={<SearchOutlined className='text-slate-400' />}
                placeholder='Tìm hội thoại, người nhận, nội dung gần nhất'
                className='chat-page__search-input'
            />

            <Spin spinning={conversationLoading}>
                <div className='chat-page__conversation-list'>
                    {!conversations.length && !conversationLoading ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có hội thoại' className='mt-14' />
                    ) : null}

                    {conversations.length > 0 && !filteredConversations.length ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description='Không tìm thấy hội thoại'
                            className='mt-14'
                        />
                    ) : null}

                    {filteredConversations.map((conversation) => {
                        const active = conversation.id === selectedId;
                        const unread = Number(conversation.unreadCount ?? 0) > 0;
                        const subtitle = getConversationSubtitle(conversation, user?.id);
                        const avatarName =
                            conversation.type === 'direct'
                                ? conversation.participants.find((participant) => participant.id !== user?.id)?.name
                                : conversation.title;

                        return (
                            <button
                                key={conversation.id}
                                type='button'
                                className={`chat-page__conversation ${active ? 'chat-page__conversation--active' : ''} ${
                                    unread ? 'chat-page__conversation--unread' : ''
                                }`}
                                onClick={() => selectConversation(conversation.id)}
                            >
                                <Badge
                                    count={conversation.unreadCount || 0}
                                    size='small'
                                    offset={[-2, 4]}
                                    overflowCount={9}
                                >
                                    <Avatar
                                        size={46}
                                        icon={conversation.type === 'direct' ? <UserOutlined /> : <TeamOutlined />}
                                        className='chat-page__avatar'
                                    >
                                        {getInitials(avatarName)}
                                    </Avatar>
                                </Badge>
                                <span className='min-w-0 flex-1 text-left'>
                                    <span className='flex items-start justify-between gap-2'>
                                        <span className='truncate text-sm font-black text-slate-900'>
                                            {conversation.title}
                                        </span>
                                        <span className='shrink-0 text-[11px] font-bold text-slate-400'>
                                            {formatChatTime(conversation.lastMessageAt)}
                                        </span>
                                    </span>
                                    <span className='mt-0.5 block truncate text-xs font-semibold text-slate-500'>
                                        {subtitle}
                                    </span>
                                    <span className='mt-1 block truncate text-xs text-slate-400'>
                                        {conversation.lastMessagePreview || 'Bắt đầu trao đổi'}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Spin>
        </aside>
    );

    return (
        <div className='chat-page'>
            <div className='chat-page__hero'>
                <div className='flex min-w-0 items-center gap-3'>
                    <div className='chat-page__hero-icon'>
                        <MessageOutlined />
                    </div>
                    <div className='min-w-0'>
                        <Title level={3} className='!mb-0 !text-[24px] !font-black !text-slate-950'>
                            Chat nội bộ
                        </Title>
                        <Text className='text-sm font-semibold text-slate-500'>
                            Trao đổi nhanh giữa hiện trường, quản lý, kho và mua hàng
                        </Text>
                    </div>
                </div>
                <Tag className='chat-page__status-tag'>Realtime</Tag>
            </div>

            <div
                className={`chat-page__shell ${
                    selectedConversation && isMobile ? 'chat-page__shell--thread-open' : ''
                }`}
            >
                {conversationList}

                <section className='chat-page__thread'>
                    {selectedConversation ? (
                        <>
                            <div className='chat-page__thread-header'>
                                {isMobile ? (
                                    <Button
                                        icon={<ArrowLeftOutlined />}
                                        onClick={() => {
                                            setSelectedId(undefined);
                                            setSearchParams({});
                                        }}
                                        className='chat-page__icon-button'
                                    />
                                ) : null}
                                <Avatar size={42} className='chat-page__avatar'>
                                    {getInitials(selectedConversation.title)}
                                </Avatar>
                                <div className='min-w-0 flex-1'>
                                    <Title
                                        level={5}
                                        className='!mb-0 truncate !text-[16px] !font-black !text-slate-950'
                                    >
                                        {selectedConversation.title}
                                    </Title>
                                    <Text className='block truncate text-xs font-semibold text-slate-500'>
                                        {getConversationSubtitle(selectedConversation, user?.id)}
                                    </Text>
                                </div>
                                <Tooltip
                                    title={
                                        selectedConversation.muted
                                            ? 'Đang tắt thông báo — bấm để bật lại'
                                            : 'Tắt thông báo của hội thoại này'
                                    }
                                >
                                    <Button
                                        icon={
                                            selectedConversation.muted ? (
                                                <BellOutlined className='text-slate-400' />
                                            ) : (
                                                <BellFilled className='text-blue-600' />
                                            )
                                        }
                                        onClick={() => void handleToggleMute()}
                                        className='chat-page__icon-button'
                                    />
                                </Tooltip>
                                <Tag className='rounded-full border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700'>
                                    {selectedConversation.participants.length} người
                                </Tag>
                            </div>

                            <div
                                className='chat-page__messages'
                                ref={messagesContainerRef}
                                onScroll={handleMessagesScroll}
                            >
                                {messageLoading && messages.length ? (
                                    <div className='chat-page__loading-strip' />
                                ) : null}
                                {messageLoading && !messages.length ? (
                                    <div className='chat-page__message-skeleton'>
                                        <Skeleton active avatar paragraph={{ rows: 2 }} />
                                        <Skeleton active avatar paragraph={{ rows: 1 }} />
                                        <Skeleton
                                            active
                                            paragraph={{ rows: 2 }}
                                            className='chat-page__message-skeleton--right'
                                        />
                                    </div>
                                ) : (
                                    <div className='chat-page__message-stack'>
                                        {loadingOlder ? (
                                            <div className='flex justify-center py-1'>
                                                <Spin size='small' />
                                            </div>
                                        ) : null}
                                        {messages.map((item) => {
                                            const mine = item.senderId === user?.id;

                                            if (item.system) {
                                                return (
                                                    <div key={item.id} className='chat-page__system'>
                                                        <span>{item.body}</span>
                                                        <Text className='block text-[10px] font-semibold text-slate-400'>
                                                            {formatChatTime(item.createdAt)}
                                                        </Text>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={item.id}
                                                    className={`group chat-page__message ${mine ? 'chat-page__message--mine' : ''}`}
                                                >
                                                    {!mine ? (
                                                        <Avatar size={30} className='chat-page__message-avatar'>
                                                            {getInitials(item.sender?.name)}
                                                        </Avatar>
                                                    ) : null}
                                                    {mine && !item.isDeleted ? (
                                                        <Dropdown
                                                            trigger={['click']}
                                                            menu={{
                                                                items: [
                                                                    {
                                                                        key: 'recall',
                                                                        danger: true,
                                                                        icon: <DeleteOutlined />,
                                                                        label: 'Thu hồi tin nhắn',
                                                                    },
                                                                ],
                                                                onClick: () => handleRecallMessage(item),
                                                            }}
                                                        >
                                                            <Button
                                                                type='text'
                                                                size='small'
                                                                icon={<MoreOutlined />}
                                                                className='self-center text-slate-300 transition-opacity hover:text-slate-500 md:opacity-0 md:group-hover:opacity-100'
                                                            />
                                                        </Dropdown>
                                                    ) : null}
                                                    <div className='chat-page__bubble-wrap'>
                                                        {!mine ? (
                                                            <Text className='mb-1 block text-[11px] font-bold text-slate-500'>
                                                                {item.sender?.name || 'Người dùng'}
                                                            </Text>
                                                        ) : null}
                                                        {item.isDeleted ? (
                                                            <div className='chat-page__bubble !bg-slate-100 !text-slate-400 italic'>
                                                                <span>{item.body}</span>
                                                            </div>
                                                        ) : item.body ? (
                                                            <div className='chat-page__bubble'>
                                                                <span>{item.body}</span>
                                                            </div>
                                                        ) : null}
                                                        {item.attachments?.length ? (
                                                            <Image.PreviewGroup>
                                                                <div className='chat-page__attachments'>
                                                                    {item.attachments
                                                                        .filter(
                                                                            (attachment) => attachment.type === 'image'
                                                                        )
                                                                        .map((attachment) => (
                                                                            <div
                                                                                key={attachment.url}
                                                                                className='chat-page__attachment'
                                                                            >
                                                                                <Image
                                                                                    src={attachment.url}
                                                                                    alt={
                                                                                        attachment.name ||
                                                                                        'Ảnh trao đổi'
                                                                                    }
                                                                                    className='chat-page__attachment-image'
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </Image.PreviewGroup>
                                                        ) : null}
                                                        <Text className='mt-1 block text-[10px] font-semibold text-slate-400'>
                                                            {formatChatTime(item.createdAt)}
                                                        </Text>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>

                            <div className='chat-page__composer'>
                                <input
                                    ref={imageInputRef}
                                    type='file'
                                    accept='image/jpeg,image/png,image/webp'
                                    multiple
                                    className='hidden'
                                    onChange={(event) => {
                                        handleImageSelect(event.target.files);
                                        event.target.value = '';
                                    }}
                                />
                                <Button
                                    icon={<CameraOutlined />}
                                    onClick={() => imageInputRef.current?.click()}
                                    disabled={sending || selectedImages.length >= MAX_CHAT_IMAGES}
                                    className='chat-page__attach-button'
                                />
                                <div className='min-w-0 flex-1'>
                                    {selectedImages.length ? (
                                        <div className='chat-page__selected-images'>
                                            {selectedImages.map((item) => (
                                                <div key={item.uid} className='chat-page__selected-image'>
                                                    <img src={item.previewUrl} alt='Ảnh đã chọn' />
                                                    <button type='button' onClick={() => removeSelectedImage(item.uid)}>
                                                        <DeleteOutlined />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    <TextArea
                                        value={composer}
                                        autoSize={{ minRows: 1, maxRows: 4 }}
                                        maxLength={4000}
                                        placeholder='Nhập tin nhắn nội bộ...'
                                        onChange={(event) => setComposer(event.target.value)}
                                        onPressEnter={(event) => {
                                            if (!event.shiftKey) {
                                                event.preventDefault();
                                                void handleSend();
                                            }
                                        }}
                                        className='chat-page__composer-input'
                                    />
                                </div>
                                <Button
                                    type='primary'
                                    icon={<SendOutlined />}
                                    loading={sending}
                                    disabled={!composer.trim() && !selectedImages.length}
                                    onClick={() => void handleSend()}
                                    className='chat-page__send-button'
                                />
                            </div>
                        </>
                    ) : (
                        <div className='chat-page__empty'>
                            <div className='chat-page__empty-icon'>
                                <MessageOutlined />
                            </div>
                            <Title level={4} className='!mb-1 !font-black !text-slate-900'>
                                Chọn một hội thoại
                            </Title>
                            <Text className='max-w-[360px] text-center text-sm font-medium text-slate-500'>
                                Tin nhắn nội bộ giúp giữ trao đổi theo đúng người phụ trách, thay cho trợ lý hướng dẫn
                                cũ.
                            </Text>
                            <Button
                                type='primary'
                                icon={<PlusOutlined />}
                                onClick={() => setNewConversationOpen(true)}
                                className='mt-5 rounded-xl font-bold'
                            >
                                Tạo hội thoại mới
                            </Button>
                        </div>
                    )}
                </section>
            </div>

            <Drawer
                open={newConversationOpen}
                onClose={() => setNewConversationOpen(false)}
                title='Tạo hội thoại nội bộ'
                placement={isMobile ? 'bottom' : 'right'}
                height={isMobile ? '74dvh' : undefined}
                width={420}
                className='chat-page__new-drawer'
                styles={{ body: { padding: 18 } }}
            >
                <Space direction='vertical' size={16} className='w-full'>
                    <div>
                        <Text className='mb-2 block text-xs font-black tracking-[0.12em] text-slate-400 uppercase'>
                            Người nhận
                        </Text>
                        <Select
                            mode='multiple'
                            showSearch
                            filterOption={false}
                            value={selectedUserIds}
                            onChange={setSelectedUserIds}
                            onSearch={setUserSearch}
                            placeholder='Tìm tên, email hoặc bộ phận'
                            className='w-full'
                            options={availableUsers.map((item) => ({
                                value: item.id,
                                label: (
                                    <div className='flex min-w-0 items-center gap-2'>
                                        <Avatar size={28} className='chat-page__avatar'>
                                            {getInitials(item.name)}
                                        </Avatar>
                                        <div className='min-w-0'>
                                            <div className='truncate text-sm font-bold text-slate-900'>{item.name}</div>
                                            <div className='truncate text-xs text-slate-500'>
                                                {roleLabel[item.role]} {item.plant?.name ? `- ${item.plant.name}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                ),
                            }))}
                        />
                    </div>

                    {selectedUserIds.length > 1 ? (
                        <div>
                            <Text className='mb-2 block text-xs font-black tracking-[0.12em] text-slate-400 uppercase'>
                                Tên nhóm
                            </Text>
                            <Input
                                value={groupTitle}
                                maxLength={160}
                                onChange={(event) => setGroupTitle(event.target.value)}
                                placeholder='Ví dụ: Bảo trì CS1, Kho vật tư...'
                            />
                        </div>
                    ) : null}

                    <div className='rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 font-semibold text-blue-800'>
                        Hỗ trợ trao đổi realtime kèm ảnh hiện trường. Chỉ người nằm trong phạm vi hội thoại mới xem được
                        nội dung.
                    </div>

                    <Button
                        type='primary'
                        block
                        size='large'
                        icon={<MessageOutlined />}
                        loading={creatingConversation}
                        onClick={() => void handleCreateConversation()}
                        className='rounded-xl font-black'
                    >
                        Bắt đầu trao đổi
                    </Button>
                </Space>
            </Drawer>
        </div>
    );
};

export default ChatPage;
