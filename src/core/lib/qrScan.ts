import { qrLabelService } from '../services/qr-label.service';
import { assetService } from '../services/asset.service';
import type { Asset, QrScanSource } from '../types';

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

export type ScanResolveResult = {
    asset: Asset | null;
    ambiguous: boolean;
    publicId?: string;
    labelId?: string;
    source: QrScanSource;
    /** Tem QR tồn tại nhưng đã bị thay thế/thu hồi (retired/lost/damaged) — không trỏ về máy nào nữa. */
    inactiveLabelStatus?: string;
};

// Resolve một mã quét/nhập về đúng một Asset nội bộ.
// Ưu tiên tem QR; nếu không phải tem thì tìm theo mã máy/tên (chỉ nhận khi đúng 1 kết quả).
export const resolveAssetByScan = async (rawValue: string): Promise<ScanResolveResult> => {
    const publicId = extractPublicId(rawValue);
    try {
        const resolved = await qrLabelService.resolveInternal(publicId);
        if (resolved.asset?.id) {
            return {
                asset: resolved.asset,
                ambiguous: false,
                publicId: resolved.publicId,
                labelId: resolved.label?.id,
                source: resolved.source,
            };
        }
        // Tem có thật nhưng đã bị thay thế/thu hồi -> dừng hẳn, không rơi xuống search
        // (tránh 2 tem khác nhau resolve về cùng 1 máy như bug quét trùng ở thanh lý)
        if (resolved.source === 'qr_label' && resolved.status && !['assigned', 'unused'].includes(resolved.status)) {
            return {
                asset: null,
                ambiguous: false,
                publicId: resolved.publicId,
                labelId: resolved.label?.id,
                source: resolved.source,
                inactiveLabelStatus: resolved.status,
            };
        }
    } catch {
        // Không phải tem QR hợp lệ -> thử tìm theo mã máy / tên
    }
    try {
        const res = await assetService.getAll({ search: rawValue.trim(), page: 1, limit: 2 });
        if (res.data.length === 1) return { asset: res.data[0], ambiguous: false, source: 'search' };
        if (res.data.length > 1) return { asset: null, ambiguous: true, publicId, source: 'search' };
    } catch {
        // bỏ qua
    }
    return { asset: null, ambiguous: false, publicId, source: 'unknown' };
};
