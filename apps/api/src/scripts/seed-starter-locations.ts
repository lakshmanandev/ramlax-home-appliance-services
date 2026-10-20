import 'dotenv/config';
import mongoose from 'mongoose';
import { BusinessSettings, City, Service, ServiceType } from '../models.js';
import { seedCatalog } from '../catalog.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI before running this seed.');

const hostname = new URL(uri).hostname.toLowerCase();
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
  throw new Error('Remote MongoDB writes require ALLOW_REMOTE_SEED=true.');
}

const locations = [
  { name: 'Madurai', slug: 'madurai' },
  { name: 'Bangalore', slug: 'bangalore' },
];
const appointmentWindows = ['09:00 AM – 12:00 PM', '12:00 PM – 03:00 PM', '03:00 PM – 06:00 PM'];

try {
  await mongoose.connect(uri);
  await seedCatalog();

  for (const location of locations) {
    await City.updateOne(
      { slug: location.slug },
      { $setOnInsert: { ...location, areas: [], services: ['ac', 'ro', 'tv', 'washing-machine'], active: true } },
      { upsert: true },
    );
  }

  const services = await Service.find({ active: true }).select('_id slug').lean();
  const types = await ServiceType.find({ active: true, service: { $in: services.map(service => service._id) } });
  for (const type of types) {
    const existing = new Set(type.availability.map(rule => rule.city));
    const additions = locations.filter(location => !existing.has(location.slug)).map(location => ({ city: location.slug, areas: [], active: true }));
    if (additions.length) {
      type.availability.push(...additions);
      await type.save();
    }
  }

  const settings = await BusinessSettings.findOne({ key: 'public' });
  if (!settings) {
    await BusinessSettings.create({ key: 'public', appointmentWindows });
  } else if (!settings.appointmentWindows.length) {
    settings.appointmentWindows = appointmentWindows;
    await settings.save();
  }

  console.log('Starter locations and appointment windows are ready. Update service areas and times in admin settings as needed.');
} finally {
  await mongoose.disconnect();
}
