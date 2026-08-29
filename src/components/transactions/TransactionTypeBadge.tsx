import type { BorrowingDirection, BorrowingType } from '../../core/types';
import { borrowingTypeMeta } from '../../core/constants/transactions';

type TransactionTypeBadgeProps = {
    type: BorrowingType;
    direction?: BorrowingDirection;
};

const TransactionTypeBadge = ({ type, direction }: TransactionTypeBadgeProps) => {
    const meta = borrowingTypeMeta[type];
    const outbound = direction === 'outbound';

    return (
        <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
                outbound ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : meta.badgeClassName
            }`}
        >
            {outbound ? 'Cho đối tác mượn' : meta.label}
        </span>
    );
};

export default TransactionTypeBadge;
