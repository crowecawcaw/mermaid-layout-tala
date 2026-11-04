// Translated from internal/grouping/sequences.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import {
  Sequence,
  type Tree,
  type EdgeAbduction,
} from '../layoutgraph/records.js';
import {
  sequenceSyncGeometryWithWork,
  sequencePlaceVessel,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import {
  NewGraphStateSnapshot,
  RollbackGraphState,
} from '../layoutgraph/graph-state.js';
import type { GoRandom } from '../../random.js';
import { reconnectEdge } from './clusters.js';
export const isActiveSequence = (sequence: Sequence | null): boolean =>
  sequence !== null && sequence.Vessel!.Graph !== null;
export function identifySequences(
  graph: Graph,
  nodes: Node[],
  guard: WorkGuard,
): Node[][] {
  const activeNodes = new Set<Node>();
  for (const node of graph.Nodes) {
    guard.Step();
    activeNodes.add(node);
  }
  const stepNodes: Node[] = [];
  for (const node of nodes) {
    guard.Step();
    if (!activeNodes.has(node) || node.IsContainer()) continue;
    if (node.Sequence !== null && !isActiveSequence(node.Sequence)) continue;
    if (node.FixedTopLeft !== null || node.ShapeType() !== 'Step') continue;
    stepNodes.push(node);
  }
  if (stepNodes.length <= 1) return [];
  const sequences: Node[][] = [];
  let steps = [stepNodes[0]!];
  for (let i = 1; i < stepNodes.length; i++) {
    guard.Step();
    const previous = stepNodes[i - 1]!,
      current = stepNodes[i]!;
    let connected = false;
    for (const edge of previous.Edges) {
      guard.Step();
      if (previous.Adjacent(edge) === current) {
        connected = true;
        break;
      }
    }
    if (connected) steps.push(current);
    else {
      if (steps.length > 1) sequences.push(steps);
      steps = [current];
    }
  }
  if (steps.length > 1) sequences.push(steps);
  return sequences;
}
export function SequenceDefiningEdges(ctx: Context, graph: Graph): Set<bigint> {
  validateEngineGraph(ctx, 'GetSequenceDefiningEdges', graph);
  const guard = new WorkGuard(
      ctx,
      'GetSequenceDefiningEdges',
      MaxEngineWorkUnits,
    ),
    containerOrder = [...graph.containerRDFSOrderContext(null, guard), null],
    sequenceEdges = new Set<bigint>();
  for (const container of containerOrder) {
    guard.Step();
    const sequences = identifySequences(
      graph,
      graph.Containers.get(container) ?? [],
      guard,
    );
    for (const steps of sequences)
      for (let i = 1; i < steps.length; i++) {
        let connection: Edge | null = null;
        for (const edge of steps[i - 1]!.Edges) {
          guard.Step();
          if (
            (edge.From === steps[i - 1] && edge.To === steps[i]) ||
            (edge.To === steps[i - 1] && edge.From === steps[i])
          ) {
            connection = edge;
            break;
          }
        }
        if (connection === null)
          throw new Error(
            `TALA sequence steps ${steps[i - 1]!.ID} and ${steps[i]!.ID} have no defining edge`,
          );
        sequenceEdges.add(connection.ID);
      }
  }
  guard.Finish();
  return sequenceEdges;
}
export function isValidRememberedSequence(
  graph: Graph,
  vessel: Node | null,
  sequence: Sequence | null,
  activeNodes: Set<Node>,
  guard: WorkGuard,
): boolean {
  if (
    vessel === null ||
    sequence === null ||
    isActiveSequence(sequence) ||
    sequence.Vessel !== vessel ||
    sequence.Graph !== graph ||
    sequence.Nodes.length < 2
  )
    return false;
  if (sequence.Container !== null && !activeNodes.has(sequence.Container))
    return false;
  const children = graph.Containers.get(sequence.Container);
  if (children === undefined) return false;
  const childIndex = new Map<Node, number>(),
    duplicateChild = new Set<Node>();
  for (let i = 0; i < children.length; i++) {
    guard.Step();
    const child = children[i]!;
    if (childIndex.has(child)) {
      duplicateChild.add(child);
      continue;
    }
    childIndex.set(child, i);
  }
  const seen = new Set<Node>();
  let previousIndex = -1;
  for (const node of sequence.Nodes) {
    guard.Step();
    if (node === null || seen.has(node)) return false;
    seen.add(node);
    if (
      !activeNodes.has(node) ||
      node.Graph !== graph ||
      node.ShapeType() !== 'Step' ||
      node.FixedTopLeft !== null
    )
      return false;
    if (node.Sequence !== sequence || node.Container !== sequence.Container)
      return false;
    const index = childIndex.get(node);
    if (index === undefined || duplicateChild.has(node)) return false;
    if (previousIndex >= 0 && index !== previousIndex + 1) return false;
    previousIndex = index;
  }
  return true;
}
export function clearRememberedSequenceMembership(
  sequence: Sequence | null,
  guard: WorkGuard,
): void {
  if (sequence === null) return;
  for (const node of sequence.Nodes) {
    guard.Step();
    if (node !== null && node.Sequence === sequence) node.Sequence = null;
  }
}
export function hasNodeID(graph: Graph, id: bigint): boolean {
  const hasID = (node: Node | null) => node !== null && node.ID === id;
  if (graph.Nodes.some(hasID)) return true;
  for (const [vessel, cluster] of graph.Clusters)
    if (hasID(vessel) || (cluster !== null && cluster.Nodes.some(hasID)))
      return true;
  for (const [vessel, sequence] of graph.Sequences)
    if (hasID(vessel) || (sequence !== null && sequence.Nodes.some(hasID)))
      return true;
  const treeHasID = (tree: Tree): boolean =>
    tree !== null && (hasID(tree.Node) || tree.Children.some(treeHasID));
  for (const [sentinel, roots] of graph.Trees)
    if (hasID(sentinel) || roots.some(treeHasID)) return true;
  return false;
}
export function nextAvailableNodeID(
  graph: Graph,
  candidate: bigint,
  unavailable: Set<bigint>,
): bigint {
  for (;;) {
    if (!unavailable.has(candidate) && !hasNodeID(graph, candidate))
      return candidate;
    candidate = candidate === 9223372036854775807n ? 0n : candidate + 1n;
  }
}
export function abductSequenceEdges(sequence: Sequence): void {
  const isStep = new Set(sequence.Nodes),
    abductions: EdgeAbduction[] = [];
  for (const edge of sequence.Graph!.Edges) {
    const fromIsStep = isStep.has(edge.From),
      toIsStep = isStep.has(edge.To);
    if (fromIsStep && toIsStep) continue;
    if (fromIsStep) {
      abductions.push({
        Edge: edge,
        OriginallyFrom: edge.From,
        OriginallyTo: null,
        CurrentFrom: sequence.Vessel,
        CurrentTo: edge.To,
      });
      reconnectEdge(edge, sequence.Vessel!, false);
    }
    if (toIsStep) {
      abductions.push({
        Edge: edge,
        OriginallyTo: edge.To,
        OriginallyFrom: null,
        CurrentTo: sequence.Vessel,
        CurrentFrom: edge.From,
      });
      reconnectEdge(edge, sequence.Vessel!, true);
    }
  }
  sequence.EdgeAbductions = abductions;
}
export function connectionTo(node: Node, other: Node): Edge | null {
  for (const edge of node.Edges) if (node.Adjacent(edge) === other) return edge;
  return null;
}
export function buildSequence(
  steps: Node[],
  graph: Graph,
  container: Node | null,
  id: bigint,
): Sequence {
  let maxHeight = 0;
  for (const node of steps) {
    if (node.Width <= 35) node.Width = 70;
    maxHeight = Math.max(maxHeight, node.Height);
  }
  for (const node of steps) node.Height = maxHeight;
  for (let i = 1; i < steps.length; i++) {
    const edge = connectionTo(steps[i - 1]!, steps[i]!);
    if (edge !== null) graph.Disconnect(edge);
  }
  const sequence = new Sequence();
  sequence.Vessel = new Node(id, 0, 0);
  sequence.Nodes = steps;
  sequence.Graph = graph;
  sequence.Container = container;
  sequenceSyncGeometryWithWork(sequence, unmeteredGroupGeometry);
  abductSequenceEdges(sequence);
  sequencePlaceVessel(sequence);
  return sequence;
}
export function addSequence(graph: Graph, sequence: Sequence): void {
  graph.AddNewNodeToContainer(sequence.Container, sequence.Vessel!);
  for (const node of sequence.Nodes) node.Sequence = sequence;
  const updated: Node[] = [];
  for (const child of graph.Containers.get(sequence.Container) ?? [])
    if (child.Sequence !== sequence) updated.push(child);
  graph.Containers.set(sequence.Container, updated);
  for (const node of sequence.Nodes) {
    graph.RemoveNode(node);
    node.Container = null;
  }
  graph.Sequences.set(sequence.Vessel!, sequence);
}
export function AddSequences(
  ctx: Context,
  graph: Graph,
  random: GoRandom,
): void {
  validateEngineGraph(ctx, 'AddSequences', graph);
  const guard = new WorkGuard(ctx, 'AddSequences', MaxEngineWorkUnits),
    state = NewGraphStateSnapshot({
      CaptureTopology: true,
      CaptureEdgeRoutes: true,
    });
  state.UpdateWithWorkGuard(graph, guard);
  let complete = false;
  try {
    const remembered = new Map<Node | null, Node[][]>(),
      rememberedIDByFirstStep = new Map<Node, bigint>(),
      reservedNodeIDs = new Set<bigint>(),
      activeNodes = new Set<Node>();
    for (const node of graph.Nodes) {
      guard.Step();
      activeNodes.add(node);
      reservedNodeIDs.add(node.ID);
    }
    for (const [vessel, cluster] of graph.Clusters) {
      guard.Step();
      if (vessel !== null) reservedNodeIDs.add(vessel.ID);
      if (cluster !== null)
        for (const node of cluster.Nodes) {
          guard.Step();
          if (node !== null) reservedNodeIDs.add(node.ID);
        }
    }
    for (const [vessel, sequence] of graph.Sequences) {
      guard.Step();
      if (vessel !== null) reservedNodeIDs.add(vessel.ID);
      if (sequence !== null)
        for (const node of sequence.Nodes) {
          guard.Step();
          if (node !== null) reservedNodeIDs.add(node.ID);
        }
    }
    for (const vessel of graph.SequenceOrder()) {
      guard.Step();
      const sequence = graph.Sequences.get(vessel)!;
      if (
        isValidRememberedSequence(graph, vessel, sequence, activeNodes, guard)
      ) {
        if (!remembered.has(sequence.Container))
          remembered.set(sequence.Container, []);
        remembered.get(sequence.Container)!.push(sequence.Nodes);
        rememberedIDByFirstStep.set(sequence.Nodes[0]!, vessel.ID);
      } else clearRememberedSequenceMembership(sequence, guard);
    }
    graph.Sequences = new Map();
    const containerOrder = graph.containerRDFSOrderContext(null, guard);
    for (const container of [...containerOrder, null]) {
      guard.Step();
      const groups = identifySequences(
        graph,
        graph.Containers.get(container) ?? [],
        guard,
      );
      groups.push(...(remembered.get(container) ?? []));
      const containerIndex = new Map<Node, number>();
      for (const [i, node] of (
        graph.Containers.get(container) ?? []
      ).entries()) {
        guard.Step();
        containerIndex.set(node, i);
      }
      groups.sort(
        (a, b) =>
          (containerIndex.get(a[0]!) ?? 0) - (containerIndex.get(b[0]!) ?? 0),
      );
      const generatedIDs: bigint[] = [],
        slotByID = new Map<bigint, number>();
      for (let i = 0; i < groups.length; i++) {
        guard.Step();
        const id = random.int63();
        generatedIDs.push(id);
        slotByID.set(id, i);
      }
      const orderedGroups = new Array<Node[] | null>(groups.length).fill(null),
        usedGroups = new Array<boolean>(groups.length).fill(false);
      for (let i = 0; i < groups.length; i++) {
        guard.Step();
        const steps = groups[i]!,
          rememberedID = rememberedIDByFirstStep.get(steps[0]!);
        if (rememberedID !== undefined) {
          const slot = slotByID.get(rememberedID);
          if (slot !== undefined && orderedGroups[slot] === null) {
            orderedGroups[slot] = steps;
            usedGroups[i] = true;
          }
        }
      }
      let nextGroup = 0;
      for (let i = 0; i < orderedGroups.length; i++) {
        guard.Step();
        if (orderedGroups[i] !== null) continue;
        while (nextGroup < groups.length && usedGroups[nextGroup]) {
          guard.Step();
          nextGroup++;
        }
        orderedGroups[i] = groups[nextGroup]!;
        usedGroups[nextGroup] = true;
      }
      for (let i = 0; i < orderedGroups.length; i++) {
        guard.Step();
        const steps = orderedGroups[i]!;
        let id = generatedIDs[i]!;
        const rememberedID = rememberedIDByFirstStep.get(steps[0]!);
        if (rememberedID !== undefined) id = rememberedID;
        else {
          id = nextAvailableNodeID(graph, id, reservedNodeIDs);
          reservedNodeIDs.add(id);
        }
        addSequence(graph, buildSequence(steps, graph, container, id));
      }
    }
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(graph, state);
  }
}
