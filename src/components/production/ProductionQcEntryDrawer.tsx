import {
    AuditOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    CloseOutlined,
    DeleteOutlined,
    InfoCircleOutlined,
    PlusOutlined,
    SaveOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { Button, DatePicker, Drawer, Input, InputNumber, Popconfirm, Segmented, Select, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
    ProductionItem,
    ProductionLineRecord,
    ProductionQcInspectionType,
    ProductionQcSlotRecord,
    ProductionQcSlotValue,
    ProductionQcSourceType,
    ProductionTimeSlot,
    SaveProductionQcRecordPayload,
} from '../../core/types/production';
import { slotRangeLabelShort } from '../../core/lib/productionSlot';

const { TextArea } = Input;

type DraftInspection = {
    key: string;
    id?: string;
    itemId?: string;
    orderCode?: string;
    inspectionType: ProductionQcInspectionType;
    sourceType: ProductionQcSourceType;
    sourceProductionDate?: string;
    passedQuantity: number;
    defectQuantity: number;
    note?: string;
};

type Props = {
    open: boolean;
    mobile: boolean;
    line?: ProductionLineRecord;
    slot?: ProductionTimeSlot;
    value?: ProductionQcSlotValue;
    record?: ProductionQcSlotRecord;
    items: ProductionItem[];
    productionDate: string;
    readOnly?: boolean;
    saving?: boolean;
    deleting?: boolean;
    onClose: () => void;
    onSave: (payload: SaveProductionQcRecordPayload) => void;
    onDelete: () => void;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const draftKey = () => `qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ProductionQcEntryDrawer = ({
    open,
    mobile,
    line,
    slot,
    value,
    record,
    items,
    productionDate,
    readOnly,
    saving,
    deleting,
    onClose,
    onSave,
    onDelete,
}: Props) => {
    const [rows, setRows] = useState<DraftInspection[]>([]);
    const referenceRun = useMemo(
        () => line?.runs.find((run) => run.id === (value?.referenceRunId || value?.runId)),
        [line?.runs, value?.referenceRunId, value?.runId]
    );
    const legacyQuantity = !record ? Number(value?.unallocatedQuantity || 0) : 0;

    useEffect(() => {
        if (!open) return;
        if (record?.inspections.length) {
            setRows(
                record.inspections.map((entry) => ({
                    key: entry.id || draftKey(),
                    id: entry.id,
                    itemId: entry.itemId,
                    orderCode: entry.orderCode,
                    inspectionType: entry.inspectionType,
                    sourceType: entry.sourceType,
                    sourceProductionDate: entry.sourceProductionDate,
                    passedQuantity: Number(entry.passedQuantity || 0),
                    defectQuantity: Number(entry.defectQuantity || 0),
                    note: entry.note,
                }))
            );
            return;
        }
        setRows([
            {
                key: draftKey(),
                itemId: referenceRun?.itemId,
                orderCode: referenceRun?.orderCode,
                inspectionType: 'first_pass',
                sourceType: legacyQuantity > 0 ? 'carryover' : 'current_day',
                passedQuantity: legacyQuantity > 0 ? Number(value?.passedQuantity || 0) : 0,
                defectQuantity: legacyQuantity > 0 ? Number(value?.defectQuantity || 0) : 0,
                note: legacyQuantity > 0 ? value?.note : undefined,
            },
        ]);
    }, [legacyQuantity, open, record, referenceRun?.itemId, referenceRun?.orderCode, value]);

    const totals = useMemo(
        () =>
            rows.reduce(
                (result, row) => ({
                    passed: result.passed + Number(row.passedQuantity || 0),
                    defect: result.defect + Number(row.defectQuantity || 0),
                    firstPass:
                        result.firstPass +
                        (row.inspectionType === 'first_pass'
                            ? Number(row.passedQuantity || 0) + Number(row.defectQuantity || 0)
                            : 0),
                    recheck:
                        result.recheck +
                        (row.inspectionType === 'recheck'
                            ? Number(row.passedQuantity || 0) + Number(row.defectQuantity || 0)
                            : 0),
                }),
                { passed: 0, defect: 0, firstPass: 0, recheck: 0 }
            ),
        [rows]
    );
    const totalQuantity = totals.passed + totals.defect;
    const defectRate = totalQuantity > 0 ? (totals.defect / totalQuantity) * 100 : 0;
    const canSave = Boolean(
        !readOnly &&
        !saving &&
        rows.length > 0 &&
        rows.every(
            (row) =>
                row.itemId &&
                (row.passedQuantity + row.defectQuantity > 0 || String(row.note || '').trim().length >= 3) &&
                (row.sourceType !== 'carryover' || row.sourceProductionDate || String(row.note || '').trim())
        )
    );

    const patchRow = (key: string, patch: Partial<DraftInspection>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    const addRow = () =>
        setRows((current) => [
            ...current,
            {
                key: draftKey(),
                itemId: referenceRun?.itemId,
                orderCode: referenceRun?.orderCode,
                inspectionType: 'first_pass',
                sourceType: 'current_day',
                passedQuantity: 0,
                defectQuantity: 0,
            },
        ]);
    const save = () => {
        if (!canSave) return;
        onSave({
            inspections: rows.map((row) => ({
                ...(row.id ? { id: row.id } : {}),
                itemId: String(row.itemId),
                orderCode: row.orderCode?.trim() || undefined,
                inspectionType: row.inspectionType,
                sourceType: row.sourceType,
                sourceProductionDate: row.sourceType === 'carryover' ? row.sourceProductionDate : undefined,
                passedQuantity: Number(row.passedQuantity || 0),
                defectQuantity: Number(row.defectQuantity || 0),
                note: row.note?.trim() || undefined,
            })),
            expectedUpdatedAt: record?.updatedAt || null,
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
                <span>{line?.leaderName || line?.lineName || 'Kết quả QC theo mã hàng'}</span>
            </div>
        </div>
    );

    const actions = (
        <div className={`pd-qc-editor__actions ${record || value?.reported ? 'has-delete' : 'no-delete'}`}>
            {(record || value?.reported) && !readOnly ? (
                <Popconfirm
                    title='Xóa kết quả QC trong giờ?'
                    description='Toàn bộ mã hàng của chuyền trong khung giờ này sẽ bị xóa.'
                    okText='Xóa'
                    cancelText='Giữ lại'
                    okButtonProps={{ danger: true, loading: deleting }}
                    onConfirm={onDelete}
                >
                    <Button danger icon={<DeleteOutlined />} loading={deleting} aria-label='Xóa kết quả QC' />
                </Popconfirm>
            ) : null}
            {mobile ? <Button onClick={onClose}>Đóng</Button> : null}
            <Button type='primary' icon={<SaveOutlined />} loading={saving} disabled={!canSave} onClick={save}>
                Lưu {rows.length > 1 ? `${rows.length} mã` : 'kết quả'}
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
            ) : legacyQuantity > 0 ? (
                <div className='pd-qc-editor__notice is-legacy'>
                    <WarningFilled />
                    <span>
                        Dữ liệu cũ có {number(legacyQuantity)} SP chưa gán mã. Hãy kiểm tra mã hàng trước khi lưu chuyển
                        đổi.
                    </span>
                </div>
            ) : (
                <div className='pd-qc-editor__notice'>
                    <InfoCircleOutlined />
                    <span>Mỗi mã hàng là một dòng; tái kiểm được theo dõi riêng và không giảm tồn QC lần hai.</span>
                </div>
            )}

            <div className='pd-qc-editor__reference'>
                <div>
                    <small>Mã chuyền đang chạy · tham khảo</small>
                    <strong>{referenceRun?.itemCode || 'Không có mã trong giờ'}</strong>
                </div>
                <div>
                    <small>Sản lượng báo · tham khảo</small>
                    <strong>{number(value?.productionActualReference ?? value?.productionActual)}</strong>
                </div>
            </div>

            <div className='pd-qc-batch'>
                <div className='pd-qc-batch__head'>
                    <div>
                        <strong>Chi tiết mã hàng</strong>
                        <small>{rows.length} dòng trong khung giờ</small>
                    </div>
                    {!readOnly ? (
                        <Button type='dashed' icon={<PlusOutlined />} onClick={addRow} disabled={rows.length >= 30}>
                            Thêm mã
                        </Button>
                    ) : null}
                </div>
                <div className='pd-qc-batch__rows'>
                    {rows.map((row, index) => {
                        const rowTotal = row.passedQuantity + row.defectQuantity;
                        return (
                            <article className='pd-qc-inspection' key={row.key}>
                                <header>
                                    <span>Dòng {index + 1}</span>
                                    <Tag color={row.inspectionType === 'first_pass' ? 'blue' : 'gold'}>
                                        {row.inspectionType === 'first_pass' ? 'Kiểm lần đầu' : 'Tái kiểm'}
                                    </Tag>
                                    {rows.length > 1 && !readOnly ? (
                                        <Button
                                            type='text'
                                            danger
                                            icon={<CloseOutlined />}
                                            onClick={() =>
                                                setRows((current) => current.filter((item) => item.key !== row.key))
                                            }
                                            aria-label={`Xóa dòng ${index + 1}`}
                                        />
                                    ) : null}
                                </header>
                                <label className='pd-qc-inspection__item'>
                                    <span>Mã hàng</span>
                                    <Select
                                        showSearch
                                        value={row.itemId}
                                        onChange={(itemId) => patchRow(row.key, { itemId })}
                                        disabled={readOnly}
                                        placeholder='Chọn đúng mã QC đang kiểm'
                                        optionFilterProp='label'
                                        options={items.map((item) => ({
                                            value: item.id,
                                            label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                                        }))}
                                    />
                                </label>
                                <Segmented<ProductionQcInspectionType>
                                    value={row.inspectionType}
                                    onChange={(inspectionType) => patchRow(row.key, { inspectionType })}
                                    disabled={readOnly}
                                    block
                                    options={[
                                        { label: 'Kiểm lần đầu', value: 'first_pass' },
                                        { label: 'Tái kiểm', value: 'recheck' },
                                    ]}
                                />
                                <div className='pd-qc-inspection__source'>
                                    <Select<ProductionQcSourceType>
                                        value={row.sourceType}
                                        onChange={(sourceType) =>
                                            patchRow(row.key, {
                                                sourceType,
                                                sourceProductionDate:
                                                    sourceType === 'current_day' ? undefined : row.sourceProductionDate,
                                            })
                                        }
                                        disabled={readOnly}
                                        options={[
                                            { value: 'current_day', label: 'Sản trong ngày' },
                                            { value: 'carryover', label: 'Hàng tồn trước' },
                                        ]}
                                    />
                                    {row.sourceType === 'carryover' ? (
                                        <DatePicker
                                            value={row.sourceProductionDate ? dayjs(row.sourceProductionDate) : null}
                                            onChange={(next) =>
                                                patchRow(row.key, {
                                                    sourceProductionDate: next?.format('YYYY-MM-DD'),
                                                })
                                            }
                                            disabled={readOnly}
                                            placeholder='Ngày sản xuất (nếu biết)'
                                            format='DD/MM/YYYY'
                                            disabledDate={(current) => current.isAfter(dayjs(productionDate), 'day')}
                                        />
                                    ) : null}
                                </div>
                                <div className='pd-qc-inspection__numbers'>
                                    <label className='is-passed'>
                                        <span>
                                            <CheckCircleFilled /> Đạt
                                        </span>
                                        <InputNumber
                                            min={0}
                                            max={100000000}
                                            precision={0}
                                            controls={false}
                                            value={row.passedQuantity}
                                            onChange={(next) =>
                                                patchRow(row.key, { passedQuantity: Math.max(0, Number(next || 0)) })
                                            }
                                            disabled={readOnly}
                                            inputMode='numeric'
                                        />
                                    </label>
                                    <label className='is-defect'>
                                        <span>
                                            <CloseCircleFilled /> Lỗi
                                        </span>
                                        <InputNumber
                                            min={0}
                                            max={100000000}
                                            precision={0}
                                            controls={false}
                                            value={row.defectQuantity}
                                            onChange={(next) =>
                                                patchRow(row.key, { defectQuantity: Math.max(0, Number(next || 0)) })
                                            }
                                            disabled={readOnly}
                                            inputMode='numeric'
                                        />
                                    </label>
                                    <span className='pd-qc-inspection__total'>
                                        <small>Tổng kiểm</small>
                                        <strong>{number(rowTotal)}</strong>
                                    </span>
                                </div>
                                <div className='pd-qc-inspection__meta'>
                                    <Input
                                        value={row.orderCode}
                                        onChange={(event) => patchRow(row.key, { orderCode: event.target.value })}
                                        disabled={readOnly}
                                        placeholder='Mã đơn hàng (nếu có)'
                                        maxLength={80}
                                    />
                                    <TextArea
                                        value={row.note}
                                        onChange={(event) => patchRow(row.key, { note: event.target.value })}
                                        disabled={readOnly}
                                        placeholder='Ghi chú lỗi, lô tồn hoặc tình trạng tái kiểm'
                                        autoSize={{ minRows: 1, maxRows: 3 }}
                                        maxLength={500}
                                    />
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>

            <div className='pd-qc-editor__result' aria-live='polite'>
                <div>
                    <small>Tổng thao tác QC</small>
                    <strong>{number(totalQuantity)}</strong>
                    <span>
                        Lần đầu {number(totals.firstPass)} · Tái kiểm {number(totals.recheck)}
                    </span>
                </div>
                <div className={totals.defect > 0 ? 'has-defect' : ''}>
                    <small>Tỷ lệ lỗi trong lượt</small>
                    <strong>{defectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</strong>
                    <span>{totals.defect ? `${number(totals.defect)} sản phẩm` : 'Không phát hiện lỗi'}</span>
                </div>
            </div>
        </div>
    );

    if (mobile) {
        return (
            <Drawer
                open={open}
                onClose={onClose}
                placement='bottom'
                height='min(94dvh, 860px)'
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
                    <p>Mỗi khung giờ có thể ghi nhận nhiều mã hàng.</p>
                </div>
            )}
        </aside>
    );
};

export default ProductionQcEntryDrawer;
