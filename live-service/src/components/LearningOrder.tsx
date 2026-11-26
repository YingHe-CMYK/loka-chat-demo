import { Button } from "./ui";
export default function LearningOrder({
  order: o,
  act,
}: {
  order: any;
  act: (type: string, payload: any) => void;
}) {
  const labels: Record<string, string> = {
    reserved: "Reserved for learning",
    learning: "Learning in progress",
    paused: "Paused",
    validation: "Awaiting independent validation",
    passed: "Verified",
    cancelled: "Canceled",
    "no-gain": "No improvement found",
    failed: "Learning failed",
  };
  const ended = ["passed", "no-gain", "cancelled"].includes(o.status);
  return (
    <article>
      <small>Learning order · sample</small>
      <h2>{labels[o.status] || "Pending"}</h2>
      <div className="learning-steps">
        <span className="done">Approve</span>
        <span
          className={
            ["validation", "passed", "no-gain"].includes(o.status) ? "done" : ""
          }
        >
          Learning
        </span>
        <span
          className={["passed", "no-gain"].includes(o.status) ? "done" : ""}
        >
          Verify
        </span>
        <span className={o.status === "passed" ? "done" : ""}>Publish</span>
      </div>
      <p>
        Spent {o.spent} QB · Reserved {o.reserved} QB · Returned {o.released} QB
      </p>
      {o.reason && <p role="status">{o.reason}</p>}
      {!ended && o.status !== "validation" && (
        <>
          <Button
            secondary
            onClick={() => act("fixture.learn", { orderId: o.id })}
          >
            Preview: complete learning
          </Button>
          {o.status !== "paused" && (
            <Button
              secondary
              onClick={() => act("learning.pause", { orderId: o.id })}
            >
              Pause learning
            </Button>
          )}
        </>
      )}
      {o.status === "validation" && (
        <>
          <p>Publish a new version only after independent validation.</p>
          <Button
            secondary
            onClick={() =>
              act("fixture.validate", { orderId: o.id, pass: true })
            }
          >
            Preview: validation passed
          </Button>
          <Button
            secondary
            onClick={() =>
              act("fixture.validate", { orderId: o.id, pass: false })
            }
          >
            Preview: no improvement
          </Button>
        </>
      )}
      {!ended && (
        <button
          className="quiet"
          onClick={() => act("learning.cancel", { orderId: o.id })}
        >
          Cancel and release unused credits
        </button>
      )}
      {o.status === "no-gain" && (
        <p>Previous capability retained. Unused credits released.</p>
      )}
      {o.status === "passed" && <p>Preview version saved to your capability profile.</p>}
    </article>
  );
}
