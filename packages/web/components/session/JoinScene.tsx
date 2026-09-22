"use client";

import { Eye, Hand, Link2 } from "lucide-react";
import { ChromaticImage } from "@/components/ui/chromatic-image";

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
        No account — the link is the invitation
      </li>
    </ul>
  );
}

/**
 * The scene fills the whole half: the chromatic canvas is the panel's
 * background, and the wordmark and copy sit on top of it. A gradient to --bg
 * at the foot keeps the copy legible whatever the picture does there.
 */
export function JoinSceneChromatic() {
  return (
    <aside className="join-scene join-scene--chromatic">
      <ChromaticImage
        src={JOIN_SCENE_IMAGE}
        alt=""
        backgroundColor="#0a0a0a"
        tilt={0.12}
        zoom={0.12}
        className="join-chromatic"
      />
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
