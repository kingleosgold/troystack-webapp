// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToHash } from './scrollToHash';

describe('scrollToHash', () => {
  let scrolled: string[];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    scrolled = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('scrolls to a section that is already on the page', () => {
    document.body.innerHTML = '<h2 id="your-rights">5</h2>';
    scrollToHash('#your-rights');
    expect(scrolled).toEqual(['your-rights']);
  });

  it('waits for a lazy page to draw the section', () => {
    scrollToHash('#contact');
    expect(scrolled).toEqual([]);
    vi.advanceTimersByTime(200);
    document.body.innerHTML = '<h2 id="contact">9</h2>';
    vi.advanceTimersByTime(50);
    expect(scrolled).toEqual(['contact']);
  });

  it('gives up quietly when the section never shows', () => {
    scrollToHash('#nowhere', 500);
    vi.advanceTimersByTime(1000);
    document.body.innerHTML = '<h2 id="nowhere">late</h2>';
    vi.advanceTimersByTime(100);
    expect(scrolled).toEqual([]);
  });

  it('stops looking once cleaned up', () => {
    const stop = scrollToHash('#contact');
    stop();
    document.body.innerHTML = '<h2 id="contact">9</h2>';
    vi.advanceTimersByTime(100);
    expect(scrolled).toEqual([]);
  });

  it('reads escaped ids and ignores an empty or malformed hash', () => {
    document.body.innerHTML = '<h2 id="what-we-don\'t-do">4</h2><h2 id="%E0%A4%A">x</h2>';
    scrollToHash("#what-we-don't-do");
    scrollToHash('#what-we-don%27t-do');
    scrollToHash('#');
    scrollToHash('#%E0%A4%A');
    expect(scrolled).toEqual(["what-we-don't-do", "what-we-don't-do", '%E0%A4%A']);
  });
});
