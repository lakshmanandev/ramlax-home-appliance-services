import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { ServiceView } from '@ramlax/shared';
import { api } from './api';

type City = { name: string; slug: string; areas: string[]; services: string[] };
type Receipt = { reference: string; lookupToken: string; message: string };
function dateWithOffset(offset: number) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + offset, 12));
  return date.toISOString().slice(0, 10);
}

export default function BookingWizard() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstStepRender = useRef(true);
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', area: '', address: '', landmark: '', service: searchParams.get('service') || '', serviceType: '', applianceType: '', issue: '', preferredDate: '', preferredWindow: '', termsAccepted: false, marketingConsent: false });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const servicesQuery = useQuery({ queryKey: ['publicServices'], queryFn: async () => (await api.get('/services')).data.data as ServiceView[], retry: false });
  const citiesQuery = useQuery({ queryKey: ['publicLocations'], queryFn: async () => (await api.get('/locations')).data.data as City[], retry: false });
  const settingsQuery = useQuery({ queryKey: ['publicSettings'], queryFn: async () => (await api.get('/settings/public')).data.data as { appointmentWindows: string[]; bookingLeadDays: number; maxAdvanceDays: number }, retry: false });
  const selectedCity = citiesQuery.data?.find(city => city.slug === form.city);
  // The public catalog includes seeded service options before business coverage is configured.
  // Keep those services selectable; enforce active city/area coverage on the appointment step.
  const availableServices = (servicesQuery.data || []).filter(service => service.serviceTypes.length > 0);
  const selectedService = availableServices.find(service => service.slug === form.service);
  const selectedServiceTypes = selectedService?.serviceTypes || [];
  const availableTypes = selectedService && selectedCity && !selectedCity.services.includes(selectedService.slug) ? [] : selectedService?.serviceTypes.filter(type => type.availability.some(rule => rule.active && (!form.city || rule.city === form.city) && (!form.area || !rule.areas.length || rule.areas.includes(form.area)))) || [];
  const selectedType = availableTypes.find(type => type.slug === form.serviceType);
  const hasConfiguredCoverage = (servicesQuery.data || []).some(service => service.serviceTypes.some(type => type.availability.some(rule => rule.active)));
  const minDate = dateWithOffset(settingsQuery.data?.bookingLeadDays ?? 1);
  const maxDate = dateWithOffset(settingsQuery.data?.maxAdvanceDays ?? 30);
  const update = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await api.post('/bookings', {
        customer: { name: form.name, phone: form.phone, email: form.email }, service: form.service, serviceType: form.serviceType,
        appliance: { type: form.applianceType, issue: form.issue }, city: form.city, area: form.area, address: form.address,
        landmark: form.landmark || undefined, preferredDate: form.preferredDate, preferredWindow: form.preferredWindow,
        termsAccepted: form.termsAccepted, marketingConsent: form.marketingConsent,
      }, { headers: { 'Idempotency-Key': idempotencyKey.current } });
      setReceipt(response.data.data as Receipt);
      idempotencyKey.current = crypto.randomUUID();
    } catch (requestError) {
      const message = (requestError as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      setError(message || 'We could not send your request. Your details are still here; please try again.');
    } finally { setBusy(false); }
  };
  const field = (key: keyof typeof form, label: string, type = 'text', required = true) => <label className="field"><span>{label}{required ? ' *' : ''}</span><input type={type} required={required} value={String(form[key])} onChange={event => update(key, event.target.value)} /></label>;
  const continueStep = () => {
    if (step === 2) {
      if (citiesQuery.isError) {
        setError('Service cities could not be loaded. Please refresh the page or contact the team.');
        return;
      }
      if (!selectedCity) {
        setError('No service cities are configured yet. Please contact the team before continuing.');
        return;
      }
      if (settingsQuery.isError) {
        setError('Appointment times could not be loaded. Please refresh the page or contact the team.');
        return;
      }
      if (!settingsQuery.data?.appointmentWindows.includes(form.preferredWindow)) {
        setError('Appointment times are not configured yet. Please contact the team before continuing.');
        return;
      }
      if (!availableTypes.some(type => type.slug === form.serviceType)) {
        setError('This service type is not available for the selected location. Go back and choose a type that covers this area.');
        return;
      }
    }
    if (!formRef.current?.reportValidity()) return;
    setError('');
    setStep(value => Math.min(3, value + 1));
  };
  useEffect(() => { if (isFirstStepRender.current) { isFirstStepRender.current = false; return; } stepHeadingRef.current?.focus(); }, [step]);

  if (receipt) return <section className="bookings-screen"><div className="page-title"><span className="eyebrow">REQUEST RECEIVED</span><h1>Thanks, {form.name}.</h1><p>{receipt.message}</p></div><div className="contact-card success-card"><h2>Your request reference</h2><p className="booking-reference">{receipt.reference}</p><p>Save this private access key to check your request status later.</p><div className="lookup-key"><b>Private access key</b><code>{receipt.lookupToken}</code><small>Keep this key private. It is needed with your reference to view request status.</small></div><p><strong>Requested service:</strong> {selectedService?.name} · {selectedType?.name}</p><p><strong>Preferred appointment:</strong> {form.preferredDate} · {form.preferredWindow}</p><a className="button button-outline" href="/booking/lookup">Check booking status <ArrowRight size={16}/></a></div></section>;

  return <section className="bookings-screen">
    <div className="page-title"><span className="eyebrow">BOOK A SERVICE</span><h1>Tell us about your appliance.</h1><p>Share your details and preferred time. Our team will review coverage and confirm your appointment.</p></div>
    <form ref={formRef} className="contact-card booking-form" onSubmit={submit}>
      <nav className="booking-progress" aria-label="Booking steps"><ol>{['Service & location', 'Appointment', 'Your details'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step >= index + 1 ? 'complete' : ''}><span>{index + 1}</span><b>{label}</b></li>)}</ol><div className="booking-progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Step ${step} of 3`}><span style={{ width: `${step / 3 * 100}%` }}/></div></nav>
      <p className="sr-only" aria-live="polite">Step {step} of 3: {['Service and location', 'Appointment', 'Your details'][step - 1]}</p>
      {step === 1 && <section className="booking-step" key="step-one" aria-labelledby="step-one-title"><h2 ref={stepHeadingRef} tabIndex={-1} id="step-one-title">Choose a service and service type</h2><div className="booking-fields-grid">
        <label className="field"><span>Service *</span><select required value={form.service} onChange={event => { update('service', event.target.value); update('serviceType', ''); }}><option value="">Choose service</option>{availableServices.map(service => <option key={service.slug} value={service.slug}>{service.name}</option>)}</select></label>
        <label className="field"><span>Service type *</span><select required value={form.serviceType} disabled={!form.service} onChange={event => update('serviceType', event.target.value)}><option value="">Choose service type</option>{selectedServiceTypes.map(type => <option key={type.slug} value={type.slug}>{type.name}</option>)}</select>{form.service && !selectedServiceTypes.length && <small>Service types have not been configured for this appliance.</small>}</label>
      </div></section>}
      {step === 2 && <section className="booking-step" key="step-two" aria-labelledby="step-two-title"><h2 ref={stepHeadingRef} tabIndex={-1} id="step-two-title">Choose your location and appointment</h2><div className="booking-fields-grid">
        <label className="field"><span>City *</span><select required value={form.city} disabled={citiesQuery.isLoading || !citiesQuery.data?.length} onChange={event => { update('city', event.target.value); update('area', ''); }}><option value="">{citiesQuery.isLoading ? 'Loading cities…' : citiesQuery.data?.length ? 'Choose city' : 'No service cities configured'}</option>{(citiesQuery.data || []).map(city => <option key={city.slug} value={city.slug}>{city.name}</option>)}</select>{!citiesQuery.isLoading && !citiesQuery.isError && !citiesQuery.data?.length && <span className="booking-setup-note">Online booking needs a configured service city. <Link to="/contact">Contact the team</Link> for help.</span>}{citiesQuery.isError && <span className="booking-setup-note" role="alert">Service cities could not be loaded. Refresh the page or <Link to="/contact">contact the team</Link>.</span>}</label>
        <label className="field"><span>Area *</span>{selectedCity?.areas.length ? <select required value={form.area} onChange={event => update('area', event.target.value)}><option value="">Choose area</option>{selectedCity.areas.map(area => <option key={area} value={area}>{area}</option>)}</select> : <input required value={form.area} onChange={event => update('area', event.target.value)} placeholder="Enter your area" />}</label>
        <label className="field"><span>Preferred date *</span><input type="date" required min={minDate} max={maxDate} value={form.preferredDate} onChange={event => update('preferredDate', event.target.value)}/></label>
        <label className="field"><span>Preferred time *</span><select required value={form.preferredWindow} disabled={settingsQuery.isLoading || !settingsQuery.data?.appointmentWindows.length} onChange={event => update('preferredWindow', event.target.value)}><option value="">{settingsQuery.isLoading ? 'Loading times…' : settingsQuery.data?.appointmentWindows.length ? 'Choose a time' : 'No appointment times configured'}</option>{(settingsQuery.data?.appointmentWindows || []).map(window => <option key={window} value={window}>{window}</option>)}</select>{!settingsQuery.isLoading && !settingsQuery.isError && !settingsQuery.data?.appointmentWindows.length && <span className="booking-setup-note">Online booking needs appointment windows. <Link to="/contact">Contact the team</Link> for help.</span>}{settingsQuery.isError && <span className="booking-setup-note" role="alert">Appointment times could not be loaded. Refresh the page or <Link to="/contact">contact the team</Link>.</span>}</label>
      </div>{selectedCity && !availableTypes.some(type => type.slug === form.serviceType) && <p className="inline-error" role="alert">That service type is not available in this location. Go back and choose a service type that covers this city and area.</p>}<div className="booking-fields-grid">{field('applianceType', 'Appliance model or type')}{field('landmark', 'Nearby landmark', 'text', false)}
        <label className="field field-wide"><span>Service address *</span><textarea required minLength={5} maxLength={500} value={form.address} onChange={event => update('address', event.target.value)} rows={3}/></label>
        <label className="field field-wide"><span>What do you need help with?</span><textarea maxLength={100} value={form.issue} onChange={event => update('issue', event.target.value)} rows={3}/></label>
      </div>
      </section>}
      {step === 3 && <section className="booking-step" key="step-three" aria-labelledby="step-three-title"><h2 ref={stepHeadingRef} tabIndex={-1} id="step-three-title">Your contact details</h2><div className="booking-fields-grid">{field('name', 'Your name')}{field('phone', 'Phone number', 'tel')}{field('email', 'Email address', 'email', false)}</div><div className="booking-review"><h3>Review your request</h3><p><b>Service</b><span>{selectedService?.name} · {selectedType?.name}</span></p><p><b>Location</b><span>{selectedCity?.name}, {form.area}<br/>{form.address}</span></p><p><b>Preferred appointment</b><span>{form.preferredDate} · {form.preferredWindow}</span></p><p><b>Appliance</b><span>{form.applianceType}{form.issue ? ` · ${form.issue}` : ''}</span></p></div>
      <label className="check-field"><input type="checkbox" required checked={form.termsAccepted} onChange={event => update('termsAccepted', event.target.checked)}/><span>I agree to the <a href="/terms">service terms</a> and understand the requested time is not confirmed until the team contacts me. *</span></label>
      <label className="check-field"><input type="checkbox" checked={form.marketingConsent} onChange={event => update('marketingConsent', event.target.checked)}/><span>Send me occasional service updates and offers.</span></label></section>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      {servicesQuery.isError && <p role="alert" className="inline-error">Service options could not be loaded. Refresh the page and try again.</p>}
      {citiesQuery.isError && <p role="alert" className="inline-error">Service locations could not be loaded. Refresh the page and try again.</p>}
      {!servicesQuery.isLoading && !servicesQuery.isError && !servicesQuery.data?.length && <p className="inline-error">Online services are not configured yet. Please contact the team.</p>}
      {!servicesQuery.isLoading && !servicesQuery.isError && !!servicesQuery.data?.length && !hasConfiguredCoverage && <p className="inline-error" role="status">Service options are listed, but service areas have not been configured yet. An administrator needs to set service coverage and appointment times before requests can be submitted.</p>}
      {settingsQuery.isError && <p className="inline-error">Booking availability could not be loaded. Please refresh and try again.</p>}
      <div className="booking-form-foot"><p><ShieldCheck size={17}/> We use your details to review and follow up on this request.</p><div className="booking-actions">{step > 1 && <button type="button" className="button button-outline" onClick={() => { setError(''); setStep(value => value - 1); }}>Back</button>}{step < 3 ? <button type="button" className="button" onClick={continueStep}>Continue <ArrowRight size={17}/></button> : <button className="button" disabled={busy || !settingsQuery.data?.appointmentWindows.length || !citiesQuery.data?.length || !servicesQuery.data?.length}>{busy ? 'Sending request…' : 'Submit service request'} <ArrowRight size={17}/></button>}</div></div>
    </form>
  </section>;
}
