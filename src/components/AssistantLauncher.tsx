import React, { useEffect, useRef, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';

// Nút mở "Trợ lý vận hành" toàn cục — KÉO ĐƯỢC tự do (giữ & rê để di chuyển, bấm để mở),
// nhớ vị trí qua localStorage, luôn nằm trong màn hình. Badge tròn màu nhấn, chấm "online".

const ACCENT = '#2f51d9';
const POS_KEY = 'hd-assistant-launcher-pos';
const MARGIN = 10; // chừa mép màn hình
const DRAG_THRESHOLD = 5; // px: vượt ngưỡng mới coi là kéo (để không nuốt thao tác bấm)

type Pos = { x: number; y: number };

const clampPos = (p: Pos, w: number, h: number): Pos => {
    if (typeof window === 'undefined') return p;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
        x: Math.min(Math.max(p.x, MARGIN), Math.max(MARGIN, vw - w - MARGIN)),
        y: Math.min(Math.max(p.y, MARGIN), Math.max(MARGIN, vh - h - MARGIN)),
    };
};

const STYLES = `
@keyframes hd-launch-in { from { opacity:0; transform: translateY(14px) scale(.9); } to { opacity:1; transform:none; } }
@keyframes hd-launch-ping { 0% { transform: scale(1); opacity:.4; } 70%,100% { transform: scale(1.7); opacity:0; } }
.hd-launcher { animation: hd-launch-in .42s cubic-bezier(.22,1,.36,1) both; touch-action: none; }
.hd-launcher-ping { animation: hd-launch-ping 2.8s cubic-bezier(0,0,.2,1) infinite; }
.hd-launcher-label { max-width:0; opacity:0; padding-left:0; padding-right:0; overflow:hidden; white-space:nowrap;
  transition: max-width .3s ease, opacity .22s ease, padding .3s ease; }
.hd-launcher:not(.hd-dragging):hover .hd-launcher-label { max-width:150px; opacity:1; padding-left:16px; padding-right:4px; }
@media (prefers-reduced-motion: reduce) {
  .hd-launcher, .hd-launcher-ping { animation: none !important; }
  .hd-launcher-label { transition: none; }
}
`;

interface Props {
    onClick: () => void;
    isDesktop: boolean;
}

const AssistantLauncher: React.FC<Props> = ({ onClick, isDesktop }) => {
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<Pos | null>(() => {
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (raw) return JSON.parse(raw) as Pos;
        } catch {
            /* noop */
        }
        return null; // null = dùng vị trí mặc định (góc dưới–phải)
    });
    const [dragging, setDragging] = useState(false);
    const drag = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false, active: false });

    const persist = (p: Pos) => {
        try {
            localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
            /* noop */
        }
    };

    // Thu nhỏ trình duyệt -> kéo nút lại trong màn hình.
    useEffect(() => {
        const onResize = () =>
            setPos((p) => {
                if (!p) return p;
                const rect = btnRef.current?.getBoundingClientRect();
                const next = clampPos(p, rect?.width ?? 56, rect?.height ?? 56);
                persist(next);
                return next;
            });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        const rect = btnRef.current?.getBoundingClientRect();
        if (!rect) return;
        drag.current = { startX: e.clientX, startY: e.clientY, baseX: rect.left, baseY: rect.top, moved: false, active: true };
        btnRef.current?.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d.active) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!d.moved) {
            d.moved = true;
            setDragging(true);
        }
        const rect = btnRef.current?.getBoundingClientRect();
        setPos(clampPos({ x: d.baseX + dx, y: d.baseY + dy }, rect?.width ?? 56, rect?.height ?? 56));
    };

    const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;
        btnRef.current?.releasePointerCapture?.(e.pointerId);
        if (d.moved) {
            setDragging(false);
            setPos((p) => {
                if (p) persist(p);
                return p;
            });
        } else {
            onClick(); // không rê -> coi là bấm mở trợ lý
        }
    };

    const style: React.CSSProperties = pos
        ? { background: ACCENT, left: pos.x, top: pos.y }
        : {
              background: ACCENT,
              right: isDesktop ? 28 : 16,
              bottom: isDesktop ? 28 : 'calc(96px + env(safe-area-inset-bottom))',
          };

    return (
        <>
            <style>{STYLES}</style>
            <button
                ref={btnRef}
                type='button'
                aria-label='Mở trợ lý vận hành (kéo để di chuyển)'
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClick();
                    }
                }}
                className={`hd-launcher fixed z-[1090] flex items-center rounded-full text-white shadow-[0_10px_28px_rgba(47,81,217,0.42)] ring-1 ring-white/25 transition-transform active:scale-95 ${
                    dragging ? 'hd-dragging cursor-grabbing' : 'cursor-grab hover:scale-[1.04]'
                }`}
                style={style}
            >
                {/* Nhãn trượt ra khi hover (desktop), ẩn khi đang kéo */}
                <span className='hd-launcher-label text-[13px] font-semibold tracking-wide'>Trợ lý AI</span>

                {/* Vòng tròn icon + pulse + badge online */}
                <span className='relative flex h-14 w-14 items-center justify-center'>
                    <span className='hd-launcher-ping absolute inset-0 rounded-full' style={{ background: ACCENT }} />
                    <RobotOutlined className='relative text-[22px]' />
                    <span className='absolute top-2.5 right-2.5 flex h-3 w-3 items-center justify-center'>
                        <span className='absolute h-3 w-3 animate-ping rounded-full bg-emerald-400/70' />
                        <span className='relative h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white' />
                    </span>
                </span>
            </button>
        </>
    );
};

export default AssistantLauncher;
