import { TransferStatus } from '../types';

export const transferStatusMeta: Record<
    TransferStatus,
    {
        label: string;
        badgeClassName: string;
    }
> = {
    pending: {
        label: 'Chờ duyệt',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    approved: {
        label: 'Đã duyệt',
        badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    completed: {
        label: 'Hoàn tất',
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    rejected: {
        label: 'Từ chối',
        badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    cancelled: {
        label: 'Đã hủy',
        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-500',
    },
};

export const transferStatusOptions = Object.entries(transferStatusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
}));
