/** Distinct, consistent line icons for each subject category. */
const artwork = {
  Coding: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></>,
  Art: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.3-3.5A2 2 0 0 1 15.7 14H18a3 3 0 0 0 3-3 8 8 0 0 0-9-8Z" /><circle cx="7" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="16" cy="8" r="1" /></>,
  Education: <><path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v5c3 3 9 3 12 0v-5M22 9v7" /></>,
  Technology: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5M10 10h4v4h-4z" /></>,
  Science: <><path d="M9 3h6m-5 0v7L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 16h10" /></>,
  Design: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><path d="m17 13 4 4-4 4-4-4 4-4Z" /></>,
  Business: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M3 13h18m-11 0v2h4v-2" /></>,
  Engineering: <><path d="M12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17M17 7l2.1-2.1" /><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /></>,
  Health: <><path d="M8.5 4h7v5h5v6h-5v5h-7v-5h-5V9h5V4Z" /></>,
  Research: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5M7.5 11l2 2 4-5" /></>,
  Entrepreneurship: <><path d="M9 18h6m-5 3h4M8 15a8 8 0 1 1 8 0c-.8.8-1 1.5-1 3H9c0-1.5-.2-2.2-1-3Z" /></>,
  Community: <><circle cx="9" cy="8" r="3" /><path d="M2 21v-2a7 7 0 0 1 14 0v2H2Z" /><path d="M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5v1h-4" /></>,
};
export default function OpportunityCategoryIcon({ category }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {artwork[category] || artwork.Education}
  </svg>;
}
