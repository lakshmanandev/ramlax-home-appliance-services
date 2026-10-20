import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { AdminNotification, AdminUser, AuditLog, Booking, BusinessSettings, City, ContactEnquiry, Review, Service, ServiceType, Technician } from './models.js';
import { bookingStatuses, type BookingStatus } from '@ramlax/shared';
import { priceSnapshot, seedCatalog } from './catalog.js';
import { canTransition, isWithinBookingHorizon } from './domain.js';
import { requireRoles } from './authorization.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.idempotency-key', 'res.headers.set-cookie'] });
const runningOnVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const app = express();
const httpServer = createServer(app);
let io: SocketIOServer | undefined;
app.disable('x-powered-by');
app.use(pinoHttp({ logger }));
app.use(helmet());
const allowedOrigins = (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use((req, res, next) => {
  const origin = req.header('Origin');
  if (origin && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed' } });
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.get('/', (_req, res) => res.json({ service: 'RamLaksh API', status: 'ok', health: '/api/v1/health' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', realtime: runningOnVercel ? 'polling' : 'socket' }));
app.get('/ready', async (_req, res) => {
  try { await initializeDatabase(); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not_ready' }); }
});
const api = express.Router();
app.use('/api/v1', api);
let databaseInitialization: Promise<void> | undefined;
async function initializeDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  secret();
  try { new Intl.DateTimeFormat('en', { timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata' }).format(); }
  catch { throw new Error('BUSINESS_TIME_ZONE must be a valid IANA time zone'); }
  if (process.env.NODE_ENV === 'production') {
    const originsAreSecure = Boolean(process.env.WEB_ORIGIN) && allowedOrigins.every(origin => {
      try { const parsed = new URL(origin); return parsed.protocol === 'https:' && parsed.origin === origin; }
      catch { return false; }
    });
    if (!originsAreSecure) throw new Error('WEB_ORIGIN must contain exact HTTPS production origins');
  }
  if (!databaseInitialization) {
    databaseInitialization = mongoose.connect(process.env.MONGODB_URI)
      .then(() => seedCatalog())
      .then(() => undefined)
      .catch(error => { databaseInitialization = undefined; throw error; });
  }
  return databaseInitialization;
}
api.get('/health', (_req, res) => res.json({ status: 'ok', realtime: runningOnVercel ? 'polling' : 'socket' }));
api.use((_req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  void initializeDatabase().then(() => next()).catch(error => {
    logger.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, 'API database initialization failed; check MongoDB configuration and network access');
    res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Check the API database configuration.' } });
  });
});
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const lookupLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
const digest = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
async function notifyAdmins(event: string, title: string, booking: { _id: unknown; reference: string }) {
  const notification = await AdminNotification.create({ event, title, booking: booking._id, bookingReference: booking.reference });
  io?.to('admin-room').emit('admin:notification', { id: notification.id, event, title, bookingReference: booking.reference, createdAt: notification.createdAt });
  io?.to('admin-room').emit('admin:bookings:changed');
}
const secret = () => { const value = process.env.JWT_SECRET; if (!value || value.length < 32 || (process.env.NODE_ENV === 'production' && /^(replace|change|your)[-_ ]/i.test(value))) throw new Error('JWT_SECRET must be configured with a random value of at least 32 characters'); return value; };
type AuthRequest = express.Request & { user?: { id: string; role: string; expiresAt: number } };
async function auth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  try {
    const raw = req.cookies?.accessToken;
    if (!raw) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    const claims = jwt.verify(raw, secret(), { issuer: 'ramlax-api', audience: 'ramlax-admin', algorithms: ['HS256'] }) as { id: string; role: string; sessionVersion?: number; exp?: number };
    const user = await AdminUser.findOne({ _id: claims.id, active: true }).select('role sessionVersion').lean();
    if (!user || user.role !== claims.role || (claims.sessionVersion ?? -1) !== (user.sessionVersion ?? 0)) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    req.user = { id: claims.id, role: user.role, expiresAt: (claims.exp || 0) * 1000 }; next();
  } catch { return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }); }
}
function readAccessCookie(header: string | undefined) {
  for (const item of (header || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== 'accessToken') continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
const admin = requireRoles('owner', 'admin', 'staff');
const ownerOrAdmin = requireRoles('owner', 'admin');
const bookingInput = z.object({ customer: z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/), email: z.string().email().optional().or(z.literal('')) }), service: z.string().min(1), serviceType: z.string().min(1), appliance: z.record(z.string().max(100)).default({}), city: z.string().min(1), area: z.string().min(1), address: z.string().trim().min(5).max(500), landmark: z.string().max(150).optional(), preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), preferredWindow: z.string().min(1), termsAccepted: z.literal(true), marketingConsent: z.boolean().default(false) });
const serviceSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string().trim().min(2).max(100), short: z.string().trim().min(2).max(40), description: z.string().trim().min(10).max(1000), icon: z.enum(['snowflake', 'droplets', 'tv', 'washing-machine']), active: z.boolean().default(true) }).strict();
const priceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/).default('INR'), additionalCharges: z.array(z.object({ name: z.string().trim().min(2).max(80), amount: z.number().finite().nonnegative() }).strict()).max(20).default([]) }).strict(),
  z.object({ kind: z.literal('starting'), amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/).default('INR'), additionalCharges: z.array(z.object({ name: z.string().trim().min(2).max(80), amount: z.number().finite().nonnegative() }).strict()).max(20).default([]) }).strict(),
  z.object({ kind: z.literal('quote'), currency: z.string().regex(/^[A-Z]{3}$/).default('INR'), additionalCharges: z.array(z.object({ name: z.string().trim().min(2).max(80), amount: z.number().finite().nonnegative() }).strict()).max(20).default([]) }).strict(),
]);
const serviceTypeSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string().trim().min(2).max(100), active: z.boolean().default(true), availability: z.array(z.object({ city: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), areas: z.array(z.string().trim().min(1).max(100)).max(100).default([]), active: z.boolean().default(true) }).strict()).max(200), pricing: priceSchema }).strict();
const settingsSchema = z.object({ phone: z.string().max(30).optional(), whatsappPhone: z.string().max(30).optional(), email: z.string().email().or(z.literal('')).optional(), address: z.string().max(500).optional(), appointmentWindows: z.array(z.string().trim().min(2).max(80)).max(12).optional(), bookingLeadDays: z.number().int().min(0).max(60).optional(), maxAdvanceDays: z.number().int().min(1).max(365).optional() }).strict();
async function hasValidAvailability(rules: { city: string; areas: string[]; active: boolean }[]) {
  for (const rule of rules.filter(item => item.active)) {
    const city = await City.findOne({ slug: rule.city, active: true });
    if (!city || rule.areas.some(area => city.areas.length > 0 && !city.areas.includes(area))) return false;
  }
  return true;
}
const serviceImageUrls = (service: { slug: string; updatedAt?: Date | null; cardImageContentType?: string | null; galleryImageContentType?: string | null }) => { const version = service.updatedAt ? `?v=${service.updatedAt.getTime()}` : ''; return { imageUrl: service.cardImageContentType ? `/api/v1/services/${service.slug}/image/card${version}` : null, galleryImageUrl: service.galleryImageContentType ? `/api/v1/services/${service.slug}/image/gallery${version}` : null }; };
api.get('/services/:slug/image/:slot', async (req, res, next) => {
  try {
    const slot = typeof req.params.slot === 'string' ? req.params.slot : '';
    const service = await Service.findOne({ slug: req.params.slug, active: true }).select('cardImageData cardImageContentType galleryImageData galleryImageContentType');
    if (!service || !['card', 'gallery'].includes(slot)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service image not found' } });
    const isCard = slot === 'card';
    const data = service.get(isCard ? 'cardImageData' : 'galleryImageData') as Buffer | undefined;
    const contentType = service.get(isCard ? 'cardImageContentType' : 'galleryImageContentType') as string | undefined;
    if (!data || !contentType) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service image not found' } });
    res.set('Content-Type', contentType).set('Cross-Origin-Resource-Policy', 'cross-origin').set('Cache-Control', 'public, max-age=300').send(data);
  } catch (e) { next(e); }
});
api.get('/services', async (_req, res, next) => { try { const services = await Service.find({ active: true }).select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').sort({ name: 1 }).lean(); const types = await ServiceType.find({ active: true, service: { $in: services.map(service => service._id) } }).lean(); res.json({ data: services.map(service => ({ ...service, ...serviceImageUrls(service), serviceTypes: types.filter(type => String(type.service) === String(service._id)).map(type => ({ slug: type.slug, name: type.name, availability: type.availability, pricing: type.pricing })) })) }); } catch (e) { next(e); } });
api.get('/services/:slug', async (req, res, next) => { try { const service = await Service.findOne({ slug: req.params.slug, active: true }).select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').lean(); if (!service) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } }); const serviceTypes = await ServiceType.find({ service: service._id, active: true }).select('slug name availability pricing').lean(); res.json({ data: { ...service, ...serviceImageUrls(service), serviceTypes } }); } catch (e) { next(e); } });
api.get('/locations', async (_req, res, next) => { try { const data = await City.find({ active: true }).select('name slug areas services').lean(); res.json({ data }); } catch (e) { next(e); } });
api.get('/locations/:slug', async (req, res, next) => { try { const data = await City.findOne({ slug: req.params.slug, active: true }).select('name slug areas services').lean(); return data ? res.json({ data }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Location not found' } }); } catch (e) { next(e); } });
api.get('/settings/public', async (_req, res, next) => { try { const row = await BusinessSettings.findOne({ key: 'public' }).lean(); res.json({ data: { businessName: 'RamLax Home Appliance Services', phone: row?.phone || process.env.BUSINESS_PHONE || '', whatsappPhone: row?.whatsappPhone || process.env.BUSINESS_WHATSAPP_PHONE || '', email: row?.email || process.env.BUSINESS_EMAIL || '', address: row?.address || process.env.BUSINESS_ADDRESS || '', appointmentWindows: row?.appointmentWindows || [], bookingLeadDays: row?.bookingLeadDays ?? 1, maxAdvanceDays: row?.maxAdvanceDays ?? 30 } }); } catch (e) { next(e); } });
api.post('/bookings', limiter, async (req, res, next) => {
  let idempotencyHash = '';
  try {
    const parsed = bookingInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Review the booking details', fields: parsed.error.flatten().fieldErrors } });
    const input = parsed.data;
    const idempotencyKey = req.header('Idempotency-Key') || '';
    if (idempotencyKey.length < 16 || idempotencyKey.length > 128) return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Send a random idempotency key with at least 16 characters' } });
    idempotencyHash = digest(idempotencyKey);
    const priorRequest = await Booking.findOne({ idempotencyKeyHash: idempotencyHash }).select('reference status price').lean();
    if (priorRequest) return res.status(200).json({ data: { reference: priorRequest.reference, status: priorRequest.status, price: priorRequest.price, lookupToken: idempotencyKey, message: 'This request was already received. Save the access key to look it up later.' }, reused: true });
    const [city, service] = await Promise.all([
      City.findOne({ slug: input.city, active: true }),
      Service.findOne({ slug: input.service, active: true }),
    ]);
    if (!city || !service || !city.services.includes(service.slug) || (city.areas.length > 0 && !city.areas.includes(input.area))) {
      return res.status(422).json({ error: { code: 'UNSUPPORTED_AREA', message: 'This service is not configured for the selected area' } });
    }
    const serviceType = await ServiceType.findOne({ service: service._id, slug: input.serviceType, active: true }).lean();
    const availability = serviceType?.availability.find(rule => rule.city === city.slug && rule.active && (rule.areas.length === 0 || rule.areas.includes(input.area)));
    if (!serviceType?.pricing || !availability) return res.status(422).json({ error: { code: 'UNSUPPORTED_SERVICE', message: 'This service type is unavailable in the selected area' } });
    const schedule = await BusinessSettings.findOne({ key: 'public' }).select('appointmentWindows bookingLeadDays maxAdvanceDays').lean();
    if (!schedule?.appointmentWindows.includes(input.preferredWindow)) return res.status(422).json({ error: { code: 'UNAVAILABLE_WINDOW', message: 'The selected time window is not configured' } });
    if (!isWithinBookingHorizon(input.preferredDate, { leadDays: schedule.bookingLeadDays, maxAdvanceDays: schedule.maxAdvanceDays, timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata' })) return res.status(422).json({ error: { code: 'DATE_OUT_OF_RANGE', message: 'Choose a valid date within the booking window' } });
    const reference = `RL-${new Date().getUTCFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`;
    const snapshot = priceSnapshot({ kind: serviceType.pricing.kind, amount: serviceType.pricing.amount ?? undefined, currency: serviceType.pricing.currency || 'INR', additionalCharges: (serviceType.pricing.additionalCharges || []).map(charge => ({ name: charge.name, amount: charge.amount })) });
    const booking = await Booking.create({ ...input, reference, price: snapshot, idempotencyKeyHash: idempotencyHash, lookupTokenHash: idempotencyHash, statusHistory: [{ status: 'requested', note: 'Booking request received' }] });
    await notifyAdmins('booking_received', 'New booking request', booking);
    res.status(201).json({ data: { reference, status: booking.status, price: booking.price, lookupToken: idempotencyKey, message: 'Your service request has been received. Save the access key to look it up later. The team will contact you to confirm availability.' } });
  } catch (e) {
    if ((e as { code?: number }).code === 11000 && idempotencyHash) {
      const priorRequest = await Booking.findOne({ idempotencyKeyHash: idempotencyHash }).select('reference status price').lean();
      if (priorRequest) return res.status(200).json({ data: { reference: priorRequest.reference, status: priorRequest.status, price: priorRequest.price, lookupToken: req.header('Idempotency-Key'), message: 'This request was already received. Save the access key to look it up later.' }, reused: true });
    }
    next(e);
  }
});
api.post('/bookings/lookup', lookupLimiter, async (req, res, next) => {
  try {
    const input = z.object({ reference: z.string().regex(/^RL-\d{4}-[A-F0-9]{16}$/), accessKey: z.string().min(16).max(128) }).strict().safeParse(req.body);
    if (!input.success) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking could not be verified' } });
    const booking = await Booking.findOne({ reference: input.data.reference, lookupTokenHash: digest(input.data.accessKey) }).select('reference service serviceType status preferredDate preferredWindow confirmedDate confirmedWindow createdAt updatedAt').lean();
    if (!booking) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking could not be verified' } });
    res.json({ data: booking });
  } catch (e) { next(e); }
});
api.get('/reviews', async (_req, res, next) => { try { res.json({ data: await Review.find({ approved: true }).select('service rating text displayName createdAt').sort({ createdAt: -1 }).limit(50).lean() }); } catch (e) { next(e); } });
api.post('/reviews', lookupLimiter, async (req, res, next) => {
  try {
    const input = z.object({ reference: z.string().regex(/^RL-\d{4}-[A-F0-9]{16}$/), accessKey: z.string().min(16).max(128), rating: z.number().int().min(1).max(5), text: z.string().trim().min(10).max(1000), displayName: z.string().trim().min(2).max(80) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the review details' } });
    const booking = await Booking.findOne({ reference: input.data.reference, lookupTokenHash: digest(input.data.accessKey), status: 'completed' }).select('_id service').lean();
    if (!booking) return res.status(404).json({ error: { code: 'BOOKING_NOT_ELIGIBLE', message: 'A completed, verified booking is required' } });
    const review = await Review.create({ booking: booking._id, service: booking.service, rating: input.data.rating, text: input.data.text, displayName: input.data.displayName });
    res.status(201).json({ data: { submitted: true, approved: review.approved, message: 'Review submitted for approval' } });
  } catch (e) { next(e); }
});
api.post('/contact', limiter, async (req, res, next) => { try { const input = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(20), message: z.string().trim().min(5).max(2000) }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check your details' } }); const enquiry = await ContactEnquiry.create(input.data); io?.to('admin-room').emit('admin:contacts:changed', { id: enquiry.id, status: enquiry.status }); res.status(202).json({ data: { id: enquiry.id, received: true, message: 'Thanks. Your enquiry has been received.' } }); } catch (e) { next(e); } });
api.post('/auth/login', loginLimiter, async (req, res, next) => { try { const input = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter your email and password' } }); const user = await AdminUser.findOne({ email: input.data.email.toLowerCase(), active: true }).select('+passwordHash'); if (!user || !(await argon2.verify(user.passwordHash, input.data.password))) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } }); const expiresAt = Date.now() + 20 * 60_000; const token = jwt.sign({ id: user.id, role: user.role, sessionVersion: user.sessionVersion ?? 0 }, secret(), { expiresIn: '20m', issuer: 'ramlax-api', audience: 'ramlax-admin' }); res.cookie('accessToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 20 * 60_000, path: '/' }); res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role, expiresAt } }); } catch (e) { next(e); } });
api.post('/auth/logout', async (req, res) => {
  const raw = req.cookies?.accessToken;
  let claims: { id: string; sessionVersion?: number } | undefined;
  if (raw) try { claims = jwt.verify(raw, secret(), { issuer: 'ramlax-api', audience: 'ramlax-admin', algorithms: ['HS256'] }) as { id: string; sessionVersion?: number }; } catch { /* Expired and invalid cookies are still cleared. */ }
  if (claims) io?.in(`user:${claims.id}`).disconnectSockets(true);
  if (claims && Number.isInteger(claims.sessionVersion)) {
    try { await AdminUser.updateOne({ _id: claims.id, $or: [{ sessionVersion: claims.sessionVersion }, { sessionVersion: { $exists: false } }] }, { $inc: { sessionVersion: 1 } }); }
    catch { res.clearCookie('accessToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); return res.status(503).json({ error: { code: 'LOGOUT_UNAVAILABLE', message: 'Could not revoke the session. Try again.' } }); }
  }
  res.clearCookie('accessToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.json({ data: { loggedOut: true } });
});
api.get('/auth/me', auth, async (req: AuthRequest, res, next) => { try { const user = await AdminUser.findById(req.user?.id).select('name email role'); return user ? res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role, expiresAt: req.user?.expiresAt } }) : res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }); } catch (e) { next(e); } });
const protectedApi = express.Router(); protectedApi.use(auth, admin); api.use('/admin', protectedApi);
protectedApi.get('/notifications', async (_req, res, next) => { try { res.json({ data: await AdminNotification.find().sort({ createdAt: -1 }).limit(50).lean() }); } catch (e) { next(e); } });
protectedApi.patch('/notifications/:id/read', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid notification id' } }); const data = await AdminNotification.findByIdAndUpdate(req.params.id, { $set: { readAt: new Date() } }, { new: true }); return data ? res.json({ data }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } }); } catch (e) { next(e); } });
protectedApi.use('/services', ownerOrAdmin);
protectedApi.use('/cities', ownerOrAdmin);
protectedApi.use('/technicians', ownerOrAdmin);
protectedApi.use('/settings', ownerOrAdmin);
protectedApi.get('/reviews', async (req, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); const status = req.query.status === 'approved' ? true : req.query.status === 'pending' ? false : undefined; const filter = status === undefined ? {} : { approved: status }; const [data, total] = await Promise.all([Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('booking', 'reference status').lean(), Review.countDocuments(filter)]); res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); } catch (e) { next(e); } });
protectedApi.patch('/reviews/:id', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid review id' } }); const input = z.object({ approved: z.boolean(), moderationNote: z.string().trim().max(500).optional() }).strict().safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid moderation action' } }); const review = await Review.findByIdAndUpdate(req.params.id, { $set: input.data }, { new: true, runValidators: true }); if (!review) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Review not found' } }); await AuditLog.create({ actor: req.user?.id, action: input.data.approved ? 'review.approve' : 'review.reject', entity: 'review', entityId: review.id, requestId: req.id }); res.json({ data: review }); } catch (e) { next(e); } });
protectedApi.get('/reports', async (req, res, next) => { try {
  const from = typeof req.query.from === 'string' ? req.query.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = typeof req.query.to === 'string' ? req.query.to : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return res.status(400).json({ error: { code: 'INVALID_DATE_RANGE', message: 'Use a valid from/to date range' } });
  const filter = { createdAt: { $gte: new Date(`${from}T00:00:00.000Z`), $lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } };
  const [total, byStatus, byService, byCity, money] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: filter }, { $group: { _id: '$service', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Booking.aggregate([{ $match: filter }, { $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Booking.aggregate([{ $match: filter }, { $group: { _id: null, estimatedBookingValue: { $sum: { $ifNull: ['$price.estimatedTotal', 0] } }, actualRecordedPayments: { $sum: { $ifNull: ['$actualPaidAmount', 0] } } } }]),
  ]);
  const counts = Object.fromEntries(byStatus.map(row => [row._id, row.count]));
  res.json({ data: { from, to, total, byStatus: counts, byService, byCity, completedJobs: counts.completed || 0, cancellationRate: total ? (counts.cancelled || 0) / total : 0, estimatedBookingValue: money[0]?.estimatedBookingValue || 0, actualRecordedPayments: money[0]?.actualRecordedPayments || 0 } });
} catch (e) { next(e); } });
protectedApi.get('/services', async (_req, res, next) => { try { const services = await Service.find().select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').sort({ name: 1 }).lean(); const types = await ServiceType.find().sort({ name: 1 }).lean(); res.json({ data: services.map(service => ({ ...service, ...serviceImageUrls(service), serviceTypes: types.filter(type => String(type.service) === String(service._id)) })) }); } catch (e) { next(e); } });
protectedApi.post('/services', async (req: AuthRequest, res, next) => { try { const parsed = serviceSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service details', fields: parsed.error.flatten().fieldErrors } }); const data = await Service.create(parsed.data); await AuditLog.create({ actor: req.user?.id, action: 'service.create', entity: 'service', entityId: data.id, requestId: req.id }); res.status(201).json({ data }); } catch (e) { next(e); } });
protectedApi.put('/services/:id/images/:slot', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' }), async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } });
    const slot = typeof req.params.slot === 'string' ? req.params.slot : '';
    if (!['card', 'gallery'].includes(slot)) return res.status(400).json({ error: { code: 'INVALID_IMAGE_SLOT', message: 'Choose a service card or gallery image slot' } });
    const contentType = req.header('content-type')?.split(';')[0]?.trim();
    if (!contentType || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Upload a JPG, PNG, or WEBP image' } });
    const prefix = slot === 'card' ? 'cardImage' : 'galleryImage';
    const bytes = req.body as Buffer;
    const validSignature = contentType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!validSignature) return res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'The uploaded file does not match its image type' } });
    const imageHash = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await Service.findOne({ _id: { $ne: req.params.id }, $or: [{ cardImageHash: imageHash }, { galleryImageHash: imageHash }] }).select('_id').lean();
    if (duplicate) return res.status(409).json({ error: { code: 'DUPLICATE_IMAGE', message: 'This photo is already used for another service. Choose a different image.' } });
    const sameService = await Service.findById(req.params.id).select(`${prefix}Hash`).lean();
    const existingHash = sameService?.[`${prefix}Hash` as 'cardImageHash' | 'galleryImageHash'];
    const otherPrefix = prefix === 'cardImage' ? 'galleryImage' : 'cardImage';
    if (!sameService) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    if (existingHash !== imageHash) {
      const sameServiceDuplicate = await Service.findOne({ _id: req.params.id, [`${otherPrefix}Hash`]: imageHash }).select('_id').lean();
      if (sameServiceDuplicate) return res.status(409).json({ error: { code: 'DUPLICATE_IMAGE', message: 'Use a different photo for the service card and gallery.' } });
    }
    const data = await Service.findByIdAndUpdate(req.params.id, { $set: { [`${prefix}Data`]: bytes, [`${prefix}ContentType`]: contentType, [`${prefix}Hash`]: imageHash } }, { new: true }).select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').lean();
    if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    await AuditLog.create({ actor: req.user?.id, action: `service.image.${slot}.upload`, entity: 'service', entityId: String(data._id), requestId: req.id });
    res.json({ data: serviceImageUrls(data) });
  } catch (e) { next(e); }
});
protectedApi.delete('/services/:id/images/:slot', async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } });
    const slot = typeof req.params.slot === 'string' ? req.params.slot : '';
    if (!['card', 'gallery'].includes(slot)) return res.status(400).json({ error: { code: 'INVALID_IMAGE_SLOT', message: 'Choose a service card or gallery image slot' } });
    const prefix = slot === 'card' ? 'cardImage' : 'galleryImage';
    const data = await Service.findByIdAndUpdate(req.params.id, { $unset: { [`${prefix}Data`]: 1, [`${prefix}ContentType`]: 1, [`${prefix}Hash`]: 1 } }, { new: true }).select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').lean();
    if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    await AuditLog.create({ actor: req.user?.id, action: `service.image.${slot}.remove`, entity: 'service', entityId: String(data._id), requestId: req.id });
    res.json({ data: serviceImageUrls(data) });
  } catch (e) { next(e); }
});
protectedApi.patch('/services/:id', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } }); const parsed = serviceSchema.partial().strict().safeParse(req.body); if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service details' } }); const data = await Service.findByIdAndUpdate(req.params.id, { $set: parsed.data }, { new: true, runValidators: true }).select('-cardImageData -galleryImageData -cardImageHash -galleryImageHash').lean(); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } }); await AuditLog.create({ actor: req.user?.id, action: 'service.update', entity: 'service', entityId: String(data._id), requestId: req.id }); res.json({ data: { ...data, ...serviceImageUrls(data) } }); } catch (e) { next(e); } });
protectedApi.delete('/services/:id', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } }); const data = await Service.findByIdAndUpdate(req.params.id, { active: false }, { new: true }); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } }); await ServiceType.updateMany({ service: data._id }, { active: false }); await AuditLog.create({ actor: req.user?.id, action: 'service.archive', entity: 'service', entityId: data.id, requestId: req.id }); res.json({ data: { id: data.id, active: false } }); } catch (e) { next(e); } });
protectedApi.get('/services/:serviceId/types', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.serviceId)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } }); const service = await Service.findById(req.params.serviceId); if (!service) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } }); res.json({ data: await ServiceType.find({ service: service._id }).sort({ name: 1 }).lean() }); } catch (e) { next(e); } });
protectedApi.post('/services/:serviceId/types', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.serviceId)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service id' } }); const service = await Service.findOne({ _id: req.params.serviceId, active: true }); if (!service) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active service not found' } }); const parsed = serviceTypeSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service type details', fields: parsed.error.flatten().fieldErrors } }); if (!await hasValidAvailability(parsed.data.availability)) return res.status(422).json({ error: { code: 'INVALID_AVAILABILITY', message: 'Availability must reference configured cities and areas' } }); const data = await ServiceType.create({ ...parsed.data, service: service._id }); await AuditLog.create({ actor: req.user?.id, action: 'service_type.create', entity: 'service_type', entityId: data.id, requestId: req.id }); res.status(201).json({ data }); } catch (e) { next(e); } });
protectedApi.patch('/services/:serviceId/types/:typeId', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.serviceId) || !mongoose.isValidObjectId(req.params.typeId)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service or service type id' } }); const parsed = serviceTypeSchema.partial().strict().safeParse(req.body); if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service type details' } }); if (parsed.data.availability && !await hasValidAvailability(parsed.data.availability)) return res.status(422).json({ error: { code: 'INVALID_AVAILABILITY', message: 'Availability must reference configured cities and areas' } }); const data = await ServiceType.findOneAndUpdate({ _id: req.params.typeId, service: req.params.serviceId }, { $set: parsed.data }, { new: true, runValidators: true }); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service type not found' } }); await AuditLog.create({ actor: req.user?.id, action: 'service_type.update', entity: 'service_type', entityId: data.id, requestId: req.id }); res.json({ data }); } catch (e) { next(e); } });
protectedApi.delete('/services/:serviceId/types/:typeId', async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.serviceId) || !mongoose.isValidObjectId(req.params.typeId)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid service or service type id' } }); const data = await ServiceType.findOneAndUpdate({ _id: req.params.typeId, service: req.params.serviceId }, { active: false }, { new: true }); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service type not found' } }); await AuditLog.create({ actor: req.user?.id, action: 'service_type.archive', entity: 'service_type', entityId: data.id, requestId: req.id }); res.json({ data: { id: data.id, active: false } }); } catch (e) { next(e); } });
protectedApi.get('/dashboard', async (_req, res, next) => { try { const [total, requested, confirmed, completed, grouped] = await Promise.all([Booking.countDocuments(), Booking.countDocuments({ status: 'requested' }), Booking.countDocuments({ status: 'confirmed' }), Booking.countDocuments({ status: 'completed' }), Booking.aggregate([{ $group: { _id: '$service', count: { $sum: 1 } } }])]); res.json({ data: { total, requested, confirmed, completed, services: grouped } }); } catch (e) { next(e); } });
protectedApi.get('/bookings', async (req, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); const filter: Record<string, unknown> = {}; if (typeof req.query.status === 'string' && bookingStatuses.includes(req.query.status as BookingStatus)) filter.status = req.query.status; if (typeof req.query.q === 'string' && req.query.q.trim()) { const q = req.query.q.trim().slice(0, 100); filter.$or = [{ reference: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { 'customer.name': new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { 'customer.phone': new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }]; } const [data, total] = await Promise.all([Booking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Booking.countDocuments(filter)]); res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); } catch (e) { next(e); } });
protectedApi.get('/bookings/:id', async (req, res, next) => { try { const data = await Booking.findOne({ $or: [{ reference: req.params.id }, ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : [])] }).lean(); return data ? res.json({ data }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } }); } catch (e) { next(e); } });
protectedApi.patch('/bookings/:id/status', async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid booking id' } });
    const input = z.object({ status: z.enum(bookingStatuses), note: z.string().trim().max(500).optional(), cancellationReason: z.string().trim().min(3).max(500).optional() }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status update' } });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } });
    if (!canTransition(booking.status as BookingStatus, input.data.status)) return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'This status change is not allowed' } });
    if (input.data.status === 'cancelled' && !input.data.cancellationReason) return res.status(400).json({ error: { code: 'CANCELLATION_REASON_REQUIRED', message: 'A cancellation reason is required' } });
    if (input.data.status === 'confirmed') return res.status(409).json({ error: { code: 'SCHEDULE_REQUIRED', message: 'Confirm the appointment using the scheduling action' } });
    const now = new Date();
    const update = await Booking.findOneAndUpdate({ _id: booking._id, status: booking.status, updatedAt: booking.updatedAt }, { $set: { status: input.data.status, updatedAt: now, ...(input.data.status === 'cancelled' ? { cancellationReason: input.data.cancellationReason } : {}) }, $push: { statusHistory: { status: input.data.status, note: input.data.cancellationReason || input.data.note, at: now } } }, { new: true });
    if (!update) return res.status(409).json({ error: { code: 'BOOKING_CHANGED', message: 'This booking changed. Reload and try again.' } });
    await AuditLog.create({ actor: req.user?.id, action: 'booking.status', entity: 'booking', entityId: booking.id, requestId: req.id });
    await notifyAdmins(`booking_${update.status}`, `Booking ${update.reference} ${update.status.replace('_', ' ')}`, update);
    res.json({ data: { reference: update.reference, status: update.status } });
  } catch (e) { next(e); }
});
protectedApi.patch('/bookings/:id/schedule', async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid booking id' } });
    const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), window: z.string().min(1).max(80) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid date and time window' } });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } });
    if (!['requested', 'confirmed'].includes(booking.status)) return res.status(409).json({ error: { code: 'INVALID_SCHEDULE_STATE', message: 'Only requested or confirmed bookings can be scheduled' } });
    const [settings, service, serviceType] = await Promise.all([
      BusinessSettings.findOne({ key: 'public' }).select('appointmentWindows bookingLeadDays maxAdvanceDays').lean(),
      Service.findOne({ slug: booking.service, active: true }),
      ServiceType.findOne({ slug: booking.serviceType, active: true }),
    ]);
    if (!settings?.appointmentWindows.includes(input.data.window)) return res.status(422).json({ error: { code: 'UNAVAILABLE_WINDOW', message: 'The selected time window is not configured' } });
    if (!isWithinBookingHorizon(input.data.date, { leadDays: settings.bookingLeadDays, maxAdvanceDays: settings.maxAdvanceDays, timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata' })) return res.status(422).json({ error: { code: 'DATE_OUT_OF_RANGE', message: 'Choose a valid date within the booking window' } });
    const coverage = serviceType?.service.equals(service?._id) && serviceType.availability.some(rule => rule.active && rule.city === booking.city && (rule.areas.length === 0 || rule.areas.includes(booking.area)));
    if (!coverage) return res.status(422).json({ error: { code: 'UNSUPPORTED_AREA', message: 'This service is no longer available in the booking area' } });
    const nextStatus = booking.status === 'requested' ? 'confirmed' : 'confirmed';
    const note = booking.status === 'requested' ? 'Appointment confirmed' : 'Appointment rescheduled';
    const now = new Date();
    const update = await Booking.findOneAndUpdate({ _id: booking._id, status: booking.status, updatedAt: booking.updatedAt }, { $set: { status: nextStatus, confirmedDate: input.data.date, confirmedWindow: input.data.window, updatedAt: now }, $push: { statusHistory: { status: nextStatus, note, at: now } } }, { new: true });
    if (!update) return res.status(409).json({ error: { code: 'BOOKING_CHANGED', message: 'This booking changed. Reload and try again.' } });
    await AuditLog.create({ actor: req.user?.id, action: booking.status === 'requested' ? 'booking.confirm' : 'booking.reschedule', entity: 'booking', entityId: booking.id, requestId: req.id });
    await notifyAdmins(booking.status === 'requested' ? 'booking_confirmed' : 'booking_rescheduled', `Booking ${update.reference} ${booking.status === 'requested' ? 'confirmed' : 'rescheduled'}`, update);
    res.json({ data: { reference: update.reference, status: update.status, confirmedDate: update.confirmedDate, confirmedWindow: update.confirmedWindow } });
  } catch (e) { next(e); }
});
protectedApi.patch('/bookings/:id/assignment', async (req: AuthRequest, res, next) => { try { const input = z.object({ technicianId: z.string() }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a technician' } }); const [booking, technician] = await Promise.all([Booking.findById(req.params.id), Technician.findById(input.data.technicianId)]); if (!booking) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } }); if (!technician || !technician.active || !technician.skills.includes(booking.service) || !technician.cities.includes(booking.city) || (technician.areas.length && !technician.areas.includes(booking.area))) return res.status(422).json({ error: { code: 'INELIGIBLE_TECHNICIAN', message: 'Technician is not active or qualified for this booking area' } }); booking.technician = { id: technician._id, name: technician.name, phone: technician.phone }; await booking.save(); await AuditLog.create({ actor: req.user?.id, action: 'booking.assign', entity: 'booking', entityId: booking.id, requestId: req.id }); await notifyAdmins('booking_assigned', `Technician assigned to ${booking.reference}`, booking); res.json({ data: { reference: booking.reference, technician: booking.technician } }); } catch (e) { next(e); } });
protectedApi.patch('/bookings/:id/payment', ownerOrAdmin, async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid booking id' } }); const input = z.object({ actualPaidAmount: z.number().finite().nonnegative() }).strict().safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a valid recorded payment amount' } }); const data = await Booking.findByIdAndUpdate(req.params.id, { $set: { actualPaidAmount: input.data.actualPaidAmount } }, { new: true }); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } }); await AuditLog.create({ actor: req.user?.id, action: 'booking.payment_record', entity: 'booking', entityId: data.id, requestId: req.id }); res.json({ data: { reference: data.reference, actualPaidAmount: data.actualPaidAmount } }); } catch (e) { next(e); } });
protectedApi.get('/technicians', async (_req, res, next) => { try { res.json({ data: await Technician.find().sort({ name: 1 }).lean() }); } catch (e) { next(e); } });
protectedApi.get('/contacts', async (req, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); const status = ['new', 'reviewed', 'closed'].includes(String(req.query.status)) ? String(req.query.status) : undefined; const filter = status ? { status } : {}; const [data, total] = await Promise.all([ContactEnquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ContactEnquiry.countDocuments(filter)]); res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); } catch (e) { next(e); } });
protectedApi.patch('/contacts/:id/status', ownerOrAdmin, async (req: AuthRequest, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid enquiry id' } }); const input = z.object({ status: z.enum(['new', 'reviewed', 'closed']) }).strict().safeParse(req.body); if (!input.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid enquiry status' } }); const data = await ContactEnquiry.findByIdAndUpdate(req.params.id, { $set: { status: input.data.status } }, { new: true, runValidators: true }); if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Enquiry not found' } }); await AuditLog.create({ actor: req.user?.id, action: `contact.${input.data.status}`, entity: 'contact_enquiry', entityId: data.id, requestId: req.id }); io?.to('admin-room').emit('admin:contacts:changed', { id: data.id, status: data.status }); res.json({ data }); } catch (e) { next(e); } });
protectedApi.post('/technicians', async (req: AuthRequest, res, next) => { try { const parsed = z.object({ name: z.string().min(2).max(100), phone: z.string().min(8).max(20), skills: z.array(z.string()), cities: z.array(z.string()), areas: z.array(z.string()).default([]), active: z.boolean().default(true) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid technician details' } }); const data = await Technician.create(parsed.data); await AuditLog.create({ actor: req.user?.id, action: 'technician.create', entity: 'technician', entityId: data.id, requestId: req.id }); res.status(201).json({ data }); } catch (e) { next(e); } });
protectedApi.get('/cities', async (_req, res, next) => { try { res.json({ data: await City.find().sort({ name: 1 }).lean() }); } catch (e) { next(e); } });
protectedApi.post('/cities', async (req: AuthRequest, res, next) => { try { const parsed = z.object({ name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]+$/), areas: z.array(z.string()), services: z.array(z.string()).default(['ac', 'ro', 'tv', 'washing-machine']), active: z.boolean().default(true) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid location details' } }); const data = await City.create(parsed.data); await AuditLog.create({ actor: req.user?.id, action: 'city.create', entity: 'city', entityId: data.id, requestId: req.id }); res.status(201).json({ data }); } catch (e) { next(e); } });
api.get('/settings', auth, ownerOrAdmin, async (_req, res, next) => { try { const row = await BusinessSettings.findOne({ key: 'public' }).lean(); res.json({ data: { businessName: 'RamLax Home Appliance Services', phone: row?.phone || process.env.BUSINESS_PHONE || '', whatsappPhone: row?.whatsappPhone || process.env.BUSINESS_WHATSAPP_PHONE || '', email: row?.email || process.env.BUSINESS_EMAIL || '', address: row?.address || process.env.BUSINESS_ADDRESS || '', appointmentWindows: row?.appointmentWindows || [], bookingLeadDays: row?.bookingLeadDays ?? 1, maxAdvanceDays: row?.maxAdvanceDays ?? 30 } }); } catch (e) { next(e); } });
api.put('/settings', auth, ownerOrAdmin, async (req: AuthRequest, res, next) => { try { const parsed = settingsSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid settings', fields: parsed.error.flatten().fieldErrors } }); if (parsed.data.appointmentWindows && new Set(parsed.data.appointmentWindows).size !== parsed.data.appointmentWindows.length) return res.status(400).json({ error: { code: 'DUPLICATE_WINDOWS', message: 'Appointment windows must be unique' } }); const current = await BusinessSettings.findOne({ key: 'public' }).lean(); const lead = parsed.data.bookingLeadDays ?? current?.bookingLeadDays ?? 1; const max = parsed.data.maxAdvanceDays ?? current?.maxAdvanceDays ?? 30; if (lead > max) return res.status(400).json({ error: { code: 'INVALID_BOOKING_HORIZON', message: 'Lead time cannot exceed the maximum advance window' } }); const data = await BusinessSettings.findOneAndUpdate({ key: 'public' }, { $set: parsed.data, $setOnInsert: { key: 'public' } }, { upsert: true, new: true }); await AuditLog.create({ actor: req.user?.id, action: 'settings.update', entity: 'settings', entityId: data.id, requestId: req.id }); res.json({ data: { phone: data.phone, whatsappPhone: data.whatsappPhone, email: data.email, address: data.address, appointmentWindows: data.appointmentWindows, bookingLeadDays: data.bookingLeadDays, maxAdvanceDays: data.maxAdvanceDays } }); } catch (e) { next(e); } });
protectedApi.patch('/settings', async (req: AuthRequest, res, next) => { try { const parsed = settingsSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid settings', fields: parsed.error.flatten().fieldErrors } }); if (parsed.data.appointmentWindows && new Set(parsed.data.appointmentWindows).size !== parsed.data.appointmentWindows.length) return res.status(400).json({ error: { code: 'DUPLICATE_WINDOWS', message: 'Appointment windows must be unique' } }); const current = await BusinessSettings.findOne({ key: 'public' }).lean(); const lead = parsed.data.bookingLeadDays ?? current?.bookingLeadDays ?? 1; const max = parsed.data.maxAdvanceDays ?? current?.maxAdvanceDays ?? 30; if (lead > max) return res.status(400).json({ error: { code: 'INVALID_BOOKING_HORIZON', message: 'Lead time cannot exceed the maximum advance window' } }); const data = await BusinessSettings.findOneAndUpdate({ key: 'public' }, { $set: parsed.data, $setOnInsert: { key: 'public' } }, { upsert: true, new: true }); await AuditLog.create({ actor: req.user?.id, action: 'settings.update', entity: 'settings', entityId: data.id, requestId: req.id }); res.json({ data: { phone: data.phone, whatsappPhone: data.whatsappPhone, email: data.email, address: data.address, appointmentWindows: data.appointmentWindows, bookingLeadDays: data.bookingLeadDays, maxAdvanceDays: data.maxAdvanceDays } }); } catch (e) { next(e); } });
protectedApi.get('/audit-logs', async (req, res, next) => { try { const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)); res.json({ data: await AuditLog.find().sort({ at: -1 }).limit(limit).lean() }); } catch (e) { next(e); } });
const errors: ErrorRequestHandler = (error, req, res, _next) => { req.log.error({ err: error, requestId: req.id }, 'request failed'); if (error?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'This record already exists' } }); return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }); };
app.use(errors);
if (!runningOnVercel) {
io = new SocketIOServer(httpServer, { cors: { origin: allowedOrigins, credentials: true } });
io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) return next(new Error('Authentication required'));
    const token = readAccessCookie(socket.handshake.headers.cookie);
    if (!token) return next(new Error('Authentication required'));
    const claims = jwt.verify(token, secret(), { issuer: 'ramlax-api', audience: 'ramlax-admin', algorithms: ['HS256'] }) as { id: string; role: string; sessionVersion?: number; exp?: number };
    const user = await AdminUser.findOne({ _id: claims.id, active: true }).select('role sessionVersion').lean();
    if (!user || !['owner', 'admin', 'staff'].includes(user.role) || user.role !== claims.role || (claims.sessionVersion ?? -1) !== (user.sessionVersion ?? 0)) return next(new Error('Authentication required'));
    socket.data.userId = claims.id;
    socket.data.expiresAt = (claims.exp || 0) * 1000;
    next();
  } catch { next(new Error('Authentication required')); }
});
io.on('connection', socket => {
  socket.join(['admin-room', `user:${socket.data.userId}`]);
  const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, Number(socket.data.expiresAt) - Date.now()));
  expiryTimer.unref();
  socket.on('disconnect', () => clearTimeout(expiryTimer));
});
}
const port = Number(process.env.PORT || 4000);
async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  await initializeDatabase();
  httpServer.listen(port, () => logger.info({ port }, 'API listening'));
}
if (!runningOnVercel && process.env.NODE_ENV !== 'test') start().catch(error => { logger.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, 'API startup failed; check required configuration and database connectivity'); process.exit(1); });
process.on('SIGTERM', () => {
  const finish = () => { void mongoose.disconnect().finally(() => process.exit(0)); };
  if (io) io.close(finish);
  else finish();
});
export { app };
export default app;
