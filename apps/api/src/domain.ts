import type { BookingStatus } from '@ramlax/shared';

export const statusTransitions: Record<BookingStatus, BookingStatus[]> = {
  requested: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return statusTransitions[from].includes(to);
}

export function isWithinBookingHorizon(date: string, options: { leadDays: number; maxAdvanceDays: number; timeZone?: string }, now = new Date()) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: options.timeZone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const today = new Date(`${todayString}T00:00:00.000Z`);
  const daysAhead = Math.floor((parsed.getTime() - today.getTime()) / 86_400_000);
  return daysAhead >= options.leadDays && daysAhead <= options.maxAdvanceDays;
}
