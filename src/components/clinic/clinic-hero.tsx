'use client';

import { useState } from 'react';
import { ClinicImage } from '@/components/clinic/clinic-image';
import type { Clinic } from '@/types/database';
import Link from 'next/link';

interface ClinicHeroProps {
  clinic: Clinic;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? '#F59E0B' : 'none'}
          stroke="#F59E0B"
          strokeWidth="1.5"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function getShortDescription(text?: string | null) {
  if (!text) return '';
  const cleaned = text.trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const short = sentences.slice(0, 2).join(' ');
  if (short.length > 260) {
    return short.slice(0, 257) + '...';
  }
  return short;
}

export function ClinicHero({ clinic }: ClinicHeroProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const metadata = clinic.metadata || {};
  const rating = metadata.rating || 0;
  const ratingCount = metadata.rating_count || metadata.review_profile?.review_count || 0;
  const appointmentUrl = metadata.appointment?.appointment_url || metadata.appointment_url;
  const websiteUrl = metadata.website || metadata.google_website_url;

  const galleryImages = [
    ...(metadata.images || []),
    ...(metadata.gallery_images || []),
  ].filter((image, index, images) => image && images.indexOf(image) === index);

  const fullDescription = metadata.about_highlight || clinic.description || `${clinic.name} is a trusted ${clinic.specialty?.toLowerCase() || 'primary care'} clinic in ${clinic.city}, ${clinic.state}.`;
  const shortDescription = metadata.short_description || getShortDescription(fullDescription);

  return (
    <section className="bg-[var(--ahh-deep-teal)] px-6 pb-12 pt-28 sm:px-10 lg:px-20 lg:pt-36 lg:pb-16 text-white relative rounded-2xl overflow-hidden shadow-sm">
      <div className="brand-container flex flex-col lg:flex-row items-stretch justify-between gap-8 lg:gap-12">
        
        {/* Left Content */}
        <div className="flex-1 flex flex-col justify-between py-2">
          <div>
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs text-blue-100/70 mb-5 font-medium">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span className="opacity-40">&gt;</span>
              <Link href="/search" className="hover:text-white transition-colors">Clinics</Link>
              <span className="opacity-40">&gt;</span>
              <span className="text-white font-semibold">{clinic.name}</span>
            </nav>

            <h1 className="brand-heading-1 mb-3 text-white text-3xl sm:text-4xl font-extrabold tracking-tight">
              {clinic.name}
            </h1>

            {/* Rating */}
            <div className="flex items-center gap-2.5 mb-5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 w-fit">
              <StarRating rating={rating} />
              <span className="text-sm font-bold text-white">{rating.toFixed(1)}</span>
              {ratingCount > 0 && <span className="text-xs text-blue-100">({ratingCount} reviews)</span>}
            </div>

            <p className="text-blue-100/90 text-sm sm:text-base max-w-2xl mb-6 leading-relaxed">
              {shortDescription}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs sm:text-sm text-blue-100/80 mb-8 border-t border-white/10 pt-5">
              {clinic.specialty && (
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <span className="font-semibold text-white">{clinic.specialty}</span>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="font-semibold text-white">{clinic.city}, {clinic.state}</span>
              </div>

              {clinic.languages.length > 0 && (
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                  <span className="font-semibold text-white">{clinic.languages.join(', ')}</span>
                </div>
              )}

              {clinic.is_telehealth_available && (
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                  <span className="font-semibold text-white">Telehealth Available</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={clinic.phone ? `tel:${clinic.phone.replace(/[^0-9]/g, '')}` : '#'}
              className="flex items-center gap-2 bg-[#CCFF5C] text-[#0A2D27] hover:bg-[#bce650] border-none font-bold rounded-xl px-5 py-3 shadow-xs hover:shadow-md transition-all active:scale-98"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call Clinic
            </a>

            {!clinic.is_claimed && (
              <Link
                href={`/claim/${clinic.id}`}
                className="border border-white/20 bg-white/10 text-white hover:bg-white/20 font-bold rounded-xl px-5 py-3 transition-all active:scale-98"
              >
                Claim Profile
              </Link>
            )}
            
            {appointmentUrl && (
              <a
                href={appointmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-white/20 bg-white/10 text-white hover:bg-white/20 font-bold rounded-xl px-5 py-3 transition-all active:scale-98"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                Book Online
              </a>
            )}
            {!appointmentUrl && websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-white/20 bg-white/10 text-white hover:bg-white/20 font-bold rounded-xl px-5 py-3 transition-all active:scale-98"
              >
                Visit Website
              </a>
            )}
          </div>
        </div>

        {/* Right Content: 5-Photo Grid */}
        <div className="w-full lg:w-[45%] shrink-0 flex flex-col justify-center space-y-3">
          {galleryImages.length === 0 ? (
            <div className="w-full aspect-[16/10] rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center text-white/30">
              <svg className="h-12 w-12 opacity-30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold tracking-wide">No Images Available</span>
            </div>
          ) : galleryImages.length === 1 ? (
            <div 
              onClick={() => {
                setCurrentPhotoIndex(0);
                setIsLightboxOpen(true);
              }}
              className="w-full aspect-[16/10] rounded-2xl border border-white/10 bg-white/5 overflow-hidden cursor-pointer group relative"
            >
              <ClinicImage
                src={galleryImages[0]}
                alt={clinic.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:grid-rows-2 overflow-hidden rounded-2xl aspect-[16/10] border border-white/10">
                {/* Main large photo */}
                <div
                  onClick={() => {
                    setCurrentPhotoIndex(0);
                    setIsLightboxOpen(true);
                  }}
                  className="col-span-2 row-span-2 relative cursor-pointer overflow-hidden group bg-white/5"
                >
                  <ClinicImage
                    src={galleryImages[0]}
                    alt={`${clinic.name} main photo`}
                    className="h-full w-full object-cover transition-transform duration-350 group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300" />
                </div>

                {/* Sub-photos (up to 4) */}
                {Array.from({ length: 4 }).map((_, index) => {
                  const imgIdx = index + 1;
                  const image = galleryImages[imgIdx];
                  return (
                    <div
                      key={imgIdx}
                      onClick={() => {
                        if (image) {
                          setCurrentPhotoIndex(imgIdx);
                          setIsLightboxOpen(true);
                        }
                      }}
                      className={`relative cursor-pointer overflow-hidden group bg-white/5 border-l border-white/5 ${
                        index % 2 === 0 ? '' : 'border-t border-white/5'
                      }`}
                    >
                      {image ? (
                        <>
                          <ClinicImage
                            src={image}
                            alt={`${clinic.name} gallery photo ${imgIdx + 1}`}
                            className="h-full w-full object-cover transition-transform duration-350 group-hover:scale-103"
                          />
                          <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-300" />
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/20">
                          <svg className="h-5 w-5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Show All Photos button */}
              <div className="flex justify-start">
                <button
                  onClick={() => {
                    setCurrentPhotoIndex(0);
                    setIsLightboxOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-white/20 transition-all duration-200 active:scale-98 cursor-pointer"
                >
                  <svg className="h-4 w-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  See all {galleryImages.length} photos
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen && galleryImages.length > 0 && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-between bg-black/98 backdrop-blur-xs p-4 sm:p-6 transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between text-white border-b border-white/10 pb-4 mb-4">
            <span className="text-xs sm:text-sm font-semibold tracking-wide">
              Photo {currentPhotoIndex + 1} of {galleryImages.length}
            </span>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-all active:scale-95 cursor-pointer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Photo Navigation */}
          <div className="relative flex-1 flex items-center justify-center my-4">
            {/* Prev button */}
            <button
              onClick={() => setCurrentPhotoIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1))}
              className="absolute left-1 sm:left-4 z-10 rounded-full bg-black/50 sm:bg-white/10 p-2.5 sm:p-3 text-white hover:bg-white/25 transition-all active:scale-90 cursor-pointer"
            >
              <svg className="h-5 sm:h-6 w-5 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Main Image View */}
            <div className="relative w-full max-w-4xl h-[55vh] sm:h-[65vh]">
              <ClinicImage
                src={galleryImages[currentPhotoIndex]}
                alt={`${clinic.name} full photo ${currentPhotoIndex + 1}`}
                className="h-full w-full rounded-xl object-contain"
              />
            </div>

            {/* Next button */}
            <button
              onClick={() => setCurrentPhotoIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1))}
              className="absolute right-1 sm:right-4 z-10 rounded-full bg-black/50 sm:bg-white/10 p-2.5 sm:p-3 text-white hover:bg-white/25 transition-all active:scale-90 cursor-pointer"
            >
              <svg className="h-5 sm:h-6 w-5 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Thumbnail Strip */}
          <div className="overflow-x-auto py-4 flex gap-2 justify-start sm:justify-center max-w-full scrollbar-none border-t border-white/10 mt-4">
            {galleryImages.map((img, idx) => (
              <button
                key={img}
                onClick={() => setCurrentPhotoIndex(idx)}
                className={`relative h-12 sm:h-14 w-18 sm:w-20 overflow-hidden rounded-md border-2 shrink-0 transition-all duration-200 cursor-pointer ${
                  currentPhotoIndex === idx 
                    ? 'border-blue-500 scale-105 shadow-md shadow-blue-500/20' 
                    : 'border-transparent opacity-50 hover:opacity-100'
                }`}
              >
                <ClinicImage src={img} alt={`Thumbnail ${idx + 1}`} className="h-full w-full" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
