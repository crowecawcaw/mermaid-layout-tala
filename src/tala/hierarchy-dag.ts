import type { LayoutEdge, LayoutNode } from '../layout.js';
import type { RankEdge } from '../rank.js';

interface Arc { from: string; to: string; weight: number; index: number }

/** Arrow orientation follows layoutgraph.Edge's default target arrow policy. */
export function hierarchyArrowDirection(edge: LayoutEdge): 'forward' | 'backward' | 'neutral' {
  const source = edge.sourceArrowhead !== undefined
    && edge.sourceArrowhead !== '' && edge.sourceArrowhead !== 'none';
  const target = edge.targetArrowhead === undefined
    ? edge.sourceArrowhead === undefined && edge.directed !== false
    : edge.targetArrowhead !== '' && edge.targetArrowhead !== 'none';
  if (source === target) return 'neutral';
  return source ? 'backward' : 'forward';
}

/** Flat graph translation of makeSimpleDAG, including the Eades feedback arc
 * heuristic and weighted duplicate merging. Input edges remain untouched. */
export function prepareHierarchyDag(nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[]): RankEdge[] {
  const arcs: Arc[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const direction = hierarchyArrowDirection(edge);
    if (direction === 'forward') arcs.push({ from: edge.from, to: edge.to,
      weight: 1, index: arcs.length });
    else if (direction === 'backward') arcs.push({ from: edge.to, to: edge.from,
      weight: 1, index: arcs.length });
    else {
      arcs.push({ from: edge.from, to: edge.to, weight: 1, index: arcs.length });
      arcs.push({ from: edge.to, to: edge.from, weight: 0, index: arcs.length });
    }
  }
  const active = new Set(arcs);
  const remaining = new Set(nodes.map((node) => node.id));
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const degree = (id: string): { incoming: number; outgoing: number } => {
    let incoming = 0, outgoing = 0;
    for (const arc of active) {
      if (arc.to === id) incoming++;
      if (arc.from === id) outgoing++;
    }
    return { incoming, outgoing };
  };
  const prune = (id: string, reverseIncoming: boolean): void => {
    for (const arc of [...active]) {
      if (arc.from !== id && arc.to !== id) continue;
      if (reverseIncoming && arc.to === id) [arc.from, arc.to] = [arc.to, arc.from];
      active.delete(arc);
    }
    remaining.delete(id);
  };
  // Each pass removes at least one node; the bounded input model rules out
  // unbounded work even for a dense component.
  while (remaining.size) {
    let changed: boolean;
    do {
      changed = false;
      for (const id of [...remaining]) if (degree(id).outgoing === 0) {
        prune(id, false); changed = true;
      }
    } while (changed);
    do {
      changed = false;
      for (const id of [...remaining]) if (degree(id).incoming === 0) {
        prune(id, false); changed = true;
      }
    } while (changed);
    if (!remaining.size) break;
    const best = [...remaining].sort((a, b) => {
      const da = degree(a), db = degree(b);
      return db.outgoing - db.incoming - (da.outgoing - da.incoming)
        || db.incoming + db.outgoing - da.incoming - da.outgoing
        || da.incoming - db.incoming || order.get(a)! - order.get(b)!;
    })[0]!;
    prune(best, true);
  }
  const unique = new Map<string, Arc>();
  for (const arc of arcs) {
    const key = `${arc.from}\0${arc.to}`;
    const retained = unique.get(key);
    if (retained) retained.weight += arc.weight;
    else unique.set(key, { ...arc });
  }
  return [...unique.values()].map((arc) => ({
    id: String(arc.index + 1).padStart(6, '0'),
    from: arc.from, to: arc.to, weight: arc.weight,
  }));
}
