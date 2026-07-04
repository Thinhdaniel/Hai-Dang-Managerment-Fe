import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Select, Spin, Tag } from 'antd';
import {
    AimOutlined,
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlusOutlined,
    RollbackOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { plantService } from '../core/services';
import { floorMapService } from '../core/services/floor-map.service';
import { socketService } from '../core/services/socket.service';
import { useAuth } from '../core/contexts/AuthContext';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { ASSET_STATUS_COLOR } from '../core/constants/assetStatusColor';
import { AssetStatus, type FloorMapMachine, type FloorZone } from '../core/types';

// ─── Sơ đồ xưởng: giám sát máy theo mặt bằng, real-time qua socket asset:updated ───
// Chế độ Giám sát: sàn isometric 3D, máy = khối nổi phát sáng theo trạng thái.
// Chế độ Thiết lập (Giám đốc trở lên): sàn phẳng 2D, kéo-thả máy + vẽ khu vực.

const FLOOR_W = 800;
const FLOOR_H = 560;
const SCENE_W = 1000;
const SCENE_H = 640;

type StatusVisual = 'ok' | 'bad' | 'warn' | 'loan' | 'idle';

const STATUS_VISUAL: Record<string, StatusVisual> = {
    [AssetStatus.ACTIVE]: 'ok',
    [AssetStatus.BROKEN]: 'bad',
    [AssetStatus.MAINTENANCE]: 'warn',
    [AssetStatus.PENDING_DISPOSAL]: 'warn',
    [AssetStatus.BORROWING]: 'loan',
    [AssetStatus.STORAGE]: 'idle',
};

const CHIP_COLOR: Record<StatusVisual, string> = {
    ok: '#2ee6a8',
    bad: '#ff4d5e',
    warn: '#ffb84d',
    loan: '#818cf8',
    idle: '#5d6b8a',
};

const visualOf = (status: AssetStatus): StatusVisual => STATUS_VISUAL[status] ?? 'idle';
const statusLabel = (status: AssetStatus) => ASSET_STATUS_COLOR[status]?.label ?? status;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

type FeedItem = { id: number; time: string; msg: string; cls?: 'alarm' | 'fix' };

type DragState =
    | { kind: 'machine'; id: string; moved: boolean }
    | { kind: 'zone'; id: string; startX: number; startY: number; orig: FloorZone; moved: boolean }
    | { kind: 'resize'; id: string; startX: number; startY: number; orig: FloorZone };

interface AssetSocketPayload {
    action?: string;
    assetId?: string;
    asset?: {
        id?: string;
        name?: string;
        machineCode?: string;
        type?: string;
        status?: AssetStatus;
        plantId?: string;
        floorPos?: { x: number; y: number };
    };
}

const nowTime = () =>
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let feedSeq = 0;

const FloorMapPage: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const canEdit = Boolean(role) && (isAdmin(role!) || isDirector(role!));

    const [plantId, setPlantId] = useState<string>('');
    const [editMode, setEditMode] = useState(false);
    const [machines, setMachines] = useState<FloorMapMachine[]>([]);
    const [zones, setZones] = useState<FloorZone[]>([]);
    const [dirtyPos, setDirtyPos] = useState<Record<string, { x: number; y: number } | null>>({});
    const [zonesDirty, setZonesDirty] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [unplacedSearch, setUnplacedSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [clock, setClock] = useState(nowTime());

    const plantsQuery = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    useEffect(() => {
        if (!plantId && plantsQuery.data?.length) {
            const mine = user?.plantId && plantsQuery.data.find((p) => p.id === user.plantId);
            setPlantId(mine ? mine.id : plantsQuery.data[0].id);
        }
    }, [plantsQuery.data, plantId, user?.plantId]);

    const mapQuery = useQuery({
        queryKey: ['floor-map', plantId],
        queryFn: () => floorMapService.getMap(plantId),
        enabled: Boolean(plantId),
    });

    // Đồng bộ dữ liệu server -> state cục bộ (state cục bộ nhận thêm patch socket + kéo-thả)
    useEffect(() => {
        if (mapQuery.data) {
            setMachines(mapQuery.data.machines);
            setZones(mapQuery.data.zones);
            setDirtyPos({});
            setZonesDirty(false);
            setSelectedId(null);
            setSelectedZoneId(null);
        }
    }, [mapQuery.data]);

    const pushFeed = useCallback((msg: string, cls?: 'alarm' | 'fix') => {
        setFeed((prev) => [{ id: ++feedSeq, time: nowTime(), msg, cls }, ...prev].slice(0, 30));
    }, []);

    // ── Real-time: nghe sự kiện asset sẵn có của hệ thống ──────────────────
    useEffect(() => {
        if (!plantId) return;

        const offUpdated = socketService.on<AssetSocketPayload>('asset:updated', (payload) => {
            const asset = payload?.asset;
            const id = payload?.assetId || asset?.id;
            if (!id || !asset) return;

            setMachines((prev) => {
                const existing = prev.find((m) => m.id === id);
                // Máy chuyển sang cơ sở khác -> gỡ khỏi sơ đồ hiện tại
                if (asset.plantId && asset.plantId !== plantId) {
                    if (existing) pushFeed(`${existing.machineCode} đã chuyển sang cơ sở khác`);
                    return existing ? prev.filter((m) => m.id !== id) : prev;
                }
                if (!existing) return prev;

                if (asset.status && asset.status !== existing.status) {
                    const code = existing.machineCode;
                    if (asset.status === AssetStatus.BROKEN) {
                        pushFeed(`⚠ BÁO HỎNG — ${code} · ${existing.name}`, 'alarm');
                    } else if (asset.status === AssetStatus.MAINTENANCE) {
                        pushFeed(`${code} vào bảo trì`);
                    } else if (
                        asset.status === AssetStatus.ACTIVE &&
                        (existing.status === AssetStatus.BROKEN || existing.status === AssetStatus.MAINTENANCE)
                    ) {
                        pushFeed(`✓ ${code} hoạt động trở lại`, 'fix');
                    }
                }

                return prev.map((m) =>
                    m.id === id
                        ? {
                              ...m,
                              name: asset.name ?? m.name,
                              machineCode: asset.machineCode ?? m.machineCode,
                              type: asset.type ?? m.type,
                              status: asset.status ?? m.status,
                          }
                        : m
                );
            });
        });

        const offCreated = socketService.on<AssetSocketPayload>('asset:created', (payload) => {
            if (payload?.asset?.plantId === plantId) {
                void queryClient.invalidateQueries({ queryKey: ['floor-map', plantId] });
            }
        });

        const offDeleted = socketService.on<AssetSocketPayload>('asset:deleted', (payload) => {
            const id = payload?.assetId || payload?.asset?.id;
            if (id) setMachines((prev) => prev.filter((m) => m.id !== id));
        });

        return () => {
            offUpdated();
            offCreated();
            offDeleted();
        };
    }, [plantId, pushFeed, queryClient]);

    useEffect(() => {
        const timer = setInterval(() => setClock(nowTime()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (mapQuery.data && plantId) {
            pushFeed(`Đang giám sát trực tiếp — ${mapQuery.data.machines.length} máy`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapQuery.data, plantId]);

    // ── Scale sơ đồ isometric theo bề rộng khung ───────────────────────────
    const viewportRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const viewport = viewportRef.current;
        const scene = sceneRef.current;
        if (!viewport || !scene || editMode) return;
        const fit = () => {
            const s = Math.min(viewport.clientWidth / SCENE_W, 1);
            scene.style.transform = `scale(${s})`;
            viewport.style.height = `${SCENE_H * s}px`;
        };
        const ro = new ResizeObserver(fit);
        ro.observe(viewport);
        fit();
        return () => ro.disconnect();
    }, [editMode, mapQuery.data]);

    // ── Kéo-thả trong chế độ thiết lập (sàn phẳng) ─────────────────────────
    const flatRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);

    const pointerPercent = (e: React.PointerEvent) => {
        const rect = flatRef.current?.getBoundingClientRect();
        if (!rect) return { x: 50, y: 50 };
        return {
            x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
            y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
        };
    };

    const markPosDirty = (assetId: string, pos: { x: number; y: number } | null) => {
        setDirtyPos((prev) => ({ ...prev, [assetId]: pos ? { x: round2(pos.x), y: round2(pos.y) } : null }));
    };

    const onMachinePointerDown = (e: React.PointerEvent, id: string) => {
        if (!editMode) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { kind: 'machine', id, moved: false };
    };

    const onMachinePointerMove = (e: React.PointerEvent, id: string) => {
        const drag = dragRef.current;
        if (!drag || drag.kind !== 'machine' || drag.id !== id) return;
        drag.moved = true;
        const pos = pointerPercent(e);
        const next = { x: clamp(pos.x, 1, 99), y: clamp(pos.y, 1, 99) };
        setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, floorPos: next } : m)));
        markPosDirty(id, next);
    };

    const onMachinePointerUp = (e: React.PointerEvent, id: string) => {
        const drag = dragRef.current;
        if (drag?.kind === 'machine' && drag.id === id && !drag.moved) {
            setSelectedId((prev) => (prev === id ? null : id));
            setSelectedZoneId(null);
        }
        dragRef.current = null;
    };

    const onZonePointerDown = (e: React.PointerEvent, zone: FloorZone, resize = false) => {
        if (!editMode) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = resize
            ? { kind: 'resize', id: zone.id, startX: e.clientX, startY: e.clientY, orig: { ...zone } }
            : { kind: 'zone', id: zone.id, startX: e.clientX, startY: e.clientY, orig: { ...zone }, moved: false };
    };

    const onZonePointerMove = (e: React.PointerEvent, id: string) => {
        const drag = dragRef.current;
        const rect = flatRef.current?.getBoundingClientRect();
        if (!drag || drag.id !== id || !rect || drag.kind === 'machine') return;
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (drag.kind === 'zone') {
            drag.moved = true;
            setZones((prev) =>
                prev.map((z) =>
                    z.id === id
                        ? {
                              ...z,
                              x: round2(clamp(drag.orig.x + dx, 0, 100 - z.w)),
                              y: round2(clamp(drag.orig.y + dy, 0, 100 - z.h)),
                          }
                        : z
                )
            );
            setZonesDirty(true);
        } else {
            setZones((prev) =>
                prev.map((z) =>
                    z.id === id
                        ? {
                              ...z,
                              w: round2(clamp(drag.orig.w + dx, 6, 100 - z.x)),
                              h: round2(clamp(drag.orig.h + dy, 6, 100 - z.y)),
                          }
                        : z
                )
            );
            setZonesDirty(true);
        }
    };

    const onZonePointerUp = (e: React.PointerEvent, id: string) => {
        const drag = dragRef.current;
        if (drag?.kind === 'zone' && drag.id === id && !drag.moved) {
            setSelectedZoneId((prev) => (prev === id ? null : id));
            setSelectedId(null);
        }
        dragRef.current = null;
    };

    const addZone = () => {
        const id = `tmp-${Date.now()}`;
        setZones((prev) => [...prev, { id, name: `Khu ${prev.length + 1}`, x: 34, y: 34, w: 32, h: 22 }]);
        setSelectedZoneId(id);
        setZonesDirty(true);
    };

    const removeZone = (id: string) => {
        setZones((prev) => prev.filter((z) => z.id !== id));
        if (selectedZoneId === id) setSelectedZoneId(null);
        setZonesDirty(true);
    };

    const renameZone = (id: string, name: string) => {
        setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
        setZonesDirty(true);
    };

    const placeMachine = (id: string) => {
        // Đặt vào giữa sàn (lệch nhẹ để không chồng lên nhau), sau đó kéo tới vị trí thật
        const jitter = () => 46 + Math.random() * 8;
        const next = { x: round2(jitter()), y: round2(jitter()) };
        setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, floorPos: next } : m)));
        markPosDirty(id, next);
        setSelectedId(id);
    };

    const unplaceMachine = (id: string) => {
        setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, floorPos: null } : m)));
        markPosDirty(id, null);
        if (selectedId === id) setSelectedId(null);
    };

    const dirtyCount = Object.keys(dirtyPos).length + (zonesDirty ? 1 : 0);

    const handleSave = async () => {
        if (!plantId) return;
        try {
            setSaving(true);
            await floorMapService.saveZones(
                plantId,
                zones.map((z) => ({
                    id: z.id.startsWith('tmp-') ? undefined : z.id,
                    name: z.name.trim() || 'Khu chưa đặt tên',
                    x: z.x,
                    y: z.y,
                    w: z.w,
                    h: z.h,
                }))
            );
            const items = Object.entries(dirtyPos).map(([assetId, pos]) => ({
                assetId,
                x: pos?.x ?? null,
                y: pos?.y ?? null,
            }));
            if (items.length) await floorMapService.savePositions(items);
            message.success('Đã lưu sơ đồ xưởng');
            await queryClient.invalidateQueries({ queryKey: ['floor-map', plantId] });
        } catch {
            message.error('Lưu sơ đồ thất bại, thử lại sau');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        if (mapQuery.data) {
            setMachines(mapQuery.data.machines);
            setZones(mapQuery.data.zones);
        }
        setDirtyPos({});
        setZonesDirty(false);
    };

    // ── Dữ liệu suy ra ─────────────────────────────────────────────────────
    const placed = useMemo(() => machines.filter((m) => m.floorPos), [machines]);
    const unplaced = useMemo(() => {
        const kw = unplacedSearch.trim().toLowerCase();
        return machines
            .filter((m) => !m.floorPos)
            .filter(
                (m) =>
                    !kw ||
                    m.machineCode.toLowerCase().includes(kw) ||
                    m.name.toLowerCase().includes(kw) ||
                    m.type.toLowerCase().includes(kw)
            );
    }, [machines, unplacedSearch]);

    const kpi = useMemo(
        () => ({
            total: machines.length,
            ok: machines.filter((m) => m.status === AssetStatus.ACTIVE).length,
            bad: machines.filter((m) => m.status === AssetStatus.BROKEN).length,
            maint: machines.filter((m) => m.status === AssetStatus.MAINTENANCE).length,
        }),
        [machines]
    );

    const selected = useMemo(() => machines.find((m) => m.id === selectedId) ?? null, [machines, selectedId]);
    const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) ?? null, [zones, selectedZoneId]);
    const plantName = plantsQuery.data?.find((p) => p.id === plantId)?.name ?? '';

    const renderIsoMachine = (m: FloorMapMachine) => {
        if (!m.floorPos) return null;
        const visual = visualOf(m.status);
        const px = (m.floorPos.x / 100) * FLOOR_W;
        const py = (m.floorPos.y / 100) * FLOOR_H;
        return (
            <React.Fragment key={m.id}>
                {visual === 'bad' ? (
                    <div className='fmp-ring' style={{ left: px - 23, top: py - 26 }} />
                ) : null}
                <button
                    type='button'
                    className={`fmp-m fmp-${visual}${selectedId === m.id ? ' fmp-selected' : ''}`}
                    style={{ left: px, top: py }}
                    aria-label={m.machineCode}
                    title={`${m.machineCode} · ${statusLabel(m.status)}`}
                    onClick={() => {
                        setSelectedId((prev) => (prev === m.id ? null : m.id));
                    }}
                >
                    <span className='fmp-shadow' />
                    <span className='fmp-cub fmp-base'>
                        <i className='fmp-t' />
                        <i className='fmp-f' />
                        <i className='fmp-s' />
                    </span>
                    <span className='fmp-cub fmp-head'>
                        <i className='fmp-t' />
                        <i className='fmp-f' />
                        <i className='fmp-s' />
                    </span>
                </button>
            </React.Fragment>
        );
    };

    const hasLayout = zones.length > 0 || placed.length > 0;

    return (
        <div className='fmp-page rounded-2xl p-4 md:p-5'>
            <style>{FMP_CSS}</style>

            {/* ── Header ── */}
            <div className='mb-4 flex flex-wrap items-center gap-3'>
                <div className='fmp-badge'>HD</div>
                <div className='min-w-0'>
                    <h1 className='fmp-title m-0'>Sơ đồ xưởng</h1>
                    <div className='fmp-sub'>
                        {plantName ? `${plantName} · ` : ''}giám sát trạng thái máy theo mặt bằng, real-time
                    </div>
                </div>
                <div className='ml-auto flex flex-wrap items-center gap-3'>
                    <span className='fmp-live'>
                        <span className={`fmp-dot${socketService.isConnected() ? '' : ' fmp-dot-off'}`} />
                        {socketService.isConnected() ? 'LIVE' : 'MẤT KẾT NỐI'}
                    </span>
                    <span className='fmp-clock'>{clock}</span>
                    <Select
                        size='middle'
                        style={{ minWidth: 190 }}
                        placeholder='Chọn cơ sở'
                        value={plantId || undefined}
                        onChange={(v) => setPlantId(v)}
                        options={(plantsQuery.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                        loading={plantsQuery.isLoading}
                    />
                    {canEdit ? (
                        editMode ? (
                            <div className='flex items-center gap-2'>
                                <Button icon={<RollbackOutlined />} onClick={handleDiscard} disabled={!dirtyCount}>
                                    Hủy thay đổi
                                </Button>
                                <Button
                                    type='primary'
                                    icon={<CheckOutlined />}
                                    loading={saving}
                                    disabled={!dirtyCount}
                                    onClick={handleSave}
                                >
                                    Lưu sơ đồ{dirtyCount ? ` (${dirtyCount})` : ''}
                                </Button>
                                <Button icon={<EyeOutlined />} onClick={() => setEditMode(false)}>
                                    Xem giám sát
                                </Button>
                            </div>
                        ) : (
                            <Button icon={<EditOutlined />} onClick={() => setEditMode(true)}>
                                Thiết lập
                            </Button>
                        )
                    ) : null}
                </div>
            </div>

            {/* ── KPI ── */}
            <div className='mb-4 flex flex-wrap gap-3'>
                <div className='fmp-kpi'>
                    <div className='fmp-num'>{kpi.total}</div>
                    <div className='fmp-lbl'>Tổng máy</div>
                </div>
                <div className='fmp-kpi fmp-k-ok'>
                    <div className='fmp-num'>{kpi.ok}</div>
                    <div className='fmp-lbl'>Đang chạy</div>
                </div>
                <div className='fmp-kpi fmp-k-bad'>
                    <div className='fmp-num'>{kpi.bad}</div>
                    <div className='fmp-lbl'>Đang hỏng</div>
                </div>
                <div className='fmp-kpi fmp-k-warn'>
                    <div className='fmp-num'>{kpi.maint}</div>
                    <div className='fmp-lbl'>Bảo trì</div>
                </div>
                <div className='fmp-kpi'>
                    <div className='fmp-num'>{placed.length}</div>
                    <div className='fmp-lbl'>Đã lên sơ đồ</div>
                </div>
            </div>

            <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]'>
                {/* ── Sàn xưởng ── */}
                <div className='fmp-card relative p-3'>
                    <span className='fmp-hud fmp-tl' />
                    <span className='fmp-hud fmp-tr' />
                    <span className='fmp-hud fmp-bl' />
                    <span className='fmp-hud fmp-br' />

                    {mapQuery.isLoading ? (
                        <div className='flex h-72 items-center justify-center'>
                            <Spin />
                        </div>
                    ) : !hasLayout && !editMode ? (
                        <div className='py-10'>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <span className='fmp-sub'>
                                        Cơ sở này chưa thiết lập sơ đồ mặt bằng
                                    </span>
                                }
                            >
                                {canEdit ? (
                                    <Button type='primary' icon={<EditOutlined />} onClick={() => setEditMode(true)}>
                                        Thiết lập ngay
                                    </Button>
                                ) : null}
                            </Empty>
                        </div>
                    ) : editMode ? (
                        <>
                            <div className='mb-2 flex flex-wrap items-center gap-2 px-1'>
                                <span className='fmp-head-label'>Thiết lập mặt bằng</span>
                                <span className='fmp-sub'>kéo máy/khu tới vị trí · kéo góc để đổi cỡ khu</span>
                                <div className='ml-auto flex items-center gap-2'>
                                    <Button size='small' icon={<PlusOutlined />} onClick={addZone}>
                                        Thêm khu
                                    </Button>
                                </div>
                            </div>
                            {selectedZone ? (
                                <div className='mb-2 flex flex-wrap items-center gap-2 px-1'>
                                    <span className='fmp-sub'>Khu đang chọn:</span>
                                    <Input
                                        size='small'
                                        style={{ width: 200 }}
                                        value={selectedZone.name}
                                        maxLength={60}
                                        onChange={(e) => renameZone(selectedZone.id, e.target.value)}
                                    />
                                    <Popconfirm
                                        title='Xoá khu này khỏi sơ đồ?'
                                        okText='Xoá'
                                        cancelText='Thôi'
                                        onConfirm={() => removeZone(selectedZone.id)}
                                    >
                                        <Button size='small' danger icon={<DeleteOutlined />}>
                                            Xoá khu
                                        </Button>
                                    </Popconfirm>
                                </div>
                            ) : null}
                            <div ref={flatRef} className='fmp-flat'>
                                {zones.map((z) => (
                                    <div
                                        key={z.id}
                                        className={`fmp-flat-zone${selectedZoneId === z.id ? ' fmp-zone-sel' : ''}`}
                                        style={{
                                            left: `${z.x}%`,
                                            top: `${z.y}%`,
                                            width: `${z.w}%`,
                                            height: `${z.h}%`,
                                        }}
                                        onPointerDown={(e) => onZonePointerDown(e, z)}
                                        onPointerMove={(e) => onZonePointerMove(e, z.id)}
                                        onPointerUp={(e) => onZonePointerUp(e, z.id)}
                                    >
                                        <span className='fmp-zname'>{z.name}</span>
                                        <span
                                            className='fmp-resize'
                                            onPointerDown={(e) => onZonePointerDown(e, z, true)}
                                            onPointerMove={(e) => onZonePointerMove(e, z.id)}
                                            onPointerUp={() => {
                                                dragRef.current = null;
                                            }}
                                        />
                                    </div>
                                ))}
                                {placed.map((m) => {
                                    const visual = visualOf(m.status);
                                    return (
                                        <button
                                            key={m.id}
                                            type='button'
                                            className={`fmp-chip${selectedId === m.id ? ' fmp-chip-sel' : ''}`}
                                            style={{
                                                left: `${m.floorPos!.x}%`,
                                                top: `${m.floorPos!.y}%`,
                                                background: CHIP_COLOR[visual],
                                            }}
                                            title={`${m.machineCode} · ${m.name}`}
                                            onPointerDown={(e) => onMachinePointerDown(e, m.id)}
                                            onPointerMove={(e) => onMachinePointerMove(e, m.id)}
                                            onPointerUp={(e) => onMachinePointerUp(e, m.id)}
                                        />
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className='mb-1 flex flex-wrap items-center gap-2 px-1'>
                                <span className='fmp-head-label'>Mặt bằng trực tiếp</span>
                                <span className='fmp-sub'>bấm vào khối máy để xem chi tiết</span>
                            </div>
                            <div ref={viewportRef} className='fmp-viewport'>
                                <div ref={sceneRef} className='fmp-scene'>
                                    <div className='fmp-plane'>
                                        <div className='fmp-slab-f' />
                                        <div className='fmp-slab-s' />
                                        <div className='fmp-sweep' />
                                        {zones.map((z) => (
                                            <div
                                                key={z.id}
                                                className='fmp-zone'
                                                style={{
                                                    left: (z.x / 100) * FLOOR_W,
                                                    top: (z.y / 100) * FLOOR_H,
                                                    width: (z.w / 100) * FLOOR_W,
                                                    height: (z.h / 100) * FLOOR_H,
                                                }}
                                            >
                                                <span className='fmp-zname'>{z.name}</span>
                                            </div>
                                        ))}
                                        {placed.map(renderIsoMachine)}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Panel bên phải ── */}
                <div className='flex min-w-0 flex-col gap-4'>
                    <div className='fmp-card p-4'>
                        <h3 className='fmp-h3'>Chi tiết máy</h3>
                        {selected ? (
                            <div>
                                <div className='fmp-code'>{selected.machineCode}</div>
                                <div className='fmp-sub mb-2'>
                                    {selected.name} · {selected.type}
                                </div>
                                <Tag color={ASSET_STATUS_COLOR[selected.status]?.color}>
                                    {statusLabel(selected.status)}
                                </Tag>
                                <div className='mt-3 flex flex-col gap-2'>
                                    <Button
                                        type='primary'
                                        size='small'
                                        onClick={() => navigate(`/assets/${selected.id}`)}
                                    >
                                        Mở hồ sơ máy →
                                    </Button>
                                    {editMode && selected.floorPos ? (
                                        <Button
                                            size='small'
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => unplaceMachine(selected.id)}
                                        >
                                            Gỡ khỏi sơ đồ
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ) : (
                            <div className='fmp-sub'>Bấm vào một máy trên sơ đồ.</div>
                        )}
                    </div>

                    {editMode ? (
                        <div className='fmp-card p-4'>
                            <h3 className='fmp-h3'>Máy chưa lên sơ đồ ({unplaced.length})</h3>
                            <Input
                                size='small'
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder='Tìm mã máy, tên, loại...'
                                value={unplacedSearch}
                                onChange={(e) => setUnplacedSearch(e.target.value)}
                                className='mb-2'
                            />
                            <div className='fmp-unplaced'>
                                {unplaced.slice(0, 80).map((m) => (
                                    <button
                                        key={m.id}
                                        type='button'
                                        className='fmp-uitem'
                                        title='Bấm để đặt vào giữa sơ đồ, sau đó kéo tới vị trí thật'
                                        onClick={() => placeMachine(m.id)}
                                    >
                                        <span
                                            className='fmp-usw'
                                            style={{ background: CHIP_COLOR[visualOf(m.status)] }}
                                        />
                                        <span className='fmp-ucode'>{m.machineCode}</span>
                                        <AimOutlined className='fmp-uadd' />
                                    </button>
                                ))}
                                {unplaced.length > 80 ? (
                                    <div className='fmp-sub px-1 py-1'>… và {unplaced.length - 80} máy nữa</div>
                                ) : null}
                                {!unplaced.length ? (
                                    <div className='fmp-sub px-1 py-1'>Tất cả máy đã có vị trí 🎉</div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className='fmp-card p-4'>
                            <h3 className='fmp-h3'>Sự kiện trực tiếp</h3>
                            <div className='fmp-feed'>
                                {feed.map((item) => (
                                    <div key={item.id} className={`fmp-fe${item.cls ? ` fmp-${item.cls}` : ''}`}>
                                        <span className='fmp-fe-t'>{item.time}</span>
                                        <span className='fmp-fe-m'>{item.msg}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className='fmp-card p-4'>
                        <h3 className='fmp-h3'>Chú giải</h3>
                        <div className='flex flex-col gap-2'>
                            {(
                                [
                                    ['ok', 'Đang hoạt động'],
                                    ['bad', 'Đang hỏng — chờ sửa'],
                                    ['warn', 'Bảo trì / chờ thanh lý'],
                                    ['loan', 'Đang mượn'],
                                    ['idle', 'Tồn kho / khác'],
                                ] as [StatusVisual, string][]
                            ).map(([visual, label]) => (
                                <div key={visual} className='fmp-lg-row'>
                                    <span className='fmp-lg-sw' style={{ background: CHIP_COLOR[visual] }} />
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// CSS thuần cho phần isometric 3D + không khí "command center" (Tailwind không diễn tả được mặt khối 3D)
const FMP_CSS = `
.fmp-page {
    background:
        radial-gradient(1100px 480px at 22% -10%, rgba(79,124,255,0.16), transparent 60%),
        radial-gradient(900px 600px at 100% 115%, rgba(56,225,255,0.08), transparent 55%),
        #070b16;
    color: #e2e9ff;
    min-height: calc(100vh - 120px);
}
.fmp-badge {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #4f7cff, #2f51d9);
    box-shadow: 0 0 20px rgba(79,124,255,0.5);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 13px; color: #fff;
}
.fmp-title { font-size: 16px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #e2e9ff; }
.fmp-sub { color: #7d8ab3; font-size: 12px; }
.fmp-live { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #2ee6a8; }
.fmp-dot { width: 8px; height: 8px; border-radius: 50%; background: #2ee6a8; box-shadow: 0 0 10px #2ee6a8; animation: fmpBlink 1.4s ease-in-out infinite; }
.fmp-dot-off { background: #ff4d5e; box-shadow: 0 0 10px #ff4d5e; animation: none; }
@keyframes fmpBlink { 50% { opacity: 0.25; } }
.fmp-clock { font-family: ui-monospace, Consolas, monospace; font-size: 19px; font-weight: 700; color: #38e1ff; text-shadow: 0 0 16px rgba(56,225,255,0.5); font-variant-numeric: tabular-nums; }

.fmp-kpi {
    flex: 1; min-width: 108px;
    background: rgba(15,23,46,0.66); border: 1px solid rgba(96,140,255,0.16);
    border-radius: 13px; padding: 10px 16px;
    position: relative; overflow: hidden;
}
.fmp-kpi::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #38e1ff; opacity: 0.75; }
.fmp-k-ok::after { background: #2ee6a8; }
.fmp-k-bad::after { background: #ff4d5e; }
.fmp-k-warn::after { background: #ffb84d; }
.fmp-num { font-size: 25px; font-weight: 800; line-height: 1.15; font-variant-numeric: tabular-nums; font-family: ui-monospace, Consolas, monospace; }
.fmp-k-ok .fmp-num { color: #2ee6a8; } .fmp-k-bad .fmp-num { color: #ff4d5e; } .fmp-k-warn .fmp-num { color: #ffb84d; }
.fmp-lbl { font-size: 10px; color: #5c6a94; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }

.fmp-card {
    background: rgba(15,23,46,0.66); border: 1px solid rgba(96,140,255,0.16);
    border-radius: 15px;
    box-shadow: inset 0 1px 0 rgba(140,175,255,0.10), 0 10px 40px rgba(0,0,0,0.35);
}
.fmp-hud { position: absolute; width: 20px; height: 20px; border-color: #38e1ff; border-style: solid; opacity: 0.5; pointer-events: none; }
.fmp-tl { top: 7px; left: 7px; border-width: 2px 0 0 2px; border-radius: 6px 0 0 0; }
.fmp-tr { top: 7px; right: 7px; border-width: 2px 2px 0 0; border-radius: 0 6px 0 0; }
.fmp-bl { bottom: 7px; left: 7px; border-width: 0 0 2px 2px; border-radius: 0 0 0 6px; }
.fmp-br { bottom: 7px; right: 7px; border-width: 0 2px 2px 0; border-radius: 0 0 6px 0; }
.fmp-head-label { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #38e1ff; font-weight: 700; }
.fmp-h3 {
    margin: 0 0 10px; font-size: 10.5px; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase; color: #5c6a94;
    display: flex; align-items: center; gap: 8px;
}
.fmp-h3::after { content: ""; flex: 1; height: 1px; background: rgba(96,140,255,0.16); }
.fmp-code { font-family: ui-monospace, Consolas, monospace; font-size: 15px; font-weight: 800; color: #38e1ff; }

/* ── Isometric ── */
.fmp-viewport { width: 100%; overflow: hidden; position: relative; }
.fmp-scene { width: ${SCENE_W}px; height: ${SCENE_H}px; position: relative; transform-origin: 0 0; }
.fmp-plane {
    position: absolute; left: ${SCENE_W / 2}px; top: ${SCENE_H / 2 + 18}px;
    width: ${FLOOR_W}px; height: ${FLOOR_H}px;
    margin-left: -${FLOOR_W / 2}px; margin-top: -${FLOOR_H / 2}px;
    transform: rotateX(56deg) rotateZ(-45deg);
    transform-style: preserve-3d;
    background:
        linear-gradient(rgba(88,130,255,0.10) 1px, transparent 1px),
        linear-gradient(90deg, rgba(88,130,255,0.10) 1px, transparent 1px),
        radial-gradient(60% 60% at 50% 45%, rgba(38,58,110,0.55), transparent),
        linear-gradient(160deg, #131e3c, #0a1226);
    background-size: 40px 40px, 40px 40px, auto, auto;
    border: 1px solid rgba(96,140,255,0.28);
    border-radius: 5px;
    box-shadow: 0 0 90px rgba(79,124,255,0.13) inset;
}
.fmp-slab-f {
    position: absolute; left: 0; top: 100%; width: ${FLOOR_W}px; height: 18px;
    transform-origin: center top; transform: rotateX(-90deg);
    background: linear-gradient(#182448, #0a1122);
}
.fmp-slab-s {
    position: absolute; left: 100%; top: 0; width: 18px; height: ${FLOOR_H}px;
    transform-origin: left center; transform: rotateY(90deg);
    background: linear-gradient(90deg, #101a36, #080e1e);
}
.fmp-sweep { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: 5px; }
.fmp-sweep::before {
    content: ""; position: absolute; top: 0; bottom: 0; width: 100px;
    background: linear-gradient(90deg, transparent, rgba(56,225,255,0.14), transparent);
    animation: fmpSweep 8s linear infinite;
}
@keyframes fmpSweep { from { left: -130px; } to { left: 110%; } }

.fmp-zone {
    position: absolute;
    border: 1px dashed rgba(56,225,255,0.28);
    background: rgba(56,225,255,0.03);
    border-radius: 4px;
}
.fmp-zname {
    position: absolute; top: -1px; left: -1px;
    font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: #9fefff;
    background: rgba(16,42,66,0.85);
    border: 1px solid rgba(56,225,255,0.25);
    border-radius: 4px 0 6px 0;
    padding: 2px 9px;
    white-space: nowrap; pointer-events: none;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}

.fmp-m {
    position: absolute; width: 26px; height: 20px;
    transform-style: preserve-3d;
    background: none; border: none; padding: 0; cursor: pointer;
}
.fmp-shadow {
    position: absolute; left: -4px; top: -3px; width: 36px; height: 30px;
    background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 68%);
    border-radius: 50%;
}
.fmp-cub { position: absolute; left: 0; top: 0; width: var(--w); height: var(--dp); transform-style: preserve-3d; }
.fmp-cub i { position: absolute; display: block; }
.fmp-cub .fmp-t { inset: 0; transform: translateZ(var(--h)); background: var(--ct); border-radius: 2px; }
.fmp-cub .fmp-f { left: 0; top: 100%; width: var(--w); height: var(--h); transform-origin: center top; transform: rotateX(-90deg); background: var(--cf); }
.fmp-cub .fmp-s { left: 100%; top: 0; width: var(--h); height: var(--dp); transform-origin: left center; transform: rotateY(90deg); background: var(--cs); }
.fmp-base { --w: 26px; --dp: 20px; --h: 8px; --ct: #33436a; --cf: #232f4e; --cs: #182238; }
.fmp-head { --w: 13px; --dp: 13px; --h: 10px; left: 3px; top: 3px; transform: translateZ(8px); }
.fmp-ok .fmp-head { --ct: #2ee6a8; --cf: #1da377; --cs: #147354; }
.fmp-ok .fmp-head .fmp-t { box-shadow: 0 0 12px rgba(46,230,168,0.55); }
.fmp-idle .fmp-head { --ct: #4a5878; --cf: #364159; --cs: #262f42; }
.fmp-loan .fmp-head { --ct: #818cf8; --cf: #5d66c9; --cs: #434a94; }
.fmp-loan .fmp-head .fmp-t { box-shadow: 0 0 10px rgba(129,140,248,0.5); }
.fmp-warn .fmp-head { --ct: #ffb84d; --cf: #c1852f; --cs: #8d6122; }
.fmp-warn .fmp-head .fmp-t { box-shadow: 0 0 12px rgba(255,184,77,0.55); }
.fmp-bad .fmp-head { --ct: #ff5364; --cf: #c73a49; --cs: #932b37; }
.fmp-bad .fmp-head .fmp-t { box-shadow: 0 0 20px rgba(255,77,94,0.9); animation: fmpHot 0.9s ease-in-out infinite alternate; }
.fmp-bad .fmp-base { --ct: #5a3247; }
@keyframes fmpHot { from { filter: brightness(1); } to { filter: brightness(1.7); } }
.fmp-m:hover .fmp-head .fmp-t { filter: brightness(1.5); }
.fmp-selected .fmp-head .fmp-t { box-shadow: 0 0 0 2.5px #38e1ff, 0 0 22px rgba(56,225,255,0.8); }
.fmp-ring {
    position: absolute; width: 72px; height: 72px; border-radius: 50%;
    border: 2px solid #ff4d5e; pointer-events: none;
    animation: fmpRing 1.7s ease-out infinite;
}
@keyframes fmpRing { 0% { transform: scale(0.25); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
    .fmp-sweep::before, .fmp-dot, .fmp-bad .fmp-head .fmp-t { animation: none; }
    .fmp-ring { animation: none; opacity: 0.4; }
}

/* ── Thiết lập (sàn phẳng) ── */
.fmp-flat {
    position: relative; width: 100%; aspect-ratio: ${FLOOR_W} / ${FLOOR_H};
    background:
        linear-gradient(rgba(88,130,255,0.10) 1px, transparent 1px),
        linear-gradient(90deg, rgba(88,130,255,0.10) 1px, transparent 1px),
        linear-gradient(160deg, #131e3c, #0a1226);
    background-size: 32px 32px, 32px 32px, auto;
    border: 1px solid rgba(96,140,255,0.28);
    border-radius: 8px;
    overflow: hidden;
    touch-action: none;
}
.fmp-flat-zone {
    position: absolute;
    border: 1.5px dashed rgba(56,225,255,0.4);
    background: rgba(56,225,255,0.045);
    border-radius: 4px;
    cursor: move;
    touch-action: none;
}
.fmp-zone-sel { border-color: #38e1ff; background: rgba(56,225,255,0.09); }
.fmp-resize {
    position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px;
    background: #38e1ff; border-radius: 4px; cursor: nwse-resize;
    box-shadow: 0 0 8px rgba(56,225,255,0.6);
    touch-action: none;
}
.fmp-chip {
    position: absolute; width: 16px; height: 16px;
    margin-left: -8px; margin-top: -8px;
    border-radius: 5px; border: 1.5px solid rgba(255,255,255,0.35);
    cursor: grab; padding: 0;
    box-shadow: 0 2px 6px rgba(0,0,0,0.45);
    touch-action: none;
}
.fmp-chip:active { cursor: grabbing; }
.fmp-chip-sel { outline: 2.5px solid #38e1ff; outline-offset: 1.5px; }

.fmp-unplaced { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.fmp-uitem {
    display: flex; align-items: center; gap: 8px;
    background: rgba(96,140,255,0.06); border: 1px solid rgba(96,140,255,0.12);
    border-radius: 8px; padding: 5px 9px; cursor: pointer;
    color: #b9c4e6; font-size: 12px;
}
.fmp-uitem:hover { background: rgba(56,225,255,0.10); border-color: rgba(56,225,255,0.35); }
.fmp-usw { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.fmp-ucode { font-family: ui-monospace, Consolas, monospace; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fmp-uadd { margin-left: auto; color: #38e1ff; }

.fmp-feed { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; }
.fmp-fe {
    display: flex; gap: 9px; padding: 6px 2px;
    border-bottom: 1px solid rgba(96,140,255,0.07);
    font-size: 12px; align-items: baseline;
    animation: fmpSlide 0.3s ease;
}
@keyframes fmpSlide { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
.fmp-fe-t { color: #5c6a94; font-size: 10.5px; flex-shrink: 0; font-family: ui-monospace, Consolas, monospace; }
.fmp-fe-m { color: #93a1ca; min-width: 0; }
.fmp-alarm { background: rgba(255,77,94,0.07); border-radius: 6px; }
.fmp-alarm .fmp-fe-m { color: #ff8d98; }
.fmp-fix .fmp-fe-m { color: #2ee6a8; }

.fmp-lg-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #93a1ca; }
.fmp-lg-sw { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
`;

export default FloorMapPage;
