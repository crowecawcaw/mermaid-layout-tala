// Translated internal/placement/cluster_optimization.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Cluster } from '../layoutgraph/records.js';
import { Round } from '../geo/math.js';
import { overlapsAlongDimension } from '../layoutgraph/node-spatial.js';
import { moveNodeWithChildren } from '../layoutgraph/containment.js';
import { clusterExternalConnectedNodes } from './cluster-connections.js';
export function alignConnectedNodes(
  cluster: Cluster,
  horizontally: boolean,
): void {
  const external = clusterExternalConnectedNodes(cluster);
  if (external.length === 0) return;
  for (const node of external) {
    if (node.FixedTopLeft !== null) continue;
    if (!overlapsAlongDimension(node, cluster.Vessel!, !horizontally, true))
      continue;
    let dx = 0,
      dy = 0;
    if (horizontally)
      dx = Round(
        cluster.Vessel!.TopLeft!.X +
          cluster.Vessel!.Width / 2 -
          node.TopLeft!.X -
          node.Width / 2,
      );
    else
      dy = Round(
        cluster.Vessel!.TopLeft!.Y +
          cluster.Vessel!.Height / 2 -
          node.TopLeft!.Y -
          node.Height / 2,
      );
    moveNodeWithChildren(node, dx, dy);
  }
}
export function alignVessel(cluster: Cluster, horizontally: boolean): void {
  const external = clusterExternalConnectedNodes(cluster);
  if (external.length === 0) return;
  let x = 0,
    y = 0;
  for (const node of external) {
    x += node.Center().X;
    y += node.Center().Y;
  }
  x /= external.length;
  y /= external.length;
  let dx = 0,
    dy = 0;
  if (horizontally)
    dx = x - cluster.Vessel!.Width / 2 - cluster.Vessel!.TopLeft!.X;
  else dy = y - cluster.Vessel!.Height / 2 - cluster.Vessel!.TopLeft!.Y;
  cluster.Vessel!.TopLeft!.X += Round(dx);
  cluster.Vessel!.TopLeft!.Y += Round(dy);
}
