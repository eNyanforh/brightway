const shapes = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-3 5-5 3 3-5Z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8" />
      <circle cx="9" cy="7" r="4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V3h8v4M3 12a20 20 0 0 0 18 0M12 11v4" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2Z" />
    </>
  ),
  pencil: (
    <>
      <path d="m16 3 5 5M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16Z" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7h3l2-3h6l2 3h3v14H4Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-8m0 0c-5 0-8-3-8-8 5 0 8 3 8 8Zm0-2c0-5 3-8 8-8 0 5-3 8-8 8Z" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M6 18 18 6" />,
};
export default function Icon({ name, className = "" }) {
  return (
    <svg
      className={`bw-icon ${className}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}