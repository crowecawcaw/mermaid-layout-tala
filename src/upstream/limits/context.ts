// Go context cancellation boundary for the direct TypeScript translation.
export interface Done {
  readonly closed: boolean;
}
export interface Context {
  Done(): Done | null;
  Err(): Error | null;
}
export const Background: Context = { Done: () => null, Err: () => null };
export const Canceled = new Error('context canceled');
export function WithCancel(): [Context, () => void] {
  const done = { closed: false };
  return [
    { Done: () => done, Err: () => (done.closed ? Canceled : null) },
    () => {
      done.closed = true;
    },
  ];
}
