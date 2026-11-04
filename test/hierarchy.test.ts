import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-hierarchy.json';
import { alignHierarchy, connectHierarchy, createAlignmentNodes, globalSifting, hierarchyNode, horizontalCompaction, initializeRanks, markConflicts, minimizeCrossings, verticalAlignment, type Layers } from '../src/hierarchy.js';

describe('upstream hierarchy differential fixtures', () => {
  it.each(fixtures)('matches crossing, sifting and alignment for $name', (fixture) => {
    const nodes = new Map(fixture.nodes.map((input) => {
      const node = hierarchyNode(input.id, input.level, input.width, input.dummy);
      node.x = input.x; node.degree = input.degree;
      return [node.id, node];
    }));
    const layers: Layers = Array.from({ length: fixture.order.length }, () => []);
    for (const node of nodes.values()) layers[node.level]!.push(node);
    for (const [from, to] of fixture.edges ?? []) connectHierarchy(nodes.get(from!)!, nodes.get(to!)!);
    initializeRanks(layers); minimizeCrossings(layers); globalSifting(layers);
    expect(layers.map((layer) => layer.map((node) => node.id))).toEqual(fixture.order);
    for (const layer of layers) layer.forEach((node, i) => { node.x = i * 200; });
    // Upstream leafNodesContext reserves the default 60px container padding
    // at both outermost leaves of each layer, including the implicit root.
    for (const layer of layers) { layer[0]!.leftPad = 60; layer.at(-1)!.rightPad = 60; }
    const coordinates = alignHierarchy(layers);
    expect(Object.fromEntries([...coordinates].map(([node, x]) => [node.id, x]))).toEqual(fixture.x);
  });
});

function upstreamGraph(): Layers {
  const layers: Layers = [[hierarchyNode('a',0,50),hierarchyNode('b',0,45),hierarchyNode('c',0,50)],
    [hierarchyNode('d',1,50),hierarchyNode('e',1,30)], [hierarchyNode('f',2,75),hierarchyNode('g',2,50)]];
  const byId = new Map(layers.flat().map((node)=>[node.id,node]));
  for(const [a,b] of [['a','d'],['b','d'],['c','e'],['c','g'],['d','f'],['d','g']]) connectHierarchy(byId.get(a!)!,byId.get(b!)!);
  initializeRanks(layers);
  for(const layer of layers) layer.forEach((node,i)=>{node.x=i*100;});
  return layers;
}
describe('translated upstream alignment contracts',()=>{
  it.each([
    [false,false,{a:'a',b:'b',c:'c',d:'a',e:'c',f:'a',g:'g'}],
    [false,true,{a:'a',b:'b',c:'c',d:'b',e:'c',f:'f',g:'b'}],
    [true,false,{a:'f',b:'b',c:'e',d:'f',e:'e',f:'f',g:'g'}],
    [true,true,{a:'a',b:'g',c:'e',d:'g',e:'e',f:'f',g:'g'}],
  ] as const)('matches roots for bottom=%s right=%s',(bottom,right,roots)=>{
    const layers=upstreamGraph();
    const nodes=createAlignmentNodes(layers,bottom,right);
    verticalAlignment(nodes,markConflicts(layers),right);
    expect(Object.fromEntries(nodes.map(n=>[n.node.id,n.root.node.id]))).toEqual(roots);
    horizontalCompaction(nodes,right);
    expect(nodes.every(n=>Number.isFinite(n.x))).toBe(true);
  });
});
