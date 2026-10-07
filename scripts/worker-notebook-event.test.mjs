import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isNotebookWomensDayActive,
    notebookEventStorageKey,
    notebookVietnamDate,
    WOMENS_DAY_EVENT,
} from '../src/components/worker-notebook/notebook-event.ts';

test('campaign dates are fixed to 7–24 October 2026, inclusive', () => {
    for (const date of ['2026-10-06', '2026-10-25', '2026-11-01', '2027-10-20', '', '2026-10-2']) {
        assert.equal(isNotebookWomensDayActive(date), false, date);
    }
    for (let day = 7; day <= 24; day++) {
        const date = `2026-10-${String(day).padStart(2, '0')}`;
        assert.equal(isNotebookWomensDayActive(date), true, date);
    }
    assert.equal(WOMENS_DAY_EVENT.holidayDate, '2026-10-20');
});

test('start and end boundaries use Vietnamese time, not UTC or computer timezone', () => {
    const cases = [
        ['2026-10-06T16:59:59Z', '2026-10-06', false],
        ['2026-10-06T17:00:00Z', '2026-10-07', true],
        ['2026-10-24T16:59:59Z', '2026-10-24', true],
        ['2026-10-24T17:00:00Z', '2026-10-25', false],
    ];
    for (const [instant, date, active] of cases) {
        assert.equal(notebookVietnamDate(new Date(instant)), date);
        assert.equal(isNotebookWomensDayActive(notebookVietnamDate(new Date(instant))), active);
    }
});

test('preferences are scoped to campaign version, user and preference', () => {
    assert.notEqual(notebookEventStorageKey('worker-a', 'collapsed'), notebookEventStorageKey('worker-b', 'collapsed'));
    assert.notEqual(notebookEventStorageKey('worker-a', 'collapsed'), notebookEventStorageKey('worker-a', 'seen'));
    assert.match(notebookEventStorageKey('worker:a', 'collapsed'), /women-day-2026-v1:worker%3Aa:collapsed$/);
});
