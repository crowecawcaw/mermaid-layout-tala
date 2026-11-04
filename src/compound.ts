import type {
  LayoutDirection,
  LayoutEdge,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
  Point,
  PositionedNode,
} from './layout.js';
import { avoidObstacles, routeMidpoint, simplifyRoute } from './routing.js';
import { placeEdgeLabels } from './labeling.js';
import { routeLoops } from './loops.js';

type FlatLayout = (
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions
) => LayoutResult;

/** Bottom-up container layout. Each scope ranks its immediate children using
 * projected descendant edges, then expands them into absolute coordinates.
 * Upstream's compound admission and placement heuristics remain separate work.
 */
export function layoutCompound(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions,
  flat: FlatLayout,
  route: (
    source: PositionedNode,
    target: PositionedNode,
    direction: LayoutDirection,
    offset: number
  ) => Point[]
): LayoutResult {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | undefined, LayoutNode[]>();
  const depth = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentId !== undefined && !byId.get(node.parentId)?.isGroup) {
      throw new Error(`node ${node.id} must reference an existing group parent`);
    }
    for (const [name, value] of [
      ['labelWidth', node.labelWidth],
      ['labelHeight', node.labelHeight],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new Error(`${name} must be finite and nonnegative`);
    }
    if (node.direction !== undefined && !['TB', 'BT', 'LR', 'RL'].includes(node.direction))
      throw new Error('invalid group direction');
    const seen = new Set([node.id]);
    let parent = node.parentId;
    let level = 0;
    while (parent !== undefined) {
      if (seen.has(parent)) throw new Error('cyclic group parent relationship');
      seen.add(parent);
      level++;
      parent = byId.get(parent)?.parentId;
    }
    depth.set(node.id, level);
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const padding = options.containerPadding ?? 24;
  const layouts = new Map<string | undefined, LayoutResult>();
  const measured = new Map(nodes.map((node) => [node.id, { ...node }]));
  const scopes = nodes
    .filter((node) => node.isGroup)
    .sort((a, b) => depth.get(b.id)! - depth.get(a.id)!);
  const scopeIds: Array<string | undefined> = [...scopes.map((node) => node.id), undefined];
  const scopeDirection = (scope: string | undefined) => {
    let node = scope === undefined ? undefined : byId.get(scope);
    while (node) {
      if (node.direction) return node.direction;
      node = node.parentId === undefined ? undefined : byId.get(node.parentId);
    }
    return options.direction ?? 'TB';
  };
  for (const scope of scopeIds) {
    const localNodes = children.get(scope) ?? [];
    const project = (id: string): string | undefined => {
      let node = byId.get(id)!;
      if (node.id === scope) return undefined;
      while (node.parentId !== scope) {
        if (node.parentId === undefined) return undefined;
        node = byId.get(node.parentId)!;
        if (node.id === scope) return undefined;
      }
      return node.id;
    };
    const projected: LayoutEdge[] = [];
    for (const edge of edges) {
      const from = project(edge.from);
      const to = project(edge.to);
      if (
        from !== undefined &&
        to !== undefined &&
        (from !== to || (edge.from === edge.to && from === edge.from))
      )
        projected.push({ ...edge, from, to });
    }
    const result = flat(
      localNodes.map((node) => {
        const size = measured.get(node.id)!;
        return { id: node.id, width: size.width, height: size.height, fixedSize: true };
      }),
      projected,
      { ...options, direction: scopeDirection(scope) }
    );
    layouts.set(scope, result);
    if (scope !== undefined) {
      const group = measured.get(scope)!;
      const routePoints = result.edges.flatMap((edge) => [
        ...edge.points,
        ...(edge.labelWidth && edge.labelHeight
          ? [
              { x: edge.x - edge.labelWidth / 2, y: edge.y - edge.labelHeight / 2 },
              { x: edge.x + edge.labelWidth / 2, y: edge.y + edge.labelHeight / 2 },
            ]
          : []),
      ]);
      const minX = Math.min(
        0,
        ...routePoints.map((point) => point.x),
        ...result.nodes.map((node) => node.x - node.width / 2)
      );
      const minY = Math.min(
        0,
        ...routePoints.map((point) => point.y),
        ...result.nodes.map((node) => node.y - node.height / 2)
      );
      const maxX = Math.max(
        0,
        ...routePoints.map((point) => point.x),
        ...result.nodes.map((node) => node.x + node.width / 2)
      );
      const maxY = Math.max(
        0,
        ...routePoints.map((point) => point.y),
        ...result.nodes.map((node) => node.y + node.height / 2)
      );
      const title = group.labelHeight ?? 24;
      group.width = Math.max(
        group.width,
        maxX - minX + 2 * padding,
        (group.labelWidth ?? 0) + 2 * padding
      );
      group.height = Math.max(group.height, maxY - minY + title + 2 * padding);
      for (const node of result.nodes) {
        node.x += -minX + (group.width - (maxX - minX)) / 2;
        node.y += -minY + padding + title;
      }
    }
  }
  const positioned = new Map<string, PositionedNode>();
  // The root coordinates are already absolute. Descendant coordinates are
  // relative to the top-left corner of their immediate container.
  const queue: Array<{ scope: string | undefined; x: number; y: number }> = [
    { scope: undefined, x: 0, y: 0 },
  ];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { scope, x, y } = queue[cursor]!;
    for (const local of layouts.get(scope)!.nodes) {
      const node = {
        ...measured.get(local.id)!,
        x: local.x + x,
        y: local.y + y,
        rank: local.rank,
        order: local.order,
      };
      positioned.set(node.id, node);
      if (node.isGroup)
        queue.push({ scope: node.id, x: node.x - node.width / 2, y: node.y - node.height / 2 });
    }
  }
  const resultNodes = nodes.map((node) => positioned.get(node.id)!);
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const key = JSON.stringify([edge.from, edge.to]);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const loopRoutes = new Map<string, Point[]>();
  for (const node of resultNodes)
    for (const [id, points] of routeLoops(node, edges)) loopRoutes.set(id, points);
  const resultEdges = edges.map((edge) => {
    const source = positioned.get(edge.from)!;
    const target = positioned.get(edge.to)!;
    const group = groups.get(JSON.stringify([edge.from, edge.to]))!;
    const offset =
      (group.indexOf(edge) - (source.id === target.id ? 0 : (group.length - 1) / 2)) * 10;
    const preferred =
      loopRoutes.get(edge.id) ?? route(source, target, scopeDirection(source.parentId), offset);
    const points = simplifyRoute(avoidObstacles(preferred, source, target, resultNodes, offset));
    const middle = routeMidpoint(points);
    return { ...edge, points, x: middle.x, y: middle.y };
  });
  placeEdgeLabels(resultNodes, resultEdges);
  return { nodes: resultNodes, edges: resultEdges };
}
