import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoStore } from "./undoStack";

describe("undoStack", () => {
  beforeEach(() => useUndoStore.getState().clear());

  it("undo calls the action's undo() and moves it to future; redo replays it", async () => {
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const redoFn = vi.fn().mockResolvedValue(undefined);
    useUndoStore.getState().push({ label: "test", undo: undoFn, redo: redoFn });

    expect(useUndoStore.getState().past).toHaveLength(1);
    const label = await useUndoStore.getState().undo();
    expect(label).toBe("test");
    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(1);

    const redoLabel = await useUndoStore.getState().redo();
    expect(redoLabel).toBe("test");
    expect(redoFn).toHaveBeenCalledTimes(1);
    expect(useUndoStore.getState().past).toHaveLength(1);
  });

  it("undo/redo on an empty stack is a no-op returning null", async () => {
    expect(await useUndoStore.getState().undo()).toBeNull();
    expect(await useUndoStore.getState().redo()).toBeNull();
  });

  it("pushing a new action clears the redo (future) stack", async () => {
    const store = useUndoStore.getState();
    store.push({ label: "a", undo: vi.fn().mockResolvedValue(undefined), redo: vi.fn().mockResolvedValue(undefined) });
    await useUndoStore.getState().undo();
    expect(useUndoStore.getState().future).toHaveLength(1);
    useUndoStore.getState().push({ label: "b", undo: vi.fn().mockResolvedValue(undefined), redo: vi.fn().mockResolvedValue(undefined) });
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("caps the stack at 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      useUndoStore.getState().push({ label: `${i}`, undo: vi.fn(), redo: vi.fn() });
    }
    expect(useUndoStore.getState().past).toHaveLength(20);
    expect(useUndoStore.getState().past[0].label).toBe("5"); // oldest 5 dropped
  });
});
