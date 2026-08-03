import {
    AuditOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    CloseOutlined,
    DeleteOutlined,
    InfoCircleOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Input, InputNumber, Popconfirm } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
    ProductionLineRecord,
    ProductionQcSlotValue,
    ProductionTimeSlot,
    SaveProductionQcEntryPayload,
} from '../../core/types/production';
import { slotRangeLabelShort } from '../../core/lib/productionSlot';

const { TextArea } = Input;

type Props = {
    open: boolean;
    mobile: boolean;
    line?: ProductionLineRecord;
    slot?: ProductionTimeSlot;
    value?: ProductionQcSlotValue;
    readOnly?: boolean;
    saving?: boolean;
    deleting?: boolean;
    onClose: () => void;
    onSave: (payload: SaveProductionQcEntryPayload) => void;
    onDelete: (entryId: string) => void;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const ProductionQcEntryDrawer = ({
    open,
    mobile,
    line,
    slot,
    value,
    readOnly,
    saving,
    deleting,
    onClose,
    onSave,
    onDelete,
}: Props) => {
    const [passedQuantity, setPassedQuantity] = useState(0);
    const [defectQuantity, setDefectQuantity] = useState(0);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!open) return;
        setPassedQuantity(Number(value?.passedQuantity || 0));
        setDefectQuantity(Number(value?.defectQuantity || 0));
        setNote(value?.note || '');
    }, [open, value]);

    const totalQuantity = passedQuantity + defectQuantity;
    const defectRate = totalQuantity > 0 ? (defectQuantity / totalQuantity) * 100 : 0;
    const referenceRun = useMemo(
        () => line?.runs.find((run) => run.id === (value?.referenceRunId || value?.runId)),
        [line?.runs, value?.referenceRunId, value?.runId]
    );
    const canSave = Boolean(!readOnly && !saving && (totalQuantity > 0 || note.trim().length >= 3));
    const entryId = value?.entryIds[0];

    const save = () => {
        if (!canSave) return;
        onSave({
            runId: referenceRun?.id,
            passedQuantity,
            defectQuantity,
            totalQuantity,
            note: note.trim() || undefined,
            expectedUpdatedAt: value?.reported ? value.updatedAt : null,
        });
    };

    const header = (
        <div className='pd-qc-editor__heading'>
            <span className='pd-qc-editor__symbol'>
                <AuditOutlined />
            </span>
            <div>
                <small>{slot ? slotRangeLabelShort(slot) : 'Khung giờ kiểm'}</small>
                <strong>{line?.lineCode || 'Chọn một chuyền'}</strong>
                <span>{line?.leaderName || line?.lineName || 'Kết quả QC thực tế'}</span>
            </div>
        </div>
    );

    const actions = (
        <div className={`pd-qc-editor__actions ${entryId && !readOnly ? 'has-delete' : 'no-delete'}`}>
            {entryId && !readOnly ? (
                <Popconfirm
                    title='Xóa kết quả QC?'
                    description='Khung giờ này sẽ trở lại trạng thái chưa nhập.'
                    okText='Xóa'
                    cancelText='Giữ lại'
                    okButtonProps={{ danger: true, loading: deleting }}
                    onConfirm={() => onDelete(entryId)}
                >
                    <Button danger icon={<DeleteOutlined />} loading={deleting} aria-label='Xóa kết quả QC' />
                </Popconfirm>
            ) : null}
            {mobile ? <Button onClick={onClose}>Đóng</Button> : null}
            <Button type='primary' icon={<SaveOutlined />} loading={saving} disabled={!canSave} onClick={save}>
                Lưu kết quả
            </Button>
        </div>
    );

    const content: ReactNode = (
        <div className='pd-qc-editor__content'>
            {readOnly ? (
                <div className='pd-qc-editor__notice is-locked'>
                    <InfoCircleOutlined />
                    <span>Ngày đã khóa sổ. Kết quả QC chỉ có thể xem.</span>
                </div>
            ) : (
                <div className='pd-qc-editor__notice'>
                    <InfoCircleOutlined />
                    <span>Nhập số thực tế QC kiểm trong giờ; không giới hạn theo sản lượng chuyền.</span>
                </div>
            )}

            <div className='pd-qc-editor__reference'>
                <div>
                    <small>Mã chuyền đang chạy</small>
                    <strong>{referenceRun?.itemCode || 'Không có mã trong giờ'}</strong>
                </div>
                <div>
                    <small>Sản lượng báo · tham khảo</small>
                    <strong>{number(value?.productionActualReference ?? value?.productionActual)}</strong>
                </div>
            </div>

            <div className='pd-qc-editor__fields' aria-label='Nhập kết quả kiểm tra chất lượng'>
                <label className='pd-qc-editor__field is-passed'>
                    <span>
                        <CheckCircleFilled /> Đạt
                    </span>
                    <InputNumber
                        min={0}
                        max={100000000}
                        precision={0}
                        controls={false}
                        value={passedQuantity}
                        onChange={(next) => setPassedQuantity(Math.max(0, Number(next || 0)))}
                        disabled={readOnly}
                        inputMode='numeric'
                        aria-label='Số lượng đạt'
                    />
                </label>
                <label className='pd-qc-editor__field is-defect'>
                    <span>
                        <CloseCircleFilled /> Lỗi
                    </span>
                    <InputNumber
                        min={0}
                        max={100000000}
                        precision={0}
                        controls={false}
                        value={defectQuantity}
                        onChange={(next) => setDefectQuantity(Math.max(0, Number(next || 0)))}
                        disabled={readOnly}
                        inputMode='numeric'
                        aria-label='Số lượng lỗi'
                    />
                </label>
            </div>

            <div className='pd-qc-editor__result' aria-live='polite'>
                <div>
                    <small>Tổng kiểm</small>
                    <strong>{number(totalQuantity)}</strong>
                    <span>Đạt + Lỗi</span>
                </div>
                <div className={defectQuantity > 0 ? 'has-defect' : ''}>
                    <small>Tỷ lệ lỗi</small>
                    <strong>{defectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</strong>
                    <span>{defectQuantity ? `${number(defectQuantity)} sản phẩm` : 'Không phát hiện lỗi'}</span>
                </div>
            </div>

            <label className='pd-qc-editor__note'>
                <span>Ghi chú</span>
                <TextArea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={500}
                    showCount
                    disabled={readOnly}
                    placeholder='Ví dụ: kiểm hàng tồn, lỗi đường may, chờ kiểm lại...'
                />
                {totalQuantity === 0 && !readOnly ? <small>Cần ghi chú nếu lưu kết quả bằng 0.</small> : null}
            </label>
        </div>
    );

    if (mobile) {
        return (
            <Drawer
                open={open}
                onClose={onClose}
                placement='bottom'
                height='min(86dvh, 700px)'
                className='pd-qc-editor-drawer'
                title={header}
                footer={actions}
                destroyOnHidden
            >
                {content}
            </Drawer>
        );
    }

    return (
        <aside className={`pd-qc-editor ${open ? 'is-open' : 'is-empty'}`} aria-label='Nhập kết quả QC'>
            {open ? (
                <>
                    <header>
                        {header}
                        <Button type='text' icon={<CloseOutlined />} onClick={onClose} aria-label='Đóng bảng nhập QC' />
                    </header>
                    {content}
                    <footer>{actions}</footer>
                </>
            ) : (
                <div className='pd-qc-editor__empty'>
                    <span>
                        <AuditOutlined />
                    </span>
                    <strong>Chọn chuyền để nhập QC</strong>
                    <p>Kết quả được ghi theo khung giờ đang chọn.</p>
                </div>
            )}
        </aside>
    );
};

export default ProductionQcEntryDrawer;
