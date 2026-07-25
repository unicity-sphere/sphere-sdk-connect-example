import { describe, it, expect } from 'vitest';
import { AUTO_PUSHED_EVENTS } from '@unicitylabs/sphere-sdk/connect';
import { ALL_EVENTS, EVENT_COLORS } from './EventLogPanel';

describe('EventLogPanel event list', () => {
  // The host pushes these unconditionally. If the log omits one, the demo silently hides the
  // event that carries the whole lock model — and a future auto-pushed event cannot be
  // forgotten here either, because this asserts against the SDK's own list.
  it('logs every event the host pushes without a subscription', () => {
    for (const event of AUTO_PUSHED_EVENTS) {
      expect(ALL_EVENTS).toContain(event);
    }
  });

  it('lists no event twice', () => {
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });

  it('gives every listed event a badge colour', () => {
    for (const event of ALL_EVENTS) {
      expect(typeof EVENT_COLORS[event]).toBe('string');
    }
  });
});
