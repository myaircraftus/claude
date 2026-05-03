/**
 * Hierarchy tree builder (cross-cutting concern 2).
 *
 * Pure function — caller fetches the rows (org-scoped), passes them in,
 * gets back a nested tree keyed on the parent FK. Single helper used by
 * Aircraft / Vendor / Location list views.
 *
 * Cycle-safe: if A.parent = B and B.parent = A, both end up at the root
 * (we only walk depth-first from rows whose parent is null OR not in the
 * input set).
 */

export interface HierarchyNode<T> {
  row: T
  children: HierarchyNode<T>[]
}

export interface BuildTreeArgs<T> {
  rows: T[]
  /** Resolves a row to its primary key. */
  idOf: (row: T) => string
  /** Resolves a row to its parent id (or null). */
  parentOf: (row: T) => string | null | undefined
}

export function buildHierarchyTree<T>(args: BuildTreeArgs<T>): HierarchyNode<T>[] {
  const byId = new Map<string, T>()
  for (const r of args.rows) byId.set(args.idOf(r), r)

  const nodeById = new Map<string, HierarchyNode<T>>()
  for (const r of args.rows) nodeById.set(args.idOf(r), { row: r, children: [] })

  const roots: HierarchyNode<T>[] = []
  for (const r of args.rows) {
    const parentId = args.parentOf(r) ?? null
    const node = nodeById.get(args.idOf(r))!
    if (parentId && byId.has(parentId)) {
      const parent = nodeById.get(parentId)
      if (parent && parent !== node) {
        parent.children.push(node)
        continue
      }
    }
    roots.push(node)
  }

  // Sort each level alphabetically by stringified id (caller can re-sort).
  const sortRecursive = (nodes: HierarchyNode<T>[]) => {
    nodes.sort((a, b) => args.idOf(a.row).localeCompare(args.idOf(b.row)))
    for (const n of nodes) sortRecursive(n.children)
  }
  sortRecursive(roots)
  return roots
}
