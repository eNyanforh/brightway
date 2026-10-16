import { useEffect, useId, useRef } from "react";
import { useAuth } from "../../auth/useAuth";
import { profileApi } from "../../api/profile";
import {
  editorFields,
  formFromProfile,
  mergeSavedSection,
} from "../../pages/profile-form";
import {
  blankHistoryRecord,
  experienceOptions,
  historyInput,
  monthLabel,
  validateHistory,
} from "../../pages/profile-history-form";
import Icon from "../layout/Icon";
import "./profile-history.css";

const statusLabels = {
  DRAFT: "Not submitted for verification",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  VERIFIED: "Verified",
  ACTION_REQUIRED: "Action required",
  UNABLE_TO_VERIFY: "Unable to verify",
  FALSE_CREDENTIAL: "False credential",
};

function HistoryDialog({ kind, draft, setDraft, onReload }) {
  const { refresh } = useAuth();
  const dialog = useRef(null);
  const mutation = useRef(false);
  const titleId = useId();
  const prefix = useId();
  const title = kind === "education" ? "Education" : "Experience";
  const { form, busy, error } = draft;
  const mode = form[`${kind}Mode`];
  const records = JSON.parse(form[`${kind}Records`]);
  const none =
    kind === "education" ? "No formal education" : "No work experience";
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      if (element.open) element.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  function close() {
    if (!busy && !mutation.current)
      setDraft((previous) => ({ ...previous, editor: null }));
  }
  function change(nextMode, nextRecords) {
    if (busy || mutation.current) return;
    setDraft((previous) => ({
      ...previous,
      form: {
        ...previous.form,
        [`${kind}Mode`]: nextMode,
        [`${kind}Records`]: JSON.stringify(nextRecords),
      },
      notice: "",
      error: [401, 409].includes(previous.error?.status)
        ? previous.error
        : null,
    }));
  }
  function chooseMode(next) {
    if (
      next !== "RECORDS" &&
      records.length &&
      !window.confirm(
        `Remove all ${kind} records from this draft? Nothing changes on the server until you save.`,
      )
    )
      return;
    change(next, next === "RECORDS" ? records : []);
  }
  function update(index, field, value) {
    change(
      mode,
      records.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
              ...(field === "current" && value ? { endMonth: "" } : {}),
            }
          : item,
      ),
    );
  }
  function cancel() {
    if (busy || mutation.current) return;
    setDraft((previous) => {
      const saved = formFromProfile(previous.profile),
        next = { ...previous.form };
      for (const field of editorFields[kind]) next[field] = saved[field];
      return {
        ...previous,
        form: next,
        editor: null,
        error: [401, 409].includes(previous.error?.status)
          ? previous.error
          : null,
      };
    });
  }
  async function save(event) {
    event.preventDefault();
    if (busy || mutation.current || [401, 409].includes(error?.status)) return;
    const input = historyInput(form, kind),
      problem = validateHistory(input);
    if (problem) {
      setDraft((previous) => ({ ...previous, error: new Error(problem) }));
      return;
    }
    const saved = formFromProfile(draft.profile);
    if (editorFields[kind].every((field) => form[field] === saved[field])) {
      setDraft((previous) =>
        mergeSavedSection(previous, previous.profile, kind),
      );
      return;
    }
    mutation.current = true;
    setDraft((previous) => ({
      ...previous,
      busy: true,
      error: null,
      notice: "",
    }));
    try {
      const profile = await profileApi.saveHistory(
        kind,
        draft.profile.version,
        input,
      );
      setDraft((previous) => mergeSavedSection(previous, profile, kind));
    } catch (failure) {
      setDraft((previous) => ({ ...previous, error: failure }));
    } finally {
      mutation.current = false;
      setDraft((previous) => ({ ...previous, busy: false }));
    }
  }
  function field(
    item,
    index,
    name,
    label,
    { type = "text", maxLength = 160, required = true } = {},
  ) {
    const id = `${prefix}-${index}-${name}`;
    return (
      <div className="bw-profile-field">
        <label htmlFor={id}>
          {label}
          {!required && " (optional)"}
        </label>
        {type === "textarea" ? (
          <textarea
            id={id}
            value={item[name] || ""}
            maxLength={maxLength}
            onChange={(event) => update(index, name, event.target.value)}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={item[name] || ""}
            required={required}
            maxLength={type === "text" ? maxLength : undefined}
            min={type === "month" ? "1900-01" : undefined}
            max={
              type === "month"
                ? new Date().toISOString().slice(0, 7)
                : undefined
            }
            onChange={(event) => update(index, name, event.target.value)}
          />
        )}
      </div>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="bw-profile-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={save}>
        <header className="bw-profile-dialog-head">
          <h2 id={titleId}>Edit {kind}</h2>
          <button
            className="bw-profile-icon-button"
            type="button"
            disabled={busy}
            aria-label="Close editor and keep edits"
            onClick={close}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="bw-profile-dialog-body">
          {error && (
            <div className="bw-profile-error" role="alert">
              <p>{error.message}</p>
              {error.errors?.length > 0 && (
                <ul>
                  {error.errors.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {error.status === 409 && (
                <>
                  <p>
                    Your edits are still here. Copy what you want to keep before
                    reloading.
                  </p>
                  <button
                    type="button"
                    className="bw-profile-button bw-profile-button-secondary"
                    disabled={busy}
                    onClick={onReload}
                  >
                    Discard edits and load latest
                  </button>
                </>
              )}
              {error.status === 401 && (
                <button
                  type="button"
                  className="bw-profile-button"
                  onClick={refresh}
                >
                  Sign in again
                </button>
              )}
            </div>
          )}
          <fieldset disabled={busy}>
            <div className="bw-profile-field">
              <label htmlFor={`${prefix}-mode`}>{title} history</label>
              <select
                id={`${prefix}-mode`}
                value={mode}
                onChange={(event) => chooseMode(event.target.value)}
              >
                <option value="UNSET">Not added yet</option>
                <option value="RECORDS">I have {kind} records</option>
                <option value="NONE">{none}</option>
              </select>
            </div>
            {mode === "NONE" && (
              <p className="bw-profile-muted">
                This declaration is saved when you select Save changes. It does
                not verify your identity.
              </p>
            )}
            {mode === "RECORDS" && (
              <>
                <p className="bw-profile-muted">
                  Enter month and year. Saved records remain drafts until
                  verification is available.
                </p>
                {records.map((item, index) => (
                  <fieldset
                    key={item.id || item._key}
                    className="bw-history-record-editor"
                  >
                    <legend>
                      {title} record {index + 1}
                    </legend>
                    {kind === "education" ? (
                      <>
                        {field(item, index, "institution", "Institution")}
                        {field(
                          item,
                          index,
                          "qualification",
                          "Qualification or program",
                        )}
                      </>
                    ) : (
                      <>
                        {field(
                          item,
                          index,
                          "organization",
                          "Organization or business",
                        )}
                        {field(item, index, "role", "Role or position")}
                        <div className="bw-profile-field">
                          <label htmlFor={`${prefix}-${index}-type`}>
                            Experience type
                          </label>
                          <select
                            id={`${prefix}-${index}-type`}
                            value={item.type}
                            onChange={(event) =>
                              update(index, "type", event.target.value)
                            }
                          >
                            {Object.entries(experienceOptions).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </>
                    )}
                    <label className="bw-history-checkbox">
                      <input
                        type="checkbox"
                        checked={item.current}
                        onChange={(event) =>
                          update(index, "current", event.target.checked)
                        }
                      />
                      {kind === "education"
                        ? "Currently studying here"
                        : "Currently working in this role"}
                    </label>
                    <div className="bw-profile-field-row">
                      {field(
                        item,
                        index,
                        "startMonth",
                        "Start month and year",
                        { type: "month" },
                      )}
                      {!item.current &&
                        field(item, index, "endMonth", "End month and year", {
                          type: "month",
                        })}
                    </div>
                    {field(item, index, "description", "Description", {
                      type: "textarea",
                      required: false,
                      maxLength: 1000,
                    })}
                    <button
                      type="button"
                      className="bw-profile-text-button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${kind} record ${index + 1} from this draft? Save changes to apply removal.`,
                          )
                        )
                          change(
                            mode,
                            records.filter((_, i) => i !== index),
                          );
                      }}
                    >
                      Remove record {index + 1}
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="bw-profile-button bw-profile-button-secondary"
                  disabled={records.length >= 20}
                  onClick={() =>
                    change(mode, [...records, blankHistoryRecord(kind)])
                  }
                >
                  <Icon name="plus" />
                  Add {kind} record
                </button>
              </>
            )}
          </fieldset>
        </div>
        <footer className="bw-profile-dialog-foot">
          <button
            type="button"
            className="bw-profile-button bw-profile-button-secondary"
            disabled={busy}
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bw-profile-button"
            disabled={busy || [401, 409].includes(error?.status)}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export default function ProfileHistory({
  kind,
  draft,
  setDraft,
  onEdit,
  onReload,
  busy,
}) {
  const title = kind === "education" ? "Education" : "Experience";
  const history = draft.profile[kind] || { mode: "UNSET", records: [] };
  return (
    <>
      <section className="bw-profile-card bw-profile-section">
        <div className="bw-profile-section-head">
          <h2>{title}</h2>
          <button
            className="bw-profile-edit"
            disabled={busy}
            data-profile-editor={kind}
            aria-label={`Edit ${kind}`}
            onClick={() => onEdit(kind)}
          >
            <Icon name="pencil" />
            <span>Edit</span>
          </button>
        </div>
        {history.mode === "NONE" ? (
          <p className="bw-profile-muted">
            {kind === "education"
              ? "No formal education declared."
              : "No work experience declared."}
          </p>
        ) : history.records.length ? (
          <div className="bw-history-list">
            {history.records.map((item) => (
              <article className="bw-history-record" key={item.id}>
                <h3>{kind === "education" ? item.qualification : item.role}</h3>
                <p>
                  {kind === "education" ? item.institution : item.organization}
                </p>
                {kind === "experience" && <p>{experienceOptions[item.type]}</p>}
                <small>
                  {monthLabel(item.startMonth)} –{" "}
                  {item.current ? "Present" : monthLabel(item.endMonth)}
                </small>
                <span className="bw-history-status">
                  {statusLabels[item.status] ||
                    "Not submitted for verification"}
                </span>
                {item.description && (
                  <p className="bw-profile-description">{item.description}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="bw-profile-muted">
            {kind === "education"
              ? "Add your studies or declare that you have no formal education."
              : "Add employment, internships, volunteering, or self-employment. You can also declare no work experience."}
          </p>
        )}
      </section>
      {draft.editor === kind && (
        <HistoryDialog
          kind={kind}
          draft={draft}
          setDraft={setDraft}
          onReload={onReload}
        />
      )}
    </>
  );
}