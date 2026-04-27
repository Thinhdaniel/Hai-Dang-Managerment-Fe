import type { BorrowingType } from '../../core/types';
import { borrowingTypeMeta } from '../../core/constants/transactions';

type TransactionTypeBadgeProps = {
    type: BorrowingType;
};

const TransactionTypeBadge = ({ type }: TransactionTypeBadgeProps) => {
    const meta = borrowingTypeMeta[type];

    return (
        <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
        >
            {meta.label}
        </span>
    );
};

export default TransactionTypeBadge;
