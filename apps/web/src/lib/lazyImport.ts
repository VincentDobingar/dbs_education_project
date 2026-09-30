import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * React.lazy expects a default export; every page component here is a named
 * export instead (consistent with the rest of the codebase) — this adapts one
 * to the other without every call site repeating the same `.then(...)` wrapper.
 */
export function lazyImport<M extends Record<string, ComponentType>, K extends keyof M>(
  factory: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K]> {
  return lazy(async () => ({ default: (await factory())[name] }));
}
