import { serviceCatalog } from '@ramlax/shared';
import { Service, ServiceType } from './models.js';

export type PriceConfig = {
  kind: 'fixed' | 'starting' | 'quote';
  amount?: number;
  currency: string;
  additionalCharges: { name: string; amount: number }[];
};

export function priceSnapshot(config: PriceConfig) {
  const charges = config.additionalCharges.map(charge => ({ name: charge.name, amount: charge.amount }));
  return {
    kind: config.kind,
    ...(config.amount === undefined ? {} : { amount: config.amount }),
    currency: config.currency,
    additionalCharges: charges,
    ...(config.kind === 'quote' || config.amount === undefined
      ? {}
      : { estimatedTotal: config.amount + charges.reduce((sum, charge) => sum + charge.amount, 0) }),
  };
}

export async function seedCatalog() {
  const serviceTypes: Record<string, string[]> = {
    ac: ['Installation', 'Uninstallation', 'Servicing', 'Maintenance', 'Repair'],
    ro: ['Installation', 'Servicing', 'Filter replacement', 'Repair'],
    tv: ['Installation', 'Wall mounting', 'Uninstallation', 'Setup'],
    'washing-machine': ['Installation', 'Uninstallation', 'Servicing', 'Repair'],
  };
  for (const item of serviceCatalog) {
    const service = await Service.findOneAndUpdate(
      { slug: item.slug },
      { $setOnInsert: { ...item, services: undefined, active: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    for (const name of serviceTypes[item.slug] || []) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await ServiceType.updateOne(
        { service: service._id, slug },
        { $setOnInsert: { service: service._id, slug, name, active: true, availability: [], pricing: { kind: 'quote', currency: 'INR', additionalCharges: [] } } },
        { upsert: true },
      );
    }
  }
}
