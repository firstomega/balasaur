// Minimal ambient types for bun's built-in test runner, covering only what the
// unit tests here use. The proper fix is `bun add -d @types/bun` plus adding
// "bun" to tsconfig `types`, but CI installs with --frozen-lockfile and this
// declaration keeps typecheck green without touching bun.lock. Replace it if
// @types/bun ever lands in devDependencies.
declare module "bun:test" {
  interface Matchers {
    toBe(expected: unknown): void;
    toBeUndefined(): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toContain(expected: string): void;
    toStartWith(expected: string): void;
    not: Matchers;
  }
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): Matchers;
}
