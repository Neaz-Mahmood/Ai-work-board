import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";

type NativeSetDragImage = Parameters<
  typeof setCustomNativeDragPreview
>[0]["nativeSetDragImage"];

const PREVIEW_OFFSET = { x: "12px", y: "8px" };

export function setCardDragPreview({
  cardElement,
  source,
  nativeSetDragImage,
}: {
  cardElement?: HTMLElement;
  source?: { element: HTMLElement };
  nativeSetDragImage: NativeSetDragImage;
}) {
  const element = cardElement ?? source?.element;
  if (!element) return;

  setCustomNativeDragPreview({
    nativeSetDragImage,
    getOffset: pointerOutsideOfPreview(PREVIEW_OFFSET),
    render: ({ container }) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.width = `${element.offsetWidth}px`;
      clone.style.boxSizing = "border-box";
      clone.style.opacity = "1";
      clone.removeAttribute("data-drop-edge");
      const overlay = document.createElement("div");
      overlay.className = "board-card-overlay";
      overlay.style.cursor = "grabbing";
      overlay.appendChild(clone);
      container.appendChild(overlay);
      return () => overlay.remove();
    },
  });
}
