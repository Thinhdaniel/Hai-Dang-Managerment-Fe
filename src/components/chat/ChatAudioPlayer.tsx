import React, { useRef, useState } from 'react';
import { AudioOutlined, PauseCircleFilled, PlayCircleFilled } from '@ant-design/icons';
import { formatVoiceDuration } from '../../core/lib/chatMedia';

type ChatAudioPlayerProps = {
    url: string;
    durationMs?: number;
    name?: string;
    className?: string;
};

const WAVE_BARS = [34, 48, 66, 44, 78, 56, 38, 70, 52, 62, 42, 74, 50, 36];

const ChatAudioPlayer: React.FC<ChatAudioPlayerProps> = ({ url, durationMs, name, className }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentMs, setCurrentMs] = useState(0);
    const [metadataDurationMs, setMetadataDurationMs] = useState<number | undefined>(undefined);

    const effectiveDurationMs = durationMs || metadataDurationMs || 0;
    const progress = effectiveDurationMs ? Math.min(100, (currentMs / effectiveDurationMs) * 100) : 0;

    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (playing) {
            audio.pause();
            setPlaying(false);
            return;
        }

        try {
            await audio.play();
            setPlaying(true);
        } catch {
            setPlaying(false);
        }
    };

    return (
        <div className={`chat-audio-player ${playing ? 'chat-audio-player--playing' : ''} ${className ?? ''}`}>
            <button
                type='button'
                className='chat-audio-player__control'
                aria-label={playing ? 'Tạm dừng ghi âm' : 'Phát ghi âm'}
                onClick={togglePlay}
            >
                {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
            </button>
            <div className='chat-audio-player__body'>
                <div className='chat-audio-player__top'>
                    <span className='chat-audio-player__label'>
                        <AudioOutlined />
                        Ghi âm
                    </span>
                    <span className='chat-audio-player__duration'>
                        {formatVoiceDuration(playing ? currentMs : effectiveDurationMs)}
                    </span>
                </div>
                <div className='chat-audio-player__wave' aria-hidden='true'>
                    {WAVE_BARS.map((height, index) => (
                        <span
                            key={`${height}-${index}`}
                            style={{
                                height: `${height}%`,
                                animationDelay: `${index * 70}ms`,
                            }}
                        />
                    ))}
                    <i style={{ width: `${progress}%` }} />
                </div>
                {name ? <span className='chat-audio-player__name'>{name}</span> : null}
            </div>
            <audio
                ref={audioRef}
                src={url}
                preload='metadata'
                onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration;
                    if (Number.isFinite(duration) && duration > 0) {
                        setMetadataDurationMs(Math.round(duration * 1000));
                    }
                }}
                onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                    setPlaying(false);
                    setCurrentMs(0);
                    if (audioRef.current) audioRef.current.currentTime = 0;
                }}
            />
        </div>
    );
};

export default ChatAudioPlayer;
