import type { LayoutNode } from '../layout.js';
import policies from './label-policy.json' with { type: 'json' };

/** Exact node-label preference tranches from upstream labeling/model.go and nodeshape. */
const policyByKey = new Map(policies.map((policy) => [
  `${policy.shape.toLowerCase()}:${policy.container}`, policy,
]));

function shapeKey(shape: string | undefined): string {
  const normalized = (shape ?? 'Square').toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return policyByKey.has(`${normalized}:false`) ? normalized : 'square';
}

export function nodeLabelPositionPreferences(shape: string | undefined,
  container: boolean): readonly (readonly string[])[] {
  return policyByKey.get(`${shapeKey(shape)}:${container}`)!.tranches;
}

/** The label portion of upstream labeling.Initialize. */
export function prepareNodeLabels(nodes: readonly LayoutNode[]): LayoutNode[] {
  return nodes.map((node) => {
    if (!node.labelBBox) return node;
    if (node.labelPosition && node.labelPosition !== 'UNSET') {
      return { ...node, labelPositionFixed: node.labelPositionFixed ?? true };
    }
    const policy = policyByKey.get(`${shapeKey(node.shape)}:${node.isGroup === true}`)!;
    return { ...node, labelPosition: policy.default, labelPositionFixed: false };
  });
}
