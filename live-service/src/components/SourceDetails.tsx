import { useState } from "react";
import { Heading, Button, Toggle } from "./ui";
export default function SourceDetails({
  source,
  act,
  onBack,
}: {
  source: any;
  act: (type: string, payload: any) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [text, setText] = useState(""),
    [remove, setRemove] = useState<string | null>(null);
  if (!source)
    return (
      <>
        <Heading title="This source was removed." />
        <Button onClick={onBack}>Back to sources</Button>
      </>
    );
  return (
    <>
      <Heading tag="Source details" title={source.name}>
        {source.account} ·{" "}
        {source.connected ? "Connected" : "Disconnected. History retained."}
      </Heading>
      <article>
        <h2>Access and use</h2>
        <p>Only the listed records are used. No other files are accessed or external data written.</p>
        <p className="note">
          Last updated: {new Date(source.updatedAt).toLocaleString("en-US")}
        </p>
        <Toggle
          label="Use for this judgment"
          value={source.inference}
          onChange={() =>
            act("source.permissions", {
              sourceId: source.id,
              inference: !source.inference,
              training: source.training,
            })
          }
        />
        <Toggle
          label="Allow ongoing learning"
          note="Independent of judgment permission"
          value={source.training}
          onChange={() =>
            act("source.permissions", {
              sourceId: source.id,
              inference: source.inference,
              training: !source.training,
            })
          }
        />
      </article>
      <h2>Saved records · {source.records.length}</h2>
      {source.records.length === 0 && <p>No saved records.</p>}
      {source.records.map((record: any) => (
        <article key={record.id}>
          <small>{new Date(record.observedAt).toLocaleString("en-US")}</small>
          {editing === record.id ? (
            <>
              <label>
                Correct record
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <Button
                onClick={() => {
                  if (!text.trim()) return;
                  act("source.record.edit", {
                    sourceId: source.id,
                    recordId: record.id,
                    text,
                  });
                  setEditing(null);
                }}
              >
                Save correction
              </Button>
              <Button secondary onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <p>{record.text}</p>
              <button
                className="quiet"
                onClick={() => {
                  setEditing(record.id);
                  setText(record.text);
                }}
              >
                Correction
              </button>
              <button className="quiet" onClick={() => setRemove(record.id)}>
                Remove this record
              </button>
            </>
          )}
          {remove === record.id && (
            <div role="alert">
              <p>Related judgments will need review if you remove this source.</p>
              <Button
                onClick={() => {
                  act("source.record.delete", {
                    sourceId: source.id,
                    recordId: record.id,
                  });
                  setRemove(null);
                }}
              >
                Confirm removal of this record
              </Button>
              <Button secondary onClick={() => setRemove(null)}>
                Keep record
              </Button>
            </div>
          )}
        </article>
      ))}
      {source.connected && (
        <Button
          secondary
          onClick={() => act("source.disconnect", { sourceId: source.id })}
        >
          Disconnect and retain records
        </Button>
      )}
      <Button secondary onClick={onBack}>
        Back to source settings
      </Button>
    </>
  );
}
