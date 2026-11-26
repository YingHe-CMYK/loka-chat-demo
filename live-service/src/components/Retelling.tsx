import { useState } from "react";
import { Heading, Button } from "./ui";
import { reviewDilemmas } from "../fixtures/registration";
export default function Retelling({
  onConfirm,
  onEdit,
}: {
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const [draft, D] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("loka-registration-draft") || "{}",
      );
    } catch {
      return {};
    }
  });
  const [correction, C] = useState(draft.retelling_correction || "");
  const [saved, S] = useState(false);
  return (
    <>
      <Heading tag="Getting acquainted / Confirm understanding" title="Did I understand you correctly?">
        You can update these first impressions or correct anything that feels wrong.
      </Heading>
      <article>
        <small>Facts you shared</small>
        <h2>{draft.about || "You haven’t described your daily routine yet."}</h2>
        <p>
          {[draft.years_in_field, draft.age_band, draft.background]
            .filter(Boolean)
            .join(" · ") || "No other background provided"}
        </p>
        <p>Current topic: {draft.current_thing || "Not provided"}</p>
        <button className="quiet" onClick={onEdit}>
          Edit original details
        </button>
      </article>
      <article>
        <small>Your choices</small>
        {reviewDilemmas
          .filter((q) => draft.dilemmas?.[q.id])
          .map((q) => (
            <p key={q.id}>
              {q.question}
              <br />
              <strong>
                {q.options.find((o) => o.id === draft.dilemmas[q.id])?.label}
              </strong>
            </p>
          ))}
        {!Object.values(draft.dilemmas || {}).length && (
          <p>No answer yet. No preference inferred.</p>
        )}
        <p className="note">
          This reflects your choices. The model is offline, and choices are not fixed personality traits.
        </p>
      </article>
      <article>
        <small>Contact preferences</small>
        <p>{draft.quiet_text || "No quiet hours set"}</p>
        <p className="note">
          Your words are saved. Notifications are off until you confirm a precise time.
        </p>
      </article>
      <label>
        What should change?
        <textarea
          value={correction}
          onChange={(e) => {
            C(e.target.value);
            S(false);
          }}
          placeholder="Add context or explain when your choice applies."
        />
      </label>
      <Button
        secondary
        onClick={() => {
          const next = { ...draft, retelling_correction: correction };
          localStorage.setItem("loka-registration-draft", JSON.stringify(next));
          D(next);
          S(true);
        }}
      >
        Save note
      </Button>
      {saved && <p role="status">Note saved to your local introduction.</p>}
      <Button
        onClick={() => {
          localStorage.setItem(
            "loka-registration-draft",
            JSON.stringify({
              ...draft,
              retelling_correction: correction,
              reviewedAt: new Date().toISOString(),
            }),
          );
          onConfirm();
        }}
      >
        Confirm and continue
      </Button>
    </>
  );
}
