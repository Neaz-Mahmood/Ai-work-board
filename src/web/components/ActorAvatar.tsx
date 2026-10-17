import React from "react";
import type { Actor } from "../../shared/types.ts";

export type ActorAvatarProps = {
  name: string;
  actors?: Actor[];
  color?: string;
  className?: string;
};

export function ActorAvatar({
  name,
  actors,
  color,
  className = "",
}: ActorAvatarProps) {
  const actor = actors?.find((a) => a.name === name);
  const bgColor = color ?? actor?.color ?? "#8590A2";
  const initials = (name || "").slice(0, 2).toUpperCase();

  return (
    <div
      className={`actor-avatar ${className}`.trim()}
      style={{ backgroundColor: bgColor }}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
