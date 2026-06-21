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
import {
    AimOutlined,
    ApartmentOutlined,
    EnvironmentOutlined,
    FilterOutlined,
    ReloadOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useAssetLocations } from '../core/hooks/useDashboardOverview';
import { plantService } from '../core/services/plant.service';
import { useAuth } from '../core/contexts/AuthContext';
import { ASSET_STATUS_COLOR, getAssetStatusColor } from '../core/constants/assetStatusColor';
import { AssetStatus, type AssetLocationPoint } from '../core/types';

const DEFAULT_CENTER: [number, number] = [16.0, 107.8];
const DEFAULT_ZOOM = 6;

const STATUS_KEYS = Object.values(AssetStatus);

type MachineMarker = L.Marker & {
    options: L.MarkerOptions & {
        assetColor?: string;
        assetMismatch?: boolean;
    };
};

type MachineCluster = {
    getChildCount: () => number;
    getAllChildMarkers: () => MachineMarker[];
};

const mapSafeStatusClass = (status: AssetStatus) =>
    String(status)
        .replace(/[^a-z0-9_-]/gi, '-')
        .toLowerCase();

const machineIcon = (status: AssetStatus, mismatch: boolean) => {
    const meta = getAssetStatusColor(status);

    return L.divIcon({
        className: `hd-machine-marker hd-machine-marker--${mapSafeStatusClass(status)}${
            mismatch ? ' hd-machine-marker--mismatch' : ''
        }`,
        html: `<span class="hd-machine-marker__halo" style="--marker-color:${meta.color}"></span>
               <span class="hd-machine-marker__core" style="--marker-color:${meta.color}">
                   <span class="hd-machine-marker__spark"></span>
               </span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18],
    });
};

const facilityIcon = L.divIcon({
    className: 'hd-facility-marker',
    html: `<span class="hd-facility-marker__pulse"></span>
           <span class="hd-facility-marker__body">
               <span class="hd-facility-marker__roof"></span>
               <span class="hd-facility-marker__blocks"><i></i><i></i><i></i></span>
           </span>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -24],
});

const fitMapToPoints = (map: L.Map, points: [number, number][]) => {
    if (points.length === 0) return;
    if (points.length === 1) {
        map.setView(points[0], 16, { animate: true });
        return;
    }
    map.fitBounds(L.latLngBounds(points), { animate: true, duration: 0.8, padding: [64, 64], maxZoom: 17 });
};

const FitBounds = ({ points, signal }: { points: [number, number][]; signal: number }) => {
    const map = useMap();
    const signature = points.map((p) => p.join(',')).join('|');

    useEffect(() => {
        fitMapToPoints(map, points);
    }, [signature, signal, map]);

    return null;
};

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '—');

const escapeHtml = (value?: string) =>
    (value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );

const buildPopupHtml = (a: AssetLocationPoint) => {
    const meta = getAssetStatusColor(a.status);
    const title = escapeHtml(a.machineCode || a.name || 'Máy');
    const subtitle = a.name && a.machineCode ? `<span>${escapeHtml(a.name)}</span>` : '<span>Chưa có tên máy</span>';
    const accuracy =
        typeof a.accuracy === 'number'
            ? `<span class="hd-map-popup__pill">Sai số ${Math.round(a.accuracy)}m</span>`
            : '';
    const distance =
        typeof a.distanceM === 'number' ? `<strong>${Math.round(a.distanceM).toLocaleString('vi-VN')}m</strong>` : '';

    const mismatch = a.mismatch
        ? `<div class="hd-map-popup__alert">
                <b>Lệch vị trí</b>
                <span>Đang gần ${escapeHtml(a.actualPlantName || 'cơ sở khác')}, hệ thống ghi ${escapeHtml(
                    a.officialPlantName || a.plantName
                )} ${distance ? `(${distance})` : ''}</span>
           </div>`
        : `<div class="hd-map-popup__field">
                <span>Cơ sở</span>
                <strong>${escapeHtml(a.plantName || '—')}</strong>
           </div>`;

    return `<div class="hd-map-popup">
        <div class="hd-map-popup__top" style="--popup-color:${meta.color}">
            <span class="hd-map-popup__beacon"></span>
            <div>
                <strong>${title}</strong>
                ${subtitle}
            </div>
        </div>
        <div class="hd-map-popup__status" style="--popup-color:${meta.color}">
            <i></i>${escapeHtml(meta.label)}
        </div>
        <div class="hd-map-popup__grid">
            <div class="hd-map-popup__field">
                <span>Quét lúc</span>
                <strong>${escapeHtml(formatDateTime(a.scannedAt))}</strong>
            </div>
            <div class="hd-map-popup__field">
                <span>Người quét</span>
                <strong>${escapeHtml(a.scannedByName || '—')}</strong>
            </div>
        </div>
        ${mismatch}
        <div class="hd-map-popup__footer">
            ${accuracy}
            <button type="button" data-asset-id="${a.id}" class="hd-popup-detail">Xem chi tiết</button>
        </div>
    </div>`;
};

const createClusterIcon = (cluster: MachineCluster) => {
    const count = cluster.getChildCount();
    const children = cluster.getAllChildMarkers();
    const hasMismatch = children.some((marker) => marker.options.assetMismatch);
    const colors = children.map((marker) => marker.options.assetColor).filter(Boolean) as string[];
    const primary = colors[0] || '#2563eb';
    const secondary = colors.find((color) => color !== primary) || '#06b6d4';
    const size = count >= 100 ? 74 : count >= 20 ? 66 : 58;
    const clusterStyle = `style="--cluster-primary:${primary};--cluster-secondary:${secondary}"`;

    return L.divIcon({
        className: `hd-map-cluster${hasMismatch ? ' hd-map-cluster--mismatch' : ''}`,
        html: `<span class="hd-map-cluster__pulse" ${clusterStyle}></span>
               <span class="hd-map-cluster__body" ${clusterStyle}>
                    <b>${count > 999 ? '999+' : count}</b>
                    <small>máy</small>
               </span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

const ClusterMarkers = ({ assets, onSelect }: { assets: AssetLocationPoint[]; onSelect: (id: string) => void }) => {
    const map = useMap();

    useEffect(() => {
        const group = (
            L as unknown as {
                markerClusterGroup: (opts?: unknown) => L.LayerGroup & { addLayer: (layer: L.Layer) => void };
            }
        ).markerClusterGroup({
            maxClusterRadius: 54,
            showCoverageOnHover: false,
            chunkedLoading: true,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: (cluster: unknown) => createClusterIcon(cluster as MachineCluster),
        });

        assets.forEach((a) => {
            const meta = getAssetStatusColor(a.status);
            const marker = L.marker([a.lat, a.lng], { icon: machineIcon(a.status, a.mismatch) }) as MachineMarker;
            marker.options.assetColor = meta.color;
            marker.options.assetMismatch = a.mismatch;
            marker.bindPopup(buildPopupHtml(a), {
                className: 'hd-map-popup-shell',
                closeButton: true,
                maxWidth: 320,
                minWidth: 260,
            });
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
    const [fitSignal, setFitSignal] = useState(0);

    const assets = data?.assets ?? [];
    const facilities = data?.facilities ?? [];

    const statusCountBase = useMemo(
        () => assets.filter((a) => (!selectedPlant || a.plantId === selectedPlant) && (!mismatchOnly || a.mismatch)),
        [assets, selectedPlant, mismatchOnly]
    );

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

    const statusCounts = useMemo(() => {
        const counts = new Map<AssetStatus, number>();
        statusCountBase.forEach((asset) => counts.set(asset.status, (counts.get(asset.status) ?? 0) + 1));
        return counts;
    }, [statusCountBase]);

    const mismatchCount = useMemo(() => filtered.filter((a) => a.mismatch).length, [filtered]);

    const points = useMemo<[number, number][]>(() => {
        const pts = filtered.map((a) => [a.lat, a.lng] as [number, number]);
        if (pts.length === 0) return facilities.map((f) => [f.lat, f.lng] as [number, number]);
        return pts;
    }, [filtered, facilities]);

    const selectedPlantName = selectedPlant ? plants.find((p) => p.id === selectedPlant)?.name : 'Tất cả cơ sở';
    const hasActiveFilter = Boolean(selectedPlant || statusFilter.length || mismatchOnly);

    return (
        <div className='machine-map-page'>
            <section className='machine-map-hero'>
                <div className='machine-map-hero__copy'>
                    <span className='machine-map-hero__eyebrow'>
                        <EnvironmentOutlined /> Lead map vận hành
                    </span>
                    <h1>Bản đồ vị trí máy</h1>
                    <p>Theo dõi vị trí GPS lần quét QR gần nhất, phát hiện máy lệch cơ sở và kiểm soát vùng rủi ro.</p>
                </div>
                <div className='machine-map-hero__actions'>
                    <Button
                        className='machine-map-action-button'
                        icon={<AimOutlined />}
                        onClick={() => setFitSignal((value) => value + 1)}
                    >
                        Căn lại bản đồ
                    </Button>
                    <Button
                        type='primary'
                        className='machine-map-action-button machine-map-action-button--primary'
                        icon={<ReloadOutlined />}
                        onClick={() => refetch()}
                        loading={isFetching}
                    >
                        Làm mới
                    </Button>
                </div>
            </section>

            <div className='machine-map-summary'>
                <div className='machine-map-stat machine-map-stat--blue'>
                    <span>Đang hiển thị</span>
                    <strong>{filtered.length.toLocaleString('vi-VN')}</strong>
                    <small>máy có GPS</small>
                </div>
                <button
                    type='button'
                    className={`machine-map-stat machine-map-stat--rose${mismatchOnly ? 'machine-map-stat--active' : ''}`}
                    onClick={() => {
                        setMismatchOnly((value) => !value);
                        setFitSignal((value) => value + 1);
                    }}
                >
                    <span>Lệch vị trí</span>
                    <strong>{mismatchCount.toLocaleString('vi-VN')}</strong>
                    <small>bấm để lọc nhanh</small>
                </button>
                <div className='machine-map-stat machine-map-stat--slate'>
                    <span>Chưa có GPS</span>
                    <strong>{(data?.withoutGps ?? 0).toLocaleString('vi-VN')}</strong>
                    <small>chưa quét QR</small>
                </div>
                <div className='machine-map-stat machine-map-stat--cyan'>
                    <span>Phạm vi</span>
                    <strong>{selectedPlantName || 'Tất cả'}</strong>
                    <small>{statusFilter.length ? `${statusFilter.length} trạng thái` : 'toàn bộ trạng thái'}</small>
                </div>
            </div>

            <div className='machine-map-layout'>
                <aside className='machine-map-panel'>
                    <div className='machine-map-panel__header'>
                        <span>
                            <FilterOutlined /> Bộ lọc vận hành
                        </span>
                        {hasActiveFilter ? (
                            <button
                                type='button'
                                onClick={() => {
                                    setSelectedPlant('');
                                    setStatusFilter([]);
                                    setMismatchOnly(false);
                                }}
                            >
                                Xóa lọc
                            </button>
                        ) : null}
                    </div>

                    <div className='machine-map-field'>
                        <label>Cơ sở</label>
                        <Select
                            className='machine-map-select'
                            value={selectedPlant || undefined}
                            placeholder='Tất cả cơ sở'
                            allowClear
                            onChange={(value) => setSelectedPlant(value ?? '')}
                            options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                        />
                    </div>

                    <div className='machine-map-field'>
                        <label>Trạng thái</label>
                        <Select
                            mode='multiple'
                            className='machine-map-select'
                            value={statusFilter}
                            placeholder='Tất cả trạng thái'
                            allowClear
                            maxTagCount='responsive'
                            onChange={(value) => setStatusFilter(value as AssetStatus[])}
                            options={STATUS_KEYS.map((status) => ({
                                value: status,
                                label: ASSET_STATUS_COLOR[status].label,
                            }))}
                        />
                    </div>

                    <div className='machine-map-switch-row'>
                        <div>
                            <strong>Chỉ máy lệch vị trí</strong>
                            <span>Ưu tiên xử lý máy có GPS khác cơ sở hệ thống</span>
                        </div>
                        <Switch checked={mismatchOnly} onChange={setMismatchOnly} />
                    </div>

                    <div className='machine-map-status-cloud'>
                        {STATUS_KEYS.map((status) => {
                            const meta = ASSET_STATUS_COLOR[status];
                            const selected = statusFilter.includes(status);
                            return (
                                <button
                                    key={status}
                                    type='button'
                                    className={
                                        selected ? 'machine-map-status-chip is-active' : 'machine-map-status-chip'
                                    }
                                    style={{ '--chip-color': meta.color } as React.CSSProperties}
                                    onClick={() =>
                                        setStatusFilter((current) =>
                                            current.includes(status)
                                                ? current.filter((item) => item !== status)
                                                : [...current, status]
                                        )
                                    }
                                >
                                    <i />
                                    <span>{meta.label}</span>
                                    <b>{statusCounts.get(status) ?? 0}</b>
                                </button>
                            );
                        })}
                    </div>

                    <div className='machine-map-legend'>
                        <div className='machine-map-legend__title'>
                            <ApartmentOutlined /> Chú giải
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--pulse' />
                            Marker có vòng sáng = máy đã có GPS
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--danger' />
                            Vòng đỏ = lệch vị trí
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--plant' />
                            Beacon xanh = cơ sở
                        </div>
                    </div>
                </aside>

                <section className='machine-map-stage'>
                    {isLoading ? (
                        <div className='machine-map-loading'>
                            <Spin />
                            <span>Đang dựng bản đồ vận hành...</span>
                        </div>
                    ) : assets.length === 0 ? (
                        <div className='machine-map-empty'>
                            <Empty description='Chưa có máy nào được định vị qua quét QR' />
                        </div>
                    ) : (
                        <>
                            <div className='machine-map-toolbar'>
                                <button type='button' onClick={() => setFitSignal((value) => value + 1)}>
                                    <AimOutlined /> Căn lại
                                </button>
                                <button
                                    type='button'
                                    className={mismatchOnly ? 'is-active' : ''}
                                    onClick={() => {
                                        setMismatchOnly((value) => !value);
                                        setFitSignal((value) => value + 1);
                                    }}
                                >
                                    <WarningFilled /> Lệch vị trí
                                </button>
                                <button type='button' onClick={() => refetch()}>
                                    <ReloadOutlined /> Tải lại
                                </button>
                            </div>

                            {isFetching ? <div className='machine-map-fetching-bar' /> : null}

                            <MapContainer
                                className='machine-map-canvas'
                                center={DEFAULT_CENTER}
                                zoom={DEFAULT_ZOOM}
                                scrollWheelZoom
                            >
                                <TileLayer
                                    attribution='&copy; OpenStreetMap'
                                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                />
                                <FitBounds points={points} signal={fitSignal} />
                                {facilities.map((facility) => (
                                    <Marker
                                        key={`plant-${facility.id}`}
                                        position={[facility.lat, facility.lng]}
                                        icon={facilityIcon}
                                    >
                                        <Popup className='hd-map-popup-shell'>
                                            <div className='hd-map-plant-popup'>
                                                <strong>{facility.name}</strong>
                                                {facility.code ? <span>{facility.code}</span> : null}
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}
                                <ClusterMarkers assets={filtered} onSelect={handleSelect} />
                            </MapContainer>
                        </>
                    )}

                    {filtered.length === 0 && assets.length > 0 ? (
                        <div className='machine-map-no-result'>
                            <Tag color='default'>Không có máy khớp bộ lọc</Tag>
                        </div>
                    ) : null}
                </section>
            </div>
        </div>
    );
};

export default MapPage;
