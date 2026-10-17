import { describe, expect, it } from 'vitest';
import { readPageContext } from './page-context';

function withTitle(title: string) {
  document.title = title;
  return readPageContext(document);
}

describe('readPageContext', () => {
  it.each([
    [
      'Senior Product Designer · Halden Freight Careers',
      'Senior Product Designer',
      'Halden Freight Careers',
    ],
    ['Designer | Acme | Jobs', 'Designer', 'Acme · Jobs'],
    ['Data Engineer - Example Co', 'Data Engineer', 'Example Co'],
    ['Apply now', 'Apply now', null],
  ])('splits %j', (title, heading, subheading) => {
    expect(withTitle(title)).toMatchObject({ heading, subheading });
  });

  it('keeps hyphenated words together', () => {
    expect(withTitle('Front-end Engineer')).toMatchObject({
      heading: 'Front-end Engineer',
      subheading: null,
    });
  });

  it('falls back to the host when the page has no title', () => {
    expect(withTitle('')).toMatchObject({ heading: 'localhost' });
  });
});
