import { useState } from "react";
import { Button } from "./ui";
export default function CultureInputs({
  task,
  onSave,
}: {
  task: any;
  onSave: (data: any) => void;
}) {
  const [date, D] = useState(task.birth?.date || ""),
    [time, T] = useState(task.birth?.time || ""),
    [zone, Z] = useState(task.birth?.zone || "Asia/Shanghai"),
    [error, E] = useState("");
  return (
    <article>
      <h2>Review birth details</h2>
      <p>Input data, calculations and interpretations are stored separately.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
            if (!date) throw Error("Enter a date");
            onSave({ date, time, zone });
            E("");
          } catch {
            E("Check the date and time zone. For example, Asia/Shanghai. ");
          }
        }}
      >
        <label>
          Birth date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => D(e.target.value)}
          />
        </label>
        <label>
          Birth time (optional)
          <input type="time" value={time} onChange={(e) => T(e.target.value)} />
        </label>
        <label>
          Time zone
          <input required value={zone} onChange={(e) => Z(e.target.value)} />
        </label>
        <Button type="submit">Save and review details</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {task.needsRecompute && (
        <p role="status">Source updated. Previous result is out of date and needs recalculation.</p>
      )}
      <p className="note">
        Calculation service offline. No Four Pillars chart or forecast is generated. Cultural interpretations are not factual predictions.
      </p>
    </article>
  );
}
