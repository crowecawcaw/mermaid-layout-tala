import type { Point } from '../layout.js';
import { shapePortGroups } from './shape-ports.js';
import { assertOVGCount, MAX_OVG_INTERSECTION_CANDIDATES } from './ovg-limits.js';

export interface OVGCandidateNode {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  numColumns?: number;
  isGroup?: boolean;
  parentId?: string;
}

interface NodePorts { groups: Point[][]; all: Point[] }
export interface OVGCandidates { ports: [Point[], Point[]]; perimeter: Point[];
  halfway: Point[]; intersections: Point[] }
type Orientation = 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft'
  | 'bottomRight' | 'left' | 'right' | 'none';
const overshootAmount = 100;

/** Candidate-coordinate branch of upstream routing/ovg.go for two ordinary
 * nodes. These points feed OVG visibility filtering and search. */
export function ovgCandidatePoints(node: OVGCandidateNode,
  other: OVGCandidateNode): OVGCandidates {
  const firstPorts = ports(node), secondPorts = ports(other);
  const perimeter = perimeterPoints(node, other, firstPorts, secondPorts);
  const halfway = halfwayPoints(node, other, firstPorts, secondPorts);
  const intersections = portIntersections([node, other], [firstPorts, secondPorts]);
  return { ports: [firstPorts.all, secondPorts.all], perimeter, halfway, intersections };
}

/** Intersection candidates across every node whose ports are included in an
 * OVG. Component construction decides which nodes participate. */
export function ovgPortGridIntersections(nodes: readonly OVGCandidateNode[]): Point[] {
  return portIntersections(nodes, nodes.map(ports));
}

/** The port-grid cross section of addNodesIntersections, with upstream's
 * port clearance, node clearance, and two-owner visibility checks. */
function portIntersections(nodes: readonly OVGCandidateNode[],
  portSets: readonly NodePorts[]): Point[] {
  const xs = [...new Set(portSets.flatMap((ports) => ports.all.map((point) => point.x)))].sort((a, b) => a - b);
  const ys = [...new Set(portSets.flatMap((ports) => ports.all.map((point) => point.y)))].sort((a, b) => a - b);
  assertOVGCount('intersection candidate count', xs.length * ys.length,
    MAX_OVG_INTERSECTION_CANDIDATES);
  const result: Point[] = [];
  for (const x of xs) for (const y of ys) {
    const candidate = { x, y };
    if (portSets.some((ports) => ports.all.some((port) =>
      port.x === x && Math.abs(port.y - y) <= 20
      || port.y === y && Math.abs(port.x - x) <= 20))) continue;
    if (nodes.some((node) => !node.isGroup && pointNearNode(candidate, node, 20))) continue;
    const alignedOwners = nodes.map((_node, index) => index).filter((index) =>
      portSets[index]!.all.some((port) => port.x === x || port.y === y));
    let visibleOwners = 0;
    for (const index of alignedOwners) {
      const owner = nodes[index]!;
      const visible = portSets[index]!.all.some((port) => {
        if (port.x !== x && port.y !== y) return false;
        if (port.x === x && (port.x === owner.x || port.x === owner.x + owner.width)) return false;
        if (port.y === y && (port.y === owner.y || port.y === owner.y + owner.height)) return false;
        return nodes.every((blocker, blockerIndex) => blockerIndex === index || blocker.isGroup
          || !segmentPassesThroughNode(port, candidate, blocker));
      });
      if (visible) visibleOwners++;
      if (visibleOwners === 2) break;
    }
    if (visibleOwners === 2 || alignedOwners.length === 0) result.push(candidate);
  }
  return result;
}

function pointNearNode(point: Point, node: OVGCandidateNode, pad: number): boolean {
  return node.x - pad <= point.x && point.x <= node.x + node.width + pad
    && node.y - pad <= point.y && point.y <= node.y + node.height + pad;
}

function segmentPassesThroughNode(a: Point, b: Point, node: OVGCandidateNode): boolean {
  if (a.x === b.x) return node.x <= a.x && a.x <= node.x + node.width
    && Math.max(a.y, b.y) >= node.y && Math.min(a.y, b.y) <= node.y + node.height;
  if (a.y === b.y) return node.y <= a.y && a.y <= node.y + node.height
    && Math.max(a.x, b.x) >= node.x && Math.min(a.x, b.x) <= node.x + node.width;
  return false;
}

export function ovgPortGroups(node: OVGCandidateNode): Point[][] {
  return shapePortGroups(node.shape, { x: node.x, y: node.y },
    node.width, node.height, node.numColumns);
}

function ports(node: OVGCandidateNode): NodePorts {
  const groups = ovgPortGroups(node);
  return { groups, all: groups.flat() };
}

function perimeterPoints(node: OVGCandidateNode, other: OVGCandidateNode,
  firstPorts: NodePorts, secondPorts: NodePorts): Point[] {
  const top = Math.min(node.y, other.y) - overshootAmount;
  const bottom = Math.max(node.y + node.height, other.y + other.height) + overshootAmount;
  const left = Math.min(node.x, other.x) - overshootAmount;
  const right = Math.max(node.x + node.width, other.x + other.width) + overshootAmount;
  const result: Point[] = [];
  for (const ports of [firstPorts, secondPorts]) {
    for (const port of ports.groups[0]!) result.push({ x: port.x, y: top });
    for (const port of ports.groups[2]!) result.push({ x: port.x, y: bottom });
    for (const port of ports.groups[1]!) result.push({ x: left, y: port.y });
    for (const port of ports.groups[3]!) result.push({ x: right, y: port.y });
  }
  result.push({ x: left, y: top }, { x: right, y: top },
    { x: left, y: bottom }, { x: right, y: bottom });
  return result;
}

function halfwayPoints(node: OVGCandidateNode, other: OVGCandidateNode,
  firstPorts: NodePorts, secondPorts: NodePorts): Point[] {
  const orientation = relativeOrientation(node, other);
  if (orientation === 'none') return [];
  const fillTop = orientation === 'bottom' || orientation === 'bottomLeft'
    || orientation === 'bottomRight';
  const fillBottom = orientation === 'top' || orientation === 'topLeft'
    || orientation === 'topRight';
  const fillLeft = orientation === 'right' || orientation === 'topRight'
    || orientation === 'bottomRight';
  const fillRight = orientation === 'left' || orientation === 'topLeft'
    || orientation === 'bottomLeft';
  const nodeBR = { x: roundAway(node.x + node.width), y: roundAway(node.y + node.height) };
  const otherBR = { x: roundAway(other.x + other.width),
    y: roundAway(other.y + other.height) };
  const result: Point[] = [];
  const all = [...firstPorts.all, ...secondPorts.all];
  if (fillTop) {
    const y = (node.y + otherBR.y) / 2;
    for (const port of all) result.push({ x: port.x, y });
  }
  if (fillBottom) {
    const y = (other.y + nodeBR.y) / 2;
    for (const port of all) result.push({ x: port.x, y });
  }
  if (fillLeft) {
    const x = (node.x + otherBR.x) / 2;
    for (const port of all) result.push({ x, y: port.y });
  }
  if (fillRight) {
    const x = (other.x + nodeBR.x) / 2;
    for (const port of all) result.push({ x, y: port.y });
  }
  if (fillRight && fillBottom) result.push({ x: (other.x + nodeBR.x) / 2,
    y: (other.y + nodeBR.y) / 2 });
  if (fillRight && fillTop) result.push({ x: (other.x + nodeBR.x) / 2,
    y: (node.y + otherBR.y) / 2 });
  if (fillLeft && fillTop) result.push({ x: (node.x + otherBR.x) / 2,
    y: (node.y + otherBR.y) / 2 });
  if (fillLeft && fillBottom) result.push({ x: (node.x + otherBR.x) / 2,
    y: (other.y + nodeBR.y) / 2 });
  return result;
}

function relativeOrientation(node: OVGCandidateNode, other: OVGCandidateNode): Orientation {
  const left = node.x + node.width < other.x;
  const right = other.x + other.width < node.x;
  if (node.y + node.height < other.y) {
    if (left) return 'topLeft';
    if (right) return 'topRight';
    return 'top';
  }
  if (other.y + other.height < node.y) {
    if (left) return 'bottomLeft';
    if (right) return 'bottomRight';
    return 'bottom';
  }
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}

function roundAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
