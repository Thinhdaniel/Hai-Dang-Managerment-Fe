import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

// Wrapper Apache ECharts cho các chart cần animation/hiệu ứng phong phú.
// Import theo module để bundle chỉ chứa phần dùng đến; trang báo cáo đã lazy-load
// nên echarts không ảnh hưởng chunk đầu vào.
echarts.use([
    BarChart,
    LineChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    DataZoomComponent,
    CanvasRenderer,
]);

export type { ECharts, EChartsCoreOption };

type EChartProps = {
    option: EChartsCoreOption;
    height: number | string;
    className?: string;
    /** Map sự kiện echarts, ví dụ { click: handler }. Nên bọc useCallback/useMemo ở caller. */
    onEvents?: Record<string, (params: unknown) => void>;
    /** Nhận instance echarts để gọi getDataURL (tải PNG)... */
    instanceRef?: React.RefObject<ECharts | null>;
};

const EChart: React.FC<EChartProps> = ({ option, height, className, onEvents, instanceRef }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartInstanceRef = useRef<ECharts | null>(null);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const chart = echarts.init(node);
        chartInstanceRef.current = chart;
        if (instanceRef) instanceRef.current = chart;
        const observer = new ResizeObserver(() => chart.resize());
        observer.observe(node);
        return () => {
            observer.disconnect();
            chart.dispose();
            chartInstanceRef.current = null;
            if (instanceRef) instanceRef.current = null;
        };
    }, [instanceRef]);

    useEffect(() => {
        chartInstanceRef.current?.setOption(option, { notMerge: true });
    }, [option]);

    useEffect(() => {
        const chart = chartInstanceRef.current;
        if (!chart || !onEvents) return;
        Object.entries(onEvents).forEach(([event, handler]) => chart.on(event, handler));
        return () => {
            if (chart.isDisposed()) return;
            Object.entries(onEvents).forEach(([event, handler]) => chart.off(event, handler));
        };
    }, [onEvents]);

    return <div ref={containerRef} className={className} style={{ width: '100%', height }} />;
};

export default EChart;
