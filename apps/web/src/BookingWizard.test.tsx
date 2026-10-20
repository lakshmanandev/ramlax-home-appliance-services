// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingWizard from './BookingWizard';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

describe('booking catalog with incomplete business setup', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async path => {
      if (path === '/services') return { data: { data: [{ slug: 'ac', name: 'Air conditioning', serviceTypes: [{ slug: 'installation', name: 'Installation', availability: [], pricing: { kind: 'quote', currency: 'INR' } }] }] } } as never;
      if (path === '/locations') return { data: { data: [] } } as never;
      if (path === '/settings/public') return { data: { data: { appointmentWindows: [], bookingLeadDays: 1, maxAdvanceDays: 30 } } } as never;
      if (!path) return { data: { data: [] } } as never;
      throw new Error(`Unexpected booking API request: ${path}`);
    });
  });

  it('keeps seeded appliance options visible and explains that booking needs configured coverage', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/book']}><BookingWizard/></MemoryRouter></QueryClientProvider>);

    const serviceSelect = await screen.findByLabelText('Service *') as HTMLSelectElement;
    expect(await screen.findByRole('option', { name: 'Air conditioning' })).toBeInTheDocument();
    expect(serviceSelect.querySelector('option[value="ac"]')).toHaveTextContent('Air conditioning');
    fireEvent.change(serviceSelect, { target: { value: 'ac' } });
    const typeSelect = screen.getByLabelText('Service type *') as HTMLSelectElement;
    expect(typeSelect.querySelector('option[value="installation"]')).toHaveTextContent('Installation');
    expect(await screen.findByRole('status')).toHaveTextContent(/service areas have not been configured/i);
    fireEvent.change(typeSelect, { target: { value: 'installation' } });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByRole('combobox', { name: /city/i })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'No service cities configured' })).toBeInTheDocument();
    expect(screen.getByText(/online booking needs a configured service city/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /preferred time/i })).toBeDisabled();
    expect(screen.getByText(/online booking needs appointment windows/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no service cities are configured yet/i);
  });
});
