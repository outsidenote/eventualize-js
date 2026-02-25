/**
 * Marker decorator for evdb-codegen.
 * Zero runtime effect — codegen reads @WithEvent<T>() from source text.
 *
 * Usage (in *StreamSpec.ts files):
 *   @WithEvent<FundsCaptured>()
 *   @WithEvent<FundsDeposited>()
 *   export class FundsStreamSpec {}
 *
 * The code generator scans for @WithEvent<TypeName>() and generates
 * the corresponding *StreamFactory.ts file.
 */
export function WithEvent<_T>(): ClassDecorator {
  return () => undefined;
}
