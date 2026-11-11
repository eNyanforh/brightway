import { APPLICATION_STATUSES } from "../../../../shared/opportunities.mjs";
export default function ApplicationHistory({ events = [], statuses = APPLICATION_STATUSES }) {
  return events.length > 0 && <section className="bw-op-history"><h3>Application timeline</h3><ol>{events.map(e => <li key={e.id}><strong>{statuses[e.toStatus]}</strong><time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString("en-GB")}</time>{e.feedback && <p>{e.feedback}</p>}</li>)}</ol></section>;
}
