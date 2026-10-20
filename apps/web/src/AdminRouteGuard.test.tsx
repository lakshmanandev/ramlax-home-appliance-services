// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRouteGuard, { fetchAdminSession } from './AdminRouteGuard';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn() } }));

const privateRoutes = ['/admin', '/admin/bookings', '/admin/bookings/booking-id'];

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/login" element={<p>Admin sign in</p>}/>
    <Route element={<AdminRouteGuard><Outlet/></AdminRouteGuard>}>
      <Route path="/admin" element={<p>Protected dashboard</p>}/>
      <Route path="/admin/bookings" element={<p>Protected bookings</p>}/>
      <Route path="/admin/bookings/:id" element={<p>Protected booking detail</p>}/>
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('admin route guard', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.mocked(api.get).mockReset());

  it.each(privateRoutes)('redirects logged-out direct visits to %s before rendering private content', async path => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: null } });
    renderAt(path);
    expect(await screen.findByText('Admin sign in')).toBeInTheDocument();
    expect(screen.queryByText(/Protected (admin content|dashboard|bookings|booking detail)/)).not.toBeInTheDocument();
  });

  it('renders a protected route only after the session check succeeds', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { id: 'user', name: 'Admin', email: 'admin@example.test', role: 'owner' } } });
    renderAt('/admin/bookings');
    await waitFor(() => expect(screen.getByText('Protected bookings')).toBeInTheDocument());
  });

  it('maps an API 401 to a logged-out session and rethrows connection errors', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));
    await expect(fetchAdminSession()).resolves.toBeNull();
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(fetchAdminSession()).rejects.toThrow('Network unavailable');
  });
});
