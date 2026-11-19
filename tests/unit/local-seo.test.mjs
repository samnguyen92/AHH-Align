import { test } from 'node:test';
import assert from 'node:assert/strict';

const { slugifySegment, unslugifySegment, findCityMatch, findSpecialtyMatch, specialtyRoute, stateToSlug } =
  await import('../../src/lib/local-seo.ts');

const combo = (state, city, specialty) => ({
  state,
  stateSlug: stateToSlug(state),
  city,
  citySlug: slugifySegment(city),
  specialty,
  specialtySlug: slugifySegment(specialty),
  path: specialtyRoute(state, city, specialty),
});

test('a slug cannot be turned back into the stored name by capitalising it (the cause of the 404s)', () => {
  for (const stored of ['Acupuncture & TCM', 'OB/GYN', 'St. Louis', "Coeur d'Alene"]) {
    assert.notEqual(unslugifySegment(slugifySegment(stored)), stored, stored);
  }
});

test('the real specialty name is found from the slug', () => {
  const combos = [combo('GA', 'Atlanta', 'Acupuncture & TCM'), combo('TX', 'Houston', 'OB/GYN')];
  assert.equal(findSpecialtyMatch(combos, 'georgia', 'atlanta', 'acupuncture-tcm')?.specialty, 'Acupuncture & TCM');
  assert.equal(findSpecialtyMatch(combos, 'texas', 'houston', 'obgyn')?.specialty, 'OB/GYN');
});

test('the real city name is found from the slug', () => {
  const combos = [combo('MO', 'St. Louis', 'Dental')];
  assert.equal(findCityMatch(combos, stateToSlug('MO'), 'st-louis')?.city, 'St. Louis');
});

test('the same city name in two states is not mixed up', () => {
  const combos = [combo('OR', 'Portland', 'Dental'), combo('ME', 'Portland', 'Dental')];
  assert.equal(findCityMatch(combos, stateToSlug('OR'), 'portland')?.state, 'OR');
  assert.equal(findCityMatch(combos, stateToSlug('ME'), 'portland')?.state, 'ME');
});

test('a page that does not exist is still not found (so it can still be a 404)', () => {
  const combos = [combo('GA', 'Atlanta', 'Acupuncture & TCM')];
  assert.equal(findSpecialtyMatch(combos, 'georgia', 'atlanta', 'dental'), undefined);
  assert.equal(findSpecialtyMatch(combos, 'texas', 'atlanta', 'acupuncture-tcm'), undefined);
  assert.equal(findCityMatch(combos, 'georgia', 'nowhere'), undefined);
});

test('every page the sitemap lists resolves back to itself', () => {
  const specialties = ['Acupuncture & TCM', 'OB/GYN', 'Mental Health', 'Primary Care', 'Dental', 'Hospital', 'Cardiology'];
  const places = [['CA', 'Los Angeles'], ['GA', 'Atlanta'], ['TX', 'Houston'], ['MO', 'St. Louis'], ['DC', 'Washington']];
  const combos = places.flatMap(([state, city]) => specialties.map((s) => combo(state, city, s)));
  for (const c of combos) {
    const found = findSpecialtyMatch(combos, c.stateSlug, c.citySlug, c.specialtySlug);
    assert.equal(found?.specialty, c.specialty, c.path);
    assert.equal(found?.city, c.city, c.path);
  }
});
