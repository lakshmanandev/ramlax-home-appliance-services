import type { NextFunction, Request, RequestHandler, Response } from 'express';

type RequestWithRole = Request & { user?: { role: string } };

export function requireRoles(...roles: string[]): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const user = (request as RequestWithRole).user;
    if (!user || !roles.includes(user.role)) return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'This account does not have permission for this action' } });
    next();
  };
}
