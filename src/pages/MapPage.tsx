import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Input, Select, Spin, Switch, Tag } from 'antd';
import {
    AimOutlined,
    ApartmentOutlined,
    AppstoreOutlined,
    CloseOutlined,
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

type TypeMeta = {
    key: string;
    label: string;
    shortLabel: string;
    color: string;
    textColor: string;
};

type TypeGroup = {
    meta: TypeMeta;
    assets: AssetLocationPoint[];
};

type MachineMarker = L.Marker & {
    options: L.MarkerOptions & {
        assetPoint?: AssetLocationPoint;
        assetTypeKey?: string;
        assetTypeColor?: string;
        assetTypeLabel?: string;
        assetMismatch?: boolean;
    };
};

type MachineCluster = {
    getChildCount: () => number;
    getAllChildMarkers: () => MachineMarker[];
    getBounds: () => L.LatLngBounds;
};

type MachineClusterGroup = L.LayerGroup & {
    addLayer: (layer: L.Layer) => void;
    on: (type: 'clusterclick', handler: (event: { layer: MachineCluster }) => void) => void;
};

/**
 * Nhóm máy theo TÊN MÁY (asset.name) thay vì đoán "loại" bằng từ khóa:
 * trường `type` trong dữ liệu thực tế toàn viết tắt tự do ("1k", "M1K", "vs4c")
 * nên phân loại theo type/keyword bị sai và trùng nhóm. Tên máy là trường
 * được nhập đầy đủ, nhất quán nhất — mỗi tên là một nhóm, màu gán ổn định theo hash.
 */
const GROUP_PALETTE: Array<{ color: string; textColor: string }> = [
    { color: '#2f51d9', textColor: '#2743ae' },
    { color: '#0e7490', textColor: '#0b5c73' },
    { color: '#7c3aed', textColor: '#6d28d9' },
    { color: '#c2410c', textColor: '#9a3412' },
    { color: '#047857', textColor: '#065f46' },
    { color: '#a16207', textColor: '#854d0e' },
    { color: '#be185d', textColor: '#9d174d' },
    { color: '#4d7c0f', textColor: '#3f6212' },
    { color: '#0369a1', textColor: '#075985' },
    { color: '#9333ea', textColor: '#7e22ce' },
    { color: '#dc2626', textColor: '#b91c1c' },
    { color: '#475569', textColor: '#334155' },
];

const FALLBACK_TYPE: TypeMeta = {
    key: 'chua-dat-ten',
    label: 'Chưa đặt tên',
    shortLabel: '—',
    color: '#94a3b8',
    textColor: '#64748b',
};

const normalizeText = (value?: string) =>
    (value ?? '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(hash);
};

/** Nhãn tắt in trên marker: bỏ chữ "máy" đầu, lấy ký tự đầu mỗi từ ("1 kim"→1K, "vắt sổ"→VS, "kansai"→KA). */
const buildShortLabel = (name: string) => {
    const tokens = normalizeText(name)
        .replace(/^may\s+/, '')
        .split(' ')
        .filter(Boolean);
    if (!tokens.length) return 'M';
    if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
    return tokens
        .slice(0, 3)
        .map((token) => token[0])
        .join('')
        .toUpperCase();
};

const typeMetaCache = new Map<string, TypeMeta>();

const getTypeMeta = (asset?: Pick<AssetLocationPoint, 'type' | 'model' | 'name'>): TypeMeta => {
    const rawName = (asset?.name ?? '').trim();
    if (!rawName) return FALLBACK_TYPE;
    // Bỏ hết khoảng trắng khi làm khóa nhóm để "Máy 1kim" và "Máy 1 kim" về CÙNG một nhóm
    const key = normalizeText(rawName).replace(/\s+/g, '');
    let meta = typeMetaCache.get(key);
    if (!meta) {
        const palette = GROUP_PALETTE[hashString(key) % GROUP_PALETTE.length];
        meta = {
            key,
            label: rawName,
            shortLabel: buildShortLabel(rawName),
            color: palette.color,
            textColor: palette.textColor,
        };
        typeMetaCache.set(key, meta);
    } else if (rawName.length > meta.label.length) {
        // Ưu tiên biến thể tên dài/đầy đủ hơn làm nhãn hiển thị ("Máy 1 kim" thắng "Máy 1kim")
        meta.label = rawName;
        meta.shortLabel = buildShortLabel(rawName);
    }
    return meta;
};

const getAssetDisplayCode = (asset: AssetLocationPoint) => asset.machineCode || asset.name || asset.publicId || 'Máy';

const escapeHtml = (value?: string) =>
    (value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '—');

const buildTypeGroups = (assets: AssetLocationPoint[]) => {
    const map = new Map<string, TypeGroup>();
    assets.forEach((asset) => {
        const meta = getTypeMeta(asset);
        const current = map.get(meta.key);
        if (current) current.assets.push(asset);
        else map.set(meta.key, { meta, assets: [asset] });
    });

    return Array.from(map.values()).sort(
        (a, b) => b.assets.length - a.assets.length || a.meta.label.localeCompare(b.meta.label)
    );
};

const getDominantType = (assets: AssetLocationPoint[]) => buildTypeGroups(assets)[0]?.meta ?? FALLBACK_TYPE;

const machineIcon = (asset: AssetLocationPoint) => {
    const typeMeta = getTypeMeta(asset);
    const statusMeta = getAssetStatusColor(asset.status);
    const code = escapeHtml(getAssetDisplayCode(asset).slice(0, 12));

    return L.divIcon({
        className: `hd-type-marker${asset.mismatch ? ' hd-type-marker--mismatch' : ''}`,
        html: `<span class="hd-type-marker__badge" style="--type-color:${typeMeta.color}">${escapeHtml(typeMeta.shortLabel)}</span>
               <span class="hd-type-marker__label">
                    <b>${code}</b>
                    <small>${escapeHtml(typeMeta.label)}</small>
               </span>
               <span class="hd-type-marker__status" style="--status-color:${statusMeta.color}"></span>`,
        iconSize: [116, 52],
        iconAnchor: [58, 14],
        popupAnchor: [0, -16],
    });
};

const facilityIcon = L.divIcon({
    className: 'hd-facility-marker',
    html: `<span class="hd-facility-radar"><i></i><i></i><i></i></span>
           <span class="hd-facility-marker__body">
               <span class="hd-facility-marker__roof"></span>
               <span class="hd-facility-marker__blocks"><i></i><i></i><i></i></span>
           </span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
});

/** Cụm máy = vòng donut conic-gradient: mỗi lát màu là tỉ lệ 1 tên máy trong cụm. */
const createClusterIcon = (cluster: MachineCluster) => {
    const children = cluster.getAllChildMarkers();
    const assets = children.map((marker) => marker.options.assetPoint).filter(Boolean) as AssetLocationPoint[];
    const count = cluster.getChildCount();
    const groups = buildTypeGroups(assets);
    const dominant = groups[0]?.meta ?? FALLBACK_TYPE;
    const hasMismatch = assets.some((asset) => asset.mismatch);
    const size = count >= 100 ? 74 : count >= 20 ? 64 : 54;

    let acc = 0;
    const ringStops = groups
        .map((group) => {
            const start = acc;
            acc += (group.assets.length / Math.max(count, 1)) * 100;
            return `${group.meta.color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
        })
        .join(', ');

    return L.divIcon({
        className: `hd-cluster${hasMismatch ? ' hd-cluster--mismatch' : ''}`,
        html: `<span class="hd-cluster__ring" style="--ring:conic-gradient(${ringStops});--type-color:${dominant.color}">
                    <span class="hd-cluster__core">
                        <b>${count > 999 ? '999+' : count}</b>
                        <small>${escapeHtml(dominant.shortLabel)}</small>
                    </span>
                    ${hasMismatch ? '<i class="hd-cluster__warn">!</i>' : ''}
               </span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

const fitMapToPoints = (map: L.Map, points: [number, number][]) => {
    if (points.length === 0) return;
    if (points.length === 1) {
        map.setView(points[0], 16, { animate: true });
        return;
    }
    map.fitBounds(L.latLngBounds(points), { animate: true, duration: 0.65, padding: [64, 64], maxZoom: 17 });
};

const FitBounds = ({ points, signal }: { points: [number, number][]; signal: number }) => {
    const map = useMap();
    const signature = points.map((p) => p.join(',')).join('|');

    useEffect(() => {
        fitMapToPoints(map, points);
    }, [signature, signal, map]);

    return null;
};

const buildPopupHtml = (asset: AssetLocationPoint) => {
    const typeMeta = getTypeMeta(asset);
    const statusMeta = getAssetStatusColor(asset.status);
    const distance =
        typeof asset.distanceM === 'number'
            ? `<strong>${Math.round(asset.distanceM).toLocaleString('vi-VN')}m</strong>`
            : '';
    const mismatch = asset.mismatch
        ? `<div class="hd-map-popup__alert">
                <b>Lệch vị trí</b>
                <span>Gần ${escapeHtml(asset.actualPlantName || 'cơ sở khác')}, hồ sơ ghi ${escapeHtml(
                    asset.officialPlantName || asset.plantName
                )} ${distance ? `(${distance})` : ''}</span>
           </div>`
        : `<div class="hd-map-popup__field"><span>Cơ sở</span><strong>${escapeHtml(asset.plantName || '—')}</strong></div>`;

    return `<div class="hd-map-popup">
        <div class="hd-map-popup__top" style="--popup-color:${typeMeta.color}">
            <span class="hd-map-popup__type">${escapeHtml(typeMeta.shortLabel)}</span>
            <div>
                <strong>${escapeHtml(getAssetDisplayCode(asset))}</strong>
                <span>${escapeHtml(asset.name || 'Chưa đặt tên máy')}</span>
            </div>
        </div>
        <div class="hd-map-popup__badges">
            <span style="--popup-color:${typeMeta.color}">${escapeHtml(typeMeta.label)}</span>
            <span style="--popup-color:${statusMeta.color}">${escapeHtml(statusMeta.label)}</span>
        </div>
        <div class="hd-map-popup__grid">
            <div class="hd-map-popup__field"><span>Model</span><strong>${escapeHtml(asset.model || asset.type || '—')}</strong></div>
            <div class="hd-map-popup__field"><span>Hãng</span><strong>${escapeHtml(asset.brandName || '—')}</strong></div>
            <div class="hd-map-popup__field"><span>Quét lúc</span><strong>${escapeHtml(formatDateTime(asset.scannedAt))}</strong></div>
            <div class="hd-map-popup__field"><span>Người quét</span><strong>${escapeHtml(asset.scannedByName || '—')}</strong></div>
        </div>
        ${mismatch}
        <div class="hd-map-popup__footer">
            ${
                typeof asset.accuracy === 'number'
                    ? `<span class="hd-map-popup__pill">Sai số ${Math.round(asset.accuracy)}m</span>`
                    : '<span></span>'
            }
            <button type="button" data-asset-id="${asset.id}" class="hd-popup-detail">Mở hồ sơ</button>
        </div>
    </div>`;
};

const ClusterMarkers = ({
    assets,
    onSelect,
    onClusterSelect,
}: {
    assets: AssetLocationPoint[];
    onSelect: (id: string) => void;
    onClusterSelect: (assets: AssetLocationPoint[]) => void;
}) => {
    const map = useMap();

    useEffect(() => {
        const group = (
            L as unknown as {
                markerClusterGroup: (opts?: unknown) => MachineClusterGroup;
            }
        ).markerClusterGroup({
            maxClusterRadius: (zoom: number) => (zoom < 11 ? 78 : zoom < 14 ? 62 : 46),
            showCoverageOnHover: false,
            zoomToBoundsOnClick: false,
            spiderfyOnMaxZoom: false,
            chunkedLoading: true,
            animate: true,
            iconCreateFunction: createClusterIcon,
        });

        group.on('clusterclick', (event) => {
            const cluster = event.layer;
            const clusterAssets = cluster
                .getAllChildMarkers()
                .map((marker) => marker.options.assetPoint)
                .filter(Boolean) as AssetLocationPoint[];
            const bounds = cluster.getBounds();
            const spread = bounds.getNorthEast().distanceTo(bounds.getSouthWest());

            if (map.getZoom() < 16 && spread > 80) {
                map.fitBounds(bounds, { animate: true, duration: 0.45, padding: [72, 72], maxZoom: 16 });
                return;
            }

            onClusterSelect(clusterAssets);
        });

        assets.forEach((asset) => {
            const typeMeta = getTypeMeta(asset);
            const marker = L.marker([asset.lat, asset.lng], { icon: machineIcon(asset) }) as MachineMarker;
            marker.options.assetPoint = asset;
            marker.options.assetTypeKey = typeMeta.key;
            marker.options.assetTypeColor = typeMeta.color;
            marker.options.assetTypeLabel = typeMeta.label;
            marker.options.assetMismatch = asset.mismatch;
            marker.bindPopup(buildPopupHtml(asset), {
                className: 'hd-map-popup-shell',
                closeButton: true,
                maxWidth: 340,
                minWidth: 280,
            });
            marker.on('popupopen', (event) => {
                const node = (event.popup.getElement() as HTMLElement | undefined)?.querySelector('.hd-popup-detail');
                node?.addEventListener(
                    'click',
                    () => {
                        onSelect(asset.id);
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
    }, [assets, map, onClusterSelect, onSelect]);

    return null;
};

const MapPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useAssetLocations();
    const { data: plants = [] } = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll() });

    const [selectedPlant, setSelectedPlant] = useState<string>(user?.plantId ?? '');
    const [statusFilter, setStatusFilter] = useState<AssetStatus[]>([]);
    const [typeFilter, setTypeFilter] = useState<string[]>([]);
    const [typeSearch, setTypeSearch] = useState('');
    const [mismatchOnly, setMismatchOnly] = useState(false);
    const [fitSignal, setFitSignal] = useState(0);
    const [clusterAssets, setClusterAssets] = useState<AssetLocationPoint[]>([]);

    const handleSelect = useCallback(
        (id: string) => {
            setClusterAssets([]);
            navigate(`/assets/${id}`);
        },
        [navigate]
    );

    const assets = data?.assets ?? [];
    const facilities = data?.facilities ?? [];

    const typeCountBase = useMemo(
        () =>
            assets.filter(
                (asset) =>
                    (!selectedPlant || asset.plantId === selectedPlant) &&
                    (statusFilter.length === 0 || statusFilter.includes(asset.status)) &&
                    (!mismatchOnly || asset.mismatch)
            ),
        [assets, mismatchOnly, selectedPlant, statusFilter]
    );

    const typeGroups = useMemo(() => buildTypeGroups(typeCountBase), [typeCountBase]);

    const filtered = useMemo(
        () =>
            assets.filter((asset) => {
                const typeKey = getTypeMeta(asset).key;
                return (
                    (!selectedPlant || asset.plantId === selectedPlant) &&
                    (statusFilter.length === 0 || statusFilter.includes(asset.status)) &&
                    (typeFilter.length === 0 || typeFilter.includes(typeKey)) &&
                    (!mismatchOnly || asset.mismatch)
                );
            }),
        [assets, mismatchOnly, selectedPlant, statusFilter, typeFilter]
    );

    const mismatchCount = useMemo(() => filtered.filter((asset) => asset.mismatch).length, [filtered]);
    const dominantType = useMemo(() => getDominantType(filtered), [filtered]);
    const selectedPlantName = selectedPlant ? plants.find((plant) => plant.id === selectedPlant)?.name : 'Tất cả cơ sở';
    const hasActiveFilter = Boolean(selectedPlant || statusFilter.length || typeFilter.length || mismatchOnly);

    const points = useMemo<[number, number][]>(() => {
        const assetPoints = filtered.map((asset) => [asset.lat, asset.lng] as [number, number]);
        if (assetPoints.length === 0)
            return facilities.map((facility) => [facility.lat, facility.lng] as [number, number]);
        return assetPoints;
    }, [facilities, filtered]);

    const clusterGroups = useMemo(() => buildTypeGroups(clusterAssets), [clusterAssets]);

    return (
        <div className='machine-map-page'>
            <section className='machine-map-hero'>
                <div className='machine-map-hero__copy'>
                    <span className='machine-map-hero__eyebrow'>
                        <EnvironmentOutlined /> Bản đồ vận hành
                    </span>
                    <h1>Bản đồ vị trí máy</h1>
                    <p>Gom máy theo tên máy, theo dõi điểm quét QR gần nhất và xử lý nhanh các cụm máy cùng vị trí.</p>
                    <span className='machine-map-live'>
                        <i />
                        Cập nhật lúc{' '}
                        {dataUpdatedAt
                            ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '—'}
                    </span>
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
                <div className='machine-map-stat'>
                    <span>Đang hiển thị</span>
                    <strong>{filtered.length.toLocaleString('vi-VN')}</strong>
                    <small>máy có GPS</small>
                </div>
                <div className='machine-map-stat'>
                    <span>Nhiều nhất</span>
                    <strong>{dominantType.label}</strong>
                    <small>{buildTypeGroups(filtered)[0]?.assets.length ?? 0} máy</small>
                </div>
                <button
                    type='button'
                    className={`machine-map-stat machine-map-stat--button${mismatchOnly ? 'is-active' : ''}`}
                    onClick={() => {
                        setMismatchOnly((value) => !value);
                        setClusterAssets([]);
                    }}
                >
                    <span>Lệch vị trí</span>
                    <strong>{mismatchCount.toLocaleString('vi-VN')}</strong>
                    <small>bấm để lọc nhanh</small>
                </button>
                <div className='machine-map-stat'>
                    <span>Chưa có GPS</span>
                    <strong>{(data?.withoutGps ?? 0).toLocaleString('vi-VN')}</strong>
                    <small>chưa quét QR</small>
                </div>
            </div>

            <div className='machine-map-layout'>
                <aside className='machine-map-panel'>
                    <div className='machine-map-panel__header'>
                        <span>
                            <FilterOutlined /> Bộ lọc
                        </span>
                        {hasActiveFilter ? (
                            <button
                                type='button'
                                onClick={() => {
                                    setSelectedPlant('');
                                    setStatusFilter([]);
                                    setTypeFilter([]);
                                    setTypeSearch('');
                                    setMismatchOnly(false);
                                    setClusterAssets([]);
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
                            onChange={(value) => {
                                setSelectedPlant(value ?? '');
                                setClusterAssets([]);
                            }}
                            options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                        />
                    </div>

                    <div className='machine-map-field'>
                        <label>
                            Tên máy
                            <em className='machine-map-field__hint'>{typeGroups.length} tên</em>
                        </label>
                        <Input
                            allowClear
                            size='small'
                            className='machine-map-type-search'
                            placeholder='Tìm tên máy…'
                            value={typeSearch}
                            onChange={(event) => setTypeSearch(event.target.value)}
                        />
                        <div className='machine-map-type-grid machine-map-type-grid--scroll'>
                            {typeGroups
                                .filter(
                                    (group) =>
                                        !typeSearch.trim() ||
                                        normalizeText(group.meta.label).includes(normalizeText(typeSearch)) ||
                                        typeFilter.includes(group.meta.key)
                                )
                                .map((group) => {
                                const selected = typeFilter.includes(group.meta.key);
                                return (
                                    <button
                                        key={group.meta.key}
                                        type='button'
                                        className={
                                            selected ? 'machine-map-type-chip is-active' : 'machine-map-type-chip'
                                        }
                                        style={{ '--type-color': group.meta.color } as CSSProperties}
                                        onClick={() => {
                                            setTypeFilter((current) =>
                                                current.includes(group.meta.key)
                                                    ? current.filter((key) => key !== group.meta.key)
                                                    : [...current, group.meta.key]
                                            );
                                            setClusterAssets([]);
                                        }}
                                    >
                                        <i aria-hidden='true' />
                                        <span>{group.meta.label}</span>
                                        <b>{group.assets.length}</b>
                                    </button>
                                );
                            })}
                        </div>
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
                            onChange={(value) => {
                                setStatusFilter(value as AssetStatus[]);
                                setClusterAssets([]);
                            }}
                            options={STATUS_KEYS.map((status) => ({
                                value: status,
                                label: ASSET_STATUS_COLOR[status].label,
                            }))}
                        />
                    </div>

                    <div className='machine-map-switch-row'>
                        <div>
                            <strong>Chỉ máy lệch vị trí</strong>
                            <span>GPS gần nhất khác cơ sở quản lý</span>
                        </div>
                        <Switch
                            checked={mismatchOnly}
                            onChange={(checked) => {
                                setMismatchOnly(checked);
                                setClusterAssets([]);
                            }}
                        />
                    </div>

                    <div className='machine-map-legend'>
                        <div className='machine-map-legend__title'>
                            <AppstoreOutlined /> Quy ước hiển thị
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--type' />
                            Màu marker = tên máy
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--status' />
                            Chấm nhỏ = trạng thái
                        </div>
                        <div className='machine-map-legend__row'>
                            <span className='machine-map-legend__sample machine-map-legend__sample--danger' />
                            Viền đỏ = lệch vị trí
                        </div>
                    </div>
                </aside>

                <section className='machine-map-stage'>
                    {isLoading ? (
                        <div className='machine-map-loading'>
                            <Spin />
                            <span>Đang tải bản đồ máy...</span>
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
                                        setClusterAssets([]);
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
                                    attribution='&copy; OpenStreetMap &copy; CARTO'
                                    url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
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
                                <ClusterMarkers
                                    assets={filtered}
                                    onSelect={handleSelect}
                                    onClusterSelect={(items) => setClusterAssets(items)}
                                />
                            </MapContainer>
                        </>
                    )}

                    {filtered.length === 0 && assets.length > 0 ? (
                        <div className='machine-map-no-result'>
                            <Tag color='default'>Không có máy khớp bộ lọc</Tag>
                        </div>
                    ) : null}

                    {clusterAssets.length ? (
                        <aside className='machine-map-cluster-panel'>
                            <div className='machine-map-cluster-panel__head'>
                                <div>
                                    <span>Cụm máy</span>
                                    <strong>{clusterAssets.length.toLocaleString('vi-VN')} máy cùng vùng</strong>
                                    <small>{selectedPlantName || 'Tất cả cơ sở'}</small>
                                </div>
                                <button
                                    type='button'
                                    onClick={() => setClusterAssets([])}
                                    aria-label='Đóng danh sách cụm'
                                >
                                    <CloseOutlined />
                                </button>
                            </div>

                            <div className='machine-map-cluster-panel__body'>
                                {clusterGroups.map((group) => (
                                    <section key={group.meta.key} className='machine-map-cluster-group'>
                                        <div className='machine-map-cluster-group__title'>
                                            <span style={{ '--type-color': group.meta.color } as CSSProperties}>
                                                {group.meta.shortLabel}
                                            </span>
                                            <strong>{group.meta.label}</strong>
                                            <b>{group.assets.length}</b>
                                        </div>
                                        <div className='machine-map-cluster-list'>
                                            {group.assets.map((asset) => {
                                                const statusMeta = getAssetStatusColor(asset.status);
                                                return (
                                                    <button
                                                        key={asset.id}
                                                        type='button'
                                                        className='machine-map-cluster-item'
                                                        onClick={() => handleSelect(asset.id)}
                                                    >
                                                        <div>
                                                            <strong>{getAssetDisplayCode(asset)}</strong>
                                                            <span>
                                                                {asset.name || asset.model || 'Chưa có tên máy'}
                                                            </span>
                                                            <small>
                                                                {[asset.plantName, asset.brandName, asset.area]
                                                                    .filter(Boolean)
                                                                    .join(' / ') || 'Chưa rõ vị trí'}
                                                            </small>
                                                        </div>
                                                        <i
                                                            style={
                                                                { '--status-color': statusMeta.color } as CSSProperties
                                                            }
                                                        >
                                                            {statusMeta.label}
                                                        </i>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </aside>
                    ) : null}
                </section>
            </div>
        </div>
    );
};

export default MapPage;
