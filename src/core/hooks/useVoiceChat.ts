import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredAccessToken } from '../lib/auth-session';

// Voice chat cho trợ lý:
//  - SpeechRecognition (nói → chữ, tiếng Việt vi-VN): Chrome/Edge/Android. Firefox/iOS Safari hạn chế.
//  - Đọc câu trả lời: ưu tiên GIỌNG NEURAL (Edge TTS qua backend /ai/tts) — tự nhiên như CapCut;
//    nếu lỗi thì fallback SpeechSynthesis của trình duyệt. Miễn phí, không cần API key.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Giọng neural tiếng Việt của Microsoft Edge (chính là giọng CapCut dùng).
export const NEURAL_VOICES: { id: string; label: string }[] = [
    { id: 'vi-VN-HoaiMyNeural', label: 'HoaiMy · Nữ trẻ (tự nhiên)' },
    { id: 'vi-VN-NamMinhNeural', label: 'NamMinh · Nam' },
];
export const DEFAULT_NEURAL_VOICE = 'vi-VN-HoaiMyNeural';

// Đổi hệ số (1.18) -> chuỗi prosody SSML ("+18%") cho Edge TTS.
const toEdgePct = (n: number) => `${n >= 1 ? '+' : ''}${Math.round((n - 1) * 100)}%`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionLike = any;

const getRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

// "Phong cách" đọc = cặp tốc độ/cao độ; kết hợp với việc chọn giọng nam/nữ thực tế của máy.
// Velvet tạo cảm giác mềm, chậm, có màu hơn nhưng vẫn đủ sạch cho app nội bộ công ty.
export type VoiceStyleKey = 'review' | 'professional' | 'gentle' | 'warm' | 'velvet' | 'anime' | 'energetic';
export const VOICE_STYLES: Record<VoiceStyleKey, { label: string; rate: number; pitch: number }> = {
    // "Review TikTok": rõ, hơi nhanh nhưng VẪN nghỉ ngắt đúng (không rượt như energetic).
    review: { label: 'Review · chuyên nghiệp (mặc định)', rate: 1.06, pitch: 1.0 },
    velvet: { label: 'Velvet · quyến rũ nhẹ', rate: 0.92, pitch: 1.05 },
    anime: { label: 'Anime cute · vui tai', rate: 1.08, pitch: 1.18 },
    energetic: { label: 'Năng động · nhanh', rate: 1.15, pitch: 1.08 },
    gentle: { label: 'Nhẹ nhàng', rate: 0.98, pitch: 1.1 },
    professional: { label: 'Chuyên nghiệp · chuẩn', rate: 1.0, pitch: 1.0 },
    warm: { label: 'Trầm ấm', rate: 0.96, pitch: 0.9 },
};

export const normalizeVoiceStyle = (value?: string | null): VoiceStyleKey => {
    if (value === 'sexy') return 'velvet'; // legacy localStorage key from older builds.
    return value && value in VOICE_STYLES ? (value as VoiceStyleKey) : 'review';
};

export type SpeakOptions = { voiceURI?: string; rate?: number; pitch?: number };

interface StartHandlers {
    onInterim?: (text: string) => void; // chữ tạm (cập nhật liên tục khi đang nói)
    onFinal?: (text: string) => void; // chữ chốt (khi nói xong)
}

// Bỏ markdown/emoji để đọc cho tự nhiên (không đọc dấu * # và icon).
const cleanForSpeech = (t: string) =>
    (t || '')
        .replace(/[*_`#>~|]/g, ' ')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

export const useVoiceChat = () => {
    const recognitionSupported = !!getRecognitionCtor();
    const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    const recRef = useRef<SpeechRecognitionLike | null>(null);
    const finalRef = useRef('');
    const handlersRef = useRef<StartHandlers>({});
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playTokenRef = useRef(0); // tăng mỗi lần stop -> huỷ vòng đọc theo câu đang chạy

    // Nạp danh sách giọng (getVoices() có thể rỗng lần đầu -> đợi onvoiceschanged).
    useEffect(() => {
        if (!ttsSupported) return;
        const load = () => {
            const list = window.speechSynthesis.getVoices();
            if (list.length) setVoices(list);
        };
        load();
        window.speechSynthesis.addEventListener('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
    }, [ttsSupported]);

    const stopListening = useCallback(() => {
        try {
            recRef.current?.stop();
        } catch {
            /* noop */
        }
    }, []);

    const startListening = useCallback(
        (handlers: StartHandlers) => {
            const Ctor = getRecognitionCtor();
            if (!Ctor || listening) return;

            const rec: SpeechRecognitionLike = new Ctor();
            rec.lang = 'vi-VN';
            rec.interimResults = true;
            rec.continuous = false;
            rec.maxAlternatives = 1;
            recRef.current = rec;
            finalRef.current = '';
            handlersRef.current = handlers;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rec.onresult = (e: any) => {
                // Dựng lại TOÀN BỘ transcript từ đầu mỗi sự kiện (KHÔNG cộng dồn) -> tránh lặp chữ/câu.
                let interim = '';
                let final = '';
                for (let i = 0; i < e.results.length; i += 1) {
                    const t = e.results[i][0]?.transcript ?? '';
                    if (e.results[i].isFinal) final += t;
                    else interim += t;
                }
                finalRef.current = final.trim();
                handlersRef.current.onInterim?.((final + interim).trim());
            };
            rec.onerror = () => setListening(false);
            rec.onend = () => {
                setListening(false);
                const result = finalRef.current.trim();
                if (result) handlersRef.current.onFinal?.(result);
            };

            try {
                rec.start();
                setListening(true);
            } catch {
                setListening(false);
            }
        },
        [listening]
    );

    const stopNeural = useCallback(() => {
        try {
            audioRef.current?.pause();
        } catch {
            /* noop */
        }
        audioRef.current = null;
    }, []);

    const stopSpeaking = useCallback(() => {
        playTokenRef.current += 1; // huỷ vòng đọc-theo-câu đang chạy
        stopNeural();
        if (ttsSupported) window.speechSynthesis.cancel();
        setSpeaking(false);
    }, [ttsSupported, stopNeural]);

    // Đọc bằng GIỌNG NEURAL qua backend. Trả về true nếu phát được, false để nơi gọi fallback.
    // Để có tiếng NGAY (không chờ tạo xong cả file), text được CẮT THEO CÂU: sinh+phát câu đầu
    // trong khi prefetch câu kế tiếp -> độ trễ ban đầu chỉ bằng thời gian tạo 1 câu.
    const speakNeural = useCallback(
        async (text: string, opts: { voice?: string; rate?: number; pitch?: number } = {}): Promise<boolean> => {
            const raw = (text || '').trim();
            if (!raw) return false;

            stopSpeaking();
            const myToken = (playTokenRef.current += 1);
            const voice = opts.voice || DEFAULT_NEURAL_VOICE;
            const rate = toEdgePct(opts.rate ?? 1);
            const pitch = toEdgePct(opts.pitch ?? 1);

            // Tách theo câu rồi gộp các mẩu ngắn (~90 ký tự) để không quá vụn nhưng vẫn nhanh.
            const splitForSpeech = (t: string): string[] => {
                const parts = t.split(/(?<=[.!?…:])\s+/);
                const out: string[] = [];
                let cur = '';
                for (const p of parts) {
                    cur = cur ? `${cur} ${p}` : p;
                    if (cur.length >= 90) {
                        out.push(cur);
                        cur = '';
                    }
                }
                if (cur.trim()) out.push(cur);
                return out.length ? out : [t];
            };

            // Gọi backend tạo audio cho 1 mẩu text. Trả Blob hoặc null nếu lỗi.
            const fetchChunk = async (chunk: string): Promise<Blob | null> => {
                try {
                    const token = getStoredAccessToken();
                    const resp = await fetch(`${API_BASE_URL}/ai/tts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        credentials: 'include',
                        body: JSON.stringify({ text: chunk, voice, rate, pitch }),
                    });
                    if (!resp.ok) return null;
                    const blob = await resp.blob();
                    return blob.size ? blob : null;
                } catch {
                    return null;
                }
            };

            // Phát 1 blob, resolve khi xong (hoặc bị huỷ/lỗi).
            const playBlob = (blob: Blob): Promise<void> =>
                new Promise<void>((resolve) => {
                    if (myToken !== playTokenRef.current) return resolve();
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    audioRef.current = audio;
                    audio.onplay = () => setSpeaking(true);
                    audio.onended = () => {
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    audio.onerror = () => {
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    audio.play().catch(() => resolve());
                });

            const chunks = splitForSpeech(raw);
            try {
                let nextBlob = fetchChunk(chunks[0]); // prefetch câu đầu
                let okAny = false;
                for (let i = 0; i < chunks.length; i += 1) {
                    if (myToken !== playTokenRef.current) return okAny; // bị stop
                    const blob = await nextBlob;
                    // bắt đầu prefetch câu kế tiếp NGAY trong lúc phát câu hiện tại
                    nextBlob = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : Promise.resolve(null);
                    if (!blob) {
                        if (!okAny && i === 0) return false; // câu đầu lỗi -> để nơi gọi fallback
                        continue;
                    }
                    if (myToken !== playTokenRef.current) return okAny;
                    okAny = true;
                    await playBlob(blob);
                }
                if (myToken === playTokenRef.current) setSpeaking(false);
                return okAny;
            } catch {
                setSpeaking(false);
                return false;
            }
        },
        [stopSpeaking]
    );

    const speak = useCallback(
        (text: string, opts: SpeakOptions = {}) => {
            const clean = cleanForSpeech(text);
            if (!ttsSupported || !clean) return;
            const synth = window.speechSynthesis;
            synth.cancel(); // ngắt câu đang đọc (nếu có)

            const u = new SpeechSynthesisUtterance(clean);
            const all = synth.getVoices();
            const vi = all.filter((v) => v.lang?.toLowerCase().startsWith('vi'));
            // Tự động: ưu tiên giọng NỮ tiếng Việt (trẻ/tự nhiên hơn) nếu có.
            const autoVi = vi.find((v) => /female|nữ|hoaimy|hoai my|\bmy\b|linh|lan|huong|mai|thu/i.test(v.name)) || vi[0];
            const chosen = (opts.voiceURI && all.find((v) => v.voiceURI === opts.voiceURI)) || autoVi;
            if (chosen) {
                u.voice = chosen;
                u.lang = chosen.lang;
            } else {
                u.lang = 'vi-VN';
            }
            u.rate = opts.rate ?? 1.0;
            u.pitch = opts.pitch ?? 1.0;
            u.onstart = () => setSpeaking(true);
            u.onend = () => setSpeaking(false);
            u.onerror = () => setSpeaking(false);

            // Chrome đôi khi kẹt trạng thái "pause" ngầm -> resume trước khi nói cho chắc.
            try {
                synth.resume();
            } catch {
                /* noop */
            }
            synth.speak(u);
        },
        [ttsSupported]
    );

    // Dọn dẹp khi unmount: dừng nhận giọng + ngắt đọc.
    useEffect(
        () => () => {
            try {
                recRef.current?.abort?.();
            } catch {
                /* noop */
            }
            try {
                audioRef.current?.pause();
            } catch {
                /* noop */
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        },
        []
    );

    // Lọc giọng tiếng Việt lên đầu (nếu có), kèm toàn bộ để người dùng tự chọn.
    const vietnameseVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('vi'));

    return {
        recognitionSupported,
        ttsSupported,
        listening,
        speaking,
        voices,
        vietnameseVoices,
        startListening,
        stopListening,
        speak,
        speakNeural,
        stopSpeaking,
    };
};
