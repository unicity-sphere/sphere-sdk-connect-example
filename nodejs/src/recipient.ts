/**
 * A typed recipient in the form the wallet reads it: `@` names a Unicity ID, and a pubkey (a
 * 66-hex chain key or a 64-hex transport key) goes bare. An `@` in front of a pubkey makes it a
 * Unicity ID lookup that fails, so only input that is not a pubkey gets one.
 */
export function asRecipient(input: string): string {
  const value = input.trim();
  if (value.startsWith('@') || /^(0[23])?[0-9a-fA-F]{64}$/.test(value)) return value;
  return '@' + value;
}
