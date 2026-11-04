// Translated from internal/layoutgraph/topology_preflight.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxEngineNodes,
  MaxEngineEdges,
  MaxEngineRoutePoints,
  MaxEngineTreeDepth,
} from '../limits/work.js';
import type { Graph } from './graph.js';
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import type {
  Cluster,
  Sequence,
  Tree,
  EdgeAbduction,
  HerdAssignment,
  Hierarchy,
} from './records.js';
export const maxEngineTopologyReferences = 1_000_000;
const maxEnginePreflightWork = BigInt(maxEngineTopologyReferences) * 8n;
// JS arrays have no exposed spare-capacity field. A translated Go slice can
// retain its declared capacity here; ordinary arrays have capacity == length.
const capacities = new WeakMap<unknown[], number>();
export function setSliceCapacity<T>(slice: T[], capacity: number): T[] {
  capacities.set(slice, capacity);
  return slice;
}
export function sliceCapacity(slice: unknown[]): number {
  return capacities.get(slice) ?? slice.length;
}
export function validateNodeParentRelation(
  guard: { Step(): void },
  nodes: Set<Node>,
  relation: string,
  parentOf: (node: Node) => Node | null,
): void {
  const state = new Map<Node, number>(),
    depths = new Map<Node, number>();
  for (const node of nodes) {
    if (state.get(node) === 2) continue;
    const path: Node[] = [];
    let current: Node | null = node;
    while (current !== null && (state.get(current) ?? 0) === 0) {
      guard.Step();
      state.set(current, 1);
      path.push(current);
      current = parentOf(current);
    }
    if (current !== null && state.get(current) === 1)
      throw new Error(
        `TALA engine ${relation} cycle detected at node ${current.ID}`,
      );
    let depth = current !== null ? (depths.get(current) ?? 0) : 0;
    for (let i = path.length - 1; i >= 0; i--) {
      depth++;
      if (depth > MaxEngineTreeDepth)
        throw new Error(
          `TALA engine ${relation} depth exceeds limit ${MaxEngineTreeDepth}`,
        );
      depths.set(path[i]!, depth);
      state.set(path[i]!, 2);
    }
  }
}
export function ancestryParent(node: Node | null): Node | null {
  if (node === null) return null;
  if (node.Container !== null) return node.Container;
  if (node.Cluster !== null) return node.Cluster.Vessel;
  if (node.Sequence !== null) return node.Sequence.Vessel;
  return null;
}
export function validateEngineGraph(
  ctx: Context,
  location: string,
  graph: Graph | null,
): void {
  if (graph === null) throw new Error('TALA engine requires a graph');
  const guard = new WorkGuard(ctx, location, MaxEngineWorkUnits);
  guard.SetLimit(maxEnginePreflightWork);
  let referenceCount = 0,
    routePointCount = 0;
  const addReference = (kind: string): void => {
    if (referenceCount >= maxEngineTopologyReferences)
      throw new Error(
        `TALA engine topology references exceed limit ${maxEngineTopologyReferences} while visiting ${kind}`,
      );
    referenceCount++;
    guard.Step();
  };
  const accountSpareCapacity = (kind: string, slice: unknown[]): void => {
    const length = slice.length,
      capacity = sliceCapacity(slice);
    if (capacity < length)
      throw new Error(`TALA engine ${kind} has invalid slice capacity`);
    const spare = capacity - length;
    if (spare > maxEngineTopologyReferences - referenceCount)
      throw new Error(
        `TALA engine topology references exceed limit ${maxEngineTopologyReferences} while reserving ${kind} capacity`,
      );
    referenceCount += spare;
    guard.Check();
  };
  const structuralNil = (kind: string): never => {
    throw new Error(`TALA engine topology contains nil ${kind}`);
  };
  const nodes = new Set<Node>(),
    edges = new Set<Edge>(),
    clusters = new Set<Cluster>(),
    sequences = new Set<Sequence>(),
    trees = new Set<Tree>(),
    abductions = new Set<EdgeAbduction>(),
    herds = new Set<HerdAssignment>(),
    hierarchies = new Set<Hierarchy>();
  const nodeQueue: Node[] = [],
    edgeQueue: Edge[] = [],
    clusterQueue: Cluster[] = [],
    sequenceQueue: Sequence[] = [],
    treeQueue: Tree[] = [],
    abductionQueue: EdgeAbduction[] = [],
    herdQueue: HerdAssignment[] = [],
    hierarchyQueue: Hierarchy[] = [];
  const queueNode = (
    node: Node | null,
    required: boolean,
    kind: string,
  ): void => {
    if (node == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (nodes.has(node)) return;
    if (nodes.size >= MaxEngineNodes)
      throw new Error(
        `TALA engine unique node count exceeds limit ${MaxEngineNodes}`,
      );
    nodes.add(node);
    nodeQueue.push(node);
  };
  const queueEdge = (
    edge: Edge | null,
    required: boolean,
    kind: string,
  ): void => {
    if (edge == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (edges.has(edge)) return;
    if (edges.size >= MaxEngineEdges)
      throw new Error(
        `TALA engine unique edge count exceeds limit ${MaxEngineEdges}`,
      );
    edges.add(edge);
    edgeQueue.push(edge);
  };
  const queueRecord = <T>(
    record: T | null,
    required: boolean,
    kind: string,
    seen: Set<T>,
    queue: T[],
  ): void => {
    if (record == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (!seen.has(record)) {
      seen.add(record);
      queue.push(record);
    }
  };
  const queueCluster = (x: Cluster | null, r: boolean, k: string) =>
    queueRecord(x, r, k, clusters, clusterQueue);
  const queueSequence = (x: Sequence | null, r: boolean, k: string) =>
    queueRecord(x, r, k, sequences, sequenceQueue);
  const queueTree = (x: Tree | null, r: boolean, k: string) =>
    queueRecord(x, r, k, trees, treeQueue);
  const queueAbduction = (x: EdgeAbduction | null, r: boolean, k: string) =>
    queueRecord(x, r, k, abductions, abductionQueue);
  const queueHerd = (x: HerdAssignment | null, r: boolean, k: string) =>
    queueRecord(x, r, k, herds, herdQueue);
  const queueHierarchy = (x: Hierarchy | null, r: boolean, k: string) =>
    queueRecord(x, r, k, hierarchies, hierarchyQueue);
  accountSpareCapacity('graph nodes', graph.Nodes);
  for (let i = 0; i < graph.Nodes.length; i++) {
    const node = graph.Nodes[i]!;
    if (node == null) throw new Error(`graph node at index ${i} is nil`);
    queueNode(node, true, 'graph node');
  }
  accountSpareCapacity('graph edges', graph.Edges);
  for (let i = 0; i < graph.Edges.length; i++) {
    const edge = graph.Edges[i]!;
    if (edge == null) throw new Error(`graph edge at index ${i} is nil`);
    if (edge.From == null || edge.To == null)
      throw new Error(
        `graph edge ${edge.ID} has unplaced or missing endpoints`,
      );
    queueEdge(edge, true, 'graph edge');
  }
  for (const [container, children] of graph.Containers) {
    queueNode(container, false, 'container key');
    accountSpareCapacity('container children', children);
    for (const child of children) queueNode(child, true, 'container child');
  }
  for (const [vessel, cluster] of graph.Clusters) {
    queueNode(vessel, true, 'cluster vessel key');
    queueCluster(cluster, true, 'cluster record');
  }
  for (const [vessel, sequence] of graph.Sequences) {
    queueNode(vessel, true, 'sequence vessel key');
    queueSequence(sequence, true, 'sequence record');
  }
  for (const [root, roots] of graph.Trees) {
    queueNode(root, false, 'tree root key');
    accountSpareCapacity('tree roots', roots);
    for (const tree of roots) queueTree(tree, true, 'tree root');
  }
  for (const [node, tree] of graph.NodeToTree) {
    queueNode(node, true, 'node-to-tree key');
    queueTree(tree, true, 'node-to-tree value');
  }
  for (const [hub, spokes] of graph.Hubs) {
    queueNode(hub, true, 'hub key');
    accountSpareCapacity('hub spokes', spokes);
    for (const spoke of spokes) queueNode(spoke, true, 'hub spoke');
  }
  for (const node of graph.Directions.keys())
    queueNode(node, false, 'direction key');
  for (const [node, siblings] of graph.CommonUncleSiblings) {
    queueNode(node, true, 'common-sibling key');
    accountSpareCapacity('common siblings', siblings);
    for (const sibling of siblings) queueNode(sibling, true, 'common sibling');
  }
  let ni = 0,
    ei = 0,
    ci = 0,
    si = 0,
    ti = 0,
    ai = 0,
    hi = 0,
    hri = 0;
  while (
    ni < nodeQueue.length ||
    ei < edgeQueue.length ||
    ci < clusterQueue.length ||
    si < sequenceQueue.length ||
    ti < treeQueue.length ||
    ai < abductionQueue.length ||
    hi < herdQueue.length ||
    hri < hierarchyQueue.length
  ) {
    if (ni < nodeQueue.length) {
      const node = nodeQueue[ni++]!;
      queueNode(node.Container, false, 'node container');
      accountSpareCapacity('node edges', node.Edges);
      for (const edge of node.Edges) queueEdge(edge, true, 'node edge');
      for (const near of node.Nears) queueNode(near, true, 'near node');
      for (const neighbor of node.LongDistanceNeighborRequirements.keys())
        queueNode(neighbor, true, 'long-distance neighbor requirement key');
      queueCluster(node.Cluster, false, 'node cluster');
      queueSequence(node.Sequence, false, 'node sequence');
      queueHerd(node.HerdAssignment, false, 'node herd assignment');
      queueHierarchy(node.Hierarchy, false, 'node hierarchy');
    } else if (ei < edgeQueue.length) {
      const edge = edgeQueue[ei++]!;
      queueNode(edge.From, true, 'edge source');
      queueNode(edge.To, true, 'edge target');
      const pointCount = sliceCapacity(edge.Points);
      if (pointCount > MaxEngineRoutePoints - routePointCount)
        throw new Error(
          `TALA engine route point count exceeds limit ${MaxEngineRoutePoints}`,
        );
      routePointCount += pointCount;
      for (const point of edge.Points) {
        if (point == null) structuralNil('edge route point');
        guard.Step();
      }
    } else if (ci < clusterQueue.length) {
      const cluster = clusterQueue[ci++]!;
      queueNode(cluster.Vessel, true, 'cluster vessel');
      queueNode(cluster.Container, false, 'cluster container');
      accountSpareCapacity('cluster nodes', cluster.Nodes);
      for (const node of cluster.Nodes) queueNode(node, true, 'cluster node');
      accountSpareCapacity('cluster edge abductions', cluster.EdgeAbductions);
      for (const abduction of cluster.EdgeAbductions)
        queueAbduction(abduction, true, 'cluster edge abduction');
    } else if (si < sequenceQueue.length) {
      const sequence = sequenceQueue[si++]!;
      queueNode(sequence.Vessel, true, 'sequence vessel');
      queueNode(sequence.Container, false, 'sequence container');
      accountSpareCapacity('sequence nodes', sequence.Nodes);
      for (const node of sequence.Nodes) queueNode(node, true, 'sequence node');
      accountSpareCapacity('sequence edge abductions', sequence.EdgeAbductions);
      for (const abduction of sequence.EdgeAbductions)
        queueAbduction(abduction, true, 'sequence edge abduction');
    } else if (ti < treeQueue.length) {
      const tree = treeQueue[ti++]!;
      queueNode(tree.Node, true, 'tree node');
      queueTree(tree.Parent, false, 'tree parent');
      queueEdge(tree.SentinelEdge, false, 'tree sentinel edge');
      accountSpareCapacity('tree children', tree.Children);
      for (const child of tree.Children) queueTree(child, true, 'tree child');
    } else if (ai < abductionQueue.length) {
      const abduction = abductionQueue[ai++]!;
      queueEdge(abduction.Edge, true, 'abducted edge');
      queueNode(abduction.OriginallyFrom, false, 'abduction original source');
      queueNode(abduction.OriginallyTo, false, 'abduction original target');
      queueNode(abduction.CurrentFrom, false, 'abduction current source');
      queueNode(abduction.CurrentTo, false, 'abduction current target');
    } else if (hi < herdQueue.length) {
      const herd = herdQueue[hi++]!;
      for (const node of herd.oppositeSidePaired)
        queueNode(node, true, 'opposite-side herd node');
      for (const node of herd.sameSidePaired)
        queueNode(node, true, 'same-side herd node');
    } else if (hri < hierarchyQueue.length) {
      const hierarchy = hierarchyQueue[hri++]!;
      for (const node of hierarchy.Levels().keys())
        queueNode(node, true, 'hierarchy level node');
    }
  }
  validateNodeParentRelation(
    guard,
    nodes,
    'container parent',
    (node) => node.Container,
  );
  validateNodeParentRelation(
    guard,
    nodes,
    'effective container parent',
    (node) => node.container(),
  );
  validateNodeParentRelation(guard, nodes, 'ancestry parent', ancestryParent);
  const descendantChildren = (node: Node | null): Node[] => {
    const children: Node[] = [];
    if (node === null || node.isContainer)
      children.push(...(graph.Containers.get(node) ?? []));
    if (node !== null && node.isClusterVessel) {
      const cluster = graph.Clusters.get(node);
      if (!cluster)
        throw new Error(
          `TALA engine cluster vessel ${node.ID} has no cluster record`,
        );
      children.push(...cluster.Nodes);
    }
    if (graph.Sequences.has(node!)) {
      const sequence = graph.Sequences.get(node!);
      if (sequence == null) structuralNil('sequence record');
      children.push(...sequence!.Nodes);
    }
    return children;
  };
  const descendantColor = new Map<Node | null, number>(),
    descendantHeight = new Map<Node | null, number>(),
    descendantStarts: (Node | null)[] = [];
  if (graph.Containers.has(null)) descendantStarts.push(null);
  descendantStarts.push(...nodes);
  for (const start of descendantStarts) {
    if ((descendantColor.get(start) ?? 0) !== 0) continue;
    const children = descendantChildren(start);
    descendantColor.set(start, 1);
    const stack: { node: Node | null; children: Node[]; index: number }[] = [
      { node: start, children, index: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.children.length) {
        const ownHeight = frame.node === null ? 0 : 1;
        let height = ownHeight;
        for (const child of frame.children)
          height = Math.max(
            height,
            ownHeight + (descendantHeight.get(child) ?? 0),
          );
        if (height > MaxEngineTreeDepth)
          throw new Error(
            `TALA engine descendant depth exceeds limit ${MaxEngineTreeDepth}`,
          );
        descendantHeight.set(frame.node, height);
        descendantColor.set(frame.node, 2);
        stack.pop();
        continue;
      }
      const child = frame.children[frame.index++]!;
      guard.Step();
      switch (descendantColor.get(child) ?? 0) {
        case 1:
          throw new Error(
            `TALA engine descendant cycle detected at node ${child.ID}`,
          );
        case 0: {
          const children = descendantChildren(child);
          descendantColor.set(child, 1);
          stack.push({ node: child, children, index: 0 });
          break;
        }
      }
    }
  }
  const treeColor = new Map<Tree, number>(),
    treeHeight = new Map<Tree, number>();
  for (const start of trees) {
    if ((treeColor.get(start) ?? 0) !== 0) continue;
    treeColor.set(start, 1);
    const stack: { tree: Tree; index: number }[] = [{ tree: start, index: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.tree.Children.length) {
        let height = 1;
        for (const child of frame.tree.Children)
          height = Math.max(height, (treeHeight.get(child) ?? 0) + 1);
        if (height > MaxEngineTreeDepth)
          throw new Error(
            `TALA engine tree depth exceeds limit ${MaxEngineTreeDepth}`,
          );
        treeHeight.set(frame.tree, height);
        treeColor.set(frame.tree, 2);
        stack.pop();
        continue;
      }
      const child = frame.tree.Children[frame.index++]!;
      guard.Step();
      switch (treeColor.get(child) ?? 0) {
        case 1:
          throw new Error('TALA engine tree child cycle detected');
        case 0:
          treeColor.set(child, 1);
          stack.push({ tree: child, index: 0 });
          break;
      }
    }
  }
  const parentState = new Map<Tree, number>(),
    parentDepth = new Map<Tree, number>();
  for (const start of trees) {
    if (parentState.get(start) === 2) continue;
    const path: Tree[] = [];
    let current: Tree | null = start;
    while (current !== null && (parentState.get(current) ?? 0) === 0) {
      guard.Step();
      parentState.set(current, 1);
      path.push(current);
      current = current.Parent;
    }
    if (current !== null && parentState.get(current) === 1)
      throw new Error('TALA engine tree parent cycle detected');
    let depth = current !== null ? (parentDepth.get(current) ?? 0) : 0;
    for (let i = path.length - 1; i >= 0; i--) {
      depth++;
      if (depth > MaxEngineTreeDepth)
        throw new Error(
          `TALA engine tree depth exceeds limit ${MaxEngineTreeDepth}`,
        );
      parentDepth.set(path[i]!, depth);
      parentState.set(path[i]!, 2);
    }
  }
  const ownedTrees = new Map<Tree, Tree | null>(),
    treeByNode = new Map<Node, Tree>();
  for (const roots of graph.Trees.values())
    for (const root of roots) {
      const stack: { tree: Tree; parent: Tree | null }[] = [
        { tree: root, parent: null },
      ];
      while (stack.length > 0) {
        const frame = stack.pop()!;
        guard.Step();
        if (ownedTrees.has(frame.tree)) {
          if (frame.parent === null)
            throw new Error('TALA engine tree is listed as more than one root');
          if (ownedTrees.get(frame.tree) === frame.parent)
            throw new Error('TALA engine tree is repeated under one parent');
          throw new Error('TALA engine tree is shared by multiple parents');
        }
        ownedTrees.set(frame.tree, frame.parent);
        const existing = treeByNode.get(frame.tree.Node);
        if (existing && existing !== frame.tree)
          throw new Error(
            `TALA engine node ${frame.tree.Node.ID} is owned by multiple trees`,
          );
        treeByNode.set(frame.tree.Node, frame.tree);
        for (let i = frame.tree.Children.length - 1; i >= 0; i--) {
          const child = frame.tree.Children[i]!;
          if (child.Parent !== frame.tree)
            throw new Error(
              'TALA engine tree child has an inconsistent parent',
            );
          stack.push({ tree: child, parent: frame.tree });
        }
      }
    }
  for (const roots of graph.Trees.values())
    for (const root of roots) {
      if (root.Parent === null) continue;
      if (ownedTrees.has(root.Parent))
        throw new Error('TALA engine tree root also has an installed parent');
      let occurrences = 0;
      for (const child of root.Parent.Children) {
        guard.Step();
        if (child === root) occurrences++;
      }
      if (occurrences !== 1)
        throw new Error(
          'TALA engine tree root has an inconsistent placement parent',
        );
    }
  for (const [node, tree] of graph.NodeToTree) {
    if (tree.Node !== node)
      throw new Error(
        'TALA engine node-to-tree alias does not match the tree node',
      );
    if (ownedTrees.size > 0 && !ownedTrees.has(tree))
      throw new Error(
        'TALA engine node-to-tree alias references a tree outside the installed forest',
      );
  }
  if (graph.NodeToTree.size > 0 && ownedTrees.size > 0) {
    if (graph.NodeToTree.size !== treeByNode.size)
      throw new Error(
        'TALA engine node-to-tree aliases do not cover the installed forest',
      );
    for (const [node, tree] of treeByNode)
      if (graph.NodeToTree.get(node) !== tree)
        throw new Error(
          'TALA engine node-to-tree aliases do not match the installed forest',
        );
  }
  guard.Finish();
}

// Node-owned union preflight from the same upstream topology_preflight.go.
export function validateCombineNodeTopology(
  ctx: Context,
  graphs: Graph[],
): void {
  const guard = new WorkGuard(ctx, 'CombineSubgraphs', MaxEngineWorkUnits);
  guard.SetLimit(maxEnginePreflightWork);
  let referenceCount = 0,
    routePointCount = 0;
  const addReference = (kind: string): void => {
    if (referenceCount >= maxEngineTopologyReferences)
      throw new Error(
        `TALA CombineSubgraphs topology references exceed limit ${maxEngineTopologyReferences} while visiting ${kind}`,
      );
    referenceCount++;
    guard.Step();
  };
  const accountSpareCapacity = (kind: string, slice: unknown[]): void => {
    const length = slice.length,
      capacity = sliceCapacity(slice);
    if (capacity < length)
      throw new Error(
        `TALA CombineSubgraphs ${kind} has invalid slice capacity`,
      );
    const spare = capacity - length;
    if (spare > maxEngineTopologyReferences - referenceCount)
      throw new Error(
        `TALA CombineSubgraphs topology references exceed limit ${maxEngineTopologyReferences} while reserving ${kind} capacity`,
      );
    referenceCount += spare;
    guard.Check();
  };
  const structuralNil = (kind: string): never => {
    throw new Error(
      `TALA CombineSubgraphs node-owned topology contains nil ${kind}`,
    );
  };
  const nodes = new Set<Node>(),
    edges = new Set<Edge>(),
    clusters = new Set<Cluster>(),
    sequences = new Set<Sequence>(),
    abductions = new Set<EdgeAbduction>(),
    herds = new Set<HerdAssignment>(),
    hierarchies = new Set<Hierarchy>();
  const nodeQueue: Node[] = [],
    edgeQueue: Edge[] = [],
    clusterQueue: Cluster[] = [],
    sequenceQueue: Sequence[] = [],
    abductionQueue: EdgeAbduction[] = [],
    herdQueue: HerdAssignment[] = [],
    hierarchyQueue: Hierarchy[] = [];
  const queueNode = (
    node: Node | null,
    required: boolean,
    kind: string,
  ): void => {
    if (node == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (nodes.has(node)) return;
    if (nodes.size >= MaxEngineNodes)
      throw new Error(
        `TALA CombineSubgraphs unique node count exceeds limit ${MaxEngineNodes}`,
      );
    nodes.add(node);
    nodeQueue.push(node);
  };
  const queueEdge = (
    edge: Edge | null,
    required: boolean,
    kind: string,
  ): void => {
    if (edge == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (edges.has(edge)) return;
    if (edges.size >= MaxEngineEdges)
      throw new Error(
        `TALA CombineSubgraphs unique edge count exceeds limit ${MaxEngineEdges}`,
      );
    edges.add(edge);
    edgeQueue.push(edge);
  };
  const queueRecord = <T>(
    record: T | null,
    required: boolean,
    kind: string,
    seen: Set<T>,
    queue: T[],
  ): void => {
    if (record == null) {
      if (required) structuralNil(kind);
      return;
    }
    addReference(kind);
    if (!seen.has(record)) {
      seen.add(record);
      queue.push(record);
    }
  };
  const queueCluster = (x: Cluster | null, r: boolean, k: string) =>
    queueRecord(x, r, k, clusters, clusterQueue);
  const queueSequence = (x: Sequence | null, r: boolean, k: string) =>
    queueRecord(x, r, k, sequences, sequenceQueue);
  const queueAbduction = (x: EdgeAbduction | null, r: boolean, k: string) =>
    queueRecord(x, r, k, abductions, abductionQueue);
  const queueHerd = (x: HerdAssignment | null, r: boolean, k: string) =>
    queueRecord(x, r, k, herds, herdQueue);
  const queueHierarchy = (x: Hierarchy | null, r: boolean, k: string) =>
    queueRecord(x, r, k, hierarchies, hierarchyQueue);
  for (const graph of graphs) {
    if (graph === null)
      throw new Error('TALA CombineSubgraphs received a nil graph');
    for (let i = 0; i < graph.Nodes.length; i++) {
      const node = graph.Nodes[i]!;
      if (node === null)
        throw new Error(
          `TALA CombineSubgraphs graph node at index ${i} is nil`,
        );
      queueNode(node, true, 'graph node');
    }
    for (let i = 0; i < graph.Edges.length; i++) {
      const edge = graph.Edges[i]!;
      if (edge === null)
        throw new Error(
          `TALA CombineSubgraphs graph edge at index ${i} is nil`,
        );
      queueEdge(edge, true, 'graph edge');
    }
  }
  let ni = 0,
    ei = 0,
    ci = 0,
    si = 0,
    ai = 0,
    hi = 0,
    hri = 0;
  while (
    ni < nodeQueue.length ||
    ei < edgeQueue.length ||
    ci < clusterQueue.length ||
    si < sequenceQueue.length ||
    ai < abductionQueue.length ||
    hi < herdQueue.length ||
    hri < hierarchyQueue.length
  ) {
    if (ni < nodeQueue.length) {
      const node = nodeQueue[ni++]!;
      queueNode(node.Container, false, 'node container');
      accountSpareCapacity('node edges', node.Edges);
      for (const edge of node.Edges) queueEdge(edge, true, 'node edge');
      for (const near of node.Nears) queueNode(near, true, 'near node');
      for (const neighbor of node.LongDistanceNeighborRequirements.keys())
        queueNode(neighbor, true, 'long-distance neighbor requirement key');
      queueCluster(node.Cluster, false, 'node cluster');
      queueSequence(node.Sequence, false, 'node sequence');
      queueHerd(node.HerdAssignment, false, 'node herd assignment');
      queueHierarchy(node.Hierarchy, false, 'node hierarchy');
    } else if (ei < edgeQueue.length) {
      const edge = edgeQueue[ei++]!;
      queueNode(edge.From, true, 'edge source');
      queueNode(edge.To, true, 'edge target');
      const pointCount = sliceCapacity(edge.Points);
      if (pointCount > MaxEngineRoutePoints - routePointCount)
        throw new Error(
          `TALA CombineSubgraphs route point count exceeds limit ${MaxEngineRoutePoints}`,
        );
      routePointCount += pointCount;
      for (const point of edge.Points) {
        if (point == null) structuralNil('edge route point');
        guard.Step();
      }
    } else if (ci < clusterQueue.length) {
      const cluster = clusterQueue[ci++]!;
      queueNode(cluster.Vessel, true, 'cluster vessel');
      queueNode(cluster.Container, false, 'cluster container');
      accountSpareCapacity('cluster nodes', cluster.Nodes);
      for (const node of cluster.Nodes) queueNode(node, true, 'cluster node');
      accountSpareCapacity('cluster edge abductions', cluster.EdgeAbductions);
      for (const abduction of cluster.EdgeAbductions)
        queueAbduction(abduction, true, 'cluster edge abduction');
    } else if (si < sequenceQueue.length) {
      const sequence = sequenceQueue[si++]!;
      queueNode(sequence.Vessel, true, 'sequence vessel');
      queueNode(sequence.Container, false, 'sequence container');
      accountSpareCapacity('sequence nodes', sequence.Nodes);
      for (const node of sequence.Nodes) queueNode(node, true, 'sequence node');
      accountSpareCapacity('sequence edge abductions', sequence.EdgeAbductions);
      for (const abduction of sequence.EdgeAbductions)
        queueAbduction(abduction, true, 'sequence edge abduction');
    } else if (ai < abductionQueue.length) {
      const abduction = abductionQueue[ai++]!;
      queueEdge(abduction.Edge, true, 'abducted edge');
      queueNode(abduction.OriginallyFrom, false, 'abduction original source');
      queueNode(abduction.OriginallyTo, false, 'abduction original target');
      queueNode(abduction.CurrentFrom, false, 'abduction current source');
      queueNode(abduction.CurrentTo, false, 'abduction current target');
    } else if (hi < herdQueue.length) {
      const herd = herdQueue[hi++]!;
      for (const node of herd.oppositeSidePaired)
        queueNode(node, true, 'opposite-side herd node');
      for (const node of herd.sameSidePaired)
        queueNode(node, true, 'same-side herd node');
    } else if (hri < hierarchyQueue.length) {
      const hierarchy = hierarchyQueue[hri++]!;
      for (const node of hierarchy.Levels().keys())
        queueNode(node, true, 'hierarchy level node');
    }
  }
  validateNodeParentRelation(
    guard,
    nodes,
    'container parent',
    (node) => node.Container,
  );
  validateNodeParentRelation(
    guard,
    nodes,
    'effective container parent',
    (node) => node.container(),
  );
  validateNodeParentRelation(guard, nodes, 'ancestry parent', ancestryParent);
  guard.Finish();
}
