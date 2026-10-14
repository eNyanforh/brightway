import { useState } from "react";
import { photoUrl } from "../../api/profile";

export default function ProfilePicture({
  id,
  name,
  className = "",
  decorative = false,
}) {
  const [failedId, setFailedId] = useState(null);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={`bw-picture ${className}`}>
      {id && failedId !== id ? (
        <img
          src={photoUrl(id)}
          crossOrigin="use-credentials"
          alt={decorative ? "" : `${name}'s profile picture`}
          onError={() => setFailedId(id)}
        />
      ) : (
        <span
          aria-hidden={decorative || undefined}
          aria-label={
            decorative
              ? undefined
              : id
                ? "Picture could not load"
                : "No profile picture"
          }
        >
          {initials}
        </span>
      )}
    </span>
  );
}