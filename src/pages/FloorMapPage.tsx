import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Select, Spin, Tag } from 'antd';
import {
    AimOutlined,
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    BulbFilled,
    BulbOutlined,
    PlusOutlined,
    RollbackOutlined,
    SearchOutlined,
    ThunderboltOutlined,
    HistoryOutlined,
    AlertOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plantService } from '../core/services';
import { floorMapService } from '../core/services/floor-map.service';
import { stocktakeService } from '../core/services/stocktake.service';
import { socketService } from '../core/services/socket.service';
import { useAuth } from '../core/contexts/AuthContext';
import { hasDirectorAccess, hasManagerAccess } from '../core/lib/permissions';
import { ASSET_STATUS_COLOR } from '../core/constants/assetStatusColor';
import { AssetStatus, type FloorMapMachine, type FloorZone } from '../core/types';
import type { FloorMapRevision } from '../core/types';
import FloorMapRevisionDrawer from '../components/floor-map/FloorMapRevisionDrawer';
import FloorRealityHealthPanel, {
    REALITY_META,
    type FloorRealityFilter,
} from '../components/floor-map/FloorRealityHealthPanel';
import RealityOperationsDrawer from '../components/floor-map/RealityOperationsDrawer';

// ─── Sơ đồ xưởng: giám sát máy theo mặt bằng, real-time qua socket asset:updated ───
// Chế độ Giám sát: sàn isometric 3D, máy = khối nổi phát sáng theo trạng thái.
// Chế độ Thiết lập (Giám đốc trở lên): sàn phẳng 2D, kéo-thả máy + vẽ khu vực.

const FLOOR_W = 800;
const FLOOR_H = 560;
const SCENE_W = 1000;
const SCENE_H = 640;

// ── Phép chiếu isometric (tương đương rotateX(56°) + rotateZ(-45°) của CSS cũ) ──
// Toàn bộ sàn vẽ bằng 1 <canvas> thay vì ~3600 phần tử DOM 3D — vẽ lại chỉ khi
// dữ liệu đổi, GPU không phải composite hàng nghìn layer mỗi frame → hết lag.
const C45 = Math.SQRT1_2;
const COS56 = Math.cos((56 * Math.PI) / 180);
const SIN56 = Math.sin((56 * Math.PI) / 180);
const OX = SCENE_W / 2;
const OY = SCENE_H / 2 + 20;
const proj = (x: number, y: number, z = 0) => {
    const rx = x - FLOOR_W / 2;
    const ry = y - FLOOR_H / 2;
    return {
        sx: OX + C45 * (rx + ry),
        sy: OY + C45 * (ry - rx) * COS56 - z * SIN56,
    };
};

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

// Nhiệt sự cố: mức 0 / 1-2 / 3+ lần hỏng đột xuất trong 6 tháng
const heatLevel = (incidents?: number): 0 | 1 | 2 => (!incidents ? 0 : incidents >= 3 ? 2 : 1);
const HEAT_COLOR: Record<0 | 1 | 2, string> = { 0: '#33436a', 1: '#b98a3a', 2: '#ff6b4a' };

// Màu 3 mặt khối [nóc, mặt trước, mặt bên] cho canvas
type Faces = [string, string, string];

// Palette canvas theo tông Sáng/Tối (canvas không đọc được CSS var nên tách riêng ở JS)
const CANVAS_THEME = {
    dark: {
        slabFront: '#0e1730',
        slabSide: '#0a1122',
        floorTop: '#152242',
        floorBot: '#0a1226',
        floorEdge: 'rgba(96,140,255,0.3)',
        grid: 'rgba(88,130,255,0.08)',
        zoneFill: 'rgba(56,225,255,0.035)',
        zoneStroke: 'rgba(56,225,255,0.35)',
        baseFaces: ['#33436a', '#232f4e', '#182238'] as Faces,
        shadow: 'rgba(0,0,0,0.35)',
        selection: '#38e1ff',
        labelBg: 'rgba(13,32,56,0.92)',
        labelStroke: 'rgba(56,225,255,0.3)',
        labelText: '#9fefff',
    },
    light: {
        slabFront: '#c2cce0',
        slabSide: '#aab6d0',
        floorTop: '#eef2fa',
        floorBot: '#dce3f1',
        floorEdge: 'rgba(47,81,217,0.35)',
        grid: 'rgba(70,95,160,0.13)',
        zoneFill: 'rgba(47,81,217,0.05)',
        zoneStroke: 'rgba(47,81,217,0.4)',
        baseFaces: ['#cbd5ea', '#b3c0dc', '#9dabca'] as Faces,
        shadow: 'rgba(40,55,95,0.16)',
        selection: '#2f51d9',
        labelBg: 'rgba(255,255,255,0.94)',
        labelStroke: 'rgba(47,81,217,0.3)',
        labelText: '#2f4bb0',
    },
};
const STATUS_FACES: Record<StatusVisual, Faces> = {
    ok: ['#2ee6a8', '#1da377', '#147354'],
    bad: ['#ff5364', '#c73a49', '#932b37'],
    warn: ['#ffb84d', '#c1852f', '#8d6122'],
    loan: ['#818cf8', '#5d66c9', '#434a94'],
    idle: ['#4a5878', '#364159', '#262f42'],
};
const HEAT_FACES: Record<0 | 1 | 2, Faces> = {
    0: ['#33436a', '#232f4e', '#182238'],
    1: ['#b98a3a', '#8d692c', '#664c20'],
    2: ['#ff6b4a', '#c74f36', '#933a28'],
};
const REALITY_FACES: Record<import('../core/types').FloorRealityStatus, Faces> = {
    verified: ['#34d399', '#15966f', '#0f6b50'],
    drift: ['#fb7185', '#dc344d', '#9f2438'],
    unplaced: ['#fbbf24', '#d28a12', '#9a620d'],
    stale: ['#a78bfa', '#7656cf', '#543b9c'],
    unverified: ['#94a3b8', '#64748b', '#475569'],
};

// Vẽ 1 khối hộp isometric: mặt trước (+Y) → mặt bên (+X) → nóc
const drawBox = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    d: number,
    z0: number,
    h: number,
    faces: Faces
) => {
    const t1 = proj(x, y, z0 + h);
    const t2 = proj(x + w, y, z0 + h);
    const t3 = proj(x + w, y + d, z0 + h);
    const t4 = proj(x, y + d, z0 + h);
    const b2 = proj(x + w, y, z0);
    const b3 = proj(x + w, y + d, z0);
    const b4 = proj(x, y + d, z0);
    ctx.beginPath();
    ctx.moveTo(t4.sx, t4.sy);
    ctx.lineTo(t3.sx, t3.sy);
    ctx.lineTo(b3.sx, b3.sy);
    ctx.lineTo(b4.sx, b4.sy);
    ctx.closePath();
    ctx.fillStyle = faces[1];
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(t2.sx, t2.sy);
    ctx.lineTo(t3.sx, t3.sy);
    ctx.lineTo(b3.sx, b3.sy);
    ctx.lineTo(b2.sx, b2.sy);
    ctx.closePath();
    ctx.fillStyle = faces[2];
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(t1.sx, t1.sy);
    ctx.lineTo(t2.sx, t2.sy);
    ctx.lineTo(t3.sx, t3.sy);
    ctx.lineTo(t4.sx, t4.sy);
    ctx.closePath();
    ctx.fillStyle = faces[0];
    ctx.fill();
};

const formatMoney = (v: number) => `${Math.round(v).toLocaleString('vi-VN')} ₫`;

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

const nowTime = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let feedSeq = 0;

// Đồng hồ + đèn LIVE tách thành component riêng: tick mỗi giây chỉ re-render
// cụm nhỏ này, không kéo theo hàng trăm khối máy 3D re-render theo.
const HeaderClock: React.FC = React.memo(() => {
    const [clock, setClock] = useState(nowTime());
    const [connected, setConnected] = useState(socketService.isConnected());
    useEffect(() => {
        const timer = setInterval(() => {
            setClock(nowTime());
            setConnected(socketService.isConnected());
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <>
            <span className='fmp-live'>
                <span className={`fmp-dot${connected ? '' : ' fmp-dot-off'}`} />
                {connected ? 'LIVE' : 'MẤT KẾT NỐI'}
            </span>
            <span className='fmp-clock'>{clock}</span>
        </>
    );
});
HeaderClock.displayName = 'HeaderClock';

const FloorMapPage: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const canEdit = hasDirectorAccess(role);
    const canOperate = hasManagerAccess(role);

    const [plantId, setPlantId] = useState<string>(() => searchParams.get('plantId') || '');
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
    const [heatMode, setHeatMode] = useState(false);
    const [realityMode, setRealityMode] = useState(() => searchParams.get('reality') === '1');
    const [realityFilter, setRealityFilter] = useState<FloorRealityFilter>('all');
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [operationsOpen, setOperationsOpen] = useState(() => searchParams.get('reality') === '1' && canOperate);
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        try {
            return localStorage.getItem('floorMapTheme') === 'light' ? 'light' : 'dark';
        } catch {
            return 'dark';
        }
    });
    const light = theme === 'light';
    useEffect(() => {
        try {
            localStorage.setItem('floorMapTheme', theme);
        } catch {
            /* ignore */
        }
    }, [theme]);

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

    const revisionsQuery = useQuery({
        queryKey: ['floor-map-revisions', plantId],
        queryFn: () => floorMapService.getRevisions(plantId, 30),
        enabled: Boolean(plantId && revisionOpen),
    });

    const realityQuery = useQuery({
        queryKey: ['floor-map-reality', plantId],
        queryFn: () => floorMapService.getRealityHealth(plantId, 30),
        enabled: Boolean(plantId),
        staleTime: 60_000,
    });

    const operationsQuery = useQuery({
        queryKey: ['floor-map-operations', plantId],
        queryFn: () => floorMapService.getOperations(plantId),
        enabled: Boolean(plantId && canOperate),
        staleTime: 30_000,
    });

    const updateOperationalAlertMutation = useMutation({
        mutationFn: ({
            alertId,
            data,
        }: {
            alertId: string;
            data: Parameters<typeof floorMapService.updateOperationalAlert>[1];
        }) => floorMapService.updateOperationalAlert(alertId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-map-operations', plantId] });
            message.success('Đã cập nhật công việc');
        },
        onError: () => message.error('Không thể cập nhật công việc'),
    });

    const saveOperationsRuleMutation = useMutation({
        mutationFn: (data: Partial<import('../core/types').RealityAlertRule>) =>
            floorMapService.updateOperationsRule({ ...data, plantId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-map-operations', plantId] });
            message.success('Đã lưu ngưỡng cảnh báo');
        },
        onError: () => message.error('Không thể lưu ngưỡng cảnh báo'),
    });

    const evaluateOperationsMutation = useMutation({
        mutationFn: () => floorMapService.evaluateOperations(plantId),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['floor-map-operations', plantId] });
            queryClient.invalidateQueries({ queryKey: ['floor-map-reality', plantId] });
            message.success(`Đánh giá xong: ${result.opened} cảnh báo mới, ${result.resolved} cảnh báo tự đóng`);
        },
        onError: () => message.error('Không thể chạy đánh giá Reality Operations'),
    });

    const createDriftProposalMutation = useMutation({
        mutationFn: ({ sessionId, assetId }: { sessionId: string; assetId: string }) =>
            stocktakeService.createDriftPositionProposal(sessionId, assetId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stocktake-history'] });
            queryClient.invalidateQueries({ queryKey: ['floor-map-reality', plantId] });
            message.success('Đã tạo đề xuất vị trí. Giám đốc/Admin có thể duyệt trong lịch sử kiểm kê.');
        },
        onError: () => message.error('Không thể tạo đề xuất. Máy có thể đã có đề xuất trong phiên này.'),
    });

    const rollbackRevisionMutation = useMutation({
        mutationFn: (revision: FloorMapRevision) => floorMapService.rollbackRevision(revision.id),
        onSuccess: async (result) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['floor-map', plantId] }),
                queryClient.invalidateQueries({ queryKey: ['floor-map-revisions', plantId] }),
                queryClient.invalidateQueries({ queryKey: ['floor-map-reality', plantId] }),
            ]);
            if (result.summary.conflicts) {
                message.warning(
                    `Đã hoàn tác ${result.summary.reverted} máy; ${result.summary.conflicts} máy có thay đổi mới hơn được giữ nguyên`
                );
            } else {
                message.success(`Đã hoàn tác an toàn vị trí của ${result.summary.reverted} máy`);
            }
        },
        onError: () => message.error('Không thể hoàn tác phiên bản sơ đồ'),
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

    useEffect(() => {
        setRealityFilter('all');
    }, [plantId]);

    useEffect(() => {
        if (searchParams.get('reality') !== '1') return;
        setRealityMode(true);
        const requestedPlantId = searchParams.get('plantId');
        if (requestedPlantId) setPlantId(requestedPlantId);
        if (canOperate) setOperationsOpen(true);
    }, [canOperate, searchParams]);

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
        if (mapQuery.data && plantId) {
            pushFeed(`Đang giám sát trực tiếp — ${mapQuery.data.machines.length} máy`);
        }
    }, [mapQuery.data, plantId, pushFeed]);

    // Cơ sở nhiều máy: bỏ tia quét cho nhẹ (vòng sóng máy hỏng vẫn giữ — vẽ trên canvas, rẻ)
    const liteMode = machines.filter((m) => m.floorPos).length > 150;

    // ── Canvas isometric: refs ─────────────────────────────────────────────
    const viewportRef = useRef<HTMLDivElement>(null);
    const sceneCvRef = useRef<HTMLCanvasElement>(null);
    const fxCvRef = useRef<HTMLCanvasElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    // Tâm từng máy trên toạ độ design (1000×640) — dùng dò máy dưới con trỏ
    const hitsRef = useRef<{ id: string; sx: number; sy: number }[]>([]);
    const brokenRef = useRef<{ sx: number; sy: number }[]>([]);
    const scaleRef = useRef(1);
    const hoverIdRef = useRef<string | null>(null);

    // ── Thống kê máy đang chọn (sparkline chi phí 12 tháng) ────────────────
    const statsQuery = useQuery({
        queryKey: ['floor-machine-stats', selectedId],
        queryFn: () => floorMapService.getMachineStats(selectedId!),
        enabled: Boolean(selectedId),
        staleTime: 60_000,
    });

    const sparkRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const cv = sparkRef.current;
        const data = statsQuery.data;
        if (!cv || !data || !data.total12m) return;
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 240;
        const H = 56;
        cv.width = W * dpr;
        cv.height = H * dpr;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        const lineColor = light ? '#2f51d9' : '#38e1ff';
        const areaTop = light ? 'rgba(47,81,217,0.22)' : 'rgba(56,225,255,0.30)';
        const areaBot = light ? 'rgba(47,81,217,0)' : 'rgba(56,225,255,0)';
        const dotRing = light ? 'rgba(47,81,217,0.3)' : 'rgba(56,225,255,0.35)';
        const values = data.months.map((m) => m.cost);
        const max = Math.max(...values, 1);
        const px = (i: number) => 4 + (i * (W - 8)) / (values.length - 1);
        const py = (v: number) => H - 6 - (v / max) * (H - 14);
        // lưới mờ
        ctx.strokeStyle = light ? 'rgba(47,81,217,0.12)' : 'rgba(96,140,255,0.14)';
        ctx.lineWidth = 1;
        [0.28, 0.62].forEach((f) => {
            ctx.beginPath();
            ctx.moveTo(2, H * f);
            ctx.lineTo(W - 2, H * f);
            ctx.stroke();
        });
        // vùng nền
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, areaTop);
        grad.addColorStop(1, areaBot);
        ctx.beginPath();
        values.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
        ctx.lineTo(px(values.length - 1), H - 2);
        ctx.lineTo(px(0), H - 2);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // đường chính
        ctx.beginPath();
        values.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // nhấn mạnh điểm cuối
        ctx.beginPath();
        ctx.arc(px(values.length - 1), py(values[values.length - 1]), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px(values.length - 1), py(values[values.length - 1]), 6, 0, Math.PI * 2);
        ctx.strokeStyle = dotRing;
        ctx.stroke();
    }, [statsQuery.data, selectedId, light]);

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

    // Tự xếp: gom máy theo trường "khu vực" nhập sẵn trên máy, tự vẽ khu (to nhỏ theo số máy)
    // và xếp máy thành lưới gọn bên trong. Thay thế toàn bộ layout hiện tại — người dùng rà lại rồi Lưu.
    const autoLayout = () => {
        const MAX_ZONES = 11;
        const normalize = (raw?: string) => (raw ?? '').trim().replace(/\s+/g, ' ');

        const groups = new Map<string, { label: string; items: FloorMapMachine[] }>();
        machines.forEach((m) => {
            const label = normalize(m.area);
            const key = label.toLowerCase() || '__none__';
            const group = groups.get(key) ?? { label: label || 'Chưa phân khu', items: [] };
            group.items.push(m);
            groups.set(key, group);
        });

        // Khu đông máy đứng trước; khu lẻ tẻ + máy chưa phân khu gom chung vào cuối
        const sorted = [...groups.entries()]
            .filter(([key]) => key !== '__none__')
            .sort((a, b) => b[1].items.length - a[1].items.length);
        const main = sorted.slice(0, MAX_ZONES);
        const restItems = [
            ...sorted.slice(MAX_ZONES).flatMap(([, g]) => g.items),
            ...(groups.get('__none__')?.items ?? []),
        ];
        const finalGroups = main.map(([, g]) => g);
        if (restItems.length) {
            finalGroups.push({
                label: main.length < sorted.length ? 'Khu khác / chưa phân khu' : 'Chưa phân khu',
                items: restItems,
            });
        }
        if (!finalGroups.length) return;

        // Chia hàng: cân tổng số máy giữa các hàng để khu to không dồn 1 hàng
        const numRows = finalGroups.length <= 3 ? 1 : finalGroups.length <= 8 ? 2 : 3;
        const rowBuckets: { label: string; items: FloorMapMachine[] }[][] = Array.from({ length: numRows }, () => []);
        const rowWeights = new Array(numRows).fill(0);
        finalGroups.forEach((g) => {
            const idx = rowWeights.indexOf(Math.min(...rowWeights));
            rowBuckets[idx].push(g);
            rowWeights[idx] += Math.max(g.items.length, 3);
        });

        const M = 2.5; // lề giữa các khu (%)
        const rowH = (100 - M * (numRows + 1)) / numRows;
        const newZones: FloorZone[] = [];
        const newPositions: Record<string, { x: number; y: number }> = {};
        let zoneSeq = 0;

        rowBuckets.forEach((row, rowIdx) => {
            if (!row.length) return;
            const rowTotal = row.reduce((sum, g) => sum + Math.max(g.items.length, 3), 0);
            const rowY = M + rowIdx * (rowH + M);
            let cursorX = M;
            const usableW = 100 - M * (row.length + 1);

            row.forEach((g) => {
                const w = Math.max((Math.max(g.items.length, 3) / rowTotal) * usableW, 8);
                const zone: FloorZone = {
                    id: `tmp-auto-${++zoneSeq}`,
                    name: g.label,
                    x: round2(cursorX),
                    y: round2(rowY),
                    w: round2(w),
                    h: round2(rowH),
                };
                newZones.push(zone);

                // Lưới máy trong khu: chừa chỗ nhãn tên khu phía trên
                const padX = Math.min(w * 0.12, 2.5);
                const padTop = Math.min(rowH * 0.28, 6);
                const padBottom = Math.min(rowH * 0.12, 3);
                const innerW = Math.max(w - padX * 2, 2);
                const innerH = Math.max(rowH - padTop - padBottom, 2);
                const count = g.items.length;
                const cols = Math.max(1, Math.round(Math.sqrt((count * innerW) / innerH)) || 1);
                const rows = Math.max(1, Math.ceil(count / cols));
                const sortedItems = [...g.items].sort((a, b) => a.machineCode.localeCompare(b.machineCode));
                sortedItems.forEach((m, i) => {
                    const c = i % cols;
                    const r = Math.floor(i / cols);
                    newPositions[m.id] = {
                        x: round2(zone.x + padX + (cols === 1 ? innerW / 2 : (c * innerW) / (cols - 1))),
                        y: round2(zone.y + padTop + (rows === 1 ? innerH / 2 : (r * innerH) / (rows - 1))),
                    };
                });

                cursorX += w + M;
            });
        });

        setZones(newZones);
        setMachines((prev) => prev.map((m) => ({ ...m, floorPos: newPositions[m.id] ?? m.floorPos })));
        setDirtyPos((prev) => ({ ...prev, ...newPositions }));
        setZonesDirty(true);
        setSelectedZoneId(null);
        message.success(
            `Đã tự xếp ${Object.keys(newPositions).length} máy vào ${newZones.length} khu — rà lại rồi bấm Lưu`
        );
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
            const originalPositionById = new Map(
                (mapQuery.data?.machines ?? []).map((machine) => [machine.id, machine.floorPos])
            );
            const items = Object.entries(dirtyPos).map(([assetId, pos]) => ({
                assetId,
                x: pos?.x ?? null,
                y: pos?.y ?? null,
                expectedX: originalPositionById.get(assetId)?.x ?? null,
                expectedY: originalPositionById.get(assetId)?.y ?? null,
            }));
            let updatedCount = 0;
            const conflictIds: string[] = [];
            // BE nhận tối đa 500 vị trí/lần — tự xếp cả cơ sở có thể vượt, chia lô 400
            for (let i = 0; i < items.length; i += 400) {
                const result = await floorMapService.savePositions(items.slice(i, i + 400));
                updatedCount += result.updated;
                conflictIds.push(...result.conflicts);
            }
            if (conflictIds.length) {
                message.warning(
                    `Đã lưu ${updatedCount} máy; ${conflictIds.length} máy vừa bị thay đổi nên chưa ghi đè`
                );
            } else {
                message.success('Đã lưu sơ đồ xưởng');
            }
            await queryClient.invalidateQueries({ queryKey: ['floor-map', plantId] });
            await queryClient.invalidateQueries({ queryKey: ['floor-map-revisions', plantId] });
            await queryClient.invalidateQueries({ queryKey: ['floor-map-reality', plantId] });
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
    const realityByAssetId = useMemo(
        () => new Map((realityQuery.data?.machines ?? []).map((machine) => [machine.assetId, machine])),
        [realityQuery.data?.machines]
    );
    const selectedReality = selectedId ? realityByAssetId.get(selectedId) : undefined;
    const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) ?? null, [zones, selectedZoneId]);
    const plantName = plantsQuery.data?.find((p) => p.id === plantId)?.name ?? '';

    const hasLayout = zones.length > 0 || placed.length > 0;

    // ── Vẽ toàn cảnh lên canvas (chạy 1 lần mỗi khi dữ liệu/chọn lựa đổi) ──
    const drawScene = () => {
        const cv = sceneCvRef.current;
        const ctx = cv?.getContext('2d');
        if (!cv || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const k = scaleRef.current;
        const pal = CANVAS_THEME[theme];
        ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
        ctx.clearRect(0, 0, SCENE_W, SCENE_H);

        const quad = (
            a: { sx: number; sy: number },
            b: { sx: number; sy: number },
            c: { sx: number; sy: number },
            d: { sx: number; sy: number }
        ) => {
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.lineTo(c.sx, c.sy);
            ctx.lineTo(d.sx, d.sy);
            ctx.closePath();
        };

        // Tấm sàn nổi có độ dày
        const SLAB = 16;
        const c00 = proj(0, 0);
        const cW0 = proj(FLOOR_W, 0);
        const cWH = proj(FLOOR_W, FLOOR_H);
        const c0H = proj(0, FLOOR_H);
        quad(c0H, cWH, proj(FLOOR_W, FLOOR_H, -SLAB), proj(0, FLOOR_H, -SLAB));
        ctx.fillStyle = pal.slabFront;
        ctx.fill();
        quad(cW0, cWH, proj(FLOOR_W, FLOOR_H, -SLAB), proj(FLOOR_W, 0, -SLAB));
        ctx.fillStyle = pal.slabSide;
        ctx.fill();
        const floorGrad = ctx.createLinearGradient(cW0.sx, cW0.sy, c0H.sx, c0H.sy);
        floorGrad.addColorStop(0, pal.floorTop);
        floorGrad.addColorStop(1, pal.floorBot);
        quad(c00, cW0, cWH, c0H);
        ctx.fillStyle = floorGrad;
        ctx.fill();
        ctx.strokeStyle = pal.floorEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Lưới sàn
        ctx.strokeStyle = pal.grid;
        ctx.beginPath();
        for (let gx = 40; gx < FLOOR_W; gx += 40) {
            const a = proj(gx, 0);
            const b = proj(gx, FLOOR_H);
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
        }
        for (let gy = 40; gy < FLOOR_H; gy += 40) {
            const a = proj(0, gy);
            const b = proj(FLOOR_W, gy);
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
        }
        ctx.stroke();

        // Khu vực
        const labels: { sx: number; sy: number; text: string }[] = [];
        zones.forEach((z) => {
            const zx = (z.x / 100) * FLOOR_W;
            const zy = (z.y / 100) * FLOOR_H;
            const zw = (z.w / 100) * FLOOR_W;
            const zh = (z.h / 100) * FLOOR_H;
            quad(proj(zx, zy), proj(zx + zw, zy), proj(zx + zw, zy + zh), proj(zx, zy + zh));
            ctx.fillStyle = pal.zoneFill;
            ctx.fill();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = pal.zoneStroke;
            ctx.stroke();
            ctx.setLineDash([]);
            labels.push({ ...proj(zx, zy), text: z.name });
        });

        // Quầng nhiệt điểm nóng (chế độ nhiệt sự cố)
        if (heatMode) {
            placed
                .filter((m) => heatLevel(m.incidents6m) === 2)
                .forEach((m) => {
                    const p = proj((m.floorPos!.x / 100) * FLOOR_W + 13, (m.floorPos!.y / 100) * FLOOR_H + 10, 0);
                    const g = ctx.createRadialGradient(p.sx, p.sy, 4, p.sx, p.sy, 52);
                    g.addColorStop(0, 'rgba(255,90,60,0.38)');
                    g.addColorStop(1, 'rgba(255,90,60,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.ellipse(p.sx, p.sy, 52, 52 * COS56, 0, 0, Math.PI * 2);
                    ctx.fill();
                });
        }

        // Máy: sắp sau→trước rồi vẽ khối bàn + đầu máy
        const hits: { id: string; sx: number; sy: number }[] = [];
        const broken: { sx: number; sy: number }[] = [];
        [...placed]
            .sort((a, b) => a.floorPos!.x + a.floorPos!.y - (b.floorPos!.x + b.floorPos!.y))
            .forEach((m) => {
                const reality = realityByAssetId.get(m.id);
                const realityStatus = reality?.status ?? 'unverified';
                if (realityMode && realityFilter !== 'all' && realityStatus !== realityFilter) return;
                const x = (m.floorPos!.x / 100) * FLOOR_W;
                const y = (m.floorPos!.y / 100) * FLOOR_H;
                const visual = visualOf(m.status);
                const faces = realityMode
                    ? REALITY_FACES[realityStatus]
                    : heatMode
                      ? HEAT_FACES[heatLevel(m.incidents6m)]
                      : STATUS_FACES[visual];
                const sc = proj(x + 13, y + 12, 0);
                ctx.fillStyle = pal.shadow;
                ctx.beginPath();
                ctx.ellipse(sc.sx + 2, sc.sy + 3, 17, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                drawBox(ctx, x, y, 26, 20, 0, 8, pal.baseFaces);
                drawBox(ctx, x + 3, y + 3, 13, 13, 8, 10, faces);
                const center = proj(x + 13, y + 10, 12);
                hits.push({ id: m.id, sx: center.sx, sy: center.sy });
                if (!heatMode && !realityMode && visual === 'bad') broken.push({ sx: sc.sx, sy: sc.sy });
                if (m.id === selectedId) {
                    const h1 = proj(x + 3, y + 3, 18);
                    const h2 = proj(x + 16, y + 3, 18);
                    const h3 = proj(x + 16, y + 16, 18);
                    const h4 = proj(x + 3, y + 16, 18);
                    quad(h1, h2, h3, h4);
                    ctx.strokeStyle = pal.selection;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                }
            });
        hitsRef.current = hits;
        brokenRef.current = broken;

        // Nhãn khu vẽ sau cùng cho nổi lên trên máy
        ctx.font = '700 10.5px "Segoe UI", sans-serif';
        labels.forEach((l) => {
            const text = (l.text.length > 24 ? `${l.text.slice(0, 23)}…` : l.text).toUpperCase();
            const w = ctx.measureText(text).width;
            ctx.fillStyle = pal.labelBg;
            ctx.fillRect(l.sx - 3, l.sy - 19, w + 14, 16);
            ctx.strokeStyle = pal.labelStroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(l.sx - 3, l.sy - 19, w + 14, 16);
            ctx.fillStyle = pal.labelText;
            ctx.fillText(text, l.sx + 4, l.sy - 7);
        });
    };
    const drawRef = useRef(drawScene);
    drawRef.current = drawScene;

    // Vẽ lại khi dữ liệu/lựa chọn/tông màu đổi
    useEffect(() => {
        if (!editMode) drawRef.current();
    }, [machines, zones, heatMode, realityMode, realityFilter, realityByAssetId, selectedId, editMode, theme]);

    // Kích thước canvas theo khung + vẽ lại khi resize
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || editMode) return;
        const fit = () => {
            const k = Math.min(viewport.clientWidth / SCENE_W, 1);
            scaleRef.current = k;
            const dpr = window.devicePixelRatio || 1;
            [sceneCvRef.current, fxCvRef.current].forEach((canvas) => {
                if (!canvas) return;
                canvas.style.width = `${SCENE_W * k}px`;
                canvas.style.height = `${SCENE_H * k}px`;
                canvas.width = Math.round(SCENE_W * k * dpr);
                canvas.height = Math.round(SCENE_H * k * dpr);
            });
            viewport.style.height = `${SCENE_H * k}px`;
            drawRef.current();
        };
        const ro = new ResizeObserver(fit);
        ro.observe(viewport);
        fit();
        return () => ro.disconnect();
    }, [editMode, mapQuery.data]);

    // Lớp hiệu ứng: vòng sóng máy hỏng + tia quét — chỉ vài nét vẽ trên 1 canvas overlay, rẻ
    useEffect(() => {
        const cv = fxCvRef.current;
        const ctx = cv?.getContext('2d');
        if (!cv || !ctx || editMode) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let rafId = 0;
        const draw = (t: number) => {
            const dpr = window.devicePixelRatio || 1;
            const k = scaleRef.current;
            ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
            ctx.clearRect(0, 0, SCENE_W, SCENE_H);
            brokenRef.current.forEach(({ sx, sy }, i) => {
                const phase = (t / 1700 + i * 0.35) % 1;
                const r = 6 + phase * 30;
                ctx.beginPath();
                ctx.ellipse(sx, sy, r, r * COS56, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,77,94,${(1 - phase) * 0.9})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            });
            if (!liteMode) {
                const bx = ((t / 9000) % 1) * (FLOOR_W + 240) - 120;
                const a1 = proj(bx - 30, 0);
                const a2 = proj(bx + 30, 0);
                const grad = ctx.createLinearGradient(a1.sx, 0, a2.sx, 0);
                grad.addColorStop(0, 'rgba(56,225,255,0)');
                grad.addColorStop(0.5, 'rgba(56,225,255,0.10)');
                grad.addColorStop(1, 'rgba(56,225,255,0)');
                ctx.beginPath();
                const p1 = proj(bx - 30, 0);
                const p2 = proj(bx + 30, 0);
                const p3 = proj(bx + 30, FLOOR_H);
                const p4 = proj(bx - 30, FLOOR_H);
                ctx.moveTo(p1.sx, p1.sy);
                ctx.lineTo(p2.sx, p2.sy);
                ctx.lineTo(p3.sx, p3.sy);
                ctx.lineTo(p4.sx, p4.sy);
                ctx.closePath();
                ctx.fillStyle = grad;
                ctx.fill();
            }
            rafId = requestAnimationFrame(draw);
        };
        rafId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafId);
    }, [editMode, liteMode, mapQuery.data]);

    // ── Dò máy dưới con trỏ trên canvas ────────────────────────────────────
    const findHit = (e: React.MouseEvent) => {
        const cv = fxCvRef.current;
        if (!cv) return null;
        const rect = cv.getBoundingClientRect();
        const k = scaleRef.current;
        const mx = (e.clientX - rect.left) / k;
        const my = (e.clientY - rect.top) / k;
        let best: { id: string; sx: number; sy: number } | null = null;
        let bestD = 16 * 16;
        for (const h of hitsRef.current) {
            const d = (h.sx - mx) ** 2 + (h.sy - my) ** 2;
            if (d < bestD) {
                bestD = d;
                best = h;
            }
        }
        return best;
    };

    const onCanvasMove = (e: React.MouseEvent) => {
        const hit = findHit(e);
        const cv = fxCvRef.current;
        const tip = tipRef.current;
        if (cv) cv.style.cursor = hit ? 'pointer' : 'default';
        if (!tip) return;
        if (!hit) {
            if (hoverIdRef.current) {
                hoverIdRef.current = null;
                tip.style.display = 'none';
            }
            return;
        }
        if (hoverIdRef.current === hit.id) return;
        hoverIdRef.current = hit.id;
        const m = machines.find((x) => x.id === hit.id);
        if (!m) return;
        tip.textContent = heatMode
            ? `${m.machineCode} · ${m.incidents6m ?? 0} lần hỏng 6 tháng`
            : `${m.machineCode} · ${statusLabel(m.status)}`;
        const k = scaleRef.current;
        tip.style.left = `${hit.sx * k}px`;
        tip.style.top = `${(hit.sy - 18) * k}px`;
        tip.style.display = 'block';
    };

    const onCanvasLeave = () => {
        hoverIdRef.current = null;
        if (tipRef.current) tipRef.current.style.display = 'none';
        if (fxCvRef.current) fxCvRef.current.style.cursor = 'default';
    };

    const onCanvasClick = (e: React.MouseEvent) => {
        const hit = findHit(e);
        if (hit) setSelectedId((prev) => (prev === hit.id ? null : hit.id));
    };

    return (
        <div className={`fmp-page rounded-2xl p-4 md:p-5${light ? ' fmp-light' : ''}`}>
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
                    <HeaderClock />
                    <Button icon={<HistoryOutlined />} onClick={() => setRevisionOpen(true)}>
                        Lịch sử
                    </Button>
                    {canOperate ? (
                        <Button
                            type={operationsQuery.data?.summary.overdue ? 'primary' : 'default'}
                            danger={Boolean(operationsQuery.data?.summary.overdue)}
                            icon={<AlertOutlined />}
                            onClick={() => setOperationsOpen(true)}
                        >
                            Vận hành
                            {operationsQuery.data
                                ? ` (${operationsQuery.data.summary.open + operationsQuery.data.summary.inProgress})`
                                : ''}
                        </Button>
                    ) : null}
                    <Button
                        size='middle'
                        icon={light ? <BulbFilled /> : <BulbOutlined />}
                        onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                    >
                        {light ? 'Nền tối' : 'Nền sáng'}
                    </Button>
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
                <button
                    type='button'
                    className={`fmp-kpi text-left ${realityMode ? 'ring-2 ring-cyan-400/60' : ''}`}
                    onClick={() => {
                        setHeatMode(false);
                        setRealityMode(true);
                    }}
                >
                    <div className='fmp-num'>{realityQuery.isLoading ? '…' : `${realityQuery.data?.score ?? 0}%`}</div>
                    <div className='fmp-lbl'>Tin cậy sơ đồ</div>
                </button>
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
                                description={<span className='fmp-sub'>Cơ sở này chưa thiết lập sơ đồ mặt bằng</span>}
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
                                    <Popconfirm
                                        title='Tự xếp theo trường "Khu vực" của máy?'
                                        description='Thay thế toàn bộ khu và vị trí hiện tại. Chưa ghi gì cho tới khi bấm Lưu.'
                                        okText='Tự xếp'
                                        cancelText='Thôi'
                                        onConfirm={autoLayout}
                                    >
                                        <Button size='small' type='primary' ghost icon={<ThunderboltOutlined />}>
                                            Tự xếp theo khu vực
                                        </Button>
                                    </Popconfirm>
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
                                <span className='fmp-sub'>
                                    {realityMode
                                        ? 'độ tin cậy theo bằng chứng kiểm kê gần nhất'
                                        : heatMode
                                          ? 'màu theo số lần hỏng đột xuất 6 tháng'
                                          : 'bấm vào khối máy để xem chi tiết'}
                                </span>
                                <div className='fmp-mode ml-auto'>
                                    <button
                                        type='button'
                                        className={!heatMode && !realityMode ? 'fmp-on' : ''}
                                        onClick={() => {
                                            setHeatMode(false);
                                            setRealityMode(false);
                                        }}
                                    >
                                        Trạng thái
                                    </button>
                                    <button
                                        type='button'
                                        className={heatMode ? 'fmp-on' : ''}
                                        onClick={() => {
                                            setHeatMode(true);
                                            setRealityMode(false);
                                        }}
                                    >
                                        Nhiệt sự cố
                                    </button>
                                    <button
                                        type='button'
                                        className={realityMode ? 'fmp-on' : ''}
                                        onClick={() => {
                                            setHeatMode(false);
                                            setRealityMode(true);
                                        }}
                                    >
                                        Reality
                                    </button>
                                </div>
                            </div>
                            <div ref={viewportRef} className='fmp-viewport'>
                                <canvas ref={sceneCvRef} className='fmp-cv' />
                                <canvas
                                    ref={fxCvRef}
                                    className='fmp-cv fmp-cv-top'
                                    onMouseMove={onCanvasMove}
                                    onMouseLeave={onCanvasLeave}
                                    onClick={onCanvasClick}
                                />
                                <div ref={tipRef} className='fmp-cvtip' style={{ display: 'none' }} />
                            </div>
                        </>
                    )}
                </div>

                {/* ── Panel bên phải ── */}
                <div className='flex min-w-0 flex-col gap-4'>
                    {realityMode && !editMode ? (
                        <div className='fmp-card p-4'>
                            <FloorRealityHealthPanel
                                health={realityQuery.data}
                                loading={realityQuery.isLoading}
                                filter={realityFilter}
                                onFilterChange={setRealityFilter}
                                onSelectMachine={setSelectedId}
                            />
                        </div>
                    ) : null}
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
                                {realityMode && selectedReality ? (
                                    <div className='mt-3 rounded-lg border border-slate-200 bg-white/70 p-3'>
                                        <div className='flex items-center justify-between gap-2'>
                                            <span className='text-xs font-bold text-slate-500'>Reality Health</span>
                                            <Tag
                                                className='!m-0'
                                                style={{
                                                    color: REALITY_META[selectedReality.status].color,
                                                    borderColor: REALITY_META[selectedReality.status].color,
                                                    background: REALITY_META[selectedReality.status].background,
                                                }}
                                            >
                                                {REALITY_META[selectedReality.status].label}
                                            </Tag>
                                        </div>
                                        <div className='mt-2 space-y-1.5 text-xs'>
                                            <div className='flex justify-between gap-3'>
                                                <span className='text-slate-400'>Vùng trên sơ đồ</span>
                                                <span className='text-right font-semibold text-slate-700'>
                                                    {selectedReality.currentZone?.name || 'Chưa xác định'}
                                                </span>
                                            </div>
                                            <div className='flex justify-between gap-3'>
                                                <span className='text-slate-400'>Vùng quét thấy</span>
                                                <span className='text-right font-semibold text-slate-700'>
                                                    {selectedReality.evidence?.zoneName || 'Chưa có bằng chứng vùng'}
                                                </span>
                                            </div>
                                            <div className='flex justify-between gap-3'>
                                                <span className='text-slate-400'>Lần xác minh</span>
                                                <span className='text-right font-semibold text-slate-700'>
                                                    {selectedReality.evidence?.scannedAt
                                                        ? new Date(selectedReality.evidence.scannedAt).toLocaleString(
                                                              'vi-VN'
                                                          )
                                                        : 'Chưa từng xác minh'}
                                                </span>
                                            </div>
                                            {selectedReality.evidence?.createdByName ? (
                                                <div className='flex justify-between gap-3'>
                                                    <span className='text-slate-400'>Người kiểm</span>
                                                    <span className='text-right font-semibold text-slate-700'>
                                                        {selectedReality.evidence.createdByName}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                        {selectedReality.evidence?.proposalStatus ? (
                                            <div className='mt-3 rounded-md bg-slate-100 px-2.5 py-2 text-center text-xs font-semibold text-slate-500'>
                                                Phiên kiểm kê đã có đề xuất:{' '}
                                                {
                                                    {
                                                        pending: 'Chờ duyệt',
                                                        approved: 'Đã áp dụng',
                                                        rejected: 'Đã từ chối',
                                                        conflict: 'Có xung đột',
                                                    }[selectedReality.evidence.proposalStatus]
                                                }
                                            </div>
                                        ) : ['drift', 'unplaced'].includes(selectedReality.status) &&
                                          selectedReality.evidence?.sessionId ? (
                                            <Button
                                                block
                                                className='mt-3'
                                                type='primary'
                                                size='small'
                                                loading={createDriftProposalMutation.isPending}
                                                onClick={() =>
                                                    createDriftProposalMutation.mutate({
                                                        sessionId: selectedReality.evidence!.sessionId,
                                                        assetId: selectedReality.assetId,
                                                    })
                                                }
                                            >
                                                Tạo đề xuất vị trí từ bằng chứng này
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                                <div className='mt-3 flex flex-col gap-1.5'>
                                    <div className='fmp-row'>
                                        <span className='fmp-row-k'>Lần hỏng 6 tháng</span>
                                        <span
                                            className='fmp-row-v'
                                            style={
                                                heatLevel(selected.incidents6m) === 2 ? { color: '#ff6b4a' } : undefined
                                            }
                                        >
                                            {selected.incidents6m ?? 0}
                                        </span>
                                    </div>
                                    {statsQuery.data?.lastMaintenanceAt ? (
                                        <div className='fmp-row'>
                                            <span className='fmp-row-k'>Bảo trì gần nhất</span>
                                            <span className='fmp-row-v'>
                                                {new Date(statsQuery.data.lastMaintenanceAt).toLocaleDateString(
                                                    'vi-VN'
                                                )}
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                                <div className='fmp-spark mt-3'>
                                    <div className='fmp-spark-h'>
                                        <span>Chi phí sửa 12 tháng</span>
                                        <span className='fmp-spark-sum'>
                                            {statsQuery.isLoading ? '…' : formatMoney(statsQuery.data?.total12m ?? 0)}
                                        </span>
                                    </div>
                                    {statsQuery.isLoading ? (
                                        <div className='flex h-12 items-center justify-center'>
                                            <Spin size='small' />
                                        </div>
                                    ) : statsQuery.data?.total12m ? (
                                        <canvas ref={sparkRef} className='fmp-spark-cv' />
                                    ) : (
                                        <div className='fmp-sub py-1'>Chưa ghi nhận chi phí sửa trong 12 tháng</div>
                                    )}
                                </div>
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
                            {realityMode && !editMode
                                ? Object.entries(REALITY_META).map(([status, meta]) => (
                                      <div key={status} className='fmp-lg-row'>
                                          <span className='fmp-lg-sw' style={{ background: meta.color }} />
                                          {meta.label}
                                      </div>
                                  ))
                                : heatMode && !editMode
                                  ? (
                                        [
                                            [HEAT_COLOR[0], 'Không hỏng đột xuất 6 tháng'],
                                            [HEAT_COLOR[1], '1–2 lần hỏng'],
                                            [HEAT_COLOR[2], '3+ lần hỏng — điểm nóng'],
                                        ] as [string, string][]
                                    ).map(([color, label]) => (
                                        <div key={label} className='fmp-lg-row'>
                                            <span className='fmp-lg-sw' style={{ background: color }} />
                                            {label}
                                        </div>
                                    ))
                                  : (
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
            <FloorMapRevisionDrawer
                open={revisionOpen}
                revisions={revisionsQuery.data?.revisions ?? []}
                loading={revisionsQuery.isLoading}
                rollingBackId={rollbackRevisionMutation.isPending ? rollbackRevisionMutation.variables?.id : null}
                canRollback={canEdit}
                onClose={() => setRevisionOpen(false)}
                onRollback={(revision) => rollbackRevisionMutation.mutate(revision)}
            />
            {canOperate ? (
                <RealityOperationsDrawer
                    open={operationsOpen}
                    data={operationsQuery.data}
                    loading={operationsQuery.isLoading}
                    updatingAlertId={
                        updateOperationalAlertMutation.isPending
                            ? updateOperationalAlertMutation.variables?.alertId
                            : null
                    }
                    savingRule={saveOperationsRuleMutation.isPending}
                    evaluating={evaluateOperationsMutation.isPending}
                    canConfigure={canEdit}
                    onClose={() => setOperationsOpen(false)}
                    onUpdateAlert={(alertId, data) => updateOperationalAlertMutation.mutate({ alertId, data })}
                    onSaveRule={(rule) => saveOperationsRuleMutation.mutate(rule)}
                    onEvaluate={() => evaluateOperationsMutation.mutate()}
                />
            ) : null}
        </div>
    );
};

// CSS thuần cho phần isometric 3D + không khí "command center" (Tailwind không diễn tả được mặt khối 3D)
const FMP_CSS = `
.fmp-page {
    --fmp-page-bg:
        radial-gradient(1100px 480px at 22% -10%, rgba(79,124,255,0.16), transparent 60%),
        radial-gradient(900px 600px at 100% 115%, rgba(56,225,255,0.08), transparent 55%),
        #070b16;
    --fmp-surface: #101a33;
    --fmp-border: rgba(96,140,255,0.16);
    --fmp-ink: #e2e9ff;
    --fmp-ink2: #93a1ca;
    --fmp-ink3: #5c6a94;
    --fmp-sub: #7d8ab3;
    --fmp-accent: #38e1ff;
    --fmp-accent-soft: rgba(56,225,255,0.14);
    --fmp-glow: 0 0 16px rgba(56,225,255,0.5);
    --fmp-card-shadow: inset 0 1px 0 rgba(140,175,255,0.10), 0 10px 40px rgba(0,0,0,0.35);
    --fmp-divider: rgba(96,140,255,0.16);
    --fmp-zname-bg: rgba(16,42,66,0.85);
    --fmp-tip-bg: rgba(7,12,26,0.96);
    --fmp-uitem-bg: rgba(96,140,255,0.06);
    --fmp-uitem-border: rgba(96,140,255,0.12);
    --fmp-uitem-ink: #b9c4e6;
    --fmp-flat-bg:
        linear-gradient(rgba(88,130,255,0.10) 1px, transparent 1px),
        linear-gradient(90deg, rgba(88,130,255,0.10) 1px, transparent 1px),
        linear-gradient(160deg, #131e3c, #0a1226);
    background: var(--fmp-page-bg);
    color: var(--fmp-ink);
    min-height: calc(100vh - 120px);
}
/* Tông sáng: đồng bộ với phần còn lại của app (accent xanh thương hiệu thay cyan) */
.fmp-page.fmp-light {
    --fmp-page-bg:
        radial-gradient(1100px 480px at 22% -10%, rgba(79,124,255,0.10), transparent 60%),
        radial-gradient(900px 600px at 100% 115%, rgba(56,225,255,0.05), transparent 55%),
        #f2f5fb;
    --fmp-surface: #ffffff;
    --fmp-border: rgba(47,81,217,0.14);
    --fmp-ink: #1c2540;
    --fmp-ink2: #55618a;
    --fmp-ink3: #8a93b5;
    --fmp-sub: #6b76a0;
    --fmp-accent: #2f51d9;
    --fmp-accent-soft: rgba(47,81,217,0.10);
    --fmp-glow: none;
    --fmp-card-shadow: 0 1px 3px rgba(30,45,90,0.06), 0 8px 24px rgba(30,45,90,0.08);
    --fmp-divider: rgba(47,81,217,0.14);
    --fmp-zname-bg: rgba(255,255,255,0.9);
    --fmp-tip-bg: rgba(255,255,255,0.97);
    --fmp-uitem-bg: rgba(47,81,217,0.05);
    --fmp-uitem-border: rgba(47,81,217,0.12);
    --fmp-uitem-ink: #40507a;
    --fmp-flat-bg:
        linear-gradient(rgba(70,95,160,0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(70,95,160,0.12) 1px, transparent 1px),
        linear-gradient(160deg, #eef2fa, #dce3f1);
}
.fmp-badge {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #4f7cff, #2f51d9);
    box-shadow: 0 0 20px rgba(79,124,255,0.5);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 13px; color: #fff;
}
.fmp-title { font-size: 16px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--fmp-ink); }
.fmp-sub { color: var(--fmp-sub); font-size: 12px; }
.fmp-live { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #17b789; }
.fmp-dot { width: 8px; height: 8px; border-radius: 50%; background: #17b789; box-shadow: 0 0 10px #2ee6a8; animation: fmpBlink 1.4s ease-in-out infinite; }
.fmp-dot-off { background: #ff4d5e; box-shadow: 0 0 10px #ff4d5e; animation: none; }
@keyframes fmpBlink { 50% { opacity: 0.25; } }
.fmp-clock { font-family: ui-monospace, Consolas, monospace; font-size: 19px; font-weight: 700; color: var(--fmp-accent); text-shadow: var(--fmp-glow); font-variant-numeric: tabular-nums; }

.fmp-kpi {
    flex: 1; min-width: 108px;
    background: var(--fmp-surface); border: 1px solid var(--fmp-border);
    border-radius: 13px; padding: 10px 16px;
    position: relative; overflow: hidden;
    box-shadow: var(--fmp-card-shadow);
}
.fmp-kpi::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--fmp-accent); opacity: 0.75; }
.fmp-k-ok::after { background: #17b789; }
.fmp-k-bad::after { background: #ff4d5e; }
.fmp-k-warn::after { background: #e69500; }
.fmp-num { font-size: 25px; font-weight: 800; line-height: 1.15; font-variant-numeric: tabular-nums; font-family: ui-monospace, Consolas, monospace; color: var(--fmp-ink); }
.fmp-k-ok .fmp-num { color: #17b789; } .fmp-k-bad .fmp-num { color: #ff4d5e; } .fmp-k-warn .fmp-num { color: #e69500; }
.fmp-lbl { font-size: 10px; color: var(--fmp-ink3); font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }

.fmp-card {
    background: var(--fmp-surface); border: 1px solid var(--fmp-border);
    border-radius: 15px;
    box-shadow: var(--fmp-card-shadow);
}
.fmp-hud { position: absolute; width: 20px; height: 20px; border-color: var(--fmp-accent); border-style: solid; opacity: 0.5; pointer-events: none; }
.fmp-tl { top: 7px; left: 7px; border-width: 2px 0 0 2px; border-radius: 6px 0 0 0; }
.fmp-tr { top: 7px; right: 7px; border-width: 2px 2px 0 0; border-radius: 0 6px 0 0; }
.fmp-bl { bottom: 7px; left: 7px; border-width: 0 0 2px 2px; border-radius: 0 0 0 6px; }
.fmp-br { bottom: 7px; right: 7px; border-width: 0 2px 2px 0; border-radius: 0 0 6px 0; }
.fmp-head-label { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--fmp-accent); font-weight: 700; }
.fmp-h3 {
    margin: 0 0 10px; font-size: 10.5px; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase; color: var(--fmp-ink3);
    display: flex; align-items: center; gap: 8px;
}
.fmp-h3::after { content: ""; flex: 1; height: 1px; background: var(--fmp-divider); }
.fmp-code { font-family: ui-monospace, Consolas, monospace; font-size: 15px; font-weight: 800; color: var(--fmp-accent); }

/* ── Isometric: 2 canvas chồng nhau (sàn tĩnh + lớp hiệu ứng) ── */
.fmp-viewport { width: 100%; overflow: hidden; position: relative; }
.fmp-cv { position: absolute; left: 0; top: 0; display: block; }
.fmp-cv-top { z-index: 2; }
.fmp-cvtip {
    position: absolute; z-index: 5; pointer-events: none;
    transform: translate(-50%, -100%);
    background: var(--fmp-tip-bg); color: var(--fmp-accent);
    border: 1px solid var(--fmp-accent);
    font: 700 12px ui-monospace, Consolas, monospace;
    padding: 4px 9px; border-radius: 6px; white-space: nowrap;
}

.fmp-zname {
    position: absolute; top: -1px; left: -1px;
    font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: var(--fmp-accent);
    background: var(--fmp-zname-bg);
    border: 1px solid var(--fmp-accent);
    border-radius: 4px 0 6px 0;
    padding: 2px 9px;
    white-space: nowrap; pointer-events: none;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}

.fmp-mode { display: inline-flex; border: 1px solid var(--fmp-border); border-radius: 9px; overflow: hidden; }
.fmp-mode button {
    background: transparent; color: var(--fmp-ink2); border: none; cursor: pointer;
    font: inherit; font-size: 11.5px; font-weight: 700; letter-spacing: 0;
    padding: 5px 13px;
}
.fmp-mode button.fmp-on { background: var(--fmp-accent-soft); color: var(--fmp-accent); }

@media (max-width: 520px) {
    .fmp-mode { width: 100%; }
    .fmp-mode button { flex: 1; min-width: 0; padding: 7px 6px; white-space: nowrap; }
    .fmp-kpi { min-width: calc(50% - 6px); padding: 9px 12px; }
}

.fmp-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.fmp-row-k { color: var(--fmp-ink3); }
.fmp-row-v { font-weight: 600; color: var(--fmp-ink); font-variant-numeric: tabular-nums; }
.fmp-spark-h {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 10px; color: var(--fmp-ink3); letter-spacing: 1.2px; text-transform: uppercase;
    margin-bottom: 5px; font-weight: 700;
}
.fmp-spark-sum { color: var(--fmp-accent); font-family: ui-monospace, Consolas, monospace; letter-spacing: 0; }
.fmp-spark-cv { width: 100%; height: 56px; display: block; }

@media (prefers-reduced-motion: reduce) {
    .fmp-dot { animation: none; }
}

/* ── Thiết lập (sàn phẳng) ── */
.fmp-flat {
    position: relative; width: 100%; aspect-ratio: ${FLOOR_W} / ${FLOOR_H};
    background: var(--fmp-flat-bg);
    background-size: 32px 32px, 32px 32px, auto;
    border: 1px solid var(--fmp-border);
    border-radius: 8px;
    overflow: hidden;
    touch-action: none;
}
.fmp-flat-zone {
    position: absolute;
    border: 1.5px dashed var(--fmp-accent);
    background: var(--fmp-accent-soft);
    border-radius: 4px;
    cursor: move;
    touch-action: none;
}
.fmp-zone-sel { border-color: var(--fmp-accent); background: var(--fmp-accent-soft); }
.fmp-resize {
    position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px;
    background: var(--fmp-accent); border-radius: 4px; cursor: nwse-resize;
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
.fmp-chip-sel { outline: 2.5px solid var(--fmp-accent); outline-offset: 1.5px; }

.fmp-unplaced { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.fmp-uitem {
    display: flex; align-items: center; gap: 8px;
    background: var(--fmp-uitem-bg); border: 1px solid var(--fmp-uitem-border);
    border-radius: 8px; padding: 5px 9px; cursor: pointer;
    color: var(--fmp-uitem-ink); font-size: 12px;
}
.fmp-uitem:hover { background: var(--fmp-accent-soft); border-color: var(--fmp-accent); }
.fmp-usw { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.fmp-ucode { font-family: ui-monospace, Consolas, monospace; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fmp-uadd { margin-left: auto; color: var(--fmp-accent); }

.fmp-feed { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; overflow-x: hidden; }
.fmp-fe {
    display: flex; gap: 9px; padding: 6px 2px;
    border-bottom: 1px solid var(--fmp-divider);
    font-size: 12px; align-items: baseline;
    animation: fmpSlide 0.3s ease;
}
@keyframes fmpSlide { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
.fmp-fe-t { color: var(--fmp-ink3); font-size: 10.5px; flex-shrink: 0; font-family: ui-monospace, Consolas, monospace; }
.fmp-fe-m { color: var(--fmp-ink2); min-width: 0; overflow-wrap: anywhere; }
.fmp-alarm { background: rgba(255,77,94,0.07); border-radius: 6px; }
.fmp-alarm .fmp-fe-m { color: #e5484d; }
.fmp-fix .fmp-fe-m { color: #17b789; }

.fmp-lg-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--fmp-ink2); }
.fmp-lg-sw { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
`;

export default FloorMapPage;
