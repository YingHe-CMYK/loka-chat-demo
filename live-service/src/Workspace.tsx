import Welcome from "./components/Welcome";
import Execution from "./components/Execution";
import DataControls from "./components/DataControls";
import LearningOrder from "./components/LearningOrder";
import Economy from "./components/Economy";
import FirstContact from "./components/FirstContact";
import Retelling from "./components/Retelling";
import CultureInputs from "./components/CultureInputs";
import SourceDetails from "./components/SourceDetails";
import { readIdentity, establishIdentity } from "./domain/identity.mjs";
import SwipeCard from "./components/SwipeCard";
import FirstUnderstanding from "./components/FirstUnderstanding";
import MirrorCamera from "./components/MirrorCamera";
import React, { useState } from "react";
import {
  fixtureWorkspace,
  transition,
  scenarioLabels,
} from "./domain/workspace.mjs";
import { Character, Heading, Button, Row, Toggle, Icon } from "./components/ui";
export default function Workspace() {
  React.useEffect(() => {
    document.documentElement.lang = "en";
    document.title = "LokaChat · Your personal mirror";
  }, []);
  const [s, S] = useState<any>(() => {
      try {
        return (
          JSON.parse(localStorage.getItem("miro-review-v3") || "null") ||
          fixtureWorkspace()
        );
      } catch {
        return fixtureWorkspace();
      }
    }),
    [page, P] = useState(() => {
      const saved = sessionStorage.getItem("loka-review-page");
      return localStorage.getItem("miro-review-person") && saved
        ? [
            "verify",
            "register",
          ].includes(saved)
          ? "home"
          : saved
        : "judgment";
    }),
    [task, T] = useState(
      sessionStorage.getItem("loka-review-task") || "relationship",
    ),
    [cameraOpen, CameraOpen] = useState(false),
    [text, X] = useState(""),
    [name, N] = useState(localStorage.getItem("miro-name") || "Milo"),
    [error, E] = useState(""),
    [email, Email] = useState(""),
    [username, U] = useState(""),
    [sourceId, SourceId] = useState(sessionStorage.getItem("loka-review-source") || ""),
    [renaming, Renaming] = useState(sessionStorage.getItem("loka-renaming") === "true");
  const onboarding = [
    "welcome",
    "register",
    "verify",
    "mirror",
    "name",
    "understanding",
    "retelling",
  ];
  const inOnboarding = onboarding.includes(page);
  const t = s.tasks.find((x: any) => x.id === task);
  const go = (p: string) => {
    sessionStorage.setItem("loka-review-page", p);
    P(p);
    CameraOpen(false);
    E("");
    X("");
    window.scrollTo(0, 0);
  };
  const act = (type: string, payload: any = {}, next?: string) => {
    try {
      const n = transition(
        s,
        { id: crypto.randomUUID(), type, payload },
        { preview: true },
      );
      S(n);
      localStorage.setItem("miro-review-v3", JSON.stringify(n));
      E("");
      if (next) go(next);
    } catch (e) {
      E((e as Error).message);
    }
  };
  const title: any = {
    relationship: "You want to accept the invitation while protecting your research time.",
    health: "An easier way to follow your existing plan may be more useful than another plan.",
    culture: "You want to explore a choice through a cultural lens.",
  };
  return (
    <main
      className={`review page-${page} ${s.settings.reducedMotion ? "reduce-motion" : ""}`}
    >
      <div className="review-label">
        Preview · sample data and credits · no real transactions{" "}
        <button className="quiet" onClick={() => go("register")}>Try sign-in</button>
      </div>
      <header>
        <button
          className="quiet"
          onClick={() => go(inOnboarding ? "welcome" : "home")}
        >
          Loka
        </button>
        {!inOnboarding && (
          <button className="quiet" onClick={() => go("space")}>
            My space
          </button>
        )}
      </header>
      {inOnboarding && page !== "welcome" && !renaming && <nav className="onboarding-progress" aria-label="Introduction progress">{["Create account", "Meet LokaChat", "Getting to know you"].map((label,index)=>{const current=["register","verify"].includes(page)?0:["mirror","name"].includes(page)?1:2;return <div key={label} className={index===current?"current":index<current?"finished":""} aria-current={index===current?"step":undefined}><span>{index<current?"✓":`0${index+1}`}</span>{label}</div>})}</nav>}
      {!inOnboarding && page !== "home" && (
        <button className="quiet" onClick={() => go("home")}>
          ← Home
        </button>
      )}
      {page === "welcome" ? (
        <Welcome onStart={()=>go("register")} onResume={()=>go("home")} returning={!!localStorage.getItem("miro-review-person")}/>
      ) : page === "register" ? (
        <>
          <Heading tag="01 / Create account" title="Set up your identity.">
            Verify your email to meet your LokaChat.
          </Heading>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go("verify");
            }}
          >
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => Email(e.target.value)}
              />
            </label>
            <label>
              Username
              <input
                required
                minLength={2}
                maxLength={24}
                autoComplete="nickname"
                value={username}
                onChange={(e) => U(e.target.value)}
              />
            </label>
            <Button type="submit">View email verification</Button>
          </form>
          <p className="note">Preview only. No email is sent.</p>
        </>
      ) : page === "verify" ? (
        <>
          <Heading tag="02 / Email verification" title="Verify your email.">
            {email}
          </Heading>
          <label>
            Email code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter the six-digit code from your email"
            />
          </label>
          <p className="note">
            Select a sample verification result here. Live sign-in requires the email service.
          </p>
          <Button
            onClick={() => {
              try {
                const identity = establishIdentity(localStorage, {
                  username,
                  email,
                });
                localStorage.setItem(
                  "miro-review-person",
                  JSON.stringify({ id: identity.personalId, username, email }),
                );
                go("mirror");
              } catch (e) {
                E((e as Error).message);
              }
            }}
          >
            Preview: verify and assign companion
          </Button>
          <Button secondary onClick={() => E("Code expired. Request another.")}>
            Preview: code expired
          </Button>
          <Button secondary onClick={() => go("register")}>
            Change email
          </Button>
        </>
      ) : page === "mirror" ? (
        <>
          <Heading tag="Registration complete / Mirror" title="Start with where you are now.">
            Nod to continue or use the buttons. You can turn the camera off at any time.
          </Heading>
          <MirrorCamera
            onNod={() => go("name")}
            onShake={() => E("Skip the camera and use the buttons.")}
          />
          <Button secondary onClick={() => go("name")}>
            Continue to my LokaChat
          </Button>
        </>
      ) : page === "mirror-space" ? (
        <>
          <Heading tag="Mirror" title="Choose how to interact.">
            On a judgment card, nod to continue or shake your head to correct it. Try the camera here.
          </Heading>
          <MirrorCamera
            onNod={() => E("Nod detected.")}
            onShake={() => E("Head shake detected.")}
          />
          <Button secondary onClick={() => go("home")}>
            Back to current task
          </Button>
        </>
      ) : page === "name" ? (
        <>
          <Character />
          <Heading title="Give your companion a name.">
            Changing a name preserves the same identity.
          </Heading>
          <p className="note">Share a little context. You can skip any question.</p>
          <label>
            Companion name
            <input
              value={name}
              maxLength={24}
              onChange={(e) => N(e.target.value)}
            />
          </label>
          <Button
            onClick={() => {
              if (!name.trim()) {
                E("Enter a name");
                return;
              }
              localStorage.setItem("miro-name", name.trim());
              if (renaming) {
                sessionStorage.removeItem("loka-renaming");
                Renaming(false);
                go("identity");
              } else go("understanding");
            }}
          >
            {renaming ? "Save name" : "Save and continue"}
          </Button>
        </>
      ) : page === "home" ? (
        <>
          <Character />
          <button className="home-mirror" onClick={() => go("mirror-space")}>
            <Icon name="spark" size={18} /> Open mirror
          </button>
          <Heading tag="My LokaChat" title={`Welcome back, ${name}.`}>
            Start with something that matters to you.
          </Heading>
          <FirstContact onSources={() => go("sources")} />
          <details className="scenario-library">
            <summary>Explore three sample scenarios</summary>
            <p className="note">
              Explore sample relationship, health and cultural scenarios.
            </p>
            {s.tasks.map((a: any) => (
              <Row
                key={a.id}
                title={(scenarioLabels as any)[a.kind]}
                subtitle={
                  a.status === "complete"
                    ? "Result saved for editing and review"
                    : a.correction || "A thought to check with you"
                }
                onClick={() => {
                  T(a.id);
                  sessionStorage.setItem("loka-review-task", a.id);
                  go(a.status === "complete" ? "result" : ["executing", "paused"].includes(a.status) ? "execution" : "judgment");
                }}
              />
            ))}
          </details>
          <Row
            title="Tell your companion more"
            subtitle="Manage data and permissions"
            onClick={() => go("sources")}
          />
        </>
      ) : page === "understanding" ? (
        <FirstUnderstanding onComplete={() => go("retelling")} />
      ) : page === "retelling" ? (
        <Retelling
          onConfirm={() => go("sources")}
          onEdit={() => go("understanding")}
        />
      ) : page === "source-detail" ? (
        <SourceDetails
          source={s.sources.find((a: any) => a.id === sourceId)}
          act={act}
          onBack={() => go(sessionStorage.getItem("loka-source-return") || "sources")}
        />
      ) : page === "sources" ? (
        <>
          <Heading title="Introduce yourself.">
            Choose how each source is used. Connecting one leaves you on this page.
          </Heading>
          {s.sources.map((a: any) => (
            <article key={a.id}>
              <h2>{a.name}</h2>
              <small>
                {a.account} · {a.connected ? "Connected" : "Disconnected"}
              </small>
              <p>{a.records.length}  saved records</p>
              <Button
                secondary
                onClick={() => {
                  SourceId(a.id);
                  sessionStorage.setItem("loka-review-source", a.id);
                  sessionStorage.setItem("loka-source-return", page);
                  go("source-detail");
                }}
              >
                View content and source
              </Button>
              <Toggle
                label="Use for this judgment"
                value={a.inference}
                onChange={() =>
                  act("source.permissions", {
                    sourceId: a.id,
                    inference: !a.inference,
                    training: a.training,
                  })
                }
              />
              <Toggle
                label="Allow ongoing learning"
                value={a.training}
                onChange={() =>
                  act("source.permissions", {
                    sourceId: a.id,
                    inference: a.inference,
                    training: !a.training,
                  })
                }
              />
              <button
                className="quiet"
                onClick={() => act("source.disconnect", { sourceId: a.id })}
              >
                Disconnect source
              </button>
              <button
                className="quiet"
                onClick={() => act("source.delete", { sourceId: a.id })}
              >
                Delete data
              </button>
            </article>
          ))}
          <label>
            Add an experience
            <textarea value={text} onChange={(e) => X(e.target.value)} />
          </label>
          <Button
            secondary
            onClick={() =>
              act("source.add", {
                name: "My notes",
                text,
                inference: true,
                training: false,
              })
            }
          >
            Save experience
          </Button>
          <Button onClick={() => go("home")}>Finish and return to LokaChat</Button>
        </>
      ) : page === "judgment" && t ? (
        <>
          <Heading
            tag={`Reflection ${t.version} · Sample`}
            title={t.kind === "relationship" ? "Collaboration invitation" : scenarioLabels[t.kind as keyof typeof scenarioLabels]}
          />
          <SwipeCard
            onLeft={() => go("correction")}
            onRight={() =>
              act("task.feedback", { taskId: task, value: "continue" }, "plan")
            }
          >
            <small className="card-kicker">A thought to check with you</small>
            <h2>{t.correction || title[t.kind]}</h2>
            <p>{t.correction ? "Updated after your correction" : t.constraint}</p>
            <details>
              <summary>View evidence</summary>
              {s.sources
                .filter((a: any) => t.sourceIds.includes(a.id))
                .map((a: any) => (
                  <div className="evidence-record" key={a.id}>
                    <small>Source record · {a.account}</small>
                    <p>
                      {a.records[0]?.text || "Record removed. Review the evidence."}
                    </p>
                    <button
                      className="evidence-link"
                      onClick={() => {
                        SourceId(a.id);
                  sessionStorage.setItem("loka-review-source", a.id);
                  sessionStorage.setItem("loka-source-return", page);
                        go("source-detail");
                      }}
                    >
                      {a.name} · View original record →
                    </button>
                  </div>
                ))}
              <p>Sample reflections are hypotheses, not verified facts.</p>
            </details>
          </SwipeCard>
          <p className="gesture-hint">Swipe left to correct or right to continue, or use the buttons.</p>
          <div className="actions">
            <Button secondary onClick={() => go("correction")}>
              ← Not quite
            </Button>
            <Button
              onClick={() =>
                act(
                  "task.feedback",
                  { taskId: task, value: "continue" },
                  "plan",
                )
              }
            >
              View plan →
            </Button>
          </div>
          <div className="optional-mirror">
            <button className="mirror-toggle" aria-expanded={cameraOpen} onClick={()=>CameraOpen(!cameraOpen)}><Icon name="person" size={18}/>{cameraOpen ? "Close mirror and stop camera" : "Respond with the mirror"}<span>{cameraOpen ? "−" : "+"}</span></button>
            {cameraOpen && <div className="mirror-expanded">
          <MirrorCamera
            onNod={() =>
              act("task.feedback", { taskId: task, value: "continue" }, "plan")
            }
            onShake={() => go("correction")}
          />
            </div>}
          </div>
          <button
            className="quiet"
            onClick={() =>
              act("task.feedback", { taskId: task, value: "later" }, "home")
            }
          >
            Not now
          </button>
          <button
            className="quiet"
            onClick={() =>
              act(
                "task.feedback",
                { taskId: task, value: "irrelevant" },
                "home",
              )
            }
          >
            Not relevant
          </button>
          {t.previous && (
            <button
              className="quiet"
              onClick={() => act("task.undo", { taskId: task })}
            >
              Undo last feedback
            </button>
          )}
        </>
      ) : page === "correction" ? (
        <>
          <Heading title="What did I misunderstand?">
            Your correction will change the next plan.
          </Heading>
          {(task === "health" ? ["The original arrangement changed", "Adjust the schedule instead of adding tasks.", "This health record is incomplete"] : task === "culture" ? ["Birth details need correction", "I want to explore something else", "This interpretation does not match my experience"] : ["Time is not the issue. I want to avoid a long-term commitment.", "I want to understand their goals first", "This source is out of date"]).map((a) => (
            <Button secondary key={a} onClick={() => X(a)}>
              {a}
            </Button>
          ))}
          <textarea
            aria-label="Correction"
            value={text}
            onChange={(e) => X(e.target.value)}
          />
          <Button
            onClick={() =>
              act(
                "task.feedback",
                { taskId: task, value: "correct", text },
                "judgment",
              )
            }
          >
            Save and revise
          </Button>
        </>
      ) : page === "plan" && t ? (
        <>
          <Heading title="Turn this understanding into a plan." />
          <article>
            <h2>{(scenarioLabels as any)[t.kind]}Plan</h2>
            <p>{t.constraint}</p>
            <p>
              Includes an editable result, evidence and follow-up. Nothing is sent or changed externally.
            </p>
          </article>
          <label>
            Adjust constraints
            <textarea
              value={text}
              placeholder={t.constraint}
              onChange={(e) => X(e.target.value)}
            />
          </label>
          <Button
            secondary
            onClick={() => act("task.constraint", { taskId: task, text })}
          >
            Save constraints
          </Button>
          <Button
            onClick={() => act("fixture.quote", { taskId: task }, "confirm")}
          >
            Review scope and fees
          </Button>
        </>
      ) : page === "confirm" && t ? (
        <>
          <Heading title="Confirm this service." />
          <article>
            <h2>3 QB</h2>
            <p>Sample order · version {t.version}</p>
            <p>{t.constraint}</p>
            <p>
              Delivery: editable draft and sources. No external sending. Changes require a new quote.
            </p>
          </article>
          <Button
            onClick={() => act("fixture.progress", { taskId: task,step:0 }, "execution")}
          >
            Confirm scope and start
          </Button>
          <Button secondary onClick={() => go("plan")}>
            Back to edit
          </Button>
        </>
      ) : page === "execution" && t ? (<Execution task={t} act={act} onBack={()=>go("plan")}/>) : page === "result" && t ? (
        <>
          <Heading
            tag={(scenarioLabels as any)[t.kind]}
            title="Let’s stop here."
          />
          <article>
            <p>
              {t.needsRecompute
                ? "The previous result is out of date. Review the updated details."
                : t.result || "No result yet. Confirm a plan first."}
            </p>
            {t.kind === "health" &&
              ["Record an existing arrangement", "Complete today’s record", "Prepare questions for your next review"].map((a) => (
                <Toggle
                  key={a}
                  label={a}
                  value={t.checks.includes(a)}
                  onChange={() =>
                    act("result.check", { taskId: task, itemId: a })
                  }
                />
              ))}
          </article>
          {t.kind === "culture" && (
            <CultureInputs
              task={t}
              onSave={(data) => act("result.birth", { taskId: task, ...data })}
            />
          )}
          <label>
            Edit result
            <textarea
              value={text}
              placeholder={t.result}
              onChange={(e) => X(e.target.value)}
            />
          </label>
          <Button
            secondary
            onClick={() => act("result.save", { taskId: task, text })}
          >
            Save changes
          </Button>
          {t.kind === "relationship" && t.result && (
            <Button
              secondary
              onClick={() => {
                navigator.clipboard
                  .writeText(t.result)
                  .then(() => E("Draft copied. Review it before sending."))
                  .catch(() => E("Copy failed. Select the text and copy it manually."));
              }}
            >
              Copy conversation draft
            </Button>
          )}
          <Button onClick={() => go("review")}>Record the outcome</Button>
        </>
      ) : page === "review" ? (
        <>
          <Heading title="Did it actually help?">
            Agreement and actual outcomes are recorded separately.
          </Heading>
          {[
            ["useful", "Helpful"],
            ["not-useful", "Not helpful"],
            ["unknown", "Not sure yet"],
          ].map(([value, label]) => (
            <Button
              key={value}
              secondary
              onClick={() =>
                act("result.review", { taskId: task, value }, "history")
              }
            >
              {label}
            </Button>
          ))}
        </>
      ) : page === "growth" ? (
        <>
          <Heading title="See how your companion grows." />
          <Row
            title="Learn a new skill"
            subtitle="Review the purpose before setting a budget"
            onClick={() => go("learning")}
          />
          <Row
            title="Capabilities and versions"
            subtitle={`${s.abilities.length}  preview capability records`}
            onClick={() => go("abilities")}
          />
          <Row
            title="Shared experiences"
            subtitle="Corrections, actions and later outcomes"
            onClick={() => go("history")}
          />
          {s.orders
            .filter((a: any) => a.type === "learning")
            .map((a: any) => (
              <LearningOrder key={a.id} order={a} act={act} />
            ))}
        </>
      ) : page === "learning" ? (
        <>
          <Heading title="Help me understand your boundaries." />
          <article>
            <h2>Identify time commitments in a collaboration</h2>
            <p>Sources: experiences approved for training and a background teacher.</p>
            <p>Compare the original and revised constraints using independent material. Publish only if improved.</p>
            <p>Learning and validation budget: up to 8 QB. Improvement requires validation.</p>
          </article>
          <Button
            onClick={() => act("learning.reserve", { amount: 8 }, "growth")}
          >
            Approve and reserve 8 QB
          </Button>
          <Button secondary onClick={() => go("sources")}>
            Check training permission
          </Button>
          <Button secondary onClick={() => go("home")}>
            Defer spending
          </Button>
        </>
      ) : page === "abilities" ? (
        <>
          <Heading title="What should I learn and remember?" />
          {s.abilities.length === 0 ? (
            <p>No validated capabilities yet.</p>
          ) : (
            s.abilities.map((a: any) => (
              <article key={a.id}>
                <h2>{a.name}</h2>
                <p>
                  Version {a.version} · {a.active ? "In use" : "Version history"} ·
                  Preview verification record
                </p>
                <Button
                  secondary
                  onClick={() => act("ability.rollback", { abilityId: a.id })}
                >
                  Use this version
                </Button>
              </article>
            ))
          )}
        </>
      ) : page === "economy" ? (
        <Economy state={s} />
      ) : page === "identity" ? (
        <>
          <Heading tag="My identity" title="Names can change. Our shared history stays." />
          <article>
            <h2>Personal identity</h2>
            <p>{readIdentity(localStorage)?.username || "Not registered"}</p>
            <p className="address">
              {readIdentity(localStorage)?.personalId || "No personal ID yet"}
            </p>
          </article>
          <article>
            <h2>{name}</h2>
            <p className="address">
              {readIdentity(localStorage)?.aiId || "No AI ID yet"}
            </p>
            <p>
              Introduction: 
              {readIdentity(localStorage)?.bornAt
                ? new Date(
                    readIdentity(localStorage).bornAt,
                  ).toLocaleDateString("en-US")
                : "Not created"}
            </p>
            <Button
              secondary
              onClick={() => {
                Renaming(true);
                sessionStorage.setItem("loka-renaming", "true");
                go("name");
              }}
            >
              Rename companion
            </Button>
          </article>
          <p className="note">
            These local preview IDs cannot be used to sign in or receive funds.
          </p>
        </>
      ) : page === "history" ? (
        <>
          <Heading title="Our shared history" />
          {s.history.map((a: any) => (
            <article key={a.id}>
              <small>
                {a.type} · {new Date(a.at).toLocaleString("en-US")}
              </small>
              <p>{a.text}</p>
              {a.taskId && (
                <button
                  className="quiet"
                  onClick={() => {
                    T(a.taskId);
                    go("result");
                  }}
                >
                  Open original task
                </button>
              )}
            </article>
          ))}
        </>
      ) : (
        <>
          <Heading title="My space" />
          <Row
            title="Wallet and economy"
            subtitle="Wallet, QB orders and capability records"
            onClick={() => go("economy")}
          />
          <Row
            title="Your identity and AI identity"
            subtitle="Identity stays the same when names change"
            onClick={() => go("identity")}
          />
          <Row
            title="Name your companion"
            subtitle={name}
            onClick={() => {
              Renaming(true);
                sessionStorage.setItem("loka-renaming", "true");
              go("name");
            }}
          />
          <Row title="Sources and permissions" onClick={() => go("sources")} />
          <article>
            <h2>Learning budget</h2>
            <p>Preview balance {s.balance} QB</p>
            <label>
              Limit per order
              <input
                type="number"
                value={s.settings.budget}
                onChange={(e) =>
                  act("settings.save", {
                    ...s.settings,
                    budget: Number(e.target.value),
                  })
                }
              />
            </label>
            <Toggle
              label="Allow automatic continuation"
              value={s.settings.autoContinue}
              onChange={() =>
                act("settings.save", {
                  ...s.settings,
                  autoContinue: !s.settings.autoContinue,
                })
              }
            />
            <Toggle
              label="Reduce motion"
              value={s.settings.reducedMotion}
              onChange={() =>
                act("settings.save", {
                  ...s.settings,
                  reducedMotion: !s.settings.reducedMotion,
                })
              }
            />
          </article>
          <DataControls/>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!inOnboarding && (
        <nav className="bottom-nav">
          {[
            ["home", "My LokaChat"],
            ["growth", "Growth"],
            ["space", "My space"],
          ].map(([p, label]) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => go(p)}
            >
              <Icon
                name={
                  p === "home" ? "home" : p === "growth" ? "growth" : "person"
                }
              />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}
