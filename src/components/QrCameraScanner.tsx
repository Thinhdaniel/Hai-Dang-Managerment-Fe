import React, { useEffect, useRef, useState } from 'react';
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
    onDetected: (rawValue: string) => void;
    // Khoang nghi giua 2 lan bao cung mot ma (tranh quet lap) — ms
    cooldownMs?: number;
};

const QrCameraScanner: React.FC<QrCameraScannerProps> = ({ active, onDetected, cooldownMs = 1800 }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const lastHitRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
    const onDetectedRef = useRef(onDetected);

    const [supported] = useState(isScannerSupported);
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
    const [errorText, setErrorText] = useState('');
    const [manualValue, setManualValue] = useState('');

    useEffect(() => {
        onDetectedRef.current = onDetected;
    }, [onDetected]);

    useEffect(() => {
        if (!active || !supported) {
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
                        const now = Date.now();
                        if (!value) return;
                        if (lastHitRef.current.value === value && now - lastHitRef.current.at < cooldownMs) return;
                        lastHitRef.current = { value, at: now };
                        onDetectedRef.current(value);
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
            setStatus('idle');
        };
    }, [active, supported, cooldownMs]);

    const submitManual = () => {
        const value = manualValue.trim();
        if (!value) return;
        onDetectedRef.current(value);
        setManualValue('');
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
