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

    case "menu":
      shape = <path d="M4 6h16M4 12h16M4 18h16" />;
      break;

    default:
      shape = <path d="M12 5v14M5 12h14" />;
  }

  const filled =
    active &&
    ["explore", "opportunities", "network", "learning"].includes(name);

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