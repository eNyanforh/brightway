import "./verification-badge.css";
export default function VerificationBadge({ kind = "identity" }) {
  const organization = kind === "organization";
  return <span className="bw-verification-badge" role="img" aria-label={organization ? "Verified organization" : "Verified identity"} title={organization ? "Organization verified by BrightWay" : "Identity verified by BrightWay"}>
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="m12 1.5 2.7 2.1 3.4-.1.9 3.3 2.8 1.9-1.1 3.3 1.1 3.3-2.8 1.9-.9 3.3-3.4-.1-2.7 2.1-2.7-2.1-3.4.1-.9-3.3-2.8-1.9 1.1-3.3-1.1-3.3 2.8-1.9.9-3.3 3.4.1Z" />
      <path d="m7.8 12 2.7 2.7 5.8-5.8" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}
