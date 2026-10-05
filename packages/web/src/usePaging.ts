import { useState } from 'react';

/** Rows drawn before "Show more": enough for any real pack, small enough that a huge one stays quick. */
export const PAGE = 200;

/**
 * Show the first `PAGE` rows and let the user reveal more. The reveal starts over whenever `resetKey` changes
 * (a new search, say), so a fresh result list is never drawn in full by accident.
 */
export function usePaging(resetKey: string): { limit: number; more: () => void; all: () => void } {
  const [state, setState] = useState({ key: resetKey, limit: PAGE });
  // Note the new key as soon as it appears, so coming back to an earlier key (search, then clear) still starts over.
  if (state.key !== resetKey) setState({ key: resetKey, limit: PAGE });
  const limit = state.key === resetKey ? state.limit : PAGE;
  return {
    limit,
    more: () => setState({ key: resetKey, limit: limit + PAGE }),
    all: () => setState({ key: resetKey, limit: Infinity }),
  };
}
