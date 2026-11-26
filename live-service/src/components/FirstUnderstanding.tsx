import { reviewDilemmas } from "../fixtures/registration";
import { useState } from "react";
import { Heading, Button } from "./ui";
/** Registration draft mirrors Twin Backend fields; submission awaits verified API contract. */
export default function FirstUnderstanding({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("loka-registration-draft") || "{}",
      );
    } catch {
      return {};
    }
  });
  const [step, updateStep] = useState(() => Math.max(0, Math.min(3, Number(sessionStorage.getItem("loka-understanding-step")) || 0)));
  const setStep = (next: number) => { updateStep(next); sessionStorage.setItem("loka-understanding-step", String(next)); window.scrollTo(0, 0); };
  const save = (key: string, value: any) =>
    setDraft((d: any) => {
      const next = { ...d, [key]: value };
      localStorage.setItem("loka-registration-draft", JSON.stringify(next));
      return next;
    });
  return (
    <section className="first-understanding">
      <p className="note">First impressions · {step + 1} / 4</p>
      {step === 0 ? (
        <>
          <Heading title="Start with your daily life.">
            Tell me what you do. Choose a starting point and add details later.
          </Heading>
          <div className="suggestion-chips">
            {[
              "Research",
              "Software engineering",
              "Product",
              "Starting a business",
              "Investing",
              "Drug development / Science",
              "Web3",
              "PhD studies / Reading",
              "Operations / Sales",
            ].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() =>
                  save(
                    "about",
                    `${draft.about || ""}${draft.about ? ", " : ""}${v}`,
                  )
                }
              >
                {v} ＋
              </button>
            ))}
          </div>
          <label>
            What do you usually work on?
            <textarea
              value={draft.about || ""}
              onChange={(e) => save("about", e.target.value)}
              placeholder="Choose a starting point, then add details"
            />
          </label>
          <label>
            How long have you worked in this field?
            <select
              value={draft.years_in_field || ""}
              onChange={(e) => save("years_in_field", e.target.value)}
            >
              <option value="">Leave blank</option>
              {["<1 years", "1-3 years", "3-8 years", "8-15 years", "15 years+"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Age range
            <select
              value={draft.age_band || ""}
              onChange={(e) => save("age_band", e.target.value)}
            >
              <option value="">Leave blank</option>
              {["20s", "30s", "40s", "50+"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Professional background (optional)
            <input
              value={draft.background || ""}
              onChange={(e) => save("background", e.target.value)}
              placeholder="Past and current learning"
            />
          </label>
        </>
      ) : step === 1 ? (
        <>
          <Heading title="A few choices">
            Choose what feels right or skip.
          </Heading>
          <div className="dilemmas">
            {reviewDilemmas.map((q) => (
              <fieldset key={q.id}>
                <legend>{q.question}</legend>
                <div>
                  {q.options.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      aria-pressed={draft.dilemmas?.[q.id] === option.id}
                      onClick={() => {
                        const next = { ...draft.dilemmas };
                        if (next[q.id] === option.id) delete next[q.id];
                        else next[q.id] = option.id;
                        save("dilemmas", next);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </>
      ) : step === 2 ? (
        <>
          <Heading title="What’s still on your mind?">
            Pick one thing you want to understand or move forward.
          </Heading>
          <label>
            Current topic
            <textarea
              value={draft.current_thing || ""}
              onChange={(e) => save("current_thing", e.target.value)}
              placeholder="Skip if nothing comes to mind"
            />
          </label>
        </>
      ) : (
        <>
          <Heading title="When would you prefer quiet time?">
            Set quiet hours. You can change this later.
          </Heading>
          <label>
            Quiet hours
            <textarea
              value={draft.quiet_text || ""}
              onChange={(e) => save("quiet_text", e.target.value)}
              placeholder="For example, after 10 pm or on Wednesday afternoons"
            />
          </label>
          <p className="note">Saved locally. Background notifications are off.</p>
        </>
      )}
      <Button onClick={() => (step < 3 ? setStep(step + 1) : onComplete())}>
        {step < 3 ? "Save and continue" : "Review first impressions"}
      </Button>
      <Button
        secondary
        onClick={() => (step < 3 ? setStep(step + 1) : onComplete())}
      >
        Skip for now
      </Button>
      {step > 0 && (
        <button className="quiet" onClick={() => setStep(step - 1)}>
          ← Back
        </button>
      )}
    </section>
  );
}
