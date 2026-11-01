/**
 * Makes a type read-only all the way down. Compile-time only: nothing is frozen at runtime.
 * Functions and primitives stay as they are. Arrays and tuples become readonly with deep
 * elements. `Map` becomes `ReadonlyMap` and `Set` becomes `ReadonlySet`. Other objects get
 * readonly properties, applied deeply.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends readonly unknown[]
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T;
