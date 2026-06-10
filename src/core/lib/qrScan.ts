import { qrLabelService } from '../services/qr-label.service';
import { assetService } from '../services/asset.service';
import type { Asset } from '../types';

// QR tem máy mã hóa link dạng /public/machines/{publicId} hoặc /qr/{publicId};
// cũng chấp nhận mã máy / ID tem thô (khi nhập tay).
export const extractPublicId = (rawValue: string): string => {
    const value = rawValue.trim();
    try {
        const url = new URL(value);
        const segments = url.pathname.split('/').filter(Boolean);
        const anchorIndex = segments.findIndex((seg) => seg === 'machines' || seg === 'qr');
        const candidate = anchorIndex >= 0 ? segments[anchorIndex + 1] : segments[segments.length - 1];
        if (candidate) return candidate.trim();
    } catch {
        // Không phải URL -> dùng nguyên văn
    }
    return value;
};

export type ScanResolveResult = { asset: Asset | null; ambiguous: boolean };

// Resolve một mã quét/nhập về đúng một Asset nội bộ.
// Ưu tiên tem QR; nếu không phải tem thì tìm theo mã máy/tên (chỉ nhận khi đúng 1 kết quả).
export const resolveAssetByScan = async (rawValue: string): Promise<ScanResolveResult> => {
    const publicId = extractPublicId(rawValue);
    try {
        const resolved = await qrLabelService.resolveInternal(publicId);
        if (resolved.asset?.id) return { asset: resolved.asset, ambiguous: false };
    } catch {
        // Không phải tem QR hợp lệ -> thử tìm theo mã máy / tên
    }
    try {
        const res = await assetService.getAll({ search: rawValue.trim(), page: 1, limit: 2 });
        if (res.data.length === 1) return { asset: res.data[0], ambiguous: false };
        if (res.data.length > 1) return { asset: null, ambiguous: true };
    } catch {
        // bỏ qua
    }
    return { asset: null, ambiguous: false };
};
