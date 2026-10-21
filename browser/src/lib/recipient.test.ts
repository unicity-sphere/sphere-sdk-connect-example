import { describe, it, expect } from 'vitest';
import { asRecipient, chatThreadKey } from './recipient';

const CHAIN = `02${'a'.repeat(64)}`;
const TRANSPORT = 'b'.repeat(64);

describe('asRecipient', () => {
  it.each([
    ['a bare Unicity ID gets its @', 'alice', '@alice'],
    ['an @-prefixed Unicity ID is kept', '@alice', '@alice'],
    ['a chain pubkey stays bare', CHAIN, CHAIN],
    ['an upper-case chain pubkey stays bare', `03${'A'.repeat(64)}`, `03${'A'.repeat(64)}`],
    ['a transport pubkey stays bare', TRANSPORT, TRANSPORT],
    ['padding is trimmed', `  ${CHAIN} `, CHAIN],
    ['a 65-hex string is a Unicity ID', 'a'.repeat(65), `@${'a'.repeat(65)}`],
  ])('%s', (_label, input, expected) => {
    expect(asRecipient(input)).toBe(expected);
  });
});

describe('chatThreadKey', () => {
  it.each([
    ['a Unicity ID keys by its @ form', 'alice', '@alice'],
    ['an @-prefixed Unicity ID is kept', '@alice', '@alice'],
    ['a transport pubkey keys as itself', TRANSPORT, TRANSPORT],
    ['a chain pubkey keys as its x-only form', CHAIN, 'a'.repeat(64)],
    ['an upper-case key keys in lower case', `03${'A'.repeat(64)}`, 'a'.repeat(64)],
    ['padding is trimmed', `  ${TRANSPORT} `, TRANSPORT],
  ])('%s', (_label, input, expected) => {
    expect(chatThreadKey(input)).toBe(expected);
  });
});
