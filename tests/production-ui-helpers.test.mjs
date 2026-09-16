import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import { productionWeekStart } from '../src/core/lib/production-calendar.ts';
import { productionErrorMessage } from '../src/core/lib/production-error.ts';
import { partitionProductionNavigation } from '../src/core/lib/production-navigation.ts';

dayjs.extend(advancedFormat);

test('week picker renders ISO week tokens on direct page load', () => {
    assert.equal(productionWeekStart(dayjs('2026-09-15')).format('[Tuần] WW · DD/MM/YYYY'), 'Tuần 38 · 14/09/2026');
});

test('Sunday belongs to the preceding Monday and the locale starts on Monday', () => {
    const sunday = dayjs('2026-09-20');
    assert.equal(productionWeekStart(sunday).format('YYYY-MM-DD'), '2026-09-14');
    assert.equal(sunday.locale('vi').startOf('week').format('YYYY-MM-DD'), '2026-09-14');
});

test('ISO week survives year boundaries', () => {
    assert.equal(productionWeekStart(dayjs('2027-01-01')).format('YYYY-MM-DD WW'), '2026-12-28 53');
});

test('normalized API errors keep actionable backend messages', () => {
    assert.equal(productionErrorMessage({ status: 409, message: 'Dữ liệu đã thay đổi' }, 'Lỗi'), 'Dữ liệu đã thay đổi');
    assert.equal(productionErrorMessage(new Error('Mất kết nối'), 'Lỗi'), 'Mất kết nối');
});

test('invalid error payloads use fallback without crashing', () => {
    for (const error of [undefined, null, {}, { message: 12 }, { message: ' ' }]) {
        assert.equal(productionErrorMessage(error, 'Không thể lưu'), 'Không thể lưu');
    }
});

test('navigation prioritizes daily work and preserves every authorized route', () => {
    const routes = [
        'orders',
        'control-tower',
        'rollout',
        'pilot',
        'master-plan',
        'materials',
        'capacity',
        'planning',
        '',
        'qc',
        'qc/reports',
        'monitor',
        'board',
        'reports',
        'history',
    ].map((path) => ({ to: '/production' + (path ? '/' + path : '') }));
    const { primary, overflow } = partitionProductionNavigation(routes);
    assert.deepEqual(
        primary.map((item) => item.to),
        ['/production', '/production/planning', '/production/monitor', '/production/reports']
    );
    assert.equal(primary.length + 1, 5);
    assert.deepEqual([...primary, ...overflow].map((item) => item.to).sort(), routes.map((item) => item.to).sort());
});

test('QC and line-leader navigation never gains extra permissions', () => {
    for (const routes of [[{ to: '/production' }], [{ to: '/production/qc' }, { to: '/production/qc/reports' }]]) {
        const { primary, overflow } = partitionProductionNavigation(routes);
        assert.deepEqual(primary, routes);
        assert.deepEqual(overflow, []);
    }
});
