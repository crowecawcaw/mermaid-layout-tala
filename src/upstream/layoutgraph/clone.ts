import { validateEngineGraph } from './topology-preflight.js';
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
// Translated from internal/layoutgraph/clone.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.

import { Graph } from './graph.js';
import { Node } from './node.js';
import { Edge } from './edge.js';
import {
  Cluster,
  Sequence,
  Tree,
  Hierarchy,
  Label,
  Icon,
  EdgeStyle,
  type EntityID,
  type EdgeAbduction,
} from './records.js';
import { Orientation } from '../geo/orientation.js';
import { FromString, String as PositionString } from '../label/label.js';

export class GraphCloneState {
  nodesByID = new Map<EntityID, Node>();
  nodeRecordsByID = new Map<EntityID, Node>();
  topLevelNodeIDs = new Set<EntityID>();
  nodesBySource = new Map<Node, Node>();
  nodeRecords: Node[] = [];
  treeNodeRecords: Node[] = [];
  edgesBySource = new Map<Edge, Edge>();
  edgesByID = new Map<EntityID, Edge>();
  clustersBySource = new Map<Cluster, Cluster>();
  sequencesBySource = new Map<Sequence, Sequence>();
  constructor(
    readonly source: Graph,
    readonly clone: Graph,
    readonly guard: WorkGuard,
  ) {}
  copy(): void {
    const inSerializedNodes = new Set<Node>();
    for (const node of this.source.Nodes) {
      this.addNodeRecord(node);
      inSerializedNodes.add(node);
    }
    for (const vessel of this.source.ClusterOrder()) {
      inSerializedNodes.add(vessel);
      for (const node of this.source.Clusters.get(vessel)!.Nodes) {
        if (inSerializedNodes.has(node)) continue;
        this.addNodeRecord(node);
        inSerializedNodes.add(node);
      }
    }
    for (const vessel of this.source.SequenceOrder()) {
      inSerializedNodes.add(vessel);
      for (const node of this.source.Sequences.get(vessel)!.Nodes) {
        if (inSerializedNodes.has(node)) continue;
        this.addNodeRecord(node);
        inSerializedNodes.add(node);
      }
    }
    this.clone.Edges = [];
    for (const edge of this.source.Edges) {
      this.guard.Step();
      if (!edge) throw new Error('cannot clone a nil edge');
      if (this.edgesBySource.has(edge))
        throw new Error(`cannot clone duplicate edge record ${edge.ID}`);
      if (edge.ID !== 0n && this.edgesByID.has(edge.ID))
        throw new Error(`cannot clone duplicate edge ID ${edge.ID}`);
      const cloned = this.copyEdge(edge);
      this.edgesBySource.set(edge, cloned);
      if (edge.ID !== 0n) this.edgesByID.set(edge.ID, cloned);
      cloned.From.AddIncidentEdgeUnchecked(cloned);
      if (!cloned.IsLoop()) cloned.To.AddIncidentEdgeUnchecked(cloned);
      this.clone.Edges.push(cloned);
    }
    this.copyContainers();
    this.copyClusters();
    this.copySequences();
    this.copyHubs();
    this.copyAbductions();
    this.copyTrees();
    this.copyNears();
    this.copyHierarchies();
    this.copyDirections();
    const filtered: Node[] = [];
    for (const sourceNode of this.nodeRecords) {
      this.guard.Step();
      const node = this.nodesBySource.get(sourceNode)!;
      if (node.Cluster && node.Cluster.Vessel!.Graph !== null) continue;
      if (node.Sequence && node.Sequence.Vessel!.Graph !== null) continue;
      filtered.push(node);
    }
    this.clone.Nodes = filtered;
    this.clone.CellSize = this.source.CellSize;
    this.clone.IsRootHierarchy = this.source.IsRootHierarchy;
    this.clone.CommonUncleSiblings.clear();
    this.clone.edgeLengthCache = new Map();
    this.clone.crossingCost = this.source.crossingCost;
    this.clone.turnCost = this.source.turnCost;
    this.clone.nonCenterPortCost = this.source.nonCenterPortCost;
  }
  addNodeRecord(source: Node): Node {
    this.guard.Step();
    if (!source) throw new Error('cannot clone a nil node');
    if (source.ID === 0n) throw new Error('cannot clone reserved node ID 0');
    if (this.nodesByID.has(source.ID))
      throw new Error(`cannot clone duplicate node ID ${source.ID}`);
    const cloned = copyNodeRecord(source, this.clone);
    this.nodesByID.set(source.ID, cloned);
    this.nodeRecordsByID.set(source.ID, source);
    this.topLevelNodeIDs.add(source.ID);
    this.nodesBySource.set(source, cloned);
    this.nodeRecords.push(source);
    return cloned;
  }
  copyAuxiliaryNodeRecord(source: Node, relation: string): [Node, boolean] {
    if (!source) throw new Error(`cannot clone ${relation}: nil node`);
    if (source.ID === 0n)
      throw new Error(`cannot clone ${relation}: reserved node ID 0`);
    const declared = this.nodeRecordsByID.get(source.ID);
    if (declared) {
      if (declared !== source)
        throw new Error(
          `cannot clone ${relation}: distinct node record reuses ID ${source.ID}`,
        );
      return [this.nodesByID.get(source.ID)!, false];
    }
    const cloned = copyNodeRecord(source, this.clone);
    this.nodesByID.set(source.ID, cloned);
    this.nodeRecordsByID.set(source.ID, source);
    this.nodesBySource.set(source, cloned);
    return [cloned, true];
  }
  resolveNode(source: Node | null, relation: string): Node | null {
    if (source === null) return null;
    this.guard.Step();
    const cloned = this.nodesByID.get(source.ID);
    if (!cloned)
      throw new Error(
        `cannot clone ${relation}: node ${source.ID} is not included in the graph`,
      );
    this.nodesBySource.set(source, cloned);
    return cloned;
  }
  copyEdge(source: Edge): Edge {
    const from = this.resolveNode(source.From, 'edge source'),
      to = this.resolveNode(source.To, 'edge target');
    if (from === null || to === null)
      throw new Error(`cannot clone edge ${source.ID} with a nil endpoint`);
    const cloned = new Edge(from, to);
    cloned.ID = source.ID;
    cloned.D2ID = source.D2ID;
    cloned.SourceArrowhead = source.SourceArrowhead;
    cloned.TargetArrowhead = source.TargetArrowhead;
    cloned.SourceArrowheadLabel = copyLabelRecord(source.SourceArrowheadLabel);
    cloned.TargetArrowheadLabel = copyLabelRecord(source.TargetArrowheadLabel);
    cloned.MinWidth = source.MinWidth;
    cloned.MinHeight = source.MinHeight;
    cloned.Label = copyLabelRecord(source.Label);
    cloned.LabelPercentage = source.LabelPercentage;
    cloned.FromTableColumnIndex = source.FromTableColumnIndex;
    cloned.ToTableColumnIndex = source.ToTableColumnIndex;
    cloned.IsInvisible = source.IsInvisible;
    cloned.Style = copyEdgeStyle(source.Style);
    for (const point of source.Points) {
      this.guard.Step();
      cloned.Points.push(point.Copy());
    }
    return cloned;
  }
  copyContainers(): void {
    this.clone.Containers = new Map();
    if (this.source.Containers.size === 0) return;
    const order: (Node | null)[] = this.source.containerRDFSOrderContext(
      null,
      this.guard,
    );
    if (this.source.Containers.size !== order.length + 1)
      throw new Error(
        `cannot clone containers: map length ${this.source.Containers.size} does not match hierarchy length ${order.length + 1}`,
      );
    order.push(null);
    for (const sourceContainer of order) {
      const container = this.resolveNode(sourceContainer, 'container'),
        clonedChildren: Node[] = [];
      for (const sourceChild of this.source.Containers.get(sourceContainer) ??
        []) {
        if (
          !sourceChild ||
          this.nodeRecordsByID.get(sourceChild.ID) !== sourceChild
        )
          throw new Error(
            'cannot clone container child: exact node record is not available',
          );
        const child = this.resolveNode(sourceChild, 'container child');
        if (child === null)
          throw new Error('cannot clone a nil container child');
        child.Container = container;
        clonedChildren.push(child);
      }
      this.clone.Containers.set(container, clonedChildren);
      if (container !== null) container.isContainer = true;
    }
  }
  copyClusters(): void {
    this.clone.Clusters = new Map();
    for (const sourceVessel of this.source.ClusterOrder()) {
      this.guard.Step();
      const sourceCluster = this.source.Clusters.get(sourceVessel);
      if (!sourceCluster)
        throw new Error(
          `cannot clone nil cluster for vessel ${sourceVessel.ID}`,
        );
      if (sourceCluster.Vessel !== sourceVessel)
        throw new Error(
          `cannot clone cluster under vessel ${sourceVessel.ID} because its record vessel differs`,
        );
      if (
        sourceCluster.Container !== null &&
        sourceCluster.Container.ID === sourceVessel.ID
      )
        throw new Error(
          `cannot clone cluster ${sourceVessel.ID} because it cannot contain itself`,
        );
      const [vessel, copied] = this.copyAuxiliaryNodeRecord(
        sourceVessel,
        'cluster vessel',
      );
      if (copied) vessel.Graph = null;
      vessel.isClusterVessel = true;
      const container = this.resolveNode(
        sourceCluster.Container,
        'cluster container',
      );
      const members = sourceCluster.Nodes.map((n) =>
        this.resolveNode(n, 'cluster member')!,
      );
      const cluster = new Cluster();
      cluster.Vessel = vessel;
      cluster.Nodes = members;
      cluster.Arrangement = sourceCluster.Arrangement;
      cluster.DesiredArrangement = sourceCluster.DesiredArrangement;
      cluster.Graph = this.clone;
      cluster.Padding = sourceCluster.Padding;
      cluster.FixedSize = sourceCluster.FixedSize;
      cluster.Container = container;
      this.clone.Clusters.set(vessel, cluster);
      this.clustersBySource.set(sourceCluster, cluster);
      for (const member of members) {
        this.guard.Step();
        member.Cluster = cluster;
      }
    }
  }
  copySequences(): void {
    this.clone.Sequences = new Map();
    for (const sourceVessel of this.source.SequenceOrder()) {
      this.guard.Step();
      const sourceSequence = this.source.Sequences.get(sourceVessel);
      if (!sourceSequence)
        throw new Error(
          `cannot clone nil sequence for vessel ${sourceVessel.ID}`,
        );
      if (sourceSequence.Vessel !== sourceVessel)
        throw new Error(
          `cannot clone sequence under vessel ${sourceVessel.ID} because its record vessel differs`,
        );
      if (
        sourceSequence.Container !== null &&
        sourceSequence.Container.ID === sourceVessel.ID
      )
        throw new Error(
          `cannot clone sequence ${sourceVessel.ID} because it cannot contain itself`,
        );
      if (sourceSequence.Nodes.length < 2)
        throw new Error(
          `cannot clone sequence ${sourceVessel.ID} with ${sourceSequence.Nodes.length} steps; want at least 2`,
        );
      const [vessel, copied] = this.copyAuxiliaryNodeRecord(
        sourceVessel,
        'sequence vessel',
      );
      if (copied) vessel.Graph = null;
      const container = this.resolveNode(
        sourceSequence.Container,
        'sequence container',
      );
      const members = sourceSequence.Nodes.map((n) =>
        this.resolveNode(n, 'sequence member')!,
      );
      const sequence = new Sequence();
      sequence.Vessel = vessel;
      sequence.Nodes = members;
      sequence.Graph = this.clone;
      sequence.Container = container;
      this.clone.Sequences.set(vessel, sequence);
      this.sequencesBySource.set(sourceSequence, sequence);
      for (const member of members) {
        this.guard.Step();
        member.Sequence = sequence;
      }
    }
  }
  copyHubs(): void {
    this.clone.Hubs = new Map();
    for (const sourceHub of this.source.HubOrder()) {
      const hub = this.resolveNode(sourceHub, 'hub')!,
        spokes: Node[] = [];
      for (const sourceSpoke of this.source.Hubs.get(sourceHub)!) {
        if (
          !sourceSpoke ||
          this.nodeRecordsByID.get(sourceSpoke.ID) !== sourceSpoke
        )
          throw new Error(
            'cannot clone hub spoke: exact node record is not included in the graph',
          );
        spokes.push(this.resolveNode(sourceSpoke, 'hub spoke')!);
      }
      this.clone.Hubs.set(hub, spokes);
    }
  }
  copyAbductions(): void {
    const copyFor = (sourceAbductions: EdgeAbduction[]): EdgeAbduction[] => {
      const cloned: EdgeAbduction[] = [];
      for (const sourceAbduction of sourceAbductions) {
        this.guard.Step();
        let edge = this.edgesBySource.get(sourceAbduction.Edge);
        if (!edge && sourceAbduction.Edge.ID !== 0n)
          edge = this.edgesByID.get(sourceAbduction.Edge.ID);
        if (!edge)
          throw new Error(
            `cannot clone edge abduction for edge ${sourceAbduction.Edge.ID} before the edge is copied`,
          );
        const originallyFrom = this.resolveNode(
          sourceAbduction.OriginallyFrom,
          'abduction original source',
        );
        const originallyTo = this.resolveNode(
          sourceAbduction.OriginallyTo,
          'abduction original target',
        );
        const currentFrom = this.resolveNode(
          sourceAbduction.CurrentFrom,
          'abduction current source',
        );
        const currentTo = this.resolveNode(
          sourceAbduction.CurrentTo,
          'abduction current target',
        );
        cloned.push({
          Edge: edge,
          OriginallyFrom: originallyFrom,
          OriginallyTo: originallyTo,
          CurrentFrom: currentFrom,
          CurrentTo: currentTo,
        });
      }
      return cloned;
    };
    for (const vessel of this.source.ClusterOrder()) {
      const source = this.source.Clusters.get(vessel)!;
      this.clustersBySource.get(source)!.EdgeAbductions = copyFor(
        source.EdgeAbductions,
      );
    }
    for (const vessel of this.source.SequenceOrder()) {
      const source = this.source.Sequences.get(vessel)!;
      this.sequencesBySource.get(source)!.EdgeAbductions = copyFor(
        source.EdgeAbductions,
      );
    }
  }
  copyTrees(): void {
    this.clone.Trees = new Map();
    this.clone.NodeToTree = new Map();
    const treeOwnersByNodeID = new Set<EntityID>();
    const copyTree = (source: Tree, parent: Tree | null): Tree => {
      this.guard.Step();
      if (source.SentinelEdge === null)
        throw new Error('cannot clone a tree with a nil sentinel edge');
      if (!source.Node) throw new Error('cannot clone a tree with a nil node');
      if (treeOwnersByNodeID.has(source.Node.ID))
        throw new Error(
          `cannot clone tree node ${source.Node.ID} with more than one tree owner`,
        );
      treeOwnersByNodeID.add(source.Node.ID);
      if (
        this.nodeRecordsByID.get(source.Node.ID) === source.Node &&
        !this.topLevelNodeIDs.has(source.Node.ID)
      )
        throw new Error(
          `cannot clone tree node ${source.Node.ID} because it repeats a non-top-level node record`,
        );
      const [node, copied] = this.copyAuxiliaryNodeRecord(
        source.Node,
        'tree node',
      );
      if (copied) this.treeNodeRecords.push(source.Node);
      let sentinel = this.edgesBySource.get(source.SentinelEdge);
      if (
        !sentinel &&
        source.SentinelEdge.ID !== 0n &&
        this.edgesByID.has(source.SentinelEdge.ID)
      )
        throw new Error(
          `cannot clone tree sentinel edge: distinct edge record reuses ID ${source.SentinelEdge.ID}`,
        );
      if (!sentinel) {
        sentinel = this.copyEdge(source.SentinelEdge);
        this.edgesBySource.set(source.SentinelEdge, sentinel);
        if (source.SentinelEdge.ID !== 0n)
          this.edgesByID.set(source.SentinelEdge.ID, sentinel);
      }
      const cloned = new Tree(node);
      cloned.Parent = parent;
      cloned.SentinelEdge = sentinel;
      cloned.Orientation = source.Orientation;
      this.clone.NodeToTree.set(node, cloned);
      for (const child of source.Children)
        cloned.Children.push(copyTree(child, cloned));
      return cloned;
    };
    for (const sourceSentinel of this.source.TreeOrder()) {
      const sentinel = this.resolveNode(sourceSentinel, 'tree root sentinel')!,
        roots: Tree[] = [];
      for (const sourceRoot of this.source.Trees.get(sourceSentinel)!)
        roots.push(copyTree(sourceRoot, null));
      if (roots.length > 0) this.clone.Trees.set(sentinel, roots);
    }
  }
  copyNears(): void {
    for (const source of [...this.nodeRecords, ...this.treeNodeRecords]) {
      const node = this.nodesBySource.get(source)!;
      for (const sourceNear of source.orderedNears()) {
        this.guard.Step();
        const near = this.resolveNode(sourceNear, 'near relation');
        node.AddNear(near);
      }
    }
  }
  copyHierarchies(): void {
    const seen = new Set<Hierarchy>();
    for (const sourceNode of this.source.Nodes) {
      this.guard.Step();
      const sourceHierarchy = sourceNode.Hierarchy;
      if (sourceHierarchy === null || seen.has(sourceHierarchy)) continue;
      seen.add(sourceHierarchy);
      const levels = new Map<Node, number>(),
        clonedHierarchy = new Hierarchy();
      clonedHierarchy.ReplaceLevels(levels);
      for (const [sourceMember, level] of sourceHierarchy.Levels()) {
        const member = this.resolveNode(sourceMember, 'hierarchy member')!;
        levels.set(member, level);
        member.Hierarchy = clonedHierarchy;
      }
    }
  }
  copyDirections(): void {
    this.clone.Directions = new Map();
    for (const [sourceContainer, sourceDirection] of this.source.Directions) {
      const container = this.resolveNode(
        sourceContainer,
        'direction container',
      );
      this.clone.Directions.set(container, canonicalDirection(sourceDirection));
    }
  }
}
export function copyNodeRecord(source: Node, owner: Graph): Node {
  const cloned = new Node(source.ID, source.Width, source.Height);
  cloned.D2ID = source.D2ID;
  cloned.TopLeft = source.TopLeft?.Copy() ?? null;
  cloned.FixedTopLeft = source.FixedTopLeft?.Copy() ?? null;
  cloned.Graph = owner;
  cloned.FontSize = source.FontSize;
  cloned.DesiredWidth = source.DesiredWidth;
  cloned.DesiredHeight = source.DesiredHeight;
  cloned.SetShape(source.ShapeType());
  cloned.SetNumColumns(source.NumColumns());
  cloned.ForceHierarchy = source.ForceHierarchy;
  cloned.Label = copyLabelRecord(source.Label);
  cloned.Icon = copyIconRecord(source.Icon);
  cloned.Is3D = source.Is3D;
  cloned.IsMultiple = source.IsMultiple;
  cloned.IsInvisible = source.IsInvisible;
  return cloned;
}
export function copyLabelRecord(source: Label | null): Label | null {
  if (source === null) return null;
  const cloned = new Label();
  cloned.Text = source.Text;
  cloned.Position = FromString(PositionString(source.Position));
  cloned.Width = source.Width;
  cloned.Height = source.Height;
  return cloned;
}
export function copyIconRecord(source: Icon | null): Icon | null {
  if (source === null) return null;
  const cloned = new Icon();
  cloned.Position = FromString(PositionString(source.Position));
  return cloned;
}
export function copyEdgeStyle(source: EdgeStyle): EdgeStyle {
  const cloned = new EdgeStyle();
  for (const key of Object.keys(cloned) as (keyof EdgeStyle)[])
    cloned[key] = source[key] === null ? null : { ...source[key]! };
  return cloned;
}
export function canonicalDirection(direction: Orientation): Orientation {
  switch (direction) {
    case Orientation.Top:
    case Orientation.Bottom:
    case Orientation.Left:
    case Orientation.Right:
      return direction;
    default:
      return Orientation.NONE;
  }
}

export function Clone(ctx: Context, source: Graph | null): Graph {
  const staged = new Graph();
  cloneInto(ctx, source, staged);
  return staged;
}
export function cloneInto(
  ctx: Context,
  source: Graph | null,
  staged: Graph,
): void {
  if (ctx == null) throw new Error('TALA CloneGraph requires a context');
  if (source === null) throw new Error('cannot clone a nil graph');
  validateEngineGraph(ctx, 'CloneGraph', source);
  const guard = new WorkGuard(ctx, 'CloneGraph', MaxEngineWorkUnits);
  new GraphCloneState(source, staged, guard).copy();
  guard.Finish();
}
