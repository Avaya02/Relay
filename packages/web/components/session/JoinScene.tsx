"use client";

import { Eye, Hand, Link2 } from "lucide-react";

// Same-origin so WebGL can read it as a texture. Aceternity's demo painting
// (scripts/prepare-join-sky.py), not licensed to Relay: replace before launch.
export const JOIN_SCENE_IMAGE = "/join-sky.webp";

function Facts() {
  return (
    <ul className="join-scene-facts">
      <li>
        <Eye size={14} />
        Everyone with the link sees the same run, live
      </li>
      <li>
        <Hand size={14} />
        One person drives; the wheel hands over mid-task
      </li>
      <li>
        <Link2 size={14} />
        No account. The link is the invitation
      </li>
    </ul>
  );
}

export function JoinSceneSky() {
  return (
    <aside className="join-scene join-scene--sky">
      <div className="join-scene-top">
        <span className="join-wordmark">relay</span>
      </div>
      <div className="join-scene-copy join-scene-copy--top">
        <h2 className="join-scene-title">
          Watch an agent work.
          <br />
          Together.
        </h2>
        <Facts />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="join-sky" src={JOIN_SCENE_IMAGE} alt="" aria-hidden />
    </aside>
  );
}

export function JoinScenePhoto() {
  return (
    <aside className="join-scene">
      {/* Uses hero-ridge.webp via .join-scene-photo, not JOIN_SCENE_IMAGE. */}
      <div className="join-scene-photo" aria-hidden />
      <div className="join-scene-top">
        <span className="join-wordmark">relay</span>
      </div>
      <div className="join-scene-copy">
        <h2 className="join-scene-title">
          Watch an agent work.
          <br />
          Together.
        </h2>
        <Facts />
      </div>
    </aside>
  );
}
