'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface QuizCounts {
  specialties: Record<string, number>;
  languages: Record<string, number>;
}

interface Step {
  key: 'specialty' | 'language' | 'city';
  title: string;
  hint: string;
  options: { label: string; value: string }[];
}

const STEPS: Step[] = [
  {
    key: 'specialty',
    title: 'What care are you looking for?',
    hint: 'Pick one to start. You can refine it later.',
    options: [
      { label: 'A primary care doctor', value: 'Primary Care' },
      { label: 'Dental care', value: 'Dental' },
      { label: 'Mental health support', value: 'Mental Health' },
      { label: "Women's health (OB/GYN)", value: 'OB/GYN' },
      { label: 'Heart health', value: 'Cardiology' },
      { label: 'Eye care', value: 'Ophthalmology' },
      { label: 'Skin care', value: 'Dermatology' },
      { label: "Care for my child", value: 'Pediatrics' },
      { label: 'Bones and joints', value: 'Orthopedics' },
      { label: "I'm not sure yet", value: '' },
    ],
  },
  {
    key: 'language',
    title: 'Which language do you want care in?',
    hint: 'We only match clinics that list it.',
    options: [
      { label: 'Vietnamese', value: 'Vietnamese' },
      { label: 'Korean', value: 'Korean' },
      { label: 'Chinese', value: 'Chinese' },
      { label: 'Any language', value: '' },
    ],
  },
  {
    key: 'city',
    title: 'Where should we look?',
    hint: 'Choose the closest city.',
    options: [
      'Los Angeles', 'San Jose', 'San Francisco', 'San Diego', 'Sacramento',
      'Houston', 'Dallas', 'Seattle', 'Washington', 'Atlanta',
    ].map((c) => ({ label: c, value: c })).concat([{ label: 'Anywhere in the US', value: '' }]),
  },
];

const TICK = (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M2.5 6.2l2.3 2.3 4.7-5" />
  </svg>
);

export function HomeQuiz({ counts }: { counts: QuizCounts }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<{ specialty?: string; language?: string; city?: string }>({});

  const current = STEPS[step];
  const selected = answers[current.key];
  const answered = selected !== undefined;

  function liveNote() {
    if (current.key === 'specialty' && selected) {
      const n = counts.specialties[selected];
      if (n) return { n, text: `${selected} clinics listed` };
    }
    if (current.key === 'language' && selected) {
      const n = counts.languages[selected];
      if (n) return { n, text: `${selected}-speaking clinics listed` };
    }
    return null;
  }
  const note = liveNote();

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    const params = new URLSearchParams();
    if (answers.specialty) params.set('specialty', answers.specialty);
    if (answers.language) params.set('language', answers.language);
    if (answers.city) params.set('city', answers.city);
    router.push(`/search${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <div className="lg-quiz" id="quiz">
      <div className="top">
        <h2>{current.title}</h2>
        <span className="meta">Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step + (answered ? 1 : 0)}>
        <i style={{ width: `${((step + (answered ? 1 : 0)) / STEPS.length) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.key}
          className="lg-opts"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {current.options.map((opt, i) => (
            <motion.button
              key={opt.label}
              type="button"
              className="lg-opt"
              aria-pressed={selected === opt.value}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setAnswers((a) => ({ ...a, [current.key]: opt.value }))}
            >
              {opt.label}
              <span className="tick">{TICK}</span>
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="foot">
        <p aria-live="polite">
          {note ? (
            <>
              <b>{note.n}</b> {note.text}
            </>
          ) : (
            current.hint
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {step > 0 && (
            <button type="button" className="lg-back" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="lg-cta lg-cta--green"
            onClick={next}
            disabled={!answered}
            style={{ opacity: answered ? 1 : 0.45, pointerEvents: answered ? 'auto' : 'none' }}
          >
            {step === STEPS.length - 1 ? 'Show my clinics' : 'Continue'}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

