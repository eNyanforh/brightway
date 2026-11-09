import { Children } from "react";

/**
 * A bounded, accessible avatar stack. The caller owns the avatar links or images;
 * AvatarGroup only manages layout and how many children are visible.
 */
export default function AvatarGroup({ children, max = 3, className = "", label = "Members" }) {
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  const visible = Children.toArray(children).slice(0, limit);

  if (!visible.length) return null;

  return (
    <div className={className || "bw-avatar-group"} role="group" aria-label={label}>
      {visible}
    </div>
  );
}
