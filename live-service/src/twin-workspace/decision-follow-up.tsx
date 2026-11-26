import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalibrationEvidence } from './calibration-evidence.ts';
import { prepareLocalCalibration, type CalibrationCheck } from './local-decision-model.ts';

const moments = [
  { label: 'Price rises', detail: 'The price moves up. The information you used hasn’t changed.' },
  { label: 'Pullback', detail: 'The price pulls back. The information is still the same.' },
  { label: 'Stay out', detail: 'You let both moments go by without buying.' },
];

function ReplayPath({ point, revealTwin = false }: { point: number; revealTwin?: boolean }) {
  return <div className="twin-replay-path" data-point={point} aria-hidden="true">
    <svg viewBox="0 0 320 72" preserveAspectRatio="none" focusable="false">
      <path d="M2 61 C28 60 36 20 68 16 S120 23 152 50 S219 57 278 46 L318 42" />
    </svg>
    {point !== 2 && <span className="twin-replay-user-mark" />}
    {revealTwin && <span className="twin-replay-twin-mark" />}
  </div>;
}

function CalibrationReplay({ point, chosen, onMove, onChoose }: {
  point: number;
  chosen?: number;
  onMove: (point: number) => void;
  onChoose: (matched: number) => void;
}) {
  return <div className="twin-calibration-replay">
    <small>Hypothetical replay</small>
    <div className="twin-replay-interactive">
      <ReplayPath point={point} revealTwin={chosen !== undefined} />
      {chosen === undefined && moments.slice(0, 2).map((moment, index) =>
        <button key={moment.label} type="button" className="twin-replay-target"
          aria-label={`Select ${moment.label.toLowerCase()}`} aria-pressed={point === index}
          data-moment={index} onClick={() => onMove(index)} />)}
    </div>
    {chosen === undefined && <label className="twin-replay-scrubber">
      <span>When would you buy?</span>
      <input type="range" min={0} max={2} step={1} value={point} disabled={chosen !== undefined}
        aria-valuetext={moments[point].label} onChange={event => onMove(event.currentTarget.valueAsNumber)} />
    </label>}
    <div className="twin-replay-ticks">
      {moments.map((moment, index) => index === 2 && chosen === undefined
        ? <button key={moment.label} type="button" className="twin-change-source"
            aria-pressed={point === index} onClick={() => onMove(index)}>{moment.label}</button>
        : <span key={moment.label} aria-hidden="true">{moment.label}</span>)}
    </div>
    {chosen === undefined && <p><strong>{moments[point].label}</strong> · {moments[point].detail}</p>}
    {chosen !== undefined && <p className="twin-replay-result-label">Twin marked the pullback. You marked {point === 2 ? 'no entry' : moments[point].label.toLowerCase()}.</p>}
    {chosen === undefined && <button type="button" onClick={() => onChoose(point === 1 ? 0 : 1)}>
      {point === 2 ? 'Mark no entry' : 'Mark my entry'} ↗
    </button>}
  </div>;
}

function prepareCheck(basis: string, prediction: string): (CalibrationCheck & { replay?: boolean }) | undefined {
  if (/wait.{0,32}pullback|等.{0,12}回调/i.test(prediction) && !/don't|not|never|不等/i.test(basis)) return {
    scenario: 'The price has moved up. It has not pulled back, and there’s no new information.',
    choices: ['Wait for a pullback', 'Buy now'],
    replay: true,
  };
  if (/without new information.{0,32}wait|等.{0,16}新消息/i.test(prediction) && !/don't|never|不等/i.test(basis)) return {
    scenario: 'The price jumps. The information you used in your original decision hasn’t changed.',
    choices: ['Wait for a change in the evidence', 'Act on the price jump'],
  };
  if (/same order.{0,32}same decision/i.test(prediction) || /同一.*订单/.test(prediction)) return {
    scenario: 'A later fill comes from the same order you already placed.',
    choices: ['Count it as the same decision', 'Treat it as a new decision'],
  };
  if (/stages|planned buys|分批/i.test(prediction) && !/don't|not|never|不分批/i.test(basis)) return {
    scenario: 'Your second planned entry becomes available, and the conditions behind that plan still hold.',
    choices: ['Stick to the planned entry', 'Treat it as a new decision'],
  };
  return undefined;
}

export function DecisionFollowUp({ basis, prediction, retained, persistent, starter = false, quietArrival = false, inline = false, observed, onObservedBack, onRemember, onNext }: {
  basis: string;
  prediction: string;
  retained?: boolean;
  persistent?: boolean;
  starter?: boolean;
  quietArrival?: boolean;
  inline?: boolean;
  observed?: CalibrationEvidence & { reason: string };
  onObservedBack?: () => void;
  onRemember?: (basis: string, prediction: string) => void;
  onNext: (basis: string, prediction: string, evidence?: CalibrationEvidence) => void;
}) {
  const [later, setLater] = useState(false);
  const [chosen, setChosen] = useState<number>();
  const [point, setPoint] = useState(0);
  const result = useRef<HTMLDivElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const actionControl = useRef<HTMLInputElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const [comparisonPoint, setComparisonPoint] = useState<number>();
  const [candidate, setCandidate] = useState<(CalibrationEvidence & { id: string; reason: string }) | undefined>(() =>
    persistent && observed ? { ...observed, id: crypto.randomUUID() } : undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const directCheck = prepareCheck(basis, prediction);
  const [generatedCheck, setGeneratedCheck] = useState<CalibrationCheck>();
  const [preparing, setPreparing] = useState(!directCheck);
  const [choiceOrder] = useState(() => (Math.random() < .5 ? [0, 1] : [1, 0]));
  const check = directCheck ?? generatedCheck;
  const replay = directCheck?.replay;
  const evidence = check && chosen !== undefined ? {
    scenario: replay ? 'The price rises, then pulls back. No new information arrives.' : check.scenario,
    twinAction: check.choices[0],
    ownerAction: replay ? ['Buy on the rise', 'Wait for the pullback', 'Stay out'][point] : check.choices[chosen],
    matched: chosen === 0,
  } : undefined;
  function reviewExample(pointWithNews?: number) {
    if (!evidence) return;
    const actions = ['Buy on the rise', 'Wait for the pullback', 'Stay out'];
    const comparison = pointWithNews === undefined ? '' : ` When new information supports my original view in this replay, I chose to ${actions[pointWithNews].toLowerCase()}.`;
    const sample = { ...evidence, reason: `In this hypothetical situation, I chose: ${evidence.ownerAction}.${comparison}` };
    if (persistent) setCandidate({ ...sample, id: crypto.randomUUID() });
    else onNext(basis, prediction, sample);
  }

  async function saveCalibration() {
    const workspace = result.current?.closest('.twin-root');
    if (!workspace || !candidate || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Saving timed out. You can retry.')), 25000);
        workspace.dispatchEvent(new window.CustomEvent('twin:save-calibration', { detail: {
          example: {
            id: candidate.id, scenario: candidate.scenario, twinAction: candidate.twinAction,
            ownerAction: candidate.ownerAction, reason: candidate.reason,
          },
          resolve: (id: string) => { window.clearTimeout(timer); resolve(id); },
          reject: (error: Error) => { window.clearTimeout(timer); reject(error); },
        } }));
      });
      onNext(basis, prediction, { ...candidate, platformExampleId: candidate.id });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this example.');
    } finally {
      setSaving(false);
    }
  }

  const dock = replay && !inline ? document.getElementById('twin-calibration-dock') : null;


  useEffect(() => {
    if (observed || prepareCheck(basis, prediction)) return;
    const controller = new AbortController();
    void prepareLocalCalibration(basis, prediction, controller.signal).then(result => {
      if (!controller.signal.aborted) setGeneratedCheck(result);
    }).catch(() => {
      // The user can still share a real follow-up when a scenario is unavailable.
    }).finally(() => {
      if (!controller.signal.aborted) setPreparing(false);
    });
    return () => controller.abort();
  }, [basis, prediction, observed]);

  useEffect(() => {
    if (!dock || later || quietArrival) return;
    const frame = window.requestAnimationFrame(() => {
      const reply = dock.querySelector<HTMLElement>('.twin-follow-up');
      if (!reply?.getClientRects().length) return;
      reply.focus({ preventScroll: true });
      reply.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dock, later, quietArrival]);

  useEffect(() => {
    if (chosen !== undefined && !later) result.current?.focus({ preventScroll: true });
  }, [chosen, later]);

  const previewIsInline = Boolean(observed);
  useEffect(() => {
    if (!later && candidate) previewHeading.current?.focus({ preventScroll: previewIsInline });
  }, [later, candidate, previewIsInline]);

  function deferContribution() {
    setLater(true);
    window.requestAnimationFrame(() => resumeButton.current?.focus());
  }

  const preview = candidate && <section className="twin-missing-detail" aria-label="Review training example">
    <h3 ref={previewHeading} tabIndex={-1}>One example for your Twin</h3>
    <p>Review the details before sharing them with your Twin’s training set.</p>
    <dl className="twin-training-example">
      <div><dt>Situation</dt><dd>{candidate.scenario}</dd></div>
      <div><dt>Twin predicted</dt><dd>{candidate.twinAction}</dd></div>
      <div><dt>You chose</dt><dd>{candidate.ownerAction}</dd></div>
      <div><dt>{observed ? 'Your correction' : 'What you did in the replay'}</dt><dd>{candidate.reason}</dd></div>
    </dl>
    <div className="twin-fluid-actions">
      <button type="button" disabled={saving} onClick={() => void saveCalibration()}>{saving ? 'Saving…' : 'Add to my training set and continue'}</button>
      <button type="button" disabled={saving} onClick={() => onNext(basis, prediction, candidate)}>Continue on this device</button>
      <button type="button" disabled={saving} onClick={() => {
        if (onObservedBack) { onObservedBack(); return; }
        setSaveError('');
        setCandidate(undefined);
        window.requestAnimationFrame(() => (actionControl.current ?? result.current)?.focus());
      }}>{onObservedBack ? 'Change my answer' : observed ? 'Back to correction' : replay ? 'Back to comparison' : 'Back to decision'}</button>
      <button type="button" className="twin-change-source" disabled={saving} onClick={deferContribution}>Later</button>
    </div>
    {saveError && <p role="alert">{saveError}</p>}
  </section>;

  if (observed) return <section ref={result} tabIndex={-1} className="twin-follow-up" aria-label="Use your correction">
    {later ? <button ref={resumeButton} type="button" className="twin-review-later" onClick={() => setLater(false)}>
      Resume reviewing your example
    </button> : candidate ? preview : <>
      <span className="twin-dialogue-speaker">Twin · From this review</span>
      <p>I can use this correction as one example of how you made this decision.</p>
      <button type="button" onClick={() => {
        if (persistent) setCandidate({ ...observed, id: crypto.randomUUID() });
        else onNext(basis, prediction, observed);
      }}>{persistent ? 'Review this correction ↗' : 'Use this correction on this device ↗'}</button>
      {onObservedBack && <button type="button" className="twin-change-source" onClick={onObservedBack}>Change my answer</button>}
    </>}
  </section>;

  const interaction = later ? <button ref={resumeButton} type="button" className="twin-review-later" onClick={() => setLater(false)}>
    {candidate ? 'Resume reviewing your example' : chosen !== undefined ? 'Resume this comparison' : 'Resume building my Twin'}
  </button>
    : <section tabIndex={-1} className="twin-follow-up" aria-label="Carry this into the next review" data-twin-activity={chosen === 0 ? 'matched' : check && chosen === undefined ? 'prepared' : undefined}>
    <span className="twin-dialogue-speaker">{candidate ? 'Twin · Review before sharing' : evidence ? 'Twin · One follow-up' : 'Twin · Next check'}</span>
    {chosen === undefined && <>
      <h3 tabIndex={quietArrival ? -1 : undefined} data-prepared-first-move={quietArrival || undefined}>{starter ? "Show me one move" : "See where this understanding holds."}</h3>
      {check ? <p>{starter ? "Try a short hypothetical replay. I made a starting guess before seeing your choice." : "I made my prediction. Make your move to see mine."}</p>
        : <p role="status">{preparing ? 'Preparing a new situation on this device…' : 'Share another real decision where you followed this rule or made an exception.'}</p>}
    </>}
    {check && <div className="twin-independent-check">
      {!candidate && (replay ? <CalibrationReplay point={point} chosen={chosen} onMove={setPoint} onChoose={setChosen} /> : <p>{check.scenario}</p>)}
      {chosen === undefined ? !replay && <div className="twin-fluid-actions">
        {choiceOrder.map(index => <button key={index} type="button" onClick={() => setChosen(index)}>{check.choices[index]}</button>)}
      </div> : <div tabIndex={-1} ref={result}>
        {!replay && !candidate && <dl>
          <div><dt>Twin predicted</dt><dd>{check.choices[0]}</dd></div>
          <div><dt>You chose</dt><dd>{check.choices[chosen]}</dd></div>
        </dl>}
        {candidate ? preview : evidence && <section className="twin-missing-detail">
          <h4>{replay ? 'Same price path. One thing changes.' : 'Keep this decision as an example?'}</h4>
          {replay && <>
            <p>New information supports your original view. Move the marker to show when you’d act.</p>
            <ReplayPath point={comparisonPoint ?? point} />
            <div className="twin-comparison-track" aria-hidden="true">
              <span>Price rises</span><span>Pullback</span><span>Stay out</span>
            </div>
            <input ref={actionControl} type="range" min={0} max={2} step={1}
              aria-label="Your move with new information"
              aria-valuetext={moments[comparisonPoint ?? point].label}
              value={comparisonPoint ?? point} onChange={event => setComparisonPoint(event.currentTarget.valueAsNumber)} />
            <p className="twin-comparison-current">Your move · {moments[comparisonPoint ?? point].label}</p>
            <button type="button" className="twin-change-source" onClick={() => reviewExample(comparisonPoint ?? point)}>
              {comparisonPoint === undefined ? 'I’d make the same move' : 'Use this comparison'} ↗
            </button>
          </>}
          <div className="twin-fluid-actions">
            {!replay && <button type="button" onClick={() => reviewExample()}>Review this example ↗</button>}
            {replay && <button type="button" className="twin-change-source" onClick={() => reviewExample()}>Keep only my first move</button>}
            <button type="button" className="twin-change-source" onClick={deferContribution}>Later</button>
          </div>
        </section>}

      </div>}
    </div>}
    {!candidate && <><details><summary>What we’re testing</summary>{(!check || chosen !== undefined) && <p>{prediction}</p>}<blockquote>{basis}</blockquote></details>
    <div className="twin-fluid-actions">
      {onRemember && <button type="button" disabled={retained || chosen === 1} onClick={() => onRemember(basis, prediction)}>
        {retained ? (persistent ? 'Kept on this device' : 'Kept for this session') : (persistent ? 'Keep on this device' : 'Keep this understanding')}
      </button>}
      {!starter && (!check || chosen === undefined) && <button type="button" onClick={() => onNext(basis, prediction)}>Add another decision ↗</button>}
      {chosen === undefined && <button type="button" onClick={deferContribution}>Later</button>}
    </div>
    {retained && <p role="status">You’ll see this understanding beside your Twin. You can remove it there.</p>}</>}
  </section>;
  return dock ? createPortal(interaction, dock) : interaction;
}
