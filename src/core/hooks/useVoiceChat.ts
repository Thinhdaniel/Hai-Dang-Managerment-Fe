import { useCallback, useEffect, useRef, useState } from 'react';

// Voice chat cho trợ lý — dùng Web Speech API có sẵn trong trình duyệt:
//  - SpeechRecognition (nói → chữ, tiếng Việt vi-VN): Chrome/Edge/Android. Firefox/iOS Safari hạn chế.
//  - SpeechSynthesis (đọc câu trả lời): hỗ trợ rộng (gồm iOS), giọng Việt tuỳ máy.
// Hoàn toàn miễn phí, không cần backend / API key.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionLike = any;

const getRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

// "Phong cách" đọc = cặp tốc độ/cao độ; kết hợp với việc chọn giọng nam/nữ thực tế của máy.
export type VoiceStyleKey = 'professional' | 'gentle' | 'warm' | 'sexy' | 'energetic';
export const VOICE_STYLES: Record<VoiceStyleKey, { label: string; rate: number; pitch: number }> = {
    professional: { label: 'Chuyên nghiệp', rate: 1.0, pitch: 1.0 },
    gentle: { label: 'Nữ tính · nhẹ nhàng', rate: 0.98, pitch: 1.2 },
    warm: { label: 'Nam tính · trầm ấm', rate: 0.96, pitch: 0.8 },
    sexy: { label: 'Truyền cảm · gợi cảm', rate: 0.88, pitch: 0.92 },
    energetic: { label: 'Năng động · nhanh', rate: 1.18, pitch: 1.06 },
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

    const stopSpeaking = useCallback(() => {
        if (!ttsSupported) return;
        window.speechSynthesis.cancel();
        setSpeaking(false);
    }, [ttsSupported]);

    const speak = useCallback(
        (text: string, opts: SpeakOptions = {}) => {
            const clean = cleanForSpeech(text);
            if (!ttsSupported || !clean) return;
            const synth = window.speechSynthesis;
            synth.cancel(); // ngắt câu đang đọc (nếu có)

            const u = new SpeechSynthesisUtterance(clean);
            const all = synth.getVoices();
            const chosen =
                (opts.voiceURI && all.find((v) => v.voiceURI === opts.voiceURI)) ||
                all.find((v) => v.lang?.toLowerCase().startsWith('vi'));
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
        stopSpeaking,
    };
};
