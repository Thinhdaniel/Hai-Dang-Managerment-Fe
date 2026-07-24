export type ProductionEntryGuardCode =
    | 'zero_without_reason'
    | 'above_quota'
    | 'sudden_spike'
    | 'large_correction'
    | 'below_quota';

export interface ProductionEntryGuardSignal {
    code: ProductionEntryGuardCode;
    title: string;
    detail: string;
    requiresConfirmation: boolean;
}

interface EvaluateProductionEntryInput {
    quantity: number | null;
    target: number;
    previousQuantity?: number;
    existingQuantity?: number;
    hasExplanation: boolean;
}

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

export const evaluateProductionEntry = ({
    quantity,
    target,
    previousQuantity,
    existingQuantity,
    hasExplanation,
}: EvaluateProductionEntryInput): ProductionEntryGuardSignal[] => {
    if (quantity === null || quantity < 0) return [];

    const signals: ProductionEntryGuardSignal[] = [];

    if (target > 0 && quantity === 0) {
        signals.push({
            code: 'zero_without_reason',
            title: 'Sản lượng đang bằng 0',
            detail: hasExplanation
                ? 'Đã có nguyên nhân kèm theo bản ghi.'
                : 'Chưa có nguyên nhân dừng chuyền hoặc gián đoạn sản xuất.',
            requiresConfirmation: !hasExplanation,
        });
    }

    if (target > 0 && quantity > target * 3 && quantity - target >= Math.max(100, target)) {
        signals.push({
            code: 'above_quota',
            title: 'Sản lượng cao bất thường so với khoán',
            detail: `${number(quantity)} SP tương đương ${Math.round((quantity / target) * 100)}% mức khoán ${number(target)} SP.`,
            requiresConfirmation: true,
        });
    }

    if (
        previousQuantity !== undefined &&
        previousQuantity > 0 &&
        quantity > previousQuantity * 2.5 &&
        quantity - previousQuantity >= Math.max(100, target * 0.5)
    ) {
        signals.push({
            code: 'sudden_spike',
            title: 'Tăng mạnh so với giờ trước',
            detail: `Giờ trước đã báo ${number(previousQuantity)} SP, hiện tại đang nhập ${number(quantity)} SP.`,
            requiresConfirmation: true,
        });
    }

    if (
        existingQuantity !== undefined &&
        quantity !== existingQuantity &&
        Math.abs(quantity - existingQuantity) >= Math.max(100, Math.abs(existingQuantity) * 0.75)
    ) {
        signals.push({
            code: 'large_correction',
            title: 'Thay đổi lớn so với số đang lưu',
            detail: `Số trên hệ thống là ${number(existingQuantity)} SP, số mới là ${number(quantity)} SP.`,
            requiresConfirmation: true,
        });
    }

    if (target > 0 && quantity > 0 && quantity < target * 0.6) {
        signals.push({
            code: 'below_quota',
            title: 'Sản lượng dưới 60% mức khoán',
            detail: hasExplanation
                ? 'Đã có nguyên nhân để quản lý theo dõi.'
                : 'Nên chọn nguyên nhân để báo cáo cuối ngày phản ánh đúng tình hình.',
            requiresConfirmation: false,
        });
    }

    return signals;
};
