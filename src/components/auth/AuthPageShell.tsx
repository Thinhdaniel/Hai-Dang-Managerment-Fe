import type { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

// Logo công ty bundle nội bộ (đồng bộ với favicon + icon PWA), không phụ thuộc URL ngoài
const COMPANY_LOGO_URL = '/brand/company-logo.png';

type AuthPageShellProps = {
    eyebrow: string;
    title: string;
    subtitle: string;
    children: ReactNode;
};

const AuthPageShell = ({ eyebrow, title, subtitle, children }: AuthPageShellProps) => {
    return (
        <>
            <style>{`
                @keyframes auth-fade-up {
                    from { opacity: 0; transform: translateY(14px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes auth-fade-in {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes auth-glow-pulse {
                    0%, 100% { opacity: 0.08; transform: scale(1); }
                    50%       { opacity: 0.14; transform: scale(1.06); }
                }

                .auth-panel-logo  { animation: auth-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both; }
                .auth-panel-h1    { animation: auth-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both; }
                .auth-panel-sub   { animation: auth-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both; }
                .auth-panel-foot  { animation: auth-fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both; }
                .auth-form-panel  { animation: auth-fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both; }
                .auth-glow        { animation: auth-glow-pulse 8s ease-in-out infinite; }

                @media (prefers-reduced-motion: reduce) {
                    .auth-panel-logo,
                    .auth-panel-h1,
                    .auth-panel-sub,
                    .auth-panel-foot,
                    .auth-form-panel { animation: none; opacity: 1; transform: none; }
                    .auth-glow       { animation: none; }
                }
            `}</style>

            <div className='flex min-h-screen' style={{ background: 'oklch(0.99 0.003 250)' }}>
                {/* ── Left brand panel ── */}
                <div
                    className='relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-16 xl:p-24'
                    style={{ background: 'oklch(0.13 0.012 250)' }}
                >
                    {/* Ambient glow — breathes, never distracts */}
                    <div className='auth-glow pointer-events-none absolute -top-[20%] -left-[10%] h-[70%] w-[70%] rounded-full blur-[140px]'
                         style={{ background: 'oklch(0.55 0.22 250)' }} />

                    <div className='relative z-10'>
                        <div className='auth-panel-logo mb-12 flex h-11 w-11 items-center justify-center rounded-lg bg-white p-2 shadow-sm'>
                            <img src={COMPANY_LOGO_URL} alt='Hải Đăng Garment logo' className='h-full w-full object-contain' />
                        </div>

                        <h1 className='auth-panel-h1 text-4xl font-semibold tracking-tight lg:text-5xl lg:leading-[1.12]'
                            style={{ color: 'oklch(0.97 0.005 250)' }}>
                            Hệ thống quản lý
                            <br />
                            <span style={{ color: 'oklch(0.60 0.015 250)' }}>thiết bị Hải Đăng.</span>
                        </h1>

                        <p className='auth-panel-sub mt-6 max-w-sm text-base leading-relaxed'
                           style={{ color: 'oklch(0.55 0.015 250)' }}>
                            Kiểm soát vận hành, giám sát bảo trì và luân chuyển tài sản theo thời gian thực cho khối sản xuất.
                        </p>
                    </div>

                    <div className='auth-panel-foot relative z-10 flex items-center justify-between border-t pt-8 text-sm'
                         style={{ borderColor: 'oklch(0.22 0.01 250)', color: 'oklch(0.45 0.01 250)' }}>
                        <span>&copy; {new Date().getFullYear()} Hai Dang Garment</span>
                        <span>v1.0</span>
                    </div>
                </div>

                {/* ── Right form panel ── */}
                <div className='flex w-full flex-col justify-center px-6 lg:w-1/2 lg:px-16 xl:px-24'>
                    <div className='auth-form-panel mx-auto w-full max-w-sm'>
                        {/* Mobile-only logo + heading */}
                        <div className='mb-10 lg:hidden'>
                            <div className='mb-5 flex h-10 w-10 items-center justify-center rounded-lg border bg-white shadow-sm'
                                 style={{ borderColor: 'oklch(0.90 0.005 250)' }}>
                                <img src={COMPANY_LOGO_URL} alt='Hải Đăng Garment logo' className='h-full w-full object-contain' />
                            </div>
                            <h1 className='text-2xl font-semibold tracking-tight'
                                style={{ color: 'oklch(0.16 0.012 250)' }}>
                                Hệ thống quản lý thiết bị
                            </h1>
                        </div>

                        {/* Form header */}
                        <div className='mb-8'>
                            <Text
                                className='mb-2 block text-[11px] font-bold uppercase tracking-[0.2em]'
                                style={{ color: 'oklch(0.50 0.18 250)' }}
                            >
                                {eyebrow}
                            </Text>
                            <Title
                                level={2}
                                className='!mb-2 !mt-1 !font-semibold !tracking-tight'
                                style={{ color: 'oklch(0.16 0.012 250)' }}
                            >
                                {title}
                            </Title>
                            <Text style={{ color: 'oklch(0.50 0.01 250)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
                                {subtitle}
                            </Text>
                        </div>

                        {/* Slot: form content from the page */}
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
};

export default AuthPageShell;
