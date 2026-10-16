"use client";

import { useRef } from "react";
import { X } from "lucide-react";

const SOCIALS = [
  { label: "LinkedIn", handle: "avaya-sharma", href: "https://linkedin.com/in/avaya-sharma-30a244226" },
  { label: "X", handle: "@Avaya_002", href: "https://x.com/Avaya_002" },
  { label: "Email", handle: "avaya.sharma933@gmail.com", href: "mailto:avaya.sharma933@gmail.com" },
];

// A native <dialog>: showModal() brings focus trapping, Escape and the backdrop
// with it, so there's no focus code here to get wrong.
export function ContactDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="landing-foot-button" onClick={() => ref.current?.showModal()}>
        Contact
      </button>
      <dialog
        ref={ref}
        className="contact"
        aria-labelledby="contact-title"
        // Backdrop clicks report the dialog as their target only some of the time,
        // so test the position: anything outside the panel's box closes it.
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const inside =
            e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
          if (!inside) e.currentTarget.close();
        }}
      >
        <div className="contact-panel">
          <div className="contact-head">
            <h2 id="contact-title" className="contact-title">
              Get in touch
            </h2>
            <button
              type="button"
              className="contact-close"
              onClick={() => ref.current?.close()}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <p className="contact-lede">Relay is built by Avaya Sharma. Questions, ideas and bug reports are all welcome.</p>
          <ul className="contact-list">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a
                  className="contact-row"
                  href={s.href}
                  {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  <span className="contact-label">{s.label}</span>
                  <span className="contact-handle">{s.handle}</span>
                  <span className="contact-arrow" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
