import type { BorrowingStatus } from '../../core/types';
import { borrowingStatusMeta } from '../../core/constants/transactions';

type TransactionStatusBadgeProps = {
    status: BorrowingStatus;
};

const TransactionStatusBadge = ({ status }: TransactionStatusBadgeProps) => {
    const meta = borrowingStatusMeta[status];

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
        >
            <span className='h-1.5 w-1.5 rounded-full bg-current opacity-80' />
            {meta.label}
        </span>
    );
};

export default TransactionStatusBadge;
