import type { BorrowingBatchStatus, BorrowingStatus, BorrowingType, QrReturnAction } from '../types';

export const borrowingTypeMeta: Record<
    BorrowingType,
    {
        label: string;
        badgeClassName: string;
    }
> = {
    internal: {
        label: 'Mượn nội bộ',
        badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    external: {
        label: 'Mượn ngoài',
        badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    rental: {
        label: 'Thuê máy',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    },
};

export const borrowingStatusMeta: Record<
    BorrowingStatus,
    {
        label: string;
        badgeClassName: string;
    }
> = {
    active: {
        label: 'Đang hoạt động',
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    returned: {
        label: 'Đã trả',
        badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    },
};

export const borrowingTypeOptions = Object.entries(borrowingTypeMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
}));

export const borrowingStatusOptions = Object.entries(borrowingStatusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
}));

export const borrowingBatchStatusMeta: Record<
    BorrowingBatchStatus,
    {
        label: string;
        color: string;
    }
> = {
    draft: { label: 'Nháp', color: 'default' },
    receiving: { label: 'Đang nhận máy', color: 'processing' },
    active: { label: 'Đang mượn/thuê', color: 'green' },
    partially_returned: { label: 'Trả một phần', color: 'gold' },
    returned: { label: 'Đã trả hết', color: 'blue' },
    cancelled: { label: 'Đã hủy', color: 'red' },
};

export const borrowingBatchStatusOptions = Object.entries(borrowingBatchStatusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
}));

export const qrReturnActionMeta: Record<QrReturnAction, { label: string; color: string; description: string }> = {
    removed: {
        label: 'Đã gỡ QR',
        color: 'green',
        description: 'Tem đã được bóc/gỡ khỏi máy trước khi trả.',
    },
    lost: {
        label: 'QR bị mất',
        color: 'red',
        description: 'Không tìm thấy tem khi trả, hệ thống sẽ khóa mã QR này.',
    },
    damaged: {
        label: 'QR hỏng',
        color: 'orange',
        description: 'Tem hỏng, rách hoặc không thể dùng lại.',
    },
    left_on_partner: {
        label: 'Còn trên máy đối tác',
        color: 'volcano',
        description: 'Rủi ro cao: tem vẫn còn trên máy đối tác nhưng sẽ bị vô hiệu hóa.',
    },
};

export const qrReturnActionOptions = Object.entries(qrReturnActionMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
}));
