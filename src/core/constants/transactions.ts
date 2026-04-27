import { BorrowingStatus, BorrowingType } from '../types';

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
