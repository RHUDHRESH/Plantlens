/**
 * Undo/redo command stack as a pure reducer over immutable snapshots. Structural sharing keeps a
 * snapshot cheap (unchanged assets/connections are the same objects). One user gesture = one
 * commit: a whole drag, a multi-delete or a paste is a single entry.
 */
export const HISTORY_LIMIT = 200;

export interface HistoryEntry<T> {
  state: T;
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  /** Label of the command that produced `present` (for the redo/undo tooltips). */
  presentLabel: string;
  future: HistoryEntry<T>[];
}

export type HistoryAction<T> =
  | { type: "commit"; next: T; label: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; present: T };

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, presentLabel: "", future: [] };
}

export function historyReducer<T>(state: History<T>, action: HistoryAction<T>, limit = HISTORY_LIMIT): History<T> {
  switch (action.type) {
    case "commit": {
      if (action.next === state.present) return state;
      const past = [...state.past, { state: state.present, label: state.presentLabel }];
      if (past.length > limit) past.splice(0, past.length - limit);
      return { past, present: action.next, presentLabel: action.label, future: [] };
    }
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        past: state.past.slice(0, -1),
        present: prev.state,
        presentLabel: prev.label,
        future: [{ state: state.present, label: state.presentLabel }, ...state.future],
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, { state: state.present, label: state.presentLabel }],
        present: next.state,
        presentLabel: next.label,
        future: rest,
      };
    }
    case "reset":
      return createHistory(action.present);
    default:
      return state;
  }
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
/** Label of the command undo would revert. */
export const undoLabel = (h: History<unknown>) => (h.past.length ? h.presentLabel : null);
export const redoLabel = (h: History<unknown>) => h.future[0]?.label ?? null;
