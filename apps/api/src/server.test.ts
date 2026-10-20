import { describe, expect, it } from 'vitest';
import { bookingStatuses, serviceCatalog } from '@ramlax/shared';
import { priceSnapshot } from './catalog.js';

describe('service catalog and booking states', () => {
  it('has the four supported appliance categories and usable service types', () => {
    expect(serviceCatalog.map(item => item.slug)).toEqual(['ac', 'ro', 'tv', 'washing-machine']);
    expect(serviceCatalog.every(item => item.services.length > 0)).toBe(true);
  });
  it('includes terminal and active booking states', () => {
    expect(bookingStatuses).toContain('requested');
    expect(bookingStatuses).toContain('completed');
    expect(bookingStatuses).toContain('cancelled');
  });
});

describe('server-authoritative price snapshots', () => {
  it('calculates fixed price with configured additional charges', () => {
    expect(priceSnapshot({ kind: 'fixed', amount: 1500, currency: 'INR', additionalCharges: [{ name: 'Visit charge', amount: 200 }] })).toEqual({
      kind: 'fixed', amount: 1500, currency: 'INR', additionalCharges: [{ name: 'Visit charge', amount: 200 }], estimatedTotal: 1700,
    });
  });
  it('keeps starting prices labelled as estimates and quotes free of invented totals', () => {
    expect(priceSnapshot({ kind: 'starting', amount: 900, currency: 'INR', additionalCharges: [] }).estimatedTotal).toBe(900);
    expect(priceSnapshot({ kind: 'quote', currency: 'INR', additionalCharges: [] })).toEqual({ kind: 'quote', currency: 'INR', additionalCharges: [] });
  });
});
