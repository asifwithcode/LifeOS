export type DepNodeType = "task" | "milestone";

export interface DepEdge {
  blockedType: DepNodeType;
  blockedId: string;
  blockerType: DepNodeType;
  blockerId: string;
}

const key = (type: string, id: string) => `${type}:${id}`;

/**
 * Would adding "blocked waits on blocker" create a cycle?
 * True if `blocked` is already (transitively) a blocker of `blocker`, or they are the same node.
 */
export function wouldCreateCycle(edges: DepEdge[], newEdge: DepEdge): boolean {
  const start = key(newEdge.blockerType, newEdge.blockerId);
  const goal = key(newEdge.blockedType, newEdge.blockedId);
  if (start === goal) return true;
  // Walk from blocker through its own blockers; reaching `blocked` means a cycle.
  const blockersOf = new Map<string, string[]>();
  for (const e of edges) {
    const k = key(e.blockedType, e.blockedId);
    const list = blockersOf.get(k) ?? [];
    list.push(key(e.blockerType, e.blockerId));
    blockersOf.set(k, list);
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === goal) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of blockersOf.get(cur) ?? []) stack.push(next);
  }
  return false;
}

export interface BlockerState {
  id: string;
  type: DepNodeType;
  done: boolean;
}

/** An item is blocked while any of its blockers is unfinished. */
export function isBlocked(blockers: BlockerState[]): boolean {
  return blockers.some((b) => !b.done);
}

export function openBlockers<T extends BlockerState>(blockers: T[]): T[] {
  return blockers.filter((b) => !b.done);
}
