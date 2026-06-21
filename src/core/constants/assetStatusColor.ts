import { AssetStatus } from '../types';

// Màu hex + nhãn theo trạng thái máy — dùng cho marker SVG trên bản đồ (Tailwind class không áp được vào divIcon).
// Tông màu khớp với statusMeta ở AssetList (dot color) để đồng nhất toàn hệ thống.
export const ASSET_STATUS_COLOR: Record<AssetStatus, { color: string; label: string }> = {
    [AssetStatus.PENDING_DISPOSAL]: { color: '#f97316', label: 'Chuẩn bị thanh lý' },
    [AssetStatus.DISPOSED]: { color: '#475569', label: 'Đã thanh lý' },
    [AssetStatus.ACTIVE]: { color: '#10b981', label: 'Hoạt động' },
    [AssetStatus.MAINTENANCE]: { color: '#f59e0b', label: 'Bảo trì' },
    [AssetStatus.BROKEN]: { color: '#f43f5e', label: 'Lỗi' },
    [AssetStatus.BORROWING]: { color: '#6366f1', label: 'Đang mượn' },
    [AssetStatus.STORAGE]: { color: '#64748b', label: 'Tồn kho' },
    [AssetStatus.RETURNED_TO_PARTNER]: { color: '#94a3b8', label: 'Đã trả đối tác' },
};

export const getAssetStatusColor = (status?: AssetStatus) =>
    (status && ASSET_STATUS_COLOR[status]) || ASSET_STATUS_COLOR[AssetStatus.ACTIVE];
