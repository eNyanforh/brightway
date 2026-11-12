import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { organizationPostsApi as api, memberPhotoUrl } from "../../api/organization-posts";
import AvatarGroup from "./AvatarGroup";

/** A bounded, on-screen-only preview of real reactions, comments and reposts. */
export default function PostEngagementFacepile({ postId, engagementCount, revision = 0 }) {
  const anchor = useRef(null);
  const [snapshot, setSnapshot] = useState({ id: null, people: [] });
  useEffect(() => {
    if (!postId || engagementCount <= 0) return undefined;
    const controller = new AbortController();
    let observer;
    const load = () => {
      observer?.disconnect();
      void api.engagementPreview(postId, controller.signal).then(result => {
        if (!controller.signal.aborted) {
          const seen = new Set();
          const people = (Array.isArray(result.participants) ? result.participants : [])
            .filter(person => person && typeof person.username === "string"
              && person.username && typeof person.name === "string" && person.name)
            .filter(person => {
              if (seen.has(person.username)) return false;
              seen.add(person.username);
              return true;
            }).slice(0, 3);
          setSnapshot({ id: postId, people });
        }
      }).catch(() => {
        // Do not invent participant photos or expose stale identities on read errors.
        if (!controller.signal.aborted) setSnapshot({ id: postId, people: [] });
      });
    };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) load();
      }, { threshold: 0.1 });
      if (anchor.current) observer.observe(anchor.current);
      else load();
    }
    return () => { controller.abort(); observer?.disconnect(); };
  }, [postId, engagementCount, revision]);

  const people = snapshot.id === postId ? snapshot.people : [];
  return <div className="bw-post-engagement-preview" ref={anchor}>
    {people.length > 0 && (
      <AvatarGroup className="bw-post-engagement-facepile" max={3} label="Members who engaged with this post">
        {people.map(person => {
          const initials = person.name.trim().split(/\s+/u).slice(0, 2)
            .map(part => part[0]).join("").toUpperCase();
          return <Link key={person.username} className="bw-post-engagement-avatar"
            to={"/" + encodeURIComponent(person.username)}
            title={person.name} aria-label={person.name + " engaged with this post"}>
            <span aria-hidden="true">{initials}</span>
            {person.photoId && <img src={memberPhotoUrl(person.username, person.photoId)}
              loading="lazy" alt="" onError={event => { event.currentTarget.hidden = true; }} />}
          </Link>;
        })}
      </AvatarGroup>
    )}
  </div>;
}
