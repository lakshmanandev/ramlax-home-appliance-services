import 'dotenv/config';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { z } from 'zod';
import { AdminUser } from '../models.js';

const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const email = z.string().email().safeParse(ADMIN_EMAIL?.trim() || '');
if (!MONGODB_URI || !email.success || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) throw new Error('Set MONGODB_URI, a valid ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters in the API environment.');
await mongoose.connect(MONGODB_URI);
try {
  if (await AdminUser.exists({})) throw new Error('An administrator already exists. Refusing to overwrite or add another bootstrap account.');
  await AdminUser.create({ email: email.data.toLowerCase(), passwordHash: await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id }), name: 'Business administrator', role: 'owner' });
  console.info('Bootstrap administrator created.');
} finally { await mongoose.disconnect(); }
