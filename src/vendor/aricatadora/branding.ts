/**
 * Branded Types
 *
 * Marks domain identifiers and units as distinct without changing their runtime values.
 */
export type Brand<T, Name extends string> = T & { readonly __brand: Name };
