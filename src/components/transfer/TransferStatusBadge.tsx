import type { TransferStatus } from '../../core/types';
import { transferStatusMeta } from '../../core/constants/transfer';

type TransferStatusBadgeProps = {
    status: TransferStatus;
};

const TransferStatusBadge = ({ status }: TransferStatusBadgeProps) => {
    const meta = transferStatusMeta[status];

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
        >
            <span className='h-1.5 w-1.5 rounded-full bg-current opacity-80' />
            {meta.label}
        </span>
    );
};

export default TransferStatusBadge;
