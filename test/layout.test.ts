import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';
import { d2LifelineEndId, translateFlowchart } from '../src/upstream/adapter/flowchart.js';
import orderingFixtures from './fixtures/upstream-layoutordering.json';

describe('Mermaid flowchart layout slice', () => {
  it('uses authored order by default and offers canonical ordering explicitly', () => {
    const fixture = orderingFixtures.find((f) => f.name === 'authored-order-TB')!;
    const normal = layoutFlowchart(fixture.nodes, fixture.edges, { seeds: [1, 2, 3] });
    const authored = layoutFlowchart(fixture.nodes, fixture.edges, { seeds: [1, 2, 3], inputOrder: 'authored' });
    const canonical = layoutFlowchart(fixture.nodes, fixture.edges, { seeds: [1, 2, 3], inputOrder: 'canonical' });
    expect(normal).toEqual(authored);
    expect(normal.nodes.map(({ id, x, y }) => ({ id, x, y }))).not.toEqual(
      canonical.nodes.map(({ id, x, y }) => ({ id, x, y })),
    );
  });
  it('validates D2 ordering and edge identity', () => {
    const nodes = [
      { id: 'z', width: 40, height: 30 },
      { id: 'a', width: 40, height: 30 },
    ];
    const edge = { id: 'e', from: 'z', to: 'a' };
    expect(() => layoutFlowchart(nodes, [edge], { inputOrder: 'bad' as never })).toThrow(/input order/);
    for (const d2Index of [0.5, Number.MAX_SAFE_INTEGER + 1, -9223372036854775809n, 9223372036854775808n])
      expect(() => layoutFlowchart(nodes, [{ ...edge, d2Index }])).toThrow(/D2 index/);
    expect(() => layoutFlowchart(nodes, [
      { ...edge, id: 'first', d2Index: 0 },
      { ...edge, id: 'second', d2Index: 0 },
    ], { inputOrder: 'authored' })).toThrow(/duplicate identity/);
    const { graph } = translateFlowchart(nodes, [
      { ...edge, id: 'first', d2Index: 7 },
      { ...edge, id: 'second', d2Index: 2 },
    ], { inputOrder: 'authored' });
    expect(graph.Edges.map((e) => e.D2ID)).toEqual(['(z -> a)[7]', '(z -> a)[2]']);
    const signed = translateFlowchart(nodes, [
      { ...edge, id: 'negative', d2Index: -1 },
      { ...edge, id: 'minimum', d2Index: -9223372036854775808n },
      { ...edge, id: 'maximum', d2Index: 9223372036854775807n },
    ], {}).graph;
    expect(signed.Edges.map((e) => e.D2ID)).toEqual([
      '(z -> a)[-1]', '(z -> a)[-9223372036854775808]', '(z -> a)[9223372036854775807]',
    ]);
  });

  it('treats dots in D2 object IDs as part of the object, not ancestry', () => {
    const nodes = [
      { id: 'g.h', width: 80, height: 60, isGroup: true },
      { id: 'g', width: 80, height: 60, isGroup: true },
      { id: 'one', width: 40, height: 30, parentId: 'g.h' },
      { id: 'two', width: 40, height: 30, parentId: 'g' },
    ];
    const { graph } = translateFlowchart(nodes, [
      { id: 'e', from: 'one', to: 'two', d2Index: 0 },
    ], { inputOrder: 'authored' });
    expect(graph.Edges[0]!.D2ID).toBe('(g.h.one -> g.two)[0]');
  });

  it('preserves local D2 IDs independently of public IDs, including an empty parent ID', () => {
    const nodes = [
      { id: '', d2Id: '', width: 80, height: 60, isGroup: true },
      { id: 'child-api', d2Id: 'leaf', parentId: '', width: 40, height: 30 },
      { id: 'other-api', d2Id: 'other', width: 40, height: 30 },
    ];
    const { graph } = translateFlowchart(nodes, [
      { id: 'e', from: 'child-api', to: 'other-api' },
    ], {});
    expect(graph.Nodes.map((n) => n.D2ID)).toEqual(['', 'leaf', 'other']);
    expect(graph.Nodes[1]!.Container).toBe(graph.Nodes[0]);
    expect(graph.Edges[0]!.D2ID).toBe('(.leaf -> other)[0]');
  });

  it('uses Go Unicode simple folding for edge identity ancestry', () => {
    const group = (id: string) => ({ id, width: 80, height: 60, isGroup: true });
    const node = (id: string, parentId: string) => ({ id, parentId, width: 40, height: 30 });
    const nodes = [group('Σ'), group('ς'), group('İ'), group('i\u0307'),
      node('one', 'Σ'), node('two', 'ς'), node('three', 'İ'), node('four', 'i\u0307')];
    const { graph } = translateFlowchart(nodes, [
      { id: 'e1', from: 'one', to: 'two', d2Index: 0 },
      { id: 'e2', from: 'three', to: 'four', d2Index: 0 },
    ], { inputOrder: 'authored' });
    expect(graph.Edges.map((e) => e.D2ID)).toEqual([
      'Σ.(one -> two)[0]', '(İ.three -> i\u0307.four)[0]',
    ]);
  });

  it('maps D2 shape names to their upstream shape policies', () => {
    const shapes: [string, string][] = [
      ['square', 'RealSquare'], ['callout', 'Callout'],
      ['stored_data', 'StoredData'], ['c4-person', 'C4Person'],
      ['class', 'Class'], ['text', 'Text'], ['code', 'Code'],
    ];
    const { graph } = translateFlowchart(
      shapes.map(([shape], i) => ({ id: `n${i}`, width: 80, height: 50, shape })),
      [],
      {},
    );
    expect(graph.Nodes.map((node) => node.ShapeType())).toEqual(shapes.map(([, shape]) => shape));
  });

  it('uses D2 font defaults for table payloads and text containers', () => {
    const nodes = [
      { id: 'table-shape', shape: 'sql_table', width: 80, height: 50 },
      { id: 'table-payload', shape: 'sql_table', tableColumns: 0, width: 80, height: 50 },
      { id: 'text-group', shape: 'text', isGroup: true, width: 80, height: 50 },
      { id: 'child', parentId: 'text-group', width: 40, height: 30 },
      { id: 'class-shape', shape: 'class', width: 80, height: 50 },
      { id: 'class-data', shape: 'class', hasClassData: true, width: 80, height: 50 },
      { id: 'class-font', shape: 'class', hasClassData: true, fontSize: 23, width: 80, height: 50 },
    ];
    const { graph } = translateFlowchart(nodes, [], { inputOrder: 'authored' });
    expect(graph.Nodes.map((n) => n.FontSize)).toEqual([16, 20, 16, 16, 16, 20, 23]);
  });

  it('uses sequence-diagram font defaults for descendant containers', () => {
    const nodes = [
      { id: 'seq', shape: 'sequence_diagram', isGroup: true, width: 80, height: 60 },
      { id: 'inner', parentId: 'seq', isGroup: true, width: 60, height: 40 },
      { id: 'leaf', parentId: 'inner', width: 40, height: 30 },
    ];
    const nested = translateFlowchart(nodes, [], {}).graph;
    expect(nested.Nodes.map((node) => node.FontSize)).toEqual([28, 16, 16]);
    const root = translateFlowchart(nodes, [], { rootSequence: true }).graph;
    expect(root.Nodes.map((node) => node.FontSize)).toEqual([16, 16, 16]);
  });

  it('uses D2 root levels and grid metadata for default fonts', () => {
    const nodes = [
      { id: 'grid', isGrid: true, width: 40, height: 30 },
      { id: 'text', isGrid: true, shape: 'text', width: 40, height: 30 },
    ];
    expect(translateFlowchart(nodes, [], {}).graph.Nodes.map((node) => node.FontSize)).toEqual([28, 16]);
    expect(translateFlowchart(nodes, [], { rootLevel: 2 }).graph.Nodes.map((node) => node.FontSize)).toEqual([20, 16]);
    expect(() => translateFlowchart(nodes, [], { rootLevel: 0.5 })).toThrow(/rootLevel/);
  });

  it('preserves independent D2 width and height attributes', () => {
    const nodes = [
      { id: 'width', width: 80, height: 50, desiredWidth: 110 },
      { id: 'height', width: 80, height: 50, desiredHeight: 90 },
      { id: 'both', width: 80, height: 50, fixedSize: true, desiredHeight: 70 },
    ];
    const { graph } = translateFlowchart(nodes, [], {});
    expect(graph.Nodes.map((node) => [node.DesiredWidth, node.DesiredHeight])).toEqual([
      [110, null], [null, 90], [80, 70],
    ]);
    for (const desiredWidth of [0, -1, 0.5, 1_000_000_001])
      expect(() => translateFlowchart([{ id: 'bad', width: 80, height: 50, desiredWidth }], [], {})).toThrow(/desiredWidth/);
  });

  it('validates and applies D2 node style metadata', () => {
    const nodes = [
      { id: 'style', width: 80, height: 50, style: { fontSize: '+25', threeDee: 'true', multiple: 'TRUE' } },
      { id: 'override', width: 80, height: 50, fontSize: 19, is3D: false, style: { fontSize: '25', threeDee: 'true', multiple: 'true' } },
    ];
    const { graph } = translateFlowchart(nodes, [], {});
    expect(graph.Nodes.map((n) => [n.FontSize, n.Is3D, n.IsMultiple])).toEqual([
      [25, true, false], [19, false, true],
    ]);
    for (const style of [{ fontSize: '0' }, { fontSize: '25\n' }, { multiple: 'yes' }, { underline: 'true\n' }])
      expect(() => translateFlowchart([{ id: 'bad', width: 80, height: 50, style }], [], {})).toThrow(/invalid/);
  });

  it('derives node visibility from D2 styles, labels and icons', () => {
    const transparent = { fill: 'transparent', strokeWidth: '0' };
    const nodes = [
      { id: 'opacity', width: 60, height: 40, style: { opacity: '0' } },
      { id: 'empty', width: 60, height: 40, style: transparent },
      { id: 'label', width: 60, height: 40, style: transparent, label: 'visible' },
      { id: 'icon', width: 60, height: 40, style: transparent, icon: 'https://example.com/icon.svg' },
      { id: 'empty-icon', width: 60, height: 40, style: transparent, icon: '' },
    ];
    const { graph } = translateFlowchart(nodes, [], { inputOrder: 'authored' });
    expect(graph.Nodes.map((n) => n.IsInvisible)).toEqual([true, true, false, false, false]);
    expect(graph.Nodes[4]!.Icon).not.toBeNull();
    expect(() => translateFlowchart([{ ...nodes[0]!, style: { opacity: '2' } }], [], {})).toThrow(/opacity/);
    expect(() => translateFlowchart([{ ...nodes[0]!, style: { strokeWidth: '-1' } }], [], {})).toThrow(/strokeWidth/);
  });

  it('keeps D2 arrow flags separate from shape and fill attributes', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 30 }));
    const { graph } = translateFlowchart(nodes, [
      { id: 'e1', from: 'a', to: 'b', sourceArrow: true, targetArrow: false, sourceArrowhead: 'diamond', sourceArrowheadFilled: true },
      { id: 'e2', from: 'a', to: 'c', sourceArrow: false, targetArrow: true, targetArrowhead: 'triangle', targetArrowheadFilled: false },
      { id: 'e3', from: 'b', to: 'c', sourceArrow: false, targetArrow: false, sourceArrowhead: 'box', sourceArrowheadFilled: true },
    ], { inputOrder: 'authored' });
    expect(graph.Edges.map((e) => [e.D2ID, e.SourceArrowhead, e.TargetArrowhead])).toEqual([
      ['(a <- b)[0]', 'none', 'filled-diamond'],
      ['(a -> c)[0]', 'none', 'unfilled-triangle'],
      ['(b -- c)[0]', 'filled-box', 'none'],
    ]);
  });

  it('numbers equivalent D2 edges, including reversed endpoints and explicit indices', () => {
    const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
    const { graph } = translateFlowchart(nodes, [
      { id: 'e0', from: 'a', to: 'b' },
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'a', sourceArrow: true, targetArrow: false },
      { id: 'e3', from: 'b', to: 'a' },
      { id: 'e4', from: 'a', to: 'b', d2Index: 7 },
      { id: 'e5', from: 'a', to: 'b' },
    ], { inputOrder: 'authored' });
    expect(graph.Edges.map((e) => e.D2ID)).toEqual([
      '(a -> b)[0]', '(a -> b)[1]', '(b <- a)[2]',
      '(b -> a)[0]', '(a -> b)[7]', '(a -> b)[4]',
    ]);
  });

  it('accepts only the generated arrowless D2 lifeline endpoint', () => {
    const fixture = orderingFixtures.find((f) => f.name === 'sequence-lifelines-TB')!;
    const input = fixture.edges[0]!;
    expect(d2LifelineEndId(input.from)).toBe(input.to);
    const { graph, lifelines } = translateFlowchart(fixture.nodes, [input], {});
    expect(lifelines).toEqual([true]);
    expect(graph.Edges[0]!.From).toBe(graph.Edges[0]!.To);
    expect(graph.Edges[0]!.D2ID).toBe(`(${input.from} -- ${input.from})[0]`);
    expect(layoutFlowchart(fixture.nodes, [input]).edges[0]!.to).toBe(input.from);
    expect(() => translateFlowchart(fixture.nodes, [{ ...input, to: `${input.to}x` }], {})).toThrow(/missing node/);
    expect(() => translateFlowchart(fixture.nodes, [{ ...input, targetArrow: true }], {})).toThrow(/missing node/);
    expect(() => translateFlowchart(fixture.nodes, [{ ...input, sourceArrowhead: 'none' }], {})).toThrow(/missing node/);
  });

  it('accepts D2 near constants while preferring an object of the same name', () => {
    const constants = ['top-left', 'top-center', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    for (const nearId of constants) {
      const { graph } = translateFlowchart([{ id: 'source', width: 40, height: 30, nearId }], [], {});
      expect(graph.Nodes[0]!.Nears.size).toBe(0);
    }
    const { graph } = translateFlowchart([
      { id: 'source', width: 40, height: 30, nearId: 'top-left' },
      { id: 'top-left', width: 40, height: 30 },
    ], [], {});
    expect(graph.Nodes[0]!.Nears.has(graph.Nodes[1]!)).toBe(true);
    for (const [id, nearId] of [['Alpha', 'aLPHa'], ['ΟΣ', 'οσ'], ['İ', 'i']]) {
      const result = translateFlowchart([
        { id: 'source', width: 40, height: 30, nearId },
        { id, width: 40, height: 30 },
      ], [], {}).graph;
      expect(result.Nodes[0]!.Nears.has(result.Nodes[1]!)).toBe(true);
    }
    expect(() => translateFlowchart([{ id: 'source', width: 40, height: 30, nearId: 'missing' }], [], {})).toThrow(/missing near node/);
  });

  it('uses D2 default arrowhead shapes when labels create attributes', () => {
    const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
    const label = { text: 'label', width: 20, height: 10 };
    const { graph } = translateFlowchart(nodes, [
      { id: 'e1', from: 'a', to: 'b', sourceArrow: false, targetArrow: false, sourceArrowheadLabel: label },
      { id: 'e2', from: 'b', to: 'a', sourceArrow: false, targetArrow: false, targetArrowheadLabel: label },
    ], { inputOrder: 'authored' });
    expect(graph.Edges.map((e) => [e.SourceArrowhead, e.TargetArrowhead])).toEqual([
      ['triangle', 'none'], ['none', 'triangle'],
    ]);
  });

  it('distinguishes an empty D2 arrowhead shape from absent attributes', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({ id, width: 40, height: 30 }));
    const { graph } = translateFlowchart(nodes, [
      { id: 'empty', from: 'a', to: 'b', sourceArrowhead: '', sourceArrow: false, targetArrow: true },
      { id: 'absent', from: 'a', to: 'c', sourceArrow: false, targetArrow: true },
    ], {});
    expect(graph.Edges.map((edge) => edge.SourceArrowhead)).toEqual(['triangle', 'none']);
    const open = translateFlowchart(nodes, [
      { id: 'open', from: 'a', to: 'b', sourceArrowhead: 'arrow_open', targetArrowhead: 'arrow_open' },
    ], {}).graph.Edges[0]!;
    expect([open.D2ID, open.SourceArrowhead, open.TargetArrowhead]).toEqual(['(a -- b)[0]', 'none', 'none']);
  });

  it('matches D2 label presence for embedded text shapes and empty labels', () => {
    const nodes = ['text', 'class', 'sql_table', 'code', 'rectangle'].map((shape, i) => ({
      id: `n${i}`, width: 80, height: 50, shape, label: 'content', labelWidth: 40, labelHeight: 12,
    }));
    nodes.push({ id: 'empty', width: 80, height: 50, shape: 'rectangle', label: '', labelWidth: 40, labelHeight: 12 });
    const edges = [
      { id: 'empty', from: 'n0', to: 'n1', label: '', labelWidth: 30, labelHeight: 10 },
      { id: 'visible', from: 'n1', to: 'n2', label: 'label', labelWidth: 30, labelHeight: 10 },
    ];
    const { graph } = translateFlowchart(nodes, edges, { inputOrder: 'authored' });
    expect(graph.Nodes.map((n) => n.Label?.Text ?? null)).toEqual([null, null, null, null, 'content', null]);
    expect(graph.Edges.map((e) => e.Label?.Text ?? null)).toEqual([null, 'label']);
  });
  it('uses hierarchy ranks and measured node sizes', () => {
    const result = layoutFlowchart(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 110, height: 50 },
        { id: 'C', width: 70, height: 30 },
        { id: 'D', width: 90, height: 40 },
      ],
      [
        { id: 'ab', from: 'A', to: 'B' },
        { id: 'ac', from: 'A', to: 'C' },
        { id: 'bd', from: 'B', to: 'D' },
        { id: 'cd', from: 'C', to: 'D' },
      ]
    );
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    expect(byId.get('A')!.rank).toBe(0);
    expect(byId.get('B')!.rank).toBe(1);
    expect(byId.get('C')!.rank).toBe(1);
    expect(byId.get('D')!.rank).toBe(2);
    expect(byId.get('B')!.height).toBe(50);
    expect(byId.get('B')!.y).toBeLessThan(byId.get('D')!.y);
    for (const edge of result.edges) {
      const source = byId.get(edge.from)!;
      const target = byId.get(edge.to)!;
      expect(isOnBoundary(edge.points[0]!, source)).toBe(true);
      expect(isOnBoundary(edge.points.at(-1)!, target)).toBe(true);
      for (let i = 1; i < edge.points.length; i++) {
        const previous = edge.points[i - 1]!;
        const current = edge.points[i]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
  });

  it('handles cycles, self loops, parallel edges, and disconnected components', () => {
    const result = layoutFlowchart(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 60, height: 30 },
        { id: 'C', width: 60, height: 30 },
        { id: 'solo', width: 40, height: 20 },
      ],
      [
        { id: 'ab', from: 'A', to: 'B' },
        { id: 'ba', from: 'B', to: 'A' },
        { id: 'bc', from: 'B', to: 'C' },
        { id: 'loop', from: 'C', to: 'C' },
        { id: 'ab2', from: 'A', to: 'B' },
      ]
    );
    expect(result.edges).toHaveLength(5);
    for (const edge of result.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      for (let i = 1; i < edge.points.length; i++) {
        const previous = edge.points[i - 1]!;
        const current = edge.points[i]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
    const solo = result.nodes.find((node) => node.id === 'solo')!;
    expect(result.nodes.filter((node) => node.id !== 'solo').every((node) => node.x !== solo.x || node.y !== solo.y)).toBe(true);
  });

  it('supports all four Mermaid directions and stable results', () => {
    const nodes = [
      { id: 'A', width: 50, height: 30 },
      { id: 'B', width: 70, height: 40 },
      { id: 'C', width: 60, height: 30 },
    ];
    const edges = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'ac', from: 'A', to: 'C' },
    ];
    const tb = layoutFlowchart(nodes, edges);
    const lr = layoutFlowchart(nodes, edges, { direction: 'LR' });
    const bt = layoutFlowchart(nodes, edges, { direction: 'BT' });
    const rl = layoutFlowchart(nodes, edges, { direction: 'RL' });
    expect(tb.nodes.find((node) => node.id === 'A')!.y).toBeLessThan(tb.nodes.find((node) => node.id === 'B')!.y);
    expect(lr.nodes.find((node) => node.id === 'A')!.x).toBeLessThan(lr.nodes.find((node) => node.id === 'B')!.x);
    expect(bt.nodes.find((node) => node.id === 'A')!.y).toBeGreaterThan(bt.nodes.find((node) => node.id === 'B')!.y);
    expect(rl.nodes.find((node) => node.id === 'A')!.x).toBeGreaterThan(rl.nodes.find((node) => node.id === 'B')!.x);
    expect(layoutFlowchart([...nodes].reverse(), [...edges].reverse(), { inputOrder: 'canonical' })).toEqual(tb);
  });
});

function isOnBoundary(point: { x: number; y: number }, node: { x: number; y: number; width: number; height: number }): boolean {
  const leftOrRight = Math.abs(Math.abs(point.x - node.x) - node.width / 2) < 1e-7;
  const topOrBottom = Math.abs(Math.abs(point.y - node.y) - node.height / 2) < 1e-7;
  return leftOrRight || topOrBottom;
}
