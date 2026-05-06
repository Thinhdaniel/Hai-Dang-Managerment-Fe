import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
dayjs.extend(quarterOfYear);
import {
  Card, Row, Col, Button, Select, Tabs, Table,
  Tag, Alert, Space, Progress, Skeleton,
  notification, DatePicker
} from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined,
  WarningOutlined, FormOutlined, SendOutlined,
  RiseOutlined, LeftOutlined, RightOutlined,
  ReloadOutlined, DownloadOutlined
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { materialReportService, inventoryService } from '../core/services/material.service';
import type { TopConsumedMaterial, SupplierReportRow, PriceComparisonReportRow, InventoryTransaction } from '../core/services/material.service';
import { useAuth } from '../core/contexts/AuthContext';
import { plantService } from '../core/services';
import PageHeader from '../components/shared/PageHeader';
import api from '../core/lib/api';

type FilterMode = 'month' | 'quarter' | 'year' | 'custom';

const COLORS = ['#1A3A5C','#1677FF','#52C41A','#FA8C16','#722ED1','#aaaaaa'];

const MaterialReportPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filterMode, setFilterMode] = useState<FilterMode>('month');
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);
  const [plantId, setPlantId] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  // Tính dateRange từ filterMode + anchor
  const dateRange: [Dayjs, Dayjs] = (() => {
    if (filterMode === 'custom') return customRange;
    if (filterMode === 'month')
      return [anchor.startOf('month'), anchor.endOf('month')];
    if (filterMode === 'quarter')
      return [anchor.startOf('quarter'), anchor.endOf('quarter')];
    return [anchor.startOf('year'), anchor.endOf('year')];
  })();

  // Label hiển thị kỳ hiện tại
  const periodLabel = (() => {
    if (filterMode === 'month') 
      return anchor.format('MM/YYYY');
    if (filterMode === 'quarter')
      return `Q${anchor.quarter()}/${anchor.year()}`;
    if (filterMode === 'year') 
      return anchor.format('YYYY');
    return `${dateRange[0].format('DD/MM')} - ${dateRange[1].format('DD/MM/YYYY')}`;
  })();

  // Điều hướng kỳ
  const handlePrev = () => {
    if (filterMode === 'month') 
      setAnchor(a => a.subtract(1, 'month'));
    else if (filterMode === 'quarter') 
      setAnchor(a => a.subtract(1, 'quarter'));
    else if (filterMode === 'year') 
      setAnchor(a => a.subtract(1, 'year'));
  };
  const handleNext = () => {
    if (filterMode === 'month') 
      setAnchor(a => a.add(1, 'month'));
    else if (filterMode === 'quarter') 
      setAnchor(a => a.add(1, 'quarter'));
    else if (filterMode === 'year') 
      setAnchor(a => a.add(1, 'year'));
  };

  // Query params chung
  const queryParams = {
    startDate: dateRange[0].toISOString(),
    endDate: dateRange[1].toISOString(),
    plantId: plantId !== 'all' ? plantId : undefined,
  };


  // Queries
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['report-summary', queryParams],
    queryFn: () => materialReportService.getSummary(queryParams),
    staleTime: 30_000,
  });

  const { data: costData, isLoading: loadingCost } = useQuery({
    queryKey: ['cost-by-period', queryParams],
    queryFn: () => materialReportService.getCostByPeriod({ ...queryParams }),
    staleTime: 30_000,
  });

  const { data: supplierData } = useQuery({
    queryKey: ['by-supplier', queryParams],
    queryFn: () => materialReportService.getBySupplier(queryParams),
    staleTime: 30_000,
  });

  const { data: topMaterials } = useQuery({
    queryKey: ['top-materials', queryParams],
    queryFn: () => materialReportService.getTopMaterials({ ...queryParams, limit: 20 }),
    staleTime: 30_000,
  });

  const { data: priceData } = useQuery({
    queryKey: ['price-comparison', queryParams],
    queryFn: () => materialReportService.getPriceComparison(queryParams),
    staleTime: 30_000,
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => inventoryService.getTransactions({ ...queryParams, type: 'export' }),
    staleTime: 30_000,
  });

  const { data: plants } = useQuery({
    queryKey: ['plants-list'],
    queryFn: () => plantService.getAll(),
    staleTime: 300_000,
  });

  // Export Excel
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const res = await api.get('/materials/reports/export-excel', {
        params: queryParams,
        responseType: 'blob',
        timeout: 30_000,
      });
      const blob = new Blob([res as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BaoCaoVatTu_${dateRange[0].format('DDMMYYYY')}_${dateRange[1].format('DDMMYYYY')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notification.success({ message: 'Xuất báo cáo thành công!' });
    } catch {
      notification.error({ message: 'Không thể xuất báo cáo', description: 'Vui lòng thử lại sau' });
    } finally {
      setExporting(false);
    }
  };


  // Filter bar
  const filterBar = (
    <Card size="small" style={{ marginBottom: 16, position: 'sticky', top: 0, zIndex: 10, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Space>
          {(['month','quarter','year','custom'] as FilterMode[]).map(m => (
            <Button
              key={m}
              size="small"
              type={filterMode === m ? 'primary' : 'default'}
              onClick={() => setFilterMode(m)}
              style={filterMode === m ? { background: '#1A3A5C', borderColor: '#1A3A5C' } : {}}
            >
              {{ month:'Tháng', quarter:'Quý', year:'Năm', custom:'Tùy chọn' }[m]}
            </Button>
          ))}
        </Space>

        {filterMode !== 'custom' ? (
          <Space>
            <Button icon={<LeftOutlined/>} size="small" onClick={handlePrev}/>
            <span style={{ fontWeight: 600, minWidth: 100, textAlign: 'center', color: '#1A3A5C' }}>
              {periodLabel}
            </span>
            <Button
              icon={<RightOutlined/>}
              size="small"
              onClick={handleNext}
              disabled={anchor.isAfter(dayjs(), filterMode === 'quarter' ? 'month' : filterMode)}
            />
          </Space>
        ) : (
          <DatePicker.RangePicker
            value={customRange}
            onChange={v => v && v[0] && v[1] && setCustomRange([v[0], v[1]])}
            format="DD/MM/YYYY"
            size="small"
          />
        )}

        <Space>
          <Select
            value={plantId}
            onChange={setPlantId}
            size="small"
            style={{ width: 160 }}
            options={[
              { value: 'all', label: 'Tất cả cơ sở' },
              ...(plants || []).map((p: any) => ({ value: p.id, label: p.name }))
            ]}
          />
          <Button icon={<ReloadOutlined/>} size="small" onClick={() => refetchSummary()}>
            Làm mới
          </Button>
          <Button
            icon={<DownloadOutlined/>}
            size="small"
            type="primary"
            loading={exporting}
            onClick={handleExportExcel}
            style={{ background: '#1A3A5C', borderColor: '#1A3A5C' }}
          >
            Xuất Excel
          </Button>
        </Space>
      </div>
    </Card>
  );


  // KPI Cards — use actual BE field names from /reports/summary
  const kpiConfig = [
    { title: 'Tổng chi phí vật tư', value: summary?.totalMonthlyCost, suffix: '₫', color: '#1A3A5C', icon: <DollarOutlined/> },
    { title: 'Tổng loại vật tư', value: summary?.totalMaterials, suffix: 'loại', color: '#1677FF', icon: <ShoppingCartOutlined/> },
    { title: 'Vật tư dưới ngưỡng', value: summary?.lowStockCount, suffix: 'loại', color: '#FA8C16', icon: <WarningOutlined/>, onClick: () => navigate('/materials/inventory?filter=lowstock') },
    { title: 'Phiếu đề xuất chờ duyệt', value: summary?.pendingRequestCount, suffix: 'phiếu', color: '#722ED1', icon: <FormOutlined/>, onClick: () => navigate('/materials/supply-requests?tab=pending') },
    { title: 'Phiếu cấp phát', value: undefined as number | undefined, suffix: 'phiếu', color: '#13C2C2', icon: <SendOutlined/>, onClick: () => navigate('/materials/distributions') },
    { title: 'Tiết kiệm chi phí', value: undefined as number | undefined, suffix: '₫', sub: 'So với giá đề xuất', color: '#52C41A', icon: <RiseOutlined/> },
  ];

  const kpiCards = (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {kpiConfig.map((k, i) => (
        <Col xs={24} sm={12} lg={8} key={i}>
          {loadingSummary ? (
            <Card style={{ borderRadius: 10 }}><Skeleton active paragraph={{ rows: 2 }}/></Card>
          ) : (
            <Card
              hoverable={!!k.onClick}
              onClick={k.onClick}
              style={{ borderRadius: 10, border: '1px solid #F0F0F0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: k.onClick ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>{k.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1.2 }}>
                    {(k.value ?? 0).toLocaleString('vi-VN')}
                    <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4, color: '#888' }}>{k.suffix}</span>
                  </div>
                  {(k as any).sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{(k as any).sub}</div>}
                </div>
                <div style={{ fontSize: 32, opacity: 0.1, color: k.color, marginLeft: 8 }}>{k.icon}</div>
              </div>
            </Card>
          )}
        </Col>
      ))}
    </Row>
  );


  // Supplier data with computed percentOfTotal
  const supplierDataWithPct = (() => {
    const list = (supplierData as SupplierReportRow[]) || [];
    const total = list.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
    return list.map(r => ({
      ...r,
      percentOfTotal: total > 0 ? (r.totalAmount ?? 0) / total * 100 : 0,
    }));
  })();
  const pieData = (() => {
    const list = supplierDataWithPct;
    const top5 = list.slice(0, 5);
    const rest = list.slice(5).reduce((s, i) => s + (i.totalAmount ?? 0), 0);
    const result = top5.map(s => ({ name: s.supplierName || 'Chưa xác định', value: s.totalAmount ?? 0 }));
    if (rest > 0) result.push({ name: 'Khác', value: rest });
    return result;
  })();

  // Bar chart data: BE returns { period: "2026-05", totalAmount: 9540000 }
  const barData = (costData || []).map((d: any) => ({
    label: d.period || '',
    actualCost: d.totalAmount ?? 0,
  }));

  const charts = (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={24} xl={14}>
        <Card title="Chi phí theo kỳ" style={{ borderRadius: 10 }}>
          {loadingCost ? (
            <Skeleton active paragraph={{ rows: 6 }}/>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false}/>
                <YAxis
                  tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v)}
                  tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false}
                />
                <RechartTooltip
                  formatter={(v: any, name: any) => [
                    `${Number(v).toLocaleString('vi-VN')} ₫`,
                    name === 'estimatedCost' ? 'Dự tính' : 'Thực tế'
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #F0F0F0', fontSize: 12 }}
                />
                <Legend formatter={v => v === 'estimatedCost' ? 'Dự tính' : 'Thực tế'}/>
                <Bar dataKey="estimatedCost" fill="#BAD7F2" radius={[3,3,0,0]} maxBarSize={40}/>
                <Bar dataKey="actualCost" fill="#1A3A5C" radius={[3,3,0,0]} maxBarSize={40}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
      <Col xs={24} xl={10}>
        <Card title="Cơ cấu chi phí theo NCC" style={{ borderRadius: 10 }}>
          {pieData.length === 0 ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
              Không có dữ liệu
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="45%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {pieData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]}/>
                  ))}
                </Pie>
                <RechartTooltip formatter={(v: any) => [`${Number(v).toLocaleString('vi-VN')} ₫`, 'Chi phí']}/>
                <Legend
                  layout="vertical" align="right" verticalAlign="middle" iconSize={10}
                  formatter={(value: string, entry: any) => (
                    <span style={{ fontSize: 11 }}>
                      {value}<br/>
                      <span style={{ color: '#888' }}>{Number(entry.payload.value).toLocaleString('vi-VN')} ₫</span>
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
    </Row>
  );


  // Table columns
  const topMaterialsColumns = [
    { title: 'STT', render: (_: any, __: any, i: number) => i + 1, width: 50 },
    {
      title: 'Tên vật tư', dataIndex: 'materialName',
      render: (v: string, r: TopConsumedMaterial) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{r.materialCode} {r.category ? `• ${r.category}` : ''}</div>
        </div>
      )
    },
    { title: 'ĐVT', dataIndex: 'unit', width: 70, align: 'center' as const },
    {
      title: 'SL xuất', dataIndex: 'totalQuantityOut', width: 90, align: 'center' as const,
      sorter: (a: TopConsumedMaterial, b: TopConsumedMaterial) => (a.totalQuantityOut ?? 0) - (b.totalQuantityOut ?? 0),
      render: (v: number) => v?.toLocaleString('vi-VN')
    },
    {
      title: 'Tồn cuối kỳ', dataIndex: 'currentStock', width: 110, align: 'center' as const,
      render: (v: number, r: TopConsumedMaterial) => (
        <span style={{ color: v < (r.minStockLevel ?? 0) ? '#FF4D4F' : '#52C41A', fontWeight: 600 }}>
          {v?.toLocaleString('vi-VN')}{v < (r.minStockLevel ?? 0) ? ' ⚠' : ''}
        </span>
      )
    },
    {
      title: 'Xu hướng', width: 90, align: 'center' as const,
      render: (_: any, r: TopConsumedMaterial) => {
        const ratio = (r.totalQuantityOut ?? 0) / Math.max(r.currentStock ?? 1, 1);
        if (ratio > 2) return <Tag color="red">🔴 Cao</Tag>;
        if (ratio > 1) return <Tag color="orange">🟡 TB</Tag>;
        return <Tag color="green">🟢 Thấp</Tag>;
      }
    },
  ];

  const supplierColumns = [
    { title: 'STT', render: (_: any, __: any, i: number) => i + 1, width: 50 },
    {
      title: 'Nhà cung cấp', dataIndex: 'supplierName',
      render: (v: string) => v || <span style={{ color: '#aaa' }}>Chưa xác định</span>
    },
    { title: 'Số đơn', dataIndex: 'orderCount', width: 80, align: 'center' as const },
    {
      title: 'Tổng tiền', dataIndex: 'totalAmount', width: 150, align: 'right' as const,
      sorter: (a: SupplierReportRow, b: SupplierReportRow) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1A3A5C' }}>{v?.toLocaleString('vi-VN')} ₫</span>
    },
    {
      title: '% Tổng chi phí', dataIndex: 'percentOfTotal', width: 160,
      render: (v: number) => (
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>{v?.toFixed(1)}%</div>
          <Progress percent={v} showInfo={false} strokeColor="#1A3A5C" trailColor="#F0F0F0" size="small"/>
        </div>
      )
    },
  ];

  const priceColumns = [
    { title: 'STT', render: (_: any, __: any, i: number) => i + 1, width: 50 },
    { title: 'Tên vật tư', dataIndex: 'materialName' },
    { title: 'ĐVT', dataIndex: 'unit', width: 70, align: 'center' as const },
    {
      title: 'Giá đề xuất TB', dataIndex: 'estimatedTotal', width: 140, align: 'right' as const,
      render: (v: number) => v ? `${v.toLocaleString('vi-VN')} ₫` : '-'
    },
    {
      title: 'Giá thực tế TB', dataIndex: 'actualTotal', width: 140, align: 'right' as const,
      render: (v: number) => v ? `${v.toLocaleString('vi-VN')} ₫` : '-'
    },
    {
      title: 'Chênh lệch', width: 150, align: 'right' as const,
      render: (_: any, r: PriceComparisonReportRow) => {
        const diff = (r.estimatedTotal ?? 0) - (r.actualTotal ?? 0);
        const isGood = diff >= 0;
        return (
          <span style={{ color: isGood ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}>
            {isGood ? '▼ ' : '▲ '}{Math.abs(diff).toLocaleString('vi-VN')} ₫
          </span>
        );
      }
    },
    {
      title: '% Chênh', width: 100, align: 'center' as const,
      render: (_: any, r: PriceComparisonReportRow) => {
        const est = r.estimatedTotal ?? 0;
        const act = r.actualTotal ?? 0;
        const pct = est > 0 ? ((est - act) / est * 100) : 0;
        return <Tag color={pct >= 0 ? 'success' : 'error'}>{pct >= 0 ? '↓' : '↑'} {Math.abs(pct).toFixed(1)}%</Tag>;
      }
    },
  ];

  const txColumns = [
    {
      title: 'Ngày', dataIndex: 'createdAt', width: 130,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Loại', dataIndex: 'type', width: 90,
      render: (v: string) => {
        const map: Record<string, { color: string; label: string }> = {
          import: { color: 'green', label: 'Nhập' },
          export: { color: 'blue', label: 'Xuất' },
          adjust: { color: 'orange', label: 'Điều chỉnh' },
        };
        const cfg = map[v] || { color: 'default', label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      }
    },
    {
      title: 'Tên vật tư', key: 'materialName',
      render: (_: any, r: InventoryTransaction) => r.material?.name || r.materialId
    },
    {
      title: 'Số lượng', dataIndex: 'quantity', width: 90, align: 'right' as const,
      render: (v: number, r: InventoryTransaction) => (
        <span style={{ color: r.type === 'export' ? '#FF4D4F' : '#52C41A', fontWeight: 600 }}>
          {r.type === 'export' ? '-' : '+'}{Math.abs(v).toLocaleString('vi-VN')}
        </span>
      )
    },
    { title: 'Tồn trước', dataIndex: 'stockBefore', width: 90, align: 'right' as const, render: (v: number) => v?.toLocaleString('vi-VN') ?? '-' },
    { title: 'Tồn sau', dataIndex: 'stockAfter', width: 90, align: 'right' as const, render: (v: number) => v?.toLocaleString('vi-VN') ?? '-' },
    { title: 'Liên quan', dataIndex: 'relatedType', width: 110, render: (v: string) => v || '-' },
    {
      title: 'Người thực hiện', key: 'performedBy', width: 140,
      render: (_: any, r: InventoryTransaction) => (typeof r.performedBy === 'object' && r.performedBy !== null ? (r.performedBy as any).name : r.performedBy) || '-'
    },
  ];


  // Alerts — use actual BE summary fields
  const alerts = [
    (summary?.lowStockCount ?? 0) > 0 && {
      type: 'warning' as const,
      message: `${summary!.lowStockCount} loại vật tư dưới ngưỡng tối thiểu`,
      action: 'Xem tồn kho',
      onClick: () => navigate('/materials/inventory?filter=lowstock'),
    },
    (summary?.pendingRequestCount ?? 0) > 0 && {
      type: 'warning' as const,
      message: `${summary!.pendingRequestCount} phiếu đề xuất đang chờ duyệt`,
      action: 'Duyệt ngay',
      onClick: () => navigate('/materials/supply-requests?tab=pending'),
    },
  ].filter(Boolean) as Array<{ type: 'error'|'warning'|'info'; message: string; action: string; onClick: () => void }>;

  // Transactions data
  const txData = (() => {
    const raw = transactions as any;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
  })();

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        title="Báo cáo vật tư"
        subtitle="Tổng hợp chi phí, tiêu thụ và hiệu quả mua sắm vật tư theo thời gian và cơ sở."
      />

      {filterBar}
      {kpiCards}
      {charts}

      {alerts.length > 0 && (
        <Card
          title="⚠ Cảnh báo & Cần xử lý"
          style={{ borderColor: '#FA8C16', borderRadius: 10, marginBottom: 16 }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {alerts.map((alert, i) => (
              <Alert
                key={i}
                type={alert.type}
                message={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{alert.message}</span>
                    <Button type="link" size="small" onClick={alert.onClick}>{alert.action} →</Button>
                  </div>
                }
                showIcon={false}
                style={{ borderRadius: 6 }}
              />
            ))}
          </Space>
        </Card>
      )}

      <Card style={{ borderRadius: 10 }}>
        <Tabs
          defaultActiveKey="top-materials"
          items={[
            {
              key: 'top-materials',
              label: '📊 Top vật tư tiêu thụ',
              children: (
                <Table
                  rowKey={(r: TopConsumedMaterial) => r.materialId || r.materialName}
                  columns={topMaterialsColumns}
                  dataSource={topMaterials || []}
                  pagination={false}
                  size="small"
                  scroll={{ x: 700 }}
                />
              )
            },
            {
              key: 'by-supplier',
              label: '🏪 Chi phí theo NCC',
              children: (
                <Table
                  rowKey={(r: SupplierReportRow) => r.supplierId || r.supplierName}
                  columns={supplierColumns}
                  dataSource={supplierDataWithPct}
                  pagination={false}
                  size="small"
                  scroll={{ x: 600 }}
                />
              )
            },
            {
              key: 'price-comparison',
              label: '💰 So sánh giá',
              children: (
                <Table
                  rowKey={(r: PriceComparisonReportRow) => r.orderId}
                  columns={priceColumns}
                  dataSource={priceData || []}
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                />
              )
            },
            {
              key: 'transactions',
              label: '📋 Lịch sử nhập xuất',
              children: (
                <Table
                  rowKey={(r: InventoryTransaction) => r.id}
                  columns={txColumns}
                  dataSource={txData}
                  pagination={{ pageSize: 20 }}
                  size="small"
                  scroll={{ x: 900 }}
                />
              )
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default MaterialReportPage;
