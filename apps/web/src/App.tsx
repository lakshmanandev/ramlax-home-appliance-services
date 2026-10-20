import { useEffect, useState } from 'react';
import { Link, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AirVent, ArrowRight, Check, ChevronRight, Droplets, Eye, EyeOff, Menu, Phone, ShieldCheck, Tv, WashingMachine, X, MessageCircle, Wrench, CalendarCheck, ClipboardList, Headset, BadgeCheck, MapPin } from 'lucide-react';
import type { ServiceView } from '@ramlax/shared';
import BookingWizard from './BookingWizard';
import AdminServices from './AdminServices';
import AdminBookings from './AdminBookingsPage';
import AdminBookingDetail from './AdminBookingDetail';
import BookingLookup from './BookingLookup';
import AdminSettingsPage from './AdminSettingsPage';
import AdminLocations from './AdminLocations';
import { AdminReports, AdminReviews } from './AdminInsights';
import { api } from './api';
import AdminNavigation from './AdminNavigation';
import AdminContactsPage from './AdminContactsPage';
import AdminRouteGuard from './AdminRouteGuard';
import brandFavicon from '../favicon.svg';

function useServices() { return useQuery<ServiceView[]>({ queryKey: ['services'], queryFn: async () => (await api.get('/services')).data.data }); }
function serviceIcon(icon: string) { return ({ snowflake: AirVent, droplets: Droplets, tv: Tv, 'washing-machine': WashingMachine } as Record<string, typeof AirVent>)[icon] || Wrench; }
function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const { data } = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings/public')).data.data, retry: false });
  const whatsapp = data?.whatsappPhone ? `https://wa.me/${String(data.whatsappPhone).replace(/\D/g, '')}?text=${encodeURIComponent('Hello, I would like to enquire about a home appliance service.')}` : null;
  const phoneHref = data?.phone ? `tel:${String(data.phone).replace(/\s+/g, '')}` : undefined;

  useEffect(() => {
    const pageTitles: Record<string, string> = {
      '/': 'Home appliance service and installation', '/services': 'Home appliance services', '/book': 'Book a home appliance service',
      '/booking/lookup': 'Check a booking request', '/about': 'About RamLaksh', '/contact': 'Contact RamLaksh', '/faqs': 'Service FAQs',
      '/terms': 'Service terms', '/privacy': 'Privacy policy', '/cancellation': 'Cancellation policy', '/admin/login': 'Administrator sign in',
      '/admin': 'Manage bookings', '/admin/bookings': 'Manage bookings', '/admin/contacts': 'Customer enquiries', '/admin/services': 'Manage services and pricing', '/admin/locations': 'Manage service locations',
      '/admin/technicians': 'Manage technicians', '/admin/settings': 'Business settings', '/admin/reviews': 'Review moderation', '/admin/reports': 'Booking reports',
    };
    const title = pageTitles[location.pathname] || (location.pathname.startsWith('/services/') ? 'Appliance service details' : location.pathname.startsWith('/admin/bookings/') ? 'Booking details' : 'Page not found');
    document.title = `${title} | RamLaksh Home Appliance Services`;
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon); }
    favicon.href = brandFavicon;
    const description = location.pathname === '/' ? 'Request home appliance installation and service from RamLaksh Home Appliance Services. We’ll confirm coverage and appointment availability with you.' : 'Request home appliance installation and service. Contact RamLaksh Home Appliance Services for configured coverage and appointment information.';
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [location.pathname]);

  return <>{!isAdmin && <header className="topbar"><div className="nav-wrap"><Link className="brand" to="/"><span className="brand-mark">RL</span><span className="brand-text"><strong>RamLaksh</strong><small>Home appliance services</small></span></Link><button className="menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button><nav className={open ? 'nav-links open' : 'nav-links'}><Link onClick={() => setOpen(false)} to="/services">Services</Link><Link onClick={() => setOpen(false)} to="/about">About</Link><Link onClick={() => setOpen(false)} to="/contact">Contact</Link><Link className="button button-small" onClick={() => setOpen(false)} to="/book">Book a service <ArrowRight size={16}/></Link></nav></div></header>}<main className={isAdmin ? 'admin-layout' : ''}>{children}</main>{!isAdmin && <><footer className="footer"><div className="footer-grid"><div><Link className="brand brand-light" to="/"><span className="brand-mark">RL</span><span className="brand-text"><strong>RamLaksh</strong><small>Home appliance services</small></span></Link><p>Appliance installation and service for your home.</p></div><div><strong>Explore</strong><Link to="/services">All services</Link><Link to="/about">About us</Link></div><div><strong>Help</strong><Link to="/contact">Contact</Link><Link to="/faqs">FAQs</Link><Link to="/terms">Service terms</Link><Link to="/privacy">Privacy policy</Link></div><div><strong>Get in touch</strong>{data?.phone && <a href={phoneHref}><Phone size={15}/> {data.phone}</a>}{data?.email && <a href={`mailto:${data.email}`}>{data.email}</a>}{!data?.phone && !data?.email && <span>Contact details available soon</span>}</div></div><div className="footer-bottom">© {new Date().getFullYear()} RamLaksh Home Appliance Services <span>Service availability is confirmed by our team after your request.</span></div></footer>{whatsapp && <a className="whatsapp-float" href={whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp enquiry"><MessageCircle/></a>}</>}</>;
}
function Home() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings/public')).data.data, retry: false });
  const phone = settings.data?.phone as string | undefined;
  const whatsappPhone = settings.data?.whatsappPhone as string | undefined;
  const whatsapp = whatsappPhone ? `https://wa.me/${whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hello, I would like to enquire about a home appliance service.')}` : null;
  return <>
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot"/> HOME APPLIANCE CARE</span>
          <h1>Reliable appliance care, right at your doorstep.</h1>
          <p>Request installation or service for your appliances. We’ll review your details and contact you to confirm coverage and availability.</p>
          <div className="hero-actions">
            <Link className="button" to="/book">Book a service <ArrowRight size={18}/></Link>
            <a className="button button-outline" href="#services">Explore services</a>
            <a className="hero-how-link" href="#how-it-works">How it works <ArrowRight size={16}/></a>
          </div>
          <div className="hero-badges">
            <span><Check size={14}/> Appointment confirmed by our team</span>
            <span><Check size={14}/> Service options shown before booking</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-image" role="img" aria-label="Technician working on an air conditioner in a home">
            <div className="art-label"><span><b>Service for your home</b><small>Installation · maintenance · repair</small></span></div>
          </div>
        </div>
      </div>
      <div className="hero-bottom">
        <span>REPAIR · INSTALLATION · MAINTENANCE</span>
        <span>Service requests across configured locations</span>
      </div>
    </section>

    <section className="section services-section" id="services">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WHAT WE CAN HELP WITH</span>
          <h2>Care for the essentials.</h2>
          <p>Choose an appliance to see the services you can request.</p>
        </div>
        <Link className="text-link" to="/services">View all services <ArrowRight size={17}/></Link>
      </div>
      <ServiceCards />
    </section>

    <section className="section why-section" aria-labelledby="why-title"><div className="section-heading"><div><span className="eyebrow">A MORE CONSIDERED SERVICE</span><h2 id="why-title">What you can expect.</h2><p>Clear information at each step, from your first request to the team’s follow-up.</p></div></div><div className="trust-grid"><TrustCard icon={<CalendarCheck/>} title="Convenient appointment request" body="Choose a preferred date and time when you book. Our team confirms availability with you."/><TrustCard icon={<ClipboardList/>} title="Service details upfront" body="See the currently configured service options and pricing before you submit a request."/><TrustCard icon={<BadgeCheck/>} title="A reference for follow-up" body="Save your booking reference after submitting so you can check the request later."/><TrustCard icon={<Headset/>} title="Direct communication" body="Our team follows up using the contact details you provide to review coverage and next steps."/></div></section>
    <section className="section gallery-section" aria-labelledby="gallery-title"><div className="section-heading"><div><span className="eyebrow">OUR SERVICES IN PICTURES</span><h2 id="gallery-title">Appliance care around the home.</h2><p>Illustrative stock photos of the appliances and service types you can request. They are not customer project photos.</p></div><Link className="text-link" to="/services">Explore services <ArrowRight size={17}/></Link></div><ServiceGallery/></section>
    <section className="section process-section" id="how-it-works">
      <div className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A CLEARER WAY TO BOOK</span>
            <h2>Three clear steps to get started.</h2>
            <p>Your preferred time is a request. Our team confirms the schedule with you.</p>
          </div>
        </div>
        <div className="steps">
          <Step n="01" title="Choose your appliance" body="Select one of the services currently configured for your appliance."/>
          <Step n="02" title="Share the details" body="Add your location, contact number and preferred visit window."/>
          <Step n="03" title="Get your reference" body="Submit your request, save the booking reference, and our team will follow up to confirm coverage and availability."/>
        </div>
      </div>
    </section>

    <section className="section home-faq-section" aria-labelledby="home-faq-title"><div className="section-heading"><div><span className="eyebrow">BEFORE YOU BOOK</span><h2 id="home-faq-title">Good to know.</h2><p>Helpful details about requests, pricing and service areas.</p></div><Link className="text-link" to="/faqs">All FAQs <ArrowRight size={16}/></Link></div><div className="faq-list"><details><summary>When is my appointment confirmed?<ChevronRight size={18}/></summary><p>Your chosen time is a preference. The team will check availability and contact you to confirm.</p></details><details><summary>How much will the service cost?<ChevronRight size={18}/></summary><p>Configured pricing is shown with each service option. Any additional work or charges will be discussed before the appointment.</p></details><details><summary>Which areas do you serve?<ChevronRight size={18}/></summary><p>Booking options are available for locations configured in the service system.</p></details></div></section>
    <ServiceCoverage />
    <ApprovedReviews/>
    <section className="contact-strip" aria-label="Contact RamLaksh"><div><span className="eyebrow">HERE TO HELP</span><h2>Questions before you book?</h2><p>Get in touch with our team or send us a WhatsApp message.</p></div><div className="contact-strip-actions">{phone&&<a className="button button-outline" href={`tel:${phone.replace(/[^+\d]/g,'')}`}><Phone size={17}/>Call us</a>}{whatsapp&&<a className="button" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17}/>WhatsApp</a>}<Link className="text-link" to="/contact">Contact us <ArrowRight size={16}/></Link></div></section>
    <section className="cta-band">
      <div>
        <span className="eyebrow">READY WHEN YOU ARE</span>
        <h2>Let’s get your home back in rhythm.</h2>
        <p>Send a service request in just a few minutes.</p>
      </div>
      <Link className="button button-white" to="/book">Start a booking <ArrowRight size={18}/></Link>
    </section>
  </>;
}
function Step({ n, title, body }: { n: string; title: string; body: string }) { return <article className="step-card"><span>{n}</span><h3>{title}</h3><p>{body}</p></article> }
const applianceImages: Record<string,string> = {
  ac: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1000&q=80',
  tv: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1000&q=80',
  ro: 'https://images.unsplash.com/photo-1662454378054-8613b673b11e?auto=format&fit=crop&w=1000&q=80',
  'washing-machine': 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=1000&q=80',
};
function imageForService(slug: string) { return applianceImages[slug] || applianceImages.ac; }
function ServiceCards() { const query=useServices(); if(query.isLoading)return <div className="loading-panel" aria-label="Loading services"><span/><span/><span/><span/></div>; if(query.isError)return <p className="inline-error" role="alert">Services are temporarily unavailable. Please try again shortly.</p>; if(!query.data?.length)return <div className="empty-state"><h3>Services are being configured.</h3><p>Please check back soon.</p></div>; return <div className="service-grid">{query.data.map((service, i) => { const Icon = serviceIcon(service.icon); const preview=service.serviceTypes.slice(0,3); const price=preview[0]?.pricing; const label=!price||price.kind==='quote'||price.amount==null?'Get a quote':`${price.kind==='starting'?'From ':''}${price.currency} ${price.amount.toLocaleString('en-IN')}`; return <article className="service-card" key={service.slug}><Link className="service-image-link" to={`/services/${service.slug}`} aria-label={`Explore ${service.name}`}><img className="service-photo" src={imageForService(service.slug)} alt={`${service.name} appliance in a home`} loading="lazy" decoding="async"/><span className={`service-icon tone-${i%4}`}><Icon size={21}/></span></Link><div className="service-card-body"><div className="service-card-heading"><h3>{service.name}</h3><span className="service-count">{String(i+1).padStart(2,'0')}</span></div><p>{service.description}</p>{preview.length>0&&<ul className="service-type-list">{preview.map(type=><li key={type.slug}>{type.name}</li>)}</ul>}<div className="service-card-bottom"><strong>{label}</strong><Link className="card-link" to={`/book?service=${encodeURIComponent(service.slug)}`}>Book service <ArrowRight size={16}/></Link></div></div></article> })}</div> }
function TrustCard({icon,title,body}:{icon:React.ReactNode;title:string;body:string}) { return <article className="trust-card"><span className="trust-icon">{icon}</span><h3>{title}</h3><p>{body}</p></article> }
function ServiceCoverage(){const query=useQuery<{name:string}[]>({queryKey:['publicLocations'],queryFn:async()=>(await api.get('/locations')).data.data,retry:false});if(query.isLoading||query.isError||!query.data?.length)return null;return <section className="coverage-strip" aria-label="Configured service locations"><MapPin size={19}/><div><strong>Configured service locations</strong><p>{query.data.map(city=>city.name).join(' · ')}</p></div></section>}
const galleryItems=[{label:'Air conditioner service',alt:'Technician servicing a wall-mounted air conditioner',slug:'ac'},{label:'Television setup',alt:'Television set up in a modern living room',slug:'tv'},{label:'Water purifier',alt:'Water purifier in a home kitchen',slug:'ro'},{label:'Washing machine care',alt:'Washing machine in a clean laundry area',slug:'washing-machine'}];
function ServiceGallery(){const [active,setActive]=useState('all');const filters=[['all','All'],['ac','AC'],['tv','TV'],['ro','Water purifier'],['washing-machine','Washing machine']];const items=active==='all'?galleryItems:galleryItems.filter(item=>item.slug===active);return <><div className="gallery-filters" role="group" aria-label="Filter service examples">{filters.map(([key,label])=><button type="button" key={key} aria-pressed={active===key} className={active===key?'active':''} onClick={()=>setActive(key)}>{label}</button>)}</div><div className="service-gallery">{items.map(item=><Link className="gallery-tile" key={item.slug} to={`/services/${item.slug}`}><img src={imageForService(item.slug)} alt={item.alt} loading="lazy" decoding="async"/><span>{item.label}<ArrowRight size={16}/></span></Link>)}</div></>}
type PublicReview={_id:string;service:string;rating?:number;text:string;displayName:string};
function ApprovedReviews(){const query=useQuery<PublicReview[]>({queryKey:['publicReviews'],queryFn:async()=>(await api.get('/reviews')).data.data,retry:false});if(query.isLoading||query.isError||!query.data?.length)return null;return <section className="section reviews-section" aria-labelledby="reviews-title"><div className="section-heading"><div><span className="eyebrow">CUSTOMER FEEDBACK</span><h2 id="reviews-title">A few words from customers.</h2><p>Reviews shown here have been approved by the team.</p></div></div><div className="public-review-grid">{query.data.slice(0,3).map(review=><article className="public-review" key={review._id}>{typeof review.rating==='number'&&<div className="review-rating" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}<span>{'★'.repeat(5-review.rating)}</span></div>}<blockquote>{review.text}</blockquote><div className="review-byline"><strong>{review.displayName}</strong><span>{review.service}</span></div></article>)}</div></section>}
function Services() { return <section className="page-section"><PageTitle eyebrow="OUR SERVICES" title="The help your appliances need." subtitle="Explore service options for the appliances that keep your home running."/><ServiceCards/></section> }
function ServiceDetail() { const { slug } = useParams(); const query=useQuery<ServiceView>({queryKey:['service',slug],queryFn:async()=>(await api.get(`/services/${slug}`)).data.data,enabled:!!slug,retry:false}); if(query.isLoading)return <section className="page-section"><p className="loading">Loading service details…</p></section>; const service=query.data; if(query.isError||!service)return <NotFound/>; return <section className="page-section"><div className="detail-hero"><div><span className="eyebrow">RAMLAX HOME SERVICES</span><h1>{service.name}<br/><em>service & repair</em></h1><p>{service.description} Tell us what you need and our team will follow up to confirm location coverage and availability.</p><Link className="button" to={`/book?service=${service.slug}`}>Request this service <ArrowRight size={17}/></Link></div><div className="detail-list"><h3>Configured service types</h3>{service.serviceTypes.map(type=><div className="type-row" key={type.slug}><Check size={17}/><span>{type.name}</span><small>{type.pricing.kind==='quote'?'Quote required':`${type.pricing.kind==='starting'?'From ':''}${type.pricing.currency} ${type.pricing.amount?.toLocaleString()}`}</small></div>)}{!service.serviceTypes.length&&<p>No active service types yet.</p>}<p>Additional work or charges are confirmed with you before the appointment.</p></div></div><div className="detail-note"><ShieldCheck/><span><b>Appointment confirmation</b><br/>The date and time you select are preferences. Our team confirms a visit after checking availability.</span></div></section> }
function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div> }
function Book() { return <BookingWizard/> }
function Field({ label,name,value,set,required,type='text' }: {label:string;name:string;value:string;set:(n:string,v:string|boolean)=>void;required?:boolean;type?:string}) {return <label className="field"><span>{label}{required?' *':''}</span><input name={name} type={type} value={value} required={required} onChange={e=>set(name,e.target.value)}/></label>}
function About() { return <section className="page-section"><PageTitle eyebrow="ABOUT RAMLAX" title="Appliance care, made clearer." subtitle="RamLax Home Appliance Services helps households request installation, maintenance and repair for essential home appliances."/><div className="content-narrow"><h2>How we work</h2><p>We collect your service details and preferred visit time, then check the configured location coverage and follow up to confirm availability and applicable pricing.</p><p>We are building a dependable service experience around clear communication and practical care for your home.</p><div className="detail-note"><ShieldCheck/><span>We only show cities and areas that have been configured in our service system.</span></div></div></section> }
function Contact() {const [form,setForm]=useState({name:'',phone:'',message:''});const [status,setStatus] = useState('');const [busy,setBusy] = useState(false);const update=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));return <section className="page-section"><PageTitle eyebrow="CONTACT" title="How can we help?" subtitle="Send a question to our team. We’ll get back to you using the phone number you provide."/><form className="contact-card" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setStatus('Sending…');try{await api.post('/contact',form);setStatus('Thanks. Your enquiry was received.');setForm({name:'',phone:'',message:''});}catch{setStatus('We could not send that enquiry. Please try again.');}finally{setBusy(false);}}}><Field label="Your name" name="name" value={form.name} set={(_,v)=>update('name',String(v))} required/><Field label="Phone number" name="phone" value={form.phone} set={(_,v)=>update('phone',String(v))} type="tel" required/><label className="field"><span>Your message *</span><textarea value={form.message} onChange={e=>update('message',e.target.value)} required rows={4}/></label><button className="button" disabled={busy}>{busy?'Sending…':'Send enquiry'} <ArrowRight size={17}/></button>{status&&<p role="status">{status}</p>}</form></section>}
function Faqs() {return <section className="page-section"><PageTitle eyebrow="HELP & INFORMATION" title="Frequently asked questions." subtitle="A few things to know before you request a service."/><div className="faq-list">{[['When is my appointment confirmed?','Your preferred date and time are a request only. Our team will contact you after checking availability.'],['How much will my service cost?','Pricing depends on your appliance and the work required. The team will share applicable charges before confirming.'],['Which areas do you serve?','Only cities and areas enabled in our service system are available for bookings.'],['Can I request more than one appliance?','Please create one request per appliance so our team can review each job clearly.']].map(([q,a])=><details key={q}><summary>{q}<ChevronRight size={18}/></summary><p>{a}</p></details>)}</div></section>}
function Legal({type}:{type:'terms'|'privacy'|'cancellation'}) {const content={terms:['Service terms','Submitting a booking sends a service request. It does not guarantee coverage, a technician, an appointment time or a price. Our team will confirm applicable details with you before scheduling.'],privacy:['Privacy policy','We use the contact, appliance and address details you submit to review and follow up on your service request. Optional marketing consent is separate. We do not request payment credentials through this website.'],cancellation:['Cancellation policy','Contact our team as soon as possible if you need to change or cancel a request. A booking is scheduled only after the team confirms it with you. Any applicable cancellation terms will be communicated before appointment confirmation.']}[type];return <section className="page-section"><PageTitle eyebrow="CUSTOMER INFORMATION" title={content[0]} subtitle="Last updated October 2026."/><div className="content-narrow"><p>{content[1]}</p><p>For questions about this policy, use the contact form on our website.</p></div></section>}
function AdminLogin() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const requestedPath = from?.pathname;
  const redirectTo = requestedPath && (requestedPath === '/admin' || requestedPath.startsWith('/admin/')) ? `${requestedPath}${from?.search || ''}${from?.hash || ''}` : '/admin';
  return <section className="page-section admin-login-page"><div className="login-card"><span className="eyebrow">RAMLAKSH TEAM</span><h1>Administrator sign in</h1><p>Sign in to manage bookings and service operations.</p><form onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { const response = await api.post('/auth/login', { email: form.email, password: form.password }); queryClient.setQueryData(['adminSession'], response.data.data); navigate(redirectTo, { replace: true }); }
    catch { setError('Email or password is incorrect.'); }
    finally { setBusy(false); }
  }}>
    <Field label="Email address" name="email" value={form.email} set={(_, value) => setForm(previous => ({ ...previous, email: String(value) }))} type="email" required/>
    <label className="field"><span>Password</span><span className="password-control"><input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} required autoComplete="current-password"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    {error && <p id="login-error" className="inline-error" role="alert">{error}</p>}
    <button className="button login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17}/></button>
  </form></div></section>;
}
function AdminShell() { return <AdminRouteGuard><div className="admin-shell"><aside className="admin-sidebar-wrap"><AdminNavigation/></aside><div className="admin-content"><Outlet/></div></div></AdminRouteGuard>; }
function Admin() { return <AdminBookings/> }
function AdminTechnicians() {
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', skills: '', cities: '', areas: '' });
  const query = useQuery({ queryKey: ['adminTechnicians'], queryFn: async () => (await api.get('/admin/technicians')).data.data, retry: false });
  const cities = useQuery({ queryKey: ['adminCities'], queryFn: async () => (await api.get('/admin/cities')).data.data, retry: false });
  const services = useQuery<ServiceView[]>({ queryKey: ['adminServices'], queryFn: async () => (await api.get('/admin/services')).data.data, retry: false });

  return (
    <section className="page-section">
      <PageTitle eyebrow="RAMLAX ADMIN" title="Technician directory." subtitle="Assignments are allowed only when active skills and coverage match the service request." />
      {query.isError ? (
        <AdminSignIn />
      ) : (
        <>
          <form className="contact-card" onSubmit={async e => {
            e.preventDefault();
            try {
              await api.post('/admin/technicians', {
                name: form.name,
                phone: form.phone,
                skills: form.skills.split(',').map(v => v.trim()).filter(Boolean),
                cities: form.cities.split(',').map(v => v.trim()).filter(Boolean),
                areas: form.areas.split(',').map(v => v.trim()).filter(Boolean),
                active: true,
              });
              setStatus('Technician added.');
              query.refetch();
            } catch (err) {
              setStatus((err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not add technician');
            }
          }}>
            <h2>Add a technician</h2>
            <Field label="Name" name="name" value={form.name} set={(_, v) => setForm(old => ({ ...old, name: String(v) }))} required />
            <Field label="Phone" name="phone" value={form.phone} set={(_, v) => setForm(old => ({ ...old, phone: String(v) }))} type="tel" required />
            <Field label="Service slugs" name="skills" value={form.skills} set={(_, v) => setForm(old => ({ ...old, skills: String(v) }))} required />
            <small className="form-help">Configured service slugs: {(services.data || []).filter(service => service.active).map(service => service.slug).join(', ') || 'none yet'}</small>
            <Field label="Covered city slugs" name="cities" value={form.cities} set={(_, v) => setForm(old => ({ ...old, cities: String(v) }))} required />
            <Field label="Covered areas" name="areas" value={form.areas} set={(_, v) => setForm(old => ({ ...old, areas: String(v) }))} />
            <small className="form-help">Configured city slugs: {(cities.data || []).map((c: { slug: string }) => c.slug).join(', ') || 'none yet'}</small>
            <button className="button">Save technician <ArrowRight size={17}/></button>
          </form>

          <div className="table-wrap admin-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Skills</th>
                  <th>Coverage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.map((t: { _id: string; name: string; phone: string; skills: string[]; cities: string[]; active: boolean }) => (
                  <tr key={t._id}>
                    <td>{t.name}</td>
                    <td>{t.phone}</td>
                    <td>{t.skills.join(', ')}</td>
                    <td>{t.cities.join(', ')}</td>
                    <td>{t.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status && <p role="status">{status}</p>}
        </>
      )}
    </section>
  );
}

function AdminSignIn() {return <div className="login-card"><h2>Sign in to continue</h2><Link className="button" to="/admin/login">Administrator sign in</Link></div>}
function NotFound() {return <section className="page-section not-found-page"><div className="not-found-card"><span className="eyebrow not-found-eyebrow">404 · NOT FOUND</span><h1>That page isn’t here.</h1><p>Try returning to the home page or browse our services.</p><Link to="/" className="button not-found-button">Go home <ArrowRight size={17}/></Link></div></section>}
export default function App() {
  return <Layout><Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/services" element={<Services/>}/>
    <Route path="/services/:slug" element={<ServiceDetail/>}/>
    <Route path="/book" element={<Book/>}/>
    <Route path="/booking/lookup" element={<BookingLookup/>}/>
    <Route path="/about" element={<About/>}/>
    <Route path="/contact" element={<Contact/>}/>
    <Route path="/faqs" element={<Faqs/>}/>
    <Route path="/terms" element={<Legal type="terms"/>}/>
    <Route path="/privacy" element={<Legal type="privacy"/>}/>
    <Route path="/cancellation" element={<Legal type="cancellation"/>}/>
    <Route path="/admin/login" element={<AdminLogin/>}/>
    <Route path="/admin/bookings" element={<AdminShell/>}><Route index element={<Admin/>}/></Route>
    <Route path="/admin" element={<AdminShell/>}>
      <Route index element={<Admin/>}/>
      <Route path="bookings/:id" element={<AdminBookingDetail/>}/>
      <Route path="contacts" element={<AdminContactsPage/>}/>
      <Route path="services" element={<AdminServices/>}/>
      <Route path="locations" element={<AdminLocations/>}/>
      <Route path="technicians" element={<AdminTechnicians/>}/>
      <Route path="settings" element={<AdminSettingsPage/>}/>
      <Route path="reviews" element={<AdminReviews/>}/>
      <Route path="reports" element={<AdminReports/>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Layout>;
}
