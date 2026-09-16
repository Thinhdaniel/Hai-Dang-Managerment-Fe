import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import 'dayjs/locale/vi.js';

// Ant Design formats WW via isoWeek; advancedFormat alone is not sufficient.
dayjs.extend(isoWeek);

export const productionWeekStart = (value: Dayjs) => value.locale('vi').startOf('isoWeek');
