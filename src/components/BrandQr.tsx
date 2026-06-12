import React, { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { getHdQrIcon } from '../core/lib/qrBranding';

// QR thương hiệu Hải Đăng: đen trắng thuần, chấm bo tròn + mắt góc bo tròn kiểu
// QR brand lớn (Zalo/Momo), badge "HD" giữa lòng. Render canvas để giữ nguyên
// flow xuất PDF/PNG hiện có (querySelector('canvas') + toDataURL).
// errorCorrectionLevel 'H' cho phép badge che ~30% mà vẫn quét nhạy.

type BrandQrProps = {
    value: string;
    size: number;
    className?: string;
};

const BrandQr: React.FC<BrandQrProps> = ({ value, size, className }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = containerRef.current;
        if (!node || !value) return;

        const qr = new QRCodeStyling({
            type: 'canvas',
            width: size,
            height: size,
            data: value,
            // Quiet zone: viền trắng ~4% mỗi bên nằm ngay trong canvas
            margin: Math.round(size * 0.04),
            qrOptions: { errorCorrectionLevel: 'H' },
            image: getHdQrIcon(),
            imageOptions: {
                imageSize: 0.28,
                margin: Math.round(size * 0.012),
                hideBackgroundDots: true,
                crossOrigin: 'anonymous',
            },
            dotsOptions: { color: '#000000', type: 'rounded' },
            cornersSquareOptions: { color: '#000000', type: 'extra-rounded' },
            cornersDotOptions: { color: '#000000', type: 'dot' },
            backgroundOptions: { color: '#ffffff' },
        });

        node.innerHTML = '';
        qr.append(node);

        return () => {
            node.innerHTML = '';
        };
    }, [value, size]);

    return <div ref={containerRef} className={className} style={{ lineHeight: 0 }} />;
};

export default BrandQr;
