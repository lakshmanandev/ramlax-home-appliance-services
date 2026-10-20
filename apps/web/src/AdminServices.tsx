import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, ImagePlus, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { ServiceView, ServiceTypeView, PriceKind } from '@ramlax/shared';
import { api } from './api';
import { serviceImageSource } from './serviceImages';

type City = { slug: string; name: string; areas: string[] };
type ServiceRow = ServiceView & { _id: string };
type AdminService = Omit<ServiceRow, 'serviceTypes'> & { serviceTypes: (ServiceTypeView & { _id: string })[] };
const blankService = { slug: '', name: '', short: '', description: '', icon: 'snowflake' };
const blankType = { name: '', slug: '', kind: 'quote' as PriceKind, amount: '', currency: 'INR', coverage: '', charges: '' };

function TextField({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="field"><span>{label}{required ? ' *' : ''}</span><input type={type} value={value} required={required} onChange={event => onChange(event.target.value)} /></label>;
}

export default function AdminServices() {
  const servicesQuery = useQuery<AdminService[]>({ queryKey: ['adminServices'], queryFn: async () => (await api.get('/admin/services')).data.data, retry: false });
  const citiesQuery = useQuery<City[]>({ queryKey: ['adminCities'], queryFn: async () => (await api.get('/admin/cities')).data.data, retry: false });
  const [serviceForm, setServiceForm] = useState(blankService);
  const [serviceEditId, setServiceEditId] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [typeEditId, setTypeEditId] = useState('');
  const [typeForm, setTypeForm] = useState(blankType);
  const [notice, setNotice] = useState('');
  const [uploadingImageSlot, setUploadingImageSlot] = useState<'card' | 'gallery' | ''>('');
  const activeService = servicesQuery.data?.find(service => service._id === selectedService);

  function editService(service: AdminService) {
    setServiceEditId(service._id);
    setServiceForm({ slug: service.slug, name: service.name, short: service.short, description: service.description, icon: service.icon });
  }
  function editType(type: AdminService['serviceTypes'][number]) {
    const enabledRules = type.availability.filter(rule => rule.active);
    setTypeEditId(type._id);
    setTypeForm({ name: type.name, slug: type.slug, kind: type.pricing.kind, amount: type.pricing.amount?.toString() || '', currency: type.pricing.currency, coverage: enabledRules.map(rule => `${rule.city}:${rule.areas.length ? rule.areas.join('|') : '*'}`).join(', '), charges: type.pricing.additionalCharges.map(charge => `${charge.name}:${charge.amount}`).join(', ') });
  }
  async function saveService(event: FormEvent) {
    event.preventDefault(); setNotice('Saving service…');
    try {
      if (serviceEditId) await api.patch(`/admin/services/${serviceEditId}`, { ...serviceForm, active: activeService?.active ?? true });
      else await api.post('/admin/services', { ...serviceForm, active: true });
      setNotice(serviceEditId ? 'Service saved.' : 'Service created.'); setServiceForm(blankService); setServiceEditId(''); await servicesQuery.refetch();
    } catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not save service.'); }
  }
  function priceConfig() {
    const charges = typeForm.charges.split(',').map(value => value.trim()).filter(Boolean).map(value => {
      const separator = value.lastIndexOf(':');
      return separator > 0 ? { name: value.slice(0, separator).trim(), amount: Number(value.slice(separator + 1).trim()) } : { name: value, amount: Number.NaN };
    });
    return { kind: typeForm.kind, ...(typeForm.kind === 'quote' ? {} : { amount: Number(typeForm.amount) }), currency: typeForm.currency, additionalCharges: charges };
  }
  async function saveType(event: FormEvent) {
    event.preventDefault();
    if (!selectedService) { setNotice('Choose a service category first.'); return; }
    const coverageTokens = typeForm.coverage.split(',').map(value => value.trim()).filter(Boolean);
    const availability = coverageTokens.map(token => {
      const separator = token.indexOf(':');
      const city = (separator < 0 ? token : token.slice(0, separator)).trim();
      const areaText = separator < 0 ? '*' : token.slice(separator + 1).trim();
      return { city, areas: areaText === '*' ? [] : areaText.split('|').map(area => area.trim()).filter(Boolean), active: true };
    });
    setNotice('Saving service type…');
    try {
      const payload = { name: typeForm.name, slug: typeForm.slug, active: true, availability, pricing: priceConfig() };
      if (typeEditId) await api.patch(`/admin/services/${selectedService}/types/${typeEditId}`, payload);
      else await api.post(`/admin/services/${selectedService}/types`, payload);
      setNotice(typeEditId ? 'Service type and pricing saved.' : 'Service type added.'); setTypeEditId(''); setTypeForm(blankType); await servicesQuery.refetch();
    } catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not save service type. Check its city and area configuration.'); }
  }
  async function archiveService(service: AdminService) {
    const action = service.active ? 'disable' : 'enable';
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${service.name}?`)) return;
    try { await api.patch(`/admin/services/${service._id}`, { active: !service.active }); setNotice(`${service.name} ${service.active ? 'disabled' : 'enabled'}.`); await servicesQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not update service.'); }
  }
  async function archiveType(type: AdminService['serviceTypes'][number]) {
    if (!window.confirm(`Archive ${type.name}? Existing bookings retain their saved price.`)) return;
    try { await api.delete(`/admin/services/${selectedService}/types/${type._id}`); setNotice('Service type archived.'); await servicesQuery.refetch(); }
    catch { setNotice('Could not archive service type.'); }
  }
  async function uploadImage(slot: 'card' | 'gallery', file: File) {
    if (!activeService) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setNotice('Choose a JPG, PNG, or WEBP image.'); return; }
    if (file.size > 1024 * 1024) { setNotice('Image must be 1 MB or smaller.'); return; }
    setUploadingImageSlot(slot); setNotice(`Uploading ${slot === 'card' ? 'service card' : 'gallery'} photo…`);
    try { await api.put(`/admin/services/${activeService._id}/images/${slot}`, file, { headers: { 'Content-Type': file.type } }); setNotice('Photo uploaded and saved.'); await servicesQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not upload photo.'); }
    finally { setUploadingImageSlot(''); }
  }
  async function removeImage(slot: 'card' | 'gallery') {
    if (!activeService || !window.confirm(`Remove the ${slot === 'card' ? 'service card' : 'gallery'} photo for ${activeService.name}?`)) return;
    try { await api.delete(`/admin/services/${activeService._id}/images/${slot}`); setNotice('Photo removed. The unique default photo will be shown.'); await servicesQuery.refetch(); }
    catch { setNotice('Could not remove photo.'); }
  }

  return <section className="page-section"><div className="page-title"><span className="eyebrow">RAMLAX ADMIN</span><h1>Services and pricing.</h1><p>Set customer-facing service details, price modes and the cities or areas where each service type can be requested.</p></div><nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link></nav>
    {servicesQuery.isError ? <div className="login-card"><h2>Sign in to continue</h2><Link className="button" to="/admin/login">Administrator sign in</Link></div> : <>
      <div className="admin-catalog-layout"><div className="admin-catalog-list"><h2>Appliance categories</h2>{servicesQuery.isLoading ? <p className="loading">Loading services…</p> : servicesQuery.data?.map(service => <article className={`admin-catalog-item ${selectedService === service._id ? 'active' : ''}`} key={service._id}><button className="catalog-select" onClick={() => { setSelectedService(service._id); setTypeEditId(''); setTypeForm(blankType); }}><b>{service.name}</b><small>{service.serviceTypes.length} service types · {service.active ? 'Active' : 'Disabled'}</small></button><button className="icon-button" aria-label={`Edit ${service.name}`} onClick={() => editService(service)}><Pencil size={15}/></button><button className="icon-button" aria-label={`${service.active ? 'Disable' : 'Enable'} ${service.name}`} onClick={() => archiveService(service)}>{service.active ? <Archive size={15}/> : <RotateCcw size={15}/>}</button></article>)}</div>
      <div className="admin-catalog-edit"><form className="contact-card" onSubmit={saveService}><h2>{serviceEditId ? 'Edit category' : 'Add category'}</h2><TextField label="Category name" value={serviceForm.name} onChange={name => setServiceForm(old => ({ ...old, name, slug: serviceEditId ? old.slug : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }))} required/><TextField label="URL slug" value={serviceForm.slug} onChange={slug => setServiceForm(old => ({ ...old, slug }))} required/><TextField label="Short label" value={serviceForm.short} onChange={short => setServiceForm(old => ({ ...old, short }))} required/><label className="field"><span>Icon</span><select value={serviceForm.icon} onChange={e => setServiceForm(old => ({ ...old, icon: e.target.value }))}><option value="snowflake">Air conditioning</option><option value="droplets">Water purifier</option><option value="tv">Television</option><option value="washing-machine">Washing machine</option></select></label><label className="field"><span>Description</span><textarea rows={3} required value={serviceForm.description} onChange={e => setServiceForm(old => ({ ...old, description: e.target.value }))}/></label><div className="form-actions"><button className="button"><Plus size={16}/>{serviceEditId ? 'Save category' : 'Create category'}</button>{serviceEditId && <button type="button" className="button button-quiet" onClick={() => { setServiceEditId(''); setServiceForm(blankService); }}>Cancel</button>}</div></form>
      <form className="contact-card service-type-form" onSubmit={saveType}><h2>{typeEditId ? 'Edit service type and price' : 'Add service type and price'}</h2><label className="field"><span>Appliance category *</span><select value={selectedService} onChange={e => { setSelectedService(e.target.value); setTypeEditId(''); setTypeForm(blankType); }} required><option value="">Select category</option>{servicesQuery.data?.filter(service => service.active).map(service => <option value={service._id} key={service._id}>{service.name}</option>)}</select></label><TextField label="Service type" value={typeForm.name} onChange={name => setTypeForm(old => ({ ...old, name, slug: typeEditId ? old.slug : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }))} required/><TextField label="Service type slug" value={typeForm.slug} onChange={slug => setTypeForm(old => ({ ...old, slug }))} required/><div className="form-grid"><label className="field"><span>Price mode *</span><select value={typeForm.kind} onChange={e => setTypeForm(old => ({ ...old, kind: e.target.value as PriceKind }))}><option value="quote">Quotation required</option><option value="fixed">Fixed price</option><option value="starting">Starting price</option></select></label>{typeForm.kind !== 'quote' && <TextField label="Amount" type="number" value={typeForm.amount} onChange={amount => setTypeForm(old => ({ ...old, amount }))} required/>}</div><TextField label="Currency code" value={typeForm.currency} onChange={currency => setTypeForm(old => ({ ...old, currency: currency.toUpperCase() }))} required/><TextField label="Additional charges (name:amount, comma separated)" value={typeForm.charges} onChange={charges => setTypeForm(old => ({ ...old, charges }))}/><TextField label="Coverage rules (city-slug:Area one|Area two, other-city:*)" value={typeForm.coverage} onChange={coverage => setTypeForm(old => ({ ...old, coverage }))} required/><small className="form-help">Use * for all areas in a configured city. Cities: {(citiesQuery.data || []).map(city => `${city.slug} (${city.areas.join(', ') || 'city-wide'})`).join(' · ') || 'Add a location first.'}</small><div className="form-actions"><button className="button"><Plus size={16}/>{typeEditId ? 'Save service type' : 'Add service type'}</button>{typeEditId && <button type="button" className="button button-quiet" onClick={() => { setTypeEditId(''); setTypeForm(blankType); }}>Cancel</button>}</div></form></div></div>
      {activeService && <section className="contact-card admin-image-manager"><div><span className="eyebrow">SERVICE PHOTOGRAPHY</span><h2>Photos for {activeService.name}</h2><p>Choose separate photos for the service cards and home page gallery. JPG, PNG, or WEBP · max 1 MB each.</p></div><div className="admin-service-image-grid">{(['card','gallery'] as const).map(slot=>{const imageUrl=slot==='card'?activeService.imageUrl:activeService.galleryImageUrl;return <article className="admin-service-image" key={slot}><h3>{slot==='card'?'Service card photo':'Gallery photo'}</h3><img src={serviceImageSource(activeService,slot)} alt={`Current ${slot} photo for ${activeService.name}`}/><label className="button button-outline admin-image-upload"><ImagePlus size={16}/>{uploadingImageSlot===slot?'Uploading…':imageUrl?'Replace photo':'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploadingImageSlot} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void uploadImage(slot,file);}}/></label>{imageUrl&&<button type="button" className="button button-quiet" disabled={!!uploadingImageSlot} onClick={()=>void removeImage(slot)}><Trash2 size={15}/>Remove uploaded photo</button>}</article>})}</div></section>}
      {activeService && <div className="admin-type-list"><h2>{activeService.name}: service types</h2>{activeService.serviceTypes.map(type => <article className="admin-type-row" key={type._id}><div><b>{type.name}</b><small>{type.pricing.kind === 'quote' ? 'Quotation required' : `${type.pricing.kind === 'starting' ? 'Starting at ' : 'Fixed '} ${type.pricing.currency} ${type.pricing.amount?.toLocaleString()}`} · {type.availability.filter(rule => rule.active).map(rule => `${rule.city}${rule.areas.length ? `: ${rule.areas.join(', ')}` : ': city-wide'}`).join(' · ') || 'No areas enabled'}</small></div><button className="icon-button" aria-label={`Edit ${type.name}`} onClick={() => editType(type)}><Pencil size={15}/></button><button className="icon-button" aria-label={`Archive ${type.name}`} onClick={() => archiveType(type)}><Archive size={15}/></button></article>)}{!activeService.serviceTypes.length && <p className="empty-table">No service types yet.</p>}</div>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </>}</section>;
}
