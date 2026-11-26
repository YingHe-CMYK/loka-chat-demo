// Shared domain transitions. Production never accepts fixture/settlement commands.
export const scenarioLabels = {
  relationship: "Relationships and collaboration",
  health: "Health routines",
  culture: "Cultural exploration",
};
export const initialWorkspace = () => ({
  revision: 0,
  settings: {
    budget: 30,
    autoContinue: false,
    reducedMotion: false,
    voice: "Gentle",
    avatar: "lavender",
  },
  sources: [],
  tasks: [],
  history: [],
  orders: [],
  abilities: [],
  balance: 0,
  processed: [],
});
export function fixtureWorkspace() {
  const s = initialWorkspace();
  s.balance = 100;
  s.sources = [
    {
      id: "calendar",
      name: "Calendar and schedule",
      account: "Sample",
      connected: true,
      inference: true,
      training: false,
      updatedAt: "2026-11-05T01:00:00Z",
      records: [
        {
          id: "r1",
          text: "Friday already has three meetings. The invitation proposes another weekly discussion.",
          observedAt: "2026-11-04T09:00:00Z",
        },
      ],
    },
    {
      id: "notes",
      name: "Personal notes",
      account: "Sample",
      connected: true,
      inference: true,
      training: false,
      updatedAt: "2026-11-05T01:00:00Z",
      records: [
        {
          id: "r2",
          text: "Keep research time free, follow an existing health schedule, and explore cultural interpretations of birth details.",
          observedAt: "2026-11-04T09:00:00Z",
        },
      ],
    },
  ];
  s.tasks = Object.keys(scenarioLabels).map((kind, i) => ({
    id: kind,
    kind,
    version: 1,
    status: "judgment",
    sourceIds: kind === "relationship" ? ["calendar", "notes"] : ["notes"],
    feedback: null,
    correction: "",
    constraint:
      kind === "relationship"
        ? "Up to two hours per week"
        : kind === "health"
          ? "Follow existing professional guidance without changing treatment"
          : "Check birth time and time zone",
    quote: null,
    result: "",
    resultVersion: 0,
    checks: [],
    outcome: null,
    reviewAt: "",
    birth: { date: "", time: "", zone: "Asia/Shanghai" },
    needsRecompute: false,
  }));
  return s;
}
const clean = (v, max = 3000) => {
  if (typeof v !== "string" || v.length > max)
    throw Error("Invalid content or text too long");
  return v.trim();
};
function taskOf(s, id) {
  const t = s.tasks.find((x) => x.id === id);
  if (!t) throw Error("Item not found");
  return t;
}
const event = (s, type, text, taskId, now) =>
  s.history.unshift({ id: crypto.randomUUID(), type, text, taskId, at: now });
export function transition(
  current,
  command,
  { preview = false, now = new Date().toISOString() } = {},
) {
  if (!command || typeof command.id !== "string" || command.id.length > 100)
    throw Error("Missing request ID");
  if (current.processed.includes(command.id)) return current;
  const s = structuredClone(current),
    p = command.payload || {},
    kind = command.type;
  const restricted = [
    "fixture.connect",
    "fixture.quote",
    "fixture.execute",
    "fixture.learn",
    "fixture.validate",
    "learning.reserve",
    "learning.cancel",
    "ability.rollback",
  ];
  if (!preview && restricted.includes(kind))
    throw Error("SERVICE_NOT_CONNECTED");
  if (kind === "settings.save") {
    const budget = Number(p.budget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 10000)
      throw Error("Budget must be between 0–10000 QB  apart");
    s.settings = {
      ...s.settings,
      budget,
      autoContinue: p.autoContinue === true,
      reducedMotion: p.reducedMotion === true,
      voice: ["Gentle", "Clear"].includes(p.voice) ? p.voice : s.settings.voice,
      avatar: ["lavender", "sage", "peach"].includes(p.avatar)
        ? p.avatar
        : s.settings.avatar,
    };
    if (!s.settings.autoContinue)
      s.orders.forEach((o) => {
        if (o.status === "learning") o.status = "paused";
      });
    event(s, "control", "Update learning budget and preferences", null, now);
  } else if (kind === "source.add") {
    const name = clean(p.name, 80),
      text = clean(p.text, 10000);
    if (!name || !text) throw Error("Enter a source and content");
    const id = "source_" + crypto.randomUUID();
    s.sources.push({
      id,
      name,
      account: "Added by you",
      connected: true,
      inference: p.inference === true,
      training: p.training === true,
      updatedAt: now,
      records: [{ id: crypto.randomUUID(), text, observedAt: now }],
    });
    event(s, "memory", "Add a personal experience", null, now);
  } else if (kind === "fixture.connect") {
    if (!s.sources.some((x) => x.id === p.sourceId))
      s.sources.push({
        id: p.sourceId,
        name: p.name,
        account: "Sample",
        connected: true,
        inference: true,
        training: false,
        updatedAt: now,
        records: [
          {
            id: crypto.randomUUID(),
            text: "Sample content for reviewing permissions.",
            observedAt: now,
          },
        ],
      });
    else s.sources.find((x) => x.id === p.sourceId).connected = true;
  } else if (
    [
      "source.permissions",
      "source.disconnect",
      "source.delete",
      "source.record.delete",
      "source.record.edit",
    ].includes(kind)
  ) {
    const source = s.sources.find((x) => x.id === p.sourceId);
    if (!source) throw Error("Source not found");
    if (kind === "source.permissions") {
      source.inference = p.inference === true;
      source.training = p.training === true;
    }
    if (kind === "source.disconnect") source.connected = false;
    if (kind === "source.record.edit") {
      const record = source.records.find((x) => x.id === p.recordId);
      if (!record) throw Error("Record not found");
      const text = clean(p.text, 10000);
      if (!text) throw Error("Enter some text");
      record.text = text;
      source.updatedAt = now;
    }
    if (kind === "source.record.delete")
      source.records = source.records.filter((x) => x.id !== p.recordId);
    if (kind === "source.delete")
      s.sources = s.sources.filter((x) => x.id !== p.sourceId);
    if (
      kind !== "source.permissions" ||
      !source.connected ||
      !source.inference
    ) {
      s.tasks
        .filter((t) => t.sourceIds.includes(p.sourceId))
        .forEach((t) => {
          t.status = "blocked";
          t.quote = null;
        });
    }
    if (
      !source.training ||
      kind === "source.disconnect" ||
      kind === "source.delete"
    )
      s.orders
        .filter((o) => ["learning", "reserved", "paused"].includes(o.status))
        .forEach((o) => {
          o.status = "paused";
          o.reason = "Source permissions changed. Review required";
        });
    event(
      s,
      "control",
      kind === "source.disconnect"
        ? "Disconnect and keep history"
        : kind === "source.delete"
          ? "Delete source and records"
          : "Source permissions changed. Review related tasks.",
      null,
      now,
    );
  } else if (kind === "data.delete") {
    s.sources = [];
    s.tasks = [];
    s.history = [];
    s.abilities = [];
    s.orders.forEach((o) => {
      if (o.reserved > 0) {
        s.balance += o.reserved;
        o.released = (o.released || 0) + o.reserved;
        o.reserved = 0;
      }
      o.status = "cancelled";
    });
    event(s, "control", "Experiences and tasks removed. Account and order records retained.", null, now);
  } else if (kind === "task.feedback") {
    const t = taskOf(s, p.taskId);
    if (t.status === "blocked") throw Error("Source permission revoked. Review required");
    if (!["continue", "correct", "later", "irrelevant"].includes(p.value))
      throw Error("Invalid feedback");
    t.previous = {
      feedback: t.feedback,
      status: t.status,
      correction: t.correction,
      version: t.version,
      constraint: t.constraint,
    };
    t.feedback = p.value;
    t.correction = clean(p.text || "");
    t.version++;
    t.quote = null;
    if (p.value === "correct") {
      if (!t.correction) throw Error("Explain which condition needs correcting");
      t.constraint = t.correction;
      t.status = "judgment";
    } else
      t.status =
        p.value === "continue"
          ? "plan"
          : p.value === "later"
            ? "deferred"
            : "stopped";
    event(
      s,
      "understanding",
      p.value === "correct"
        ? "Your revised condition: " + t.correction
        : p.value === "continue"
          ? "You chose to keep exploring"
          : p.value === "later"
            ? "Keep for later"
            : "You marked this as unrelated",
      t.id,
      now,
    );
  } else if (kind === "task.undo") {
    const t = taskOf(s, p.taskId);
    if (!t.previous) throw Error("No feedback to undo");
    const previous = t.previous;
    Object.assign(t, previous);
    delete t.previous;
    t.quote = null;
    event(s, "understanding", "Undo recent feedback", t.id, now);
  } else if (kind === "task.resume") {
    const t = taskOf(s, p.taskId);
    if (
      t.sourceIds.some(
        (id) =>
          !s.sources.some((x) => x.id === id && x.connected && x.inference),
      )
    )
      throw Error("Restore permission to use this source for judgment.");
    t.status = "judgment";
  } else if (kind === "task.constraint") {
    const t = taskOf(s, p.taskId);
    t.constraint = clean(p.text);
    if (!t.constraint) throw Error("Enter a constraint");
    t.version++;
    t.quote = null;
    t.status = "plan";
  } else if (kind === "fixture.quote") {
    const t = taskOf(s, p.taskId);
    if (t.status === "blocked") throw Error("Source access withdrawn");
    t.quote = {
      id: crypto.randomUUID(),
      version: t.version,
      amount: 3,
      expiresAt: new Date(Date.parse(now) + 600000).toISOString(),
    };
  } else if (kind === "fixture.progress") {
    const t=taskOf(s,p.taskId);
    if(!t.quote||t.quote.version!==t.version||Date.parse(t.quote.expiresAt)<Date.parse(now))throw Error("Quote expired. Return to the plan for a new quote.");
    if(t.status==='blocked')throw Error("Source withdrawn. Review required");
    if(!Number.isInteger(p.step)||p.step<0||p.step>2)throw Error("Invalid step");
    t.executionStep=p.step;t.status='executing';
  } else if (kind === "fixture.execute") {
    const t = taskOf(s, p.taskId);
    if (t.status === "complete") return current;
    if (
      !t.quote ||
      t.quote.version !== t.version ||
      Date.parse(t.quote.expiresAt) < Date.parse(now)
    )
      throw Error("Quote expired. Recalculate it.");
    if (
      t.sourceIds.some(
        (id) =>
          !s.sources.some((x) => x.id === id && x.connected && x.inference),
      )
    )
      throw Error("Source permission revoked");
    if (s.balance < t.quote.amount) throw Error("QB Insufficient balance");
    if (s.settings.budget < t.quote.amount) throw Error("Exceeds the per-order budget");
    s.balance -= t.quote.amount;
    s.orders.push({
      id: t.quote.id,
      type: "service",
      taskId: t.id,
      amount: t.quote.amount,
      reserved: 0,
      spent: t.quote.amount,
      released: 0,
      status: "complete",
      createdAt: now,
    });
    t.status = "complete";
    t.resultVersion = t.version;
    t.result =
      t.kind === "relationship"
        ? `Thanks for the invitation. I’d like to explore this, but first let’s agree on a limit: ${t.constraint}. Let’s start with a short discussion before making further plans.`
        : t.kind === "health"
          ? "Follow your existing care plan. Note any missed steps for your next review. Do not change treatment yourself."
          : "This record captures your reflections. Cultural calculations are offline, so no chart or forecast is produced.";
    event(s, "delivery", "Generate editable result (sample)", t.id, now);
  } else if (kind === "task.stop") {
    const t = taskOf(s, p.taskId);
    t.status = p.pause ? "paused" : "stopped";
    event(s, "control", p.pause ? "Pause task" : "Stop task", t.id, now);
  } else if (kind === "result.save") {
    const t = taskOf(s, p.taskId);
    t.result = clean(p.text, 10000);
    event(s, "memory", "Save edited result", t.id, now);
  } else if (kind === "result.check") {
    const t = taskOf(s, p.taskId);
    const id = clean(p.itemId, 80);
    t.checks = t.checks.includes(id)
      ? t.checks.filter((x) => x !== id)
      : [...t.checks, id];
  } else if (kind === "result.birth") {
    const t = taskOf(s, p.taskId);
    t.birth = {
      date: clean(p.date, 30),
      time: clean(p.time, 30),
      zone: clean(p.zone, 60),
    };
    t.needsRecompute = true;
    t.version++;
    t.quote = null;
    event(s, "memory", "Birth details changed. The previous result is out of date.", t.id, now);
  } else if (kind === "result.review") {
    const t = taskOf(s, p.taskId);
    if (!["useful", "not-useful", "unknown"].includes(p.value))
      throw Error("Invalid feedback");
    t.outcome = p.value;
    t.reviewAt = clean(p.date || "", 30);
    event(
      s,
      "outcome",
      "Outcome: " +
        { useful: "Helpful", "not-useful": "Not helpful", unknown: "Not sure yet" }[
          p.value
        ],
      t.id,
      now,
    );
  } else if (kind === "learning.reserve") {
    if (
      s.orders.some(
        (o) =>
          o.type === "learning" &&
          !["cancelled", "failed", "passed", "no-gain"].includes(o.status),
      )
    )
      throw Error("Another learning order is in progress");
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount < 8 || amount > s.settings.budget)
      throw Error("Budget is below the required amount or above the limit");
    if (s.balance < amount) throw Error("QB Insufficient balance");
    if (!s.sources.some((x) => x.connected && x.training))
      throw Error("Allow training on at least one source first");
    s.balance -= amount;
    s.orders.push({
      id: crypto.randomUUID(),
      type: "learning",
      amount,
      reserved: amount,
      spent: 0,
      released: 0,
      status: "reserved",
      createdAt: now,
    });
    event(s, "learning", "Approve learning and reserve credits", null, now);
  } else if (
    [
      "fixture.learn",
      "fixture.validate",
      "learning.cancel",
      "learning.pause",
    ].includes(kind)
  ) {
    const o = s.orders.find((x) => x.id === p.orderId);
    if (!o || o.type !== "learning") throw Error("Learning order not found");
    if (["passed", "no-gain", "cancelled"].includes(o.status))
      throw Error("This order has ended");
    if (kind === "learning.pause") {
      o.status = "paused";
    }
    if (kind === "learning.cancel") {
      s.balance += o.reserved;
      o.released += o.reserved;
      o.reserved = 0;
      o.status = "cancelled";
    }
    if (kind === "fixture.learn") {
      if (!s.sources.some((x) => x.connected && x.training))
        throw Error("Training permission required");
      if (!["reserved", "paused", "learning", "failed"].includes(o.status))
        throw Error("Unavailable in this state");
      o.status = "validation";
      const spent = Math.min(6, o.reserved);
      o.spent += spent;
      o.reserved -= spent;
    }
    if (kind === "fixture.validate") {
      if (o.status !== "validation") throw Error("Learning is incomplete");
      o.status = p.pass ? "passed" : "no-gain";
      s.balance += o.reserved;
      o.released += o.reserved;
      o.reserved = 0;
      if (p.pass) {
        s.abilities.forEach((x) => (x.active = false));
        s.abilities.push({
          id: crypto.randomUUID(),
          version: s.abilities.length + 1,
          active: true,
          name: "Identify collaboration time limits",
          verifiedAt: now,
          orderId: o.id,
        });
      }
      event(
        s,
        "ability",
        p.pass
          ? "Validation passed. Candidate version published."
          : "No improvement. Previous version retained.",
        null,
        now,
      );
    }
  } else if (kind === "ability.rollback") {
    if (!s.abilities.some((a) => a.id === p.abilityId))
      throw Error("Version not found");
    s.abilities.forEach((a) => (a.active = a.id === p.abilityId));
    s.tasks.forEach((t) => {
      t.quote = null;
      t.version++;
    });
    event(s, "ability", "Previous capability restored. New tasks need a fresh plan.", null, now);
  } else throw Error("Unsupported action");
  s.processed = [...s.processed, command.id].slice(-500);
  s.revision++;
  return s;
}
