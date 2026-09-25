/*
 * TypeScript port of TALA's DAG ranker from D2.
 *
 * Upstream sources: d2layouts/d2talalayout/internal/hierarchy/{rank.go,
 * rank_graph.go,rank_simplex.go,rank_queue.go} at
 * https://github.com/d2lang/d2/tree/bf33790338b9854cb2a34418e69c17f9abf8de4b
 * Copyright the TALA authors; distributed under MPL-2.0. See LICENSE and
 * UPSTREAM-AUTHORS.md.
 */

export interface RankNode {
  id: string;
}

export interface RankEdge {
  id: string;
  from: string;
  to: string;
  weight?: number;
}

interface IndexedEdge {
  from: number;
  to: number;
  weight: number;
  id: string;
}

interface RankProblem {
  nodeIds: string[];
  edges: IndexedEdge[];
  outgoingStart: number[];
  pivotOrder: number[];
}

const MAX_NODES = 2_000;
const MAX_EDGES = 10_000;
const MAX_WORK = 5_000_000;
const MIN_SPAN = 1;

/**
 * Assigns normalized levels to a connected simple DAG while minimizing the
 * weighted sum of edge spans. IDs define all tie breaks, so input ordering
 * does not change the result.
 */
export function rankDag(nodes: readonly RankNode[], edges: readonly RankEdge[]): Map<string, number> {
  const problem = makeProblem(nodes, edges);
  if (problem.nodeIds.length === 0) return new Map();
  const work = new WorkGuard();
  const initial = longestPathLevels(problem, work);
  if (problem.edges.length === 0) {
    if (problem.nodeIds.length !== 1) throw new Error('input graph is disconnected');
    return new Map([[problem.nodeIds[0]!, 0]]);
  }

  const solver = new RankSimplex(problem, work);
  const levels = [...initial];
  const tree = solver.feasibleTree(levels);
  solver.optimize(levels, tree);
  const dualValue = solver.certify(levels, tree);
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  if (!Number.isSafeInteger(maxLevel - minLevel)) throw new Error('level count overflow');

  let primalValue = 0;
  for (const edge of problem.edges) {
    work.step();
    const span = levels[edge.to]! - levels[edge.from]!;
    if (span < MIN_SPAN) throw new Error(`infeasible span ${span}`);
    primalValue = safeAdd(primalValue, safeMul(edge.weight, span, 'objective overflow'), 'objective overflow');
  }
  if (primalValue !== dualValue) {
    throw new Error(`optimality certificate failed: primal cost ${primalValue}, dual value ${dualValue}`);
  }
  const result = new Map<string, number>();
  for (let i = 0; i < problem.nodeIds.length; i++) {
    work.step();
    result.set(problem.nodeIds[i]!, levels[i]! - minLevel);
  }
  return result;
}

function makeProblem(nodes: readonly RankNode[], inputEdges: readonly RankEdge[]): RankProblem {
  if (nodes.length > MAX_NODES) throw new Error(`node count exceeds limit ${MAX_NODES}`);
  if (inputEdges.length > MAX_EDGES) throw new Error(`edge count exceeds limit ${MAX_EDGES}`);
  const nodeIds = nodes.map((node) => node.id).sort(compareText);
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error('duplicate node ID');
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  const seenPairs = new Set<string>();
  const seenIds = new Set<string>();
  const edges: IndexedEdge[] = inputEdges.map((edge) => {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (from === undefined || to === undefined) throw new Error(`edge ${edge.id} references a node outside the graph`);
    if (from === to) throw new Error(`self edge on ${edge.from}`);
    const weight = edge.weight ?? 1;
    if (!Number.isSafeInteger(weight) || weight <= 0 || weight > MAX_EDGES) {
      throw new Error(`edge ${edge.id} has invalid rank weight ${weight}`);
    }
    if (seenIds.has(edge.id)) throw new Error(`duplicate edge ID ${edge.id}`);
    const pair = `${from}:${to}`;
    if (seenPairs.has(pair)) throw new Error(`duplicate directed edge ${edge.from} -> ${edge.to}`);
    seenIds.add(edge.id);
    seenPairs.add(pair);
    return { from, to, weight, id: edge.id };
  });
  edges.sort((a, b) => a.from - b.from || a.to - b.to || compareText(a.id, b.id));

  const outgoingStart = Array.from({ length: nodeIds.length + 1 }, () => 0);
  for (const edge of edges) outgoingStart[edge.from + 1]!++;
  for (let i = 0; i < nodeIds.length; i++) outgoingStart[i + 1]! += outgoingStart[i]!;
  const pivotOrder = edges.map((_edge, i) => i).sort((a, b) => compareText(edges[a]!.id, edges[b]!.id));

  if (nodeIds.length > 1) {
    const incident: number[][] = nodeIds.map(() => []);
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      incident[edge.from]!.push(edge.to);
      incident[edge.to]!.push(edge.from);
    }
    const seen = new Set<number>([0]);
    const queue = [0];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of incident[queue[cursor]!]!) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (seen.size !== nodeIds.length) throw new Error('input graph is disconnected');
  }

  return { nodeIds, edges, outgoingStart, pivotOrder };
}

function longestPathLevels(problem: RankProblem, work: WorkGuard): number[] {
  const indegree = problem.nodeIds.map(() => 0);
  for (const edge of problem.edges) {
    work.step();
    indegree[edge.to]!++;
  }
  const ready = new MinHeap();
  for (let i = 0; i < indegree.length; i++) if (indegree[i] === 0) ready.push(i);
  const levels = problem.nodeIds.map(() => 0);
  let visited = 0;
  while (ready.size > 0) {
    work.step();
    const from = ready.pop();
    visited++;
    for (let i = problem.outgoingStart[from]!; i < problem.outgoingStart[from + 1]!; i++) {
      work.step();
      const edge = problem.edges[i]!;
      levels[edge.to] = Math.max(levels[edge.to]!, levels[from]! + MIN_SPAN);
      if (--indegree[edge.to]! === 0) ready.push(edge.to);
    }
  }
  if (visited !== problem.nodeIds.length) throw new Error('input graph contains a directed cycle');
  return levels;
}

class RankSimplex {
  private readonly incident: number[][];
  private readonly balance: number[];

  constructor(private readonly problem: RankProblem, private readonly work: WorkGuard) {
    this.incident = problem.nodeIds.map(() => []);
    this.balance = problem.nodeIds.map(() => 0);
    for (let i = 0; i < problem.edges.length; i++) {
      work.step();
      const edge = problem.edges[i]!;
      this.incident[edge.from]!.push(i);
      this.incident[edge.to]!.push(i);
      this.balance[edge.from] = safeAdd(this.balance[edge.from]!, edge.weight, 'supply overflow');
      this.balance[edge.to] = safeSub(this.balance[edge.to]!, edge.weight, 'demand overflow');
    }
    if (this.balance.reduce((sum, amount) => safeAdd(sum, amount, 'balance overflow'), 0) !== 0) {
      throw new Error('unbalanced supplies');
    }
    // Feasible-tree growth and component walks must use the same stable edge order.
    for (const edges of this.incident) edges.sort((a, b) => compareText(problem.edges[a]!.id, problem.edges[b]!.id));
  }

  feasibleTree(levels: number[]): boolean[] {
    const { nodeIds, edges, pivotOrder } = this.problem;
    const tree = edges.map(() => false);
    const inTree = nodeIds.map(() => false);
    inTree[0] = true;
    let treeNodeCount = 1;
    let queue = [0];
    const growTight = () => {
      for (let cursor = 0; cursor < queue.length; cursor++) {
        this.work.step();
        const node = queue[cursor]!;
        for (const edgeIndex of this.incident[node]!) {
          this.work.step();
          const edge = edges[edgeIndex]!;
          const other = edge.from === node ? edge.to : edge.from;
          if (inTree[other]) continue;
          if (this.slack(edge, levels) !== 0) continue;
          tree[edgeIndex] = true;
          inTree[other] = true;
          treeNodeCount++;
          queue.push(other);
        }
      }
      queue = [];
    };
    growTight();

    while (treeNodeCount < nodeIds.length) {
      let bestSlack = Number.MAX_SAFE_INTEGER;
      const boundary: number[] = [];
      for (const edgeIndex of pivotOrder) {
        this.work.step();
        const edge = edges[edgeIndex]!;
        if (inTree[edge.from] === inTree[edge.to]) continue;
        const slack = this.slack(edge, levels);
        if (slack < bestSlack) {
          bestSlack = slack;
          boundary.length = 0;
          boundary.push(edgeIndex);
        } else if (slack === bestSlack) boundary.push(edgeIndex);
      }
      if (boundary.length === 0) throw new Error('could not construct a spanning feasible tree');
      const selected = edges[boundary[0]!]!;
      const selectedTailInTree = inTree[selected.from]!;
      const delta = selectedTailInTree ? bestSlack : -bestSlack;
      for (let node = 0; node < inTree.length; node++) {
        this.work.step();
        if (inTree[node]) levels[node] = safeAdd(levels[node]!, delta, 'feasible-tree level overflow');
      }

      for (const edgeIndex of boundary) {
        this.work.step();
        const edge = edges[edgeIndex]!;
        if (inTree[edge.from] === inTree[edge.to]) continue;
        const tailInTree = inTree[edge.from]!;
        if (bestSlack !== 0 && tailInTree !== selectedTailInTree) continue;
        if (this.slack(edge, levels) !== 0) continue;
        const outside = tailInTree ? edge.to : edge.from;
        tree[edgeIndex] = true;
        inTree[outside] = true;
        treeNodeCount++;
        queue.push(outside);
      }
      if (queue.length === 0) throw new Error('feasible-tree shift did not add a node');
      growTight();
    }
    return tree;
  }

  optimize(levels: number[], tree: boolean[]): void {
    const { edges, pivotOrder } = this.problem;
    while (true) {
      const cutValues = this.computeCutValues(tree);
      const leaving = pivotOrder.find((i) => {
        this.work.step();
        return tree[i] && cutValues[i]! < 0;
      });
      if (leaving === undefined) return;

      const head = this.headComponent(tree, leaving);
      let entering = -1;
      let minimumSlack = Number.MAX_SAFE_INTEGER;
      for (const edgeIndex of pivotOrder) {
        this.work.step();
        const edge = edges[edgeIndex]!;
        if (tree[edgeIndex] || !head[edge.from] || head[edge.to]) continue;
        const slack = this.slack(edge, levels);
        if (slack < minimumSlack) {
          minimumSlack = slack;
          entering = edgeIndex;
        }
      }
      if (entering < 0) throw new Error(`negative cut on edge ${edges[leaving]!.id} has no entering edge`);
      for (let node = 0; node < head.length; node++) {
        this.work.step();
        if (head[node]) levels[node] = safeAdd(levels[node]!, minimumSlack, 'simplex level overflow');
      }
      if (this.slack(edges[entering]!, levels) !== 0) {
        throw new Error(`entering edge ${edges[entering]!.id} did not become tight`);
      }
      tree[leaving] = false;
      tree[entering] = true;
    }
  }

  certify(levels: number[], tree: boolean[]): number {
    const cutValues = this.computeCutValues(tree);
    const computedBalance = this.problem.nodeIds.map(() => 0);
    let dualValue = 0;
    for (let i = 0; i < this.problem.edges.length; i++) {
      this.work.step();
      const edge = this.problem.edges[i]!;
      const flow = tree[i] ? cutValues[i]! : 0;
      if (flow < 0) throw new Error(`final tree edge ${edge.id} has negative cut value ${flow}`);
      if (tree[i] && levels[edge.to]! - levels[edge.from]! !== MIN_SPAN) {
        throw new Error(`final tree edge ${edge.id} is not tight`);
      }
      computedBalance[edge.from] = safeAdd(computedBalance[edge.from]!, flow, 'certificate balance overflow');
      computedBalance[edge.to] = safeSub(computedBalance[edge.to]!, flow, 'certificate balance overflow');
      dualValue = safeAdd(dualValue, safeMul(flow, MIN_SPAN, 'dual value overflow'), 'dual value overflow');
    }
    for (let node = 0; node < this.balance.length; node++) {
      this.work.step();
      if (computedBalance[node] !== this.balance[node]) {
        throw new Error(`certificate balance mismatch on node ${this.problem.nodeIds[node]}`);
      }
    }
    return dualValue;
  }

  private computeCutValues(tree: boolean[]): number[] {
    const { nodeIds, edges } = this.problem;
    const treeEdgeCount = tree.filter(Boolean).length;
    if (treeEdgeCount !== nodeIds.length - 1) throw new Error(`basis has ${treeEdgeCount} tree edges, want ${nodeIds.length - 1}`);
    const unvisited = -2;
    const parent = nodeIds.map(() => unvisited);
    const parentEdge = nodeIds.map(() => -1);
    parent[0] = -1;
    const order: number[] = [];
    const stack = [0];
    while (stack.length > 0) {
      this.work.step();
      const node = stack.pop()!;
      order.push(node);
      for (const edgeIndex of this.incident[node]!) {
        this.work.step();
        if (!tree[edgeIndex] || edgeIndex === parentEdge[node]) continue;
        const edge = edges[edgeIndex]!;
        const other = edge.from === node ? edge.to : edge.from;
        if (parent[other] !== unvisited) throw new Error(`basis contains a cycle through edge ${edge.id}`);
        parent[other] = node;
        parentEdge[other] = edgeIndex;
        stack.push(other);
      }
    }
    if (order.length !== nodeIds.length) throw new Error('basis is disconnected');

    const subtreeBalance = [...this.balance];
    const cutValue = edges.map(() => 0);
    for (let i = order.length - 1; i > 0; i--) {
      this.work.step();
      const node = order[i]!;
      const edgeIndex = parentEdge[node]!;
      const edge = edges[edgeIndex]!;
      const amount = subtreeBalance[node]!;
      cutValue[edgeIndex] = edge.from === node ? amount : -amount;
      const parentNode = parent[node]!;
      subtreeBalance[parentNode] = safeAdd(subtreeBalance[parentNode]!, amount, 'subtree-balance overflow');
    }
    if (subtreeBalance[0] !== 0) throw new Error(`tree balance is ${subtreeBalance[0]}, want zero`);
    return cutValue;
  }

  private headComponent(tree: boolean[], leaving: number): boolean[] {
    const head = this.problem.nodeIds.map(() => false);
    const start = this.problem.edges[leaving]!.to;
    head[start] = true;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      this.work.step();
      const node = queue[cursor]!;
      for (const edgeIndex of this.incident[node]!) {
        this.work.step();
        if (edgeIndex === leaving || !tree[edgeIndex]) continue;
        const edge = this.problem.edges[edgeIndex]!;
        const other = edge.from === node ? edge.to : edge.from;
        if (!head[other]) {
          head[other] = true;
          queue.push(other);
        }
      }
    }
    if (queue.length === this.problem.nodeIds.length) throw new Error(`leaving edge ${this.problem.edges[leaving]!.id} does not cut the tree`);
    return head;
  }

  private slack(edge: IndexedEdge, levels: number[]): number {
    const span = safeSub(levels[edge.to]!, levels[edge.from]!, 'edge span overflow');
    const slack = safeSub(span, MIN_SPAN, 'edge slack overflow');
    if (slack < 0) throw new Error(`infeasible span ${span}`);
    return slack;
  }
}

class WorkGuard {
  private count = 0;
  step(amount = 1): void {
    this.count += amount;
    if (this.count > MAX_WORK) throw new Error(`rank optimization work exceeds limit ${MAX_WORK}`);
  }
}

class MinHeap {
  private values: number[] = [];
  get size(): number { return this.values.length; }
  push(value: number): void {
    let i = this.values.push(value) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.values[parent]! <= value) break;
      this.values[i] = this.values[parent]!;
      i = parent;
    }
    this.values[i] = value;
  }
  pop(): number {
    const first = this.values[0]!;
    const last = this.values.pop()!;
    if (this.values.length > 0) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        if (left >= this.values.length) break;
        const right = left + 1;
        const child = right < this.values.length && this.values[right]! < this.values[left]! ? right : left;
        if (this.values[child]! >= last) break;
        this.values[i] = this.values[child]!;
        i = child;
      }
      this.values[i] = last;
    }
    return first;
  }
}

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function safeAdd(a: number, b: number, message: string): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error(message);
  return result;
}
function safeSub(a: number, b: number, message: string): number {
  const result = a - b;
  if (!Number.isSafeInteger(result)) throw new Error(message);
  return result;
}
function safeMul(a: number, b: number, message: string): number {
  const result = a * b;
  if (!Number.isSafeInteger(result)) throw new Error(message);
  return result;
}
