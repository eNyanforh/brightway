import { Link } from "react-router-dom";
import {
  CHALLENGE_POST_TYPES, countChallengeWords, describeChallengePostType,
  memberPostIdFromInput,
} from "../../../../shared/challenge-submissions.mjs";
import "./challenge-post-types.css";

export default function ChallengeApplicationPosts({ requirements = [], answers = {}, onChange,
  disabled = false, readOnly = false }) {
  if (!requirements.length) return null;
  return <section className="bw-challenge-submission" aria-label="Challenge post submissions">
    <h3>Required Challenge posts</h3>
    <p>Publish your content on BrightWay, then attach the corresponding post to your Challenge entry. Every listed post type is required.</p>
    {requirements.map((item, index) => {
      const value = answers[item.id] || "";
      const caption = item.type === "CAPTION";
      const words = caption ? countChallengeWords(value) : 0;
      const validId = !caption ? memberPostIdFromInput(value) : "";
      const shared = item.type === "VIDEO_POST" || item.type === "PHOTO_POST" || item.type === "DOCUMENT_POST";
      return <fieldset key={item.id} className="bw-challenge-submit-item" disabled={disabled}>
        <legend>{index + 1}. {CHALLENGE_POST_TYPES[item.type]} <span aria-label="required">*</span></legend>
        <p>{describeChallengePostType(item)}</p>
        {caption ? <>
          {readOnly
            ? <p className="bw-op-answer">{value || "No caption provided"}</p>
            : <label>Caption
              <textarea aria-label="Challenge caption" rows={5} maxLength={5000}
                value={value} onChange={e => onChange(item.id, e.target.value)}
                placeholder="Write your caption for this Challenge" />
            </label>}
          <small aria-live="polite">{words} words
            {" · "}{item.minWords}–{item.maxWords} required</small>
        </> : readOnly
          ? <p>{validId ? <Link to={"/explore/posts/member/" + encodeURIComponent(validId)}>
              View submitted BrightWay post
            </Link> : "No post attached"}</p>
          : <label>BrightWay post link or ID
            <input type="text" aria-label={"BrightWay " + CHALLENGE_POST_TYPES[item.type] + " link"}
              value={value} maxLength={300} autoComplete="off"
              onChange={e => onChange(item.id, memberPostIdFromInput(e.target.value) || e.target.value)}
              placeholder="Paste your own published BrightWay post link" />
            {shared && <small>
              Use your own published {CHALLENGE_POST_TYPES[item.type].toLowerCase()}.
              {item.type === "VIDEO_POST" && " The organizer will review the video duration."}
            </small>}
          </label>}
      </fieldset>;
    })}
  </section>;
}
