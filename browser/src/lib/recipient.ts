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

/**
 * The conversation a typed recipient belongs to, keyed the way the wallet keys conversations: a
 * pubkey as its lowercase 64-hex x-only form (a chain key drops its 02/03 byte), so a new chat
 * started from a typed key is the same thread as that peer's entry in the conversation list.
 * Anything else is keyed by its recipient form.
 */
export function chatThreadKey(input: string): string {
  const recipient = asRecipient(input);
  return /^(0[23])?[0-9a-fA-F]{64}$/.test(recipient) ? recipient.slice(-64).toLowerCase() : recipient;
}
