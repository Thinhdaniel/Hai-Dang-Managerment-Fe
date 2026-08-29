import type { BorrowingDirection, BorrowingStatus } from '../../core/types';
import { borrowingStatusMeta } from '../../core/constants/transactions';

type TransactionStatusBadgeProps = {
    status: BorrowingStatus;
    direction?: BorrowingDirection;
};

const OUTBOUND_LABELS: Partial<Record<BorrowingStatus, string>> = {
    draft: 'Chờ bàn giao',
    active: 'Đang ở đối tác',
    returned: 'Đã nhận lại',
    cancelled: 'Đã hủy',
};

const TransactionStatusBadge = ({ status, direction }: TransactionStatusBadgeProps) => {
    const meta = borrowingStatusMeta[status];
    const label = direction === 'outbound' ? OUTBOUND_LABELS[status] : meta.label;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
        >
            <span className='h-1.5 w-1.5 rounded-full bg-current opacity-80' />
            {label}
        </span>
    );
};

export default TransactionStatusBadge;
