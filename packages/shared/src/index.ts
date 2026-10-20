export const serviceCatalog = [
  { slug: 'ac', name: 'Air conditioning', short: 'AC', description: 'Installation, servicing and repairs for home air conditioning.', icon: 'snowflake', services: ['Installation', 'Uninstallation', 'Servicing', 'Maintenance', 'Repair'] },
  { slug: 'ro', name: 'Water purifiers', short: 'RO', description: 'Water purifier installation, filter replacement and repairs.', icon: 'droplets', services: ['Installation', 'Servicing', 'Filter replacement', 'Repair'] },
  { slug: 'tv', name: 'Televisions', short: 'TV', description: 'TV installation, wall mounting, uninstallation and setup.', icon: 'tv', services: ['Installation', 'Wall mounting', 'Uninstallation', 'Setup'] },
  { slug: 'washing-machine', name: 'Washing machines', short: 'Washing', description: 'Washing machine installation, servicing and repairs.', icon: 'washing-machine', services: ['Installation', 'Uninstallation', 'Servicing', 'Repair'] },
] as const;

export const bookingStatuses = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'] as const;
export type BookingStatus = typeof bookingStatuses[number];
export type PublicSettings = { businessName: string; phone: string; whatsappPhone: string; email: string; address: string; serviceAreas: { name: string; slug: string }[] };
export type PriceKind = 'fixed' | 'starting' | 'quote';
export type ServicePrice = { kind: PriceKind; amount?: number; currency: string; additionalCharges: { name: string; amount: number }[] };
export type ServiceAvailability = { city: string; areas: string[]; active: boolean };
export type ServiceTypeView = { _id?: string; slug: string; name: string; active?: boolean; availability: ServiceAvailability[]; pricing: ServicePrice };
export type ServiceView = { _id?: string; slug: string; name: string; short: string; description: string; icon: string; active?: boolean; serviceTypes: ServiceTypeView[] };

export type BookingIssueKind = 'replacement' | 'delay' | 'quality' | 'access' | 'other';
export type BookingIssueSnapshot = { _id: string; kind: BookingIssueKind; message: string; };
export type TechnicianView = { _id: string; name: string; phone: string; skills: string[]; cities: string[]; areas?: string[]; active?: boolean };
export type BookingItem = { _id: string; serviceName: string; itemTypeName: string; qty: number; price: { currency: string; amount: number } };
export type BookingView = {
  _id: string;
  bookingId: string;
  status: BookingStatus | 'pending' | 'assigned' | 'on_the_way';
  createdAt: string;
  customer: { name: string; phone: string; email?: string };
  location: { city: string; address: string };
  items: BookingItem[];
  total: { currency: string; amount: number };
  appliance: { brand: string };
  technician?: { _id?: string; name?: string; phone?: string };
  issues?: BookingIssueSnapshot[];
};
export type BusinessSettings = {
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  supportHours: string;
  serviceRadiusKm: number;
  taxes: { gst: number; serviceCharge: number };
  sla: { responseHours: number; serviceWindowHours: number };
  emergency: { enabled: boolean; phone: string };
  notificationChannel?: string;
  customerSegment?: string;
  brandPromise?: string;
};
