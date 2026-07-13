import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Empty, Grid, Input, Tabs, Tag, Typography } from 'antd';
import { EyeOutlined, FileTextOutlined, SaveOutlined } from '@ant-design/icons';
import type { AiDigest } from '../core/types';
import type { DigestEditorialUpdate } from '../core/services/digest.service';

const { Text } = Typography;

type Props = {
    open: boolean;
    digest?: AiDigest;
    saving?: boolean;
    onClose: () => void;
    onSave: (payload: DigestEditorialUpdate) => void | Promise<void>;
};

const joinLines = (items?: string[]) => (items || []).join('\n');
const splitLines = (value: string) =>
    Array.from(
        new Set(
            value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );

const materialKey = (item: any) =>
    `${String(item?.materialId || item?.materialCode || item?.materialName || '')}:${String(item?.plantId || item?.plantName || '')}`;

const toggleHidden = (values: string[], key: string, visible: boolean) =>
    visible ? values.filter((value) => value !== key) : Array.from(new Set([...values, key]));

const EmptySection = () => (
    <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description='Không có dữ liệu trong kỳ'
        className='digest-editor-empty'
    />
);

const ExecutiveDigestEditorDrawer = ({ open, digest, saving, onClose, onSave }: Props) => {
    const screens = Grid.useBreakpoint();
    const [narrative, setNarrative] = useState('');
    const [highlights, setHighlights] = useState('');
    const [alerts, setAlerts] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [note, setNote] = useState('');
    const [hiddenIncidentIds, setHiddenIncidentIds] = useState<string[]>([]);
    const [hiddenRepairIds, setHiddenRepairIds] = useState<string[]>([]);
    const [hiddenMaterialKeys, setHiddenMaterialKeys] = useState<string[]>([]);
    const [hiddenPlantIds, setHiddenPlantIds] = useState<string[]>([]);

    useEffect(() => {
        if (!open || !digest) return;
        setNarrative(digest.narrative || '');
        setHighlights(joinLines(digest.highlights));
        setAlerts(joinLines(digest.alerts));
        setRecommendations(joinLines(digest.recommendations));
        setNote('');
        setHiddenIncidentIds(digest.editorial?.hiddenIncidentIds || []);
        setHiddenRepairIds(digest.editorial?.hiddenRepairIds || []);
        setHiddenMaterialKeys(digest.editorial?.hiddenMaterialKeys || []);
        setHiddenPlantIds(digest.editorial?.hiddenPlantIds || []);
    }, [digest, open]);

    const hiddenCount =
        hiddenIncidentIds.length + hiddenRepairIds.length + hiddenMaterialKeys.length + hiddenPlantIds.length;

    const payload = useMemo<DigestEditorialUpdate>(
        () => ({
            narrative: narrative.trim(),
            highlights: splitLines(highlights),
            alerts: splitLines(alerts),
            recommendations: splitLines(recommendations),
            editorial: { hiddenIncidentIds, hiddenRepairIds, hiddenMaterialKeys, hiddenPlantIds },
            note: note.trim() || undefined,
        }),
        [
            alerts,
            hiddenIncidentIds,
            hiddenMaterialKeys,
            hiddenPlantIds,
            hiddenRepairIds,
            highlights,
            narrative,
            note,
            recommendations,
        ]
    );

    const contentTab = (
        <div className='digest-editor-pane'>
            <div className='digest-editor-intro'>
                <FileTextOutlined />
                <div>
                    <strong>Nội dung dành cho người ra quyết định</strong>
                    <Text type='secondary'>Số KPI được khóa theo snapshot; phần này chỉ biên tập cách diễn giải.</Text>
                </div>
            </div>
            <label className='digest-editor-field'>
                <span>
                    Tóm tắt điều hành <small>{narrative.length}/4000</small>
                </span>
                <Input.TextArea
                    value={narrative}
                    rows={8}
                    maxLength={4000}
                    onChange={(event) => setNarrative(event.target.value)}
                    placeholder='Nêu kết quả, rủi ro và quyết định cần chốt trong kỳ.'
                />
            </label>
            <div className='digest-editor-columns'>
                <label className='digest-editor-field'>
                    <span>Điểm nổi bật</span>
                    <Input.TextArea
                        value={highlights}
                        rows={6}
                        onChange={(event) => setHighlights(event.target.value)}
                    />
                    <small>Mỗi dòng là một ý, tối đa 12 ý.</small>
                </label>
                <label className='digest-editor-field'>
                    <span>Rủi ro cần chú ý</span>
                    <Input.TextArea value={alerts} rows={6} onChange={(event) => setAlerts(event.target.value)} />
                    <small>Mỗi dòng là một ý, tối đa 12 ý.</small>
                </label>
            </div>
            <label className='digest-editor-field'>
                <span>Hành động đề xuất</span>
                <Input.TextArea
                    value={recommendations}
                    rows={6}
                    onChange={(event) => setRecommendations(event.target.value)}
                />
                <small>Mỗi dòng là một hành động có thể giao việc.</small>
            </label>
            <label className='digest-editor-field'>
                <span>Ghi chú lần sửa</span>
                <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            </label>
        </div>
    );

    const visibilityTab = (
        <div className='digest-editor-pane'>
            <div className='digest-editor-intro'>
                <EyeOutlined />
                <div>
                    <strong>Chọn chi tiết đưa vào bản phát hành</strong>
                    <Text type='secondary'>Bỏ chọn để ẩn khỏi màn hình và PDF. KPI tổng không bị thay đổi.</Text>
                </div>
            </div>

            <section className='digest-visibility-section'>
                <h3>Sự cố đáng chú ý</h3>
                {digest?.snapshot?.notableIncidents?.length ? (
                    digest.snapshot.notableIncidents.map((item, index) => {
                        const key = String(item.id || index);
                        return (
                            <Checkbox
                                key={key}
                                checked={!hiddenIncidentIds.includes(key)}
                                onChange={(event) =>
                                    setHiddenIncidentIds((current) => toggleHidden(current, key, event.target.checked))
                                }
                            >
                                <span className='digest-visibility-label'>
                                    <strong>{item.machineCode || item.machineName || 'Máy chưa rõ mã'}</strong>
                                    <small>
                                        {item.plantName || 'Chưa rõ cơ sở'} · {item.description || 'Chưa có mô tả'}
                                    </small>
                                </span>
                            </Checkbox>
                        );
                    })
                ) : (
                    <EmptySection />
                )}
            </section>

            <section className='digest-visibility-section'>
                <h3>Ca sửa hoàn tất</h3>
                {digest?.snapshot?.successfulRepairs?.length ? (
                    digest.snapshot.successfulRepairs.map((item, index) => {
                        const key = String(item.id || index);
                        return (
                            <Checkbox
                                key={key}
                                checked={!hiddenRepairIds.includes(key)}
                                onChange={(event) =>
                                    setHiddenRepairIds((current) => toggleHidden(current, key, event.target.checked))
                                }
                            >
                                <span className='digest-visibility-label'>
                                    <strong>{item.machineCode || item.machineName || 'Máy chưa rõ mã'}</strong>
                                    <small>
                                        {item.plantName || 'Chưa rõ cơ sở'} · {item.machineCount || 1} máy
                                    </small>
                                </span>
                            </Checkbox>
                        );
                    })
                ) : (
                    <EmptySection />
                )}
            </section>

            <section className='digest-visibility-section'>
                <h3>Vật tư dưới định mức</h3>
                {digest?.snapshot?.inventory?.lowStock?.length ? (
                    digest.snapshot.inventory.lowStock.map((item) => {
                        const key = materialKey(item);
                        return (
                            <Checkbox
                                key={key}
                                checked={!hiddenMaterialKeys.includes(key)}
                                onChange={(event) =>
                                    setHiddenMaterialKeys((current) => toggleHidden(current, key, event.target.checked))
                                }
                            >
                                <span className='digest-visibility-label'>
                                    <strong>{item.materialName || item.materialCode || 'Vật tư chưa rõ tên'}</strong>
                                    <small>
                                        {item.plantName || 'Chưa rõ cơ sở'} · thiếu {item.shortage || 0}{' '}
                                        {item.unit || ''}
                                    </small>
                                </span>
                            </Checkbox>
                        );
                    })
                ) : (
                    <EmptySection />
                )}
            </section>

            <section className='digest-visibility-section'>
                <h3>Hiệu quả cơ sở</h3>
                {digest?.snapshot?.plantPerformance?.length ? (
                    digest.snapshot.plantPerformance.map((item) => {
                        const key = String(item.plantId || item.plantName || '');
                        return (
                            <Checkbox
                                key={key}
                                checked={!hiddenPlantIds.includes(key)}
                                onChange={(event) =>
                                    setHiddenPlantIds((current) => toggleHidden(current, key, event.target.checked))
                                }
                            >
                                <span className='digest-visibility-label'>
                                    <strong>{item.plantName || 'Cơ sở chưa xác định'}</strong>
                                    <small>
                                        {item.activeMachines || 0}/{item.totalMachines || 0} máy hoạt động
                                    </small>
                                </span>
                            </Checkbox>
                        );
                    })
                ) : (
                    <EmptySection />
                )}
            </section>
        </div>
    );

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={screens.md ? 'right' : 'bottom'}
            width={screens.md ? 680 : undefined}
            height={screens.md ? undefined : '92dvh'}
            title={
                <div className='digest-editor-title'>
                    <div>
                        <strong>Biên tập bản tin</strong>
                        <span>{digest?.periodLabel || digest?.periodKey}</span>
                    </div>
                    <Tag>
                        v{digest?.version || 1}.{digest?.contentRevision || 0}
                    </Tag>
                </div>
            }
            styles={{ body: { padding: 0 }, footer: { padding: '12px 16px' } }}
            footer={
                <div className='digest-editor-footer'>
                    <Text type='secondary'>
                        {hiddenCount ? `${hiddenCount} mục sẽ được ẩn` : 'Hiển thị toàn bộ chi tiết'}
                    </Text>
                    <div>
                        <Button onClick={onClose}>Hủy</Button>
                        <Button type='primary' icon={<SaveOutlined />} loading={saving} onClick={() => onSave(payload)}>
                            Lưu bản biên tập
                        </Button>
                    </div>
                </div>
            }
            destroyOnClose
        >
            <Tabs
                className='digest-editor-tabs'
                items={[
                    { key: 'content', label: 'Nội dung', children: contentTab },
                    {
                        key: 'visibility',
                        label: `Mục hiển thị${hiddenCount ? ` (${hiddenCount} ẩn)` : ''}`,
                        children: visibilityTab,
                    },
                ]}
            />
        </Drawer>
    );
};

export default ExecutiveDigestEditorDrawer;
