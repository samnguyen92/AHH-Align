// Static copy and photography for the home page.
/** How-it-works steps on the home page. */
export const STEPS = [
  { title: 'Pick your language', text: 'Choose Vietnamese, Korean or Chinese and see only clinics whose staff speak it.' },
  { title: 'Compare clinic profiles', text: 'Specialty, address, hours, ratings and languages, laid out the same way for every clinic.' },
  { title: 'Contact the clinic directly', text: 'Call or book on the clinic’s own site. We never charge patients or sit in the middle.' },
];

/** Photography (sources in D:/Align/AHH/new-photos, prompts in prompts/midjourney-all.md). */
const P = (n: string) => `/brand/photos/${n}.webp`;
export const PHOTOS = {
  hero: P('a1-hero'),
  reception: P('a2-section2'),
  guideLeft: P('a3-guide-left'),
  guideRight: P('a4-guide-right'),
  family: P('a5-tall-portrait'),
  stepFilter: P('h2-step-filter'),
  stepCompare: P('h3-step-compare'),
  waitingRoom: P('b3-steps'),
  guideFallback: P('a3-guide-left'),
};
