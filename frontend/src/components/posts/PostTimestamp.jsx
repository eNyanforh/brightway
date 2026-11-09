import { useEffect, useState } from "react";
import { formatPostTime, postTimeRefreshDelay } from "./post-time";

export default function PostTimestamp({ createdAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer;
    const schedule = () => {
      const delay = postTimeRefreshDelay(createdAt);
      if (delay === null) return;
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [createdAt]);

  const { relative, exact } = formatPostTime(createdAt, now);
  return (
    <time
      dateTime={createdAt}
      title={exact || undefined}
      aria-label={exact ? (relative === "Just now" ? `Posted just now — ${exact}` : `Posted ${relative} ago — ${exact}`) : "Posting date unavailable"}
    >
      {relative}
    </time>
  );
}
