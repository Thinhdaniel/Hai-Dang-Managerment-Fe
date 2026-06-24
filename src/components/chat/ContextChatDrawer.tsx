import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Avatar,
    Button,
    Drawer,
    Dropdown,
    Empty,
    Grid,
    Input,
    Popover,
    Spin,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    BellFilled,
    BellOutlined,
    CameraOutlined,
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    MessageOutlined,
    RollbackOutlined,
    SendOutlined,
    SmileOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../core/contexts/AuthContext';
import {
    type ChatConversationReadEvent,
    type ChatConversationUpdateEvent,
    type ChatMessageEvent,
    type ChatMessageRecalledEvent,
    type ChatMessageUpdatedEvent,
    type ChatTypingEvent,
    useChatContext,
} from '../../core/contexts/ChatContext';
import { useSocket } from '../../core/hooks/useSocket';
import { chatService } from '../../core/services/chat.service';
import {
    buildChatStream,
    COMPOSER_EMOJIS,
    CONTEXT_TYPE_LABEL,
    formatFullTime,
    formatTimeShort,
    groupReactions,
    REACTION_EMOJIS,
} from './chatStream';
import {
    extractMentionTokens,
    filterMentionCandidates,
    focusTextAreaCaret,
    MentionText,
    mentionHighlightNames,
    useMentionInput,
} from './mentions';
import ChatAudioPlayer from './ChatAudioPlayer';
import ImageAnnotationModal from './ImageAnnotationModal';
import ChatMessageAttachments from './ChatMessageAttachments';
import ChatAiSummaryDrawer from './ChatAiSummaryDrawer';
import VoiceRecorderButton, { type ChatVoiceNoteDraft } from './VoiceRecorderButton';
import { compressChatImage } from '../../core/lib/chatMedia';
import type { ChatConversation, ChatMessage, ChatWorkflowContextType } from '../../core/types';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const MAX_CHAT_IMAGES = 4;
const MAX_CHAT_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_CHAT_IMAGE_SOURCE_SIZE = 16 * 1024 * 1024;

type ContextChatDrawerProps = {
    open: boolean;
    contextType: ChatWorkflowContextType;
    contextId: string;
    title: string;
    subtitle?: string;
    onClose: () => void;
};

type SelectedImage = {
    uid: string;
    file: File;
    previewUrl: string;
};

const getInitials = (name?: string) => {
    const parts = String(name || 'HD')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    return (
        parts
            .slice(-2)
            .map((item) => item.charAt(0).toUpperCase())
            .join('') || 'HD'
    );
};

const ContextChatDrawer: React.FC<ContextChatDrawerProps> = ({
    open,
    contextType,
    contextId,
    title,
    subtitle,
    onClose,
}) => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const { message, modal } = App.useApp();
    const { user } = useAuth();
    const { socket } = useSocket();
    const { refreshUnread } = useChatContext();
    const endRef = useRef<HTMLDivElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const readInFlightRef = useRef<Set<string>>(new Set());
    const composerRef = useRef<any>(null);
    const typingSentAtRef = useRef(0);
    const typingTimersRef = useRef<Record<string, number>>({});
    const longPressTimerRef = useRef<number | undefined>(undefined);
    const [conversation, setConversation] = useState<ChatConversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [composer, setComposer] = useState('');
    const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
    const [selectedVoiceNote, setSelectedVoiceNote] = useState<ChatVoiceNoteDraft | null>(null);
    const [annotatingImage, setAnnotatingImage] = useState<SelectedImage | null>(null);
    const [sending, setSending] = useState(false);
    const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
    const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
    const [actionMenuId, setActionMenuId] = useState<string | null>(null);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const mention = useMentionInput();

    const streamRows = useMemo(() => buildChatStream(messages), [messages]);

    // "Đã xem": thành viên khác đã đọc tới tin cuối cùng
    const seenByLast = useMemo(() => {
        if (!conversation || !messages.length) return [];
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.system) return [];
        const receiptMap = new Map((conversation.readReceipts ?? []).map((r) => [r.userId, r.lastReadAt]));
        const lastTime = new Date(lastMsg.createdAt).getTime();
        return conversation.participants.filter((participant) => {
            if (participant.id === user?.id) return false;
            const readAt = receiptMap.get(participant.id);
            return Boolean(readAt) && new Date(readAt as string).getTime() >= lastTime;
        });
    }, [conversation, messages, user?.id]);

    const mentionCandidates =
        mention.isOpen && conversation
            ? filterMentionCandidates(conversation.participants, mention.query, user?.id)
            : [];

    const applyMention = (candidate: { id: string; name: string }) => {
        const { value, caret } = mention.apply(composer, candidate);
        setComposer(value);
        focusTextAreaCaret(composerRef, caret);
    };

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

    const markConversationRead = useCallback(
        async (conversationId: string) => {
            if (readInFlightRef.current.has(conversationId)) return;

            readInFlightRef.current.add(conversationId);
            setConversation((prev) => (prev?.id === conversationId ? { ...prev, unreadCount: 0 } : prev));

            try {
                await chatService.markAsRead(conversationId);
                void refreshUnread();
            } catch {
                // Read receipts are reconciled by the next chat refresh/socket update.
            } finally {
                readInFlightRef.current.delete(conversationId);
            }
        },
        [refreshUnread]
    );

    const loadConversation = useCallback(async () => {
        if (!open || !contextId) return;

        setLoading(true);
        try {
            const nextConversation = await chatService.getContextConversation(contextType, contextId);
            const nextMessages = await chatService.getMessages(nextConversation.id, { limit: 80 });
            setConversation(
                Number(nextConversation.unreadCount ?? 0) > 0
                    ? { ...nextConversation, unreadCount: 0 }
                    : nextConversation
            );
            setMessages(nextMessages);
            if (Number(nextConversation.unreadCount ?? 0) > 0) {
                void markConversationRead(nextConversation.id);
            }
        } catch (error: any) {
            message.error(error?.message || 'Không mở được trao đổi của phiếu');
        } finally {
            setLoading(false);
        }
    }, [contextId, contextType, markConversationRead, message, open]);

    useEffect(() => {
        if (open) {
            void loadConversation();
            return;
        }

        setConversation(null);
        setMessages([]);
        setComposer('');
        setReplyTarget(null);
        setTypingUsers({});
        setActionMenuId(null);
        clearSelectedMedia();
    }, [clearSelectedMedia, loadConversation, open]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, open]);

    useEffect(() => {
        if (!socket || !conversation) return;

        const onMessage = (payload: ChatMessageEvent) => {
            if (payload.message.conversationId !== conversation.id) return;

            setMessages((prev) =>
                prev.some((item) => item.id === payload.message.id) ? prev : [...prev, payload.message]
            );
            setConversation({ ...payload.conversation, unreadCount: 0 });
            if (payload.message.senderId !== user?.id) {
                void markConversationRead(conversation.id);
            }
        };

        const onConversationUpdate = (payload: ChatConversationUpdateEvent) => {
            if (payload.conversation.id === conversation.id) {
                setConversation(payload.conversation);
            }
        };

        const onMessageRecalled = (payload: ChatMessageRecalledEvent) => {
            if (payload.conversationId !== conversation.id) return;
            setMessages((prev) => prev.map((item) => (item.id === payload.message.id ? payload.message : item)));
        };

        const onMessageUpdated = (payload: ChatMessageUpdatedEvent) => {
            if (payload.conversationId !== conversation.id) return;
            setMessages((prev) => prev.map((item) => (item.id === payload.message.id ? payload.message : item)));
        };

        const onTyping = (payload: ChatTypingEvent) => {
            if (payload.conversationId !== conversation.id || payload.userId === user?.id) return;
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

        const onConversationRead = (payload: ChatConversationReadEvent) => {
            if (payload.conversationId !== conversation.id) return;
            setConversation((prev) => {
                if (!prev || prev.id !== payload.conversationId) return prev;
                const receipts = (prev.readReceipts ?? []).filter((r) => r.userId !== payload.userId);
                return {
                    ...prev,
                    readReceipts: [...receipts, { userId: payload.userId, lastReadAt: payload.lastReadAt }],
                };
            });
        };

        socket.on('chat:message:new', onMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:message:recalled', onMessageRecalled);
        socket.on('chat:message:updated', onMessageUpdated);
        socket.on('chat:typing', onTyping);
        socket.on('chat:conversation:read', onConversationRead);

        return () => {
            socket.off('chat:message:new', onMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:message:recalled', onMessageRecalled);
            socket.off('chat:message:updated', onMessageUpdated);
            socket.off('chat:typing', onTyping);
            socket.off('chat:conversation:read', onConversationRead);
        };
    }, [conversation, markConversationRead, socket, user?.id]);

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
                        setMessages((prev) => prev.map((current) => (current.id === recalled.id ? recalled : current)));
                    } catch (error: any) {
                        message.error(error?.message || 'Không thu hồi được tin nhắn');
                    }
                },
            });
        },
        [message, modal]
    );

    const handleToggleMute = useCallback(async () => {
        if (!conversation) return;

        const previousMuted = conversation.muted;
        const nextMuted = !previousMuted;
        setConversation((prev) => (prev ? { ...prev, muted: nextMuted } : prev));

        try {
            await chatService.setMuted(conversation.id, nextMuted);
            message.success(nextMuted ? 'Đã tắt thông báo của trao đổi này' : 'Đã bật lại thông báo');
        } catch {
            setConversation((prev) => (prev ? { ...prev, muted: previousMuted } : prev));
            message.error('Không thay đổi được cài đặt thông báo');
        }
    }, [conversation, message]);

    const emitTyping = useCallback(() => {
        if (!conversation || !socket) return;
        const now = Date.now();
        if (now - typingSentAtRef.current < 1500) return;
        typingSentAtRef.current = now;
        socket.emit('chat:typing', { conversationId: conversation.id });
    }, [conversation, socket]);

    const handleReact = useCallback(
        async (item: ChatMessage, emoji: string) => {
            setActionMenuId(null);
            try {
                const updated = await chatService.toggleReaction(item.conversationId, item.id, emoji);
                setMessages((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
            } catch (error: any) {
                message.error(error?.message || 'Không thả được cảm xúc');
            }
        },
        [message]
    );

    const handleStartReply = useCallback((item: ChatMessage) => {
        setActionMenuId(null);
        setReplyTarget(item);
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

    const handleSend = async () => {
        const body = composer.trim();
        const hasMedia = Boolean(selectedImages.length || selectedVoiceNote);
        if (!conversation || (!body && !hasMedia) || sending) return;

        const replyToId = replyTarget?.id;
        const mentions = extractMentionTokens(
            body,
            conversation.participants.map((participant) => ({ id: participant.id, name: participant.name }))
        );
        setSending(true);
        try {
            const sent = hasMedia
                ? await chatService.sendAttachmentMessage(
                      conversation.id,
                      body,
                      {
                          images: selectedImages.map((item) => item.file),
                          audio: selectedVoiceNote?.file,
                          audioDurationMs: selectedVoiceNote?.durationMs,
                      },
                      replyToId,
                      mentions
                  )
                : await chatService.sendMessage(conversation.id, { body, replyTo: replyToId, mentions });
            setComposer('');
            clearSelectedMedia();
            setReplyTarget(null);
            setMessages((prev) => (prev.some((item) => item.id === sent.id) ? prev : [...prev, sent]));
        } catch {
            message.error('Không gửi được tin nhắn');
        } finally {
            setSending(false);
        }
    };

    const handleImageSelect = async (files: FileList | null) => {
        if (!files?.length) return;

        const nextFiles = Array.from(files);
        const slotsLeft = MAX_CHAT_IMAGES - selectedImages.length;
        if (slotsLeft <= 0) {
            message.warning(`Tối đa ${MAX_CHAT_IMAGES} ảnh mỗi lần gửi`);
            return;
        }

        const accepted: SelectedImage[] = [];
        for (const file of nextFiles.slice(0, slotsLeft)) {
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

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={isMobile ? 'bottom' : 'right'}
            height={isMobile ? '88dvh' : undefined}
            width={520}
            closable={false}
            destroyOnHidden
            className='context-chat-drawer'
            styles={{ body: { padding: 0 } }}
        >
            <div className='context-chat'>
                <div className='context-chat__header'>
                    <div className='flex min-w-0 items-center gap-3'>
                        <div className='context-chat__header-icon'>
                            <MessageOutlined />
                        </div>
                        <div className='min-w-0'>
                            <Title level={5} className='!mb-0 truncate !text-[16px] !font-black !text-slate-950'>
                                {title}
                            </Title>
                            <Text className='block truncate text-xs font-semibold text-slate-500'>
                                {subtitle || conversation?.context?.label || 'Trao đổi nghiệp vụ'}
                            </Text>
                        </div>
                    </div>
                    <div className='flex items-center gap-2'>
                        <Tag className='context-chat__tag'>{CONTEXT_TYPE_LABEL[contextType] || 'Nghiệp vụ'}</Tag>
                        {conversation ? (
                            <Tooltip title='AI tóm tắt trao đổi'>
                                <Button
                                    icon={<ThunderboltOutlined />}
                                    onClick={() => setSummaryOpen(true)}
                                    className='context-chat__close'
                                />
                            </Tooltip>
                        ) : null}
                        {conversation ? (
                            <Tooltip
                                title={
                                    conversation.muted
                                        ? 'Đang tắt thông báo — bấm để bật lại'
                                        : 'Tắt thông báo của trao đổi này'
                                }
                            >
                                <Button
                                    icon={
                                        conversation.muted ? (
                                            <BellOutlined className='text-slate-400' />
                                        ) : (
                                            <BellFilled className='text-[#0f6bdc]' />
                                        )
                                    }
                                    onClick={() => void handleToggleMute()}
                                    className='context-chat__close'
                                />
                            </Tooltip>
                        ) : null}
                        <Button icon={<CloseOutlined />} onClick={onClose} className='context-chat__close' />
                    </div>
                </div>

                <div className='context-chat__body'>
                    <Spin spinning={loading}>
                        {messages.length ? (
                            <div className='context-chat__stack'>
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
                                            <div key={row.key} className='context-chat__system'>
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
                                    const mentionNames = conversation
                                        ? mentionHighlightNames(item, conversation.participants)
                                        : [];
                                    const bubbleClass = `context-chat__bubble context-chat__bubble--${row.shape}`;
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
                                            className={`group context-chat__message ${mine ? 'context-chat__message--mine' : ''} ${
                                                row.isGroupStart ? 'context-chat__message--group-start' : ''
                                            }`}
                                        >
                                            {!mine ? (
                                                row.isGroupStart ? (
                                                    <Avatar size={30} className='context-chat__avatar'>
                                                        {getInitials(item.sender?.name)}
                                                    </Avatar>
                                                ) : (
                                                    <span className='context-chat__avatar-spacer' />
                                                )
                                            ) : null}
                                            {!item.isDeleted ? (
                                                <Dropdown
                                                    open={menuOpen}
                                                    trigger={['click']}
                                                    placement={mine ? 'topRight' : 'topLeft'}
                                                    onOpenChange={(o) => setActionMenuId(o ? item.id : null)}
                                                    dropdownRender={() => actionContent}
                                                >
                                                    <Button
                                                        type='text'
                                                        size='small'
                                                        icon={<SmileOutlined />}
                                                        className='self-center text-slate-300 transition-opacity hover:text-slate-500 md:opacity-0 md:group-hover:opacity-100'
                                                    />
                                                </Dropdown>
                                            ) : null}
                                            <div
                                                className='context-chat__bubble-wrap'
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
                                                onTouchEnd={() => window.clearTimeout(longPressTimerRef.current)}
                                                onTouchMove={() => window.clearTimeout(longPressTimerRef.current)}
                                            >
                                                {!mine && row.isGroupStart ? (
                                                    <Text className='context-chat__sender-name'>
                                                        {item.sender?.name || 'Người dùng'}
                                                    </Text>
                                                ) : null}
                                                {item.replyTo ? (
                                                    <button
                                                        type='button'
                                                        className='chat-page__reply-quote'
                                                        onClick={() => {
                                                            const el = document.getElementById(
                                                                `ctx-msg-${item.replyTo!.id}`
                                                            );
                                                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }}
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
                                                <div id={`ctx-msg-${item.id}`}>
                                                    {item.isDeleted ? (
                                                        <div
                                                            className={`${bubbleClass} context-chat__bubble--recalled`}
                                                            title={formatFullTime(item.createdAt)}
                                                        >
                                                            {item.body}
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
                                                            <MentionText text={item.body} names={mentionNames} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <ChatMessageAttachments
                                                    attachments={item.attachments}
                                                    variant='context-chat'
                                                />
                                                {reactions.length ? (
                                                    <div className='chat-page__reactions'>
                                                        {reactions.map((reaction) => (
                                                            <button
                                                                key={reaction.emoji}
                                                                type='button'
                                                                className={`chat-page__reaction ${
                                                                    reaction.mine ? 'chat-page__reaction--mine' : ''
                                                                }`}
                                                                onClick={() => void handleReact(item, reaction.emoji)}
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
                                                    <Text className='context-chat__msg-time'>
                                                        {formatTimeShort(item.createdAt)}
                                                    </Text>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                                {seenByLast.length ? (
                                    <div className='flex items-center justify-end gap-1 px-1 pt-0.5'>
                                        <Text className='text-[11px] font-medium text-slate-400'>Đã xem</Text>
                                        <div className='flex -space-x-1.5'>
                                            {seenByLast.slice(0, 3).map((participant) => (
                                                <Tooltip key={participant.id} title={participant.name}>
                                                    <Avatar
                                                        size={16}
                                                        className='context-chat__avatar !border !border-white !text-[8px]'
                                                    >
                                                        {getInitials(participant.name)}
                                                    </Avatar>
                                                </Tooltip>
                                            ))}
                                        </div>
                                        {seenByLast.length > 3 ? (
                                            <Text className='text-[11px] text-slate-400'>+{seenByLast.length - 3}</Text>
                                        ) : null}
                                    </div>
                                ) : null}
                                <div ref={endRef} />
                            </div>
                        ) : !loading ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description='Chưa có trao đổi trong phiếu này'
                                className='mt-16'
                            />
                        ) : null}
                    </Spin>
                </div>

                {Object.keys(typingUsers).length ? (
                    <div className='chat-page__typing'>
                        <span className='chat-page__typing-dots'>
                            <i />
                            <i />
                            <i />
                        </span>
                        <span className='chat-page__typing-text'>
                            {Object.values(typingUsers).slice(0, 2).join(', ')} đang soạn tin…
                        </span>
                    </div>
                ) : null}

                {replyTarget ? (
                    <div className='chat-page__reply-bar'>
                        <RollbackOutlined className='text-[#0f6bdc]' />
                        <div className='min-w-0 flex-1'>
                            <div className='chat-page__reply-bar-name'>
                                Trả lời{' '}
                                {replyTarget.senderId === user?.id ? 'chính bạn' : replyTarget.sender?.name || ''}
                            </div>
                            <div className='chat-page__reply-bar-body'>{replyTarget.body || '🖼️ Hình ảnh'}</div>
                        </div>
                        <Button
                            type='text'
                            size='small'
                            icon={<CloseOutlined />}
                            onClick={() => setReplyTarget(null)}
                        />
                    </div>
                ) : null}

                <div className='context-chat__composer'>
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
                        className='context-chat__attach-button'
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
                        <Button icon={<SmileOutlined />} className='context-chat__attach-button' />
                    </Popover>
                    <VoiceRecorderButton
                        disabled={sending || Boolean(selectedVoiceNote)}
                        onRecorded={handleVoiceRecorded}
                        className='context-chat__voice-button'
                    />
                    <div className='relative min-w-0 flex-1'>
                        {mention.isOpen && mentionCandidates.length ? (
                            <div className='absolute bottom-full left-0 z-20 mb-2 max-h-60 w-72 max-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl'>
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
                                        <Avatar size={26} className='context-chat__avatar shrink-0'>
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
                            <div className='context-chat__selected-images'>
                                {selectedImages.map((item) => (
                                    <div key={item.uid} className='context-chat__selected-image'>
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
                            <div className='context-chat__voice-draft'>
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
                            placeholder='Nhập trao đổi về phiếu này... (gõ @ để nhắc ai đó)'
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
                            className='context-chat__input'
                        />
                    </div>
                    <Button
                        type='primary'
                        icon={<SendOutlined />}
                        loading={sending}
                        disabled={(!composer.trim() && !selectedImages.length && !selectedVoiceNote) || !conversation}
                        onClick={() => void handleSend()}
                        className='context-chat__send'
                    />
                </div>
            </div>
            <ImageAnnotationModal
                open={Boolean(annotatingImage)}
                file={annotatingImage?.file}
                previewUrl={annotatingImage?.previewUrl}
                onApply={handleApplyAnnotatedImage}
                onClose={() => setAnnotatingImage(null)}
            />
            <ChatAiSummaryDrawer
                open={summaryOpen}
                conversationId={conversation?.id}
                title={title}
                onClose={() => setSummaryOpen(false)}
            />
        </Drawer>
    );
};

export default ContextChatDrawer;
