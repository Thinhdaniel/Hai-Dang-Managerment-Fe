import { ArrowRightOutlined, CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, useState } from 'react';
import type { ProductionLineRecord } from '../../core/types/production';

type Props = {
    slotLabel: string;
    missingLines: ProductionLineRecord[];
    /** Số chuyền có mã chạy trong khung giờ đang chọn. */
    dueCount: number;
    readOnly?: boolean;
    onOpenLine: (line: ProductionLineRecord) => void;
};

/**
 * Dock đáy trang: gom các chuyền chưa báo của khung giờ đang chọn.
 * Đủ hết → hiện dải xanh xác nhận rồi tự ẩn sau 4 giây.
 */
const ProductionMissingDock = ({ slotLabel, missingLines, dueCount, readOnly, onOpenLine }: Props) => {
    const complete = dueCount > 0 && missingLines.length === 0;
    const [showComplete, setShowComplete] = useState(false);

    useEffect(() => {
        if (!complete) {
            setShowComplete(false);
            return;
        }
        setShowComplete(true);
        const timer = window.setTimeout(() => setShowComplete(false), 4000);
        return () => window.clearTimeout(timer);
    }, [complete, slotLabel]);

    if (readOnly || dueCount === 0) return null;

    if (complete) {
        if (!showComplete) return null;
        return (
            <section className='pd-dock is-complete' aria-live='polite'>
                <span className='pd-dock__label'>
                    <CheckCircleFilled /> Khung {slotLabel} đã báo đủ {dueCount}/{dueCount} chuyền
                </span>
            </section>
        );
    }

    return (
        <section className='pd-dock' aria-live='polite'>
            <span className='pd-dock__label'>
                <WarningFilled /> Còn thiếu {missingLines.length} chuyền khung {slotLabel}
            </span>
            <div className='pd-dock__chips'>
                {missingLines.map((line) => (
                    <button
                        key={line.lineId}
                        type='button'
                        className='pd-dock__chip'
                        title={line.leaderName || line.lineName || undefined}
                        onClick={() => onOpenLine(line)}
                    >
                        {line.lineCode}
                    </button>
                ))}
            </div>
            <Button type='primary' icon={<ArrowRightOutlined />} onClick={() => onOpenLine(missingLines[0])}>
                Nhập lần lượt
            </Button>
        </section>
    );
};

export default ProductionMissingDock;
