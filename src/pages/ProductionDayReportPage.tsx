import {
    ArrowLeftOutlined,
    FileExcelOutlined,
    PrinterOutlined,
    ReloadOutlined,
    WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Empty, Grid, Skeleton, Table, Tag, Typography, type TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { Fragment, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { slotRangeLabel, slotRangeLabelShort } from '../core/lib/productionSlot';
import { productionService } from '../core/services/production.service';
import type {
    HourlyProductionEntry,
    ProductionLineRecord,
    ProductionMonitorAlert,
    ProductionTimeSlot,
} from '../core/types/production';

const { Text, Title } = Typography;

const number = (value = 0, digits = 0) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value || 0));
const money = (value = 0) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value || 0)))} đ`;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải báo cáo ngày');
const percentTone = (value: number) => (value >= 95 ? 'success' : value >= 80 ? 'warning' : 'danger');

const statusMeta = {
    draft: { label: 'Đang nhập', color: 'blue' },
    submitted: { label: 'Chờ duyệt', color: 'gold' },
    locked: { label: 'Đã khóa sổ', color: 'green' },
} as const;

const percentOf = (actual: number, target: number) => (target > 0 ? (actual / target) * 100 : 0);

const ProductionDayReportPage = () => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const navigate = useNavigate();
    const { date = '' } = useParams();
    const [searchParams] = useSearchParams();
    const { message } = App.useApp();
    const { user } = useAuth();
    const plantId = searchParams.get('plantId') || user?.plantId || '';

    const query = useQuery({
        queryKey: ['production', 'monitor', plantId, date],
        queryFn: () => productionService.getMonitor(plantId, date),
        enabled: Boolean(plantId && date),
    });

    const day = query.data?.day;
    const monitor = query.data?.monitor;
    const financialsVisible = day?.financialsVisible !== false;
    const activeSlots = useMemo(() => (day?.timeSlots || []).filter((slot) => slot.isActive), [day?.timeSlots]);

    const exportMutation = useMutation({
        mutationFn: () => productionService.exportDay(day!.id),
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-san-luong-${date}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        },
        onError: (error) => message.error(errorMessage(error)),
    });

    // Ghi chú tổ trưởng nằm rải trong entries — gom lại một chỗ vì đây là nơi
    // duy nhất giải thích vì sao hụt, mà bình thường không ai mở từng ô để đọc.
    const notes = useMemo(() => {
        if (!day) return [];
        const slotByKey = new Map(day.timeSlots.map((slot) => [slot.key, slot]));
        const rows: Array<{ id: string; lineCode: string; slot?: ProductionTimeSlot; entry: HourlyProductionEntry }> =
            [];
        day.lines.forEach((line) => {
            line.entries.forEach((entry) => {
                if (!String(entry.note || '').trim()) return;
                rows.push({ id: entry.id, lineCode: line.lineCode, slot: slotByKey.get(entry.slotKey), entry });
            });
        });
        return rows;
    }, [day]);

    const lineColumns = useMemo<TableColumnsType<ProductionLineRecord>>(
        () => [
            {
                title: 'Chuyền',
                key: 'line',
                width: 170,
                fixed: 'left',
                render: (_, line) => (
                    <div className='production-report-identity'>
                        <strong>{line.lineCode}</strong>
                        <span>{line.leaderName || line.lineName || 'Chưa có tổ trưởng'}</span>
                    </div>
                ),
            },
            {
                title: 'Mã hàng',
                key: 'items',
                width: 150,
                render: (_, line) =>
                    line.runs.length ? (
                        <span>{[...new Set(line.runs.map((run) => run.itemCode))].join(', ')}</span>
                    ) : (
                        <Text type='secondary'>Chưa thiết lập</Text>
                    ),
            },
            { title: 'CN', dataIndex: 'workerCount', width: 70, align: 'right', render: (value) => number(value) },
            {
                title: 'Khoán',
                dataIndex: 'totalTarget',
                width: 100,
                align: 'right',
                render: (value) => `${number(value)} SP`,
            },
            {
                title: 'Thực tế',
                dataIndex: 'totalActual',
                width: 105,
                align: 'right',
                sorter: (left, right) => left.totalActual - right.totalActual,
                render: (value) => <strong>{number(value)} SP</strong>,
            },
            {
                title: '% đạt',
                dataIndex: 'achievementPercent',
                width: 95,
                align: 'right',
                sorter: (left, right) => left.achievementPercent - right.achievementPercent,
                render: (value: number) => (
                    <strong className={`production-day-report-tone tone-${percentTone(value)}`}>
                        {number(value, 1)}%
                    </strong>
                ),
            },
            ...(financialsVisible
                ? [
                      {
                          title: 'Giá trị',
                          dataIndex: 'totalAmount',
                          width: 130,
                          align: 'right' as const,
                          render: (value: number) => money(value),
                      },
                      {
                          title: 'TN BQ/người',
                          dataIndex: 'averageIncome',
                          width: 130,
                          align: 'right' as const,
                          render: (value: number) => money(value),
                      },
                  ]
                : []),
        ],
        [financialsVisible]
    );

    const itemRows = useMemo(() => {
        if (!day) return [];
        const byItem = new Map<
            string,
            { itemCode: string; itemName?: string; unit: string; quantity: number; amount: number; lines: Set<string> }
        >();
        day.lines.forEach((line) => {
            const runById = new Map(line.runs.map((run) => [run.id, run]));
            line.entries.forEach((entry) => {
                const run = runById.get(entry.runId);
                if (!run) return;
                const current = byItem.get(run.itemCode) || {
                    itemCode: run.itemCode,
                    itemName: run.itemName,
                    unit: run.unit || 'SP',
                    quantity: 0,
                    amount: 0,
                    lines: new Set<string>(),
                };
                current.quantity += Number(entry.quantity || 0);
                current.amount += Number(entry.amount || 0);
                current.lines.add(line.lineCode);
                byItem.set(run.itemCode, current);
            });
        });
        return [...byItem.values()].sort((left, right) => right.quantity - left.quantity);
    }, [day]);

    const slotTotals = useMemo(
        () =>
            activeSlots.map((slot) => {
                const actual = (day?.lines || []).reduce(
                    (sum, line) =>
                        sum +
                        line.entries
                            .filter((entry) => entry.slotKey === slot.key)
                            .reduce((acc, entry) => acc + Number(entry.quantity || 0), 0),
                    0
                );
                const target = (day?.lines || []).reduce(
                    (sum, line) => sum + Number(line.slotValues.find((v) => v.key === slot.key)?.target || 0),
                    0
                );
                return { slot, actual, target };
            }),
        [activeSlots, day?.lines]
    );

    if (!plantId || !date) {
        return (
            <div className='production-page'>
                <Alert type='warning' showIcon message='Thiếu thông tin cơ sở hoặc ngày báo cáo' />
            </div>
        );
    }

    const summary = day?.summary;
    const status = day ? statusMeta[day.status] : undefined;

    return (
        <div className='production-page production-day-report'>
            <section className='production-day-report__bar'>
                <div className='production-day-report__back'>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/reports')}>
                        Báo cáo
                    </Button>
                    <div>
                        <Title level={3}>Báo cáo sản lượng ngày {dayjs(date).format('DD/MM/YYYY')}</Title>
                        <Text type='secondary'>
                            {day?.plantName || 'Cơ sở'}
                            {status ? ' · ' : ''}
                            {status ? <Tag color={status.color}>{status.label}</Tag> : null}
                        </Text>
                    </div>
                </div>
                <div className='production-day-report__actions'>
                    <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => query.refetch()}>
                        Tải lại
                    </Button>
                    <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
                        In
                    </Button>
                    <Button
                        type='primary'
                        icon={<FileExcelOutlined />}
                        disabled={!day}
                        loading={exportMutation.isPending}
                        onClick={() => exportMutation.mutate()}
                    >
                        Xuất Excel
                    </Button>
                </div>
            </section>

            {query.isLoading ? (
                <section className='production-day-report__card'>
                    <Skeleton active paragraph={{ rows: 10 }} />
                </section>
            ) : query.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được báo cáo ngày'
                    description={errorMessage(query.error)}
                    action={<Button onClick={() => query.refetch()}>Thử lại</Button>}
                />
            ) : !day || !summary ? (
                <section className='production-day-report__card'>
                    <Empty description={`Ngày ${dayjs(date).format('DD/MM/YYYY')} chưa có sổ sản xuất`} />
                </section>
            ) : (
                <>
                    {day.status !== 'locked' ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Số liệu chưa khóa sổ'
                            description='Ngày này vẫn có thể được sửa. Chỉ dùng làm số chính thức sau khi đã khóa sổ.'
                        />
                    ) : null}

                    <section className='production-day-report__kpis'>
                        <div className='is-primary'>
                            <span>Sản lượng thực tế</span>
                            <strong>{number(summary.totalActual)} SP</strong>
                            <small>/ {number(summary.totalTarget)} SP khoán</small>
                        </div>
                        <div>
                            <span>Mức đạt</span>
                            <strong className={`production-day-report-tone tone-${percentTone(summary.achievementPercent)}`}>
                                {number(summary.achievementPercent, 1)}%
                            </strong>
                            <small>
                                {summary.totalActual >= summary.totalTarget ? 'Vượt ' : 'Hụt '}
                                {number(Math.abs(summary.totalActual - summary.totalTarget))} SP
                            </small>
                        </div>
                        <div>
                            <span>Nhân sự</span>
                            <strong>{number(summary.totalWorkers)}</strong>
                            <small>
                                {number(summary.configuredLineCount)}/{number(summary.lineCount)} chuyền hoạt động
                            </small>
                        </div>
                        <div>
                            <span>Số mã hàng</span>
                            <strong>{number(summary.itemCount)}</strong>
                            <small>chạy trong ngày</small>
                        </div>
                        {financialsVisible ? (
                            <>
                                <div>
                                    <span>Giá trị sản lượng</span>
                                    <strong>{money(summary.totalAmount)}</strong>
                                    <small>theo đơn giá đã chốt</small>
                                </div>
                                <div>
                                    <span>Thu nhập BQ/người</span>
                                    <strong>{money(summary.averageIncome)}</strong>
                                    <small>tạm tính cả ngày</small>
                                </div>
                            </>
                        ) : null}
                    </section>

                    <section className='production-day-report__card'>
                        <div className='production-day-report__heading'>
                            <Title level={4}>Kết quả theo chuyền</Title>
                            <Text type='secondary'>{day.lines.length} chuyền trong sổ</Text>
                        </div>
                        <Table
                            rowKey='lineId'
                            columns={lineColumns}
                            dataSource={day.lines}
                            pagination={false}
                            size='middle'
                            scroll={{ x: 940 }}
                            summary={() => (
                                <Table.Summary.Row className='production-day-report__total-row'>
                                    <Table.Summary.Cell index={0}>
                                        <strong>TỔNG</strong>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={1}>{number(summary.itemCount)} mã</Table.Summary.Cell>
                                    <Table.Summary.Cell index={2} align='right'>
                                        {number(summary.totalWorkers)}
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={3} align='right'>
                                        {number(summary.totalTarget)} SP
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={4} align='right'>
                                        <strong>{number(summary.totalActual)} SP</strong>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={5} align='right'>
                                        <strong>{number(summary.achievementPercent, 1)}%</strong>
                                    </Table.Summary.Cell>
                                    {financialsVisible ? (
                                        <>
                                            <Table.Summary.Cell index={6} align='right'>
                                                {money(summary.totalAmount)}
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={7} align='right'>
                                                {money(summary.averageIncome)}
                                            </Table.Summary.Cell>
                                        </>
                                    ) : null}
                                </Table.Summary.Row>
                            )}
                        />
                    </section>

                    <section className='production-day-report__card'>
                        <div className='production-day-report__heading'>
                            <Title level={4}>Sổ khoán theo giờ</Title>
                            <Text type='secondary'>Khoán · Thực tế · Tỉ lệ từng khung giờ</Text>
                        </div>
                        <div className='production-board-ledger-wrap'>
                            <table className='production-board-ledger'>
                                <thead>
                                    <tr>
                                        <th className='lg-line'>Chuyền</th>
                                        <th className='lg-kind' aria-label='Chỉ tiêu' />
                                        {activeSlots.map((slot) => (
                                            <th key={slot.key}>{slotRangeLabelShort(slot)}</th>
                                        ))}
                                        <th className='lg-total'>Tổng</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {day.lines.map((line) => {
                                        const dayPercent = percentOf(line.totalActual, line.totalTarget);
                                        return (
                                            <Fragment key={line.lineId}>
                                                <tr className='lg-row-quota'>
                                                    <th rowSpan={3} className='lg-line'>
                                                        {/* Trang đọc: không dựng nút giả trông bấm được mà không làm gì */}
                                                        <span className='lg-line-static'>
                                                            <b>{line.lineCode}</b>
                                                            <small>{line.leaderName || '—'}</small>
                                                        </span>
                                                    </th>
                                                    <th className='lg-kind'>Khoán</th>
                                                    {activeSlots.map((slot) => {
                                                        const value = line.slotValues.find((v) => v.key === slot.key);
                                                        return (
                                                            <td key={slot.key}>
                                                                {value?.runId ? number(value.target) : ''}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className='lg-total'>{number(line.totalTarget)}</td>
                                                </tr>
                                                <tr className='lg-row-actual'>
                                                    <th className='lg-kind'>Thực tế</th>
                                                    {activeSlots.map((slot) => {
                                                        const value = line.slotValues.find((v) => v.key === slot.key);
                                                        const missing = Boolean(value?.runId) && !value?.reported;
                                                        return (
                                                            <td key={slot.key} className={missing ? 'is-missing' : ''}>
                                                                {value?.reported ? (
                                                                    number(value.actual)
                                                                ) : missing ? (
                                                                    <span className='lg-missing-dot' />
                                                                ) : (
                                                                    ''
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className='lg-total'>{number(line.totalActual)}</td>
                                                </tr>
                                                <tr className='lg-row-rate'>
                                                    <th className='lg-kind'>Tỉ lệ</th>
                                                    {activeSlots.map((slot) => {
                                                        const value = line.slotValues.find((v) => v.key === slot.key);
                                                        const percent =
                                                            value?.reported && value.target > 0
                                                                ? percentOf(value.actual, value.target)
                                                                : null;
                                                        return (
                                                            <td
                                                                key={slot.key}
                                                                className={
                                                                    percent === null
                                                                        ? ''
                                                                        : `has-bar is-${percentTone(percent) === 'success' ? 'ok' : percentTone(percent) === 'warning' ? 'warn' : 'danger'}`
                                                                }
                                                                style={
                                                                    percent === null
                                                                        ? undefined
                                                                        : ({
                                                                              '--lg-rate': Math.min(1, percent / 100),
                                                                          } as React.CSSProperties)
                                                                }
                                                            >
                                                                {percent === null ? '' : `${Math.round(percent)}%`}
                                                            </td>
                                                        );
                                                    })}
                                                    <td
                                                        className={`lg-total is-${percentTone(dayPercent) === 'success' ? 'ok' : percentTone(dayPercent) === 'warning' ? 'warn' : 'danger'}`}
                                                    >
                                                        {number(dayPercent, 0)}%
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                    <tr className='lg-row-actual production-day-report__slot-total'>
                                        <th className='lg-line'>
                                            <b>TOÀN XƯỞNG</b>
                                        </th>
                                        <th className='lg-kind'>Thực tế</th>
                                        {slotTotals.map(({ slot, actual }) => (
                                            <td key={slot.key}>{number(actual)}</td>
                                        ))}
                                        <td className='lg-total'>{number(summary.totalActual)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className='production-day-report__split'>
                        <section className='production-day-report__card'>
                            <div className='production-day-report__heading'>
                                <Title level={4}>Theo mã hàng</Title>
                                <Text type='secondary'>{itemRows.length} mã chạy trong ngày</Text>
                            </div>
                            {itemRows.length ? (
                                <Table
                                    rowKey='itemCode'
                                    size='small'
                                    pagination={false}
                                    dataSource={itemRows}
                                    columns={[
                                        {
                                            title: 'Mã hàng',
                                            key: 'item',
                                            render: (_, row) => (
                                                <div className='production-report-identity'>
                                                    <strong>{row.itemCode}</strong>
                                                    <span>{row.itemName || '—'}</span>
                                                </div>
                                            ),
                                        },
                                        {
                                            title: 'Chuyền',
                                            key: 'lines',
                                            width: 130,
                                            render: (_, row) => [...row.lines].join(', '),
                                        },
                                        {
                                            title: 'Sản lượng',
                                            key: 'qty',
                                            width: 110,
                                            align: 'right',
                                            render: (_, row) => `${number(row.quantity)} ${row.unit}`,
                                        },
                                        ...(financialsVisible
                                            ? [
                                                  {
                                                      title: 'Giá trị',
                                                      key: 'amount',
                                                      width: 130,
                                                      align: 'right' as const,
                                                      render: (_: unknown, row: (typeof itemRows)[number]) =>
                                                          money(row.amount),
                                                  },
                                              ]
                                            : []),
                                    ]}
                                />
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có sản lượng' />
                            )}
                        </section>

                        <section className='production-day-report__card'>
                            <div className='production-day-report__heading'>
                                <Title level={4}>Điểm bất thường</Title>
                                <Text type='secondary'>{monitor?.alerts.length || 0} tín hiệu</Text>
                            </div>
                            {monitor?.alerts.length ? (
                                <ul className='production-day-report__alerts'>
                                    {monitor.alerts.map((alert: ProductionMonitorAlert) => (
                                        <li key={alert.id} className={`severity-${alert.severity}`}>
                                            <WarningFilled />
                                            <span>
                                                <strong>{alert.title}</strong>
                                                <small>{alert.description}</small>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có bất thường' />
                            )}
                        </section>
                    </div>

                    <section className='production-day-report__card'>
                        <div className='production-day-report__heading'>
                            <Title level={4}>Ghi chú của tổ trưởng</Title>
                            <Text type='secondary'>{notes.length} ghi chú giải thích số liệu</Text>
                        </div>
                        {notes.length ? (
                            <ul className='production-day-report__notes'>
                                {notes.map((row) => (
                                    <li key={row.id}>
                                        <span className='production-day-report__note-meta'>
                                            <b>{row.lineCode}</b>
                                            <em>{row.slot ? slotRangeLabel(row.slot) : row.entry.slotKey}</em>
                                            <i>{number(row.entry.quantity)} SP</i>
                                        </span>
                                        <p>{row.entry.note}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có ghi chú nào trong ngày' />
                        )}
                    </section>

                    {day.statusHistory?.length ? (
                        <section className='production-day-report__card'>
                            <div className='production-day-report__heading'>
                                <Title level={4}>Lịch sử trạng thái</Title>
                            </div>
                            <ul className='production-day-report__history'>
                                {day.statusHistory.map((event, index) => (
                                    <li key={event.id || index}>
                                        <Tag color={statusMeta[event.to]?.color}>
                                            {statusMeta[event.to]?.label || event.to}
                                        </Tag>
                                        <span>{event.actor?.name || 'Không rõ người thực hiện'}</span>
                                        <em>{event.at ? dayjs(event.at).format('DD/MM/YYYY HH:mm') : ''}</em>
                                        {event.note ? <p>{event.note}</p> : null}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {isMobile ? null : (
                        <Text type='secondary' className='production-day-report__foot'>
                            Số liệu chốt tại thời điểm {dayjs(day.updatedAt || Date.now()).format('DD/MM/YYYY HH:mm')}
                        </Text>
                    )}
                </>
            )}
        </div>
    );
};

export default ProductionDayReportPage;
