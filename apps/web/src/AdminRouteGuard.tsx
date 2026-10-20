import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

type AdminUser = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'staff'; expiresAt: number };

export async function fetchAdminSession(): Promise<AdminUser | null> {
  try { return (await api.get('/auth/me')).data.data as AdminUser; }
  catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 401) return null;
    throw error;
  }
}

export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [sessionEnding, setSessionEnding] = useState(false);
  const session = useQuery({
    queryKey: ['adminSession'],
    queryFn: fetchAdminSession,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
  const status = (session.error as { response?: { status?: number } } | null)?.response?.status;
  const expiresAt = session.data?.expiresAt;
  const unauthenticated = session.data === null || status === 401 || sessionEnding;

  useEffect(() => {
    setSessionEnding(false);
    if (!expiresAt) return;
    const timeout = window.setTimeout(() => setSessionEnding(true), Math.max(0, expiresAt - Date.now() - 5_000));
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);

  useEffect(() => {
    if (unauthenticated) queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'adminSession' });
  }, [queryClient, unauthenticated]);

  if (session.isLoading) return <section className="page-section admin-auth-state" role="status" aria-live="polite"><span className="eyebrow">SECURE ADMIN</span><h1>Checking your session</h1><p>Please wait while we verify access.</p></section>;
  if (unauthenticated) return <Navigate to="/admin/login" replace state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash } }} />;
  if (session.isError) return <section className="page-section admin-auth-state" role="alert"><span className="eyebrow">ADMIN ACCESS</span><h1>We couldn’t verify your session.</h1><p>Check your connection and try again.</p><button className="button" onClick={() => void session.refetch()}>Try again</button></section>;
  return <>{children || <Outlet />}</>;
}
