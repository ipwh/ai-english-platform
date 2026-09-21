import { hkDayKey } from './hk-date';

/** Hong Kong academic year runs from 1 September through 31 August. */
export function currentAcademicYear(now: Date = new Date()): string {
  const [year, month] = hkDayKey(now).split('-').map(Number);
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}