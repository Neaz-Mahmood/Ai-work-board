import { useSyncExternalStore } from "react";

let message = "";
const listeners = new Set<() => void>();

export const announce = (next: string) => {
  message = next;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAnnouncement = () =>
  useSyncExternalStore(subscribe, () => message, () => "");

export const useBoardAnnouncement = useAnnouncement;

export const getAnnouncement = () => message;

export const resetAnnouncement = () => {
  message = "";
  listeners.forEach((l) => l());
};
