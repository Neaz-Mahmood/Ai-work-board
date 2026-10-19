import React from "react";
import type { Priority } from "@awb/shared/types.ts";

export type PriorityIconProps = {
  priority: Priority;
  className?: string;
  size?: number;
};

export function PriorityIcon({
  priority,
  className = "",
  size = 16,
}: PriorityIconProps) {
  const norm = (priority || "medium").toLowerCase();

  const renderIcon = () => {
    switch (norm) {
      case "highest":
        return (
          <>
            <path
              d="M3.5 7.5L8 3L12.5 7.5"
              stroke="#C9372C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.5 12.5L8 8L12.5 12.5"
              stroke="#C9372C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      case "high":
        return (
          <path
            d="M3.5 10.5L8 6L12.5 10.5"
            stroke="#E2483D"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "medium":
        return (
          <>
            <path
              d="M3.5 6H12.5"
              stroke="#E2B203"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M3.5 10H12.5"
              stroke="#E2B203"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case "low":
        return (
          <path
            d="M3.5 6L8 10.5L12.5 6"
            stroke="#0C66E4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "lowest":
        return (
          <>
            <path
              d="M3.5 4L8 8.5L12.5 4"
              stroke="#0C66E4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.5 9L8 13.5L12.5 9"
              stroke="#0C66E4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      default:
        return (
          <>
            <path
              d="M3.5 6H12.5"
              stroke="#E2B203"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M3.5 10H12.5"
              stroke="#E2B203"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={priority}
      className={`priority-icon ${className}`.trim()}
      {...({ title: priority } as Record<string, unknown>)}
    >
      <title>{priority}</title>
      {renderIcon()}
    </svg>
  );
}
