export const CHAT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const CHAT_AUDIO_MIME_TYPES = [
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/aac',
    'audio/x-m4a',
] as const;

const CHAT_IMAGE_MAX_EDGE = 1600;
const CHAT_IMAGE_QUALITY = 0.82;
const CHAT_IMAGE_COMPRESS_THRESHOLD = 900 * 1024;

const AUDIO_MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/aac',
];

const replaceExtension = (name: string, nextExtension: string) => {
    const base = name.replace(/\.[^.]+$/, '') || 'chat-image';
    return `${base}.${nextExtension}`;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const sourceUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(sourceUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(sourceUrl);
            reject(new Error('Không đọc được ảnh'));
        };

        image.src = sourceUrl;
    });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export const compressChatImage = async (file: File): Promise<File> => {
    if (!CHAT_IMAGE_MIME_TYPES.includes(file.type as (typeof CHAT_IMAGE_MIME_TYPES)[number])) {
        return file;
    }

    if (typeof document === 'undefined') {
        return file;
    }

    const image = await loadImage(file);
    const largestEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const shouldResize = largestEdge > CHAT_IMAGE_MAX_EDGE;
    const shouldCompress = file.size > CHAT_IMAGE_COMPRESS_THRESHOLD || shouldResize;

    if (!shouldCompress) {
        return file;
    }

    const scale = shouldResize ? CHAT_IMAGE_MAX_EDGE / largestEdge : 1;
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
        return file;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, 'image/jpeg', CHAT_IMAGE_QUALITY);
    if (!blob || (blob.size >= file.size && file.type !== 'image/png')) {
        return file;
    }

    return new File([blob], replaceExtension(file.name, 'jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
    });
};

export const formatVoiceDuration = (durationMs?: number) => {
    const totalSeconds = Math.max(0, Math.round((durationMs ?? 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getSupportedChatAudioMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return '';
    }

    return AUDIO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
};

export const getVoiceFileExtension = (mimeType: string) => {
    if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) return 'm4a';
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm';
};
