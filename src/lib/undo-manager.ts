type UndoAction = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  label: string;
};

const MAX_STACK_SIZE = 50;

export class UndoManager {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private listeners: Set<() => void> = new Set();

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get redoLabel() {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  push(action: UndoAction) {
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_STACK_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  async undo(): Promise<boolean> {
    const action = this.undoStack.pop();
    if (!action) return false;
    await action.undo();
    this.redoStack.push(action);
    this.notify();
    return true;
  }

  async redo(): Promise<boolean> {
    const action = this.redoStack.pop();
    if (!action) return false;
    await action.redo();
    this.undoStack.push(action);
    this.notify();
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) {
      fn();
    }
  }
}
