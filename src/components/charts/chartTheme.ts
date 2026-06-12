// Theme chart dùng chung cho các trang báo cáo — tông xanh thương hiệu chủ đạo,
// cam/đỏ chỉ dành cho cảnh báo. Semantic cố định để cùng một khái niệm
// (vật tư, sửa ngoài, cấp phát) luôn cùng màu ở mọi trang.

export const CHART_SEMANTIC = {
    /** Vật tư / mua vật tư / cấp phát — màu chủ đạo */
    material: '#2563eb',
    /** Đường chi phí mua net */
    purchaseLine: '#1e3a8a',
    /** Sửa chữa thuê ngoài — màu cảnh báo nhẹ */
    repair: '#f59e0b',
    /** Tổng hợp / trung bình tham chiếu */
    reference: '#94a3b8',
    /** Lát "Khác" trong donut */
    other: '#cbd5e1',
} as const;

// Thang xanh đậm→nhạt cho bar xếp hạng (hạng 1 đậm nhất)
const BLUE_SCALE = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

export const blueByRank = (index: number, total: number): string => {
    if (total <= 1) return BLUE_SCALE[2];
    const position = Math.min(1, Math.max(0, index / (total - 1)));
    return BLUE_SCALE[Math.round(position * (BLUE_SCALE.length - 1))];
};

export const fmtChartCurrency = (value = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

// Rút gọn tiền theo cách đọc của kế toán Việt: 1,2 tỷ · 850 tr · 12k
export const fmtChartShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} tr`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return String(value);
};
