import { Popconfirm, type PopconfirmProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * ConfirmAction — Reusable confirmation wrapper for critical user actions.
 *
 * Usage:
 * <ConfirmAction title="Xóa thiết bị" description="Thao tác này không thể hoàn tác." onConfirm={handleDelete}>
 *   <Button danger>Xóa</Button>
 * </ConfirmAction>
 */

export type ConfirmIntent = 'danger' | 'warning' | 'primary';

const intentConfig: Record<
    ConfirmIntent,
    { okClassName: string; okText: string }
> = {
    danger: {
        okClassName: 'bg-rose-600 hover:bg-rose-700 border-none',
        okText: 'Xác nhận xóa',
    },
    warning: {
        okClassName: 'bg-amber-500 hover:bg-amber-600 border-none',
        okText: 'Xác nhận',
    },
    primary: {
        okClassName: 'bg-blue-600 hover:bg-blue-700 border-none',
        okText: 'Xác nhận',
    },
};

interface ConfirmActionProps extends Omit<PopconfirmProps, 'okText' | 'cancelText' | 'okButtonProps'> {
    children: ReactNode;
    intent?: ConfirmIntent;
    /** Override the ok button label */
    okLabel?: string;
}

const ConfirmAction = ({
    children,
    intent = 'danger',
    okLabel,
    title,
    description,
    onConfirm,
    disabled,
    ...rest
}: ConfirmActionProps) => {
    const { okClassName, okText } = intentConfig[intent];

    return (
        <Popconfirm
            title={title}
            description={description}
            okText={okLabel ?? okText}
            cancelText='Hủy'
            okButtonProps={{ className: okClassName }}
            onConfirm={onConfirm}
            disabled={disabled}
            {...rest}
        >
            {children}
        </Popconfirm>
    );
};

export default ConfirmAction;
