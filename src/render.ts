import type { InternalHelpers, LayoutData, RenderOptions, SVG } from 'mermaid';
import {
  layoutFlowchart,
  type LayoutDirection,
  type EdgeStyleInput,
} from './layout.js';
import { simplifyRoute } from './routing.js';

type NodeWithPosition = LayoutData['nodes'][number] & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  domElement?: { attr(name: string, value: string): unknown };
  labelElement?: SVGGraphicsElement;
  labelTransform?: string;
};

function edgeLayoutStyle(
  styles: string[] | undefined,
): EdgeStyleInput | undefined {
  if (!styles?.length) return undefined;
  const result: EdgeStyleInput = {};
  for (const declaration of styles.flatMap((style) => style.split(';'))) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!value) continue;
    if (name === 'stroke') result.stroke = value;
    else if (name === 'fill') result.fill = value;
    else if (name === 'stroke-dasharray') result.strokeDash = value;
    else if (
      name === 'opacity' &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number(value) <= 1
    )
      result.opacity = value;
    else if (name === 'stroke-width') {
      const width = value.replace(/px$/i, '').trim();
      if (/^\d+$/.test(width)) result.strokeWidth = width;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

/** Mermaid's external-layout entry point. It follows the public loader contract. */
export async function render(
  data: LayoutData,
  svg: SVG,
  helpers: InternalHelpers,
  _options?: RenderOptions,
): Promise<void> {
  const root = svg.select('g');
  helpers.insertMarkers(root, data.markers ?? [], data.type, data.diagramId);
  const clusters = root.insert('g').attr('class', 'clusters');
  const edgePaths = root.insert('g').attr('class', 'edgePaths');
  const edgeLabels = root.insert('g').attr('class', 'edgeLabels');
  const nodeElements = root.insert('g').attr('class', 'nodes');
  const nodesById: Record<string, NodeWithPosition> = Object.create(null);

  await Promise.all(
    data.nodes.map(async (node) => {
      const nodeWithPosition: NodeWithPosition = { ...node };
      nodesById[node.id] = nodeWithPosition;
      if (node.isGroup) {
        const measurement = await helpers.insertCluster(clusters, {
          ...node,
          x: 0,
          y: 0,
          width: node.width ?? 100,
          height: node.height ?? 50,
          padding: node.padding ?? 16,
        });
        nodeWithPosition.labelBBox = measurement.labelBBox;
        measurement.cluster.remove();
        nodeWithPosition.width = Math.max(1, node.width ?? 100);
        nodeWithPosition.height = Math.max(1, node.height ?? 50);
        return;
      }
      const element = await helpers.insertNode(
        nodeElements,
        nodeWithPosition as Parameters<InternalHelpers['insertNode']>[1],
        {
          config: data.config,
          dir: (data.direction ?? 'TB') as string,
        },
      );
      const svgNode = element.node() as SVGGraphicsElement | null;
      if (!svgNode)
        throw new Error(
          `Mermaid did not create an SVG element for node ${node.id}`,
        );
      if (node.label) {
        const label = svgNode.querySelector?.('g.label') as
          SVGGraphicsElement | null | undefined;
        if (label && typeof label.getBBox === 'function') {
          const labelBox = label.getBBox();
          if (
            Number.isFinite(labelBox.width) &&
            Number.isFinite(labelBox.height)
          ) {
            nodeWithPosition.labelBBox = {
              width: labelBox.width,
              height: labelBox.height,
            };
            nodeWithPosition.labelElement = label;
            nodeWithPosition.labelTransform =
              label.getAttribute('transform') ?? '';
          }
        }
      }
      const box = svgNode.getBBox();
      nodeWithPosition.width = box.width;
      nodeWithPosition.height = box.height;
      nodeWithPosition.domElement = element;
    }),
  );

  const measuredEdges = await Promise.all(
    data.edges.map(async (edge) => {
      const measured = { ...edge };
      await helpers.insertEdgeLabel(edgeLabels, measured);
      return measured;
    }),
  );
  const direction = normalizeDirection(data.direction);
  const flowchartConfig = data.config.flowchart;
  const result = layoutFlowchart(
    data.nodes.map((node) => {
      const measured = nodesById[node.id]!;
      return {
        id: node.id,
        width: measured.width ?? node.width ?? 100,
        height: measured.height ?? node.height ?? 50,
        ...(node.shape && !node.isGroup ? { shape: node.shape } : {}),
        ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
        ...(node.isGroup
          ? {
              isGroup: true,
              labelWidth: measured.labelBBox?.width ?? 0,
              labelHeight: (measured.labelBBox?.height ?? 24) + 10,
            }
          : measured.labelBBox && node.label
            ? {
                labelWidth: measured.labelBBox.width,
                labelHeight: measured.labelBBox.height,
                label: node.label,
              }
            : {}),
        ...(node.dir ? { direction: normalizeDirection(node.dir) } : {}),
      };
    }),
    measuredEdges.map((edge) => {
      const style = edgeLayoutStyle(edge.style);
      return {
        id: edge.id,
        from: edge.start ?? '',
        to: edge.end ?? '',
        ...(style ? { style } : {}),
        ...(edge.label && ((edge.width ?? 0) > 0 || (edge.height ?? 0) > 0)
          ? { label: edge.label }
          : {}),
        ...(edge.thickness === 'invisible' ? { isInvisible: true } : {}),
        labelWidth: edge.width ?? 0,
        labelHeight: edge.height ?? 0,
        sourceArrowhead: edge.arrowTypeStart ?? 'none',
        targetArrowhead: edge.arrowTypeEnd ?? 'none',
      };
    }),
    {
      direction,
      ...(flowchartConfig?.nodeSpacing !== undefined
        ? { nodeSpacing: flowchartConfig.nodeSpacing }
        : {}),
      ...(flowchartConfig?.rankSpacing !== undefined
        ? { rankSpacing: flowchartConfig.rankSpacing }
        : {}),
    },
  );
  const positionedEdges = new Map(result.edges.map((edge) => [edge.id, edge]));
  for (const positioned of result.nodes) {
    const node = nodesById[positioned.id]!;
    node.x = positioned.x;
    node.y = positioned.y;
    const scaleX = positioned.width / node.width!;
    const scaleY = positioned.height / node.height!;
    node.width = positioned.width;
    node.height = positioned.height;
    if (!node.isGroup)
      node.domElement?.attr(
        'transform',
        `translate(${positioned.x}, ${positioned.y})${scaleX === 1 && scaleY === 1 ? '' : ` scale(${scaleX}, ${scaleY})`}`,
      );
    if (
      !node.isGroup &&
      node.labelElement &&
      positioned.labelX !== undefined &&
      positioned.labelY !== undefined
    ) {
      const dx = (positioned.labelX - positioned.x) / scaleX;
      const dy = (positioned.labelY - positioned.y) / scaleY;
      node.labelElement.setAttribute(
        'transform',
        `translate(${dx}, ${dy}) ${node.labelTransform ?? ''}`.trim(),
      );
    }
  }

  // Paint parent backgrounds before their descendants.
  const depth = (node: NodeWithPosition) => {
    let value = 0;
    let parent = node.parentId;
    while (parent !== undefined) {
      value++;
      parent = nodesById[parent]?.parentId;
    }
    return value;
  };
  for (const node of Object.values(nodesById)
    .filter((node) => node.isGroup)
    .sort((a, b) => depth(a) - depth(b))) {
    await helpers.insertCluster(
      clusters,
      node as Parameters<InternalHelpers['insertCluster']>[1],
    );
  }

  await Promise.all(
    measuredEdges.map(async (edge) => {
      const startNode = nodesById[edge.start ?? ''];
      const endNode = nodesById[edge.end ?? ''];
      if (!startNode || !endNode) return;
      const path = positionedEdges.get(edge.id);
      if (!path) return;
      // Clip once, then remove duplicate points introduced by shape intersection.
      // Mermaid's automatic clipping runs after route cleanup and can otherwise
      // feed zero-length segments into its rounded-corner renderer.
      const points = path.points.map((point) => ({ ...point }));
      if (startNode.intersect && endNode.intersect && points.length >= 3) {
        points[0] = startNode.intersect(points[1]);
        points[points.length - 1] = endNode.intersect(
          points[points.length - 2],
        );
      }
      const edgeWithPath = {
        ...edge,
        points: simplifyRoute(points),
        x: path.x,
        y: path.y,
      };
      const paths = helpers.insertEdge(
        edgePaths,
        edgeWithPath,
        Object.create(null),
        data.type,
        startNode,
        endNode,
        data.diagramId,
        true,
      );
      helpers.positionEdgeLabel(edgeWithPath, paths);
    }),
  );
}

function normalizeDirection(value: unknown): LayoutDirection {
  switch (value) {
    case 'BT':
    case 'LR':
    case 'RL':
      return value;
    case 'TD':
    case 'TB':
    default:
      return 'TB';
  }
}
