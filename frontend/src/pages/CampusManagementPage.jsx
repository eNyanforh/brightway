import { useEffect, useState } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { campusApi } from '../api/campus';
import { CAMPUS_MODULES, canAccessCampusModule } from '../components/grade-school/campus-modules';
import GradeSchoolWorkspace from '../components/grade-school/GradeSchoolWorkspace';
import TvetWorkspace from '../components/tvet/TvetWorkspace';
import CampusBilling from '../components/billing/CampusBilling';
import CampusSetupOverview from '../components/organizations/CampusSetupOverview';
import OrganizationWorkspacePage from './OrganizationWorkspacePage';
import OrganizationAdmissions from '../components/learning/OrganizationApplications';
import './campus-management.css';
const names = { GRADE_SCHOOL: 'Grade School', TVET: 'TVET' };
const manage = 'organization.campus.manage', academics = 'organization.campus.academics.manage';
export default function CampusManagementPage() {
  const { id, section = 'overview' } = useParams(), { account } = useAuth();
  return <CampusManagement key={`${account?.id}:${id}:${section}`} id={id} section={section} />;
}
export function CampusManagement({ id, section }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [revision, setRevision] = useState(0), [open, setOpen] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    campusApi.workspace(id, section, c.signal).then(v => { if (!c.signal.aborted) { setData(v); setError(null); } }).catch(e => { if (!c.signal.aborted) { setData(null); setError(e); } });
    return () => c.abort();
  }, [id, section, revision]);
  useEffect(() => { const refresh = () => { setData(null); setRevision(v => v + 1); }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  const reload = () => { setData(null); setRevision(v => v + 1); };
  return <div className="bw-cm"><a className="bw-cm-skip" href="#campus-content">Skip to Campus content</a>
    <header className="bw-cm-header"><Link to="/work">BRIGHTWAY</Link><span>Virtual Campus</span><Link to="/work">Switch workspace</Link><Link to="/learning?view=campus">My Campus</Link></header>
    {!data ? <main id="campus-content" className="bw-cm-content"><h1>Campus Management Workspace</h1>{error ? <><p role="alert">{error.message}</p><button onClick={reload}>Retry Campus access</button>{error.status === 409 && <p><Link to={`/campus/${id}/setup`}>Review activation</Link></p>}<p><Link to="/work">Choose another workspace</Link></p></> : <p role="status">Checking your institutional access…</p>}</main> : <div className="bw-cm-layout">
      <aside className="bw-cm-sidebar"><p className="bw-cm-caption">INSTITUTIONAL WORKSPACE</p><h2>{data.campus.displayName}</h2><p>{data.organization.name}</p><button className="bw-cm-menu" aria-expanded={open} aria-controls="campus-navigation" onClick={() => setOpen(v => !v)}>Campus menu</button>
      <nav id="campus-navigation" aria-label="Campus management" className={open ? 'is-open' : ''}>{['Campus', 'Academics', 'Operations'].map(group => <div key={group}>{data.areas.some(a => a.group === group) && <h3>{group}</h3>}{data.areas.filter(a => a.group === group).map(a => <NavLink end key={a.key} to={`/campus/${id}${a.key === 'overview' ? '' : '/' + a.key}`}>{a.label}</NavLink>)}</div>)}</nav><Link className="bw-cm-org" to={`/organization-workspace/${id}`}>Organization workspace</Link></aside>
      <main id="campus-content" className="bw-cm-content"><header className="bw-cm-title"><div><p className="bw-cm-caption">{data.campus.displayName}</p><h1>{data.areas.find(a => a.key === section)?.label}</h1></div><button onClick={reload}>Refresh access</button></header>
      {section === 'overview' && <><section className="bw-cm-welcome"><span>Campus Management Workspace</span><h2>Your institution, connected.</h2><p>Your Campus is active. Configure academic operations at your own pace; initial setup is complete.</p></section><div className="bw-cm-cards">{data.campus.enabledEngines.map(engine => <article key={engine}><p>{names[engine]}</p><h2>{data.counts[engine] ?? 'Enabled'}</h2><p>{data.counts[engine] !== undefined ? 'Institutional learner records' : 'Access follows your assigned responsibilities.'}</p><p>Configuration: {data.campus.engineConfigurations?.find(v => v.engine === engine)?.status?.replaceAll('_', ' ') || 'NOT CONFIGURED'}</p>{data.areas.some(a => a.key === (engine === 'TVET' ? 'tvet' : 'grade-school')) && <Link to={`/campus/${id}/${engine === 'TVET' ? 'tvet' : 'grade-school'}`}>Open {names[engine]}</Link>}</article>)}</div><section className="bw-cm-panel"><h2>Get your Campus ready</h2><p>Academic administrators can create periods or intakes, configure subjects or programs, and assign teaching staff. Enrollment, communications and finance have separate work areas.</p></section></>}
      {['grade-school', 'tvet'].includes(section) && <AcademicArea id={id} engine={section === 'tvet' ? 'TVET' : 'GRADE_SCHOOL'} data={data} />}
      {section === 'enrollment' && <><p>Admission acceptance and institutional enrollment are separate steps.</p>{data.organizationPermissions.includes('organization.admissions.review') && <OrganizationAdmissions organization={data.organization} />}<div className="bw-cm-cards">{Object.entries(data.enginePermissions).filter(([, p]) => p.includes(academics)).map(([engine]) => <article key={engine}><h2>{names[engine]} enrollment</h2><Link to={`/campus/${id}/${engine === 'TVET' ? 'tvet' : 'grade-school'}?module=${engine === 'TVET' ? 'learners' : 'students'}`}>Manage registrations and relationships</Link></article>)}</div></>}
      {section === 'staff' && <>{data.organizationPermissions.includes('organization.members.manage') && <OrganizationWorkspacePage section="staff" embedded />}{data.permissions.includes(manage) && <CampusGrants id={id} data={data} />}</>}
      {section === 'billing' && <CampusBilling campusId={id} />}
      {section === 'announcements' && <CampusSetupOverview organization={data.organization} section="announcements" />}
      {section === 'reports' && <><div className="bw-cm-cards">{Object.entries(data.enginePermissions).filter(([, p]) => p.includes(academics)).map(([engine]) => <article key={engine}><h2>{names[engine]} reports</h2><Link to={`/campus/${id}/${engine === 'TVET' ? 'tvet' : 'grade-school'}?module=${engine === 'TVET' ? 'certificates' : 'reports'}`}>Open official records</Link></article>)}</div>{data.permissions.includes(manage) && <CampusSettings id={id} data={data} onChange={reload} />}</>}
      </main></div>}
  </div>;
}
function AcademicArea({ id, engine, data }) {
  const [params] = useSearchParams();
  const modules = CAMPUS_MODULES[engine].filter(m => canAccessCampusModule(m, data.enginePermissions[engine]));
  const requested = params.get('module'), selected = modules.find(m => m.view === requested) || (!requested ? modules[0] : null);
  return <><nav className="bw-cm-tabs" aria-label={`${names[engine]} tools`}>{modules.map(m => <Link aria-current={selected === m ? 'page' : undefined} key={m.section} to={`?module=${m.view}`}>{m.label}</Link>)}</nav>{!selected ? <p role="alert">This academic tool is not authorized. Choose an available tool above.</p> : engine === 'TVET' ? <TvetWorkspace key={selected.view} campusId={id} module={selected.view} /> : <GradeSchoolWorkspace key={selected.view} campusId={id} module={selected.view} />}</>;
}
function CampusSettings({ id, data, onChange }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const run = async fn => { if (busy) return; setBusy(true); setError(''); try { await fn(); onChange(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <section className="bw-cm-panel"><h2>Campus settings</h2>{error && <p role="alert">{error}</p>}<form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => campusApi.settings(id, { displayName: f.get('name'), contactEmail: f.get('email') || null, expectedVersion: data.campus.version })); }}><label>Campus display name<input name="name" required maxLength={160} defaultValue={data.campus.displayName} /></label><label>Contact email<input name="email" type="email" defaultValue={data.campus.contactEmail || ''} /></label><button disabled={busy}>Save settings</button></form>{data.canGrant && Object.keys(names).filter(e => !data.campus.enabledEngines.includes(e)).map(engine => <button disabled={busy} key={engine} onClick={() => run(() => campusApi.enableEngine(id, { engine, expectedVersion: data.campus.version }))}>Enable {names[engine]}</button>)}</section>;
}
function CampusGrants({ id, data }) {
  const [page, setPage] = useState(null), [grants, setGrants] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cursor, setCursor] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { const c = new AbortController(); Promise.all([campusApi.members(id, c.signal, cursor), campusApi.grants(id, c.signal)]).then(([p, g]) => { if (!c.signal.aborted) { setPage(p); setGrants(g.items); } }).catch(e => { if (!c.signal.aborted) { setPage(null); setError(e.message); } }); return () => c.abort(); }, [id, cursor, revision]);
  const scopes = { CAMPUS: ['manage', 'announcements.manage', 'billing.manage'], ...Object.fromEntries(data.campus.enabledEngines.map(e => [e, ['academics.manage', 'teach']])) };
  return <section className="bw-cm-panel"><h2>Scoped Campus permissions</h2><p>Existing BrightWay staff memberships are reused. Grants apply only to the selected Campus and academic engine. Only the primary administrator can change these grants.</p>{error && <p role="alert">{error}</p>}{!page && !error && <p role="status">Loading staff permissions…</p>}{page && <><form onSubmit={async e => { e.preventDefault(); if (busy) return; const f = new FormData(e.currentTarget), [scope, permission] = f.get('grant').split('|'), member = f.get('member'), prior = grants.find(g => g.membershipId === member && g.scope === scope && g.permission === permission); setBusy(true); setError(''); try { await campusApi.grant(id, member, { scope, permission, enabled: f.get('enabled') === 'true', expectedVersion: page.version, expectedGrantVersion: prior?.version || 0 }); setRevision(v => v + 1); } catch (cause) { setError(cause.message); if ([401,403,404].includes(cause.status)) setPage(null); } finally { setBusy(false); } }}><fieldset disabled={!data.canGrant || busy}><legend>Staff access</legend><label>Staff member<select name="member" required>{page.items.filter(m => m.role !== 'PRIMARY_ADMIN').map(m => <option key={m.id} value={m.id}>@{m.account.username}</option>)}</select></label><label>Permission and scope<select name="grant">{Object.entries(scopes).flatMap(([scope, keys]) => keys.map(key => <option key={scope+key} value={`${scope}|organization.campus.${key}`}>{scope.replaceAll('_',' ')} — {key.replaceAll('.', ' ')}</option>))}</select></label><label>Access<select name="enabled"><option value="true">Grant</option><option value="false">Revoke</option></select></label><button disabled={!page.items.some(m => m.role !== 'PRIMARY_ADMIN')}>Save permission</button></fieldset></form>{page.items.length === 0 && <p>No enabled staff yet. Invite staff through institutional administration first.</p>}<ul>{grants.filter(g => page.items.some(m => m.id === g.membershipId)).map(g => <li key={g.membershipId+g.scope+g.permission}>@{page.items.find(m => m.id === g.membershipId).account.username} · {g.scope} · {g.permission.replace('organization.campus.','')} · {g.enabled ? 'Granted' : 'Revoked'}</li>)}</ul>{cursor && <button onClick={() => setCursor('')}>First page</button>}{page.nextCursor && <button onClick={() => setCursor(page.nextCursor)}>Next staff page</button>}</>}</section>;
}
