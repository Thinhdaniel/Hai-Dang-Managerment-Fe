import React, { useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    Card,
    Empty,
    Form,
    Grid,
    Input,
    List,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    CrownOutlined,
    DeleteOutlined,
    GiftOutlined,
    HistoryOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SaveOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasDirectorAccess } from '../core/lib/permissions';
import {
    luckyWheelService,
    type LuckyWheelEvent,
    type LuckyWheelParticipant,
    type LuckyWheelSpinResult,
    type LuckyWheelTheme,
    type LuckyWheelWinner,
} from '../core/services/lucky-wheel.service';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const PALETTE = ['#2563eb', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6'];

const themeMeta: Record<LuckyWheelTheme, { label: string; className: string; accent: string }> = {
    'haidang-night': { label: 'Hải Đăng Night', className: 'lucky-wheel-page--night', accent: '#38bdf8' },
    'gold-night': { label: 'Gold Night', className: 'lucky-wheel-page--gold', accent: '#f59e0b' },
    tet: { label: 'Tết rực rỡ', className: 'lucky-wheel-page--tet', accent: '#ef4444' },
    ocean: { label: 'Ocean Blue', className: 'lucky-wheel-page--ocean', accent: '#06b6d4' },
};

const defaultNames = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Thị D', 'Hoàng Văn E', 'Đỗ Thị F'];

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
};

const normalizeParticipantName = (line: string): LuckyWheelParticipant | null => {
    const [name, code, plantName] = line
        .split(/[|,\t]/)
        .map((part) => part.trim())
        .filter(Boolean);
    if (!name) return null;
    return { name, code, plantName, active: true, weight: 1 };
};

const parseParticipantText = (value: string) =>
    value
        .split(/\r?\n/)
        .map(normalizeParticipantName)
        .filter((item): item is LuckyWheelParticipant => Boolean(item));

const serializeParticipants = (participants: LuckyWheelParticipant[]) =>
    participants.map((item) => [item.name, item.code, item.plantName].filter(Boolean).join(' | ')).join('\n');

const formatDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
};

const LuckyWheelSvg = ({
    participants,
    rotation,
    spinning,
}: {
    participants: LuckyWheelParticipant[];
    rotation: number;
    spinning: boolean;
}) => {
    const activeParticipants: LuckyWheelParticipant[] = participants.length
        ? participants
        : defaultNames.map((name) => ({ name, active: true }));
    const count = activeParticipants.length;
    const angle = 360 / count;
    const labelRadius = 176;
    const labelFontSize = count > 14 ? 9.5 : count > 8 ? 10.5 : 12;

    return (
        <div className={`lucky-wheel-stage ${spinning ? 'lucky-wheel-stage--spinning' : ''}`}>
            <div className='lucky-wheel-pointer' />
            <svg viewBox='0 0 420 420' className='lucky-wheel-svg' role='img' aria-label='Vòng quay may mắn'>
                <defs>
                    <filter id='wheelShadow' x='-20%' y='-20%' width='140%' height='140%'>
                        <feDropShadow dx='0' dy='16' stdDeviation='16' floodColor='#020617' floodOpacity='0.35' />
                    </filter>
                    <radialGradient id='wheelCenter' cx='50%' cy='38%' r='70%'>
                        <stop offset='0%' stopColor='#ffffff' />
                        <stop offset='48%' stopColor='#e0f2fe' />
                        <stop offset='100%' stopColor='#2563eb' />
                    </radialGradient>
                    <radialGradient id='wheelSheen' cx='50%' cy='42%' r='72%'>
                        <stop offset='0%' stopColor='#ffffff' stopOpacity='0.16' />
                        <stop offset='55%' stopColor='#ffffff' stopOpacity='0' />
                        <stop offset='100%' stopColor='#020617' stopOpacity='0.26' />
                    </radialGradient>
                    <radialGradient id='wheelBulb' cx='35%' cy='30%' r='80%'>
                        <stop offset='0%' stopColor='#fffbeb' />
                        <stop offset='55%' stopColor='#fde047' />
                        <stop offset='100%' stopColor='#b45309' />
                    </radialGradient>
                </defs>
                <g
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: '210px 210px',
                        transition: spinning ? 'transform 7.8s cubic-bezier(0.12, 0.72, 0.08, 1)' : 'transform 520ms ease',
                    }}
                    filter='url(#wheelShadow)'
                >
                    <circle cx='210' cy='210' r='198' fill='#f8fafc' />
                    {activeParticipants.map((participant, index) => {
                        const start = index * angle;
                        const end = start + angle;
                        const mid = start + angle / 2;
                        const point = polarToCartesian(210, 210, labelRadius, mid);
                        const normalizedMid = ((mid % 360) + 360) % 360;
                        // Chữ xếp dọc theo bán kính; nửa trái lật 180° + đổi anchor để không bao giờ ngược chữ.
                        const isLeftHalf = normalizedMid > 180;
                        const labelRotation = isLeftHalf ? mid + 90 : mid - 90;
                        const active = participant.active !== false;
                        return (
                            <g key={`${participant._id || participant.name}-${index}`} opacity={active ? 1 : 0.38}>
                                <path
                                    d={describeArc(210, 210, 188, start, end)}
                                    fill={PALETTE[index % PALETTE.length]}
                                    stroke='rgba(255,255,255,0.72)'
                                    strokeWidth='2'
                                />
                                <text
                                    x={point.x}
                                    y={point.y}
                                    textAnchor={isLeftHalf ? 'start' : 'end'}
                                    dominantBaseline='middle'
                                    transform={`rotate(${labelRotation} ${point.x} ${point.y})`}
                                    className='lucky-wheel-segment-label'
                                    style={{ '--wheel-label-size': `${labelFontSize}px` } as React.CSSProperties}
                                >
                                    {participant.name.length > 16 ? `${participant.name.slice(0, 15)}...` : participant.name}
                                </text>
                            </g>
                        );
                    })}
                    <circle cx='210' cy='210' r='188' fill='url(#wheelSheen)' pointerEvents='none' />
                    <circle cx='210' cy='210' r='72' fill='url(#wheelCenter)' stroke='rgba(255,255,255,0.9)' strokeWidth='8' />
                    <text x='210' y='198' textAnchor='middle' className='lucky-wheel-brand'>
                        HAIDANG
                    </text>
                    <text x='210' y='224' textAnchor='middle' className='lucky-wheel-brand-sub'>
                        LUCKY SPIN
                    </text>
                </g>
                <circle cx='210' cy='210' r='203' fill='none' stroke='#0b1220' strokeWidth='13' />
                <circle cx='210' cy='210' r='209' fill='none' stroke='rgba(255,255,255,0.25)' strokeWidth='1.5' />
                <circle cx='210' cy='210' r='196.5' fill='none' stroke='rgba(255,255,255,0.18)' strokeWidth='1' />
                {Array.from({ length: 24 }).map((_, index) => {
                    const bulb = polarToCartesian(210, 210, 203, index * 15);
                    return (
                        <circle
                            key={index}
                            cx={bulb.x}
                            cy={bulb.y}
                            r='3.4'
                            fill='url(#wheelBulb)'
                            className={`lucky-wheel-bulb ${index % 2 ? 'lucky-wheel-bulb--alt' : ''}`}
                        />
                    );
                })}
            </svg>
        </div>
    );
};

const WinnerModal = ({
    open,
    winner,
    onClose,
    onSpinNext,
    spinning,
    confetti,
}: {
    open: boolean;
    winner?: LuckyWheelWinner | null;
    onClose: () => void;
    onSpinNext: () => void;
    spinning: boolean;
    confetti: boolean;
}) => (
    <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        centered
        width={520}
        className='lucky-wheel-winner-modal'
        destroyOnHidden
    >
        <div className='lucky-wheel-winner'>
            {confetti ? (
                <div className='lucky-wheel-confetti' aria-hidden>
                    {Array.from({ length: 28 }).map((_, index) => (
                        <span
                            key={index}
                            style={
                                {
                                    '--i': index,
                                    left: `${(index * 37) % 100}%`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
            ) : null}
            <div className='lucky-wheel-winner__crown'>
                <CrownOutlined />
            </div>
            <Text className='lucky-wheel-winner__eyebrow'>Chúc mừng người may mắn</Text>
            <Title level={2} className='lucky-wheel-winner__name'>
                {winner?.name || 'Người trúng'}
            </Title>
            <Space wrap className='justify-center'>
                {winner?.code ? <Tag color='blue'>{winner.code}</Tag> : null}
                {winner?.plantName ? <Tag color='cyan'>{winner.plantName}</Tag> : null}
                {winner?.department ? <Tag color='gold'>{winner.department}</Tag> : null}
            </Space>
            <Text className='lucky-wheel-winner__meta'>
                Lượt quay #{winner?.spinNo || 1} · Pool {winner?.poolSize || 0} người
            </Text>
            <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center'>
                <Button size='large' onClick={onClose}>
                    Xác nhận
                </Button>
                <Button size='large' type='primary' icon={<PlayCircleOutlined />} loading={spinning} onClick={onSpinNext}>
                    Quay tiếp
                </Button>
            </div>
        </div>
    </Modal>
);

const LuckyWheelPage: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const screens = useBreakpoint();
    const { user } = useAuth();
    const [form] = Form.useForm();
    const [selectedId, setSelectedId] = useState<string>();
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [winnerResult, setWinnerResult] = useState<LuckyWheelSpinResult | null>(null);

    const { data: events = [], isLoading } = useQuery({
        queryKey: ['lucky-wheel-events'],
        queryFn: luckyWheelService.list,
    });

    const selectedEvent = useMemo(
        () => events.find((event) => event._id === selectedId) || events[0],
        [events, selectedId]
    );

    useEffect(() => {
        if (!selectedEvent) {
            form.setFieldsValue({
                name: `Sự kiện may mắn ${new Date().toLocaleDateString('vi-VN')}`,
                description: '',
                participantsText: defaultNames.join('\n'),
                theme: 'haidang-night',
                removeWinnerAfterSpin: true,
                allowRepeatWinners: false,
                confettiEnabled: true,
            });
            return;
        }

        setSelectedId(selectedEvent._id);
        form.setFieldsValue({
            name: selectedEvent.name,
            description: selectedEvent.description,
            participantsText: serializeParticipants(selectedEvent.participants || []),
            theme: selectedEvent.settings?.theme || 'haidang-night',
            removeWinnerAfterSpin: selectedEvent.settings?.removeWinnerAfterSpin ?? true,
            allowRepeatWinners: selectedEvent.settings?.allowRepeatWinners ?? false,
            confettiEnabled: selectedEvent.settings?.confettiEnabled ?? true,
        });
    }, [form, selectedEvent]);

    const upsertMutation = useMutation({
        mutationFn: async () => {
            const values = await form.validateFields();
            const participants = parseParticipantText(values.participantsText || '');
            if (participants.length < 2) throw new Error('Cần ít nhất 2 người tham gia để quay');
            const payload = {
                name: values.name,
                description: values.description,
                participants,
                settings: {
                    theme: values.theme,
                    removeWinnerAfterSpin: Boolean(values.removeWinnerAfterSpin),
                    allowRepeatWinners: Boolean(values.allowRepeatWinners),
                    confettiEnabled: Boolean(values.confettiEnabled),
                    spinDurationMs: 8000,
                    soundEnabled: true,
                },
            };
            return selectedEvent?._id ? luckyWheelService.update(selectedEvent._id, payload) : luckyWheelService.create(payload);
        },
        onSuccess: (event) => {
            setSelectedId(event._id);
            queryClient.invalidateQueries({ queryKey: ['lucky-wheel-events'] });
            message.success('Đã lưu sự kiện vòng quay');
        },
        onError: (error: any) => message.error(error?.message || 'Không lưu được sự kiện'),
    });

    const resetMutation = useMutation({
        mutationFn: (id: string) => luckyWheelService.reset(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lucky-wheel-events'] });
            message.success('Đã đặt lại danh sách người trúng');
        },
        onError: (error: any) => message.error(error?.message || 'Không reset được vòng quay'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => luckyWheelService.delete(id),
        onSuccess: () => {
            setSelectedId(undefined);
            queryClient.invalidateQueries({ queryKey: ['lucky-wheel-events'] });
            message.success('Đã xóa sự kiện');
        },
        onError: (error: any) => message.error(error?.message || 'Không xóa được sự kiện'),
    });

    const spinMutation = useMutation({
        mutationFn: (id: string) => luckyWheelService.spin(id),
        onSuccess: (result) => {
            const count = Math.max(result.event.participants.length, 1);
            const angle = 360 / count;
            const winnerIndex = Math.max(0, result.winnerIndex);
            const fullSpins = 7 + Math.floor(Math.random() * 3);
            const target = winnerIndex * angle + angle / 2;
            setSpinning(true);
            setWinnerResult(null);
            setRotation((current) => {
                const currentMod = ((current % 360) + 360) % 360;
                const desiredMod = ((-target % 360) + 360) % 360;
                const delta = desiredMod > currentMod ? desiredMod - currentMod : desiredMod - currentMod + 360;
                return current + fullSpins * 360 + delta;
            });
            window.setTimeout(() => {
                setSpinning(false);
                setWinnerResult(result);
                queryClient.invalidateQueries({ queryKey: ['lucky-wheel-events'] });
            }, result.event.settings?.spinDurationMs || 8000);
        },
        onError: (error: any) => {
            setSpinning(false);
            message.error(error?.message || 'Không quay được, hãy kiểm tra danh sách người tham gia');
        },
    });

    const handleSaveAndSpin = async () => {
        if (selectedEvent?._id) {
            spinMutation.mutate(selectedEvent._id);
            return;
        }
        const event = await upsertMutation.mutateAsync();
        spinMutation.mutate(event._id);
    };

    const currentTheme = themeMeta[(Form.useWatch('theme', form) as LuckyWheelTheme) || selectedEvent?.settings?.theme || 'haidang-night'];
    const participants = selectedEvent?.participants || parseParticipantText(form.getFieldValue('participantsText') || defaultNames.join('\n'));
    const activeCount = participants.filter((item) => item.active !== false).length;
    const winners = selectedEvent?.winners || [];

    if (!hasDirectorAccess(user?.role)) {
        return <Navigate to='/dashboard' replace />;
    }

    return (
        <div className={`lucky-wheel-page ${currentTheme.className}`}>
            <PageHeader
                title='Vòng quay may mắn'
                subtitle='Tổ chức mini event nội bộ cho giám đốc trở lên, kết quả quay được backend ghi nhận để minh bạch.'
                actions={
                    <Space wrap>
                        <Button
                            icon={<SaveOutlined />}
                            loading={upsertMutation.isPending}
                            onClick={() => upsertMutation.mutate()}
                        >
                            Lưu
                        </Button>
                        <Button
                            type='primary'
                            icon={<PlayCircleOutlined />}
                            loading={spinMutation.isPending || spinning}
                            disabled={isLoading}
                            onClick={handleSaveAndSpin}
                        >
                            Quay
                        </Button>
                    </Space>
                }
            />

            <div className='grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]'>
                <Card className='lucky-wheel-hero-card' styles={{ body: { padding: screens.md ? 28 : 16 } }}>
                    <div className='lucky-wheel-hero-card__glow' />
                    <div className='relative z-10 grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(320px,560px)_1fr]'>
                        <div className='mx-auto w-full max-w-[560px]'>
                            <LuckyWheelSvg participants={participants} rotation={rotation} spinning={spinning} />
                        </div>
                        <div className='space-y-5 text-white'>
                            <Tag color='cyan' className='rounded-full px-3 py-1 text-sm font-semibold'>
                                <GiftOutlined /> Event nội bộ
                            </Tag>
                            <div>
                                <Title level={2} className='!mb-2 !text-white'>
                                    {selectedEvent?.name || form.getFieldValue('name') || 'Sự kiện may mắn'}
                                </Title>
                                <Text className='text-base text-slate-200'>
                                    Vòng quay dùng random từ server, tự loại người đã trúng nếu bật chế độ loại khỏi vòng.
                                </Text>
                            </div>
                            <div className='grid grid-cols-3 gap-3'>
                                <div className='lucky-wheel-stat'>
                                    <span>{participants.length}</span>
                                    <small>tham gia</small>
                                </div>
                                <div className='lucky-wheel-stat'>
                                    <span>{activeCount}</span>
                                    <small>còn lại</small>
                                </div>
                                <div className='lucky-wheel-stat'>
                                    <span>{winners.length}</span>
                                    <small>đã trúng</small>
                                </div>
                            </div>
                            <Button
                                block={!screens.md}
                                size='large'
                                type='primary'
                                icon={<PlayCircleOutlined />}
                                className='lucky-wheel-spin-button'
                                loading={spinMutation.isPending || spinning}
                                onClick={handleSaveAndSpin}
                            >
                                Bắt đầu quay
                            </Button>
                        </div>
                    </div>
                </Card>

                <div className='space-y-5'>
                    <Card className='rounded-3xl border-slate-200/80 shadow-sm' styles={{ body: { padding: 18 } }}>
                        <div className='mb-4 flex items-center justify-between gap-3'>
                            <div>
                                <Text className='block text-sm font-bold text-slate-900'>Cấu hình sự kiện</Text>
                                <Text className='text-xs text-slate-500'>Nhập mỗi người một dòng. Có thể dùng: Tên | Mã | Cơ sở</Text>
                            </div>
                            {events.length ? (
                                <Select
                                    size='small'
                                    value={selectedEvent?._id}
                                    className='min-w-36'
                                    options={events.map((event) => ({ value: event._id, label: event.name }))}
                                    onChange={setSelectedId}
                                />
                            ) : null}
                        </div>
                        <Form form={form} layout='vertical'>
                            <Form.Item name='name' label='Tên sự kiện' rules={[{ required: true, message: 'Nhập tên sự kiện' }]}>
                                <Input placeholder='Ví dụ: Quay may mắn cuối tháng' />
                            </Form.Item>
                            <Form.Item name='description' label='Ghi chú'>
                                <Input placeholder='Ví dụ: Người trúng được mời nước / nhận quà' />
                            </Form.Item>
                            <Form.Item name='participantsText' label='Danh sách tham gia' rules={[{ required: true }]}>
                                <TextArea autoSize={{ minRows: 7, maxRows: 12 }} placeholder='Nguyễn Văn A | NV001 | Cơ sở 1' />
                            </Form.Item>
                            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                                <Form.Item name='theme' label='Theme'>
                                    <Select
                                        options={Object.entries(themeMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                                    />
                                </Form.Item>
                                <Form.Item name='confettiEnabled' label='Pháo giấy' valuePropName='checked'>
                                    <Switch />
                                </Form.Item>
                                <Form.Item name='removeWinnerAfterSpin' label='Loại người đã trúng' valuePropName='checked'>
                                    <Switch />
                                </Form.Item>
                                <Form.Item name='allowRepeatWinners' label='Cho trúng lặp' valuePropName='checked'>
                                    <Switch />
                                </Form.Item>
                            </div>
                        </Form>
                        <div className='flex flex-wrap gap-2'>
                            <Button icon={<SaveOutlined />} loading={upsertMutation.isPending} onClick={() => upsertMutation.mutate()}>
                                Lưu cấu hình
                            </Button>
                            {selectedEvent ? (
                                <>
                                    <Popconfirm
                                        title='Reset kết quả?'
                                        description='Tất cả người đã trúng sẽ được đưa lại vào vòng.'
                                        onConfirm={() => resetMutation.mutate(selectedEvent._id)}
                                    >
                                        <Button icon={<ReloadOutlined />} loading={resetMutation.isPending}>
                                            Reset
                                        </Button>
                                    </Popconfirm>
                                    <Popconfirm title='Xóa sự kiện?' onConfirm={() => deleteMutation.mutate(selectedEvent._id)}>
                                        <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
                                            Xóa
                                        </Button>
                                    </Popconfirm>
                                </>
                            ) : null}
                        </div>
                    </Card>

                    <Card
                        title={
                            <Space>
                                <HistoryOutlined />
                                Lịch sử trúng
                            </Space>
                        }
                        className='rounded-3xl border-slate-200/80 shadow-sm'
                        styles={{ body: { padding: 0 } }}
                    >
                        {winners.length ? (
                            <List
                                dataSource={[...winners].reverse()}
                                renderItem={(winner) => (
                                    <List.Item className='px-4'>
                                        <List.Item.Meta
                                            avatar={
                                                <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700'>
                                                    <TrophyOutlined />
                                                </div>
                                            }
                                            title={
                                                <div className='flex items-center justify-between gap-2'>
                                                    <span className='font-semibold text-slate-900'>{winner.name}</span>
                                                    <Tag color='gold'>#{winner.spinNo}</Tag>
                                                </div>
                                            }
                                            description={
                                                <Space size={6} wrap>
                                                    {winner.code ? <Text className='text-xs'>{winner.code}</Text> : null}
                                                    {winner.plantName ? <Text className='text-xs'>{winner.plantName}</Text> : null}
                                                    <Tooltip title={formatDateTime(winner.spunAt)}>
                                                        <Text className='text-xs text-slate-400'>{formatDateTime(winner.spunAt)}</Text>
                                                    </Tooltip>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lượt quay nào' className='py-8' />
                        )}
                    </Card>
                </div>
            </div>

            <WinnerModal
                open={Boolean(winnerResult)}
                winner={winnerResult?.winner}
                spinning={spinMutation.isPending || spinning}
                confetti={winnerResult?.event.settings?.confettiEnabled ?? true}
                onClose={() => setWinnerResult(null)}
                onSpinNext={() => {
                    setWinnerResult(null);
                    if (selectedEvent?._id) spinMutation.mutate(selectedEvent._id);
                }}
            />
        </div>
    );
};

export default LuckyWheelPage;
