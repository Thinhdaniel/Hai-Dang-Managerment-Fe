import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Input, Tag } from 'antd';
import { CameraOutlined, EnterOutlined, LoadingOutlined, RadarChartOutlined, ScanOutlined } from '@ant-design/icons';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

type NativeBarcode = {
    rawValue?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
};

type NativeBarcodeDetector = {
    detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]>;
};

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

export type QrSweepEngine = 'barcode_detector' | 'zxing';

export type QrSweepTelemetry = {
    engine: QrSweepEngine;
    framesProcessed: number;
    detections: number;
    uniqueDetected: number;
};

type OverlayBox = {
    key: string;
    label: string;
    left: number;
    top: number;
    width: number;
    height: number;
};

type QrSweepScannerProps = {
    active: boolean;
    onDetected: (rawValue: string) => void | Promise<void>;
    onTelemetryChange?: (telemetry: QrSweepTelemetry) => void;
};

const isScannerSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

const getNativeBarcodeDetector = () =>
    (window as typeof window & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;

const buildZxingReader = () => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
};

const initialTelemetry = (engine: QrSweepEngine): QrSweepTelemetry => ({
    engine,
    framesProcessed: 0,
    detections: 0,
    uniqueDetected: 0,
});

const QrSweepScanner: React.FC<QrSweepScannerProps> = ({ active, onDetected, onTelemetryChange }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const uniqueValuesRef = useRef(new Set<string>());
    const onDetectedRef = useRef(onDetected);
    const onTelemetryChangeRef = useRef(onTelemetryChange);
    const telemetryRef = useRef<QrSweepTelemetry>(initialTelemetry('zxing'));

    const [supported] = useState(isScannerSupported);
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
    const [engine, setEngine] = useState<QrSweepEngine>('zxing');
    const [errorText, setErrorText] = useState('');
    const [manualValue, setManualValue] = useState('');
    const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([]);
    const [uniqueCount, setUniqueCount] = useState(0);

    useEffect(() => {
        onDetectedRef.current = onDetected;
    }, [onDetected]);

    useEffect(() => {
        onTelemetryChangeRef.current = onTelemetryChange;
    }, [onTelemetryChange]);

    const publishTelemetry = useCallback((next: QrSweepTelemetry) => {
        telemetryRef.current = next;
        onTelemetryChangeRef.current?.(next);
    }, []);

    const acceptValue = useCallback(
        (rawValue: string) => {
            const value = rawValue.trim();
            if (!value) return;
            if (uniqueValuesRef.current.has(value)) return;

            uniqueValuesRef.current.add(value);
            setUniqueCount(uniqueValuesRef.current.size);
            publishTelemetry({
                ...telemetryRef.current,
                detections: telemetryRef.current.detections + 1,
                uniqueDetected: uniqueValuesRef.current.size,
            });

            void Promise.resolve(onDetectedRef.current(value)).catch(() => undefined);
        },
        [publishTelemetry]
    );

    const stopScanner = useCallback(() => {
        if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        controlsRef.current?.stop();
        controlsRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const video = videoRef.current;
        if (video) video.srcObject = null;
    }, []);

    const mapOverlayBoxes = useCallback((items: NativeBarcode[]) => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) return [];

        const container = video.parentElement?.getBoundingClientRect();
        if (!container?.width || !container.height) return [];

        const scale = Math.max(container.width / video.videoWidth, container.height / video.videoHeight);
        const renderedWidth = video.videoWidth * scale;
        const renderedHeight = video.videoHeight * scale;
        const offsetX = (container.width - renderedWidth) / 2;
        const offsetY = (container.height - renderedHeight) / 2;

        return items
            .filter((item) => item.boundingBox && item.rawValue)
            .map((item, index) => {
                const box = item.boundingBox!;
                return {
                    key: `${item.rawValue}-${index}`,
                    label: item.rawValue!.slice(-12),
                    left: ((box.x * scale + offsetX) / container.width) * 100,
                    top: ((box.y * scale + offsetY) / container.height) * 100,
                    width: (box.width * scale * 100) / container.width,
                    height: (box.height * scale * 100) / container.height,
                };
            });
    }, []);

    useEffect(() => {
        if (!active || !supported) {
            stopScanner();
            setStatus('idle');
            return;
        }

        let cancelled = false;
        let lastFrameAt = 0;
        let detectingFrame = false;

        const resetSession = (selectedEngine: QrSweepEngine) => {
            uniqueValuesRef.current.clear();
            setUniqueCount(0);
            setOverlayBoxes([]);
            setEngine(selectedEngine);
            publishTelemetry(initialTelemetry(selectedEngine));
        };

        const startNative = async (Detector: NativeBarcodeDetectorConstructor) => {
            const video = videoRef.current;
            if (!video) return;

            resetSession('barcode_detector');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            });
            if (cancelled) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            video.srcObject = stream;
            await video.play();
            const detector = new Detector({ formats: ['qr_code'] });
            setStatus('running');

            const detectFrame = async (time: number) => {
                if (cancelled) return;
                animationFrameRef.current = window.requestAnimationFrame(detectFrame);
                if (detectingFrame || time - lastFrameAt < 140 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
                    return;
                lastFrameAt = time;
                detectingFrame = true;

                try {
                    const barcodes = await detector.detect(video);
                    telemetryRef.current = {
                        ...telemetryRef.current,
                        framesProcessed: telemetryRef.current.framesProcessed + 1,
                    };
                    if (!barcodes.length) {
                        setOverlayBoxes((current) => (current.length ? [] : current));
                        return;
                    }
                    setOverlayBoxes(mapOverlayBoxes(barcodes));
                    barcodes.forEach((barcode) => barcode.rawValue && acceptValue(barcode.rawValue));
                } catch {
                    // Frame co the bi bo qua khi camera dang doi focus; tiep tuc frame sau.
                } finally {
                    detectingFrame = false;
                }
            };
            animationFrameRef.current = window.requestAnimationFrame(detectFrame);
        };

        const startZxing = async () => {
            const video = videoRef.current;
            if (!video) return;

            resetSession('zxing');
            const reader = buildZxingReader();
            const controls = await reader.decodeFromConstraints(
                {
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                },
                video,
                (result) => {
                    telemetryRef.current = {
                        ...telemetryRef.current,
                        framesProcessed: telemetryRef.current.framesProcessed + 1,
                    };
                    const value = result?.getText()?.trim();
                    if (value) acceptValue(value);
                }
            );
            if (cancelled) {
                controls.stop();
                return;
            }
            controlsRef.current = controls;
            setStatus('running');
        };

        const start = async () => {
            setStatus('starting');
            setErrorText('');
            stopScanner();
            try {
                const Detector = getNativeBarcodeDetector();
                if (Detector) {
                    try {
                        await startNative(Detector);
                        return;
                    } catch {
                        stopScanner();
                    }
                }
                await startZxing();
            } catch (error) {
                if (cancelled) return;
                setStatus('error');
                setErrorText(
                    error instanceof DOMException && error.name === 'NotAllowedError'
                        ? 'Chưa có quyền camera. Hãy cấp quyền rồi mở lại chế độ quét nhanh.'
                        : 'Không mở được camera quét nhanh. Bạn vẫn có thể nhập mã thủ công hoặc chuyển sang quét từng tem.'
                );
            }
        };

        void start();
        return () => {
            cancelled = true;
            stopScanner();
        };
    }, [acceptValue, active, mapOverlayBoxes, publishTelemetry, stopScanner, supported]);

    const submitManual = () => {
        const value = manualValue.trim();
        if (!value) return;
        acceptValue(value);
        setManualValue('');
    };

    return (
        <div className='flex flex-col gap-3'>
            {supported ? (
                <div className='qr-sweep-camera relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 sm:aspect-[4/3]'>
                    <video ref={videoRef} className='h-full w-full object-cover' muted playsInline />
                    <div className='qr-sweep-camera__shade pointer-events-none absolute inset-0' />
                    <div className='qr-sweep-camera__scan-line pointer-events-none absolute inset-x-[8%] top-1/2 h-px' />

                    {overlayBoxes.map((box) => (
                        <div
                            key={box.key}
                            className='qr-sweep-camera__box pointer-events-none absolute'
                            style={{
                                left: `${box.left}%`,
                                top: `${box.top}%`,
                                width: `${box.width}%`,
                                height: `${box.height}%`,
                            }}
                        >
                            <span>{box.label}</span>
                        </div>
                    ))}

                    <div className='absolute top-3 left-3 flex items-center gap-2'>
                        <Tag className='!m-0 !border-white/15 !bg-black/45 !text-white backdrop-blur-md'>
                            <RadarChartOutlined className='mr-1' />
                            {engine === 'barcode_detector' ? 'Đa QR' : 'Quét liên tục'}
                        </Tag>
                    </div>
                    <div className='absolute top-3 right-3 rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-right text-white backdrop-blur-md'>
                        <div className='text-lg leading-none font-black'>{uniqueCount}</div>
                        <div className='mt-1 text-[10px] font-semibold tracking-wide text-white/70 uppercase'>
                            Mã đã thấy
                        </div>
                    </div>

                    <div className='absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-black/55 px-3 py-2.5 text-xs font-medium text-white backdrop-blur-md'>
                        {status === 'starting' ? (
                            <span className='flex items-center gap-2'>
                                <LoadingOutlined /> Đang mở camera quét nhanh...
                            </span>
                        ) : status === 'running' ? (
                            <span className='flex items-center gap-2'>
                                <ScanOutlined /> Đi chậm dọc dãy máy, giữ QR đủ sáng và rõ nét
                            </span>
                        ) : status === 'error' ? (
                            <span className='text-rose-200'>Camera không khả dụng</span>
                        ) : (
                            <span className='flex items-center gap-2'>
                                <CameraOutlined /> Sẵn sàng quét xưởng
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <Alert
                    type='warning'
                    showIcon
                    message='Thiết bị không hỗ trợ camera web'
                    description='Hãy nhập mã thủ công hoặc dùng thiết bị có trình duyệt hỗ trợ camera.'
                    className='rounded-xl'
                />
            )}

            {errorText ? <Alert type='error' showIcon message={errorText} className='rounded-xl' /> : null}

            <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3'>
                <div className='mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase'>
                    Nhập bổ sung
                </div>
                <Input.Search
                    value={manualValue}
                    placeholder='Mã máy, ID tem hoặc link QR...'
                    enterButton={<EnterOutlined />}
                    onChange={(event) => setManualValue(event.target.value)}
                    onSearch={submitManual}
                    allowClear
                />
            </div>
        </div>
    );
};

export default QrSweepScanner;
