import React from 'react';
import { RobotOutlined } from '@ant-design/icons';

// Nút mở "Trợ lý vận hành" toàn cục — badge tròn màu nhấn thương hiệu, có chấm "online",
// nhãn trượt ra khi hover (desktop) và pulse radar nhẹ để gợi chú ý. Phẳng, sạch.

const ACCENT = '#2f51d9';

const STYLES = `
@keyframes hd-launch-in { from { opacity:0; transform: translateY(14px) scale(.9); } to { opacity:1; transform:none; } }
@keyframes hd-launch-ping { 0% { transform: scale(1); opacity:.4; } 70%,100% { transform: scale(1.7); opacity:0; } }
.hd-launcher { animation: hd-launch-in .42s cubic-bezier(.22,1,.36,1) both; }
.hd-launcher-ping { animation: hd-launch-ping 2.8s cubic-bezier(0,0,.2,1) infinite; }
.hd-launcher-label { max-width:0; opacity:0; padding-left:0; padding-right:0; overflow:hidden; white-space:nowrap;
  transition: max-width .3s ease, opacity .22s ease, padding .3s ease; }
.hd-launcher:hover .hd-launcher-label { max-width:150px; opacity:1; padding-left:16px; padding-right:4px; }
@media (prefers-reduced-motion: reduce) {
  .hd-launcher, .hd-launcher-ping { animation: none !important; }
  .hd-launcher-label { transition: none; }
}
`;

interface Props {
    onClick: () => void;
    isDesktop: boolean;
}

const AssistantLauncher: React.FC<Props> = ({ onClick, isDesktop }) => (
    <>
        <style>{STYLES}</style>
        <button
            type='button'
            aria-label='Mở trợ lý vận hành'
            onClick={onClick}
            className='hd-launcher fixed z-[1090] flex items-center rounded-full text-white shadow-[0_10px_28px_rgba(47,81,217,0.42)] ring-1 ring-white/25 transition-transform hover:scale-[1.04] active:scale-95'
            style={{
                background: ACCENT,
                right: isDesktop ? 28 : 16,
                bottom: isDesktop ? 28 : 'calc(96px + env(safe-area-inset-bottom))',
            }}
        >
            {/* Nhãn trượt ra khi hover (desktop) */}
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

export default AssistantLauncher;
