/**
 * Nhãn khung giờ dùng chung cho toàn bộ module sản lượng.
 *
 * Lý do tồn tại: `label` lưu trong DB là nhãn điểm ("8h") nhưng thực tế nó chỉ
 * mốc BÁO CÁO — ca làm là khoảng trước đó (7h-8h). Xưởng đọc theo dải giờ nên
 * mọi màn hình phải hiện dải, và phải TÍNH từ startMinute/endMinute chứ không
 * sửa `label` đã lưu: mỗi cơ sở cấu hình khung giờ khác nhau và dữ liệu cũ vẫn
 * giữ nhãn cũ, chỉ có mốc phút mới luôn đúng.
 */

type SlotLike = {
    label?: string;
    startMinute?: number;
    endMinute?: number;
};

const hourText = (minute: number) => {
    const hour = Math.floor(minute / 60);
    const rest = minute % 60;
    return rest === 0 ? `${hour}h` : `${hour}h${String(rest).padStart(2, '0')}`;
};

/** "7h-8h" — dải giờ thực của ca. Rơi về `label` khi thiếu mốc phút. */
export const slotRangeLabel = (slot?: SlotLike | null): string => {
    if (!slot) return '';
    const { startMinute, endMinute } = slot;
    if (typeof startMinute !== 'number' || typeof endMinute !== 'number' || endMinute <= startMinute) {
        return slot.label || '';
    }
    return `${hourText(startMinute)}-${hourText(endMinute)}`;
};

/**
 * Nhãn lưu kèm khung giờ. Server luôn sinh lại y hệt bằng `buildTimeSlotLabel`
 * nên người dùng không phải nhập nhãn; hàm này chỉ để bản nháp trên máy hiển thị
 * đúng ngay trước khi lưu.
 */
export const buildSlotLabel = (startMinute: number, endMinute: number) =>
    startMinute % 60 === 0 && endMinute % 60 === 0
        ? `${Math.floor(startMinute / 60)}-${Math.floor(endMinute / 60)}h`
        : `${hourText(startMinute)}-${hourText(endMinute)}`;

/** Dạng ngắn cho ô hẹp: "7-8h" (bỏ chữ h ở vế đầu khi cả hai đều tròn giờ). */
export const slotRangeLabelShort = (slot?: SlotLike | null): string => {
    if (!slot) return '';
    const { startMinute, endMinute } = slot;
    if (typeof startMinute !== 'number' || typeof endMinute !== 'number' || endMinute <= startMinute) {
        return slot.label || '';
    }
    if (startMinute % 60 === 0 && endMinute % 60 === 0) {
        return `${Math.floor(startMinute / 60)}-${Math.floor(endMinute / 60)}h`;
    }
    return `${hourText(startMinute)}-${hourText(endMinute)}`;
};
