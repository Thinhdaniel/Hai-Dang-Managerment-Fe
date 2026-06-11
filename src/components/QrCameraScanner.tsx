import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Input } from 'antd';
import { CameraOutlined, EnterOutlined, LoadingOutlined, SyncOutlined } from '@ant-design/icons';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// Quet QR bang @zxing/browser -> chay duoc tren ca iOS Safari, Android, desktop
const isScannerSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

const buildReader = () => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });
};

type QrCameraScannerProps = {
    active: boolean;
    onDetected: (rawValue: string) => void | Promise<void>;
    // Khoang nghi toi thieu sau moi lan nhan ma, tranh camera/API bi goi lap qua nhanh.
    cooldownMs?: number;
};

const QrCameraScanner: React.FC<QrCameraScannerProps> = ({ active, onDetected, cooldownMs = 2200 }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const lastHitRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
    const onDetectedRef = useRef(onDetected);
    const activeRef = useRef(active);
    const scanLockedRef = useRef(false);
    const cooldownTimerRef = useRef<number | null>(null);

    const [supported] = useState(isScannerSupported);
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'cooldown' | 'error'>('idle');
    const [errorText, setErrorText] = useState('');
    const [manualValue, setManualValue] = useState('');

    useEffect(() => {
        onDetectedRef.current = onDetected;
    }, [onDetected]);

    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    const clearCooldownTimer = useCallback(() => {
        if (cooldownTimerRef.current) {
            window.clearTimeout(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearCooldownTimer();
        };
    }, [clearCooldownTimer]);

    const releaseScanLock = useCallback(
        (delayMs: number) => {
            clearCooldownTimer();
            cooldownTimerRef.current = window.setTimeout(
                () => {
                    scanLockedRef.current = false;
                    cooldownTimerRef.current = null;
                    if (activeRef.current) {
                        setStatus((current) => (current === 'cooldown' ? 'running' : current));
                    }
                },
                Math.max(250, delayMs)
            );
        },
        [clearCooldownTimer]
    );

    const acceptDetectedValue = useCallback(
        (value: string) => {
            const now = Date.now();
            if (scanLockedRef.current) return false;
            if (lastHitRef.current.value === value && now - lastHitRef.current.at < cooldownMs) return false;

            scanLockedRef.current = true;
            lastHitRef.current = { value, at: now };
            setStatus((current) => (current === 'running' ? 'cooldown' : current));

            try {
                const result = onDetectedRef.current(value);
                void Promise.resolve(result)
                    .catch(() => {
                        setErrorText('Có lỗi khi xử lý mã vừa quét. Hãy thử lại sau vài giây.');
                    })
                    .finally(() => {
                        releaseScanLock(cooldownMs - (Date.now() - now));
                    });
            } catch {
                setErrorText('Có lỗi khi xử lý mã vừa quét. Hãy thử lại sau vài giây.');
                releaseScanLock(cooldownMs - (Date.now() - now));
            }

            return true;
        },
        [cooldownMs, releaseScanLock]
    );

    useEffect(() => {
        if (!active || !supported) {
            scanLockedRef.current = false;
            clearCooldownTimer();
            return;
        }

        let cancelled = false;
        const reader = buildReader();

        const start = async () => {
            try {
                setStatus('starting');
                setErrorText('');
                const video = videoRef.current;
                if (!video) return;

                const controls = await reader.decodeFromConstraints(
                    { video: { facingMode: { ideal: 'environment' } }, audio: false },
                    video,
                    (result) => {
                        if (!result) return;
                        const value = result.getText()?.trim();
                        if (!value) return;
                        acceptDetectedValue(value);
                    }
                );

                if (cancelled) {
                    controls.stop();
                    return;
                }
                controlsRef.current = controls;
                setStatus('running');
            } catch (err) {
                if (cancelled) return;
                setStatus('error');
                setErrorText(
                    err instanceof DOMException && err.name === 'NotAllowedError'
                        ? 'Bạn chưa cho phép truy cập camera. Hãy bật quyền camera cho trang rồi thử lại.'
                        : 'Không mở được camera trên thiết bị này. Bạn có thể nhập mã máy thủ công bên dưới.'
                );
            }
        };

        start();

        return () => {
            cancelled = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
            const video = videoRef.current;
            if (video) video.srcObject = null;
            scanLockedRef.current = false;
            clearCooldownTimer();
            setStatus('idle');
        };
    }, [acceptDetectedValue, active, clearCooldownTimer, supported]);

    const submitManual = () => {
        const value = manualValue.trim();
        if (!value) return;
        if (acceptDetectedValue(value)) {
            setManualValue('');
        }
    };

    return (
        <div className='flex flex-col gap-3'>
            {supported ? (
                <div className='relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900'>
                    <video ref={videoRef} className='h-full w-full object-cover' muted playsInline />
                    {/* Khung ngắm */}
                    <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
                        <div className='h-1/2 w-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' />
                    </div>
                    <div className='absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/45 py-2 text-xs font-medium text-white'>
                        {status === 'starting' ? (
                            <>
                                <LoadingOutlined /> Đang mở camera...
                            </>
                        ) : status === 'running' ? (
                            <>
                                <SyncOutlined spin /> Đưa mã QR trên máy vào khung
                            </>
                        ) : status === 'cooldown' ? (
                            <>
                                <LoadingOutlined /> Đã nhận mã, đợi hệ thống xử lý...
                            </>
                        ) : status === 'error' ? (
                            <span className='text-rose-200'>Camera không khả dụng</span>
                        ) : (
                            <>
                                <CameraOutlined /> Chuẩn bị camera...
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <Alert
                    type='warning'
                    showIcon
                    message='Trình duyệt không hỗ trợ quét QR bằng camera'
                    description='Hãy dùng trình duyệt hỗ trợ camera, hoặc nhập mã máy / ID tem thủ công bên dưới.'
                    className='rounded-xl'
                />
            )}

            {errorText ? <Alert type='error' showIcon message={errorText} className='rounded-xl' /> : null}

            <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3'>
                <div className='mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase'>
                    Nhập thủ công (nếu không quét được)
                </div>
                <Input.Search
                    value={manualValue}
                    placeholder='Mã máy, ID tem hoặc dán link QR...'
                    enterButton={<EnterOutlined />}
                    onChange={(event) => setManualValue(event.target.value)}
                    onSearch={submitManual}
                    allowClear
                />
            </div>
        </div>
    );
};

export default QrCameraScanner;
