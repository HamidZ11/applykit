import { describe, expect, it, vi } from 'vitest';
import { replaceText } from './fill';

describe('replaceText', () => {
  function box(value: string) {
    document.body.innerHTML = '<form><textarea id="t"></textarea></form>';
    const element = document.getElementById('t') as HTMLTextAreaElement;
    element.value = value;
    return element;
  }

  it('replaces only the exact text the user chose to improve', async () => {
    const element = box('my rough answer');
    const inputs = vi.fn();
    element.addEventListener('input', inputs);

    expect(
      await replaceText(element, 'my rough answer', 'My clear answer.'),
    ).toBe('replaced');
    expect(element.value).toBe('My clear answer.');
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  it('never replaces text that changed since', async () => {
    const element = box('my newer answer');

    expect(await replaceText(element, 'my rough answer', 'Improved.')).toBe(
      'changed',
    );
    expect(element.value).toBe('my newer answer');
  });

  it('never writes to a disabled or read-only field', async () => {
    const element = box('text');
    element.readOnly = true;

    expect(await replaceText(element, 'text', 'Improved.')).toBe('unavailable');
    expect(element.value).toBe('text');
  });

  it('reports a page that does not keep the new text', async () => {
    const element = box('text');
    element.addEventListener('input', () => {
      element.value = 'text';
    });

    expect(await replaceText(element, 'text', 'Improved.')).toBe('rejected');
  });
});
