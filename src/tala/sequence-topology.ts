import { TalaGraph, TalaNode, type TalaEdge } from './graph.js';
import { TalaSequence } from './sequence-geometry.js';

/** grouping.identifySequences: maximal connected runs of eligible sibling steps. */
export function identifySequences(graph: TalaGraph, container: TalaNode | null): TalaNode[][] {
  const active = new Set(graph.nodes);
  const steps = (graph.containers.get(container) ?? []).filter((node) =>
    active.has(node) && !node.isGroup && !node.fixedTopLeft
      && node.shape?.toLowerCase() === 'step');
  if (steps.length < 2) return [];
  const groups: TalaNode[][] = [];
  let run = [steps[0]!];
  for (let i = 1; i < steps.length; i++) {
    const previous = steps[i - 1]!, current = steps[i]!;
    if (previous.edges.some((edge) => previous.adjacent(edge) === current)) run.push(current);
    else {
      if (run.length > 1) groups.push(run);
      run = [current];
    }
  }
  if (run.length > 1) groups.push(run);
  return groups;
}

function containerOrder(graph: TalaGraph): Array<TalaNode | null> {
  const ordered: Array<TalaNode | null> = [];
  const visit = (container: TalaNode | null): void => {
    for (const child of graph.containers.get(container) ?? []) {
      if (child.isGroup) visit(child);
    }
    if (container) ordered.push(container);
  };
  visit(null);
  ordered.push(null);
  return ordered;
}

/** grouping.SequenceDefiningEdges uses the first incident edge for each pair. */
export function sequenceDefiningEdges(graph: TalaGraph): string[] {
  const ids: string[] = [];
  for (const container of containerOrder(graph)) {
    for (const steps of identifySequences(graph, container)) {
      for (let i = 1; i < steps.length; i++) {
        const previous = steps[i - 1]!, current = steps[i]!;
        const edge = previous.edges.find((candidate) => previous.adjacent(candidate) === current);
        if (!edge) throw new Error(`sequence steps ${previous.id} and ${current.id} are disconnected`);
        ids.push(edge.id);
      }
    }
  }
  return ids;
}

interface Snapshot {
  nodes: TalaNode[];
  edges: TalaEdge[];
  containers: Map<TalaNode | null, TalaNode[]>;
  endpoints: Map<TalaEdge, { from: TalaNode; to: TalaNode }>;
  adjacency: Map<TalaNode, TalaEdge[]>;
  parents: Map<TalaNode, TalaNode | null>;
  children: Map<TalaNode, TalaNode[]>;
  cellSize: number;
}

/** grouping.AddSequences and Cleanup's reversible topology mutation. */
export function activateSequences(graph: TalaGraph,
  vesselIds?: readonly string[]): { sequences: TalaSequence[]; restore(): void } {
  const groups = containerOrder(graph).flatMap((container) => identifySequences(graph, container));
  const ids = vesselIds ?? groups.map((_, index) => `__tala_sequence_${index}`);
  if (ids.length !== groups.length) throw new Error('sequence vessel count mismatch');
  const reserved = new Set(graph.nodes.map((node) => node.id));
  for (const id of ids) {
    if (reserved.has(id)) throw new Error(`duplicate vessel ID ${id}`);
    reserved.add(id);
  }
  const snapshot: Snapshot = {
    nodes: [...graph.nodes], edges: [...graph.edges],
    containers: new Map([...graph.containers].map(([container, nodes]) => [container, [...nodes]])),
    endpoints: new Map(graph.edges.map((edge) => [edge, { from: edge.from, to: edge.to }])),
    adjacency: new Map(graph.nodes.map((node) => [node, [...node.edges]])),
    parents: new Map(graph.nodes.map((node) => [node, node.parent])),
    children: new Map(graph.nodes.map((node) => [node, [...node.children]])),
    cellSize: graph.cellSize,
  };
  const sequences: TalaSequence[] = [];
  for (const [index, steps] of groups.entries()) {
    const container = steps[0]!.parent;
    const sequence = new TalaSequence(new TalaNode({ id: ids[index]!, width: 1, height: 1 }), steps, container);
    const vessel = sequence.vessel;
    vessel.parent = container;
    const members = new Set(steps);
    for (let i = 1; i < steps.length; i++) {
      const previous = steps[i - 1]!, current = steps[i]!;
      const defining = previous.edges.find((edge) => previous.adjacent(edge) === current);
      if (!defining) throw new Error(`sequence steps ${previous.id} and ${current.id} are disconnected`);
      sequence.definingEdges.push(defining);
      graph.edges.splice(graph.edges.indexOf(defining), 1);
      defining.from.edges.splice(defining.from.edges.indexOf(defining), 1);
      if (defining.to !== defining.from) defining.to.edges.splice(defining.to.edges.indexOf(defining), 1);
    }
    // Upstream abducts external edges before removing the step nodes.
    for (const edge of graph.edges) {
      if (members.has(edge.from) && members.has(edge.to)) continue;
      if (members.has(edge.from)) {
        sequence.edgeAbductions.push({ edge, originallyFrom: edge.from,
          currentFrom: vessel, currentTo: edge.to });
        edge.from.edges.splice(edge.from.edges.indexOf(edge), 1);
        edge.from = vessel;
        vessel.edges.push(edge);
      }
      if (members.has(edge.to)) {
        sequence.edgeAbductions.push({ edge, originallyTo: edge.to,
          currentFrom: edge.from, currentTo: vessel });
        edge.to.edges.splice(edge.to.edges.indexOf(edge), 1);
        edge.to = vessel;
        if (!vessel.edges.includes(edge)) vessel.edges.push(edge);
      }
    }
    const siblings = graph.containers.get(container) ?? [];
    graph.containers.set(container, [...siblings.filter((node) => !members.has(node)), vessel]);
    if (container) container.children.splice(0, container.children.length,
      ...container.children.filter((node) => !members.has(node)), vessel);
    for (const node of steps) node.parent = null;
    graph.nodes.splice(0, graph.nodes.length, ...graph.nodes.filter((node) => !members.has(node)), vessel);
    sequences.push(sequence);
  }
  let restored = false;
  return { sequences, restore(): void {
    if (restored) return;
    for (const sequence of sequences) sequence.arrangeSteps();
    graph.nodes.splice(0, graph.nodes.length, ...snapshot.nodes);
    graph.edges.splice(0, graph.edges.length, ...snapshot.edges);
    graph.containers.clear();
    for (const [container, nodes] of snapshot.containers) graph.containers.set(container, [...nodes]);
    for (const [node, parent] of snapshot.parents) node.parent = parent;
    for (const [node, children] of snapshot.children) node.children.splice(0, node.children.length, ...children);
    for (const [edge, endpoints] of snapshot.endpoints) {
      edge.from = endpoints.from;
      edge.to = endpoints.to;
    }
    for (const [node, edges] of snapshot.adjacency) node.edges.splice(0, node.edges.length, ...edges);
    for (const sequence of sequences) sequence.vessel.edges.splice(0);
    graph.cellSize = snapshot.cellSize;
    restored = true;
  } };
}
