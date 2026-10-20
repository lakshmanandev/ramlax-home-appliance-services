import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import { api } from './api';

type Result = { reference: string; service: string; serviceType: string; status: string; preferredDate: string; preferredWindow: string; confirmedDate?: string; confirmedWindow?: string };
export default function BookingLookup() {
  const [reference, setReference] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try { const response = await api.post('/bookings/lookup', { reference: reference.trim().toUpperCase(), accessKey: accessKey.trim() }); setResult(response.data.data); }
    catch { setError('We could not verify that booking. Check the reference and access key, then try again.'); }
    finally { setBusy(false); }
  }
  return <section className="page-section"><div className="page-title"><span className="eyebrow">BOOKING STATUS</span><h1>Look up your request.</h1><p>Enter the reference and private access key shown after submitting your request.</p></div><form className="contact-card lookup-card" onSubmit={submit}><label className="field"><span>Booking reference *</span><input required autoComplete="off" value={reference} onChange={e => setReference(e.target.value)} placeholder="RL-2026-…"/></label><label className="field"><span>Private access key *</span><input required autoComplete="off" value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder="Paste your saved access key"/></label><p className="detail-note"><ShieldCheck size={18}/> The access key verifies your request. This page never displays your contact details or service address.</p><button className="button" disabled={busy}>{busy ? 'Checking…' : 'Check booking status'} <Search size={16}/></button>{error && <p role="alert" className="inline-error">{error}</p>}</form>{result && <div className="lookup-result"><span className={`status status-${result.status}`}>{result.status.replace('_', ' ')}</span><h2>{result.reference}</h2><p>{result.service} · {result.serviceType}</p><p>Preferred: {result.preferredDate} · {result.preferredWindow}</p>{result.confirmedDate && <p><b>Confirmed appointment:</b> {result.confirmedDate} · {result.confirmedWindow}</p>}<p className="form-help">A preferred time remains a request until the team confirms an appointment.</p><Link className="button button-outline" to="/">Back to home <ArrowRight size={16}/></Link></div>}</section>;
}
