import React, { useEffect, useRef, useState } from 'react';
import { AudioOutlined, CloseOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import {
    formatVoiceDuration,
    getSupportedChatAudioMimeType,
    getVoiceFileExtension,
} from '../../core/lib/chatMedia';

export type ChatVoiceNoteDraft = {
    uid: string;
    file: File;
    previewUrl: string;
    durationMs: number;
    mimeType: string;
    size: number;
};

type VoiceRecorderButtonProps = {
    disabled?: boolean;
    onRecorded: (draft: ChatVoiceNoteDraft) => void;
    className?: string;
    maxDurationMs?: number;
};

const MIN_VOICE_DURATION_MS = 700;
const MAX_VOICE_SIZE = 15 * 1024 * 1024;

const VoiceRecorderButton: React.FC<VoiceRecorderButtonProps> = ({
    disabled,
    onRecorded,
    className,
    maxDurationMs = 2 * 60 * 1000,
}) => {
    const { message } = App.useApp();
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const timerRef = useRef<number | undefined>(undefined);
    const cancelledRef = useRef(false);
    const [recording, setRecording] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);

    const stopTimer = () => {
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = undefined;
        }
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    const stopRecording = () => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
            return;
        }

        stopTimer();
        stopStream();
        setRecording(false);
    };

    const cancelRecording = () => {
        cancelledRef.current = true;
        stopRecording();
    };

    const startRecording = async () => {
        if (disabled || recording) return;

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            message.warning('Thiết bị này chưa hỗ trợ ghi âm trực tiếp trong trình duyệt');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMimeType = getSupportedChatAudioMimeType();
            const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);

            streamRef.current = stream;
            recorderRef.current = recorder;
            chunksRef.current = [];
            cancelledRef.current = false;
            startedAtRef.current = Date.now();

            recorder.ondataavailable = (event) => {
                if (event.data?.size) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
                stopTimer();
                stopStream();
                setRecording(false);

                if (cancelledRef.current) {
                    chunksRef.current = [];
                    return;
                }

                const durationMs = Math.max(0, Date.now() - startedAtRef.current);
                const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: mimeType });
                chunksRef.current = [];

                if (durationMs < MIN_VOICE_DURATION_MS || !blob.size) {
                    message.warning('Ghi âm quá ngắn');
                    return;
                }

                if (blob.size > MAX_VOICE_SIZE) {
                    message.warning('Ghi âm vượt quá 15MB');
                    return;
                }

                const extension = getVoiceFileExtension(mimeType);
                const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
                    type: mimeType,
                    lastModified: Date.now(),
                });
                onRecorded({
                    uid: `${Date.now()}-${Math.random()}`,
                    file,
                    previewUrl: URL.createObjectURL(file),
                    durationMs,
                    mimeType,
                    size: file.size,
                });
            };

            recorder.start(250);
            setElapsedMs(0);
            setRecording(true);
            timerRef.current = window.setInterval(() => {
                const nextElapsed = Date.now() - startedAtRef.current;
                setElapsedMs(nextElapsed);
                if (nextElapsed >= maxDurationMs && recorder.state === 'recording') {
                    recorder.stop();
                }
            }, 200);
        } catch {
            stopTimer();
            stopStream();
            setRecording(false);
            message.error('Không thể mở micro. Kiểm tra quyền micro hoặc HTTPS trên thiết bị');
        }
    };

    useEffect(
        () => () => {
            cancelledRef.current = true;
            stopRecording();
        },
        []
    );

    if (recording) {
        return (
            <div className={`chat-voice-recording ${className ?? ''}`}>
                <span className='chat-voice-recording__pulse' />
                <span className='chat-voice-recording__time'>{formatVoiceDuration(elapsedMs)}</span>
                <Tooltip title='Hủy ghi âm'>
                    <Button
                        type='text'
                        size='small'
                        icon={<CloseOutlined />}
                        onClick={cancelRecording}
                        className='chat-voice-recording__cancel'
                    />
                </Tooltip>
                <Button
                    type='primary'
                    size='small'
                    icon={<StopOutlined />}
                    onClick={stopRecording}
                    className='chat-voice-recording__stop'
                >
                    Xong
                </Button>
            </div>
        );
    }

    return (
        <Tooltip title='Ghi âm nhanh'>
            <Button
                icon={<AudioOutlined />}
                onClick={startRecording}
                disabled={disabled}
                className={`chat-voice-button ${className ?? ''}`}
            />
        </Tooltip>
    );
};

export default VoiceRecorderButton;
