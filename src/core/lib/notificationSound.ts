// Chuông báo khi có thông báo mới (Web Audio API - không cần file âm thanh).
// Hỗ trợ nhiều kiểu chuông có sẵn, người dùng chọn trong panel thông báo.
const ENABLED_KEY = 'notification_sound_enabled';
const SOUND_ID_KEY = 'notification_sound_id';
const MIN_INTERVAL_MS = 1200; // chống phát chồng khi nhiều thông báo tới dồn

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

type AudioContextCtor = typeof AudioContext;

const getAudioContextCtor = (): AudioContextCtor | undefined =>
    (window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number };

// Một preset chuông = danh sách nốt phát tuần tự/chồng nhau.
type SoundPreset = { id: string; label: string; notes: Note[] };

export const NOTIFICATION_SOUNDS: SoundPreset[] = [
    {
        id: 'chime',
        label: 'Ting nhẹ',
        notes: [
            { freq: 880, at: 0, dur: 0.35 },
            { freq: 1174.66, at: 0.12, dur: 0.35 },
        ],
    },
    {
        id: 'dingdong',
        label: 'Ding-dong',
        notes: [
            { freq: 1318.51, at: 0, dur: 0.45 },
            { freq: 987.77, at: 0.2, dur: 0.55 },
        ],
    },
    {
        id: 'bell',
        label: 'Chuông ngân',
        notes: [
            { freq: 784, at: 0, dur: 0.9, gain: 0.18 },
            { freq: 1568, at: 0, dur: 0.7, gain: 0.05 },
        ],
    },
    {
        id: 'pop',
        label: 'Pop ngắn',
        notes: [{ freq: 660, at: 0, dur: 0.14, type: 'triangle', gain: 0.22 }],
    },
    {
        id: 'alert',
        label: 'Báo gấp (3 tiếng)',
        notes: [
            { freq: 920, at: 0, dur: 0.1, type: 'triangle', gain: 0.16 },
            { freq: 920, at: 0.16, dur: 0.1, type: 'triangle', gain: 0.16 },
            { freq: 920, at: 0.32, dur: 0.1, type: 'triangle', gain: 0.16 },
        ],
    },
];

const DEFAULT_SOUND_ID = 'chime';

const findPreset = (id: string) => NOTIFICATION_SOUNDS.find((sound) => sound.id === id) ?? NOTIFICATION_SOUNDS[0];

export const isNotificationSoundEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ENABLED_KEY) !== 'false'; // mặc định bật
};

export const setNotificationSoundEnabled = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
};

export const getNotificationSoundId = (): string => {
    if (typeof window === 'undefined') return DEFAULT_SOUND_ID;
    const stored = window.localStorage.getItem(SOUND_ID_KEY);
    return stored && NOTIFICATION_SOUNDS.some((sound) => sound.id === stored) ? stored : DEFAULT_SOUND_ID;
};

export const setNotificationSoundId = (id: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SOUND_ID_KEY, id);
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

const playPreset = (ctx: AudioContext, preset: SoundPreset) => {
    const now = ctx.currentTime;
    preset.notes.forEach(({ freq, at, dur, type = 'sine', gain = 0.16 }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, now + at);
        gainNode.gain.linearRampToValueAtTime(gain, now + at + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
        osc.connect(gainNode).connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + dur + 0.05);
    });
};

// iOS chỉ cho resume AudioContext bên trong cử chỉ người dùng, và đình chỉ lại context
// mỗi lần app xuống nền — nên phải gắn lại listener mở khoá mỗi khi context bị treo,
// không phải chỉ một lần lúc khởi động.
let unlockArmed = false;

const armUnlock = () => {
    if (unlockArmed || typeof window === 'undefined') return;
    unlockArmed = true;

    const unlock = () => {
        unlockArmed = false;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        const ctx = ensureContext();
        if (ctx && ctx.state !== 'running') {
            void ctx.resume().catch(() => undefined);
        }
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
};

// Phát chuông; force=true để nghe thử (bỏ qua throttle). soundId để nghe thử một kiểu cụ thể.
export const playNotificationSound = (options?: { force?: boolean; soundId?: string }) => {
    if (!isNotificationSoundEnabled()) return;

    const now = Date.now();
    if (!options?.force && now - lastPlayedAt < MIN_INTERVAL_MS) return;
    lastPlayedAt = now;

    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') armUnlock();
    try {
        playPreset(ctx, findPreset(options?.soundId ?? getNotificationSoundId()));
    } catch {
        // Bỏ qua nếu trình duyệt chặn (chưa có tương tác người dùng)
    }
};

// Mở khoá audio theo autoplay policy — gọi 1 lần lúc app khởi động.
export const primeNotificationSound = () => {
    if (typeof window === 'undefined') return;
    armUnlock();

    // Quay lại app từ nền: thử resume ngay; nếu trình duyệt không cho (iOS) thì chờ cú chạm kế tiếp
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !audioContext) return;
        if (audioContext.state !== 'running') {
            void audioContext.resume().catch(() => undefined);
            armUnlock();
        }
    });
};
