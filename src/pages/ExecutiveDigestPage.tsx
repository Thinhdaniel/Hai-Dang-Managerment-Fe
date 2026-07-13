import { useEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Button,
    Empty,
    Image,
    Input,
    Modal,
    Progress,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    AlertOutlined,
    AuditOutlined,
    BellOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    EditOutlined,
    ExportOutlined,
    FileImageOutlined,
    HistoryOutlined,
    InboxOutlined,
    PictureOutlined,
    PrinterOutlined,
    ReloadOutlined,
    RocketOutlined,
    SafetyCertificateOutlined,
    ToolOutlined,
    UndoOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import CloudinaryImagesField from '../components/shared/CloudinaryImagesField';
import ExecutiveDigestEditorDrawer from '../components/ExecutiveDigestEditorDrawer';
import { digestService, type DigestEditorialUpdate, type DigestPeriod } from '../core/services/digest.service';
import type {
    AiDigest,
    AiDigestEditorial,
    AiDigestRevision,
    AiDigestSnapshot,
    AiDigestValidation,
    DigestActor,
} from '../core/types';
import './ExecutiveDigestPage.css';

const { Text, Title } = Typography;

const statusMeta = {
    draft: { label: 'Bản nháp', color: 'gold', icon: <ClockCircleOutlined /> },
    approved: { label: 'Đã duyệt', color: 'blue', icon: <SafetyCertificateOutlined /> },
    published: { label: 'Đã xuất bản', color: 'green', icon: <CheckCircleOutlined /> },
} as const;

const number = (value?: number, maximumFractionDigits = 0) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits }).format(Number(value ?? 0));

const money = (value?: number) => `${number(value)} đ`;

const formatDateTime = (value?: string) =>
    value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : 'Chưa ghi nhận';

const actorName = (actor?: DigestActor) => {
    if (!actor) return 'Hệ thống';
    if (typeof actor === 'string') return 'Người dùng';
    return actor.fullname || actor.fullName || actor.name || actor.email || 'Người dùng';
};

const errorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return fallback;
};

const digestMaterialKey = (item: any) =>
    `${String(item?.materialId || item?.materialCode || item?.materialName || '')}:${String(item?.plantId || item?.plantName || '')}`;

const applyEditorial = (snapshot?: AiDigestSnapshot, editorial?: AiDigestEditorial): AiDigestSnapshot | undefined => {
    if (!snapshot) return snapshot;
    const hiddenIncidents = new Set(editorial?.hiddenIncidentIds || []);
    const hiddenRepairs = new Set(editorial?.hiddenRepairIds || []);
    const hiddenMaterials = new Set(editorial?.hiddenMaterialKeys || []);
    const hiddenPlants = new Set(editorial?.hiddenPlantIds || []);
    return {
        ...snapshot,
        notableIncidents: (snapshot.notableIncidents || []).filter(
            (item, index) => !hiddenIncidents.has(String(item.id || index))
        ),
        successfulRepairs: (snapshot.successfulRepairs || []).filter(
            (item, index) => !hiddenRepairs.has(String(item.id || index))
        ),
        inventory: snapshot.inventory
            ? {
                  ...snapshot.inventory,
                  lowStock: (snapshot.inventory.lowStock || []).filter(
                      (item) => !hiddenMaterials.has(digestMaterialKey(item))
                  ),
              }
            : undefined,
        plantPerformance: (snapshot.plantPerformance || []).filter(
            (item) => !hiddenPlants.has(String(item.plantId || item.plantName || ''))
        ),
    };
};

const getEvidenceCover = (snapshot?: AiDigestSnapshot) => {
    for (const repair of snapshot?.successfulRepairs ?? []) {
        const image = repair.afterImages?.[0] || repair.beforeImages?.[0];
        if (image) return image;
    }
    return undefined;
};

type DigestView = AiDigest | (AiDigestRevision & Pick<AiDigest, '_id' | 'periodLabel' | 'periodKey' | 'periodType'>);

const Kpi = ({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) => (
    <div className={`digest-kpi ${tone ? `digest-kpi--${tone}` : ''}`}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
    </div>
);

const BulletList = ({ items, tone = 'neutral' }: { items?: string[]; tone?: 'neutral' | 'warning' | 'action' }) => {
    if (!items?.length) return <Text type='secondary'>Không có nội dung đáng chú ý.</Text>;
    return (
        <ul className={`digest-bullets digest-bullets--${tone}`}>
            {items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
            ))}
        </ul>
    );
};

const validationMeta = {
    unchecked: { label: 'Chưa kiểm tra', color: 'default' },
    passed: { label: 'Sẵn sàng phê duyệt', color: 'success' },
    warning: { label: 'Có điểm cần rà soát', color: 'warning' },
    blocked: { label: 'Đang bị chặn', color: 'error' },
} as const;

const ValidationPanel = ({
    validation,
    onNavigate,
}: {
    validation?: AiDigestValidation;
    onNavigate: (url: string) => void;
}) => {
    const status = validation?.status || 'unchecked';
    const meta = validationMeta[status];
    const issues = validation?.issues || [];
    return (
        <section className={`digest-validation digest-validation--${status}`}>
            <div className='digest-validation__summary'>
                <div className='digest-validation__icon'>
                    {status === 'blocked' ? <WarningOutlined /> : <AuditOutlined />}
                </div>
                <div>
                    <strong>Kiểm tra trước phát hành</strong>
                    <span>
                        {validation?.checkedAt
                            ? `Kiểm tra lúc ${formatDateTime(validation.checkedAt)}`
                            : 'Chưa chạy bộ quy tắc kiểm tra nội dung và dữ liệu.'}
                    </span>
                </div>
                <Tag color={meta.color}>{meta.label}</Tag>
            </div>
            {issues.length ? (
                <div className='digest-validation__issues'>
                    {issues.map((issue) => (
                        <div
                            className={`digest-validation-issue digest-validation-issue--${issue.severity}`}
                            key={issue.code}
                        >
                            <span className='digest-validation-issue__marker' />
                            <div>
                                <strong>{issue.title}</strong>
                                {issue.detail ? <small>{issue.detail}</small> : null}
                            </div>
                            {issue.actionUrl ? (
                                <Button
                                    type='link'
                                    size='small'
                                    icon={<ExportOutlined />}
                                    onClick={() => onNavigate(issue.actionUrl!)}
                                >
                                    Kiểm tra
                                </Button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : status === 'passed' ? (
                <div className='digest-validation__clean'>
                    <CheckCircleOutlined /> Không phát hiện vấn đề chặn phát hành.
                </div>
            ) : null}
        </section>
    );
};

const ExecutiveDigestPage = () => {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [period, setPeriod] = useState<DigestPeriod>('week');
    const [selectedId, setSelectedId] = useState(searchParams.get('digest') ?? '');
    const [revisionVersion, setRevisionVersion] = useState<string>('current');
    const [editorOpen, setEditorOpen] = useState(false);
    const [coverOpen, setCoverOpen] = useState(false);
    const [coverImages, setCoverImages] = useState<string[]>([]);
    const viewedDigests = useRef(new Set<string>());

    const listQuery = useQuery({
        queryKey: ['digests', period],
        queryFn: () => digestService.list(period),
        staleTime: 60_000,
    });

    useEffect(() => {
        if (!selectedId && listQuery.data?.[0]?._id) setSelectedId(listQuery.data[0]._id);
    }, [listQuery.data, selectedId]);

    const detailQuery = useQuery({
        queryKey: ['digest', selectedId],
        queryFn: () => digestService.getById(selectedId),
        enabled: Boolean(selectedId),
        staleTime: 30_000,
    });

    useEffect(() => {
        if (
            detailQuery.data?._id === selectedId &&
            detailQuery.data.periodType &&
            detailQuery.data.periodType !== period
        ) {
            setPeriod(detailQuery.data.periodType);
        }
    }, [detailQuery.data?._id, detailQuery.data?.periodType, period, selectedId]);

    const selectDigest = (id: string) => {
        setSelectedId(id);
        setRevisionVersion('current');
        const next = new URLSearchParams(searchParams);
        next.set('digest', id);
        setSearchParams(next, { replace: true });
    };

    const refreshQueries = (doc: AiDigest) => {
        queryClient.setQueryData(['digest', doc._id], doc);
        queryClient.invalidateQueries({ queryKey: ['digests'] });
        queryClient.invalidateQueries({ queryKey: ['digest', 'latest'] });
        selectDigest(doc._id);
    };

    const generateMutation = useMutation({
        mutationFn: () => digestService.generate(period),
        onSuccess: (doc) => {
            refreshQueries(doc);
            message.success(`Đã tạo bản nháp v${doc.version ?? 1}`);
        },
        onError: (error) =>
            message.error(errorMessage(error, 'Không tạo được bản tin. Kiểm tra kết nối AI và thử lại.')),
    });

    const approveMutation = useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) => digestService.approve(id, note),
        onSuccess: (doc) => {
            refreshQueries(doc);
            message.success('Đã phê duyệt bản tin');
        },
        onError: (error) => message.error(errorMessage(error, 'Không thể phê duyệt bản tin hiện tại.')),
    });

    const publishMutation = useMutation({
        mutationFn: (id: string) => digestService.publish(id),
        onSuccess: (doc) => {
            refreshQueries(doc);
            message.success('Đã xuất bản và gửi thông báo tới ban giám đốc');
        },
        onError: (error) => message.error(errorMessage(error, 'Không thể xuất bản bản tin hiện tại.')),
    });

    const editorialMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: DigestEditorialUpdate }) =>
            digestService.updateEditorial(id, payload),
        onSuccess: (doc) => {
            refreshQueries(doc);
            setEditorOpen(false);
            message.success('Đã lưu bản biên tập và chạy lại kiểm tra');
        },
        onError: (error) => message.error(errorMessage(error, 'Không lưu được nội dung biên tập.')),
    });

    const validateMutation = useMutation({
        mutationFn: (id: string) => digestService.validate(id),
        onSuccess: async (validation) => {
            await queryClient.invalidateQueries({ queryKey: ['digest', selectedId] });
            message.success(
                validation.status === 'blocked'
                    ? 'Đã kiểm tra: còn lỗi chặn cần xử lý'
                    : 'Đã kiểm tra lại nội dung và dữ liệu'
            );
        },
        onError: (error) => message.error(errorMessage(error, 'Không chạy được bộ kiểm tra.')),
    });

    const coverMutation = useMutation({
        mutationFn: ({ id, url }: { id: string; url: string | null }) => digestService.updateCover(id, url),
        onSuccess: (doc) => {
            refreshQueries(doc);
            setCoverOpen(false);
            message.success('Đã cập nhật ảnh bìa');
        },
        onError: (error) => message.error(errorMessage(error, 'Không cập nhật được ảnh bìa.')),
    });

    const regenerateCoverMutation = useMutation({
        mutationFn: (id: string) => digestService.regenerateCover(id),
        onSuccess: (doc) => {
            refreshQueries(doc);
            setCoverImages(doc.visual?.coverImageUrl ? [doc.visual.coverImageUrl] : []);
            message.success(
                doc.visual?.status === 'ready' ? 'Đã tạo ảnh bìa AI mới' : 'Đã dùng ảnh hiện trường thay thế'
            );
        },
        onError: (error) => message.error(errorMessage(error, 'Không tạo được ảnh bìa AI.')),
    });

    const reopenMutation = useMutation({
        mutationFn: (id: string) => digestService.reopen(id),
        onSuccess: (doc) => {
            refreshQueries(doc);
            message.success('Đã mở lại bản tin để biên tập');
        },
        onError: (error) => message.error(errorMessage(error, 'Không mở lại được bản tin.')),
    });

    const downloadMutation = useMutation({
        mutationFn: ({ id, version, fileName }: { id: string; version?: number; fileName?: string }) =>
            digestService.downloadPdf(id, version, fileName),
        onError: (error) => message.error(errorMessage(error, 'Không tải được PDF chính thức.')),
    });

    const digest = detailQuery.data;

    useEffect(() => {
        if (!digest?._id || digest.status !== 'published' || viewedDigests.current.has(digest._id)) return;
        viewedDigests.current.add(digest._id);
        void digestService
            .recordView(digest._id)
            .then(() => queryClient.invalidateQueries({ queryKey: ['digest', digest._id] }))
            .catch(() => undefined);
    }, [digest?._id, digest?.status, queryClient]);

    const selectedRevision = useMemo(
        () =>
            revisionVersion === 'current'
                ? undefined
                : digest?.revisionHistory?.find((revision) => String(revision.version) === revisionVersion),
        [digest?.revisionHistory, revisionVersion]
    );
    const view: DigestView | undefined = selectedRevision
        ? {
              ...selectedRevision,
              _id: digest!._id,
              periodLabel: digest!.periodLabel,
              periodKey: digest!.periodKey,
              periodType: digest!.periodType,
          }
        : digest;
    const snapshot = useMemo(() => applyEditorial(view?.snapshot, view?.editorial), [view?.editorial, view?.snapshot]);
    const status = view?.status ?? 'draft';
    const statusInfo = statusMeta[status];
    const coverImage = view?.visual?.coverImageUrl || getEvidenceCover(snapshot);
    const isHistorical = revisionVersion !== 'current';
    const officialArtifact = view?.artifact;
    const officialPdfReady = officialArtifact?.status === 'ready';
    const viewReceipts = !isHistorical ? digest?.viewReceipts || [] : [];
    const totalRecordedViews = viewReceipts.reduce((sum, receipt) => sum + Number(receipt.viewCount || 0), 0);

    const revisionOptions = useMemo(
        () => [
            {
                value: 'current',
                label: `Hiện tại · v${digest?.version ?? 1}`,
            },
            ...(digest?.revisionHistory ?? [])
                .slice()
                .reverse()
                .map((revision) => ({
                    value: String(revision.version),
                    label: `Bản lưu · v${revision.version} · ${statusMeta[revision.status ?? 'draft'].label}`,
                })),
        ],
        [digest?.revisionHistory, digest?.version]
    );

    const confirmGenerate = () => {
        modal.confirm({
            title: digest ? 'Tạo lại bản tin kỳ này?' : 'Tạo bản tin điều hành?',
            content: digest
                ? `Bản v${digest.version ?? 1} sẽ được lưu vào lịch sử. Phiên bản mới luôn bắt đầu ở trạng thái nháp.`
                : 'Hệ thống sẽ tổng hợp dữ liệu thật, viết nội dung và tạo ảnh bìa nếu Vertex Image đã bật.',
            okText: digest ? 'Tạo phiên bản mới' : 'Tạo bản tin',
            cancelText: 'Hủy',
            onOk: () => generateMutation.mutateAsync(),
        });
    };

    const confirmApprove = () => {
        let note = '';
        modal.confirm({
            title: 'Phê duyệt bản tin?',
            icon: <SafetyCertificateOutlined />,
            content: (
                <div className='pt-2'>
                    <p className='text-sm text-slate-600'>
                        Xác nhận số liệu, ảnh và nội dung đã được kiểm tra. Các cảnh báo không chặn vẫn cần được cân
                        nhắc trước khi duyệt.
                    </p>
                    <Input.TextArea
                        rows={3}
                        maxLength={500}
                        placeholder='Ghi chú phê duyệt (không bắt buộc)'
                        onChange={(event) => {
                            note = event.target.value;
                        }}
                    />
                </div>
            ),
            okText: 'Phê duyệt',
            cancelText: 'Hủy',
            onOk: () => approveMutation.mutateAsync({ id: digest!._id, note: note.trim() || undefined }),
        });
    };

    const confirmPublish = () => {
        modal.confirm({
            title: 'Xuất bản bản tin?',
            icon: <RocketOutlined />,
            content:
                'Hệ thống sẽ khóa nội dung, tạo PDF A4 chính thức và gửi thông báo tới ban giám đốc. Bản đã xuất bản không thể sửa đè.',
            okText: 'Xuất bản',
            cancelText: 'Hủy',
            onOk: () => publishMutation.mutateAsync(digest!._id),
        });
    };

    const confirmReopen = () => {
        modal.confirm({
            title: 'Mở lại để biên tập?',
            icon: <UndoOutlined />,
            content: 'Trạng thái phê duyệt sẽ được gỡ. Sau khi sửa, bản tin phải được kiểm tra và phê duyệt lại.',
            okText: 'Mở lại',
            cancelText: 'Hủy',
            onOk: () => reopenMutation.mutateAsync(digest!._id),
        });
    };

    const openCoverEditor = () => {
        setCoverImages(digest?.visual?.coverImageUrl ? [digest.visual.coverImageUrl] : []);
        setCoverOpen(true);
    };

    const downloadOfficialPdf = () => {
        if (!digest || !view || !officialPdfReady) return;
        const version = Number(view.version || digest.version || 1);
        downloadMutation.mutate({
            id: digest._id,
            version,
            fileName: officialArtifact?.fileName || `ban-tin-dieu-hanh-${digest.periodKey}-v${version}.pdf`,
        });
    };

    const actions = (
        <div className='digest-screen-only flex flex-wrap items-center justify-end gap-2'>
            <Segmented
                value={period}
                options={[
                    { label: 'Theo tuần', value: 'week' },
                    { label: 'Theo tháng', value: 'month' },
                ]}
                onChange={(value) => {
                    setPeriod(value as DigestPeriod);
                    setSelectedId('');
                    setRevisionVersion('current');
                    setSearchParams({}, { replace: true });
                }}
            />
            <Button icon={<ReloadOutlined />} loading={generateMutation.isPending} onClick={confirmGenerate}>
                {digest ? 'Tạo phiên bản mới' : 'Tạo bản tin'}
            </Button>
        </div>
    );

    return (
        <div className='executive-digest-page'>
            <div className='digest-screen-only'>
                <PageHeader
                    title='Bản Tin Điều Hành'
                    subtitle='Tóm tắt trực quan về máy, bảo trì, vật tư và hiệu quả từng cơ sở.'
                    actions={actions}
                />
            </div>

            <div className='digest-screen-only digest-toolbar'>
                <div className='digest-toolbar__field'>
                    <span>Kỳ báo cáo</span>
                    <Select
                        value={selectedId || undefined}
                        loading={listQuery.isLoading}
                        placeholder='Chọn kỳ báo cáo'
                        options={(listQuery.data ?? []).map((item) => ({
                            value: item._id,
                            label: `${item.periodLabel || item.periodKey} · v${item.version ?? 1}`,
                        }))}
                        onChange={selectDigest}
                    />
                </div>
                <div className='digest-toolbar__field'>
                    <span>Phiên bản</span>
                    <Select
                        value={revisionVersion}
                        options={revisionOptions}
                        disabled={!digest}
                        suffixIcon={<HistoryOutlined />}
                        onChange={setRevisionVersion}
                    />
                </div>
                <div className='digest-toolbar__actions'>
                    {!isHistorical && digest?.status === 'draft' ? (
                        <>
                            <Button icon={<EditOutlined />} onClick={() => setEditorOpen(true)}>
                                Biên tập
                            </Button>
                            <Button icon={<PictureOutlined />} onClick={openCoverEditor}>
                                Ảnh bìa
                            </Button>
                        </>
                    ) : null}
                    {!isHistorical && digest ? (
                        <Button
                            icon={<AuditOutlined />}
                            loading={validateMutation.isPending}
                            onClick={() => validateMutation.mutate(digest._id)}
                        >
                            Kiểm tra
                        </Button>
                    ) : null}
                    {!isHistorical && digest?.status === 'draft' ? (
                        <Tooltip
                            title={
                                digest.validation?.status === 'blocked'
                                    ? 'Cần xử lý lỗi chặn trước khi phê duyệt'
                                    : undefined
                            }
                        >
                            <span>
                                <Button
                                    type='primary'
                                    icon={<SafetyCertificateOutlined />}
                                    loading={approveMutation.isPending}
                                    disabled={digest.validation?.status === 'blocked'}
                                    onClick={confirmApprove}
                                >
                                    Phê duyệt
                                </Button>
                            </span>
                        </Tooltip>
                    ) : null}
                    {!isHistorical && digest?.status === 'approved' ? (
                        <>
                            <Button icon={<UndoOutlined />} loading={reopenMutation.isPending} onClick={confirmReopen}>
                                Mở lại
                            </Button>
                            <Button
                                type='primary'
                                icon={<RocketOutlined />}
                                loading={publishMutation.isPending}
                                onClick={confirmPublish}
                            >
                                Xuất bản
                            </Button>
                        </>
                    ) : null}
                    {officialPdfReady ? (
                        <Button
                            icon={<DownloadOutlined />}
                            loading={downloadMutation.isPending}
                            onClick={downloadOfficialPdf}
                        >
                            PDF chính thức
                        </Button>
                    ) : (
                        <Tooltip title='Bản xem trước từ trình duyệt, chưa phải PDF chính thức'>
                            <Button icon={<PrinterOutlined />} disabled={!digest} onClick={() => window.print()}>
                                In bản xem trước
                            </Button>
                        </Tooltip>
                    )}
                </div>
            </div>

            {view ? (
                <div className='digest-screen-only digest-review-band'>
                    <div className='digest-workflow'>
                        <div className='digest-workflow__step digest-workflow__step--done'>
                            <span>1</span>
                            <div>
                                <strong>Snapshot</strong>
                                <small>Dữ liệu đã khóa theo kỳ</small>
                            </div>
                        </div>
                        <div
                            className={`digest-workflow__step ${
                                view.validation?.status === 'blocked'
                                    ? 'digest-workflow__step--blocked'
                                    : view.validation?.status && view.validation.status !== 'unchecked'
                                      ? 'digest-workflow__step--done'
                                      : ''
                            }`}
                        >
                            <span>2</span>
                            <div>
                                <strong>Kiểm tra</strong>
                                <small>{validationMeta[view.validation?.status || 'unchecked'].label}</small>
                            </div>
                        </div>
                        <div
                            className={`digest-workflow__step ${
                                status === 'approved' || status === 'published' ? 'digest-workflow__step--done' : ''
                            }`}
                        >
                            <span>3</span>
                            <div>
                                <strong>Phê duyệt</strong>
                                <small>{status === 'draft' ? 'Đang chờ' : actorName(digest?.approvedBy)}</small>
                            </div>
                        </div>
                        <div
                            className={`digest-workflow__step ${status === 'published' ? 'digest-workflow__step--done' : ''}`}
                        >
                            <span>4</span>
                            <div>
                                <strong>Phát hành</strong>
                                <small>
                                    {officialArtifact?.status === 'generating'
                                        ? 'Đang tạo PDF'
                                        : officialPdfReady
                                          ? 'PDF chính thức đã sẵn sàng'
                                          : 'Chưa phát hành'}
                                </small>
                            </div>
                        </div>
                    </div>
                    <ValidationPanel validation={view.validation} onNavigate={navigate} />
                </div>
            ) : null}

            {detailQuery.isLoading || (listQuery.isLoading && !digest) ? (
                <div className='digest-loading'>
                    <Skeleton active paragraph={{ rows: 10 }} />
                </div>
            ) : !view ? (
                <div className='digest-empty'>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có bản tin cho kỳ đã chọn'>
                        <Button type='primary' loading={generateMutation.isPending} onClick={confirmGenerate}>
                            Tạo bản tin đầu tiên
                        </Button>
                    </Empty>
                </div>
            ) : (
                <article className='executive-digest-sheet'>
                    <header className={`digest-cover ${coverImage ? 'digest-cover--image' : 'digest-cover--fallback'}`}>
                        {coverImage ? (
                            <img className='digest-cover__image' src={coverImage} alt='Ảnh bìa bản tin điều hành' />
                        ) : (
                            <img className='digest-cover__fallback-mark' src='/brand/company-logo.png' alt='' />
                        )}
                        <div className='digest-cover__shade' />
                        <div className='digest-cover__brand'>
                            <img src='/brand/company-logo.png' alt='Hải Đăng' />
                            <span>HẢI ĐĂNG MS</span>
                        </div>
                        <div className='digest-cover__content'>
                            <p>BẢN TIN ĐIỀU HÀNH</p>
                            <Title level={1}>{view.periodLabel || view.periodKey}</Title>
                            <div className='digest-cover__meta'>
                                <Tag color={statusInfo.color} icon={statusInfo.icon}>
                                    {statusInfo.label}
                                </Tag>
                                <span>
                                    Phiên bản {view.version ?? 1}.{view.contentRevision ?? 0}
                                </span>
                                <span>
                                    Cập nhật{' '}
                                    {formatDateTime(
                                        selectedRevision?.generatedAt || digest?.updatedAt || digest?.createdAt
                                    )}
                                </span>
                                {view.editorial?.lastEditedAt ? (
                                    <span>
                                        Biên tập: {actorName(view.editorial.lastEditedBy)} ·{' '}
                                        {formatDateTime(view.editorial.lastEditedAt)}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <div className='digest-cover__source'>
                            {view.visual?.status === 'ready' ? (
                                <span>
                                    <FileImageOutlined /> Ảnh bìa AI · số liệu hiển thị từ hệ thống
                                </span>
                            ) : view.visual?.status === 'custom' ? (
                                <span>
                                    <FileImageOutlined /> Ảnh bìa được biên tập · số liệu từ hệ thống
                                </span>
                            ) : coverImage ? (
                                <span>Ảnh hiện trường · số liệu hiển thị từ hệ thống</span>
                            ) : (
                                <span>Bìa hệ thống · số liệu hiển thị từ hệ thống</span>
                            )}
                        </div>
                    </header>

                    {status === 'published' ? (
                        <section className='digest-screen-only digest-release-strip'>
                            <div className='digest-release-strip__title'>
                                <CheckCircleOutlined />
                                <div>
                                    <strong>Bản phát hành chính thức</strong>
                                    <span>{formatDateTime(view.publishedAt)} · PDF khóa theo checksum</span>
                                </div>
                            </div>
                            <div className='digest-release-metrics'>
                                <span>
                                    <BellOutlined /> Trong ứng dụng{' '}
                                    <strong>{number(view.delivery?.inAppCreated)}</strong>
                                </span>
                                <span>
                                    Web Push <strong>{number(view.delivery?.webPushSent)}</strong>
                                </span>
                                <span>
                                    Telegram <strong>{number(view.delivery?.telegramSent)}</strong>
                                </span>
                                {!isHistorical ? (
                                    <span>
                                        <UserOutlined /> Đã xem <strong>{number(viewReceipts.length)}</strong> người /{' '}
                                        {number(totalRecordedViews)} lượt
                                    </span>
                                ) : null}
                            </div>
                            {!isHistorical && viewReceipts.length ? (
                                <div className='digest-viewers'>
                                    {viewReceipts.slice(0, 6).map((receipt, index) => (
                                        <Tooltip
                                            key={
                                                typeof receipt.userId === 'string'
                                                    ? receipt.userId
                                                    : receipt.userId?._id || index
                                            }
                                            title={`Xem gần nhất ${formatDateTime(receipt.lastViewedAt)}`}
                                        >
                                            <span>{actorName(receipt.userId).slice(0, 2).toUpperCase()}</span>
                                        </Tooltip>
                                    ))}
                                    {viewReceipts.length > 6 ? <small>+{viewReceipts.length - 6}</small> : null}
                                </div>
                            ) : null}
                        </section>
                    ) : null}

                    <section className='digest-kpi-grid'>
                        <Kpi
                            label='Máy hoạt động'
                            value={`${number(snapshot?.machines?.active)}/${number(snapshot?.machines?.total)}`}
                            hint={`${number(
                                snapshot?.machines?.total
                                    ? ((snapshot.machines.active ?? 0) / snapshot.machines.total) * 100
                                    : 0
                            )}% toàn hệ thống`}
                            tone='green'
                        />
                        <Kpi
                            label='Phiếu mới'
                            value={number(snapshot?.maintenance?.newTickets)}
                            hint={`${Number(snapshot?.maintenance?.newTicketsDeltaPct ?? 0) >= 0 ? '+' : ''}${number(
                                snapshot?.maintenance?.newTicketsDeltaPct
                            )}% so kỳ trước`}
                        />
                        <Kpi
                            label='Ca sửa hoàn tất'
                            value={number(snapshot?.evidence?.completedRepairsCount)}
                            hint={`${number(snapshot?.evidence?.coveragePct)}% có đủ ảnh trước/sau`}
                            tone='green'
                        />
                        <Kpi
                            label='Phiếu quá hạn'
                            value={number(snapshot?.maintenance?.overdueCount)}
                            hint={`TB ${number(snapshot?.maintenance?.avgResolutionDays, 1)} ngày xử lý`}
                            tone={snapshot?.maintenance?.overdueCount ? 'red' : 'green'}
                        />
                        <Kpi
                            label='Vật tư dưới định mức'
                            value={number(snapshot?.inventory?.lowStockCount)}
                            hint='Cần đối chiếu tồn thực tế'
                            tone={snapshot?.inventory?.lowStockCount ? 'amber' : 'green'}
                        />
                        <Kpi
                            label='Chi phí vận hành'
                            value={money(snapshot?.cost?.total)}
                            hint={`${Number(snapshot?.cost?.totalDeltaPct ?? 0) >= 0 ? '+' : ''}${number(
                                snapshot?.cost?.totalDeltaPct
                            )}% so kỳ trước`}
                        />
                    </section>

                    <section className='digest-section digest-summary'>
                        <div className='digest-section__heading'>
                            <span>01</span>
                            <div>
                                <h2>Tóm tắt điều hành</h2>
                                <p>Nội dung AI được ràng buộc bởi snapshot số liệu của kỳ.</p>
                            </div>
                        </div>
                        <p className='digest-narrative'>{view.narrative}</p>
                        <div className='digest-triad'>
                            <div>
                                <h3>
                                    <CheckCircleOutlined /> Điểm nổi bật
                                </h3>
                                <BulletList items={view.highlights} />
                            </div>
                            <div>
                                <h3>
                                    <WarningOutlined /> Rủi ro cần chú ý
                                </h3>
                                <BulletList items={view.alerts} tone='warning' />
                            </div>
                            <div>
                                <h3>
                                    <RocketOutlined /> Hành động đề xuất
                                </h3>
                                <BulletList items={view.recommendations} tone='action' />
                            </div>
                        </div>
                    </section>

                    <section className='digest-section'>
                        <div className='digest-section__heading'>
                            <span>02</span>
                            <div>
                                <h2>Sự cố và bảo trì nổi bật</h2>
                                <p>Ưu tiên sự cố khẩn cấp, quá hạn và ca sửa có bằng chứng hiện trường.</p>
                            </div>
                        </div>
                        <div className='digest-operations-grid'>
                            <div className='digest-incident-list'>
                                <h3>
                                    <AlertOutlined /> Sự cố đáng chú ý
                                </h3>
                                {(snapshot?.notableIncidents ?? []).length ? (
                                    snapshot!.notableIncidents!.map((item, index) => (
                                        <div className='digest-incident' key={item.id || index}>
                                            <div>
                                                <strong>
                                                    {item.machineCode || item.machineName || 'Máy chưa rõ mã'}
                                                </strong>
                                                <span>{item.plantName || 'Chưa rõ cơ sở'}</span>
                                            </div>
                                            <p>{item.description || 'Chưa có mô tả sự cố'}</p>
                                        </div>
                                    ))
                                ) : (
                                    <Text type='secondary'>Không ghi nhận sự cố nổi bật trong kỳ.</Text>
                                )}
                            </div>
                            <div className='digest-repair-gallery'>
                                <h3>
                                    <ToolOutlined /> Ca sửa thành công
                                </h3>
                                {(snapshot?.successfulRepairs ?? []).length ? (
                                    <div className='digest-repair-grid'>
                                        {snapshot!.successfulRepairs!.slice(0, 4).map((repair, index) => (
                                            <div className='digest-repair' key={repair.id || index}>
                                                <div className='digest-repair__images'>
                                                    <Image.PreviewGroup>
                                                        {repair.beforeImages?.[0] ? (
                                                            <Image src={repair.beforeImages[0]} alt='Trước sửa' />
                                                        ) : (
                                                            <div className='digest-image-placeholder'>Trước sửa</div>
                                                        )}
                                                        {repair.afterImages?.[0] ? (
                                                            <Image src={repair.afterImages[0]} alt='Sau sửa' />
                                                        ) : (
                                                            <div className='digest-image-placeholder'>Sau sửa</div>
                                                        )}
                                                    </Image.PreviewGroup>
                                                </div>
                                                <strong>
                                                    {repair.machineCode || repair.machineName || 'Máy chưa rõ mã'}
                                                </strong>
                                                <span>
                                                    {repair.plantName || 'Chưa rõ cơ sở'} ·{' '}
                                                    {number(repair.resolutionDays, 1)} ngày
                                                    {(repair.machineCount ?? 0) > 1
                                                        ? ` · ${repair.machineCount} máy`
                                                        : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Text type='secondary'>Chưa có ca sửa hoàn tất trong kỳ.</Text>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className='digest-section'>
                        <div className='digest-section__heading'>
                            <span>03</span>
                            <div>
                                <h2>Vật tư cần bổ sung</h2>
                                <p>Danh sách bằng hoặc dưới định mức, sắp theo mức thiếu lớn nhất.</p>
                            </div>
                        </div>
                        <Table
                            className='digest-table'
                            rowKey={(row) => `${row.materialId}-${row.plantId}`}
                            size='small'
                            pagination={false}
                            dataSource={(snapshot?.inventory?.lowStock ?? []).slice(0, 12)}
                            locale={{ emptyText: 'Không có vật tư dưới định mức' }}
                            columns={[
                                {
                                    title: 'Vật tư',
                                    dataIndex: 'materialName',
                                    render: (value, row) => (
                                        <div className='digest-material-name'>
                                            <strong>{value || 'Chưa rõ tên'}</strong>
                                            <span>{row.materialCode || '-'}</span>
                                        </div>
                                    ),
                                },
                                { title: 'Cơ sở', dataIndex: 'plantName', width: 180 },
                                {
                                    title: 'Tồn / Định mức',
                                    width: 150,
                                    align: 'right',
                                    render: (_, row) =>
                                        `${number(row.currentStock)} / ${number(row.minStockLevel)} ${row.unit || ''}`,
                                },
                                {
                                    title: 'Thiếu',
                                    dataIndex: 'shortage',
                                    width: 110,
                                    align: 'right',
                                    render: (value, row) => (
                                        <strong>
                                            {number(value)} {row.unit || ''}
                                        </strong>
                                    ),
                                },
                            ]}
                        />
                    </section>

                    <section className='digest-section'>
                        <div className='digest-section__heading'>
                            <span>04</span>
                            <div>
                                <h2>Hiệu quả theo cơ sở</h2>
                                <p>Chỉ số trực tiếp từ máy và phiếu bảo trì, không dùng điểm AI tự tạo.</p>
                            </div>
                        </div>
                        <div className='digest-plant-grid'>
                            {(snapshot?.plantPerformance ?? []).map((plant) => (
                                <div className='digest-plant' key={plant.plantId || plant.plantName}>
                                    <div className='digest-plant__header'>
                                        <div>
                                            <strong>{plant.plantName || 'Cơ sở chưa xác định'}</strong>
                                            <span>
                                                {number(plant.activeMachines)}/{number(plant.totalMachines)} máy hoạt
                                                động
                                            </span>
                                        </div>
                                        <b>{number(plant.activeRate)}%</b>
                                    </div>
                                    <Progress
                                        percent={plant.activeRate ?? 0}
                                        showInfo={false}
                                        strokeColor={(plant.activeRate ?? 0) >= 95 ? '#16825d' : '#3157c8'}
                                        trailColor='#e8edf3'
                                        size='small'
                                    />
                                    <div className='digest-plant__stats'>
                                        <span>
                                            Hoàn tất <strong>{number(plant.completedRepairs)}</strong>
                                        </span>
                                        <span>
                                            Phiếu mở <strong>{number(plant.openTickets)}</strong>
                                        </span>
                                        <span>
                                            Thiếu VT <strong>{number(plant.lowStockCount)}</strong>
                                        </span>
                                    </div>
                                    {plant.achievements?.length ? (
                                        <div className='digest-achievements'>
                                            {plant.achievements.map((achievement) => (
                                                <span key={achievement}>
                                                    <CheckCircleOutlined /> {achievement}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>

                    {view.dataWarnings?.length || snapshot?.dataWarnings?.length ? (
                        <section className='digest-data-note'>
                            <InboxOutlined />
                            <div>
                                <strong>Giới hạn dữ liệu</strong>
                                <BulletList items={view.dataWarnings || snapshot?.dataWarnings} tone='warning' />
                            </div>
                        </section>
                    ) : null}

                    <footer className='digest-footer'>
                        <div>
                            <img src='/brand/company-logo.png' alt='' />
                            <span>Hải Đăng Management System</span>
                        </div>
                        <div>
                            <span>Nguồn: dữ liệu vận hành nội bộ</span>
                            <span>Model: {view.model || 'fallback xác định'}</span>
                            {digest?.publishedAt ? <span>Xuất bản: {formatDateTime(digest.publishedAt)}</span> : null}
                        </div>
                    </footer>
                </article>
            )}

            <ExecutiveDigestEditorDrawer
                open={editorOpen}
                digest={digest}
                saving={editorialMutation.isPending}
                onClose={() => setEditorOpen(false)}
                onSave={async (payload) => {
                    if (digest) await editorialMutation.mutateAsync({ id: digest._id, payload });
                }}
            />

            <Modal
                open={coverOpen}
                title='Biên tập ảnh bìa'
                okText='Dùng ảnh đã chọn'
                cancelText='Đóng'
                confirmLoading={coverMutation.isPending}
                onCancel={() => setCoverOpen(false)}
                onOk={() => digest && coverMutation.mutateAsync({ id: digest._id, url: coverImages[0] || null })}
            >
                <div className='digest-cover-editor'>
                    <p>
                        Ảnh chỉ đóng vai trò bìa trực quan. Tiêu đề, logo và số liệu được hệ thống render riêng để không
                        phụ thuộc nội dung trong ảnh.
                    </p>
                    <CloudinaryImagesField
                        value={coverImages}
                        onChange={setCoverImages}
                        folder='executive-digest-covers'
                        max={1}
                        size={150}
                        emptyHint='Tải ảnh hiện trường hoặc ảnh đã duyệt'
                    />
                    <div className='digest-cover-editor__ai'>
                        <div>
                            <strong>Tạo bìa mới bằng Vertex AI</strong>
                            <span>Ưu tiên ảnh hiện trường trong kỳ làm ngữ cảnh, không sinh chữ hoặc số liệu.</span>
                        </div>
                        <Button
                            icon={<FileImageOutlined />}
                            loading={regenerateCoverMutation.isPending}
                            onClick={() => digest && regenerateCoverMutation.mutate(digest._id)}
                        >
                            Tạo lại bằng AI
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ExecutiveDigestPage;
