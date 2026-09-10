export interface DragColumnRect {
  name: string;
  x: number;
  width: number;
}

export interface DragTargetState {
  id: string;
  name: string;
}

/**
 * Finds the name of the column whose horizontal span contains `x`.
 * The left edge of a column is inclusive; the right edge belongs to the
 * next column (exclusive), so adjoining columns never both claim a boundary
 * point. Returns null when `x` falls outside every column.
 */
export function columnAtPoint(columns: DragColumnRect[], x: number): string | null {
  for (const column of columns) {
    if (x >= column.x && x < column.x + column.width) return column.name;
  }
  return null;
}

export type DropEffect = "move" | "none";

/**
 * What dropping on `target` would do, given the column the card came from.
 * Dropping outside every column, or back on the origin column, does nothing.
 */
export function dropEffect(target: string | null, origin: string | null): DropEffect {
  if (target === null || origin === null) return "none";
  return target !== origin ? "move" : "none";
}

/**
 * Finds the state id whose name exactly matches a board column's name.
 * Matching is exact - never case-insensitive or a substring match - because
 * state names are user-authored Linear workflow labels that can differ only
 * by case or containment (e.g. "In Progress" vs "in progress" vs "Progress").
 */
export function resolveTargetStateId(states: DragTargetState[], columnName: string): string | null {
  const match = states.find((state) => state.name === columnName);
  return match ? match.id : null;
}
