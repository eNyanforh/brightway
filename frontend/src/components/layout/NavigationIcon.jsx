export default function NavigationIcon({
  name,
  active = false,
  size = 22,
}) {
  let shape;

  switch (name) {
    case "explore":
      shape = active ? (
        <path d="M12 2.5 1.5 11H4v10h6v-6h4v6h6V11h2.5L12 2.5Z" />
      ) : (
        <path d="m3 10 9-7.5 9 7.5M5 8.5V21h5v-6h4v6h5V8.5" />
      );
      break;

    case "opportunities":
      shape = active ? (
        <>
          <path d="M8 3h8v4h-2V5h-4v2H8V3ZM3 8h18v5H3V8ZM3 15h8v2h2v-2h8v6H3v-6Z" />
          <rect x="11" y="11" width="2" height="4" />
        </>
      ) : (
        <>
          <rect x="3" y="7" width="18" height="14" rx="2" />
          <path d="M8 7V3h8v4M3 13h7m4 0h7" />
          <rect x="10" y="11" width="4" height="4" rx="1" />
        </>
      );
      break;

    case "network":
      shape = active ? (
        <>
          <circle cx="9" cy="7" r="4" />
          <path d="M2 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3H2ZM17 3a4 4 0 0 1 0 8V3ZM18 13a5 5 0 0 1 5 5v3h-5v-3a8 8 0 0 0-1.6-5H18Z" />
        </>
      ) : (
        <>
          <circle cx="9" cy="7" r="4" />
          <path d="M2 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3M17 3a4 4 0 0 1 0 8M18 13a5 5 0 0 1 5 5v3" />
        </>
      );
      break;

    case "work":
      shape = <><path d="M4 21V3h11v18M15 9h5v12M2 21h20M8 21v-4h3v4M7 7h1m3 0h1M7 11h1m3 0h1M17 13h1m-1 4h1" /></>;
      break;

    case "learning":
      shape = active ? (
        <>
          <path d="m12 3 11 6-11 6L1 9l11-6ZM5 13l7 4 7-4v5c-4 3-10 3-14 0v-5Z" />
          <path d="M21 11h2v7h-2z" />
        </>
      ) : (
        <path d="m12 3 11 6-11 6L1 9l11-6ZM5 12v6c4 3 10 3 14 0v-6M22 10v8" />
      );
      break;

    case "post":
      shape = (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <path d="M12 7v10M7 12h10" />
        </>
      );
      break;

    case "applications":
      shape = <><path d="M8 5H4v16h16V5h-4M8 3h8v4H8z" /><path d="m8 14 3 3 5-6" /></>;
      break;

    case "security":
      shape = <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>;
      break;

    case "admissions":
      shape = <><circle cx="9" cy="7" r="4" /><path d="M2 21v-3a7 7 0 0 1 11-5M15 17h7m-3-3 3 3-3 3" /></>;
      break;

    case "search":
      shape = (
        <>
          <circle cx="10.5" cy="10.5" r="7.5" />
          <path d="m16 16 5 5" />
        </>
      );
      break;

    case "messages":
      shape = (
        <>
          <path d="M21 11.5c0 5-4 8.5-9 8.5-1.3 0-2.5-.2-3.6-.7L4 21v-4c-1.3-1.5-2-3.4-2-5.5C2 6.5 6.5 3 12 3s9 3.5 9 8.5Z" />
          <path d="m7 13 4-4 3 3 3-3" />
        </>
      );
      break;

    case "notifications":
      shape = (
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4M12 2v2" />
      );
      break;

    case "awards":
      shape = <path d="M8 4h8v7a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 3v5m-4 0h8" />;
      break;
    case "calendar":
      shape = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2" /></>;
      break;
    case "pin":
      shape = <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>;
      break;
    case "question":
      shape = <><circle cx="12" cy="12" r="9" /><path d="M9.2 9a3.2 3.2 0 1 1 5.2 2.5c-1.4 1-2.4 1.7-2.4 3M12 17.7h.01" /></>;
      break;
    case "chevron-left":
      shape = <path d="m15 6-6 6 6 6" />;
      break;
    case "chevron-right":
      shape = <path d="m9 6 6 6-6 6" />;
      break;
    case "pause":
      shape = <path d="M9 5v14m6-14v14" />;
      break;
    case "play":
      shape = <path d="m9 5 10 7-10 7Z" />;
      break;
    case "reply":
      shape = <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.85L3 21l1.85-5.7a9 9 0 0 1-.85-3.8A8.5 8.5 0 0 1 12.5 3h.5A8.5 8.5 0 0 1 21 11.5Z" />;
      break;
    case "repost":
      shape = <path d="m3 8 4-4 4 4M7 4v11a2 2 0 0 0 2 2h4m8-1-4 4-4-4m4 4V9a2 2 0 0 0-2-2h-3" />;
      break;
    case "like":
      shape = <path d="M20.7 5.8a5.1 5.1 0 0 0-7.2 0L12 7.3l-1.5-1.5a5.1 5.1 0 0 0-7.2 7.2l8.7 8 8.7-8a5.1 5.1 0 0 0 0-7.2Z" />;
      break;
    case "celebrate":
      shape = <><path d="M4 20 15 9l3 3L7 23l-3-3ZM13 4V2m7 8h2M17 6l2-2M9 3l1 3m9 10 3 1M4 10l-2-1" /><path d="m13 9 2-3 3 3-3 3" /></>;
      break;
    case "analytics":
      shape = <><rect x="3" y="13" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="13" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></>;
      break;
    case "share":
      shape = <><path d="M12 16V3m0 0-5 5m5-5 5 5M5 13H3v8h18v-8h-2" /></>;
      break;
    case "upvote":
      shape = <><path d="M12 3 3 12h5v9h8v-9h5L12 3Z" /></>;
      break;
    case "downvote":
      shape = <><path d="m12 21 9-9h-5V3H8v9H3l9 9Z" /></>;
      break;
    case "flag":
      shape = <><path d="M5 22V3m0 1c6-4 8 4 16 0v12c-8 4-10-4-16 0" /></>;
      break;
    case "ticket":
      shape = <><path d="M3 8h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V8ZM14 8v12" /></>;
      break;
    case "answer":
      shape = <><path d="M21 12a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 15-4Z" /><path d="m9 12 2 2 4-4" /></>;
      break;
    case "bookmark":
      shape = <path d="M6 4h12v17l-6-4-6 4Z" />;
      break;
    case "more-horizontal":
      shape = <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>;
      break;
    case "edit":
      shape = <><path d="m16 4 4 4-11.5 11.5-5 1 1-5L16 4Z" /><path d="m14 6 4 4" /></>;
      break;
    case "trash":
      shape = <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>;
      break;
    case "menu":
      shape = <path d="M4 6h16M4 12h16M4 18h16" />;
      break;

    default:
      shape = <path d="M12 5v14M5 12h14" />;
  }

  const filled =
    active &&
    ["explore", "opportunities", "network", "learning", "like", "bookmark"].includes(name);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}
