import type { LayoutEdge, LayoutNode } from '../layout.js';
import { GoRandom } from './go-rng.js';
import { extractFlatTrees } from './tree-extraction.js';

export interface FlatCluster {
  nodes: string[];
  arrangement: 'Row' | 'Column';
  padding: number;
  width: number;
  height: number;
}
export interface FlatClusterDiscovery { remaining: string[]; clusters: FlatCluster[] }

interface Signature {
  from: number;
  to: number;
  directed: number;
  undirected: number;
  neighbors: Set<string>;
  fromArrowheads: Set<string>;
  toArrowheads: Set<string>;
}
const equalSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((value) => b.has(value));
const round = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

function signatureFor(id: string, edges: readonly LayoutEdge[]): Signature {
  const signature: Signature = { from: 0, to: 0, directed: 0, undirected: 0,
    neighbors: new Set(), fromArrowheads: new Set(), toArrowheads: new Set() };
  for (const edge of edges) {
    if (edge.from !== id && edge.to !== id) continue;
    signature.neighbors.add(edge.from === id ? edge.to : edge.from);
    if (edge.from === id) signature.from++;
    if (edge.to === id) signature.to++;
    if (edge.directed === false) signature.undirected++;
    else signature.directed++;
    if (edge.from === id) {
      signature.fromArrowheads.add('none');
      signature.toArrowheads.add(edge.directed === false ? 'none' : 'triangle');
    } else {
      signature.fromArrowheads.add(edge.directed === false ? 'none' : 'triangle');
      signature.toArrowheads.add('none');
    }
  }
  return signature;
}

function matches(a: Signature, b: Signature): boolean {
  return a.neighbors.size > 0 && equalSet(a.neighbors, b.neighbors)
    && a.from === b.from && a.to === b.to && a.undirected === b.undirected
    && !(a.directed && a.undirected) && !(b.directed && b.undirected)
    && equalSet(a.fromArrowheads, b.fromArrowheads)
    && equalSet(a.toArrowheads, b.toArrowheads);
}

/** Flat sibling part of grouping.AddClusters, after tree extraction. */
export function discoverFlatClusters(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[],
  seed: number): FlatClusterDiscovery {
  const retained = new Set(extractFlatTrees(nodes, edges).remaining);
  const active = nodes.filter((node) => retained.has(node.id));
  const activeEdges = edges.filter((edge) => retained.has(edge.from) && retained.has(edge.to));
  const signatures = new Map(active.map((node) => [node.id, signatureFor(node.id, activeEdges)]));
  const consumed = new Set<string>();
  const clusteredNeighbors = new Set<string>();
  const random = new GoRandom(seed);
  const clusters: FlatCluster[] = [];
  for (const node of active) {
    if (consumed.has(node.id) || clusteredNeighbors.has(node.id) || node.isGroup) continue;
    const group = active.filter((other) => {
      if (other.id === node.id) return true;
      if (consumed.has(other.id) || other.isGroup || other.shape !== node.shape) return false;
      if (other.width * 4 < node.width || node.width * 4 < other.width
        || other.height * 4 < node.height || node.height * 4 < other.height) return false;
      return matches(signatures.get(node.id)!, signatures.get(other.id)!);
    });
    if (group.length < 2) continue;
    const averageWidth = round(group.reduce((sum, member) => sum + member.width, 0) / group.length);
    const averageHeight = round(group.reduce((sum, member) => sum + member.height, 0) / group.length);
    const arrangement = averageWidth > averageHeight ? 'Column'
      : averageWidth < averageHeight ? 'Row' : random.float64() > 0.5 ? 'Column' : 'Row';
    const padding = 20;
    const maxWidth = Math.max(...group.map((member) => member.width));
    const maxHeight = Math.max(...group.map((member) => member.height));
    clusters.push({ nodes: group.map((member) => member.id), arrangement, padding,
      width: arrangement === 'Row' ? maxWidth * group.length + padding * (group.length - 1) : maxWidth,
      height: arrangement === 'Column' ? maxHeight * group.length + padding * (group.length - 1) : maxHeight });
    for (const member of group) consumed.add(member.id);
    for (const member of group) for (const adjacent of signatures.get(member.id)!.neighbors) clusteredNeighbors.add(adjacent);
  }
  return { remaining: active.filter((node) => !consumed.has(node.id)).map((node) => node.id), clusters };
}
