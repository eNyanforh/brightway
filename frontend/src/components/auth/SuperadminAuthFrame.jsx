import { useEffect, useId } from "react";
import { Link } from "react-router-dom";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "../../pages/superadmin.css";
export default function SuperadminAuthFrame({ title, description, onSubmit, busy, error, children }) {
  const heading = useId();
  useEffect(() => { const title = document.title; document.title = "BrightWay Management · Secure sign-in"; return () => { document.title = title; }; }, []);
  return <main className="bw-superadmin-login">
    <header className="bw-superadmin-top"><Link to="/" aria-label="BrightWay home"><span className="bw-superadmin-mark">b↗</span>BrightWay<span className="bw-superadmin-wordmark"> / MANAGEMENT</span></Link><span className="bw-superadmin-status"><i />INTERNAL ACCESS</span></header>
    <div className="bw-superadmin-auth-grid"><section className="bw-superadmin-intro"><span className="bw-superadmin-eyebrow">BRIGHTWAY CONTROL / 01</span><div className="bw-superadmin-visual" aria-hidden="true"><div /><span><WorkspaceIcon name="shield" size={62} /></span><small>IDENTITY · AUTHORITY · ACCOUNTABILITY</small></div><h1>Purpose at scale.<br /><em>Control with care.</em></h1><p>The internal workspace for BrightWay’s authorized management team. Every permission has a purpose. Every decision has an owner.</p><div className="bw-superadmin-assurance"><span><WorkspaceIcon name="check" size={16} />Named staff accounts</span><span><WorkspaceIcon name="check" size={16} />MFA required</span><span><WorkspaceIcon name="check" size={16} />Audited permissions</span></div></section>
    <section className="bw-superadmin-auth-card" aria-labelledby={heading}><div className="bw-superadmin-card-label"><span>AUTHORIZED PERSONNEL</span><WorkspaceIcon name="shield" size={20} /></div><h2 id={heading}>{title}</h2><p className="bw-superadmin-auth-description">{description}</p>{error && <p className="bw-superadmin-auth-error" role="alert">{error}</p>}<form onSubmit={onSubmit} aria-busy={busy}><fieldset disabled={busy}>{children}</fieldset></form><div className="bw-superadmin-auth-foot"><WorkspaceIcon name="shield" size={17} /><p>Access is provisioned through the trusted terminal. There is no public administrator signup.</p></div></section></div>
    <footer className="bw-superadmin-footer"><span>BRIGHTWAY MANAGEMENT</span><span>Restricted workspace · Use your own account</span></footer>
  </main>;
}
