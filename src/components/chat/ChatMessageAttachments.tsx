import React from 'react';
import { Image } from 'antd';
import type { ChatMessage } from '../../core/types';
import ChatAudioPlayer from './ChatAudioPlayer';

type ChatAttachment = NonNullable<ChatMessage['attachments']>[number];

type ChatMessageAttachmentsProps = {
    attachments?: ChatAttachment[];
    variant: 'chat-page' | 'context-chat';
};

const ChatMessageAttachments: React.FC<ChatMessageAttachmentsProps> = ({ attachments, variant }) => {
    if (!attachments?.length) return null;

    const imageAttachments = attachments.filter((attachment) => attachment.type === 'image');
    const audioAttachments = attachments.filter((attachment) => attachment.type === 'audio');

    if (!imageAttachments.length && !audioAttachments.length) return null;

    return (
        <>
            {imageAttachments.length ? (
                <Image.PreviewGroup>
                    <div className={`${variant}__attachments`}>
                        {imageAttachments.map((attachment) => (
                            <div key={attachment.url} className={`${variant}__attachment`}>
                                <Image
                                    src={attachment.thumbnailUrl || attachment.url}
                                    preview={{ src: attachment.url }}
                                    alt={attachment.name || 'Ảnh trao đổi'}
                                    className={`${variant}__attachment-image`}
                                />
                            </div>
                        ))}
                    </div>
                </Image.PreviewGroup>
            ) : null}
            {audioAttachments.length ? (
                <div className={`${variant}__audio-list`}>
                    {audioAttachments.map((attachment) => (
                        <ChatAudioPlayer
                            key={attachment.url}
                            url={attachment.url}
                            durationMs={attachment.durationMs}
                            name={attachment.name}
                        />
                    ))}
                </div>
            ) : null}
        </>
    );
};

export default ChatMessageAttachments;
