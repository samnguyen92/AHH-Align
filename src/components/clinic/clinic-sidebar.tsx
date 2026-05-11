import Link from 'next/link';
import type { Clinic } from '@/types/database';

interface ClinicSidebarProps {
  clinic: Clinic;
}

export function ClinicSidebar({ clinic }: ClinicSidebarProps) {
  const addressString = [clinic.address, clinic.city, clinic.state, clinic.zip_code]
    .filter(Boolean)
    .join(', ');

  const hours = clinic.metadata?.working_hours || {
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
      
      {/* Clinic Information Card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-5">Clinic Information</h3>
        
        <div className="space-y-4">
          {/* Location */}
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <div>
              <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-1">Location</p>
              <p className="text-sm text-gray-600 leading-relaxed">{addressString}</p>
            </div>
          </div>

          {/* Working Hours */}
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div className="w-full">
              <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-1">Working Hours</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Mon - Fri</span>
                  <span>{hours.monday}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Saturday</span>
                  <span>{hours.saturday}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Sunday</span>
                  <span>{hours.sunday}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Phone */}
          {clinic.phone && (
            <div className="flex gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <div>
                <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-1">Call</p>
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
              <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-1">Provider</p>
              <p className="text-sm text-gray-600">Accepts New Patients</p>
            </div>
          </div>
        </div>
      </div>

      {/* Map Placeholder */}
      <div className="bg-blue-50 rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center border border-blue-100">
        <div className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="1.5" className="mx-auto mb-2 opacity-50"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span className="text-xs font-medium text-[var(--ahh-blue)]/60">Map View Available</span>
        </div>
      </div>

      {/* Is This Your Clinic CTA */}
      <div className="rounded-xl bg-[var(--ahh-blue)] p-5 text-white">
        <h4 className="font-bold mb-2">Is This Your Clinic?</h4>
        <p className="text-xs text-blue-100 mb-4 leading-relaxed">
          Claim your profile to update your information, respond to reviews, and reach more patients.
        </p>
        <Link
          href="/claim"
          className="inline-flex w-full items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg border border-white hover:bg-white hover:text-[var(--ahh-blue)] transition-colors"
        >
          Claim This Profile →
        </Link>
      </div>

    </aside>
  );
}
