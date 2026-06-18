import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Input, Modal, Segmented, Space, Tooltip } from 'antd';
import {
    ArrowRightOutlined,
    BorderOutlined,
    CheckOutlined,
    CloseOutlined,
    EditOutlined,
    FontSizeOutlined,
    HighlightOutlined,
    UndoOutlined,
} from '@ant-design/icons';

type AnnotationTool = 'pen' | 'circle' | 'arrow' | 'text';

type ImageAnnotationModalProps = {
    open: boolean;
    file?: File;
    previewUrl?: string;
    onApply: (file: File) => void;
    onClose: () => void;
};

type Point = {
    x: number;
    y: number;
};

const TOOL_OPTIONS: Array<{ label: React.ReactNode; value: AnnotationTool }> = [
    {
        value: 'pen',
        label: (
            <span className='chat-annotator__tool-label'>
                <HighlightOutlined />
                Vẽ
            </span>
        ),
    },
    {
        value: 'circle',
        label: (
            <span className='chat-annotator__tool-label'>
                <BorderOutlined />
                Khoanh
            </span>
        ),
    },
    {
        value: 'arrow',
        label: (
            <span className='chat-annotator__tool-label'>
                <ArrowRightOutlined />
                Mũi tên
            </span>
        ),
    },
    {
        value: 'text',
        label: (
            <span className='chat-annotator__tool-label'>
                <FontSizeOutlined />
                Note
            </span>
        ),
    },
];

const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#111827'];

const getCanvasPoint = (canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
};

const getLineWidth = (canvas: HTMLCanvasElement) => Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.012));

const prepareContext = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, color: string) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = getLineWidth(canvas);
};

const drawCircle = (ctx: CanvasRenderingContext2D, start: Point, end: Point) => {
    const width = end.x - start.x;
    const height = end.y - start.y;
    ctx.beginPath();
    ctx.ellipse(start.x + width / 2, start.y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
};

const drawArrow = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, start: Point, end: Point) => {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.max(28, Math.min(canvas.width, canvas.height) * 0.045);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
};

const drawText = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, point: Point, text: string, color: string) => {
    const value = text.trim() || 'Lỗi';
    const fontSize = Math.max(34, Math.round(Math.min(canvas.width, canvas.height) * 0.045));
    const padding = Math.round(fontSize * 0.36);

    ctx.save();
    ctx.font = `800 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const metrics = ctx.measureText(value);
    const boxWidth = metrics.width + padding * 2;
    const boxHeight = fontSize + padding * 1.8;
    const x = Math.min(Math.max(0, point.x), Math.max(0, canvas.width - boxWidth));
    const y = Math.min(Math.max(0, point.y), Math.max(0, canvas.height - boxHeight));

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, padding);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(value, x + padding, y + padding * 0.72);
    ctx.restore();
};

const canvasToFile = (canvas: HTMLCanvasElement, sourceFile?: File): Promise<File> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('Không xuất được ảnh'));
                    return;
                }

                const baseName = (sourceFile?.name || 'chat-image').replace(/\.[^.]+$/, '');
                resolve(
                    new File([blob], `${baseName}-marked.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    })
                );
            },
            'image/jpeg',
            0.9
        );
    });

const ImageAnnotationModal: React.FC<ImageAnnotationModalProps> = ({ open, file, previewUrl, onApply, onClose }) => {
    const { message } = App.useApp();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const startPointRef = useRef<Point | null>(null);
    const snapshotRef = useRef<ImageData | null>(null);
    const lastPointRef = useRef<Point | null>(null);
    const historyRef = useRef<string[]>([]);
    const [tool, setTool] = useState<AnnotationTool>('pen');
    const [color, setColor] = useState(COLORS[0]);
    const [note, setNote] = useState('Lỗi');
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);

    const pushHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        historyRef.current = [...historyRef.current.slice(-11), canvas.toDataURL('image/jpeg', 0.86)];
    };

    useEffect(() => {
        if (!open || !previewUrl) return;

        setReady(false);
        historyRef.current = [];

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const image = new Image();
        image.onload = () => {
            const maxEdge = 1600;
            const naturalWidth = image.naturalWidth || image.width;
            const naturalHeight = image.naturalHeight || image.height;
            const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
            canvas.width = Math.max(1, Math.round(naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(naturalHeight * scale));
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            pushHistory();
            setReady(true);
        };
        image.onerror = () => {
            setReady(false);
            message.error('Không mở được ảnh để đánh dấu');
        };
        image.src = previewUrl;
    }, [message, open, previewUrl]);

    const restoreSnapshot = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !snapshotRef.current) return;

        ctx.putImageData(snapshotRef.current, 0, 0);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !ready) return;

        const point = getCanvasPoint(canvas, event);
        prepareContext(ctx, canvas, color);

        if (tool === 'text') {
            drawText(ctx, canvas, point, note, color);
            pushHistory();
            return;
        }

        canvas.setPointerCapture(event.pointerId);
        drawingRef.current = true;
        startPointRef.current = point;
        lastPointRef.current = point;
        snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (tool === 'pen') {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const start = startPointRef.current;
        if (!canvas || !ctx || !start) return;

        const point = getCanvasPoint(canvas, event);
        prepareContext(ctx, canvas, color);

        if (tool === 'pen') {
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
            lastPointRef.current = point;
            return;
        }

        restoreSnapshot();
        if (tool === 'circle') {
            drawCircle(ctx, start, point);
        } else if (tool === 'arrow') {
            drawArrow(ctx, canvas, start, point);
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;

        const canvas = canvasRef.current;
        if (canvas?.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }

        drawingRef.current = false;
        startPointRef.current = null;
        snapshotRef.current = null;
        lastPointRef.current = null;
        pushHistory();
    };

    const handleUndo = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || historyRef.current.length <= 1) return;

        historyRef.current = historyRef.current.slice(0, -1);
        const previous = historyRef.current[historyRef.current.length - 1];
        const image = new Image();
        image.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        };
        image.src = previous;
    };

    const handleApply = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setLoading(true);
        try {
            const nextFile = await canvasToFile(canvas, file);
            onApply(nextFile);
        } catch {
            message.error('Không lưu được ảnh đã đánh dấu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            centered
            width={920}
            footer={null}
            onCancel={onClose}
            destroyOnHidden
            className='chat-annotator-modal'
        >
            <div className='chat-annotator'>
                <div className='chat-annotator__header'>
                    <div className='chat-annotator__title'>
                        <span className='chat-annotator__icon'>
                            <EditOutlined />
                        </span>
                        <div>
                            <strong>Đánh dấu ảnh lỗi</strong>
                            <span>Khoanh vùng, vẽ mũi tên hoặc thêm ghi chú trước khi gửi.</span>
                        </div>
                    </div>
                    <Button type='text' icon={<CloseOutlined />} onClick={onClose} className='chat-annotator__close' />
                </div>

                <div className='chat-annotator__toolbar'>
                    <Segmented value={tool} options={TOOL_OPTIONS} onChange={(value) => setTool(value as AnnotationTool)} />
                    <div className='chat-annotator__colors'>
                        {COLORS.map((item) => (
                            <button
                                key={item}
                                type='button'
                                className={item === color ? 'chat-annotator__color chat-annotator__color--active' : 'chat-annotator__color'}
                                style={{ background: item }}
                                onClick={() => setColor(item)}
                                aria-label={`Chọn màu ${item}`}
                            />
                        ))}
                    </div>
                    <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={32}
                        placeholder='Note trên ảnh'
                        className='chat-annotator__note'
                        disabled={tool !== 'text'}
                    />
                    <Space size={6} className='chat-annotator__actions'>
                        <Tooltip title='Hoàn tác'>
                            <Button icon={<UndoOutlined />} onClick={handleUndo} disabled={!ready || historyRef.current.length <= 1} />
                        </Tooltip>
                        <Button onClick={onClose}>Hủy</Button>
                        <Button type='primary' icon={<CheckOutlined />} loading={loading} disabled={!ready} onClick={handleApply}>
                            Áp dụng
                        </Button>
                    </Space>
                </div>

                <div className='chat-annotator__stage'>
                    {!ready ? <div className='chat-annotator__loading'>Đang mở ảnh...</div> : null}
                    <canvas
                        ref={canvasRef}
                        className={`chat-annotator__canvas ${tool === 'text' ? 'chat-annotator__canvas--text' : ''}`}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default ImageAnnotationModal;
