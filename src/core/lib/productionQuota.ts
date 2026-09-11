import type { ProductionRun, ProductionTimeSlot } from '../types/production';

const orderedSlots = (slots: ProductionTimeSlot[]) =>
    [...slots].sort((left, right) => left.startMinute - right.startMinute);

export const productionQuotaMinutes = (slots: ProductionTimeSlot[], startSlotKey?: string, endSlotKey?: string) => {
    const ordered = orderedSlots(slots);
    const startIndex = startSlotKey ? ordered.findIndex((slot) => slot.key === startSlotKey) : 0;
    const endIndex = endSlotKey ? ordered.findIndex((slot) => slot.key === endSlotKey) : ordered.length - 1;
    if (startIndex < 0 || endIndex < startIndex) return 0;

    return ordered.slice(startIndex, endIndex + 1).reduce((total, slot) => {
        if (!slot.isActive || slot.kind === 'overtime') return total;
        return total + Math.max(0, slot.endMinute - slot.startMinute);
    }, 0);
};

export const quotaQuantityFromHourlyRate = (
    hourlyQuota: number,
    slots: ProductionTimeSlot[],
    startSlotKey?: string,
    endSlotKey?: string
) => Math.round((Math.max(0, hourlyQuota) * productionQuotaMinutes(slots, startSlotKey, endSlotKey)) / 60);

export const quotaQuantityForRun = (
    run: ProductionRun | undefined,
    slots: ProductionTimeSlot[],
    startSlotKey = run?.startedSlotKey,
    endSlotKey = run?.endedSlotKey || run?.plannedEndSlotKey
) => {
    if (!run) return undefined;
    const usesStoredWindow =
        startSlotKey === run.startedSlotKey && endSlotKey === (run.endedSlotKey || run.plannedEndSlotKey);
    if (usesStoredWindow && run.quotaQuantity !== undefined) return run.quotaQuantity;
    return quotaQuantityFromHourlyRate(run.hourlyQuota, slots, startSlotKey, endSlotKey);
};

export type ProductionQuotaSummary = {
    minutes: number;
    averageHourlyQuota: number;
    minimumSlotTarget: number;
    maximumSlotTarget: number;
};

export const summarizeProductionQuota = (
    quotaQuantity: number | null | undefined,
    slots: ProductionTimeSlot[],
    startSlotKey?: string,
    endSlotKey?: string
): ProductionQuotaSummary | undefined => {
    if (quotaQuantity === null || quotaQuantity === undefined || quotaQuantity < 0) return undefined;
    const ordered = orderedSlots(slots);
    const startIndex = startSlotKey ? ordered.findIndex((slot) => slot.key === startSlotKey) : 0;
    const endIndex = endSlotKey ? ordered.findIndex((slot) => slot.key === endSlotKey) : ordered.length - 1;
    if (startIndex < 0 || endIndex < startIndex) return undefined;
    const applicableSlots = ordered
        .slice(startIndex, endIndex + 1)
        .filter((slot) => slot.isActive && slot.kind !== 'overtime');
    const minutes = applicableSlots.reduce((total, slot) => total + Math.max(0, slot.endMinute - slot.startMinute), 0);
    if (minutes <= 0) return undefined;

    let cumulativeExact = 0;
    let cumulativeAllocated = 0;
    const targets = applicableSlots.map((slot, index) => {
        cumulativeExact += (quotaQuantity * (slot.endMinute - slot.startMinute)) / minutes;
        const nextAllocated =
            index === applicableSlots.length - 1 ? Math.round(quotaQuantity) : Math.floor(cumulativeExact + 1e-9);
        const target = Math.max(0, nextAllocated - cumulativeAllocated);
        cumulativeAllocated = nextAllocated;
        return target;
    });

    return {
        minutes,
        averageHourlyQuota: (quotaQuantity * 60) / minutes,
        minimumSlotTarget: Math.min(...targets),
        maximumSlotTarget: Math.max(...targets),
    };
};

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export const productionQuotaSummaryText = (summary?: ProductionQuotaSummary) => {
    if (!summary) return 'Chọn khoảng giờ hợp lệ để hệ thống tính nhịp sản xuất.';
    const duration =
        summary.minutes % 60 === 0
            ? `${summary.minutes / 60} giờ sản xuất thường`
            : `${decimal.format(summary.minutes / 60)} giờ sản xuất thường`;
    const slotTarget =
        summary.minimumSlotTarget === summary.maximumSlotTarget
            ? `${decimal.format(summary.minimumSlotTarget)} SP mỗi khung`
            : `${decimal.format(summary.minimumSlotTarget)}-${decimal.format(summary.maximumSlotTarget)} SP tùy khung`;
    return `${duration} · nhịp TB ${decimal.format(summary.averageHourlyQuota)} SP/giờ · ${slotTarget}.`;
};
