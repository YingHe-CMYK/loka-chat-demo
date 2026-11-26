import { useState } from "react";
import { Button } from "./ui";
export default function FirstContact({ onSources }: { onSources: () => void }) {
  const [draft, D] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("loka-registration-draft") || "{}",
      );
    } catch {
      return {};
    }
  });
  const [quiet, Q] = useState(
      sessionStorage.getItem("loka-contact-deferred") === "yes",
    ),
    [writing, W] = useState(false),
    [text, T] = useState(""),
    [message, M] = useState("");
  const save = () => {
    if (!text.trim()) {
      M("Tell me what you’ve been working on.");
      return;
    }
    const next = { ...draft, current_thing: text.trim() };
    localStorage.setItem("loka-registration-draft", JSON.stringify(next));
    D(next);
    W(false);
    M("Saved locally. Live judgments require a model connection.");
  };
  if (quiet)
    return (
      <article className="quiet-state">
        <small>Leave some space for now</small>
        <h2>Nothing new for now.</h2>
        <p>You can come back later. Your saved experiences will still be here.</p>
        <Button
          secondary
          onClick={() => {
            Q(false);
            sessionStorage.removeItem("loka-contact-deferred");
          }}
        >
          I’d like to keep talking
        </Button>
      </article>
    );
  return (
    <article className="contact-card">
      <small>Getting acquainted</small>
      <h2>
        {draft.current_thing
          ? "I’ve saved what you shared."
          : "Share a clue about yourself."}
      </h2>
      <p>
        {draft.current_thing ||
          `${draft.about ? `You told me: ${draft.about}.` : "We’re just getting acquainted."} Share a source or tell me what you’re working on.`}
      </p>
      {draft.current_thing && (
        <p className="note">You shared this topic. No model judgment has been made.</p>
      )}
      {writing ? (
        <>
          <label>
            Recent events
            <textarea value={text} onChange={(e) => T(e.target.value)} />
          </label>
          <Button onClick={save}>Save topic</Button>
          <Button secondary onClick={() => W(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Button secondary onClick={onSources}>
            Choose what to share
          </Button>
          <Button
            secondary
            onClick={() => {
              T(draft.current_thing || "");
              W(true);
            }}
          >
            Tell it in my words
          </Button>
          <button
            className="quiet"
            onClick={() => {
              Q(true);
              sessionStorage.setItem("loka-contact-deferred", "yes");
            }}
          >
            Not now
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
