"use client";

import { Eye, Hand, Link2 } from "lucide-react";

// The picture the join page stands on. Same-origin so WebGL can read it as a
// texture. Produced by scripts/prepare-join-sky.py from
// assets/join-sky-source.webp — Aceternity's demo painting, graded to a night
// sky. It's their artwork, not licensed to Relay: a placeholder to replace
// with an owned image before launch. Swap the file here to change the scene.
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

/**
 * The painting, whole. Its sky is graded onto the page ground, so the panel
 * above and beside it is simply more sky: the image can sit low, uncropped
 * across its width, with the figure near the middle of the panel and the
 * copy on the black above it. No effects, no hover; just the landscape.
 */
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

/** The backup: the photograph full-bleed, copy at the foot. */
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
