import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Select, Spin, Switch, Tag } from 'antd';
import { EnvironmentOutlined, ReloadOutlined, WarningFilled } from '@ant-design/icons';
import { useAssetLocations } from '../core/hooks/useDashboardOverview';
import { plantService } from '../core/services/plant.service';
import { useAuth } from '../core/contexts/AuthContext';
import { ASSET_STATUS_COLOR, getAssetStatusColor } from '../core/constants/assetStatusColor';
import { AssetStatus, type AssetLocationPoint } from '../core/types';

// Toạ độ mặc định khi chưa có điểm nào (trung tâm Việt Nam).
const DEFAULT_CENTER: [number, number] = [16.0, 107.8];
const DEFAULT_ZOOM = 6;

const STATUS_KEYS = Object.values(AssetStatus);

// Marker máy: chấm tròn tô theo trạng thái, viền đỏ nếu lệch vị trí.
const machineIcon = (status: AssetStatus, mismatch: boolean) => {
    const color = getAssetStatusColor(status).color;
    const ring = mismatch ? ',0 0 0 3px rgba(239,68,68,.4)' : '';
    const border = mismatch ? '#ef4444' : '#ffffff';
    return L.divIcon({
        className: 'hd-machine-marker',
        html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${color};border:2px solid ${border};box-shadow:0 1px 4px rgba(0,0,0,.35)${ring}"></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -12],
    });
};

const facilityIcon = L.divIcon({
    className: 'hd-facility-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:#1e293b;color:#fff;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.4)">🏭</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
});

// Tự khớp khung nhìn theo các điểm hiện có.
const FitBounds = ({ points }: { points: [number, number][] }) => {
    const map = useMap();
    const signature = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 16);
            return;
        }
        map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 17 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, map]);
    return null;
};

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '—');

const escapeHtml = (value?: string) =>
    (value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );

// Popup dạng HTML (marker tạo theo kiểu imperative để gom cụm) — nút "Xem chi tiết" điều hướng qua delegated click.
const buildPopupHtml = (a: AssetLocationPoint) => {
    const meta = getAssetStatusColor(a.status);
    const title = escapeHtml(a.machineCode || a.name || 'Máy');
    const subtitle = a.name && a.machineCode ? `<div style="color:#475569">${escapeHtml(a.name)}</div>` : '';
    const scanned = `<div style="font-size:12px;color:#64748b">Quét lúc: ${escapeHtml(formatDateTime(a.scannedAt))}</div>`;
    const by = a.scannedByName
        ? `<div style="font-size:12px;color:#64748b">Người quét: ${escapeHtml(a.scannedByName)}</div>`
        : '';
    const loc = a.mismatch
        ? `<div style="background:#fff1f2;color:#be123c;padding:6px 8px;border-radius:6px;font-size:12px;margin-top:4px">⚠ Lệch vị trí: gần <b>${escapeHtml(
              a.actualPlantName || 'cơ sở khác'
          )}</b>, hệ thống ghi <b>${escapeHtml(a.officialPlantName || a.plantName)}</b>${
              typeof a.distanceM === 'number' ? ` (~${Math.round(a.distanceM)}m)` : ''
          }</div>`
        : `<div style="font-size:12px;color:#64748b">Cơ sở: ${escapeHtml(a.plantName || '—')}</div>`;
    const badge = `<span style="display:inline-flex;align-items:center;gap:4px;background:${meta.color}1a;color:${meta.color};border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600"><span style="width:6px;height:6px;border-radius:9999px;background:${meta.color}"></span>${escapeHtml(
        meta.label
    )}</span>`;
    return `<div style="min-width:200px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-weight:600;color:#0f172a">${title}</span>${badge}</div>
        ${subtitle}${scanned}${by}${loc}
        <button type="button" data-asset-id="${a.id}" class="hd-popup-detail" style="margin-top:6px;background:none;border:none;color:#2563eb;font-weight:600;cursor:pointer;padding:0">Xem chi tiết →</button>
    </div>`;
};

// Lớp marker máy gom cụm (leaflet.markercluster) — nhiều máy gần nhau gộp thành cụm có số đếm, bung ra khi zoom.
const ClusterMarkers = ({ assets, onSelect }: { assets: AssetLocationPoint[]; onSelect: (id: string) => void }) => {
    const map = useMap();
    useEffect(() => {
        const group = (L as unknown as { markerClusterGroup: (opts?: unknown) => L.LayerGroup }).markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            chunkedLoading: true,
        });
        assets.forEach((a) => {
            const marker = L.marker([a.lat, a.lng], { icon: machineIcon(a.status, a.mismatch) });
            marker.bindPopup(buildPopupHtml(a));
            marker.on('popupopen', (e) => {
                const node = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('.hd-popup-detail');
                node?.addEventListener(
                    'click',
                    () => {
                        onSelect(a.id);
                        map.closePopup();
                    },
                    { once: true }
                );
            });
            group.addLayer(marker);
        });
        map.addLayer(group);
        return () => {
            map.removeLayer(group);
        };
    }, [assets, map, onSelect]);
    return null;
};

const MapPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const handleSelect = useCallback((id: string) => navigate(`/assets/${id}`), [navigate]);
    const { data, isLoading, isFetching, refetch } = useAssetLocations();
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    const [selectedPlant, setSelectedPlant] = useState<string>(user?.plantId ?? '');
    const [statusFilter, setStatusFilter] = useState<AssetStatus[]>([]);
    const [mismatchOnly, setMismatchOnly] = useState(false);

    const assets = data?.assets ?? [];
    const facilities = data?.facilities ?? [];

    const filtered = useMemo(
        () =>
            assets.filter(
                (a) =>
                    (!selectedPlant || a.plantId === selectedPlant) &&
                    (statusFilter.length === 0 || statusFilter.includes(a.status)) &&
                    (!mismatchOnly || a.mismatch)
            ),
        [assets, selectedPlant, statusFilter, mismatchOnly]
    );

    const mismatchCount = useMemo(() => filtered.filter((a) => a.mismatch).length, [filtered]);

    const points = useMemo<[number, number][]>(() => {
        const pts = filtered.map((a) => [a.lat, a.lng] as [number, number]);
        if (pts.length === 0) return facilities.map((f) => [f.lat, f.lng] as [number, number]);
        return pts;
    }, [filtered, facilities]);

    return (
        <div className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='mb-0 flex items-center gap-2 text-xl font-bold text-slate-900'>
                        <EnvironmentOutlined className='text-blue-600' /> Bản đồ vị trí máy
                    </h1>
                    <p className='mb-0 text-sm text-slate-500'>Vị trí GPS lần quét QR gần nhất của từng máy</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
                    Làm mới
                </Button>
            </div>

            <div className='grid gap-4 lg:grid-cols-[300px_1fr]'>
                <aside className='flex flex-col gap-4'>
                    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                        <div className='space-y-3'>
                            <div>
                                <div className='mb-1 text-xs font-semibold text-slate-500'>Cơ sở</div>
                                <Select
                                    className='w-full'
                                    value={selectedPlant || undefined}
                                    placeholder='Tất cả cơ sở'
                                    allowClear
                                    onChange={(v) => setSelectedPlant(v ?? '')}
                                    options={plants.map((p) => ({ value: p.id, label: p.name }))}
                                />
                            </div>
                            <div>
                                <div className='mb-1 text-xs font-semibold text-slate-500'>Trạng thái</div>
                                <Select
                                    mode='multiple'
                                    className='w-full'
                                    value={statusFilter}
                                    placeholder='Tất cả trạng thái'
                                    allowClear
                                    maxTagCount='responsive'
                                    onChange={(v) => setStatusFilter(v as AssetStatus[])}
                                    options={STATUS_KEYS.map((s) => ({
                                        value: s,
                                        label: ASSET_STATUS_COLOR[s].label,
                                    }))}
                                />
                            </div>
                            <div className='flex items-center justify-between'>
                                <span className='text-sm text-slate-700'>Chỉ máy lệch vị trí</span>
                                <Switch checked={mismatchOnly} onChange={setMismatchOnly} />
                            </div>
                        </div>
                    </div>

                    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                        <div className='mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase'>
                            Đang hiển thị
                        </div>
                        <div className='flex items-baseline gap-2'>
                            <span className='text-2xl font-bold text-slate-900'>{filtered.length}</span>
                            <span className='text-sm text-slate-500'>máy có vị trí</span>
                        </div>
                        {mismatchCount > 0 ? (
                            <div className='mt-1 flex items-center gap-1 text-sm font-medium text-rose-600'>
                                <WarningFilled /> {mismatchCount} máy lệch vị trí
                            </div>
                        ) : null}
                        {data?.withoutGps ? (
                            <div className='mt-1 text-[12px] text-slate-400'>
                                {data.withoutGps} máy chưa có dữ liệu GPS (chưa quét QR)
                            </div>
                        ) : null}
                    </div>

                    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                        <div className='mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase'>Chú giải</div>
                        <div className='space-y-1.5'>
                            {STATUS_KEYS.map((s) => (
                                <div key={s} className='flex items-center gap-2 text-sm text-slate-600'>
                                    <span
                                        className='h-3 w-3 rounded-full'
                                        style={{ background: ASSET_STATUS_COLOR[s].color }}
                                    />
                                    {ASSET_STATUS_COLOR[s].label}
                                </div>
                            ))}
                            <div className='flex items-center gap-2 pt-1 text-sm text-slate-600'>
                                <span className='h-3 w-3 rounded-full bg-slate-400 ring-2 ring-rose-500' />
                                Viền đỏ = lệch vị trí
                            </div>
                            <div className='flex items-center gap-2 text-sm text-slate-600'>
                                <span>🏭</span> Cơ sở
                            </div>
                        </div>
                    </div>
                </aside>

                <div className='relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                    {isLoading ? (
                        <div className='flex h-[70vh] items-center justify-center'>
                            <Spin />
                        </div>
                    ) : assets.length === 0 ? (
                        <div className='flex h-[70vh] items-center justify-center'>
                            <Empty description='Chưa có máy nào được định vị qua quét QR' />
                        </div>
                    ) : (
                        <MapContainer
                            center={DEFAULT_CENTER}
                            zoom={DEFAULT_ZOOM}
                            scrollWheelZoom
                            style={{ height: '70vh', width: '100%' }}
                        >
                            <TileLayer
                                attribution='&copy; OpenStreetMap'
                                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                            />
                            <FitBounds points={points} />
                            {facilities.map((f) => (
                                <Marker key={`plant-${f.id}`} position={[f.lat, f.lng]} icon={facilityIcon}>
                                    <Popup>
                                        <div className='font-semibold text-slate-900'>{f.name}</div>
                                        {f.code ? <div className='text-[12px] text-slate-500'>{f.code}</div> : null}
                                    </Popup>
                                </Marker>
                            ))}
                            <ClusterMarkers assets={filtered} onSelect={handleSelect} />
                        </MapContainer>
                    )}
                    {filtered.length === 0 && assets.length > 0 ? (
                        <div className='pointer-events-none absolute inset-x-0 top-3 flex justify-center'>
                            <Tag color='default'>Không có máy khớp bộ lọc</Tag>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default MapPage;
