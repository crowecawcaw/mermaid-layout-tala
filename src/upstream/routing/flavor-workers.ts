// Translated route-flavor coordination from internal/routing/coordinator.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { WithCancel, type Context } from '../limits/context.js';
import { New as invariant } from '../invariant/errors.js';
import { MaxRouteSearchFlavors } from './search-guard.js';
import type { RouteGenerationFlavor } from './sort-edges.js';
import type { GenerateRouteResponse } from './generate-routes.js';

export function generateRouteFlavorResponsesWith<R extends { flavor: RouteGenerationFlavor }>(
  ctx: Context,
  routers: readonly R[],
  straightLineFallback: boolean,
  worker: (router: R, ctx: Context, straightLineFallback: boolean) => GenerateRouteResponse,
): GenerateRouteResponse[] {
  if (routers.length > MaxRouteSearchFlavors)
    throw new Error(`TALA route-search work limit exceeded: edge routing declared ${routers.length} flavors; limit ${MaxRouteSearchFlavors}`);
  const [workerCtx, cancelWorkers] = WithCancel(ctx);
  const responses: GenerateRouteResponse[] = [];
  let firstPanic: RouteGenerationFlavor | null = null;
  try {
    for (const router of routers) {
      try {
        const response = worker(router, workerCtx, straightLineFallback);
        responses.push({ ...response, Flavor: router.flavor });
      } catch {
        firstPanic ??= router.flavor;
        cancelWorkers();
      }
    }
    if (firstPanic !== null) throw invariant(`edge routing flavor ${firstPanic} violated an invariant`);
    const canceled = ctx.Err();
    if (canceled) throw new Error(`EdgeRouting: ${canceled.message}`, { cause: canceled });
    return responses;
  } finally {
    cancelWorkers();
  }
}
