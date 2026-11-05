// Translated portions of internal/routing/ovg_node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import { Orientation } from '../geo/orientation.js';
import { EuclideanDistance } from '../geo/math.js';
import type { Node } from '../layoutgraph/node.js';
import type { OVGEdge } from './ovg-edge.js';
export type PortDirectionSet = number;
export interface OVGPortMetadata {
  directions: PortDirectionSet;
  isCenterPort: boolean;
}
export function newPortDirectionSet(direction: Orientation): PortDirectionSet {
  return direction < Orientation.TopLeft || direction > Orientation.NONE
    ? 0
    : 1 << direction;
}
export function portDirectionsHas(
  directions: PortDirectionSet,
  direction: Orientation,
): boolean {
  return (directions & newPortDirectionSet(direction)) !== 0;
}
export function portDirectionsAny(
  directions: PortDirectionSet,
  predicate: (direction: Orientation) => boolean,
): boolean {
  if (directions === 0) return predicate(Orientation.NONE);
  for (
    let direction = Orientation.TopLeft;
    direction <= Orientation.NONE;
    direction++
  )
    if (portDirectionsHas(directions, direction) && predicate(direction))
      return true;
  return false;
}
export function portDirectionsTransformed(
  directions: PortDirectionSet,
  transform: (direction: Orientation) => Orientation,
): PortDirectionSet {
  let result = 0;
  portDirectionsAny(directions, (direction) => {
    result |= newPortDirectionSet(transform(direction));
    return false;
  });
  return result;
}
export class OVGNode {
  Edges: OVGEdge[] = [];
  IsNearPort: Set<Node> | null = null;
  private portOwnersByNode: Map<Node, OVGPortMetadata> | null = null;
  Container: Node | null = null;
  Index = 0;
  IsNodeCenter = false;
  IsTunnel = false;
  constructor(public Point: Point) {}
  get X(): number {
    return this.Point.X;
  }
  set X(x: number) {
    this.Point.X = x;
  }
  get Y(): number {
    return this.Point.Y;
  }
  set Y(y: number) {
    this.Point.Y = y;
  }
  addPortMetadata(owner: Node | null, added: OVGPortMetadata): void {
    if (!owner) return;
    this.portOwnersByNode ??= new Map();
    const previous = this.portOwnersByNode.get(owner);
    this.portOwnersByNode.set(owner, {
      directions: (previous?.directions ?? 0) | added.directions,
      isCenterPort: (previous?.isCenterPort ?? false) || added.isCenterPort,
    });
  }
  addPortOwner(
    owner: Node | null,
    direction: Orientation,
    isCenterPort: boolean,
  ): void {
    this.addPortMetadata(owner, {
      directions: newPortDirectionSet(direction),
      isCenterPort,
    });
  }
  setCenterPort(owner: Node): void {
    const data = this.portMetadataFor(owner);
    if (data) this.addPortMetadata(owner, { ...data, isCenterPort: true });
  }
  portMetadataFor(owner: Node): OVGPortMetadata | undefined {
    return this.portOwnersByNode?.get(owner);
  }
  isPort(): boolean {
    return (this.portOwnersByNode?.size ?? 0) > 0;
  }
  isPortOf(owner: Node): boolean {
    return this.portOwnersByNode?.has(owner) ?? false;
  }
  portDirectionsFor(owner: Node): [PortDirectionSet, boolean] {
    const data = this.portMetadataFor(owner);
    return [data?.directions ?? 0, data !== undefined];
  }
  hasPortDirection(owner: Node, direction: Orientation): boolean {
    const [directions, ok] = this.portDirectionsFor(owner);
    return ok && portDirectionsHas(directions, direction);
  }
  portDirectionsForObstacle(owner: Node): PortDirectionSet {
    return this.portDirectionsFor(owner)[0];
  }
  setPortDirections(owner: Node, directions: PortDirectionSet): void {
    const data = this.portMetadataFor(owner);
    if (data) this.portOwnersByNode!.set(owner, { ...data, directions });
  }
  isCenterPortOf(owner: Node): boolean {
    return this.portMetadataFor(owner)?.isCenterPort ?? false;
  }
  portOwners(): Map<Node, OVGPortMetadata> | null {
    return this.portOwnersByNode;
  }
  sharesPortOwner(other: OVGNode | null): boolean {
    if (!other) return false;
    for (const owner of this.portOwnersByNode?.keys() ?? [])
      if (other.isPortOf(owner)) return true;
    return false;
  }
  addEdge(edge: OVGEdge): void {
    this.Edges.push(edge);
  }
  Adjacent(edge: OVGEdge): OVGNode {
    return this === edge.From ? edge.To : edge.From;
  }
  distanceToBoundary(node: Node): number {
    const x1 = this.X,
      y1 = this.Y,
      x2 = node.TopLeft!.X,
      y2 = node.TopLeft!.Y,
      x2b = x2 + node.Width,
      y2b = y2 + node.Height;
    const left = x2b < x1,
      right = x1 < x2,
      top = y2b < y1,
      bottom = y1 < y2;
    if (top && left) return EuclideanDistance(x1, y1, x2b, y2b);
    if (left && bottom) return EuclideanDistance(x1, y1, x2b, y2);
    if (bottom && right) return EuclideanDistance(x1, y1, x2, y2);
    if (right && top) return EuclideanDistance(x1, y1, x2, y2b);
    if (left) return x1 - x2b;
    if (right) return x2 - x1;
    if (bottom) return y2 - y1;
    if (top) return y1 - y2b;
    return 0;
  }
}
