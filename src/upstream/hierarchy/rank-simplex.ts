// Translated from internal/hierarchy/{rank,rank_simplex}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { RankProblem, RankEdge } from './rank-graph.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { New as invariant } from '../invariant/errors.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
const MAX = 9223372036854775807n,
  MIN = -9223372036854775808n;
export function checked(value: bigint, message: string): bigint {
  if (value < MIN || value > MAX) throw new Error(message);
  return value;
}
export function rankSpan(edge: RankEdge, levels: bigint[]): bigint {
  return checked(levels[edge.to]! - levels[edge.from]!, 'edge span overflow');
}
export function rankSlack(edge: RankEdge, levels: bigint[]): bigint {
  const span = rankSpan(edge, levels),
    slack = checked(span - 1n, 'edge slack overflow');
  if (slack < 0n) throw invariant(`infeasible span ${span}`);
  return slack;
}
export class RankSimplex {
  incidentStart: number[];
  incidentEdges: number[];
  balance: bigint[];
  parent: number[];
  parentEdge: number[];
  order: number[] = [];
  subtreeBalance: bigint[];
  cutValue: bigint[];
  head: boolean[];
  computedBalance: bigint[];
  constructor(
    readonly problem: RankProblem,
    guard: OptimizationWorkGuard,
  ) {
    const count = problem.nodes.length,
      degree = new Array<number>(count).fill(0),
      balance = new Array<bigint>(count).fill(0n);
    for (const edge of problem.edges) {
      guard.Step();
      degree[edge.from]!++;
      degree[edge.to]!++;
      balance[edge.from] = checked(
        balance[edge.from]! + edge.weight,
        'supply overflow',
      );
      balance[edge.to] = checked(
        balance[edge.to]! - edge.weight,
        'demand overflow',
      );
    }
    const starts = new Array<number>(count + 1).fill(0);
    for (let n = 0; n < count; n++) {
      guard.Step();
      starts[n + 1] = starts[n]! + degree[n]!;
    }
    const incidents = new Array<number>(problem.edges.length * 2),
      next = starts.slice(0, count);
    for (const i of problem.pivotOrder) {
      guard.Step();
      const e = problem.edges[i]!;
      incidents[next[e.from]!] = i;
      next[e.from]!++;
      incidents[next[e.to]!] = i;
      next[e.to]!++;
    }
    let total = 0n;
    for (const amount of balance) {
      guard.Step();
      total = checked(total + amount, 'balance overflow');
    }
    if (total !== 0n) throw invariant(`unbalanced supplies: ${total}`);
    this.incidentStart = starts;
    this.incidentEdges = incidents;
    this.balance = balance;
    this.parent = new Array(count).fill(0);
    this.parentEdge = new Array(count).fill(0);
    this.subtreeBalance = new Array(count).fill(0n);
    this.cutValue = new Array(problem.edges.length).fill(0n);
    this.head = new Array(count).fill(false);
    this.computedBalance = new Array(count).fill(0n);
  }
  feasibleTree(levels: bigint[], guard: OptimizationWorkGuard): boolean[] {
    const n = this.problem.nodes.length,
      tree = new Array<boolean>(this.problem.edges.length).fill(false),
      inTree = new Array<boolean>(n).fill(false);
    inTree[0] = true;
    let count = 1,
      queue = [0];
    const grow = () => {
      for (let head = 0; head < queue.length; head++) {
        guard.Step();
        const node = queue[head]!;
        for (
          let i = this.incidentStart[node]!;
          i < this.incidentStart[node + 1]!;
          i++
        ) {
          guard.Step();
          const idx = this.incidentEdges[i]!,
            edge = this.problem.edges[idx]!,
            other = edge.from === node ? edge.to : edge.from;
          if (inTree[other] || rankSlack(edge, levels) !== 0n) continue;
          tree[idx] = true;
          inTree[other] = true;
          count++;
          queue.push(other);
        }
      }
      queue = [];
    };
    grow();
    while (count < n) {
      let best = MAX,
        boundary: number[] = [];
      for (const idx of this.problem.pivotOrder) {
        guard.Step();
        const edge = this.problem.edges[idx]!;
        if (inTree[edge.from] === inTree[edge.to]) continue;
        const slack = rankSlack(edge, levels);
        if (slack < best) {
          best = slack;
          boundary = [idx];
        } else if (slack === best) boundary.push(idx);
      }
      if (!boundary.length)
        throw invariant('could not construct a spanning feasible tree');
      const selected = this.problem.edges[boundary[0]!]!,
        tail = inTree[selected.from]!,
        delta = tail ? best : checked(-best, 'feasible-tree shift overflow');
      for (let i = 0; i < n; i++) {
        guard.Step();
        if (inTree[i])
          levels[i] = checked(
            levels[i]! + delta,
            'feasible-tree level overflow',
          );
      }
      for (const idx of boundary) {
        guard.Step();
        const edge = this.problem.edges[idx]!;
        if (inTree[edge.from] === inTree[edge.to]) continue;
        const inTail = inTree[edge.from]!;
        if (best !== 0n && inTail !== tail) continue;
        if (rankSlack(edge, levels) !== 0n) continue;
        const outside = inTail ? edge.to : edge.from;
        tree[idx] = true;
        inTree[outside] = true;
        count++;
        queue.push(outside);
      }
      if (!queue.length)
        throw invariant('feasible-tree shift did not add a node');
      grow();
    }
    return tree;
  }
  computeCutValues(tree: boolean[], guard: OptimizationWorkGuard): void {
    const n = this.problem.nodes.length;
    let count = 0;
    for (const present of tree) {
      guard.Step();
      if (present) count++;
    }
    if (count !== n - 1)
      throw invariant(`basis has ${count} tree edges, want ${n - 1}`);
    for (let i = 0; i < n; i++) {
      guard.Step();
      this.parent[i] = -2;
      this.parentEdge[i] = -1;
    }
    this.parent[0] = -1;
    const order: number[] = [],
      stack = [0];
    while (stack.length) {
      guard.Step();
      const node = stack.pop()!;
      order.push(node);
      for (
        let i = this.incidentStart[node]!;
        i < this.incidentStart[node + 1]!;
        i++
      ) {
        guard.Step();
        const idx = this.incidentEdges[i]!;
        if (!tree[idx] || idx === this.parentEdge[node]) continue;
        const edge = this.problem.edges[idx]!,
          other = edge.from === node ? edge.to : edge.from;
        if (this.parent[other] !== -2)
          throw invariant(`basis contains a cycle through edge ${edge.id}`);
        this.parent[other] = node;
        this.parentEdge[other] = idx;
        stack.push(other);
      }
    }
    if (order.length !== n) throw invariant('basis is disconnected');
    this.order = order;
    for (let i = 0; i < n; i++) {
      guard.Step();
      this.subtreeBalance[i] = this.balance[i]!;
    }
    this.cutValue.fill(0n);
    for (let i = order.length - 1; i > 0; i--) {
      guard.Step();
      const node = order[i]!,
        idx = this.parentEdge[node]!,
        edge = this.problem.edges[idx]!,
        amount = this.subtreeBalance[node]!;
      if (edge.from === node) this.cutValue[idx] = amount;
      else if (edge.to === node)
        this.cutValue[idx] = checked(-amount, 'cut-value overflow');
      else throw invariant(`malformed tree edge ${edge.id}`);
      const parent = this.parent[node]!;
      this.subtreeBalance[parent] = checked(
        this.subtreeBalance[parent]! + amount,
        'subtree-balance overflow',
      );
    }
    if (this.subtreeBalance[0] !== 0n)
      throw invariant(`tree balance is ${this.subtreeBalance[0]}, want zero`);
  }
  computeHeadComponent(
    tree: boolean[],
    leaving: number,
    guard: OptimizationWorkGuard,
  ): void {
    this.head.fill(false);
    const start = this.problem.edges[leaving]!.to;
    this.head[start] = true;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      guard.Step();
      const node = queue[cursor]!;
      for (
        let i = this.incidentStart[node]!;
        i < this.incidentStart[node + 1]!;
        i++
      ) {
        guard.Step();
        const idx = this.incidentEdges[i]!;
        if (idx === leaving || !tree[idx]) continue;
        const edge = this.problem.edges[idx]!,
          other = edge.from === node ? edge.to : edge.from;
        if (!this.head[other]) {
          this.head[other] = true;
          queue.push(other);
        }
      }
    }
    if (queue.length === this.problem.nodes.length)
      throw invariant(
        `leaving edge ${this.problem.edges[leaving]!.id} does not cut the tree`,
      );
  }
  optimize(
    levels: bigint[],
    tree: boolean[],
    guard: OptimizationWorkGuard,
  ): void {
    for (;;) {
      this.computeCutValues(tree, guard);
      let leaving = -1;
      for (const idx of this.problem.pivotOrder) {
        guard.Step();
        if (tree[idx] && this.cutValue[idx]! < 0n) {
          leaving = idx;
          break;
        }
      }
      if (leaving < 0) return;
      this.computeHeadComponent(tree, leaving, guard);
      let entering = -1,
        min = MAX;
      for (const idx of this.problem.pivotOrder) {
        guard.Step();
        const edge = this.problem.edges[idx]!;
        if (tree[idx] || !this.head[edge.from] || this.head[edge.to]) continue;
        const slack = rankSlack(edge, levels);
        if (slack < min) {
          min = slack;
          entering = idx;
        }
      }
      if (entering < 0)
        throw invariant(
          `negative cut on edge ${this.problem.edges[leaving]!.id} has no entering edge`,
        );
      for (let i = 0; i < this.head.length; i++) {
        guard.Step();
        if (this.head[i])
          levels[i] = checked(levels[i]! + min, 'simplex level overflow');
      }
      const slack = rankSlack(this.problem.edges[entering]!, levels);
      if (slack !== 0n)
        throw invariant(
          `entering edge ${this.problem.edges[entering]!.id} has slack ${slack} after exchange`,
        );
      tree[leaving] = false;
      tree[entering] = true;
    }
  }
  certify(
    levels: bigint[],
    tree: boolean[],
    guard: OptimizationWorkGuard,
  ): bigint {
    this.computeCutValues(tree, guard);
    this.computedBalance.fill(0n);
    let dual = 0n;
    for (let i = 0; i < this.problem.edges.length; i++) {
      guard.Step();
      const edge = this.problem.edges[i]!;
      let flow = 0n;
      if (tree[i]) {
        flow = this.cutValue[i]!;
        if (flow < 0n)
          throw invariant(
            `final tree edge ${edge.id} has negative cut value ${flow}`,
          );
        if (rankSpan(edge, levels) !== 1n)
          throw invariant(`final tree edge ${edge.id} is not tight`);
      }
      this.computedBalance[edge.from] = checked(
        this.computedBalance[edge.from]! + flow,
        'certificate balance overflow',
      );
      this.computedBalance[edge.to] = checked(
        this.computedBalance[edge.to]! - flow,
        'certificate balance overflow',
      );
      dual = checked(dual + flow, 'dual value overflow');
    }
    for (let i = 0; i < this.balance.length; i++) {
      guard.Step();
      if (this.computedBalance[i] !== this.balance[i])
        throw invariant(
          `certificate balance mismatch on node ${nodeDebugID(this.problem.nodes[i]!)}: got ${this.computedBalance[i]}, want ${this.balance[i]}`,
        );
    }
    return dual;
  }
}
export function solve(
  problem: RankProblem,
  initial: bigint[],
  guard: OptimizationWorkGuard,
): [bigint[], bigint] {
  const solver = new RankSimplex(problem, guard),
    levels = [...initial],
    tree = solver.feasibleTree(levels, guard);
  solver.optimize(levels, tree, guard);
  return [levels, solver.certify(levels, tree, guard)];
}
