type DragEndListener = () => void;

let activeDrags = 0;
const listeners = new Set<DragEndListener>();

export const markBoardDragStarted = (): void => {
  activeDrags += 1;
};

export const markBoardDragEnded = (): void => {
  const previous = activeDrags;
  activeDrags = Math.max(0, activeDrags - 1);
  if (previous > 0 && activeDrags === 0) {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (err) {
        console.error("Error in onBoardDragEnd listener:", err);
      }
    }
  }
};

export const isBoardDragActive = (): boolean => activeDrags > 0;

export const onBoardDragEnd = (listener: DragEndListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
