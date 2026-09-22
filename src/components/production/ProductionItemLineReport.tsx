import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Empty, Progress, Select, Table, Tag, Tooltip, type TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type {
    ProductionItemLine,
    ProductionItemLineDay,
    ProductionItemLineOrder,
    ProductionItemLineStatus,
} from '../../core/types/production';
import '../../styles/production-item-line-report.css';

const number = (value: number | null | undefined) =>
    value == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const statuses: Record<ProductionItemLineStatus, { label: string; color: string }> = {
    needs_review: { label: 'Cần đối chiếu', color: 'purple' },
    missing_reports: { label: 'Thiếu báo', color: 'gold' },
    behind: { label: 'Chậm kế hoạch', color: 'red' },
    ahead: { label: 'Vượt tiến độ', color: 'green' },
    on_track: { label: 'Đúng tiến độ', color: 'green' },
    not_due: { label: 'Chưa đến hạn báo', color: 'default' },
    no_plan: { label: 'Chưa có kế hoạch', color: 'default' },
};
const Status = ({ value }: { value: ProductionItemLineStatus }) => (
    <Tag color={statuses[value].color}>{statuses[value].label}</Tag>
);
const Stat = ({ label, value }: { label: string; value: number | null }) => (
    <div className='pil-stat'>
        <span>{label}</span>
        <strong>{number(value)}</strong>
    </div>
);
const PlanDelta = ({ row }: { row: ProductionItemLine | ProductionItemLineOrder }) => (
    <div className='pil-plan'>
        <Status value={row.status} />
        {row.deltaQuantity !== null && (
            <strong className={row.deltaQuantity < 0 ? 'pil-negative' : 'pil-positive'}>
                {row.deltaQuantity > 0 ? '+' : ''}
                {number(row.deltaQuantity)} SP
            </strong>
        )}
        <span>
            {number(row.planActualQuantity)} / {number(row.plannedToDateQuantity)} KH đến hạn
        </span>
    </div>
);
const SlotList = ({ day }: { day: ProductionItemLineDay }) => (
    <div className='pil-slots'>
        {day.slots.length ? (
            day.slots.map((slot) => (
                <div className='pil-slot' key={slot.slotKey}>
                    <strong>{slot.label}</strong>
                    <span>
                        {slot.reported ? number(slot.quantity) + ' SP' : slot.due ? 'Chưa báo' : 'Chưa đến giờ'}
                    </span>
                    <span>Khoán {number(slot.target)}</span>
                    {slot.note && <p>{slot.note}</p>}
                </div>
            ))
        ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lượt nhập' />
        )}
    </div>
);

const OrderDetail = ({ order, mobile }: { order: ProductionItemLineOrder; mobile: boolean }) => {
    const columns: TableColumnsType<ProductionItemLineDay> = [
        { title: 'Ngày', dataIndex: 'productionDate', render: (value) => dayjs(value).format('DD/MM/YYYY') },
        { title: 'Đã báo', dataIndex: 'quantity', align: 'right', render: number },
        { title: 'Khoán', dataIndex: 'targetQuantity', align: 'right', render: number },
        { title: 'KH xếp ngày', dataIndex: 'plannedQuantity', align: 'right', render: number },
        { title: 'Trong đó làm bù', dataIndex: 'carryQuantity', align: 'right', render: number },
    ];
    return (
        <section className='pil-order-detail'>
            <header>
                <div>
                    <h3>{order.orderCode || 'Chưa gắn đơn hàng'}</h3>
                    {order.dueDate && <span>Hạn hoàn thành {dayjs(order.dueDate).format('DD/MM/YYYY')}</span>}
                </div>
                <Status value={order.status} />
            </header>
            <div className='pil-detail-stats'>
                <Stat label='Tổng giao' value={order.assignedQuantity} />
                <Stat label='Trước kỳ' value={order.openingQuantity} />
                <Stat label='Trong kỳ' value={order.periodQuantity} />
                <Stat label='Lũy kế đã báo' value={order.cumulativeQuantity} />
                <Stat label='Còn phải làm' value={order.remainingQuantity} />
                <Stat label='Vượt phần giao' value={order.overQuantity} />
            </div>
            <div className='pil-detail-plan'>
                <PlanDelta row={order} />
                {order.completionPercent !== null && (
                    <div className='pil-completion'>
                        <span>Hoàn thành phần giao</span>
                        <Progress
                            percent={Math.min(100, order.completionPercent)}
                            format={() => number(order.completionPercent) + '%'}
                            strokeColor='#16856b'
                        />
                    </div>
                )}
            </div>
            {order.unlinkedQuantity > 0 && (
                <Alert
                    type='warning'
                    showIcon
                    message={number(order.unlinkedQuantity) + ' SP chưa liên kết kế hoạch ngày'}
                    description='Sản này vẫn nằm trong lũy kế; chưa được tính là sản hoàn thành kế hoạch ngày đã phát hành.'
                />
            )}
            {order.missingReports > 0 && (
                <Alert
                    type='warning'
                    showIcon
                    message={number(order.missingReports) + ' khung giờ đến hạn chưa có báo cáo'}
                />
            )}
            {mobile ? (
                <div className='pil-days'>
                    {order.days.map((day) => (
                        <details key={day.productionDate}>
                            <summary>
                                <span>{dayjs(day.productionDate).format('DD/MM/YYYY')}</span>
                                <strong>{number(day.quantity)} SP</strong>
                            </summary>
                            <div className='pil-day-totals'>
                                <span>Khoán: {number(day.targetQuantity)}</span>
                                <span>KH: {number(day.plannedQuantity)}</span>
                                <span>Làm bù: {number(day.carryQuantity)}</span>
                            </div>
                            <SlotList day={day} />
                        </details>
                    ))}
                </div>
            ) : (
                <Table
                    rowKey='productionDate'
                    size='small'
                    columns={columns}
                    dataSource={order.days}
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    expandable={{ expandedRowRender: (day) => <SlotList day={day} /> }}
                />
            )}
        </section>
    );
};

export default function ProductionItemLineReport({
    rows,
    mobile,
    generatedAt,
}: {
    rows: ProductionItemLine[];
    mobile: boolean;
    generatedAt: string;
}) {
    const [itemId, setItemId] = useState<string>();
    const [lineId, setLineId] = useState<string>();
    const [status, setStatus] = useState<ProductionItemLineStatus>();
    const [orderKey, setOrderKey] = useState<string>();
    const [selectedKey, setSelectedKey] = useState<string>();
    const selected = rows.find((row) => row.key === selectedKey);
    const options = (field: 'itemId' | 'lineId', label: 'itemCode' | 'lineCode') => [
        ...new Map(rows.map((row) => [row[field], { value: row[field], label: row[label] }])).values(),
    ];
    const filtered = useMemo(
        () =>
            rows.filter(
                (row) =>
                    (!itemId || row.itemId === itemId) &&
                    (!lineId || row.lineId === lineId) &&
                    (!status || row.status === status)
            ),
        [rows, itemId, lineId, status]
    );
    const groups = useMemo(
        () =>
            [...new Set(filtered.map((row) => row.itemId))].map((id) => ({
                id,
                rows: filtered.filter((row) => row.itemId === id),
            })),
        [filtered]
    );
    const open = (row: ProductionItemLine) => {
        setSelectedKey(row.key);
        setOrderKey(undefined);
    };
    const columns: TableColumnsType<ProductionItemLine> = [
        {
            title: 'Tổ / chuyền',
            key: 'line',
            fixed: 'left',
            width: 140,
            render: (_, row) => (
                <Button type='link' onClick={() => open(row)} className='pil-line-button'>
                    {row.lineCode}
                </Button>
            ),
        },
        { title: 'Trước kỳ', dataIndex: 'openingQuantity', align: 'right', width: 105, render: number },
        { title: 'Trong kỳ', dataIndex: 'periodQuantity', align: 'right', width: 105, render: number },
        {
            title: 'Lũy kế đã báo',
            dataIndex: 'cumulativeQuantity',
            align: 'right',
            width: 130,
            render: (value) => <strong className='pil-output'>{number(value)}</strong>,
        },
        { title: 'Tổng giao', dataIndex: 'assignedQuantity', align: 'right', width: 105, render: number },
        { title: 'Còn phải làm', dataIndex: 'remainingQuantity', align: 'right', width: 120, render: number },
        { title: 'Tiến độ kế hoạch ngày', key: 'plan', width: 210, render: (_, row) => <PlanDelta row={row} /> },
        {
            title: 'Hoàn thành phần giao',
            key: 'completion',
            width: 160,
            render: (_, row) =>
                row.completionPercent !== null ? (
                    <Progress
                        percent={Math.min(100, row.completionPercent)}
                        format={() => number(row.completionPercent) + '%'}
                        size='small'
                        strokeColor='#16856b'
                    />
                ) : (
                    <Tooltip
                        title={
                            row.unassignedQuantity > 0
                                ? 'Có sản lượng chưa xác định phần giao'
                                : 'Chưa phân giao tổng số lượng'
                        }
                    >
                        —
                    </Tooltip>
                ),
        },
        {
            title: '',
            key: 'open',
            width: 45,
            render: (_, row) => (
                <Tooltip title='Chi tiết ngày và giờ'>
                    <Button
                        icon={<RightOutlined />}
                        aria-label={'Chi tiết ' + row.lineCode}
                        onClick={() => open(row)}
                    />
                </Tooltip>
            ),
        },
    ];
    return (
        <div className='pil-report'>
            <div className='pil-toolbar'>
                <Select
                    aria-label='Lọc mã hàng'
                    placeholder='Tất cả mã hàng'
                    allowClear
                    showSearch
                    optionFilterProp='label'
                    value={itemId}
                    onChange={setItemId}
                    options={options('itemId', 'itemCode')}
                />
                <Select
                    aria-label='Lọc tổ'
                    placeholder='Tất cả tổ'
                    allowClear
                    showSearch
                    optionFilterProp='label'
                    value={lineId}
                    onChange={setLineId}
                    options={options('lineId', 'lineCode')}
                />
                <Select
                    aria-label='Lọc tiến độ'
                    placeholder='Tất cả tiến độ'
                    allowClear
                    value={status}
                    onChange={setStatus}
                    options={Object.entries(statuses).map(([value, meta]) => ({ value, label: meta.label }))}
                />
                <span className='pil-updated'>Cập nhật {dayjs(generatedAt).format('DD/MM HH:mm')}</span>
            </div>
            {!groups.length && <Empty description='Không có dữ liệu phù hợp' />}
            {groups.map((group) => (
                <section className='pil-item' key={group.id}>
                    <header className='pil-item-heading'>
                        <div>
                            <h3>Mã {group.rows[0].itemCode}</h3>
                            <span>{group.rows[0].itemName || group.rows.length + ' tổ / chuyền'}</span>
                        </div>
                        <div className='pil-item-totals'>
                            <Stat
                                label='Trong kỳ · các tổ đang xem'
                                value={group.rows.reduce((n, row) => n + row.periodQuantity, 0)}
                            />
                            <Stat
                                label='Lũy kế · các tổ đang xem'
                                value={group.rows.reduce((n, row) => n + row.cumulativeQuantity, 0)}
                            />
                        </div>
                    </header>
                    {mobile ? (
                        <div className='pil-mobile-lines'>
                            {group.rows.map((row) => (
                                <article key={row.key} className='pil-mobile-line'>
                                    <header>
                                        <h4>{row.lineCode}</h4>
                                        <Status value={row.status} />
                                    </header>
                                    <div className='pil-mobile-stats'>
                                        <Stat label='Lũy kế đã báo' value={row.cumulativeQuantity} />
                                        <Stat label='Tổng giao' value={row.assignedQuantity} />
                                        <Stat label='Trước kỳ' value={row.openingQuantity} />
                                        <Stat label='Trong kỳ' value={row.periodQuantity} />
                                        <Stat label='Còn phải làm' value={row.remainingQuantity} />
                                        <Stat label='KH đến hạn' value={row.plannedToDateQuantity} />
                                    </div>
                                    <div className='pil-mobile-footer'>
                                        <span
                                            className={
                                                row.deltaQuantity !== null && row.deltaQuantity < 0
                                                    ? 'pil-negative'
                                                    : ''
                                            }
                                        >
                                            Chênh tiến độ:{' '}
                                            {row.deltaQuantity !== null && row.deltaQuantity > 0 ? '+' : ''}
                                            {number(row.deltaQuantity)}
                                        </span>
                                        <Button icon={<RightOutlined />} onClick={() => open(row)}>
                                            Chi tiết
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <Table
                            rowKey='key'
                            size='middle'
                            dataSource={group.rows}
                            columns={columns}
                            pagination={group.rows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
                            scroll={{ x: 1120 }}
                        />
                    )}
                </section>
            ))}
            <Drawer
                title={selected ? 'Mã ' + selected.itemCode + ' · ' + selected.lineCode : 'Chi tiết theo tổ'}
                open={Boolean(selected)}
                onClose={() => setSelectedKey(undefined)}
                width={mobile ? '100%' : 880}
                className='pil-drawer'
            >
                {selected && (
                    <>
                        {selected.orders.length > 1 && (
                            <Select
                                aria-label='Lọc đơn hàng'
                                className='pil-order-select'
                                placeholder='Tất cả đơn hàng'
                                allowClear
                                value={orderKey}
                                onChange={setOrderKey}
                                options={selected.orders.map((order) => ({
                                    value: order.key,
                                    label: order.orderCode || 'Chưa gắn đơn hàng',
                                }))}
                            />
                        )}
                        {selected.orders
                            .filter((order) => !orderKey || order.key === orderKey)
                            .map((order) => (
                                <OrderDetail key={order.key} order={order} mobile={mobile} />
                            ))}
                    </>
                )}
            </Drawer>
        </div>
    );
}
