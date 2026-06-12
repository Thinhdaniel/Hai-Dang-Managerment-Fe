import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Avatar, Button, Drawer, Dropdown, Empty, Grid, Image, Input, Spin, Tag, Tooltip, Typography } from 'antd';
import {
    BellFilled,
    BellOutlined,
    CameraOutlined,
    CloseOutlined,
    DeleteOutlined,
    MessageOutlined,
    MoreOutlined,
    SendOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../core/contexts/AuthContext';
import {
    type ChatConversationUpdateEvent,
    type ChatMessageEvent,
    type ChatMessageRecalledEvent,
    useChatContext,
} from '../../core/contexts/ChatContext';
import { useSocket } from '../../core/hooks/useSocket';
import { chatService } from '../../core/services/chat.service';
import type { ChatConversation, ChatMessage, ChatWorkflowContextType } from '../../core/types';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const MAX_CHAT_IMAGES = 4;
const MAX_CHAT_IMAGE_SIZE = 8 * 1024 * 1024;

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

const formatTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
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
    const [conversation, setConversation] = useState<ChatConversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [composer, setComposer] = useState('');
    const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
    const [sending, setSending] = useState(false);

    const clearSelectedImages = useCallback(() => {
        setSelectedImages((prev) => {
            prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            return [];
        });
    }, []);

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
        clearSelectedImages();
    }, [clearSelectedImages, loadConversation, open]);

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

        socket.on('chat:message:new', onMessage);
        socket.on('chat:conversation:update', onConversationUpdate);
        socket.on('chat:message:recalled', onMessageRecalled);

        return () => {
            socket.off('chat:message:new', onMessage);
            socket.off('chat:conversation:update', onConversationUpdate);
            socket.off('chat:message:recalled', onMessageRecalled);
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

    const handleSend = async () => {
        const body = composer.trim();
        if (!conversation || (!body && !selectedImages.length) || sending) return;

        setSending(true);
        try {
            const sent = selectedImages.length
                ? await chatService.sendAttachmentMessage(
                      conversation.id,
                      body,
                      selectedImages.map((item) => item.file)
                  )
                : await chatService.sendMessage(conversation.id, { body });
            setComposer('');
            clearSelectedImages();
            setMessages((prev) => (prev.some((item) => item.id === sent.id) ? prev : [...prev, sent]));
        } catch {
            message.error('Không gửi được tin nhắn');
        } finally {
            setSending(false);
        }
    };

    const handleImageSelect = (files: FileList | null) => {
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
                        <Tag className='context-chat__tag'>Bảo trì</Tag>
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
                                            <BellFilled className='text-blue-600' />
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
                                {messages.map((item) => {
                                    const mine = item.senderId === user?.id;

                                    if (item.system) {
                                        return (
                                            <div key={item.id} className='context-chat__system'>
                                                <span>{item.body}</span>
                                                <Text className='block text-[10px] font-semibold text-slate-400'>
                                                    {formatTime(item.createdAt)}
                                                </Text>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={item.id}
                                            className={`group context-chat__message ${mine ? 'context-chat__message--mine' : ''}`}
                                        >
                                            {!mine ? (
                                                <Avatar
                                                    size={30}
                                                    icon={<UserOutlined />}
                                                    className='context-chat__avatar'
                                                >
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
                                            <div className='context-chat__bubble-wrap'>
                                                {!mine ? (
                                                    <Text className='mb-1 block text-[11px] font-bold text-slate-500'>
                                                        {item.sender?.name || 'Người dùng'}
                                                    </Text>
                                                ) : null}
                                                {item.isDeleted ? (
                                                    <div className='context-chat__bubble !bg-slate-100 !text-slate-400 italic'>
                                                        {item.body}
                                                    </div>
                                                ) : item.body ? (
                                                    <div className='context-chat__bubble'>{item.body}</div>
                                                ) : null}
                                                {item.attachments?.length ? (
                                                    <Image.PreviewGroup>
                                                        <div className='context-chat__attachments'>
                                                            {item.attachments
                                                                .filter((attachment) => attachment.type === 'image')
                                                                .map((attachment) => (
                                                                    <div
                                                                        key={attachment.url}
                                                                        className='context-chat__attachment'
                                                                    >
                                                                        <Image
                                                                            src={attachment.url}
                                                                            alt={attachment.name || 'Ảnh trao đổi'}
                                                                            className='context-chat__attachment-image'
                                                                        />
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </Image.PreviewGroup>
                                                ) : null}
                                                <Text className='mt-1 block text-[10px] font-semibold text-slate-400'>
                                                    {formatTime(item.createdAt)}
                                                </Text>
                                            </div>
                                        </div>
                                    );
                                })}
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

                <div className='context-chat__composer'>
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
                        className='context-chat__attach-button'
                    />
                    <div className='min-w-0 flex-1'>
                        {selectedImages.length ? (
                            <div className='context-chat__selected-images'>
                                {selectedImages.map((item) => (
                                    <div key={item.uid} className='context-chat__selected-image'>
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
                            placeholder='Nhập trao đổi về phiếu bảo trì...'
                            onChange={(event) => setComposer(event.target.value)}
                            onPressEnter={(event) => {
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
                        disabled={(!composer.trim() && !selectedImages.length) || !conversation}
                        onClick={() => void handleSend()}
                        className='context-chat__send'
                    />
                </div>
            </div>
        </Drawer>
    );
};

export default ContextChatDrawer;
