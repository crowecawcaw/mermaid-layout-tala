import { D2 } from '@d2lang/d2';

export type TalaDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface TalaNode {
  id: string;
  parentId?: string | undefined;
  isGroup?: boolean | undefined;
  label?: string | undefined;
  shape?: string | undefined;
  dir?: TalaDirection | undefined;
  width: number;
  height: number;
}

export interface TalaEdge {
  id: string;
  from: string;
  to: string;
  label?: string | undefined;
}

export interface TalaOptions {
  direction?: TalaDirection;
  /** D2 TALA's deterministic layout seeds. The upstream default is [1, 2, 3]. */
  seeds?: number[];
}

export interface TalaResult {
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  edges: Array<{ id: string; points: Array<{ x: number; y: number }>; x: number; y: number }>;
}

let engine: D2 | undefined;
let configuredSeeds: number[] | undefined;

/** Releases the D2 worker when a Node process or browser view is finished. */
export async function disposeTala(): Promise<void> {
  const current = engine;
  engine = undefined;
  await current?.dispose();
}

/** Sets TALA's original seed option for Mermaid's layout loader. */
export function setTalaSeeds(seeds: number[]): void {
  if (seeds.length < 1 || seeds.length > 16 || seeds.some((seed) => !Number.isSafeInteger(seed))) {
    throw new Error('TALA seeds must contain 1 to 16 safe integers');
  }
  configuredSeeds = [...seeds];
}

export function getTalaSeeds(): number[] | undefined {
  return configuredSeeds && [...configuredSeeds];
}

/** Runs the original Go TALA engine through D2's official WebAssembly build. */
export async function layoutWithTala(
  nodes: readonly TalaNode[],
  edges: readonly TalaEdge[],
  options: TalaOptions = {}
): Promise<TalaResult> {
  const { source, names } = toD2(nodes, edges, options);
  engine ??= new D2();
  const compiled = await engine.compile(source, { layout: 'tala' });
  const shapes = new Map(compiled.diagram.shapes.map((shape) => [shape.id, shape]));
  const positionedNodes = nodes.map((node) => {
    const shape = shapes.get(names.get(node.id)!);
    if (!shape) throw new Error(`TALA omitted node ${node.id}`);
    return {
      id: node.id,
      x: shape.pos.x + shape.width / 2,
      y: shape.pos.y + shape.height / 2,
      width: shape.width,
      height: shape.height,
    };
  });
  if (compiled.diagram.connections.length !== edges.length) {
    throw new Error('TALA returned a different number of edges');
  }
  const connections = new Map<string, typeof compiled.diagram.connections>();
  const connectionKey = (from: string, to: string) => `${from}\u0000${to}`;
  for (const connection of compiled.diagram.connections) {
    const key = connectionKey(connection.src, connection.dst);
    const parallels = connections.get(key) ?? [];
    parallels.push(connection);
    connections.set(key, parallels);
  }
  const positionedEdges = edges.map((edge) => {
    const key = connectionKey(names.get(edge.from)!, names.get(edge.to)!);
    const connection = connections.get(key)?.shift();
    if (!connection) throw new Error(`TALA omitted edge ${edge.id}`);
    const route = connection.route;
    const points = route.map((point) => ({ x: point!.x, y: point!.y }));
    const labelPoint = pointAtFraction(points, connection.labelPercentage);
    return { id: edge.id, points, x: labelPoint.x, y: labelPoint.y };
  });
  return { nodes: positionedNodes, edges: positionedEdges };
}

export function toD2(
  nodes: readonly TalaNode[],
  edges: readonly TalaEdge[],
  options: TalaOptions = {}
): { source: string; names: Map<string, string> } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('duplicate node ID');
  for (const node of nodes) {
    if (!Number.isFinite(node.width) || node.width <= 0 || !Number.isFinite(node.height) || node.height <= 0) {
      throw new Error(`node ${node.id} must have finite positive dimensions`);
    }
    if (node.parentId && (!byId.get(node.parentId)?.isGroup || node.parentId === node.id)) {
      throw new Error(`node ${node.id} has an invalid parent`);
    }
  }
  const seeds = options.seeds ?? [1, 2, 3];
  if (seeds.length < 1 || seeds.length > 16 || seeds.some((seed) => !Number.isSafeInteger(seed))) {
    throw new Error('TALA seeds must contain 1 to 16 safe integers');
  }
  const names = new Map<string, string>();
  nodes.forEach((node, index) => names.set(node.id, `${node.isGroup ? 'g' : 'n'}${index}`));
  const pathFor = (id: string, stack: Set<string> = new Set()): string => {
    const node = byId.get(id);
    if (!node) throw new Error(`edge references missing node ${id}`);
    if (stack.has(id)) throw new Error('cyclic subgraph hierarchy');
    const ownName = names.get(id)!;
    if (!node.parentId) return ownName;
    stack.add(id);
    const path = `${pathFor(node.parentId, stack)}.${ownName}`;
    stack.delete(id);
    return path;
  };
  for (const node of nodes) pathFor(node.id);
  const fullNames = new Map(nodes.map((node) => [node.id, pathFor(node.id)]));
  const children = new Map<string | undefined, TalaNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const direction = { TB: 'down', BT: 'up', LR: 'right', RL: 'left' }[options.direction ?? 'TB'];
  const lines = [`direction: ${direction}`, `data: { tala-seeds: [${seeds.join(', ')}] }`];
  const writeNodes = (parentId: string | undefined, depth: number): void => {
    const indent = '  '.repeat(depth);
    for (const node of children.get(parentId) ?? []) {
      const name = names.get(node.id)!;
      lines.push(`${indent}${name}: {`);
      lines.push(`${indent}  label: ${JSON.stringify(node.label?.trim() || ' ')}`);
      if (node.isGroup) {
        if (node.dir) lines.push(`${indent}  direction: ${{ TB: 'down', BT: 'up', LR: 'right', RL: 'left' }[node.dir]}`);
        writeNodes(node.id, depth + 1);
      } else {
        lines.push(`${indent}  width: ${Math.ceil(node.width)}`);
        lines.push(`${indent}  height: ${Math.ceil(node.height)}`);
        lines.push(`${indent}  shape: ${shapeFor(node.shape)}`);
      }
      lines.push(`${indent}}`);
    }
  };
  writeNodes(undefined, 0);
  for (const edge of edges) {
    const from = fullNames.get(edge.from);
    const to = fullNames.get(edge.to);
    if (!from || !to) throw new Error(`edge ${edge.id} references a missing node`);
    lines.push(`${from} -> ${to}${edge.label ? `: ${JSON.stringify(edge.label)}` : ''}`);
  }
  return { source: lines.join('\n'), names: fullNames };
}

function shapeFor(shape: string | undefined): string {
  switch (shape) {
    case 'circle': case 'circ': case 'small-circle': case 'sm-circ':
    case 'filled-circle': case 'f-circ': case 'junction': return 'circle';
    case 'diamond': case 'diam': case 'decision': case 'question': return 'diamond';
    case 'cylinder': case 'cyl': case 'db': case 'database':
    case 'datastore': case 'data-store': return 'cylinder';
    case 'hexagon': case 'hex': case 'prepare': return 'hexagon';
    case 'stadium': case 'terminal': case 'pill': case 'usecaseEllipse': return 'oval';
    case 'lean-r': case 'lean-right': case 'lean_right': case 'in-out':
    case 'lean-l': case 'lean-left': case 'lean_left': case 'out-in': return 'parallelogram';
    case 'document': case 'doc': return 'document';
    case 'cloud': return 'cloud';
    case 'person': case 'usecaseActor': return 'person';
    case 'folder': case 'directory': return 'package';
    case 'stored-data': case 'bow-rect': return 'stored_data';
    default: return 'rectangle';
  }
}

function pointAtFraction(points: Array<{ x: number; y: number }>, fraction: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const portion = Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction : 0.5;
  let remaining = lengths.reduce((total, length) => total + length, 0) * portion;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length) {
      const a = points[index]!;
      const b = points[index + 1]!;
      const ratio = length === 0 ? 0 : remaining / length;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1]!;
}
