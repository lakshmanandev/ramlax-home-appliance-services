import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Import in test mode so the API app never starts its MongoDB-backed service.
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  const { app } = await import('./server.js');
  server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the isolated API test listener');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe('administrative API authentication boundary', () => {
  it.each([
    ['GET', '/api/v1/admin/bookings'],
    ['GET', '/api/v1/admin/services'],
    ['POST', '/api/v1/admin/services'],
    ['PATCH', '/api/v1/admin/services/not-an-id'],
    ['GET', '/api/v1/admin/cities'],
    ['POST', '/api/v1/admin/technicians'],
    ['PATCH', '/api/v1/admin/bookings/not-an-id/payment'],
    ['GET', '/api/v1/admin/reviews'],
    ['GET', '/api/v1/admin/reports'],
    ['GET', '/api/v1/settings'],
    ['PUT', '/api/v1/settings'],
    ['GET', '/api/v1/auth/me'],
  ] as const)('%s %s rejects requests without an admin session', async (method, path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({ active: false }),
    });
    expect(response.status).toBe(401);
    const body = await response.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|accessToken|stack/i);
  });

  it('rejects cross-origin state-changing requests', async () => {
    const response = await fetch(`${baseUrl}/api/v1/admin/services`, {
      method: 'POST',
      headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Injected service' }),
    });
    expect(response.status).toBe(403);
    expect((await response.json() as { error?: { code?: string } }).error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rejects invalid cookies and clears them on logout', async () => {
    const protectedResponse = await fetch(`${baseUrl}/api/v1/admin/bookings`, { headers: { cookie: 'accessToken=invalid-token' } });
    expect(protectedResponse.status).toBe(401);
    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST', headers: { cookie: 'accessToken=invalid-token' } });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get('set-cookie')).toContain('accessToken=;');
  });
});
