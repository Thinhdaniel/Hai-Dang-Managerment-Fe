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
    Popover,
    Segmented,
    Select,
    Skeleton,
    Space,
    Spin,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    ArrowDownOutlined,
    ArrowLeftOutlined,
    BellFilled,
    BellOutlined,
    CameraOutlined,
    CarOutlined,
    DeleteOutlined,
    ExportOutlined,
    InboxOutlined,
    MessageOutlined,
    MoreOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SendOutlined,
    ShoppingOutlined,
    SwapOutlined,
    TeamOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import {
    type ChatConversationUpdateEvent,
    type ChatMessageEvent,
    type ChatMessageRecalledEvent,
    useChatContext,
} from '../core/contexts/ChatContext';
import { useSocket } from '../core/hooks/useSocket';
import { chatService } from '../core/services/chat.service';
import { buildChatStream, CONTEXT_TYPE_LABEL, formatFullTime, formatTimeShort } from '../components/chat/chatStream';
import type { ChatConversation, ChatMessage, ChatUserSummary, ChatWorkflowContextType, UserRole } from '../core/types';

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

// Avatar màu + icon theo loại phiếu để phân biệt hội thoại nghiệp vụ với chat thường
const CONTEXT_TYPE_ICON: Partial<Record<ChatWorkflowContextType, React.ReactNode>> = {
    maintenance: <ToolOutlined />,
    transfer: <SwapOutlined />,
    purchase_request: <ShoppingOutlined />,
    supply_request: <InboxOutlined />,
    distribution: <CarOutlined />,
};

type ConversationFilter = 'all' | 'unread' | 'workflow';

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
    const navigate = useNavigate();
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
    // Người dùng đang ở đáy khung chat hay đang cuộn đọc tin cũ
    const atBottomRef = useRef(true);

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
    const [listFilter, setListFilter] = useState<ConversationFilter>('all');
    const [sending, setSending] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [jumpVisible, setJumpVisible] = useState(false);
    const [pendingNew, setPendingNew] = useState(0);
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
            const container = event.currentTarget;
            const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const atBottom = distanceToBottom < 80;
            atBottomRef.current = atBottom;
            setJumpVisible(!atBottom);
            if (atBottom) setPendingNew(0);

            if (container.scrollTop <= 48) void loadOlderMessages();
        },
        [loadOlderMessages]
    );

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
        atBottomRef.current = true;
        setJumpVisible(false);
        setPendingNew(0);
    }, []);

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

    // Đổi hội thoại thì luôn quay về đáy
    useEffect(() => {
        atBottomRef.current = true;
        setJumpVisible(false);
        setPendingNew(0);
    }, [selectedId]);

    // Chỉ kéo xuống đáy khi có tin mới ở cuối (đổi last id) hoặc đổi hội thoại,
    // không kéo khi prepend tin cũ hoặc một tin bị thu hồi.
    // Nếu người dùng đang cuộn đọc tin cũ thì giữ nguyên vị trí và đếm tin mới chờ.
    const lastMessage = messages.length ? messages[messages.length - 1] : undefined;
    const lastMessageId = lastMessage?.id;
    const lastMessageSenderId = lastMessage?.senderId;
    useEffect(() => {
        if (atBottomRef.current || lastMessageSenderId === user?.id) {
            messagesEndRef.current?.scrollIntoView({ block: 'end' });
            setPendingNew(0);
        } else if (lastMessageId) {
            setPendingNew((count) => count + 1);
        }
    }, [lastMessageId, lastMessageSenderId, selectedId, user?.id]);

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

    const streamRows = useMemo(() => buildChatStream(messages), [messages]);

    const filteredConversations = useMemo(() => {
        const keyword = conversationSearch.trim().toLowerCase();
        const base = conversations.filter((conversation) => {
            if (listFilter === 'unread') return Number(conversation.unreadCount ?? 0) > 0;
            if (listFilter === 'workflow') return conversation.type === 'workflow_thread';
            return true;
        });
        if (!keyword) return base;

        return base.filter((conversation) => {
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
    }, [conversationSearch, conversations, listFilter, user?.id]);

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

            <Segmented
                block
                value={listFilter}
                onChange={(value) => setListFilter(value as ConversationFilter)}
                options={[
                    { label: 'Tất cả', value: 'all' },
                    { label: 'Chưa đọc', value: 'unread' },
                    { label: 'Phiếu', value: 'workflow' },
                ]}
                className='chat-page__filter'
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
                        const contextType = conversation.context?.type;
                        const typeIcon = contextType ? CONTEXT_TYPE_ICON[contextType] : undefined;
                        const avatarName =
                            conversation.type === 'direct'
                                ? conversation.participants.find((participant) => participant.id !== user?.id)?.name
                                : conversation.title;
                        const previewPrefix =
                            conversation.lastMessagePreview && conversation.lastMessageSenderId === user?.id
                                ? 'Bạn: '
                                : '';

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
                                        size={44}
                                        icon={
                                            typeIcon ?? (conversation.type !== 'direct' ? <TeamOutlined /> : undefined)
                                        }
                                        className={`chat-page__avatar ${
                                            typeIcon && contextType ? `chat-page__avatar--${contextType}` : ''
                                        }`}
                                    >
                                        {getInitials(avatarName)}
                                    </Avatar>
                                </Badge>
                                <span className='chat-page__conversation-body'>
                                    <span className='chat-page__conversation-top'>
                                        <span className='chat-page__conversation-title'>{conversation.title}</span>
                                        <span className='chat-page__conversation-time'>
                                            {formatChatTime(conversation.lastMessageAt)}
                                        </span>
                                    </span>
                                    <span className='chat-page__conversation-sub'>{subtitle}</span>
                                    <span className='chat-page__conversation-preview'>
                                        {previewPrefix}
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
                                <Avatar
                                    size={40}
                                    icon={
                                        selectedConversation.context?.type
                                            ? CONTEXT_TYPE_ICON[selectedConversation.context.type]
                                            : undefined
                                    }
                                    className={`chat-page__avatar ${
                                        selectedConversation.context?.type &&
                                        CONTEXT_TYPE_ICON[selectedConversation.context.type]
                                            ? `chat-page__avatar--${selectedConversation.context.type}`
                                            : ''
                                    }`}
                                >
                                    {getInitials(selectedConversation.title)}
                                </Avatar>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex min-w-0 items-center gap-2'>
                                        <Title
                                            level={5}
                                            className='!mb-0 truncate !text-[15px] !font-extrabold !text-slate-900'
                                        >
                                            {selectedConversation.title}
                                        </Title>
                                        {!isMobile &&
                                        selectedConversation.context?.type &&
                                        CONTEXT_TYPE_LABEL[selectedConversation.context.type] ? (
                                            <Tag className='chat-page__context-chip'>
                                                {CONTEXT_TYPE_LABEL[selectedConversation.context.type]}
                                            </Tag>
                                        ) : null}
                                    </div>
                                    <Text className='block truncate text-xs font-semibold text-slate-500'>
                                        {getConversationSubtitle(selectedConversation, user?.id)}
                                    </Text>
                                </div>
                                {selectedConversation.context?.path ? (
                                    <Tooltip title='Mở phiếu liên quan'>
                                        <Button
                                            icon={<ExportOutlined />}
                                            onClick={() => navigate(selectedConversation.context!.path!)}
                                            className='chat-page__icon-button chat-page__open-context'
                                        >
                                            {!isMobile ? 'Mở phiếu' : null}
                                        </Button>
                                    </Tooltip>
                                ) : null}
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
                                                <BellFilled className='text-[#0f6bdc]' />
                                            )
                                        }
                                        onClick={() => void handleToggleMute()}
                                        className='chat-page__icon-button'
                                    />
                                </Tooltip>
                                <Popover
                                    trigger='click'
                                    placement='bottomRight'
                                    content={
                                        <div className='chat-members'>
                                            {selectedConversation.participants.map((participant) => (
                                                <div key={participant.id} className='chat-members__row'>
                                                    <Avatar size={28} className='chat-page__avatar'>
                                                        {getInitials(participant.name)}
                                                    </Avatar>
                                                    <div className='min-w-0'>
                                                        <div className='truncate text-[13px] font-bold text-slate-800'>
                                                            {participant.name}
                                                            {participant.id === user?.id ? ' (Bạn)' : ''}
                                                        </div>
                                                        <div className='truncate text-xs text-slate-500'>
                                                            {roleLabel[participant.role]}
                                                            {participant.plant?.name
                                                                ? ` · ${participant.plant.name}`
                                                                : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    }
                                >
                                    <Tooltip title='Thành viên hội thoại'>
                                        <Button icon={<TeamOutlined />} className='chat-page__icon-button'>
                                            {!isMobile ? selectedConversation.participants.length : null}
                                        </Button>
                                    </Tooltip>
                                </Popover>
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
                                        {streamRows.map((row) => {
                                            if (row.kind === 'date') {
                                                return (
                                                    <div key={row.key} className='chat-date-divider'>
                                                        <span>{row.label}</span>
                                                    </div>
                                                );
                                            }

                                            if (row.kind === 'system') {
                                                return (
                                                    <div key={row.key} className='chat-page__system'>
                                                        <span>{row.message.body}</span>
                                                        <Text className='block text-[10px] font-semibold text-slate-400'>
                                                            {formatTimeShort(row.message.createdAt)}
                                                        </Text>
                                                    </div>
                                                );
                                            }

                                            const item = row.message;
                                            const mine = item.senderId === user?.id;
                                            const bubbleClass = `chat-page__bubble chat-page__bubble--${row.shape}`;

                                            return (
                                                <div
                                                    key={row.key}
                                                    className={`group chat-page__message ${mine ? 'chat-page__message--mine' : ''} ${
                                                        row.isGroupStart ? 'chat-page__message--group-start' : ''
                                                    }`}
                                                >
                                                    {!mine ? (
                                                        row.isGroupStart ? (
                                                            <Avatar size={30} className='chat-page__message-avatar'>
                                                                {getInitials(item.sender?.name)}
                                                            </Avatar>
                                                        ) : (
                                                            <span className='chat-page__avatar-spacer' />
                                                        )
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
                                                        {!mine &&
                                                        row.isGroupStart &&
                                                        selectedConversation.type !== 'direct' ? (
                                                            <Text className='chat-page__sender-name'>
                                                                {item.sender?.name || 'Người dùng'}
                                                            </Text>
                                                        ) : null}
                                                        {item.isDeleted ? (
                                                            <div
                                                                className={`${bubbleClass} chat-page__bubble--recalled`}
                                                                title={formatFullTime(item.createdAt)}
                                                            >
                                                                <span>{item.body}</span>
                                                            </div>
                                                        ) : item.body ? (
                                                            <div
                                                                className={bubbleClass}
                                                                title={formatFullTime(item.createdAt)}
                                                            >
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
                                                        {row.isGroupEnd ? (
                                                            <Text className='chat-page__msg-time'>
                                                                {formatTimeShort(item.createdAt)}
                                                            </Text>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>

                            {jumpVisible ? (
                                <div className='chat-page__jump-wrap'>
                                    <Badge count={pendingNew} size='small' overflowCount={9}>
                                        <Button
                                            shape='circle'
                                            icon={<ArrowDownOutlined />}
                                            onClick={() => scrollToBottom()}
                                            className='chat-page__jump-button'
                                        />
                                    </Badge>
                                </div>
                            ) : null}

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
