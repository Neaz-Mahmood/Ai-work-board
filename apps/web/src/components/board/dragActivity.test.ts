import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  markBoardDragStarted,
  markBoardDragEnded,
  isBoardDragActive,
  onBoardDragEnd,
} from "./dragActivity.ts";

describe("dragActivity", () => {
  beforeEach(() => {
    while (isBoardDragActive()) {
      markBoardDragEnded();
    }
  });

  test("tracks drag state accurately", () => {
    expect(isBoardDragActive()).toBe(false);

    markBoardDragStarted();
    expect(isBoardDragActive()).toBe(true);

    markBoardDragStarted();
    expect(isBoardDragActive()).toBe(true);

    markBoardDragEnded();
    expect(isBoardDragActive()).toBe(true);

    markBoardDragEnded();
    expect(isBoardDragActive()).toBe(false);

    // Decrementing past 0 should not make it negative
    markBoardDragEnded();
    expect(isBoardDragActive()).toBe(false);
  });

  test("notifies listeners on drag end and handles unsubscription", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubA = onBoardDragEnd(listenerA);
    const unsubB = onBoardDragEnd(listenerB);

    markBoardDragStarted();
    markBoardDragStarted();
    markBoardDragEnded();
    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).not.toHaveBeenCalled();

    // Last drag ends -> listeners fire
    markBoardDragEnded();
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    // Unsubscribe A
    unsubA();

    markBoardDragStarted();
    markBoardDragEnded();
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(2);

    unsubB();
  });

  test("catches errors in listeners and continues calling remaining listeners", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const faultyListener = vi.fn(() => {
      throw new Error("listener failure");
    });
    const goodListener = vi.fn();

    const unsubFaulty = onBoardDragEnd(faultyListener);
    const unsubGood = onBoardDragEnd(goodListener);

    markBoardDragStarted();
    markBoardDragEnded();

    expect(faultyListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
    unsubFaulty();
    unsubGood();
  });
});
