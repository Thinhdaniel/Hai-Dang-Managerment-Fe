// Chuông báo khi có thông báo mới (Web Audio API - không cần file âm thanh).
const STORAGE_KEY = 'notification_sound_enabled';
const MIN_INTERVAL_MS = 1200; // chống phát chồng khi nhiều thông báo tới dồn

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

type AudioContextCtor = typeof AudioContext;

const getAudioContextCtor = (): AudioContextCtor | undefined =>
    (window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

export const isNotificationSoundEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) !== 'false'; // mặc định bật
};

export const setNotificationSoundEnabled = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
};

const ensureContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioContext) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) return null;
        audioContext = new Ctor();
    }
    if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => undefined);
    }
    return audioContext;
};

// Chime 2 nốt nhẹ nhàng (A5 -> D6)
const playChime = (ctx: AudioContext) => {
    const now = ctx.currentTime;
    const notes = [
        { freq: 880, at: 0 },
        { freq: 1174.66, at: 0.12 },
    ];

    notes.forEach(({ freq, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + at);
        gain.gain.linearRampToValueAtTime(0.16, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.4);
    });
};

// Phát chuông; force=true để nghe thử (bỏ qua throttle nhưng vẫn theo cài đặt bật/tắt)
export const playNotificationSound = (options?: { force?: boolean }) => {
    if (!isNotificationSoundEnabled()) return;

    const now = Date.now();
    if (!options?.force && now - lastPlayedAt < MIN_INTERVAL_MS) return;
    lastPlayedAt = now;

    const ctx = ensureContext();
    if (!ctx) return;
    try {
        playChime(ctx);
    } catch {
        // Bỏ qua nếu trình duyệt chặn (chưa có tương tác người dùng)
    }
};

// Mở khoá audio sau tương tác đầu tiên (autoplay policy) — gọi 1 lần lúc app khởi động.
export const primeNotificationSound = () => {
    if (typeof window === 'undefined') return;
    const unlock = () => {
        ensureContext();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
};
