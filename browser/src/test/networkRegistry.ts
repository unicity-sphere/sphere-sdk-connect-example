/**
 * A stand-in for `SPHERE_NETWORKS`, for tests that must see MORE than one network.
 *
 * The registry an installed SDK ships depends on its version: 0.14.2 lists `testnet2` only,
 * 0.16+ adds `mainnet`. A test that needs to pick between two networks cannot rely on the
 * install, so it mocks the registry with this table (a vi.mock factory pulls it in through a
 * dynamic import, like FakeConnectClient — a factory is hoisted above the file's own
 * declarations and cannot close over them).
 *
 * `stagenet` is invented on purpose. If the picker or the hook carried a hand-written
 * `mainnet | testnet2` pair anywhere, it would be missing from the UI and could not be
 * declared — which is exactly what the tests that use it assert.
 *
 * Ids match the real networks: mainnet is 1, testnet2 is 4. The real registry's entries are
 * `{ id, name }` and nothing more.
 */
export const TEST_REGISTRY = {
  mainnet: { id: 1, name: 'mainnet' },
  testnet2: { id: 4, name: 'testnet2' },
  stagenet: { id: 7, name: 'stagenet' },
} as const;
