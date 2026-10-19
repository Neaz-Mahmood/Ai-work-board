import React from "react";
import type { FeatureRef, Feature } from "@awb/shared/types.ts";
import "./features/features.css";

export type FeatureLabelProps = {
  feature?: FeatureRef | Feature | { name: string; color: string } | null;
  name?: string;
  color?: string;
  maxChars?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function hexToRgba(hex: string, alpha: number = 0.15): string {
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
}

export function FeatureLabel({
  feature,
  name: propName,
  color: propColor,
  maxChars = 20,
  className = "",
  style,
}: FeatureLabelProps) {
  const name = feature?.name ?? propName;
  const color = feature?.color ?? propColor ?? "#0C66E4";

  if (!name) {
    return null;
  }

  const isTruncated = name.length > maxChars;
  const displayName = isTruncated ? `${name.slice(0, maxChars)}…` : name;

  return (
    <span
      className={`feature-label ${className}`.trim()}
      title={name}
      style={{
        color,
        backgroundColor: hexToRgba(color, 0.15),
        borderRadius: "3px",
        textTransform: "uppercase",
        fontSize: "11px",
        fontWeight: 700,
        ...style,
      }}
    >
      {displayName}
    </span>
  );
}
