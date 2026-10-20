import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireRoles } from './authorization.js';

function invoke(role: string | undefined, middleware = requireRoles('owner', 'admin')) {
  const request = (role ? { user: { role } } : {}) as Request;
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  middleware(request, response, next);
  return { response, next };
}

describe('admin role authorization', () => {
  it('returns 403 for an authenticated staff user on owner/admin actions', () => {
    const { response, next } = invoke('staff');
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'This account does not have permission for this action' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows authorized roles to continue', () => {
    const owner = invoke('owner');
    const admin = invoke('admin');
    expect(owner.next).toHaveBeenCalledOnce();
    expect(admin.next).toHaveBeenCalledOnce();
  });

  it('does not treat a missing user as an authenticated role', () => {
    const { response, next } = invoke(undefined);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
