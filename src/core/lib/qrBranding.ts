// Badge "HD" đặt giữa lòng QR (kiểu Zalo): nền trắng bo góc + chữ xanh thương hiệu.
// Vẽ bằng canvas nội bộ ra data URL — không load ảnh ngoài nên canvas QR không bị taint,
// toDataURL() khi xuất PDF/PNG vẫn hoạt động bình thường.

// QR giữ đen trắng thuần — badge cũng mono để không "màu mè", thương hiệu nằm ở chữ HD
const BADGE_SIZE = 240;
const BADGE_RADIUS = 56;
const BRAND_COLOR = '#111111';

let cachedIcon: string | null = null;

export const getHdQrIcon = (): string => {
    if (cachedIcon) return cachedIcon;
    if (typeof document === 'undefined') return '';

    const canvas = document.createElement('canvas');
    canvas.width = BADGE_SIZE;
    canvas.height = BADGE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(0, 0, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
        ctx.fill();
    } else {
        ctx.fillRect(0, 0, BADGE_SIZE, BADGE_SIZE);
    }

    ctx.fillStyle = BRAND_COLOR;
    ctx.font = '900 116px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HD', BADGE_SIZE / 2, BADGE_SIZE / 2 + 8);

    cachedIcon = canvas.toDataURL('image/png');
    return cachedIcon;
};
