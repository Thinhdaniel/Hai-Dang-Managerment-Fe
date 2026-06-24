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
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    ExportOutlined,
    InboxOutlined,
    MessageOutlined,
    PlusOutlined,
    PushpinFilled,
    PushpinOutlined,
    ReloadOutlined,
    RollbackOutlined,
    SearchOutlined,
    SendOutlined,
    ShoppingOutlined,
    SmileOutlined,
    SwapOutlined,
    TeamOutlined,
    ThunderboltOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import {
    type ChatConversationReadEvent,
    type ChatConversationUpdateEvent,
    type ChatMessageEvent,
    type ChatMessageRecalledEvent,
    type ChatMessageUpdatedEvent,
    type ChatTypingEvent,
    useChatContext,
} from '../core/contexts/ChatContext';
import { useSocket } from '../core/hooks/useSocket';
import { chatService } from '../core/services/chat.service';
import {
    buildChatStream,
    COMPOSER_EMOJIS,
    CONTEXT_TYPE_LABEL,
    formatFullTime,
    formatTimeShort,
    groupReactions,
    REACTION_EMOJIS,
} from '../components/chat/chatStream';
import {
    extractMentionTokens,
    filterMentionCandidates,
    focusTextAreaCaret,
    MentionText,
    mentionHighlightNames,
    useMentionInput,
} from '../components/chat/mentions';
import ChatAudioPlayer from '../components/chat/ChatAudioPlayer';
import ImageAnnotationModal from '../components/chat/ImageAnnotationModal';
import ChatMessageAttachments from '../components/chat/ChatMessageAttachments';
import ChatAiSummaryDrawer from '../components/chat/ChatAiSummaryDrawer';
import VoiceRecorderButton, { type ChatVoiceNoteDraft } from '../components/chat/VoiceRecorderButton';
import { compressChatImage } from '../core/lib/chatMedia';
import type { ChatConversation, ChatMessage, ChatUserSummary, ChatWorkflowContextType, UserRole } from '../core/types';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const MAX_CHAT_IMAGES = 4;
const MAX_CHAT_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_CHAT_IMAGE_SOURCE_SIZE = 16 * 1024 * 1024;
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
    technical_purchase: <ToolOutlined />,
    distribution: <CarOutlined />,
};

type ConversationFilter = 'all' | 'unread' | 'workflow' | 'mention';

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
    const { refreshUnread, isUserOnline } = useChatContext();
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
    const composerRef = useRef<any>(null);
    const typingSentAtRef = useRef(0); // throttle phát "đang gõ"
    const typingTimersRef = useRef<Record<string, number>>({}); // hẹn giờ ẩn từng người đang gõ
    const longPressTimerRef = useRef<number | undefined>(undefined);

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
    const [selectedVoiceNote, setSelectedVoiceNote] = useState<ChatVoiceNoteDraft | null>(null);
    const [annotatingImage, setAnnotatingImage] = useState<SelectedImage | null>(null);
    const [conversationSearch, setConversationSearch] = useState('');
    const [listFilter, setListFilter] = useState<ConversationFilter>('all');
    const [sending, setSending] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [jumpVisible, setJumpVisible] = useState(false);
    const [pendingNew, setPendingNew] = useState(0);
    const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
    const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId -> name
    const [actionMenuId, setActionMenuId] = useState<string | null>(null);
    const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [messageSearch, setMessageSearch] = useState('');
    const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
    const [searching, setSearching] = useState(false);
    const [highlightId, setHighlightId] = useState<string | null>(null);
    const [newConversationOpen, setNewConversationOpen] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<ChatUserSummary[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [groupTitle, setGroupTitle] = useState('');
    const [creatingConversation, setCreatingConversation] = useState(false);
    const [mentionConversationIds, setMentionConversationIds] = useState<Set<string>>(new Set());
    const mention = useMentionInput();

    const selectedConversation = useMemo(
        () => conversations.find((conversation) => conversation.id === selectedId),
        [conversations, selectedId]
    );

    const selectedDirectPeer =
        selectedConversation?.type === 'direct'
            ? selectedConversation.participants.find((participant) => participant.id !== user?.id)
            : undefined;
    const selectedPeerOnline = Boolean(selectedDirectPeer && isUserOnline(selectedDirectPeer.id));

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

    const clearSelectedVoiceNote = useCallback(() => {
        setSelectedVoiceNote((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }, []);

    const clearSelectedMedia = useCallback(() => {
        clearSelectedImages();
        clearSelectedVoiceNote();
        setAnnotatingImage(null);
    }, [clearSelectedImages, clearSelectedVoiceNote]);

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

    // Inbox "@ Tôi": nạp danh sách hội thoại có tin nhắc tới mình
    useEffect(() => {
        if (listFilter !== 'mention') return;
        let active = true;
        chatService
            .getMyMentions()
            .then((items) => {
                if (active) setMentionConversationIds(new Set(items.map((item) => item.conversationId)));
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [listFilter]);

    useEffect(() => {
        const fromUrl = searchParams.get('conversation') ?? undefined;
        if (fromUrl && fromUrl !== selectedId) {
            setSelectedId(fromUrl);
        }
    }, [searchParams, selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setMessages([]);
            clearSelectedMedia();
            return;
        }

        if (readDelayTimerRef.current) {
            window.clearTimeout(readDelayTimerRef.current);
        }

        clearSelectedMedia();
        void loadMessages(selectedId);
    }, [clearSelectedMedia, loadMessages, selectedId]);

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

    // Tìm tin nhắn trong hội thoại (debounce)
    useEffect(() => {
        if (!searchOpen || !selectedId) return;
        const keyword = messageSearch.trim();
        if (keyword.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timeout = window.setTimeout(async () => {
            try {
                const results = await chatService.searchMessages(selectedId, keyword);
                setSearchResults(results);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 320);
        return () => window.clearTimeout(timeout);
    }, [messageSearch, searchOpen, selectedId]);

    // Khoá nav dưới + chuyển chat sang toàn màn hình khi mở hội thoại trên mobile (kiểu Messenger/Zalo)
    useEffect(() => {
        const immersive = isMobile && Boolean(selectedId);
        document.body.classList.toggle('chat-immersive', immersive);
        return () => document.body.classList.remove('chat-immersive');
    }, [isMobile, selectedId]);

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

        // Reaction / ghim cập nhật tại chỗ
        const onMessageUpdated = (payload: ChatMessageUpdatedEvent) => {
            updateCachedMessage(payload.conversationId, payload.message);
            if (payload.conversationId === selectedIdRef.current) {
                setPinnedMessages((prev) => {
                    const without = prev.filter((m) => m.id !== payload.message.id);
                    return payload.message.pinned ? [payload.message, ...without] : without;
                });
            }
        };

        // "Đang soạn tin": hiện tên người gõ, tự ẩn sau 3.5s nếu không có ping mới
        const onTyping = (payload: ChatTypingEvent) => {
            if (payload.conversationId !== selectedIdRef.current || payload.userId === user?.id) return;
            setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.name }));
            window.clearTimeout(typingTimersRef.current[payload.userId]);
            typingTimersRef.current[payload.userId] = window.setTimeout(() => {
                setTypingUsers((prev) => {
                    const next = { ...prev };
                    delete next[payload.userId];
                    return next;
                });
            }, 3500);
        };

        // Dấu "đã xem": cập nhật thời điểm đọc của người khác để hiển thị realtime
        const onConversationRead = (payload: ChatConversationReadEvent) => {
            setConversations((prev) =>
                prev.map((conversation) => {
                    if (conversation.id !== payload.conversationId) return conversation;
                    const receipts = (conversation.readReceipts ?? []).filter((r) => r.userId !== payload.userId);
                    return {
                        ...conversation,
                        readReceipts: [...receipts, { userId: payload.userId, lastReadAt: payload.lastReadAt }],
                    };
                })
            );
        };

        socket.on('chat:message:new', onChatMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:message:recalled', onMessageRecalled);
        socket.on('chat:message:updated', onMessageUpdated);
        socket.on('chat:typing', onTyping);
        socket.on('chat:conversation:read', onConversationRead);

        return () => {
            socket.off('chat:message:new', onChatMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:message:recalled', onMessageRecalled);
            socket.off('chat:message:updated', onMessageUpdated);
            socket.off('chat:typing', onTyping);
            socket.off('chat:conversation:read', onConversationRead);
        };
    }, [appendCachedMessage, scheduleMarkConversationRead, socket, updateCachedMessage, user?.id]);

    // Tin mới tới từ người khác thì xoá trạng thái "đang gõ" của họ
    useEffect(() => {
        if (lastMessageSenderId && lastMessageSenderId !== user?.id) {
            setTypingUsers((prev) => {
                if (!prev[lastMessageSenderId]) return prev;
                const next = { ...prev };
                delete next[lastMessageSenderId];
                return next;
            });
        }
    }, [lastMessageId, lastMessageSenderId, user?.id]);

    // Đổi hội thoại: reset reply/typing/search/pinned + tải danh sách tin đã ghim
    useEffect(() => {
        setReplyTarget(null);
        setTypingUsers({});
        setActionMenuId(null);
        setSearchOpen(false);
        setMessageSearch('');
        setSearchResults([]);
        if (!selectedId) {
            setPinnedMessages([]);
            return;
        }
        let active = true;
        chatService
            .getPinned(selectedId)
            .then((items) => {
                if (active) setPinnedMessages(items);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [selectedId]);

    const handleSend = async () => {
        const body = composer.trim();
        const hasMedia = Boolean(selectedImages.length || selectedVoiceNote);
        if (!selectedId || (!body && !hasMedia) || sending) return;

        const replyToId = replyTarget?.id;
        const mentions = selectedConversation
            ? extractMentionTokens(
                  body,
                  selectedConversation.participants.map((participant) => ({
                      id: participant.id,
                      name: participant.name,
                  }))
              )
            : [];
        setSending(true);
        try {
            const sent = hasMedia
                ? await chatService.sendAttachmentMessage(
                      selectedId,
                      body,
                      {
                          images: selectedImages.map((item) => item.file),
                          audio: selectedVoiceNote?.file,
                          audioDurationMs: selectedVoiceNote?.durationMs,
                      },
                      replyToId,
                      mentions
                  )
                : await chatService.sendMessage(selectedId, { body, replyTo: replyToId, mentions });
            setComposer('');
            clearSelectedMedia();
            setReplyTarget(null);
            appendCachedMessage(selectedId, sent);
        } catch {
            message.error('Không gửi được tin nhắn');
        } finally {
            setSending(false);
        }
    };

    // Phát tín hiệu "đang soạn tin" qua socket, throttle 1.5s
    const emitTyping = useCallback(() => {
        if (!selectedIdRef.current || !socket) return;
        const now = Date.now();
        if (now - typingSentAtRef.current < 1500) return;
        typingSentAtRef.current = now;
        socket.emit('chat:typing', { conversationId: selectedIdRef.current });
    }, [socket]);

    const handleReact = useCallback(
        async (item: ChatMessage, emoji: string) => {
            setActionMenuId(null);
            try {
                const updated = await chatService.toggleReaction(item.conversationId, item.id, emoji);
                updateCachedMessage(item.conversationId, updated);
            } catch (error: any) {
                message.error(error?.message || 'Không thả được cảm xúc');
            }
        },
        [message, updateCachedMessage]
    );

    const handleTogglePin = useCallback(
        async (item: ChatMessage) => {
            setActionMenuId(null);
            try {
                const updated = await chatService.togglePin(item.conversationId, item.id);
                updateCachedMessage(item.conversationId, updated);
                setPinnedMessages((prev) => {
                    const without = prev.filter((m) => m.id !== updated.id);
                    return updated.pinned ? [updated, ...without] : without;
                });
                message.success(updated.pinned ? 'Đã ghim tin nhắn' : 'Đã bỏ ghim');
            } catch (error: any) {
                message.error(error?.message || 'Không ghim được tin nhắn');
            }
        },
        [message, updateCachedMessage]
    );

    const handleStartReply = useCallback((item: ChatMessage) => {
        setActionMenuId(null);
        setReplyTarget(item);
        // Lấy nét ô soạn để gõ trả lời ngay
        window.setTimeout(() => composerRef.current?.focus?.(), 50);
    }, []);

    const handleCopyMessage = useCallback(
        async (item: ChatMessage) => {
            setActionMenuId(null);
            try {
                await navigator.clipboard.writeText(item.body || '');
                message.success('Đã sao chép nội dung');
            } catch {
                message.error('Không sao chép được');
            }
        },
        [message]
    );

    // Cuộn tới một tin trong khung + nháy sáng; nếu chưa tải mà có thời điểm thì nạp ngữ cảnh quanh tin đó
    const jumpToMessageId = useCallback(
        async (id: string, createdAt?: string) => {
            const conversationId = selectedIdRef.current;
            if (!conversationId) return;

            const scrollTo = (targetId: string) => {
                const el = document.getElementById(`chat-msg-${targetId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightId(targetId);
                    window.setTimeout(() => setHighlightId((cur) => (cur === targetId ? null : cur)), 1800);
                    return true;
                }
                return false;
            };

            if (scrollTo(id)) return;
            if (!createdAt) {
                message.info('Tin gốc đã cũ, hãy cuộn lên để xem');
                return;
            }

            // Chưa có trong danh sách: nạp khối tin tính tới thời điểm tin đích
            try {
                const before = new Date(new Date(createdAt).getTime() + 1000).toISOString();
                const batch = await chatService.getMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, before });
                if (selectedIdRef.current !== conversationId) return;
                const current = messageCacheRef.current[conversationId] ?? [];
                const known = new Set(current.map((m) => m.id));
                const merged = [...batch.filter((m) => !known.has(m.id)), ...current];
                merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                replaceCachedMessages(conversationId, merged);
                setMessages(merged);
                window.setTimeout(() => scrollTo(id), 120);
            } catch {
                message.error('Không mở được tin nhắn');
            }
        },
        [message, replaceCachedMessages]
    );

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

    // "Đã xem": thành viên khác có lastReadAt >= thời điểm tin cuối => đã xem tin mới nhất
    const seenByLast = useMemo(() => {
        if (!selectedConversation || !messages.length) return [];
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.system) return [];
        const receiptMap = new Map((selectedConversation.readReceipts ?? []).map((r) => [r.userId, r.lastReadAt]));
        const lastTime = new Date(lastMsg.createdAt).getTime();
        return selectedConversation.participants.filter((participant) => {
            if (participant.id === user?.id) return false;
            const readAt = receiptMap.get(participant.id);
            return Boolean(readAt) && new Date(readAt as string).getTime() >= lastTime;
        });
    }, [selectedConversation, messages, user?.id]);

    const mentionCandidates =
        mention.isOpen && selectedConversation
            ? filterMentionCandidates(selectedConversation.participants, mention.query, user?.id)
            : [];

    const applyMention = (candidate: { id: string; name: string }) => {
        const { value, caret } = mention.apply(composer, candidate);
        setComposer(value);
        focusTextAreaCaret(composerRef, caret);
    };

    const filteredConversations = useMemo(() => {
        const keyword = conversationSearch.trim().toLowerCase();
        const base = conversations.filter((conversation) => {
            if (listFilter === 'unread') return Number(conversation.unreadCount ?? 0) > 0;
            if (listFilter === 'workflow') return conversation.type === 'workflow_thread';
            if (listFilter === 'mention') return mentionConversationIds.has(conversation.id);
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
    }, [conversationSearch, conversations, listFilter, mentionConversationIds, user?.id]);

    const handleImageSelect = async (files: FileList | null) => {
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

            if (file.size > MAX_CHAT_IMAGE_SOURCE_SIZE) {
                message.warning('Ảnh gốc vượt quá 16MB');
                continue;
            }

            try {
                const optimizedFile = await compressChatImage(file);
                if (optimizedFile.size > MAX_CHAT_IMAGE_SIZE) {
                    message.warning('Ảnh sau khi nén vẫn vượt quá 8MB');
                    continue;
                }

                accepted.push({
                    uid: `${Date.now()}-${Math.random()}`,
                    file: optimizedFile,
                    previewUrl: URL.createObjectURL(optimizedFile),
                });
            } catch {
                message.warning('Không xử lý được ảnh vừa chọn');
            }
        }

        if (accepted.length) {
            setSelectedImages((prev) => [...prev, ...accepted]);
        }
    };

    const handleVoiceRecorded = useCallback((draft: ChatVoiceNoteDraft) => {
        setSelectedVoiceNote((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return draft;
        });
    }, []);

    const removeSelectedVoiceNote = () => {
        clearSelectedVoiceNote();
    };

    const handleApplyAnnotatedImage = useCallback(
        (nextFile: File) => {
            if (!annotatingImage) return;

            if (nextFile.size > MAX_CHAT_IMAGE_SIZE) {
                message.warning('Ảnh sau khi đánh dấu vượt quá 8MB');
                return;
            }

            setSelectedImages((prev) =>
                prev.map((item) => {
                    if (item.uid !== annotatingImage.uid) return item;

                    URL.revokeObjectURL(item.previewUrl);
                    return {
                        ...item,
                        file: nextFile,
                        previewUrl: URL.createObjectURL(nextFile),
                    };
                })
            );
            setAnnotatingImage(null);
        },
        [annotatingImage, message]
    );

    const removeSelectedImage = (uid: string) => {
        if (annotatingImage?.uid === uid) {
            setAnnotatingImage(null);
        }

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
                    { label: '@ Tôi', value: 'mention' },
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
                        const directPeer =
                            conversation.type === 'direct'
                                ? conversation.participants.find((participant) => participant.id !== user?.id)
                                : undefined;
                        const avatarName = directPeer ? directPeer.name : conversation.title;
                        const peerOnline = Boolean(directPeer && isUserOnline(directPeer.id));
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
                                <span className='relative inline-flex shrink-0'>
                                    <Badge
                                        count={conversation.unreadCount || 0}
                                        size='small'
                                        offset={[-2, 4]}
                                        overflowCount={9}
                                    >
                                        <Avatar
                                            size={44}
                                            icon={
                                                typeIcon ??
                                                (conversation.type !== 'direct' ? <TeamOutlined /> : undefined)
                                            }
                                            className={`chat-page__avatar ${
                                                typeIcon && contextType ? `chat-page__avatar--${contextType}` : ''
                                            }`}
                                        >
                                            {getInitials(avatarName)}
                                        </Avatar>
                                    </Badge>
                                    {peerOnline ? (
                                        <span
                                            className='absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-green-500'
                                            title='Đang hoạt động'
                                        />
                                    ) : null}
                                </span>
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
                                        {selectedPeerOnline ? (
                                            <span className='font-bold text-green-600'>● Đang hoạt động</span>
                                        ) : (
                                            getConversationSubtitle(selectedConversation, user?.id)
                                        )}
                                    </Text>
                                </div>
                                <Tooltip title='Tìm trong hội thoại'>
                                    <Button
                                        icon={<SearchOutlined />}
                                        onClick={() => setSearchOpen((open) => !open)}
                                        className={`chat-page__icon-button ${searchOpen ? 'chat-page__icon-button--active' : ''}`}
                                    />
                                </Tooltip>
                                <Tooltip title='AI tóm tắt hội thoại'>
                                    <Button
                                        icon={<ThunderboltOutlined />}
                                        onClick={() => setSummaryOpen(true)}
                                        className='chat-page__icon-button'
                                    >
                                        {!isMobile ? 'Tóm tắt' : null}
                                    </Button>
                                </Tooltip>
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
                                            {selectedConversation.participants.map((participant) => {
                                                const online = isUserOnline(participant.id);
                                                return (
                                                    <div key={participant.id} className='chat-members__row'>
                                                        <span className='relative inline-flex shrink-0'>
                                                            <Avatar size={28} className='chat-page__avatar'>
                                                                {getInitials(participant.name)}
                                                            </Avatar>
                                                            {online ? (
                                                                <span
                                                                    className='absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500'
                                                                    title='Đang hoạt động'
                                                                />
                                                            ) : null}
                                                        </span>
                                                        <div className='min-w-0'>
                                                            <div className='truncate text-[13px] font-bold text-slate-800'>
                                                                {participant.name}
                                                                {participant.id === user?.id ? ' (Bạn)' : ''}
                                                            </div>
                                                            <div className='truncate text-xs text-slate-500'>
                                                                {online ? (
                                                                    <span className='font-semibold text-green-600'>
                                                                        Đang hoạt động
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        {roleLabel[participant.role]}
                                                                        {participant.plant?.name
                                                                            ? ` · ${participant.plant.name}`
                                                                            : ''}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
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

                            {searchOpen ? (
                                <div className='chat-page__search-panel'>
                                    <Input
                                        autoFocus
                                        allowClear
                                        value={messageSearch}
                                        onChange={(event) => setMessageSearch(event.target.value)}
                                        prefix={<SearchOutlined className='text-slate-400' />}
                                        placeholder='Tìm nội dung tin nhắn trong hội thoại...'
                                        className='chat-page__search-input'
                                    />
                                    {messageSearch.trim().length >= 2 ? (
                                        <div className='chat-page__search-results'>
                                            {searching ? (
                                                <div className='py-3 text-center text-xs text-slate-400'>
                                                    Đang tìm...
                                                </div>
                                            ) : searchResults.length ? (
                                                searchResults.map((result) => (
                                                    <button
                                                        key={result.id}
                                                        type='button'
                                                        className='chat-page__search-result'
                                                        onClick={() => {
                                                            setSearchOpen(false);
                                                            void jumpToMessageId(result.id, result.createdAt);
                                                        }}
                                                    >
                                                        <span className='chat-page__search-result-top'>
                                                            <span className='truncate font-bold text-slate-700'>
                                                                {result.sender?.name || 'Người dùng'}
                                                            </span>
                                                            <span className='shrink-0 text-[11px] text-slate-400'>
                                                                {formatFullTime(result.createdAt)}
                                                            </span>
                                                        </span>
                                                        <span className='chat-page__search-result-body'>
                                                            {result.body}
                                                        </span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className='py-3 text-center text-xs text-slate-400'>
                                                    Không tìm thấy tin nhắn phù hợp
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {pinnedMessages.length ? (
                                <button
                                    type='button'
                                    className='chat-page__pinned-banner'
                                    onClick={() =>
                                        void jumpToMessageId(pinnedMessages[0].id, pinnedMessages[0].createdAt)
                                    }
                                >
                                    <PushpinFilled className='text-[#0f6bdc]' />
                                    <span className='min-w-0 flex-1 text-left'>
                                        <span className='chat-page__pinned-label'>
                                            Tin đã ghim
                                            {pinnedMessages.length > 1 ? ` · ${pinnedMessages.length}` : ''}
                                        </span>
                                        <span className='chat-page__pinned-body'>
                                            {pinnedMessages[0].body || '🖼️ Hình ảnh'}
                                        </span>
                                    </span>
                                    <Tooltip title='Bỏ ghim'>
                                        <DeleteOutlined
                                            className='chat-page__pinned-unpin'
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void handleTogglePin(pinnedMessages[0]);
                                            }}
                                        />
                                    </Tooltip>
                                </button>
                            ) : null}

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
                                            const iMentioned = Boolean(user?.id && item.mentions?.includes(user.id));
                                            const mentionNames = mentionHighlightNames(
                                                item,
                                                selectedConversation.participants
                                            );
                                            const bubbleClass = `chat-page__bubble chat-page__bubble--${row.shape}`;
                                            const reactions = groupReactions(item, user?.id);
                                            const menuOpen = actionMenuId === item.id;

                                            const actionContent = (
                                                <div className='chat-action-menu'>
                                                    <div className='chat-action-menu__emojis'>
                                                        {REACTION_EMOJIS.map((emoji) => (
                                                            <button
                                                                key={emoji}
                                                                type='button'
                                                                className='chat-action-menu__emoji'
                                                                onClick={() => void handleReact(item, emoji)}
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <button
                                                        type='button'
                                                        className='chat-action-menu__item'
                                                        onClick={() => handleStartReply(item)}
                                                    >
                                                        <RollbackOutlined /> Trả lời
                                                    </button>
                                                    <button
                                                        type='button'
                                                        className='chat-action-menu__item'
                                                        onClick={() => void handleTogglePin(item)}
                                                    >
                                                        {item.pinned ? <PushpinFilled /> : <PushpinOutlined />}{' '}
                                                        {item.pinned ? 'Bỏ ghim' : 'Ghim tin'}
                                                    </button>
                                                    {item.body ? (
                                                        <button
                                                            type='button'
                                                            className='chat-action-menu__item'
                                                            onClick={() => void handleCopyMessage(item)}
                                                        >
                                                            <CopyOutlined /> Sao chép
                                                        </button>
                                                    ) : null}
                                                    {mine ? (
                                                        <button
                                                            type='button'
                                                            className='chat-action-menu__item chat-action-menu__item--danger'
                                                            onClick={() => handleRecallMessage(item)}
                                                        >
                                                            <DeleteOutlined /> Thu hồi
                                                        </button>
                                                    ) : null}
                                                </div>
                                            );

                                            return (
                                                <div
                                                    key={row.key}
                                                    id={`chat-msg-${item.id}`}
                                                    className={`group chat-page__message ${mine ? 'chat-page__message--mine' : ''} ${
                                                        row.isGroupStart ? 'chat-page__message--group-start' : ''
                                                    } ${highlightId === item.id ? 'chat-page__message--highlight' : ''}`}
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
                                                    {!item.isDeleted ? (
                                                        <Dropdown
                                                            open={menuOpen}
                                                            trigger={['click']}
                                                            placement={mine ? 'topRight' : 'topLeft'}
                                                            onOpenChange={(open) =>
                                                                setActionMenuId(open ? item.id : null)
                                                            }
                                                            dropdownRender={() => actionContent}
                                                        >
                                                            <Button
                                                                type='text'
                                                                size='small'
                                                                icon={<SmileOutlined />}
                                                                className='chat-page__msg-action self-center text-slate-300 transition-opacity hover:text-slate-500 md:opacity-0 md:group-hover:opacity-100'
                                                            />
                                                        </Dropdown>
                                                    ) : null}
                                                    <div
                                                        className='chat-page__bubble-wrap'
                                                        onContextMenu={(event) => {
                                                            if (item.isDeleted) return;
                                                            event.preventDefault();
                                                            setActionMenuId(item.id);
                                                        }}
                                                        onTouchStart={() => {
                                                            if (item.isDeleted) return;
                                                            longPressTimerRef.current = window.setTimeout(
                                                                () => setActionMenuId(item.id),
                                                                450
                                                            );
                                                        }}
                                                        onTouchEnd={() =>
                                                            window.clearTimeout(longPressTimerRef.current)
                                                        }
                                                        onTouchMove={() =>
                                                            window.clearTimeout(longPressTimerRef.current)
                                                        }
                                                    >
                                                        {!mine &&
                                                        row.isGroupStart &&
                                                        selectedConversation.type !== 'direct' ? (
                                                            <Text className='chat-page__sender-name'>
                                                                {item.sender?.name || 'Người dùng'}
                                                            </Text>
                                                        ) : null}
                                                        {item.replyTo ? (
                                                            <button
                                                                type='button'
                                                                className='chat-page__reply-quote'
                                                                onClick={() => void jumpToMessageId(item.replyTo!.id)}
                                                            >
                                                                <span className='chat-page__reply-quote-name'>
                                                                    {item.replyTo.senderName || 'Tin nhắn'}
                                                                </span>
                                                                <span className='chat-page__reply-quote-body'>
                                                                    {item.replyTo.isDeleted
                                                                        ? 'Tin nhắn đã được thu hồi'
                                                                        : item.replyTo.hasImage && !item.replyTo.body
                                                                          ? '🖼️ Hình ảnh'
                                                                          : item.replyTo.hasAudio && !item.replyTo.body
                                                                            ? 'Ghi âm'
                                                                            : item.replyTo.body}
                                                                </span>
                                                            </button>
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
                                                                className={`${bubbleClass}${
                                                                    iMentioned && !mine
                                                                        ? '!bg-blue-50 ring-1 ring-blue-200'
                                                                        : ''
                                                                }`}
                                                                title={formatFullTime(item.createdAt)}
                                                            >
                                                                <span>
                                                                    <MentionText
                                                                        text={item.body}
                                                                        names={mentionNames}
                                                                    />
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                        <ChatMessageAttachments
                                                            attachments={item.attachments}
                                                            variant='chat-page'
                                                        />
                                                        {reactions.length ? (
                                                            <div className='chat-page__reactions'>
                                                                {reactions.map((reaction) => (
                                                                    <button
                                                                        key={reaction.emoji}
                                                                        type='button'
                                                                        className={`chat-page__reaction ${
                                                                            reaction.mine
                                                                                ? 'chat-page__reaction--mine'
                                                                                : ''
                                                                        }`}
                                                                        onClick={() =>
                                                                            void handleReact(item, reaction.emoji)
                                                                        }
                                                                    >
                                                                        <span>{reaction.emoji}</span>
                                                                        <span className='chat-page__reaction-count'>
                                                                            {reaction.count}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
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
                                        {seenByLast.length ? (
                                            <div className='flex items-center justify-end gap-1 px-2 pt-0.5'>
                                                <Text className='text-[11px] font-medium text-slate-400'>Đã xem</Text>
                                                <div className='flex -space-x-1.5'>
                                                    {seenByLast.slice(0, 3).map((participant) => (
                                                        <Tooltip key={participant.id} title={participant.name}>
                                                            <Avatar
                                                                size={16}
                                                                className='chat-page__avatar !border !border-white !text-[8px]'
                                                            >
                                                                {getInitials(participant.name)}
                                                            </Avatar>
                                                        </Tooltip>
                                                    ))}
                                                </div>
                                                {seenByLast.length > 3 ? (
                                                    <Text className='text-[11px] text-slate-400'>
                                                        +{seenByLast.length - 3}
                                                    </Text>
                                                ) : null}
                                            </div>
                                        ) : null}
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

                            {Object.keys(typingUsers).length ? (
                                <div className='chat-page__typing'>
                                    <span className='chat-page__typing-dots'>
                                        <i />
                                        <i />
                                        <i />
                                    </span>
                                    <span className='chat-page__typing-text'>
                                        {Object.values(typingUsers).slice(0, 2).join(', ')}
                                        {Object.keys(typingUsers).length > 2
                                            ? ` +${Object.keys(typingUsers).length - 2}`
                                            : ''}{' '}
                                        đang soạn tin…
                                    </span>
                                </div>
                            ) : null}

                            {replyTarget ? (
                                <div className='chat-page__reply-bar'>
                                    <RollbackOutlined className='text-[#0f6bdc]' />
                                    <div className='min-w-0 flex-1'>
                                        <div className='chat-page__reply-bar-name'>
                                            Trả lời{' '}
                                            {replyTarget.senderId === user?.id
                                                ? 'chính bạn'
                                                : replyTarget.sender?.name || ''}
                                        </div>
                                        <div className='chat-page__reply-bar-body'>
                                            {replyTarget.body || '🖼️ Hình ảnh'}
                                        </div>
                                    </div>
                                    <Button
                                        type='text'
                                        size='small'
                                        icon={<CloseOutlined />}
                                        onClick={() => setReplyTarget(null)}
                                    />
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
                                        void handleImageSelect(event.target.files);
                                        event.target.value = '';
                                    }}
                                />
                                <Button
                                    icon={<CameraOutlined />}
                                    onClick={() => imageInputRef.current?.click()}
                                    disabled={sending || selectedImages.length >= MAX_CHAT_IMAGES}
                                    className='chat-page__attach-button'
                                />
                                <Popover
                                    trigger='click'
                                    placement='topLeft'
                                    content={
                                        <div className='chat-emoji-grid'>
                                            {COMPOSER_EMOJIS.map((emoji) => (
                                                <button
                                                    key={emoji}
                                                    type='button'
                                                    className='chat-emoji-grid__item'
                                                    onClick={() => setComposer((prev) => prev + emoji)}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    }
                                >
                                    <Button icon={<SmileOutlined />} className='chat-page__attach-button' />
                                </Popover>
                                <VoiceRecorderButton
                                    disabled={sending || Boolean(selectedVoiceNote)}
                                    onRecorded={handleVoiceRecorded}
                                    className='chat-page__voice-button'
                                />
                                <div className='relative min-w-0 flex-1'>
                                    {mention.isOpen && mentionCandidates.length ? (
                                        <div className='absolute bottom-full left-0 z-20 mb-2 max-h-64 w-72 max-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl'>
                                            <div className='px-3 py-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
                                                Nhắc tới
                                            </div>
                                            {mentionCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    type='button'
                                                    className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50'
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        applyMention(candidate);
                                                    }}
                                                >
                                                    <Avatar size={26} className='chat-page__avatar shrink-0'>
                                                        {candidate.id === '@all' ? '@' : getInitials(candidate.name)}
                                                    </Avatar>
                                                    <span className='min-w-0'>
                                                        <span className='block truncate text-[13px] font-semibold text-slate-800'>
                                                            {candidate.name}
                                                        </span>
                                                        {candidate.subtitle ? (
                                                            <span className='block truncate text-[11px] text-slate-400'>
                                                                {candidate.subtitle}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    {selectedImages.length ? (
                                        <div className='chat-page__selected-images'>
                                            {selectedImages.map((item) => (
                                                <div key={item.uid} className='chat-page__selected-image'>
                                                    <img src={item.previewUrl} alt='Ảnh đã chọn' />
                                                    <button
                                                        type='button'
                                                        className='chat-selected-image__edit'
                                                        onClick={() => setAnnotatingImage(item)}
                                                        aria-label='Đánh dấu ảnh'
                                                    >
                                                        <EditOutlined />
                                                    </button>
                                                    <button
                                                        type='button'
                                                        className='chat-selected-image__remove'
                                                        onClick={() => removeSelectedImage(item.uid)}
                                                        aria-label='Xóa ảnh'
                                                    >
                                                        <DeleteOutlined />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    {selectedVoiceNote ? (
                                        <div className='chat-page__voice-draft'>
                                            <ChatAudioPlayer
                                                url={selectedVoiceNote.previewUrl}
                                                durationMs={selectedVoiceNote.durationMs}
                                                name='Nghe lại trước khi gửi'
                                            />
                                            <button type='button' onClick={removeSelectedVoiceNote}>
                                                <DeleteOutlined />
                                            </button>
                                        </div>
                                    ) : null}
                                    <TextArea
                                        ref={composerRef}
                                        value={composer}
                                        autoSize={{ minRows: 1, maxRows: 4 }}
                                        maxLength={4000}
                                        placeholder='Nhập tin nhắn nội bộ... (gõ @ để nhắc ai đó)'
                                        onChange={(event) => {
                                            setComposer(event.target.value);
                                            emitTyping();
                                            mention.analyze(
                                                event.target.value,
                                                event.target.selectionStart ?? event.target.value.length
                                            );
                                        }}
                                        onKeyDown={(event) => {
                                            if (mention.isOpen && mentionCandidates.length && event.key === 'Enter') {
                                                event.preventDefault();
                                                applyMention(mentionCandidates[0]);
                                            } else if (mention.isOpen && event.key === 'Escape') {
                                                mention.close();
                                            }
                                        }}
                                        onPressEnter={(event) => {
                                            if (mention.isOpen && mentionCandidates.length) {
                                                event.preventDefault();
                                                return;
                                            }
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
                                    disabled={!composer.trim() && !selectedImages.length && !selectedVoiceNote}
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
            <ImageAnnotationModal
                open={Boolean(annotatingImage)}
                file={annotatingImage?.file}
                previewUrl={annotatingImage?.previewUrl}
                onApply={handleApplyAnnotatedImage}
                onClose={() => setAnnotatingImage(null)}
            />
            <ChatAiSummaryDrawer
                open={summaryOpen}
                conversationId={selectedConversation?.id}
                title={selectedConversation?.title}
                onClose={() => setSummaryOpen(false)}
            />
        </div>
    );
};

export default ChatPage;
