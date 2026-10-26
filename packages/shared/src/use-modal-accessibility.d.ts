import type { RefObject } from "react";

export declare function useModalAccessibility(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  open?: boolean,
): void;
