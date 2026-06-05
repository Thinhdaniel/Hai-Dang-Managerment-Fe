import { useEffect, useState } from 'react';
import { App, Button, Grid } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
    standalone?: boolean;
};

const isInstalled = () => {
    const nav = window.navigator as NavigatorWithStandalone;
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

const isIos = () => {
    const nav = window.navigator;
    const ua = nav.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && nav.maxTouchPoints > 1);
};

const InstallPrompt = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showIosHelp, setShowIosHelp] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || isInstalled()) return;

        setShowIosHelp(isIos());

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
        };

        const handleInstalled = () => {
            setDeferredPrompt(null);
            setShowIosHelp(false);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleInstalled);
        };
    }, []);

    if (!deferredPrompt && !showIosHelp) return null;

    const handleInstall = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice.catch(() => null);
            setDeferredPrompt(null);
            return;
        }

        message.info('iPhone/iPad: mở Safari, bấm Chia sẻ, rồi chọn Thêm vào Màn hình chính.');
    };

    return (
        <Button
            size='small'
            icon={<DownloadOutlined />}
            onClick={handleInstall}
            className='pwa-install-button h-9 rounded-xl border-slate-200 bg-white/92 font-semibold text-slate-700 shadow-sm hover:!border-blue-200 hover:!bg-blue-50 hover:!text-blue-700'
        >
            {screens.sm ? 'Cài app' : null}
        </Button>
    );
};

export default InstallPrompt;
