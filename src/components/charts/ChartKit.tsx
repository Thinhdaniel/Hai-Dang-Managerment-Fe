import React from 'react';

// Linh kiện chart dùng chung (đi kèm ECharts): nhãn tâm donut và badge so kỳ trước.
// CSS của các class hd-* nằm trong global.css.

export function DonutCenter({ title, value }: { title: string; value: string }) {
    return (
        <div className='hd-donut-center'>
            <strong>{value}</strong>
            <span>{title}</span>
        </div>
    );
}

/** Badge ±% so với kỳ liền trước. Với chi phí: tăng = đỏ, giảm = xanh. */
export function DeltaBadge({
    current,
    previous,
    formatter,
}: {
    current: number;
    previous?: number;
    formatter?: (value: number) => string;
}) {
    if (previous === undefined || previous === null) return null;
    if (previous === 0 && current === 0) return null;

    const fmt = formatter ?? ((value: number) => String(value));
    if (previous === 0) {
        return (
            <span className='hd-delta hd-delta--new' title='Kỳ trước không phát sinh'>
                Mới phát sinh
            </span>
        );
    }

    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (!Number.isFinite(pct)) return null;
    const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Number(pct.toFixed(1));
    const up = pct > 0;
    const flat = Math.abs(pct) < 0.05;

    return (
        <span
            className={`hd-delta ${flat ? 'hd-delta--flat' : up ? 'hd-delta--up' : 'hd-delta--down'}`}
            title={`Kỳ trước: ${fmt(previous)}`}
        >
            {flat ? '—' : up ? '▲' : '▼'} {flat ? 'Không đổi' : `${Math.abs(rounded)}%`}
            <em>so kỳ trước</em>
        </span>
    );
}
