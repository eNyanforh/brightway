import {
  CHALLENGE_PRIZE_CURRENCIES, CHALLENGE_PRIZE_TYPES, newChallengePrize,
} from "../../../../shared/challenges.mjs";

// Every new reward has its own structured form. Previously published rewards
// keep their legacy description until their publisher explicitly converts them.
export default function ChallengePrizeFields({ prize, index, onChange }) {
  const field = (name, value) => onChange({ ...prize, [name]: value });
  const number = value => value === "" ? "" : Number(value);
  const ordinal = `Prize ${index + 1}`;
  return <div className="bw-op-wizard-prize-fields">
    <label>Prize Type
      <select aria-label={ordinal + " type"} value={prize.type}
        onChange={e => onChange(newChallengePrize(e.target.value))}>
        {Object.entries(CHALLENGE_PRIZE_TYPES).map(([key, label]) =>
          <option key={key} value={key}>{label}</option>)}
      </select>
    </label>

    {typeof prize.description === "string" ? <>
      <label>Existing prize details
        <input aria-label={ordinal + " existing details"} required minLength={1}
          maxLength={120} value={prize.description}
          onChange={e => field("description", e.target.value)} />
      </label>
      <button className="bw-op-text-button" type="button"
        onClick={() => onChange(newChallengePrize(prize.type))}>
        Use the new {CHALLENGE_PRIZE_TYPES[prize.type]} form
      </button>
    </> : <>
      {prize.type === "CASH" && <div className="bw-op-field-row">
        <label>Amount
          <input aria-label={ordinal + " amount"} required type="number" min="0.01" step="0.01"
            max="1000000000" placeholder="500" value={prize.amount}
            onChange={e => field("amount", number(e.target.value))} />
        </label>
        <label>Currency
          <select aria-label={ordinal + " currency"} value={prize.currency}
            onChange={e => field("currency", e.target.value)}>
            {Object.entries(CHALLENGE_PRIZE_CURRENCIES).map(([code, title]) =>
              <option value={code} key={code}>{title}</option>)}
          </select>
        </label>
      </div>}

      {prize.type === "SCHOLARSHIP" && <div className="bw-op-field-row">
        <label>Scholarship Coverage
          <input required minLength={2} maxLength={120} value={prize.coverage}
            placeholder="Full tuition or 50% tuition" onChange={e => field("coverage", e.target.value)} />
        </label>
        <label>Institution (optional)
          <input maxLength={120} value={prize.institution} placeholder="Offering institution"
            onChange={e => field("institution", e.target.value)} />
        </label>
      </div>}

      {prize.type === "CERTIFICATE" && <div className="bw-op-field-row">
        <label>Certificate Title
          <input required minLength={2} maxLength={120} value={prize.title}
            placeholder="Certificate of achievement" onChange={e => field("title", e.target.value)} />
        </label>
        <label>Issued By (optional)
          <input maxLength={120} value={prize.issuer} placeholder="Issuing organization"
            onChange={e => field("issuer", e.target.value)} />
        </label>
      </div>}

      {prize.type === "MENTORSHIP" && <div className="bw-op-field-row">
        <label>Mentorship Focus
          <input required minLength={2} maxLength={120} value={prize.focus}
            placeholder="Career or business mentorship" onChange={e => field("focus", e.target.value)} />
        </label>
        <label>Number of Sessions
          <input required type="number" min="1" max="1000" step="1" value={prize.sessions}
            onChange={e => field("sessions", number(e.target.value))} />
        </label>
      </div>}

      {prize.type === "EQUIPMENT" && <div className="bw-op-field-row">
        <label>Equipment or Item
          <input required minLength={2} maxLength={120} value={prize.item}
            placeholder="Laptop or camera" onChange={e => field("item", e.target.value)} />
        </label>
        <label>Quantity
          <input required type="number" min="1" max="100000" step="1"
            value={prize.quantity} onChange={e => field("quantity", number(e.target.value))} />
        </label>
      </div>}

      {prize.type === "INTERNSHIP" && <div className="bw-op-field-row">
        <label>Internship Role
          <input required minLength={2} maxLength={120} value={prize.role}
            placeholder="Software engineering intern" onChange={e => field("role", e.target.value)} />
        </label>
        <label>Duration
          <input required minLength={2} maxLength={80} value={prize.duration}
            placeholder="3 months" onChange={e => field("duration", e.target.value)} />
        </label>
      </div>}

      {prize.type === "OTHER" && <div className="bw-op-field-row">
        <label>Prize Name
          <input required minLength={2} maxLength={120} value={prize.title}
            placeholder="Recognition award" onChange={e => field("title", e.target.value)} />
        </label>
        <label>Description
          <input required minLength={2} maxLength={120} value={prize.details}
            placeholder="Describe what winners receive" onChange={e => field("details", e.target.value)} />
        </label>
      </div>}
    </>}
  </div>;
}
