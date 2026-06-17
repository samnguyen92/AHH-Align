import Link from 'next/link';
import type { Clinic } from '@/types/database';

interface ClinicSidebarProps {
  clinic: Clinic;
}

function getClinicMapEmbedUrl(clinic: Clinic) {
  const location = clinic.metadata?.location;
  const latitude = location?.latitude ?? location?.lat;
  const longitude = location?.longitude ?? location?.lng;
  const addressQuery = [
    clinic.address,
    clinic.city,
    clinic.state,
    clinic.zip_code,
  ]
    .filter(Boolean)
    .join(', ');
  const query = latitude && longitude ? `${latitude},${longitude}` : addressQuery;

  if (!query) return null;

  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function ClinicSidebar({ clinic }: ClinicSidebarProps) {
  const metadata = clinic.metadata || {};
  const appointment = metadata.appointment;
  const appointmentUrl = appointment?.appointment_url || metadata.appointment_url || metadata.website || clinic.metadata?.google_website_url;
  const websiteUrl = metadata.website || clinic.metadata?.google_website_url;
  const addressString = [clinic.address, clinic.city, clinic.state, clinic.zip_code]
    .filter(Boolean)
    .join(', ');
  const googleMapsUrl = metadata.google_maps_url;
  const mapEmbedUrl = getClinicMapEmbedUrl(clinic);

  const hours = metadata.working_hours || {
    monday: '8:00 AM - 5:00 PM',
    tuesday: '8:00 AM - 5:00 PM',
    wednesday: '8:00 AM - 5:00 PM',
    thursday: '8:00 AM - 5:00 PM',
    friday: '8:00 AM - 5:00 PM',
    saturday: 'Closed',
    sunday: 'Closed'
  };

  return (
    <aside className="w-full lg:w-80 shrink-0 space-y-6">
      <div className="brand-card p-5">
        <h3 className="font-bold text-[var(--ahh-ink)] mb-2">Book an appointment</h3>
        {appointment?.booking_note && (
          <p className="mb-4 text-xs leading-5 text-[var(--ahh-muted)]">{appointment.booking_note}</p>
        )}
        {appointmentUrl ? (
          <Link
            href={appointmentUrl}
            target="_blank"
            rel="noreferrer"
            className="brand-button w-full justify-center text-xs"
          >
            Book or request a visit
          </Link>
        ) : (
          <p className="text-sm text-[var(--ahh-muted)]">Online booking is not listed.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {clinic.phone && (
            <a
              href={`tel:${clinic.phone.replace(/[^0-9]/g, '')}`}
              className="rounded-lg border border-gray-200 px-3 py-2 text-center font-semibold text-[var(--ahh-blue)] hover:bg-blue-50"
            >
              Call clinic
            </a>
          )}
          {websiteUrl && (
            <Link
              href={websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-2 text-center font-semibold text-[var(--ahh-blue)] hover:bg-blue-50"
            >
              Website
            </Link>
          )}
        </div>
        <div className="mt-4 space-y-2 text-xs text-[var(--ahh-muted)]">
          {appointment?.free_consultation_available && <p>Free consultation listed</p>}
          {appointment?.online_booking_available && <p>Online booking available</p>}
          {appointment?.new_patient_note && <p>{appointment.new_patient_note}</p>}
        </div>
      </div>
      
      {/* Clinic Information Card */}
      <div className="brand-card p-5">
        <h3 className="font-bold text-[var(--ahh-ink)] mb-5">Clinic Information</h3>
        
        <div className="space-y-4">
          {/* Location */}
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <div>
              <p className="text-xs font-semibold text-[var(--ahh-ink)] uppercase tracking-wider mb-1">Location</p>
              <p className="text-sm text-[var(--ahh-muted)] leading-relaxed">{addressString}</p>
            </div>
          </div>

          {/* Working Hours */}
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div className="w-full">
              <p className="text-xs font-semibold text-[var(--ahh-ink)] uppercase tracking-wider mb-1">Working Hours</p>
              <div className="space-y-1">
                {[
                  ['Mon', hours.monday],
                  ['Tue', hours.tuesday],
                  ['Wed', hours.wednesday],
                  ['Thu', hours.thursday],
                  ['Fri', hours.friday],
                  ['Sat', hours.saturday],
                  ['Sun', hours.sunday],
                ].map(([day, value]) => (
                  <div key={day} className="flex justify-between gap-3 text-xs text-[var(--ahh-muted)]">
                    <span>{day}</span>
                    <span className="text-right">{value || 'Not listed'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Phone */}
          {clinic.phone && (
            <div className="flex gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <div>
                <p className="text-xs font-semibold text-[var(--ahh-ink)] uppercase tracking-wider mb-1">Call</p>
                <p className="text-sm text-[var(--ahh-blue)] hover:underline cursor-pointer">
                  {clinic.phone}
                </p>
              </div>
            </div>
          )}

          {/* Provider */}
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <div>
              <p className="text-xs font-semibold text-[var(--ahh-ink)] uppercase tracking-wider mb-1">Provider</p>
              <p className="text-sm text-[var(--ahh-muted)]">
                {metadata.accepting_new_patients === false ? 'New patient status not listed' : 'Accepts new patients'}
              </p>
            </div>
          </div>

          {metadata.insurance?.notes && (
            <div className="flex gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M3 10h18"/></svg>
              <div>
                <p className="text-xs font-semibold text-[var(--ahh-ink)] uppercase tracking-wider mb-1">Insurance</p>
                <p className="text-sm text-[var(--ahh-muted)]">{metadata.insurance.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="brand-card overflow-hidden">
        <div className="relative aspect-[4/3]">
          {mapEmbedUrl ? (
            <iframe
              src={mapEmbedUrl}
              title={`${clinic.name} map`}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="1.5" className="mx-auto mb-2 opacity-50"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="text-xs font-medium text-[var(--ahh-blue)]/60">Map View Available</span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-blue-100 bg-white px-4 py-3 text-center">
          {googleMapsUrl ? (
            <Link
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--ahh-blue)] hover:underline"
            >
              Open in Google Maps
            </Link>
          ) : (
            <span className="text-xs font-medium text-[var(--ahh-blue)]/60">Google Maps link unavailable</span>
          )}
        </div>
      </div>

      {/* Is This Your Clinic CTA */}
      <div className="rounded-[var(--ahh-radius)] bg-[var(--ahh-deep-teal)] p-5 text-white">
        <h4 className="font-bold mb-2">Is This Your Clinic?</h4>
        <p className="text-xs text-blue-100 mb-4 leading-relaxed">
          Claim your profile to update your information, respond to reviews, and reach more patients.
        </p>
        <Link
          href="/claim"
          className="brand-button-ghost w-full border-white bg-transparent text-xs text-white hover:bg-white hover:text-[var(--ahh-blue)]"
        >
          Claim This Profile →
        </Link>
      </div>

    </aside>
  );
}
