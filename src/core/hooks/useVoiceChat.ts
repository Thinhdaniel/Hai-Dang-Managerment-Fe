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

interface StartHandlers {
    onInterim?: (text: string) => void; // chữ tạm (cập nhật liên tục khi đang nói)
    onFinal?: (text: string) => void; // chữ chốt (khi nói xong)
}

export const useVoiceChat = () => {
    const recognitionSupported = !!getRecognitionCtor();
    const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    const recRef = useRef<SpeechRecognitionLike | null>(null);
    const finalRef = useRef('');
    const handlersRef = useRef<StartHandlers>({});

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
                let interim = '';
                let final = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const t = e.results[i][0]?.transcript ?? '';
                    if (e.results[i].isFinal) final += t;
                    else interim += t;
                }
                if (final) finalRef.current += final;
                const live = (finalRef.current + interim).trim();
                handlersRef.current.onInterim?.(live);
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
        (text: string) => {
            const clean = (text || '').trim();
            if (!ttsSupported || !clean) return;
            const synth = window.speechSynthesis;
            synth.cancel(); // ngắt câu đang đọc (nếu có) trước khi đọc câu mới
            const u = new SpeechSynthesisUtterance(clean);
            u.lang = 'vi-VN';
            u.rate = 1.05;
            const vi = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
            if (vi) u.voice = vi;
            u.onstart = () => setSpeaking(true);
            u.onend = () => setSpeaking(false);
            u.onerror = () => setSpeaking(false);
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

    return {
        recognitionSupported,
        ttsSupported,
        listening,
        speaking,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
    };
};
