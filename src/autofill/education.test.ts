// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  gradeType,
  qualificationType,
  recordLevel,
  requestedLevel,
} from './education';

describe('recordLevel', () => {
  it.each([
    ['University of Example', 'BSc Computer Science', 'higher'],
    ['Example College', 'MSc Data Science', 'higher'],
    ['Imperial College London', 'MEng', 'higher'],
    ['Example Sixth Form College', 'A levels', 'school'],
    ['Example Academy', 'GCSEs', 'school'],
    ['University of Example', 'Exchange semester', 'higher'],
    ['Example High School', 'Diploma', 'school'],
  ])('%s, %s → %s', (institution, qualification, level) => {
    expect(recordLevel(institution, qualification)).toBe(level);
  });

  it.each([
    ['Example Institute', 'Professional certificate'],
    ['Example College', 'Diploma'],
    ['Example Bootcamp', ''],
  ])('does not guess the level of %s, %s', (institution, qualification) => {
    expect(recordLevel(institution, qualification)).toBeNull();
  });
});

describe('requestedLevel', () => {
  it.each([
    ['university', 'higher'],
    ['degree classification', 'higher'],
    ['undergraduate education', 'higher'],
    ['a levels', 'school'],
    ['secondary school', 'school'],
    ['gcse results', 'school'],
  ])('%s → %s', (text, level) => {
    expect(requestedLevel(text)).toBe(level);
  });

  it.each([
    'school',
    'college',
    'institution',
    'school or university',
    'education',
  ])('does not read a level from %j', (text) => {
    expect(requestedLevel(text)).toBeNull();
  });
});

describe('qualificationType', () => {
  it.each([
    ['BSc Computer Science', 'bachelor'],
    ["Bachelor's degree", 'bachelor'],
    ['B.A. History', 'bachelor'],
    ['MSc', 'master'],
    ["Master's Degree", 'master'],
    ['PhD', 'doctorate'],
    ['A-levels', 'a-level'],
    ['A Level', 'a-level'],
    ['AS Level', 'as-level'],
    ['GCSEs', 'gcse'],
  ])('%s → %s', (text, type) => {
    expect(qualificationType(text)).toBe(type);
  });

  it.each(['Diploma', 'Integrated Master and PhD', 'Other'])(
    'does not name a single type for %j',
    (text) => {
      expect(qualificationType(text)).toBeNull();
    },
  );
});

describe('gradeType', () => {
  it.each([
    ['First-class honours', 'first'],
    ['1st', 'first'],
    ['2:1', 'upper-second'],
    ['Upper second-class honours (2:1)', 'upper-second'],
    ['2:2', 'lower-second'],
    ['Lower Second', 'lower-second'],
    ['Distinction', 'distinction'],
  ])('%s → %s', (text, type) => {
    expect(gradeType(text)).toBe(type);
  });

  it.each(['3.8 GPA', 'AAB', 'Pending'])('does not classify %j', (text) => {
    expect(gradeType(text)).toBeNull();
  });
});
