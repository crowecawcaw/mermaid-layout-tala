// Go context cancellation boundary for the direct TypeScript translation.
export interface Done {
  readonly closed: boolean;
}
export interface Context {
  Value?(key: symbol): unknown;
  /** Null means never canceled; otherwise the signal closes before Err becomes non-null. */
  Done(): Done | null;
  Err(): Error | null;
}
export const Background: Context = { Done: () => null, Err: () => null };
export const Canceled = new Error('context canceled');
export function WithCancel(parent: Context = Background): [Context, () => void] {
  if (!parent) throw new Error('cannot create context from nil parent');
  const parentDone = parent.Done();
  let error: Error | null = null;
  const checkParent = () => {
    if (!error && parentDone?.closed) error = parent.Err() ?? Canceled;
    return error;
  };
  const done: Done = { get closed() { return checkParent() !== null; } };
  return [
    { Done: () => done, Err: checkParent, Value: (key) => parent.Value?.(key) },
    () => { if (!checkParent()) error = Canceled; },
  ];
}
