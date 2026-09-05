import { create } from "zustand";

/** Client-side undo/redo over the last 20 scheduler actions (§6.1).
 *
 * Each entry carries the async functions to reverse/reapply the mutation
 * against the API — the stack itself just sequences them and swallows
 * nothing: a failed undo/redo throws, and the caller decides how to
 * surface that (the Scheduler page turns it into a toast).
 */
export type UndoableAction = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const MAX_STACK = 20;

type UndoState = {
  past: UndoableAction[];
  future: UndoableAction[];
  push: (action: UndoableAction) => void;
  undo: () => Promise<string | null>;
  redo: () => Promise<string | null>;
  clear: () => void;
};

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  push: (action) =>
    set((state) => ({
      past: [...state.past, action].slice(-MAX_STACK),
      future: [],
    })),
  undo: async () => {
    const { past } = get();
    if (past.length === 0) return null;
    const action = past[past.length - 1];
    await action.undo();
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [action, ...state.future].slice(0, MAX_STACK),
    }));
    return action.label;
  },
  redo: async () => {
    const { future } = get();
    if (future.length === 0) return null;
    const action = future[0];
    await action.redo();
    set((state) => ({
      future: state.future.slice(1),
      past: [...state.past, action].slice(-MAX_STACK),
    }));
    return action.label;
  },
  clear: () => set({ past: [], future: [] }),
}));
