// Direct translation of OVG edge search in internal/routing/ovg_edge_router.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Point } from '../geo/point.js';
import {
  Orientation as O,
  GetOpposite,
  IsDiagonal,
} from '../geo/orientation.js';
import { Node } from '../layoutgraph/node.js';
import { Edge } from '../layoutgraph/edge.js';
import type { Graph } from '../layoutgraph/graph.js';
import { distanceTo, nodeOrientation } from '../layoutgraph/node-spatial.js';
import { LabelTopLeft } from '../layoutgraph/node-geometry.js';
import {
  TurnCost,
  CrossingCost,
  NonCenterPortCost,
} from '../layoutgraph/placement-cost.js';
import { ports, portsByOrientation } from '../layoutgraph/ports.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import { OVGNode, portDirectionsAny } from './ovg-node.js';
import type { OVG } from './ovg.js';
import type { Route } from './route.js';
import { sortEdges, type RouteGenerationFlavor } from './sort-edges.js';
import {
  RouteSearchWorkGuard,
  MaxSearchWorkUnits,
  routeSearchIsDescendantOf,
  fixedOverlapsForRoute,
} from './search-guard.js';
import { PriorityQueue, type PriorityQueueEntry } from './priority-queue.js';
import { RouteInventory, edgeDebug } from './route-inventory.js';
import { PointMap } from './point-map.js';
import { usedPorts, centerSymmetricalPorts } from './route-ports.js';
import {
  sourceAndTargetClusterNodesGuarded,
  filterEdgeAncestorsGuarded,
  edgeCanOverlapEdgesGuarded,
} from './route-sharing.js';
import {
  isUndesirableClusterArrangement,
  positionedArrowheadLabelCostGuarded,
} from './search-costs.js';
import { idealTurnAxes } from './turns.js';
import { tablePorts } from './table-ports.js';
import { routeLineGuarded } from './route-line.js';
import { segmentIntersectsBox } from './geometry.js';
import { bestRoute, type SearchNodeContext } from './best-route.js';
interface SearchContext extends SearchNodeContext {
  verticalEntry: PriorityQueueEntry<OVGNode> | null;
  horizontalEntry: PriorityQueueEntry<OVGNode> | null;
}
const infinity = 10_000_000;
function check(ctx: Context): void {
  const err = ctx.Err();
  if (err) throw new Error(`EdgeRouting: ${err.message}`, { cause: err });
}
function overlappingPorts(a: Node, b: Node): PointMap<boolean> {
  const result = new PointMap<boolean>();
  if (isDescendantOf(a, b) || isDescendantOf(b, a)) return result;
  const bp = ports(b);
  for (const p of ports(a))
    if (bp.some((x) => x.Equals(p))) result.set(p, true);
  return result;
}
export class OVGEdgeRouter {
  readonly work: RouteSearchWorkGuard;
  readonly inventory: RouteInventory;
  readonly edges: Edge[];
  readonly turnCost: number;
  readonly crossingCost: number;
  readonly nonCenterPortCost: number;
  considerNodeLabels = false;
  private fixedOverlaps: Set<Node> | null = null;
  private queue = new PriorityQueue<OVGNode>();
  constructor(
    ctx: Context,
    readonly flavor: RouteGenerationFlavor,
    readonly ovg: OVG,
    readonly graph: Graph,
    existing: Route[],
    edges: Edge[],
    limit = MaxSearchWorkUnits,
  ) {
    this.work = new RouteSearchWorkGuard(ctx, flavor, limit);
    this.work.Add(BigInt(edges.length));
    this.edges = [...edges];
    const clustered = new Set<Node>();
    for (const cluster of graph.Clusters.values()) {
      this.work.Step();
      for (const node of cluster.Nodes) {
        this.work.Step();
        clustered.add(node);
      }
    }
    for (const edge of this.edges) {
      this.work.Step();
      if (!edge || !edge.From || !edge.To) continue;
      this.work.ReserveSum(
        BigInt(edge.From.Edges.length),
        BigInt(edge.To.Edges.length),
      );
    }
    this.work.ReserveSort(this.edges.length);
    this.work.ReserveSort(this.edges.length);
    sortEdges(flavor, this.edges, clustered);
    this.inventory = new RouteInventory(ovg, this.work);
    this.turnCost = TurnCost(graph);
    this.crossingCost = CrossingCost(graph);
    this.nonCenterPortCost = NonCenterPortCost(graph);
    for (const route of existing) {
      this.work.Step();
      this.inventory.addRoute(route);
    }
    this.work.Check();
  }
  quickRoute(
    ctx: Context,
    edge: Edge,
    overlap: boolean,
    orientation: O,
  ): [OVGNode[], number] | null {
    this.work.Bind(ctx);
    check(ctx);
    const source = edge.From,
      target = edge.To,
      dist = distanceTo(source, target, true);
    if (!overlap && !IsDiagonal(orientation) && dist < 42 && dist > 20) {
      const edges: Edge[] = [];
      for (const route of this.inventory.routes) {
        this.work.Add(BigInt(route.OVGNodes.length) + 1n);
        const e = new Edge(route.GEdge.From, route.GEdge.To);
        e.Points = route.createSegmentEndpoints();
        e.SourceArrowhead = route.GEdge.SourceArrowhead;
        e.TargetArrowhead = route.GEdge.TargetArrowhead;
        e.SourceArrowheadLabel = route.GEdge.SourceArrowheadLabel;
        e.TargetArrowheadLabel = route.GEdge.TargetArrowheadLabel;
        e.Label = route.GEdge.Label;
        edges.push(e);
      }
      check(ctx);
      try {
        const [a, b, cost] = routeLineGuarded(
          this.graph,
          edge,
          edges,
          null,
          this.work,
        );
        return [
          [
            this.ovg.Centers.get(source)!,
            new OVGNode(a),
            new OVGNode(b),
            this.ovg.Centers.get(target)!,
          ],
          cost,
        ];
      } catch (error) {
        if (ctx.Err()) throw error;
      }
    }
    return null;
  }
  search(ctx: Context, edge: Edge): [OVGNode[], number] {
    this.work.Bind(ctx);
    const sourceNode = edge.From,
      targetNode = edge.To,
      source = this.ovg.Centers.get(sourceNode)!,
      target = this.ovg.Centers.get(targetNode)!,
      count = this.ovg.Nodes.length;
    this.work.ReserveProduct(BigInt(count), 3n);
    const vertical: (OVGNode | null)[] = Array(count).fill(null),
      horizontal: (OVGNode | null)[] = Array(count).fill(null),
      contexts: (SearchContext | null)[] = Array(count).fill(null),
      labelBoxes: Node[] = [];
    if (this.considerNodeLabels)
      for (const node of this.graph.Nodes) {
        this.work.Step();
        if (node === sourceNode || node === targetNode) continue;
        if (node.Label && node.Label.Text !== '') {
          const fake = new Node(0n, node.Label.Width, node.Label.Height);
          fake.TopLeft = LabelTopLeft(
            node,
            node.Label.Position,
            node.Label.Width,
            node.Label.Height,
          );
          fake.D2ID = node.Label.Text;
          fake.Graph = this.graph;
          labelBoxes.push(fake);
        }
      }
    const fromOrientation = nodeOrientation(sourceNode, targetNode),
      toOrientation = nodeOrientation(targetNode, sourceNode),
      overlap = fromOrientation === O.NONE || toOrientation === O.NONE,
      quick = this.quickRoute(ctx, edge, overlap, fromOrientation);
    if (quick) return quick;
    const nonAncestors =
      edge.SourceArrowheadLabel || edge.TargetArrowheadLabel
        ? filterEdgeAncestorsGuarded(edge, this.graph.Nodes, this.work)
        : [];
    const sourceContainer = sourceNode.Container,
      targetContainer = targetNode.Container,
      sourceBelow = routeSearchIsDescendantOf(
        this.work,
        sourceNode,
        targetNode,
      ),
      targetBelow = routeSearchIsDescendantOf(
        this.work,
        targetNode,
        sourceNode,
      ),
      [sourceCluster, targetCluster] = sourceAndTargetClusterNodesGuarded(
        this.graph,
        sourceNode,
        targetNode,
        this.work,
      ),
      undesirable = isUndesirableClusterArrangement(sourceNode, targetNode);
    let shareSource = false,
      shareTarget = false,
      preferFacing = false,
      nonFacing = 0;
    const fromFacing = new PointMap<boolean>(),
      toFacing = new PointMap<boolean>();
    if ((sourceCluster.size > 0 || targetCluster.size > 0) && !undesirable) {
      preferFacing = true;
      nonFacing = this.turnCost * 2;
      shareSource = true;
      shareTarget = true;
      for (const p of portsByOrientation(
        sourceNode,
        GetOpposite(fromOrientation),
      )) {
        this.work.Step();
        fromFacing.set(p, true);
      }
      for (const p of portsByOrientation(
        targetNode,
        GetOpposite(toOrientation),
      )) {
        this.work.Step();
        toFacing.set(p, true);
      }
    }
    let sharedRouteCost = infinity;
    let blockedSource = new PointMap<boolean>(),
      blockedTarget = new PointMap<boolean>();
    if (
      edge.FromTableColumnIndex === null &&
      edge.ToTableColumnIndex === null
    ) {
      this.work.ReserveProduct(
        BigInt(this.ovg.Ports.get(sourceNode)?.length ?? 0),
        BigInt(this.ovg.Ports.get(targetNode)?.length ?? 0),
      );
      blockedSource = overlappingPorts(sourceNode, targetNode);
      blockedTarget = overlappingPorts(targetNode, sourceNode);
    } else {
      const [sourcePorts, targetPorts] = tablePorts(
        this.ovg,
        edge,
        sourceNode,
        targetNode,
        false,
        this.work,
      );
      if (
        edge.FromTableColumnIndex !== null &&
        edge.ToTableColumnIndex !== null
      ) {
        sharedRouteCost = infinity / 10;
        shareSource = true;
        shareTarget = true;
        for (const p of this.ovg.Ports.get(sourceNode) ?? []) {
          this.work.Step();
          if (!sourcePorts!.has(p)) blockedSource.set(p.Point, true);
        }
        for (const p of this.ovg.Ports.get(targetNode) ?? []) {
          this.work.Step();
          if (!targetPorts!.has(p)) blockedTarget.set(p.Point, true);
        }
        for (const e of sourceNode.Edges) {
          this.work.Step();
          targetCluster.add(sourceNode.Adjacent(e));
        }
        for (const e of targetNode.Edges) {
          this.work.Step();
          sourceCluster.add(targetNode.Adjacent(e));
        }
      } else if (edge.FromTableColumnIndex !== null) {
        shareSource = true;
        for (const p of this.ovg.Ports.get(sourceNode) ?? []) {
          this.work.Step();
          if (!sourcePorts!.has(p)) blockedSource.set(p.Point, true);
        }
        for (const e of targetNode.Edges) {
          this.work.Step();
          sourceCluster.add(targetNode.Adjacent(e));
        }
      } else {
        shareTarget = true;
        for (const p of this.ovg.Ports.get(targetNode) ?? []) {
          this.work.Step();
          if (!targetPorts!.has(p)) blockedTarget.set(p.Point, true);
        }
        for (const e of sourceNode.Edges) {
          this.work.Step();
          targetCluster.add(sourceNode.Adjacent(e));
        }
      }
    }
    const axes = idealTurnAxes(sourceNode, targetNode),
      used = usedPorts(
        ctx,
        this.ovg,
        this.inventory,
        sourceNode,
        targetNode,
        source,
        target,
        sourceCluster,
        targetCluster,
        undesirable,
        this.work,
      ),
      symmetric = centerSymmetricalPorts(
        ctx,
        this.ovg,
        sourceNode,
        targetNode,
        used.source,
        used.target,
        this.work,
      );
    this.fixedOverlaps ??= fixedOverlapsForRoute(this.graph.Nodes, this.work);
    const fixed = this.fixedOverlaps;
    contexts[source.Index] = {
      verticalDistance: Infinity,
      horizontalDistance: Infinity,
      verticalEntry: null,
      horizontalEntry: null,
    };
    this.queue.reset();
    this.queue.push(0, source, false, this.work);
    this.queue.push(0, source, true, this.work);
    while (!this.queue.empty()) {
      this.work.Step();
      const entry = this.queue.pop(this.work),
        current = entry.node!,
        fromHorizontal = entry.isHorizontal,
        least = entry.priority;
      if (current === target)
        return [
          bestRoute(
            ctx,
            sourceNode,
            targetNode,
            source,
            target,
            contexts,
            vertical,
            horizontal,
            this.turnCost,
            this.work,
          ),
          least,
        ];
      const last =
          (fromHorizontal ? horizontal : vertical)[current.Index] ?? null,
        occupied: Edge[] = [];
      if (current !== source && current !== target)
        for (const route of this.inventory.routesAt(current.Point)) {
          this.work.Step();
          occupied.push(route.GEdge);
        }
      const onRoute = occupied.length > 0,
        shareable = edgeCanOverlapEdgesGuarded(
          edge,
          occupied,
          sourceCluster,
          targetCluster,
          this.work,
        );
      for (const e of current.Edges) {
        this.work.Step();
        const adjacent = current.Adjacent(e);
        if (adjacent === last) continue;
        const src = current.portMetadataFor(sourceNode);
        if (
          src &&
          !portDirectionsAny(src.directions, (d) =>
            overlap
              ? d === O.Top || d === O.Bottom
                ? adjacent.Y !== current.Y
                : d === O.Right || d === O.Left
                  ? adjacent.X !== current.X
                  : true
              : d === O.Top
                ? adjacent.Y < current.Y
                : d === O.Bottom
                  ? adjacent.Y > current.Y
                  : d === O.Right
                    ? adjacent.X > current.X
                    : d === O.Left
                      ? adjacent.X < current.X
                      : true,
          )
        )
          continue;
        const dst = adjacent.portMetadataFor(targetNode);
        if (dst) {
          if (blockedTarget.has(adjacent.Point)) continue;
          if (
            !portDirectionsAny(dst.directions, (d) =>
              overlap
                ? d === O.Top || d === O.Bottom
                  ? adjacent.Y !== current.Y
                  : d === O.Right || d === O.Left
                    ? adjacent.X !== current.X
                    : true
                : d === O.Top
                  ? adjacent.Y > current.Y
                  : d === O.Bottom
                    ? adjacent.Y < current.Y
                    : d === O.Right
                      ? adjacent.X < current.X
                      : d === O.Left
                        ? adjacent.X > current.X
                        : true,
            )
          )
            continue;
        }
        if (
          current !== source &&
          adjacent !== target &&
          !adjacent.isPortOf(sourceNode) &&
          !adjacent.isPortOf(targetNode) &&
          adjacent.Container
        ) {
          const a = routeSearchIsDescendantOf(
              this.work,
              sourceContainer,
              adjacent.Container,
            ),
            b = routeSearchIsDescendantOf(
              this.work,
              targetContainer,
              adjacent.Container,
            );
          if (!a && !b && !fixed.has(adjacent.Container)) continue;
        }
        if (
          adjacent !== target &&
          current !== source &&
          adjacent.X !== current.X &&
          adjacent.Y !== current.Y
        )
          continue;
        if (adjacent.isPortOf(sourceNode) && blockedSource.has(adjacent.Point))
          continue;
        let next: number;
        if (current === source) {
          next = 1;
          if (!shareSource && used.duplicateSource.has(adjacent.Point))
            next = infinity;
          if (
            used.sharedClusterSource.size > 0 &&
            !used.sharedClusterSource.has(adjacent.Point)
          )
            next += 2 * this.turnCost;
          if (preferFacing && !fromFacing.has(adjacent.Point))
            next += nonFacing;
          if (!adjacent.isCenterPortOf(sourceNode))
            next += this.nonCenterPortCost;
          else if (!symmetric.has(adjacent)) next += 1;
        } else next = e.Distance;
        if (
          sourceContainer &&
          sourceContainer === targetContainer &&
          !(sourceBelow || targetBelow) &&
          (adjacent.Container === null ||
            adjacent.Container !== sourceContainer) &&
          current.Container !== adjacent.Container
        )
          next += this.turnCost * 4;
        if (current.sharesPortOwner(adjacent)) next += this.turnCost * 4;
        if (adjacent === target) {
          next = 1;
          if (!shareTarget && used.duplicateTarget.has(current.Point))
            next = infinity;
          if (
            used.sharedClusterTarget.size > 0 &&
            !used.sharedClusterTarget.has(current.Point)
          )
            next += 2 * this.turnCost;
          if (preferFacing && !toFacing.has(current.Point)) next += nonFacing;
          if (current.isPortOf(targetNode)) {
            if (!current.isCenterPortOf(targetNode))
              next += this.nonCenterPortCost;
            else if (!symmetric.has(current)) next += 1;
          }
        } else if (adjacent.IsNodeCenter) next = infinity;
        else {
          const overlapping: Edge[] = [];
          let prohibited = false;
          if (current !== source && current !== target)
            for (const route of this.inventory.overlappingRoutes.get(e) ?? []) {
              this.work.ReserveProduct(BigInt(route.OVGNodes.length) + 1n, 2n);
              overlapping.push(route.GEdge);
              if (
                edge.IsDirected() &&
                route.isOpposingColinear(current, adjacent)
              ) {
                prohibited = true;
                break;
              }
              if (
                adjacent.IsTunnel &&
                (route.isEntireColinear(adjacent, current) ||
                  route.isEntireColinear(current, adjacent))
              ) {
                prohibited = true;
                break;
              }
            }
          if (!prohibited) {
            const canOverlap = edgeCanOverlapEdgesGuarded(
              edge,
              overlapping,
              sourceCluster,
              targetCluster,
              this.work,
            );
            prohibited = overlapping.length > 0 && !canOverlap;
          }
          let adjacentOnRoute = false;
          if (!prohibited && current !== source && current !== target)
            adjacentOnRoute =
              this.inventory.routesAt(adjacent.Point).length > 0;
          if (
            !prohibited &&
            !onRoute &&
            !adjacentOnRoute &&
            current !== source &&
            this.inventory.hasNearbyEdge.has(e)
          )
            prohibited = true;
          if (prohibited) next = sharedRouteCost;
          else {
            let crossing = onRoute && !adjacentOnRoute && !shareable;
            if (!crossing && current !== source)
              crossing = this.inventory.edgeSet.intersectsWithChecked(
                e,
                this.work,
              );
            if (crossing) next += this.crossingCost;
          }
        }
        for (const label of this.inventory.positionedLabels) {
          this.work.Step();
          if (segmentIntersectsBox(e.From.Point, e.To.Point, label.Box)) {
            next += infinity;
            break;
          }
        }
        for (const box of labelBoxes) {
          this.work.Step();
          if (segmentIntersectsBox(e.From.Point, e.To.Point, box.Box))
            next += this.turnCost;
        }
        if (current.isPortOf(sourceNode) && edge.SourceArrowheadLabel) {
          const positioned = PositionArrowheadLabel(edge, false, [
            current.Point,
            adjacent.Point,
          ])!;
          next += positionedArrowheadLabelCostGuarded(
            positioned,
            nonAncestors,
            this.inventory.positionedLabels,
            this.inventory.routes,
            [],
            this.work,
          );
        }
        if (adjacent.isPortOf(targetNode) && edge.TargetArrowheadLabel) {
          const positioned = PositionArrowheadLabel(edge, true, [
            current.Point,
            adjacent.Point,
          ])!;
          next += positionedArrowheadLabelCostGuarded(
            positioned,
            nonAncestors,
            this.inventory.positionedLabels,
            this.inventory.routes,
            [],
            this.work,
          );
        }
        if (
          last &&
          adjacent !== target &&
          current !== source &&
          last !== source
        ) {
          const turns =
            (!fromHorizontal && adjacent.X !== current.X) ||
            (fromHorizontal && adjacent.Y !== current.Y);
          if (turns) {
            let multiplier = 1;
            for (const axis of axes) {
              this.work.Step();
              if (
                Math.abs((axis.isX ? adjacent.X : adjacent.Y) - axis.val) <= 4
              ) {
                multiplier = 0.98;
                break;
              }
            }
            if (
              multiplier !== 1 &&
              sourceNode.Cluster &&
              sourceNode.Cluster.Arrangement ===
                sourceNode.Cluster.DesiredArrangement &&
              sourceNode.Cluster.Nodes.length % 2 === 0
            )
              multiplier = 0.1;
            if (
              (!fromHorizontal && adjacent.X !== current.X) ||
              (fromHorizontal && adjacent.Y !== current.Y)
            ) {
              next += this.turnCost * multiplier;
              if (!(sourceBelow || targetBelow)) {
                if (current.distanceToBoundary(targetNode) <= 20)
                  next += this.turnCost;
                if (current.distanceToBoundary(sourceNode) <= 20)
                  next += this.turnCost;
              }
            }
          }
        }
        if (
          current !== source &&
          adjacent !== target &&
          adjacent.IsNearPort?.size
        ) {
          if (adjacent.IsNearPort.has(sourceNode)) next += 1;
          else if (adjacent.IsNearPort.has(targetNode)) next += 1;
        }
        const candidate = least + next;
        let state = contexts[adjacent.Index];
        if (!state) {
          state = {
            verticalDistance: Infinity,
            horizontalDistance: Infinity,
            verticalEntry: null,
            horizontalEntry: null,
          };
          contexts[adjacent.Index] = state;
        }
        if (adjacent.Y === current.Y) {
          if (candidate < state.horizontalDistance) {
            const prior = horizontal[adjacent.Index];
            if (prior)
              this.queue.push(
                contexts[prior.Index]!.horizontalDistance,
                prior,
                true,
                this.work,
              );
            if (!state.horizontalEntry)
              state.horizontalEntry = this.queue.push(
                candidate,
                adjacent,
                true,
                this.work,
              );
            else
              this.queue.decrease(state.horizontalEntry, candidate, this.work);
            state.horizontalDistance = candidate;
            horizontal[adjacent.Index] = current;
          }
        } else if (candidate < state.verticalDistance) {
          const prior = vertical[adjacent.Index];
          if (prior)
            this.queue.push(
              contexts[prior.Index]!.verticalDistance,
              prior,
              false,
              this.work,
            );
          if (!state.verticalEntry)
            state.verticalEntry = this.queue.push(
              candidate,
              adjacent,
              false,
              this.work,
            );
          else this.queue.decrease(state.verticalEntry, candidate, this.work);
          state.verticalDistance = candidate;
          vertical[adjacent.Index] = current;
        }
      }
    }
    throw new Error(`path not found for '${edgeDebug(edge)}'. Queue is empty`);
  }
}
