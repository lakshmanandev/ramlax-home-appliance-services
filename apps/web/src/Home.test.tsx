// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn() } }));

function renderHome() {
  const service = { slug: 'ac', name: 'Air Conditioner', short: 'AC', description: 'AC service at home.', icon: 'snowflake', serviceTypes: [{ slug: 'installation', name: 'AC installation', pricing: { kind: 'fixed', amount: 1500, currency: 'INR' } }] };
  vi.mocked(api.get).mockImplementation(async path => {
    if (!path) return { data: { data: [] } } as never;
    if (path === '/services') return { data: { data: [service] } } as never;
    if (path === '/settings/public') return { data: { data: { phone: '', whatsappPhone: '' } } } as never;
    if (path === '/locations') return { data: { data: [{ name: 'Chennai' }] } } as never;
    if (path === '/reviews') return { data: { data: [{ _id: 'approved-1', service: 'AC installation', rating: 5, displayName: 'A Customer', text: 'The booking follow-up was clear.' }] } } as never;
    throw new Error(`Unexpected public API request: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><App/></MemoryRouter></QueryClientProvider>);
}

describe('public homepage', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.mocked(api.get).mockReset());

  it('uses configured services, pricing, and booking links', async () => {
    renderHome();
    expect(await screen.findByText('AC installation')).toBeInTheDocument();
    expect(screen.getByText('INR 1,500')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /book service/i })).toHaveAttribute('href', '/book?service=ac');
    expect(api.get).toHaveBeenCalledWith('/services');
  });

  it('filters the illustrative service gallery accessibly', async () => {
    renderHome();
    expect(await screen.findByRole('button', { name: 'TV' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'TV' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'TV' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('link', { name: /Television setup/i })).toBeInTheDocument();
  });

  it('renders only the approved reviews returned by the public endpoint', async () => {
    renderHome();
    expect(await screen.findByText('The booking follow-up was clear.')).toBeInTheDocument();
    expect(screen.getByText('A Customer')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/reviews');
  });
});
