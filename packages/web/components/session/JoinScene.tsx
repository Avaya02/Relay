"use client";

import { Eye, Hand, Link2 } from "lucide-react";
import { ChromaticImage } from "@/components/ui/chromatic-image";

// The picture the join page stands on. Same-origin so WebGL can read it as a
// texture; swap the file here to change the scene everywhere.
export const JOIN_SCENE_IMAGE = "/hero-ridge.webp";

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
 * The image as an object on black: a portrait card that tilts and splits its
 * colour under the pointer. The panel itself stays --bg so the card is the
 * only thing with light in it.
 */
export function JoinSceneChromatic() {
  return (
    <aside className="join-scene join-scene--chromatic">
      <div className="join-scene-top">
        <span className="join-wordmark">relay</span>
      </div>
      <div className="join-scene-stage">
        <ChromaticImage
          src={JOIN_SCENE_IMAGE}
          alt="A ridge of pines under a towering cloud"
          backgroundColor="#0a0a0a"
          className="join-chromatic"
        />
      </div>
      <div className="join-scene-copy join-scene-copy--centered">
        <h2 className="join-scene-title">Watch an agent work. Together.</h2>
        <Facts />
      </div>
    </aside>
  );
}

/** The backup: the photograph full-bleed, copy at the foot. */
export function JoinScenePhoto() {
  return (
    <aside className="join-scene">
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
