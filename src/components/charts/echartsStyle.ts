import { fmtChartCurrency } from './chartTheme';

// Style ECharts dùng chung cho các trang báo cáo — tooltip card, nhãn trục,
// gradient nổi khối và formatter tooltip dạng nhiều dòng.

export const ECHARTS_TOOLTIP_STYLE = {
    // confine: giữ tooltip nằm trong khung chart, không tràn/màn hình cắt — quan trọng trên mobile
    confine: true,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: [10, 12] as [number, number],
    textStyle: { color: '#0f172a', fontSize: 12 },
    // max-width co theo bề rộng màn hình + cho xuống dòng để box không kéo dài quá khổ trên mobile
    extraCssText:
        'border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,0.14);max-width:min(300px,84vw);white-space:normal;word-break:break-word;',
};

export const ECHARTS_AXIS_LABEL = { color: '#64748b', fontSize: 11 };

export const ECHARTS_LEGEND_TOP = {
    top: 0,
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16,
    textStyle: { color: '#334155', fontSize: 12, fontWeight: 600 },
} as const;

// Gradient đậm→nhạt tạo chiều sâu cho bar (vertical: trên→dưới; ngang: trái→phải)
export const barGradient = (color: string, vertical = true) => ({
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
    colorStops: [
        { offset: 0, color },
        { offset: 1, color: `${color}8C` },
    ],
});

type AxisTooltipItem = {
    axisValueLabel?: string;
    name?: string;
    marker?: string;
    seriesName?: string;
    value?: number;
};

export const makeAxisTooltipFormatter =
    (options?: { showTotal?: boolean; valueFormatter?: (value: number) => string }) => (params: unknown) => {
        const fmt = options?.valueFormatter ?? fmtChartCurrency;
        const list = (Array.isArray(params) ? params : [params]) as AxisTooltipItem[];
        const title = list[0]?.axisValueLabel ?? list[0]?.name ?? '';
        let total = 0;
        const rows = list
            .map((item) => {
                const value = Number(item.value ?? 0);
                total += value;
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">${item.marker ?? ''}<span style="flex:1;color:#475569">${item.seriesName ?? ''}</span><b style="font-variant-numeric:tabular-nums">${fmt(value)}</b></div>`;
            })
            .join('');
        const totalRow =
            options?.showTotal && list.length > 1
                ? `<div style="margin-top:4px;padding-top:6px;border-top:1px dashed #e2e8f0;display:flex;justify-content:space-between;gap:16px"><span style="color:#475569;font-weight:700">Tổng cộng</span><b style="font-variant-numeric:tabular-nums">${fmt(total)}</b></div>`
                : '';
        return `<div style="min-width:min(200px,64vw)"><div style="font-weight:700;margin-bottom:6px">${title}</div>${rows}${totalRow}</div>`;
    };

export const stackedTooltipFormatter = makeAxisTooltipFormatter({ showTotal: true });
