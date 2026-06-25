import React, { useCallback, useEffect, useRef, useState } from 'react';

// Cửa sổ nổi kéo–thả + đổi cỡ bằng pointer events (không cần thư viện ngoài).
// Trả vị trí/kích thước `rect` (đã clamp trong màn hình), nhớ qua localStorage.

export type Rect = { x: number; y: number; w: number; h: number };

const MARGIN = 12; // chừa mép màn hình
const MIN_W = 320;
const MIN_H = 420;

const clampRect = (r: Rect): Rect => {
    if (typeof window === 'undefined') return r;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(Math.max(r.w, MIN_W), Math.max(MIN_W, vw - MARGIN * 2));
    const h = Math.min(Math.max(r.h, MIN_H), Math.max(MIN_H, vh - MARGIN * 2));
    const x = Math.min(Math.max(r.x, MARGIN), Math.max(MARGIN, vw - w - MARGIN));
    const y = Math.min(Math.max(r.y, MARGIN), Math.max(MARGIN, vh - h - MARGIN));
    return { x, y, w, h };
};

export const useFloatingWindow = (storageKey: string, getDefault: () => Rect, enabled: boolean) => {
    const [rect, setRect] = useState<Rect>(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) return clampRect(JSON.parse(raw));
        } catch {
            /* noop */
        }
        return clampRect(getDefault());
    });
    const [dragging, setDragging] = useState(false);
    const modeRef = useRef<'move' | 'resize' | null>(null);
    const startRef = useRef<{ px: number; py: number; rect: Rect }>({ px: 0, py: 0, rect });

    const persist = useCallback(
        (r: Rect) => {
            try {
                localStorage.setItem(storageKey, JSON.stringify(r));
            } catch {
                /* noop */
            }
        },
        [storageKey]
    );

    // Kéo / resize: nghe ở window để chuột ra ngoài panel vẫn theo.
    useEffect(() => {
        if (!enabled) return;
        const onMove = (e: PointerEvent) => {
            if (!modeRef.current) return;
            const { px, py, rect: s } = startRef.current;
            const dx = e.clientX - px;
            const dy = e.clientY - py;
            if (modeRef.current === 'move') setRect(clampRect({ ...s, x: s.x + dx, y: s.y + dy }));
            else setRect(clampRect({ ...s, w: s.w + dx, h: s.h + dy }));
        };
        const onUp = () => {
            if (!modeRef.current) return;
            modeRef.current = null;
            setDragging(false);
            setRect((r) => {
                persist(r);
                return r;
            });
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [enabled, persist]);

    // Thu nhỏ trình duyệt -> kéo panel nằm lại trong màn hình.
    useEffect(() => {
        if (!enabled) return;
        const onResize = () => setRect((r) => clampRect(r));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [enabled]);

    const begin = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
        e.preventDefault();
        modeRef.current = mode;
        startRef.current = { px: e.clientX, py: e.clientY, rect };
        setDragging(true);
    };

    return {
        rect,
        dragging,
        startDrag: begin('move'),
        startResize: begin('resize'),
    };
};
