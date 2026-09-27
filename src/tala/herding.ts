/** The ordinary-container branch of proximity.AssignHerds. GroupSheep's edge
 * abductions are resolved by the caller into these uncle/cousin groups. */
export type HerdSide = 'Top' | 'Right' | 'Bottom' | 'Left';

export interface HerdAssignment {
  orientation: HerdSide;
  val: number;
  sameSidePaired: Set<string>;
  oppositeSidePaired: Set<string>;
}

export interface HerdGroup {
  uncle: string;
  /** Ordered direct children of the container being placed. */
  nodes: readonly string[];
  cousins: ReadonlyMap<string, readonly string[]>;
  uncleWidth: number;
  uncleHeight: number;
  unclePlaced: boolean;
}

const sides: readonly HerdSide[] = ['Top', 'Right', 'Bottom', 'Left'];
const opposite = (side: HerdSide): HerdSide => side === 'Top' ? 'Bottom'
  : side === 'Bottom' ? 'Top' : side === 'Left' ? 'Right' : 'Left';

/** Port of proximity.CanUseBothSides. */
export function canUseBothSides(width: number, height: number, side: HerdSide): boolean {
  return (side === 'Top' || side === 'Bottom') && width >= 2 * height
    || (side === 'Left' || side === 'Right') && height >= 2 * width;
}

/** Mutates assignments and returns the nodes whose herd side was chosen in
 * this scope. The ordering and side intersection follow Go's AssignHerds. */
export function assignHerds(groups: readonly HerdGroup[],
  assignments: Map<string, HerdAssignment>): Map<string, HerdSide> {
  const ordered = groups.filter((group) => group.nodes.length > 1)
    .sort((a, b) => a.uncle < b.uncle ? -1 : a.uncle > b.uncle ? 1 : 0);
  const byNode = new Map<string, HerdGroup[]>();
  for (const group of ordered) for (const id of group.nodes) {
    const related = byNode.get(id) ?? [];
    related.push(group);
    byNode.set(id, related);
  }
  const components: Array<{ groups: HerdGroup[]; nodes: string[] }> = [];
  const seenGroups = new Set<HerdGroup>(), seenNodes = new Set<string>();
  for (const first of ordered) {
    if (seenGroups.has(first)) continue;
    const groupsInComponent = [first], nodes: string[] = [];
    seenGroups.add(first);
    for (let i = 0; i < groupsInComponent.length; i++) {
      for (const id of groupsInComponent[i]!.nodes) {
        if (seenNodes.has(id)) continue;
        seenNodes.add(id);
        nodes.push(id);
        for (const related of byNode.get(id) ?? []) {
          if (seenGroups.has(related)) continue;
          seenGroups.add(related);
          groupsInComponent.push(related);
        }
      }
    }
    components.push({ groups: groupsInComponent, nodes });
  }

  const result = new Map<string, HerdSide>();
  let unbiasedSide = 0;
  for (const component of components) {
    let available = [...sides];
    let preferred: HerdSide | undefined;
    for (const group of component.groups) {
      if (!group.unclePlaced) continue;
      for (const id of group.nodes) for (const cousin of group.cousins.get(id) ?? []) {
        const assigned = assignments.get(cousin);
        if (!assigned) continue;
        const both = canUseBothSides(group.uncleWidth, group.uncleHeight, assigned.orientation);
        available = available.filter((side) => side === opposite(assigned.orientation)
          || both && side === assigned.orientation);
        if (!preferred) preferred = both
          && assigned.sameSidePaired.size < assigned.oppositeSidePaired.size
          ? assigned.orientation : opposite(assigned.orientation);
      }
    }
    if (available.length === 0) {
      for (const id of component.nodes) assignments.delete(id);
      continue;
    }
    if (!preferred) {
      preferred = available[unbiasedSide % available.length]!;
      unbiasedSide++;
    } else if (!available.includes(preferred)) preferred = available[0]!;
    for (const id of component.nodes) {
      assignments.set(id, { orientation: preferred, val: 0,
        sameSidePaired: new Set(), oppositeSidePaired: new Set() });
      result.set(id, preferred);
    }
    for (const group of component.groups) {
      if (!group.unclePlaced) continue;
      for (const id of group.nodes) for (const cousin of group.cousins.get(id) ?? []) {
        const assignment = assignments.get(id), cousinAssignment = assignments.get(cousin);
        if (!assignment || !cousinAssignment) continue;
        const key = assignment.orientation === cousinAssignment.orientation
          ? 'sameSidePaired' : 'oppositeSidePaired';
        assignment[key].add(group.uncle);
        cousinAssignment[key].add(group.uncle);
      }
    }
  }
  return result;
}
