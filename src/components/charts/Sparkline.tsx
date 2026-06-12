import React, { useMemo } from 'react';
import EChart, { type EChartsCoreOption } from './EChart';
import { CHART_SEMANTIC } from './chartTheme';

// Sparkline mini cho thẻ KPI hero: đường mượt + vùng tô gradient, không trục, không tooltip.

const Sparkline: React.FC<{ data: number[]; color?: string; height?: number }> = ({
    data,
    color = CHART_SEMANTIC.material,
    height = 48,
}) => {
    const option = useMemo<EChartsCoreOption>(
        () => ({
            animationDuration: 800,
            grid: { left: 2, right: 2, top: 4, bottom: 2 },
            xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, index) => index) },
            yAxis: { type: 'value', show: false },
            series: [
                {
                    type: 'line',
                    data,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: `${color}40` },
                                { offset: 1, color: `${color}00` },
                            ],
                        },
                    },
                },
            ],
        }),
        [data, color]
    );

    if (data.length < 2) return null;
    return <EChart option={option} height={height} />;
};

export default Sparkline;
