import type { InternalHelpers, LayoutData, RenderOptions, SVG } from 'mermaid';
import { getTalaSeeds, layoutWithTala, type TalaDirection } from './upstream.js';

type NodeWithPosition = LayoutData['nodes'][number] & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  domElement?: { attr(name: string, value: string): unknown };
};

/** Mermaid's external-layout entry point. It follows the public loader contract. */
export async function render(
  data: LayoutData,
  svg: SVG,
  helpers: InternalHelpers,
  _options?: RenderOptions
): Promise<void> {
  const root = svg.select('g');
  helpers.insertMarkers(root, data.markers ?? [], data.type, data.diagramId);
  const clusters = root.insert('g').attr('class', 'clusters');
  const edgePaths = root.insert('g').attr('class', 'edgePaths');
  const edgeLabels = root.insert('g').attr('class', 'edgeLabels');
  const nodeElements = root.insert('g').attr('class', 'nodes');
  const nodesById: Record<string, NodeWithPosition> = Object.create(null);

  await Promise.all(data.nodes.map(async (node) => {
    const nodeWithPosition: NodeWithPosition = { ...node };
    nodesById[node.id] = nodeWithPosition;
    if (node.isGroup) {
      if (node.label) {
        const { shapeSvg, bbox } = await helpers.labelHelper(nodeElements, node);
        nodeWithPosition.labelBBox = { width: bbox.width, height: bbox.height };
        shapeSvg.remove();
      }
      nodeWithPosition.width = Math.max(node.width ?? 0, nodeWithPosition.labelBBox?.width ?? 0, 1);
      nodeWithPosition.height = Math.max(node.height ?? 0, nodeWithPosition.labelBBox?.height ?? 0, 1);
      return;
    }
    const element = await helpers.insertNode(nodeElements, node as Parameters<InternalHelpers['insertNode']>[1], {
      config: data.config,
      dir: (data.direction ?? 'TB') as string,
    });
    const svgNode = element.node() as SVGGraphicsElement | null;
    if (!svgNode) throw new Error(`Mermaid did not create an SVG element for node ${node.id}`);
    const box = svgNode.getBBox();
    nodeWithPosition.width = box.width;
    nodeWithPosition.height = box.height;
    nodeWithPosition.domElement = element;
  }));

  const direction = normalizeDirection(data.direction);
  const seeds = getTalaSeeds();
  const result = await layoutWithTala(
    data.nodes.map((node) => {
      const measured = nodesById[node.id]!;
      return {
        id: node.id,
        ...(node.parentId ? { parentId: node.parentId } : {}),
        isGroup: node.isGroup,
        label: node.label,
        shape: node.shape,
        dir: normalizeDirection(node.dir ?? data.direction),
        width: measured.width ?? node.width ?? 100,
        height: measured.height ?? node.height ?? 50,
      };
    }),
    data.edges.map((edge) => ({ id: edge.id, from: edge.start ?? '', to: edge.end ?? '', label: edge.label })),
    {
      direction,
      ...(seeds ? { seeds } : {}),
    }
  );
  const positionedEdges = new Map(result.edges.map((edge) => [edge.id, edge]));
  for (const positioned of result.nodes) {
    const node = nodesById[positioned.id]!;
    node.x = positioned.x;
    node.y = positioned.y;
    node.width = positioned.width;
    node.height = positioned.height;
    if (node.isGroup) {
      await helpers.insertCluster(clusters, node as Parameters<InternalHelpers['insertCluster']>[1]);
    } else {
      node.domElement?.attr('transform', `translate(${positioned.x}, ${positioned.y})`);
    }
  }

  await Promise.all(data.edges.map(async (edge) => {
    await helpers.insertEdgeLabel(edgeLabels, edge);
    const startNode = nodesById[edge.start ?? ''];
    const endNode = nodesById[edge.end ?? ''];
    if (!startNode || !endNode) return;
    const path = positionedEdges.get(edge.id);
    if (!path) return;
    const edgeWithPath = { ...edge, points: path.points, x: path.x, y: path.y };
    const paths = helpers.insertEdge(
      edgePaths,
      edgeWithPath,
      Object.create(null),
      data.type,
      startNode,
      endNode,
      data.diagramId,
      true
    );
    helpers.positionEdgeLabel(edgeWithPath, paths);
  }));
}

function normalizeDirection(value: unknown): TalaDirection {
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
