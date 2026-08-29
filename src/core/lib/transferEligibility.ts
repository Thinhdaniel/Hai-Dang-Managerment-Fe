import { AssetStatus } from '../types';

const TRANSFER_BLOCKED_STATUSES = new Set<AssetStatus>([
    AssetStatus.LOANED_OUT,
    AssetStatus.RETURNED_TO_PARTNER,
    AssetStatus.PENDING_DISPOSAL,
    AssetStatus.DISPOSED,
]);

export const isTransferBlockedAssetStatus = (status?: AssetStatus) =>
    Boolean(status && TRANSFER_BLOCKED_STATUSES.has(status));

export const getTransferBlockedAssetReason = (status?: AssetStatus) => {
    if (status === AssetStatus.LOANED_OUT) return 'Máy đang cho đối tác mượn, phải nhận lại trước khi điều chuyển';
    if (status === AssetStatus.RETURNED_TO_PARTNER) return 'Máy đã trả đối tác, không thể điều chuyển';
    if (status === AssetStatus.PENDING_DISPOSAL || status === AssetStatus.DISPOSED) {
        return 'Máy đang/đã nằm trong hồ sơ thanh lý, không thể điều chuyển';
    }
    return '';
};
