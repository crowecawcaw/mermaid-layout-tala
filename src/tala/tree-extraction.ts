import type { LayoutEdge, LayoutNode } from '../layout.js';

/** The flat-graph part of upstream trees.extractTreesInContainer. */
export interface ExtractedTree {
  id: string;
  children: ExtractedTree[];
}
export interface ExtractedTreeRoots {
  sentinel: string;
  roots: ExtractedTree[];
}
export interface TreeExtraction {
  remaining: string[];
  trees: ExtractedTreeRoots[];
}
type TreeDirection = 'Inwards' | 'Outwards' | 'Undirected';
interface TreeRecord extends ExtractedTree { sentinelEdge?: LayoutEdge; }

function edgeDirection(node: string, edge: LayoutEdge): TreeDirection {
  if (edge.directed === false) return 'Undirected';
  return edge.to === node ? 'Inwards' : 'Outwards';
}

function dominantDirection(root: TreeRecord): TreeDirection {
  const stack = [root];
  while (stack.length) {
    const tree = stack.pop()!;
    const direction = edgeDirection(tree.id, tree.sentinelEdge!);
    if (direction !== 'Undirected') return direction;
    stack.push(...(tree.children as TreeRecord[]).slice().reverse());
  }
  return edgeDirection(root.id, root.sentinelEdge!);
}

export function extractFlatTrees(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): TreeExtraction {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const graphNodes = nodes.map((node) => node.id);
  const graphEdges = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  const nodeToTree = new Map(nodes.map((node) => [node.id, { id: node.id, children: [] } as TreeRecord]));
  const rootsAt = new Map<string, TreeRecord[]>();
  const arrowheadsAt = new Map<string, Set<'triangle' | 'none'>>();
  const terminals = new Set(nodes.filter((node) => node.isGroup).map((node) => node.id));
  const remaining = new Set(graphNodes);
  const incident = (id: string) => graphEdges.filter((edge) => remaining.has(edge.from)
    && remaining.has(edge.to) && (edge.from === id || edge.to === id));

  while (true) {
    const fringe = graphNodes.filter((id) => remaining.has(id) && !terminals.has(id)
      && incident(id).length === 1);
    if (fringe.length === 0) break;
    for (const id of fringe) {
      if (terminals.has(id)) continue;
      const edge = incident(id)[0]!;
      const sentinel = edge.from === id ? edge.to : edge.from;
      if (incident(sentinel).length === 1 && !terminals.has(sentinel)) {
        terminals.add(id);
        continue;
      }
      const tree = nodeToTree.get(id)!;
      tree.sentinelEdge = edge;
      const roots = rootsAt.get(sentinel) ?? [];
      roots.push(tree);
      rootsAt.set(sentinel, roots);
      const arrowheads = arrowheadsAt.get(sentinel) ?? new Set<'triangle' | 'none'>();
      arrowheads.add(edge.directed !== false && edge.to === sentinel ? 'triangle' : 'none');
      arrowheadsAt.set(sentinel, arrowheads);
      const ownRoots = (rootsAt.get(id) ?? []).filter((root) => !terminals.has(root.id));
      if (ownRoots.length > 0) {
        const directions = new Set(ownRoots.map(dominantDirection));
        if (directions.size > 1 || arrowheadsAt.get(id)!.size > 1) {
          terminals.add(id);
        } else {
          tree.children.push(...ownRoots);
          const sentinelDirection = edgeDirection(id, edge);
          if (!directions.has('Undirected') && sentinelDirection !== 'Undirected'
            && !directions.has(sentinelDirection)) terminals.add(sentinel);
        }
      }
    }
    for (const id of fringe) if (!terminals.has(id)) remaining.delete(id);
  }
  const remainingNodes = graphNodes.filter((id) => remaining.has(id));
  const trees = remainingNodes.flatMap((id) => {
    const roots = (rootsAt.get(id) ?? []).filter((root) => !terminals.has(root.id));
    if (roots.length === 0) return [];
    const copy = (tree: TreeRecord): ExtractedTree => ({ id: tree.id,
      children: (tree.children as TreeRecord[]).map(copy) });
    return [{ sentinel: id, roots: roots.map(copy) }];
  });
  return { remaining: remainingNodes, trees };
}
