import type { CalibrationEvidence } from './calibration-evidence.ts';
import { DecisionFollowUp } from './decision-follow-up.tsx';
import { readLocalDecision, type LocalDecisionReading } from './local-decision-model.ts';
import { InitiativeVoice } from './initiative-voice.tsx';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

let speakNewReplies = false;

function requestTwinSpeech(target: HTMLButtonElement | null, text: string, setStatus: (message: string) => void) {
  const root = target?.closest('.twin-root');
  if (!target || !root) return;
  const detail = { text, handled: false, status: (message: string) => {
    if (target.isConnected) setStatus(message);
  } };
  root.dispatchEvent(new CustomEvent('twin:speak-reply', { detail }));
  if (!detail.handled) setStatus('Local Twin voice is unavailable.');
}

function SpeakTwinReply({ text }: { text: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState('');
  const [automatic, setAutomatic] = useState(speakNewReplies);
  useEffect(() => {
    setStatus('');
    const root = button.current?.closest('.twin-root');
    if (speakNewReplies) requestTwinSpeech(button.current, text, setStatus);
    return () => { root?.dispatchEvent(new Event('twin:stop-reply')); };
  }, [text]);
  return <div className="twin-reply-voice">
    <button ref={button} type="button" onClick={() => requestTwinSpeech(button.current, text, setStatus)}>
      Speak as my Twin
    </button>
    <button type="button" aria-pressed={automatic} onClick={() => {
      speakNewReplies = !automatic;
      setAutomatic(!automatic);
      if (!automatic) requestTwinSpeech(button.current, text, setStatus);
      else {
        button.current?.closest('.twin-root')?.dispatchEvent(new Event('twin:stop-reply'));
        setStatus('');
      }
    }}>Auto-speak new replies</button>
    <small role="status">{status}</small>
  </div>;
}

const trades = [
  { date: 'Nov 3', market: 'Rate decision', before: '42¢', after: '51¢' },
  { date: 'Nov 9', market: 'Inflation data', before: '36¢', after: '44¢' },
  { date: 'Nov 12', market: 'Unemployment data', before: '55¢', after: '62¢' },
  { date: 'Nov 17', market: 'Rate decision', before: '46¢', after: '55¢' },
];

const corrections = {
  planned: 'Before adding again, check whether the trade meets your original conditions.',
  news: 'Before adding again, write down which news changed your view.',
  unknown: 'Next time you add to a position, jot down why so you can review it later.',
};

type Correction = keyof typeof corrections;
export type TradeReviewStatus = 'Ready' | 'No trades' | 'Read failed';
type Feedback = 'Right' | 'Partly right' | 'Needs correction';
const starterBasis = 'Starting guess for a hypothetical scenario.';
const starterPrediction = 'You might wait for a pullback before buying.';
const trialExampleKey = 'loka.twin.trial-example';
const trialExampleSignIn = '/?identity=1&signin=1&view=trades&return=twin&resume-example=1';

function readTrialExample(): (CalibrationEvidence & { reason: string }) | undefined {
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(trialExampleKey) || 'null');
    if (!draft || !Number.isFinite(draft.expiresAt) || Date.now() >= draft.expiresAt) return;
    const { scenario, twinAction, ownerAction, reason, matched } = draft;
    if ([scenario, twinAction, ownerAction, reason].every(value => typeof value === 'string' && value.length > 0 && value.length <= 600)
      && typeof matched === 'boolean') return { scenario, twinAction, ownerAction, reason, matched };
  } catch {
    // A blocked or malformed browser draft should not interrupt onboarding.
  }
}
const explanations = {
  planned: { label: 'Two planned buys', next: 'Group both fills under the original plan and check whether they followed it.' },
  news: { label: 'News prompted the buy', next: 'Note which news changed your view and how much you adjusted the position afterward.' },
  split: { label: 'Fills from one order', next: 'Check the order records first and group fills from the same order.' },
  other: { label: 'Something else', next: 'Compare both fills with your explanation and note where the evidence is still missing.' },
  unknown: { label: 'I do not remember', next: 'Keep them as separate fills. Add a note about your original plan when you have it.' },
};

type Explanation = keyof typeof explanations;

type Reminder = keyof typeof reminders;

const tradeDraftKey = 'loka-twin-workspace:trade-draft';
const reminderKey = 'loka-twin-workspace:trade-reminder';
const reminders = {
  check: 'Before adding, check whether new information changed your original view.',
  planned: corrections.planned,
  news: corrections.news,
  'public-planned': explanations.planned.next,
  'public-split': explanations.split.next,
  'public-news': explanations.news.next,
};

function readReminder(): Reminder | undefined {
  try {
    const value = window.localStorage.getItem(reminderKey);
    if (value && Object.hasOwn(reminders, value)) return value as Reminder;
  } catch {
    return undefined;
  }
}

interface PublicTrade {
  token_id?: string;
  transaction_hash?: string;
  outcome?: string;
  timestamp: number;
  title: string;
  side: 'BUY' | 'SELL';
  price: number;
  size?: number;
}

function isPublicTrade(row: unknown): row is PublicTrade {
  if (!row || typeof row !== 'object') return false;
  const item = row as Partial<PublicTrade> & { type?: string };
  return item.type === 'TRADE' && (item.side === 'BUY' || item.side === 'SELL')
    && typeof item.title === 'string' && Boolean(item.title.trim())
    && typeof item.timestamp === 'number' && item.timestamp > 0 && item.timestamp < 1e11
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 && item.price <= 1;
}

const tradePrice = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const summaryPrice = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
const summarySize = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const tradeTime = new Intl.DateTimeFormat('en-US', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function TradeTime({ timestamp }: { timestamp: number }) {
  const time = new Date(timestamp * 1000);
  return <time dateTime={time.toISOString()} title={time.toLocaleString('en-US')}>{tradeTime.format(time)}</time>;
}

function TradeAmount({ trade, concise = false }: { trade: PublicTrade; concise?: boolean }) {
  return <>
    {(concise ? summaryPrice : tradePrice).format(trade.price)} pUSD/share
    {typeof trade.size === 'number' && Number.isFinite(trade.size) && trade.size > 0
      ? ` · ${(concise && trade.size >= 0.01 ? summarySize : tradePrice).format(trade.size)} shares`
      : ''}
  </>;
}

function findRepeatedBuy(records: PublicTrade[]) {
  const earlier = new Map<string, PublicTrade>();
  let pair: [PublicTrade, PublicTrade] | undefined;
  for (const trade of [...records].sort((a, b) => a.timestamp - b.timestamp)) {
    if (typeof trade.token_id !== 'string' || !trade.token_id) continue;
    if (trade.side === 'SELL') {
      earlier.delete(trade.token_id);
      continue;
    }
    if (typeof trade.transaction_hash !== 'string' || !trade.transaction_hash) continue;
    const previous = earlier.get(trade.token_id);
    if (previous && previous.timestamp < trade.timestamp && previous.transaction_hash !== trade.transaction_hash) {
      pair = [previous, trade];
    }
    earlier.set(trade.token_id, trade);
  }
  return pair;
}

const addressPattern = /^0x[0-9a-f]{40}$/i;

function polymarketURL(value: string) {
  try {
    const input = /^(?:www\.)?polymarket\.com\//i.test(value) ? `https://${value}` : value;
    const url = new URL(input);
    if (url.protocol === 'https:' && !url.port && !url.username && !url.password
      && ['polymarket.com', 'www.polymarket.com'].includes(url.hostname)) return url;
  } catch {
    return undefined;
  }
}

function parseProfile(value: string) {
  const url = polymarketURL(value);
  if (!url) return;
  const address = /^\/(?:profile\/)?(0x[0-9a-f]{40})\/?$/i.exec(url.pathname)?.[1];
  if (address) return { address, link: url.origin + url.pathname };
  const match = /^\/(?:profile\/)?(?:@|%40)([^/]+)\/?$/i.exec(url.pathname);
  if (!match) return;
  try {
    const name = decodeURIComponent(match[1]);
    if (/^[a-z0-9_.-]{1,80}$/i.test(name)) return { name, link: url.origin + url.pathname };
  } catch {
    return undefined;
  }
}

function SwipeJudgmentCard({ feedback, onAssess, children, onLater }: {
  feedback?: Feedback;
  onAssess: (answer: Feedback, revealCorrection?: boolean) => void;
  children: ReactNode;
  onLater?: () => void;
}) {
  const gesture = useRef<{ x: number; y: number; lastX: number; lastY: number; pointerId: number } | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  const article = useRef<HTMLElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    if (collapsed) reopen.current?.focus();
    else article.current?.focus();
  }, [collapsed]);

  const assessRef = useRef(onAssess);
  useEffect(() => { assessRef.current = onAssess; }, [onAssess]);

  useEffect(() => {
    const card = article.current;
    if (!card || collapsed) return;
    let offset = 0;
    let committed = false;
    let reset: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      offset = 0;
      committed = false;
      card.style.removeProperty('--swipe-offset');
      delete card.dataset.swipe;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || gesture.current) return;
      const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      const dy = event.shiftKey ? 0 : event.deltaY;
      if (Math.abs(dx) <= Math.abs(dy) * 1.4) return;
      event.preventDefault();
      clearTimeout(reset);
      reset = setTimeout(clear, 160);
      if (committed) return;
      offset -= dx * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? card.clientWidth : 1);
      const direction = offset > 0 ? 'confirm' : 'correct';
      card.style.setProperty('--swipe-offset', `${Math.max(-72, Math.min(72, offset))}px`);
      if (Math.abs(offset) >= 55) {
        committed = true;
        card.dataset.swipe = direction;
        assessRef.current(direction === 'confirm' ? 'Right' : 'Needs correction', true);
      }
    };
    let touch: { id: number; x: number; y: number; axis?: 'x' | 'y' } | undefined;
    const touchStart = (event: TouchEvent) => {
      gesture.current = undefined;
      const point = event.touches[0];
      if (event.touches.length !== 1 || !point) {
        touchCancel();
        return;
      }
      touch = { id: point.identifier, x: point.clientX, y: point.clientY };
    };
    const touchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) return;
      const point = Array.from(event.touches).find(item => item.identifier === touch?.id);
      if (!point) return;
      const dx = point.clientX - touch.x;
      const dy = point.clientY - touch.y;
      if (!touch.axis && Math.hypot(dx, dy) >= 8) touch.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      if (touch.axis !== 'x') return;
      if (event.cancelable) event.preventDefault();
      card.style.setProperty('--swipe-offset', `${Math.max(-96, Math.min(96, dx * .72))}px`);
      if (Math.abs(dx) >= 48) card.dataset.swipe = dx > 0 ? 'confirm' : 'correct';
      else delete card.dataset.swipe;
    };
    const touchCancel = () => {
      touch = undefined;
      card.style.removeProperty('--swipe-offset');
      delete card.dataset.swipe;
    };
    const touchEnd = (event: TouchEvent) => {
      if (!touch) return;
      const point = Array.from(event.changedTouches).find(item => item.identifier === touch?.id);
      if (!point) return;
      const dx = point.clientX - touch.x;
      const dy = point.clientY - touch.y;
      const swiped = touch.axis !== 'y' && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.25;
      touchCancel();
      if (!swiped) return;
      if (event.cancelable) event.preventDefault();
      assessRef.current(dx > 0 ? 'Right' : 'Needs correction', true);
    };
    card.addEventListener('touchstart', touchStart, { passive: true });
    card.addEventListener('touchmove', touchMove, { passive: false });
    card.addEventListener('touchend', touchEnd, { passive: false });
    card.addEventListener('touchcancel', touchCancel);
    const release = (event: PointerEvent | MouseEvent) => {
      const current = gesture.current;
      if (!current || ('pointerId' in event && event.pointerId !== current.pointerId)) return;
      finishDrag(card, current.lastX, current.lastY);
    };
    const view = card.ownerDocument.defaultView;
    view?.addEventListener('pointerup', release, true);
    view?.addEventListener('mouseup', release, true);
    card.addEventListener('lostpointercapture', release);
    card.addEventListener('wheel', wheel, { passive: false });
    return () => {
      card.removeEventListener('touchstart', touchStart);
      card.removeEventListener('touchmove', touchMove);
      card.removeEventListener('touchend', touchEnd);
      card.removeEventListener('touchcancel', touchCancel);
      view?.removeEventListener('pointerup', release, true);
      view?.removeEventListener('mouseup', release, true);
      card.removeEventListener('lostpointercapture', release);
      card.removeEventListener('wheel', wheel);
      clearTimeout(reset);
      clear();
    };
  }, [collapsed]);

  function finishDrag(card: HTMLElement, x: number, y: number) {
    const origin = gesture.current;
    if (!origin) return;
    gesture.current = undefined;
    card.style.removeProperty('--swipe-offset');
    delete card.dataset.swipe;
    const dx = x - origin.x;
    const dy = y - origin.y;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) assessRef.current(dx > 0 ? 'Right' : 'Needs correction', true);
  }

  function toggle(next: boolean) {
    moved.current = true;
    setCollapsed(next);
  }

  return (
    <>
      {collapsed && (
        <button ref={reopen} className="twin-judgment-reopen" type="button"
          aria-controls={id} aria-expanded={false} onClick={() => toggle(false)}>
          <span>Show Twin judgment</span>
          <span aria-hidden="true">＋</span>
        </button>
      )}
    <article id={id} ref={article} hidden={collapsed} className="twin-judgment-card"
      data-feedback={feedback === 'Right' ? 'confirm' : feedback ? 'correct' : undefined}
      tabIndex={0} aria-label="Twin judgment card. Swipe left or press Left to correct. Swipe right or press Right to confirm."
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onAssess(event.key === 'ArrowRight' ? 'Right' : 'Needs correction', true);
        }
      }}
      onPointerDown={event => {
        if ((event.pointerType === 'touch' && 'ontouchstart' in window) || !event.isPrimary || event.button !== 0 || (event.target as Element).closest?.('summary, button, a')) return;
        gesture.current = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        const origin = gesture.current;
        if (!origin || event.pointerId !== origin.pointerId) return;
        origin.lastX = event.clientX;
        origin.lastY = event.clientY;
        const dx = event.clientX - origin.x;
        const horizontal = Math.abs(dx) > Math.abs(event.clientY - origin.y) * 1.4;
        const card = event.currentTarget;
        card.style.setProperty('--swipe-offset', `${horizontal ? Math.max(-96, Math.min(96, dx * .72)) : 0}px`);
        if (horizontal && Math.abs(dx) >= 55) card.dataset.swipe = dx > 0 ? 'confirm' : 'correct';
        else delete card.dataset.swipe;
      }}
      onPointerCancel={event => {
        if (!gesture.current) return;
        gesture.current = undefined;
        event.currentTarget.style.removeProperty('--swipe-offset');
        delete event.currentTarget.dataset.swipe;
      }}
      onPointerUp={event => {
        const origin = gesture.current;
        if (origin) finishDrag(event.currentTarget, origin.lastX, origin.lastY);
      }}>
      <div className="twin-card-heading">
        <small>Twin judgment</small>
        <span className="twin-swipe-preview" aria-hidden="true">
          <span data-swipe-label="correct">Release to correct</span>
          <span data-swipe-label="confirm">Release to confirm</span>
        </span>
        <button className="twin-judgment-close" type="button" aria-controls={id} aria-expanded={true}
          onClick={() => { if (onLater && !feedback) onLater(); else toggle(true); }}>
          {onLater && !feedback ? 'Review later' : 'Hide card'}
        </button>
      </div>
      {children}
      <div className="twin-swipe-grip" aria-hidden="true"><span>‹</span><i /><span>›</span></div>
      <footer className="twin-swipe-hint" aria-label="Judgment feedback">
        <button type="button" aria-label="Needs correction" aria-pressed={feedback === 'Needs correction'} onClick={() => onAssess('Needs correction', true)}>← Swipe left to correct</button>
        {!onLater && <button type="button" aria-pressed={feedback === 'Partly right'} onClick={() => onAssess('Partly right')}>Partly right</button>}
        <button type="button" aria-label="Right" aria-pressed={feedback === 'Right'} onClick={() => onAssess('Right')}>Swipe right to confirm →</button>
      </footer>
    </article>
    </>
  );
}

function TradeNoteComposer({ correction, tradeTimestamp, tradePrice, firstReview = false, fromPublicRecords = false }: {
  correction?: Correction | 'split';
  tradeTimestamp?: number;
  tradePrice?: number;
  firstReview?: boolean;
  fromPublicRecords?: boolean;
}) {
  const noteId = useId();
  const [expanded, setExpanded] = useState(firstReview);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRead = useRef(0);
  const [readingFile, setReadingFile] = useState(false);
  const [submission, setSubmission] = useState<{ correction: typeof correction; lines: string[]; fileName: string }>();
  const evidence = submission?.correction === correction ? submission?.lines : undefined;
  const prompt = correction === 'news'
    ? { invite: 'My prediction: similar news might prompt another buy. The original news and its timestamp can help check this against your fill.', action: 'Check news timing', inputHint: 'Paste the news and timestamp, e.g. Announcement 2026-11-26 09:30+08:00', pattern: /消息|公告|财报|因为|触发|仓位|\b(?:news|announcement|earnings|because|trigger|position)\b/i }
    : correction === 'planned'
      ? { invite: 'My prediction: the second fill should be within your planned price range. Add the buy limit to compare it with the actual fill.', action: 'Compare buy limit', inputHint: 'E.g. Buy limit 0.55 pUSD', pattern: /原本|计划|预设|分批|限价|买入上限|条件|触发|\b(?:original|plan|planned|buy limit|limit order|condition|trigger)\b/i }
      : correction === 'split'
        ? { invite: 'These fills may come from one order. Paste both order IDs to see whether they match.', action: 'Compare order IDs', inputHint: 'One per line, e.g. Order ID A123', pattern: /订单|编号|order.?id|成交号/i }
        : { invite: 'I am still unsure what prompted the buy. A note from the time would help us check.', action: 'Check the reason', inputHint: 'Paste the reason you recorded at the time', pattern: /原本|计划|加仓|买入|成交|消息|财报|退出|止损|卖出|因为|\b(?:plan|buy|sell|fill|news|because|stop loss)\b/i };

  const action = fromPublicRecords ? 'Compare trade plan'
    : correction === 'news' && tradeTimestamp == null ? 'Review news evidence'
    : correction === 'planned' && tradePrice == null ? 'Review plan evidence'
      : prompt.action;
  const inputHint = fromPublicRecords ? 'Paste the original plan and matching fills'
    : correction === 'news' && tradeTimestamp == null ? 'Paste the news you recorded'
    : correction === 'planned' && tradePrice == null ? 'Paste the original plan'
      : prompt.inputHint;
  const relevantEvidence = evidence?.filter(line => prompt.pattern.test(line)).slice(0, 2);
  const orderIds = correction === 'split' && evidence
    ? evidence.flatMap(line => Array.from(
      line.matchAll(/(?:订单(?:编号|号|\s*ID)|\border[ _-]?id\b)\s*[:：#=]?\s*([a-z\d][a-z\d_-]*)/gi),
      match => match[1],
    ))
    : undefined;
  const newsTimes = correction === 'news' && tradeTimestamp != null && evidence
    ? Array.from(evidence.join('\n').matchAll(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/gi),
      match => Date.parse(match[0].replace(' ', 'T'))).filter(Number.isFinite)
    : undefined;
  const planLimits = correction === 'planned' && tradePrice != null && evidence
    ? Array.from(evidence.join('\n').matchAll(/(?:买入上限|\bbuy\s+limit\b)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*pUSD\b/gi),
      match => Number(match[1])).filter(price => price >= 0 && price <= 1)
    : undefined;
  const comparison = (firstReview || fromPublicRecords) && evidence ? [
    { label: 'Original plan', quote: evidence.find(line => /原本|原计划|打算|计划是|\b(?:original plan|planned|intended)\b/i.test(line)) },
    { label: 'What happened', quote: evidence.find(line => /后来|实际|成交|最终|\b(?:actual|actually|filled|fills?|ended up)\b/i.test(line)) },
    { label: 'Reason for the change', quote: evidence.find(line => /因为|原因是|触发|\b(?:because|reason|triggered)\b/i.test(line)) },
  ] : undefined;

  async function readFile(file?: File) {
    if (!file) return;
    const read = ++fileRead.current;
    setError('');
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 64 * 1024) {
      setReadingFile(false);
      setError('Choose a TXT or Markdown note under 64 KB.');
      return;
    }
    setReadingFile(true);
    try {
      const content = (await file.text()).trim();
      if (read !== fileRead.current) return;
      if (!content) {
        setError('This note is empty. Choose another file or paste a note.');
        return;
      }
      setText(content.slice(0, 1200));
      setTruncated(content.length > 1200);
      setFileName(file.name);
      setSubmission(undefined);
    } catch {
      if (read === fileRead.current) setError('Could not read this file. Choose another file or paste a note.');
    } finally {
      if (read === fileRead.current) setReadingFile(false);
    }
  }

  return (
    <form className="twin-note-composer" data-dragging={dragging || undefined}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={event => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        setExpanded(true);
        void readFile(event.dataTransfer.files[0]);
      }}
      onSubmit={event => {
      event.preventDefault();
      if (readingFile || !text.trim()) return;
      const lines = text.trim().split(/\n+/).map(line => line.trim()).filter(Boolean);
      setSubmission({ correction, lines, fileName });
      setExpanded(false);
    }}>
      {firstReview ? <>
        <h3>When do I change my trading plan?</h3>
        {!comparison && <div className="twin-note-preview">
          <small>Example result</small>
          <dl>
            <div><dt>Original plan</dt><dd>Wait for the announcement</dd></div>
            <div><dt>What happened</dt><dd>Added before the announcement</dd></div>
            <div><dt>Reason for the change</dt><dd>To verify</dd></div>
          </dl>
        </div>}
        <p>Paste notes about what you planned and what you did. I can put them side by side so you can see what changed.</p>
      </> : <>
        <p>{fromPublicRecords
          ? 'The trades show what happened. Add your original plan and the relevant fills to see where they diverged.'
          : prompt.invite}</p>
        <button type="button" className="twin-evidence-toggle" aria-expanded={expanded}
          aria-controls={`${noteId}-entry`} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Hide note editor' : evidence ? 'Edit note' : action} <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </>}
      {firstReview && !expanded && (
        <button type="button" className="twin-evidence-toggle" aria-controls={`${noteId}-entry`}
          aria-expanded={false} onClick={() => setExpanded(true)}>Edit note</button>
      )}
      <div id={`${noteId}-entry`} hidden={!expanded}>
      <div className="twin-note-input">
        <label htmlFor={noteId}>Trade note</label>
        {fileName && <div className="twin-note-attachment">
          <span>{fileName}</span>
          <button type="button" aria-label="Remove note" onClick={() => {
            fileRead.current++;
            setReadingFile(false);
            setFileName('');
            setText('');
            setTruncated(false);
            setError('');
            setSubmission(undefined);
          }}>×</button>
        </div>}
        <textarea id={noteId} rows={3} maxLength={1200} placeholder={firstReview ? 'Paste a note or write here' : inputHint}
          value={text} onChange={event => {
            fileRead.current++;
            setReadingFile(false);
            setText(event.target.value);
            setSubmission(undefined);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && text.trim()) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
        <div className="twin-note-composer-actions">
          <input hidden ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown"
            onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" onClick={() => fileInput.current?.click()}>
            <span aria-hidden="true">＋</span> Attach a local note
          </button>
          <button type="submit" disabled={readingFile || !text.trim()}>{firstReview ? 'Compare notes' : action} <span aria-hidden="true">↑</span></button>
        </div>
      </div>
      <small>{truncated ? 'First 1,200 characters · ' : ''}Read on this device only</small>
      </div>
      {readingFile && <p role="status">Reading your note on this device…</p>}
      {error && <p role="alert">{error}</p>}
      {evidence && <>
        <div className="twin-dialogue-source twin-dialogue-evidence">
          <span>You</span>
          <p>{submission?.fileName || `Note added · ${evidence.length} ${evidence.length === 1 ? 'line' : 'lines'}`}</p>
        </div>
        <div role="status" className="twin-dialogue-evidence-result">
          <span className="twin-dialogue-speaker">Twin</span>
        {newsTimes && <p>{newsTimes.length !== 1
          ? 'Add one timestamp with a time zone, e.g. 2026-11-26 09:30+08:00.'
          : <>The news timestamp {newsTimes[0] === tradeTimestamp! * 1000 ? 'matches the second fill' :
            newsTimes[0] < tradeTimestamp! * 1000 ? 'precedes the second fill' : 'follows the second fill'}. The second fill was at <TradeTime timestamp={tradeTimestamp!} />.</>}</p>}
        {planLimits && tradePrice != null && <p>{planLimits.length !== 1
          ? 'Add one planned price, e.g. Buy limit 0.55 pUSD.'
          : <>The second fill price, {tradePrice} pUSD, {tradePrice <= planLimits[0] ? 'is within' : 'exceeds'} your buy limit of {planLimits[0]} pUSD.</>}</p>}
        {comparison ? <div className="twin-note-preview">
          <small>From your notes</small>
          <dl>{comparison.map(({ label, quote }) => (
            <div key={label}><dt>{label}</dt><dd>{quote ?? 'Missing from your notes'}</dd></div>
          ))}</dl>
        </div> : relevantEvidence?.length ? <>
          {orderIds && <p>{orderIds.length === 2
            ? orderIds[0] === orderIds[1] ? 'The two order IDs you provided match.' : 'The two order IDs you provided differ.'
            : 'Add one order ID for each fill, on separate lines.'}</p>}
          <strong>Relevant excerpts from your note</strong>
          {relevantEvidence.map((line, index) => <blockquote key={index}>{line}</blockquote>)}
        </> : <p>I could not find a relevant plan, fill, or news item. Add a line about what you planned and what happened.</p>}
        </div>
      </>}
    </form>
  );
}

function usePredictionArrival(evidence: object | string | undefined, enabled: boolean) {
  const [delivered, setDelivered] = useState<object | string>();
  const [requested, setRequested] = useState<object | string>();
  const [deferred, setDeferred] = useState<object | string>();
  const anchor = useRef<HTMLDivElement>(null);
  const ready = !enabled || !evidence || (delivered === evidence && deferred !== evidence);
  useEffect(() => {
    if (!enabled || !evidence || ready || deferred === evidence) return;
    let timer: number | undefined;
    const tryDeliver = () => {
      window.clearTimeout(timer);
      const active = document.activeElement;
      if (document.hidden || !document.hasFocus() || (active?.matches('textarea, input, [contenteditable=true]') && requested !== evidence)) return;
      timer = window.setTimeout(() => setDelivered(evidence), requested === evidence ? 0 : 420);
    };
    tryDeliver();
    document.addEventListener('focusin', tryDeliver);
    document.addEventListener('focusout', tryDeliver);
    document.addEventListener('visibilitychange', tryDeliver);
    window.addEventListener('focus', tryDeliver);
    window.addEventListener('blur', tryDeliver);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', tryDeliver);
      document.removeEventListener('focusout', tryDeliver);
      document.removeEventListener('visibilitychange', tryDeliver);
      window.removeEventListener('focus', tryDeliver);
      window.removeEventListener('blur', tryDeliver);
    };
  }, [enabled, evidence, ready, requested, deferred]);

  useEffect(() => {
    if (!enabled || !evidence || !ready || requested !== evidence) return;
    anchor.current?.querySelector<HTMLElement>('.twin-judgment-card, .twin-follow-up')?.focus();
  }, [enabled, evidence, ready, requested]);

  useEffect(() => {
    if (!enabled || !evidence || deferred !== evidence) return;
    const root = anchor.current?.closest('.twin-root');
    const candidates = root?.querySelectorAll<HTMLElement>('.twin-evidence-open');
    const opener = Array.from(candidates || []).find(node => node.getClientRects().length > 0);
    (opener ?? anchor.current?.parentElement?.querySelector<HTMLElement>('.twin-evidence-open'))?.focus();
  }, [enabled, evidence, deferred]);

  return {
    anchor, ready,
    open: () => {
      if (ready) anchor.current?.querySelector<HTMLElement>('.twin-judgment-card, .twin-confirmed-prediction summary')?.focus();
      else if (evidence) { setDeferred(undefined); setRequested(evidence); }
    },
    later: () => { if (evidence) { setRequested(undefined); setDeferred(evidence); } },
  };
}

function DecisionEvidence({ label, detail, waiting, onOpen, openLabel, children }: {
  label: string;
  detail: string;
  waiting: boolean;
  onOpen: () => void;
  openLabel?: string;
  children?: ReactNode;
}) {
  return <div className="twin-evidence-arrival" data-twin-activity={waiting ? 'waiting' : 'delivered'}>
    <span className="twin-dialogue-speaker" aria-hidden="true">Twin</span>
    <div>
      <strong>{label}</strong>
      <p>{detail}</p>
      {children}
      <button className="twin-evidence-open" type="button" onClick={onOpen}>{openLabel ?? (waiting ? 'Open my judgment ↗' : 'View Twin’s judgment ↗')}</button>
    </div>
  </div>;
}

function JudgmentSurface({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const target = enabled ? document.getElementById('twin-judgment-dock') : null;
  return target ? createPortal(children, target) : children;
}

function TrainingReceipt({ exampleId, onRemoved }: { exampleId: string; onRemoved: () => void }) {
  const receipt = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'saved' | 'removing'>('saved');
  const [error, setError] = useState('');

  useEffect(() => {
    const workspace = receipt.current?.closest('.twin-root');
    const handle = (event: Event) => {
      if ((event as CustomEvent<{ removedId?: string }>).detail?.removedId === exampleId) onRemoved();
    };
    workspace?.addEventListener('twin:training-changed', handle);
    return () => workspace?.removeEventListener('twin:training-changed', handle);
  }, [exampleId, onRemoved]);

  async function remove() {
    const workspace = receipt.current?.closest('.twin-root');
    if (!workspace || state !== 'saved') return;
    setState('removing');
    setError('');
    try {
      await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Removal timed out. Try again.')), 25000);
        workspace.dispatchEvent(new window.CustomEvent('twin:remove-calibration', { detail: {
          removeId: exampleId,
          resolve: (id: string) => { window.clearTimeout(timer); resolve(id); },
          reject: (error: Error) => { window.clearTimeout(timer); reject(error); },
        } }));
      });
      onRemoved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not remove this example.');
      setState('saved');
    }
  }

  return <div ref={receipt} className="twin-training-receipt">
    <span role="status">Saved to your Twin’s training set.</span>
    <button type="button" className="twin-change-source" aria-controls="twin-training-library" onClick={() => {
      receipt.current?.closest('.twin-root')?.dispatchEvent(new window.CustomEvent('twin:open-training-example', { detail: exampleId }));
    }}>View saved example</button>
    <button type="button" className="twin-change-source" disabled={state === 'removing'} onClick={() => void remove()}>
      {state === 'removing' ? 'Removing…' : 'Remove example'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

type RetainedUnderstanding = { basis: string; prediction: string; evidence?: CalibrationEvidence };
type KeepUnderstanding = (basis: string, prediction: string) => void;
interface UnderstandingAccess {
  retainedUnderstandings?: RetainedUnderstanding[];
  persistentUnderstanding?: boolean;
  onKeepUnderstanding?: KeepUnderstanding;
}

function PublicTradeReview({ active = true, saved, saveStatus, onSave, onSample, onResult, draft, onDraftChange, focusInput, showExample = true, onKeepUnderstanding, onOtherSource, retainedUnderstandings, persistentUnderstanding }: {
  active?: boolean;
  focusInput: boolean;
  showExample?: boolean;
  onOtherSource?: (basis: string, prediction: string, evidence?: CalibrationEvidence) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  saved?: Reminder;
  saveStatus: string;
  onSave: (value?: Reminder) => void;
  onSample: () => void;
  onResult?: (status: TradeReviewStatus) => void;
} & UnderstandingAccess) {
  const [review, setReview] = useState<{ source: string; records: PublicTrade[] }>();
  const records = review?.records;
  const arrival = usePredictionArrival(review, !showExample);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState('');
  const [invalidAddress, setInvalidAddress] = useState(false);
  const [profileLink, setProfileLink] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [otherReason, setOtherReason] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [editingReason, setEditingReason] = useState(false);
  const correctionOptions = useRef<HTMLFieldSetElement>(null);
  function assess(answer: 'Right' | 'Partly right' | 'Needs correction', revealCorrection = false) {
    if (revealCorrection && answer === 'Needs correction') {
      window.requestAnimationFrame?.(() => {
        const target = correctionOptions.current;
        if (target && !target.contains(document.activeElement)) target.focus();
      });
    }
    setFeedback(answer);
    if (answer !== 'Right') setDirectCorrection(false);
    setEditingReason(answer !== 'Right');
    setExplanation(previous => answer === 'Right' ? previous ?? 'planned' : undefined);
  }
  const activeRequest = useRef<AbortController>(null);
  const result = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const restoreAddressFocus = useRef(focusInput);

  useEffect(() => {
    if (records?.length) {
      const card = result.current;
      if (card && showExample && !card.closest('[hidden]') && document.hasFocus() && document.activeElement === document.body) {
        card.focus();
      }
    } else if (!loading && restoreAddressFocus.current) {
      restoreAddressFocus.current = false;
      const input = addressInput.current;
      if (input && !input.closest('[hidden]')) input.focus();
    }
  }, [loading, records, showExample]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function load(value: string) {
    if (activeRequest.current) return;
    const profile = parseProfile(value);
    const name = profile?.name;
    const directAddress = profile?.address ?? (addressPattern.test(value) ? value : undefined);
    setProfileLink(profile?.link ?? (directAddress ? `https://polymarket.com/profile/${directAddress}` : undefined));
    if (!directAddress && !name) {
      setInvalidAddress(true);
      const path = polymarketURL(value)?.pathname ?? '';
      setError(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:event|market)\//i.test(path)
        ? 'This link opens a Polymarket market. To review your trades, open your own profile and copy its URL (for example, polymarket.com/@yourname). You can also paste your public address.'
        : 'Enter your Polymarket profile URL (for example, polymarket.com/@yourname) or your full public address.');
      addressInput.current?.focus();
      return;
    }
    if (navigator.onLine === false) {
      setError(showExample ? 'You are offline. Reconnect and retry, or open the example.' : 'You are offline. Your link is still here when you reconnect.');
      onResult?.('Read failed');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setReconnecting(false);
    setLoading(true);
    setReview(undefined);
    setFeedback(undefined);
    setExplanation(undefined);
    setOtherReason('');
    setReasonDraft('');
    setError('');
    let readingTrades = !name;
    let responseStatus: number | undefined;
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
      async function request(url: URL) {
        for (const delay of [400, 900, 1600, 2200, 3000, null]) {
          signal.throwIfAborted();
          let wait = delay;
          try {
            const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal });
            const retryAfter = response.headers.get('Retry-After');
            const temporaryGatewayError = response.status === 502 || response.status === 504;
            const retryAfterDelay = (response.status === 429 || response.status === 503)
              && retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
            if (delay === null || (!temporaryGatewayError && retryAfterDelay === undefined)) return response;
            wait = Math.max(delay, retryAfterDelay ?? 0);
            if (wait >= 12000) return response;
            void response.body?.cancel().catch(() => {});
          } catch (error) {
            if (!(error instanceof TypeError) || signal.aborted || delay === null) throw error;
          }
          setReconnecting(true);
          await new Promise<void>(resolve => {
            const finish = () => {
              window.clearTimeout(timer);
              signal.removeEventListener('abort', finish);
              resolve();
            };
            const timer = window.setTimeout(finish, wait ?? 0);
            signal.addEventListener('abort', finish, { once: true });
            if (signal.aborted) finish();
          });
        }
        throw new Error('Request retries exhausted');
      }
      let address = directAddress ?? value;
      if (name) {
        const search = new URL('https://gamma-api.polymarket.com/public-search');
        search.search = new URLSearchParams({ q: name, search_profiles: 'true', limit_per_type: '20' }).toString();
        const lookup = await request(search);
        responseStatus = lookup.status;
        if (!lookup.ok) throw new Error();
        const body: { profiles?: unknown } = await lookup.json();
        const matches = new Set<string>();
        for (const profile of Array.isArray(body.profiles) ? body.profiles : []) {
          if (typeof profile?.name === 'string' && profile.name.toLowerCase() === name.toLowerCase()
            && typeof profile.proxyWallet === 'string' && addressPattern.test(profile.proxyWallet)) {
            matches.add(profile.proxyWallet.toLowerCase());
          }
        }
        if (matches.size !== 1) {
          if (!controller.signal.aborted) {
            setError('I could not identify a unique profile. Check the link or paste the public address.');
            onResult?.('Read failed');
          }
          return;
        }
        address = [...matches][0];
      }
      readingTrades = true;
      const url = new URL('https://data-api.polymarket.com/v2/activity');
      url.search = new URLSearchParams({ user: address, limit: '30', type: 'TRADE' }).toString();
      const response = await request(url);
      responseStatus = response.status;
      if (!response.ok) throw new Error();
      const body: { data?: unknown } = await response.json();
      if (!Array.isArray(body.data)) throw new Error();
      if (!controller.signal.aborted) {
        const trades = body.data.slice(0, 30).filter(isPublicTrade);
        if (trades.length) onDraftChange('');
        setReview({ source: name ? `@${name}` : `${address.slice(0, 6)}…${address.slice(-4)}`, records: trades });
        onResult?.(trades.length ? 'Ready' : 'No trades');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const fallback = readingTrades
          ? 'Your link is still here. ' + (showExample ? 'Retry reading trades or open the example.' : 'You can retry when you’re ready.')
          : 'Your link is still here. Retry or use a public address.';
        const message = responseStatus === 429 ? 'Polymarket is rate limiting requests. Try again shortly.'
          : error instanceof DOMException && error.name === 'TimeoutError' ? 'The request timed out. ' + fallback
          : (readingTrades ? 'Could not reach Polymarket trades. ' : 'Could not look up the Polymarket profile. ') + fallback;
        setError(message);
        onResult?.('Read failed');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }

  const noPublicFills = records?.length === 0 && !error;
  const failed = Boolean(error) || noPublicFills;
  const timestamps = records?.map(record => record.timestamp) ?? [];
  const buys = records?.filter(record => record.side === 'BUY').length ?? 0;
  const sells = (records?.length ?? 0) - buys;
  const pair = records && findRepeatedBuy(records);
  const byOutcome = new Map<string, { trade: PublicTrade; count: number }>();
  for (const trade of records ?? []) {
    if (typeof trade.token_id !== 'string' || !trade.token_id) continue;
    const previous = byOutcome.get(trade.token_id);
    byOutcome.set(trade.token_id, { trade, count: (previous?.count ?? 0) + 1 });
  }
  const [mostActive, runnerUp] = [...byOutcome.values()].sort((a, b) => b.count - a.count);
  const recurringOutcome = mostActive && mostActive.count > (runnerUp?.count ?? 1) ? mostActive : undefined;
  const priceDifference = pair ? pair[1].price - pair[0].price : 0;
  const priceDifferenceText = priceDifference === 0 ? 'The two fills had the same price.'
    : `The second fill was ${Math.abs(priceDifference).toLocaleString('en-US', { maximumSignificantDigits: 4 })} pUSD ${priceDifference > 0 ? 'higher' : 'lower'}.`;
  let groupedFill: { quantity: number; average: number } | undefined;
  if (pair && explanation === 'split') {
    const [a, b] = pair;
    if (typeof a.size === 'number' && Number.isFinite(a.size) && a.size > 0 &&
      typeof b.size === 'number' && Number.isFinite(b.size) && b.size > 0) {
      const quantity = a.size + b.size;
      groupedFill = { quantity, average: (a.size * a.price + b.size * b.price) / quantity };
    }
  }
  const selected = explanation === 'planned' || explanation === 'split' || explanation === 'news' ? `public-${explanation}` as const : undefined;
  const [directCorrection, setDirectCorrection] = useState(false);
  const retainedBasis = otherReason || (explanation && explanations[explanation].label) || 'Your confirmation of these fills';
  const next = explanation ? explanations[explanation].next
    : feedback === 'Needs correction' || feedback === 'Partly right' ? explanations.unknown.next
    : 'Review the orders behind these fills and add a note about your original plan.';
  return (
    <>
      {showExample && <div className="twin-dialogue-turn">
        <span className="twin-dialogue-speaker">Twin</span>
        <h3>What usually makes you buy again?</h3>
        <p>Send your Polymarket profile and I will look for patterns in recent public fills.</p>
      </div>}
      {(loading || Boolean(records?.length)) && (
        <div className="twin-dialogue-source"><span>You</span>
          <p>{records?.length ? `Polymarket ${review?.source}` : draft.trim()}</p>
        </div>
      )}
      {!records?.length && <form onSubmit={event => {
        event.preventDefault();
        const address = new FormData(event.currentTarget).get('address');
        if (typeof address === 'string') void load(address.trim());
      }}>
        {saved && (
          <aside className="twin-saved-reminder" aria-label="My review reminder">
            <strong>My review reminder</strong>
            <p>{reminders[saved]}</p>
            <button type="button" onClick={() => onSave()}>Remove reminder</button>
          </aside>
        )}
        <div role="status">{saveStatus}</div>
        <div className="twin-note-input twin-public-input">
          <label htmlFor="trade-public-address">Polymarket profile URL or public address</label>
          <div className="twin-public-input-row">
            <input ref={addressInput} id="trade-public-address" name="address" value={draft}
              onChange={event => {
                onDraftChange(event.target.value);
                setInvalidAddress(false);
                setError('');
                setReview(undefined);
                setProfileLink(undefined);
              }}
              aria-invalid={invalidAddress || undefined}
              placeholder="Paste your profile URL"
              aria-describedby={failed ? 'trade-read-feedback' : undefined}
              required inputMode="url" autoCapitalize="none" enterKeyHint="go" autoComplete="off" spellCheck={false} disabled={loading} />
            <div className="twin-public-input-actions">
              {loading ? <button type="button" onClick={() => {
                restoreAddressFocus.current = true;
                activeRequest.current?.abort();
                activeRequest.current = null;
                setLoading(false);
              }}>Cancel lookup</button> : (
                <button type="submit" data-primary aria-label="Read public trades" title="Read public trades"><span aria-hidden="true">↑</span></button>
              )}
            </div>
          </div>
        </div>
        {loading && <div className="twin-dialogue-turn twin-dialogue-status" data-twin-activity={active ? "working" : undefined}>
          <span className="twin-dialogue-speaker">Twin</span>
          <p role="status">{reconnecting ? 'No response yet. Retrying…' : 'Reading trades from Polymarket…'}</p>
        </div>}
        {failed && (
          <p id="trade-read-feedback" className={invalidAddress ? "twin-profile-error" : undefined} role={error ? 'alert' : 'status'}>
            {error || (showExample ? 'No public trades found. Check the address.' : 'This profile returned no public fills to review.')}
          </p>
        )}
        <div className="twin-trade-entry-options">
          {showExample && !loading && <button type="button" onClick={onSample}>Try an example</button>}
        </div>
        <details className="twin-trade-link-help">
          <summary>Where is my profile link?</summary>
          <p><a href="https://polymarket.com/" target="_blank" rel="noopener noreferrer">Open Polymarket</a>, open your profile, and copy the URL.</p>
        </details>
      </form>}
      {failed && profileLink && (
        <p><a href={profileLink} target="_blank" rel="noopener noreferrer">View this profile on Polymarket</a></p>
      )}
      {!showExample && !loading && failed && !invalidAddress && onOtherSource && <section className="twin-missing-detail" aria-label="Continue without public fills">
        <p>{error ? 'While the trades are unavailable, you can try a hypothetical decision.' : 'You can try this hypothetical decision while keeping your profile link.'}</p>
        <DecisionFollowUp key={review?.source} starter inline basis={starterBasis}
          prediction={starterPrediction} persistent={persistentUnderstanding} onNext={onOtherSource} />
      </section>}
      {!!review?.records.length && (
        <div className="twin-trade-result" ref={result} tabIndex={-1}>
          <div className="twin-trade-source">
            <p className="twin-trade-scope">
              <span>Public trades reviewed: {review.records.length}</span>
            </p>
            <button type="button" className="twin-trade-source-clear" onClick={() => {
              restoreAddressFocus.current = true;
              setReview(undefined);
              onDraftChange('');
              setFeedback(undefined);
              setExplanation(undefined);
              setOtherReason('');
              setReasonDraft('');
            }}>Clear this review</button>
          </div>
          {!showExample && pair && <DecisionEvidence
            label={groupedFill ? 'I regrouped the fills into one order' : 'I found two buys on the same outcome'}
            detail={groupedFill
              ? 'I’ll review the order once, using both fills.'
              : pair[1].title + ' · I’ve pulled these two fills together for review.'}
            waiting={active && !arrival.ready} onOpen={arrival.open}>
            <ol className="twin-prepared-fills" aria-label="Fills Twin prepared for review">
              {groupedFill ? <li key="grouped">
                <span>One order · two fills</span>
                <strong>{summarySize.format(groupedFill.quantity)} shares · {summaryPrice.format(groupedFill.average)} pUSD weighted average</strong>
              </li> : pair.map(trade => <li key={trade.timestamp}>
                <TradeTime timestamp={trade.timestamp} />
                <strong><TradeAmount trade={trade} concise /></strong>
              </li>)}
            </ol>
          </DecisionEvidence>}
          {!showExample && !pair && !arrival.ready && <DecisionEvidence
            label="Public fills reviewed" detail="Twin prepared a replay to check how you would decide."
            waiting={active} onOpen={arrival.open} openLabel="Open the replay ↗" />}
          <JudgmentSurface enabled={active && !showExample && Boolean(pair)}>
          <div ref={arrival.anchor} className="twin-judgment-arrival" hidden={!arrival.ready}>
          {pair ? (
            <SwipeJudgmentCard feedback={feedback} onAssess={assess} onLater={showExample ? undefined : arrival.later}>
              <h3>{showExample ? 'Were these two buys part of the same plan?' : feedback ? 'How you explained these fills' : 'You may plan entries in stages.'}</h3>
              <p className="twin-trade-judgment" aria-live="polite">
                {(showExample || feedback) && <strong>{feedback ? 'Current judgment' : 'Twin hypothesis'}</strong>}{' '}
                {!feedback ? (showExample
                  ? 'You may have planned two buys, or one order may have filled twice. The fills alone do not show your reason.'
                  : 'Two buys on the same outcome. The fills show the sequence. You can tell me what drove it.')
                  : explanation === 'planned' ? 'You said these were two planned buys.'
                  : explanation === 'split' ? 'You said these were fills from one order.'
                  : explanation === 'news' ? 'You said new information changed your view before you added.'
                  : explanation === 'other' && otherReason.trim() ? 'I updated the review using your correction.'
                  : 'The reason for these fills is still uncertain.'}
              </p>
              <div className="twin-card-evidence">
                {showExample && <small>Evidence · Same outcome bought at different times</small>}
                {showExample && <p>{pair[1].title}{typeof pair[1].outcome === 'string' && pair[1].outcome ? ` · ${pair[1].outcome}` : ''}</p>}
                <details>
                  <summary>Show both fills</summary>
                  <ol className="twin-trade-fills">{pair.map(trade => (
                    <li key={trade.timestamp}><TradeTime timestamp={trade.timestamp} /> · <TradeAmount trade={trade} concise /></li>
                  ))}</ol>
                  {!showExample && <p>{priceDifferenceText}</p>}
                </details>
                {showExample && <p>{priceDifferenceText}</p>}
              </div>
            </SwipeJudgmentCard>
          ) : (
            <h3>{buys} {buys === 1 ? 'buy' : 'buys'} · {sells} {sells === 1 ? 'sell' : 'sells'}</h3>
          )}
          {pair ? (
            <>
              {editingReason && (feedback === 'Partly right' || feedback === 'Needs correction') && (
                <fieldset className="twin-correction-reply" ref={correctionOptions} tabIndex={-1}>
                  <legend>{showExample ? "What made you buy again?" : "How should I read these two fills?"}</legend>
                  <button type="button" className="twin-change-source" onClick={() => { setEditingReason(false); setFeedback(undefined); }}>← Back to judgment</button>
                  {showExample ? <><form className="twin-correction-composer" onSubmit={event => {
                    event.preventDefault();
                    const reason = reasonDraft.trim();
                    if (!reason) return;
                    setOtherReason(reason);
                    setExplanation('other');
                    setReasonDraft('');
                    setEditingReason(false);
                  }}>
                    <label className="twin-trade-correction">
                      Reason for this review
                      <textarea rows={2} maxLength={240} placeholder="E.g. I had already placed two limit orders"
                        value={reasonDraft} onChange={event => setReasonDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }} />
                    </label>
                    <InitiativeVoice onTranscript={setReasonDraft} />
                    <button type="submit" aria-label="Send correction" title="Send correction" disabled={!reasonDraft.trim()}>
                      <span aria-hidden="true">↑</span>
                    </button>
                  </form>
                  <div className="twin-correction-suggestions">
                    {(Object.keys(explanations) as Explanation[]).map(key => (
                      <button key={key} type="button" aria-pressed={explanation === key} onClick={() => {
                        setExplanation(key);
                        if (key !== 'other') setOtherReason('');
                        setEditingReason(key === 'other' && !otherReason);
                      }}>
                        {explanations[key].label}
                      </button>
                    ))}
                  </div></> : <>
                    <div className="twin-fill-arrangements">
                      <button type="button" onClick={() => {
                        setExplanation('split'); setOtherReason(''); setEditingReason(false); setDirectCorrection(true);
                      }}>
                        <span className="twin-fill-arrangement twin-fill-arrangement-joined" aria-hidden="true"><i /><i /></span>
                        <strong>One order, two fills</strong>
                        <small>Group both fills</small>
                      </button>
                      <button type="button" onClick={() => {
                        setExplanation('planned'); setOtherReason(''); setEditingReason(false); setDirectCorrection(true);
                      }}>
                        <span className="twin-fill-arrangement" aria-hidden="true"><i /><i /></span>
                        <strong>Two buys I planned</strong>
                        <small>Keep both decisions</small>
                      </button>
                    </div>
                    <div className="twin-fluid-actions">
                      <button type="button" className="twin-change-source" onClick={() => {
                        setExplanation('news'); setOtherReason(''); setEditingReason(false); setDirectCorrection(true);
                      }}>New information changed my decision</button>
                      <button type="button" className="twin-change-source" onClick={() => {
                        setExplanation('unknown'); setOtherReason(''); setEditingReason(false); setDirectCorrection(false);
                      }}>Leave the reason open</button>
                    </div>
                  </>}
                </fieldset>
              )}
              {explanation && feedback !== 'Right' && (explanation !== 'other' || otherReason) && (
                <div className="twin-dialogue-source">
                  <span>You</span>
                  <p>{otherReason || explanations[explanation].label}</p>
                  {!editingReason && <button type="button" className="twin-dialogue-edit"
                    onClick={() => {
                      setReasonDraft(otherReason);
                      setEditingReason(true);
                      window.requestAnimationFrame?.(() => correctionOptions.current?.querySelector<HTMLElement>(showExample ? 'textarea' : '.twin-fill-arrangements button')?.focus());
                    }}>Edit correction</button>}
                </div>
              )}
              {(showExample || feedback === 'Right' || Boolean(explanation)) && <p className="twin-trade-advice" aria-live="polite">
                <strong>{explanation && (explanation !== 'other' || otherReason.trim()) ? 'Updated review suggestion' : 'Review suggestion'}</strong>{' '}
                {explanation === 'other' && !otherReason.trim() ? explanations.unknown.next : next}
              </p>}
              {active && !showExample && directCorrection && explanation && !editingReason && onOtherSource && <DecisionFollowUp
                key={'correction-' + explanation} basis={retainedBasis} prediction={next} persistent={persistentUnderstanding}
                observed={{
                  scenario: 'Two public fills bought the same outcome at different times.',
                  twinAction: 'The fills may reflect entries planned in stages.',
                  ownerAction: explanations[explanation].label,
                  reason: 'You selected: ' + explanations[explanation].label + '.',
                  matched: explanation === 'planned',
                }}
                onNext={onOtherSource} />}
              {active && !showExample && !directCorrection && feedback === 'Right' && onKeepUnderstanding && onOtherSource && <DecisionFollowUp
                key={explanation} basis={retainedBasis} retained={retainedUnderstandings?.some(item => item.basis === retainedBasis)} persistent={persistentUnderstanding}
                prediction={explanation === 'split' ? 'Another fill from the same order reflects the same decision.'
                  : explanation === 'news' ? 'When new information changes your view, you may reconsider the position.'
                  : explanation === 'planned' ? 'In a similar situation, you may plan your entries in stages.'
                  : next}
                onRemember={onKeepUnderstanding} onNext={onOtherSource} />}
              <SpeakTwinReply key={next} text={explanation === 'other' && !otherReason.trim() ? explanations.unknown.next : next} />
              {showExample && (explanation === 'news' || explanation === 'split' || explanation === 'planned') && (
                <TradeNoteComposer correction={explanation} tradeTimestamp={pair[1].timestamp} tradePrice={pair[1].price} />
              )}
            </>
          ) : (
            <div>
              <p>I do not have enough evidence here to infer a trading habit.</p>
              {recurringOutcome && (
                <p>Most traded: {recurringOutcome.trade.title}
                  {recurringOutcome.trade.outcome && ` · ${recurringOutcome.trade.outcome}`} · {recurringOutcome.count} fills.
                </p>
              )}
              {showExample ? <>
              <p className="twin-trade-advice"><strong>Review suggestion</strong>{' '}
                {recurringOutcome ? 'Start with this outcome and compare your reasons for buying or selling with what you did.'
                  : 'The fills do not show your original plan or why you traded.'}
              </p>
              <SpeakTwinReply text={recurringOutcome ? 'Start with this outcome and compare your reasons for buying or selling with what you did.'
                : 'The fills do not show your original plan or why you traded.'} />
              <TradeNoteComposer fromPublicRecords />
              </> : onOtherSource && <>
                <p>I’ve prepared a hypothetical replay so you can show how you would decide.</p>
                <DecisionFollowUp key={review.records[0].transaction_hash} starter inline basis={starterBasis}
                  prediction={starterPrediction} persistent={persistentUnderstanding} onNext={onOtherSource} />
              </>}
            </div>
          )}
          </div>
          </JudgmentSurface>
          {showExample && (saved === 'public-planned' || saved === 'public-split' || saved === 'public-news') && (
            <aside aria-label="Previously saved review reminder" className="twin-saved-reminder">
              <strong>Previously saved review reminder</strong>
              <p>{reminders[saved]}</p>
              <button type="button" onClick={() => onSave()}>Remove reminder</button>
            </aside>
          )}
          {showExample && pair && selected && selected !== saved && (
            <p id="trade-reminder-scope">
              {saved ? 'This will replace the review reminder stored in this browser.' : 'This reminder is stored in this browser.'}
              You can remove it separately after clearing this review.
            </p>
          )}
          {showExample && pair && selected && (
            <div className="twin-trade-entry-options">
              <button
                type="button"
                className="twin-trade-save"
                aria-disabled={selected === saved || undefined}
                aria-describedby={selected !== saved ? 'trade-reminder-scope' : undefined}
                onClick={() => { if (selected !== saved) onSave(selected); }}
              >
                {selected === saved ? 'Reminder saved' : saved ? 'Update reminder' : 'Save reminder'}
              </button>
            </div>
          )}
          <div role="status">{saveStatus}</div>
          <details>
            <summary>View trade evidence</summary>
            <p>Trade dates: <TradeTime timestamp={Math.min(...timestamps)} />
              {Math.min(...timestamps) !== Math.max(...timestamps) && (
                <> to <TradeTime timestamp={Math.max(...timestamps)} /></>
              )}
            </p>
            <ul>{review.records.map((record, index) => (
              <li key={index}>
                <TradeTime timestamp={record.timestamp} /> · {record.title}
                {typeof record.outcome === 'string' && record.outcome.trim() && ` · ${record.outcome}`}
                {' · '}{record.side === 'BUY' ? 'Buy' : 'Sell'} · <TradeAmount trade={record} />
                {pair?.includes(record) && <strong className="twin-trade-cited">Used in this judgment</strong>}
                {!pair && recurringOutcome && record.token_id === recurringOutcome.trade.token_id && (
                  <strong className="twin-trade-cited">Suggested for review</strong>
                )}
              </li>
            ))}</ul>
          </details>
        </div>
      )}
    </>
  );
}

function readLocalFillPattern(text: string) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (!header?.includes(',')) return undefined;
  // Match standard CSV fields, including commas and doubled quotes in quoted columns.
  const fields = (line: string) => Array.from(
    (',' + line).matchAll(/,(?:"((?:[^"]|"")*)"|([^,"]*))(?=,|$)/g),
    match => (match[1] ?? match[2]).replace(/""/g, '"').trim(),
  );
  const names = fields(header).map(name => name.toLowerCase());
  const timeColumn = names.findIndex(name => /^(?:timestamp|time|date|filled_at)$/.test(name));
  const marketColumn = names.findIndex(name => /^(?:market|symbol|asset|ticker)$/.test(name));
  const sideColumn = names.indexOf('side');
  const priceColumn = names.indexOf('price');
  const outcomeColumn = names.indexOf('outcome');
  if ([timeColumn, marketColumn, sideColumn, priceColumn].includes(-1)) return undefined;
  const rows = new Map<PublicTrade, string>();
  const trades = lines.slice(0, 600).flatMap((line, index): PublicTrade[] => {
    const row = fields(line);
    if (row.length !== names.length) return [];
    const [time, title, sideValue, priceText] = [row[timeColumn], row[marketColumn], row[sideColumn], row[priceColumn]];
    const epoch = /^\d{10}(?:\d{3})?$/.test(time) ? Number(time) / (time.length === 13 ? 1000 : 1)
      : /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(time) ? Date.parse(time) / 1000 : NaN;
    const side = sideValue.toUpperCase();
    const price = Number(priceText);
    if (!title || !priceText || !Number.isFinite(epoch) || !Number.isFinite(price) || price <= 0 || (side !== 'BUY' && side !== 'SELL')) return [];
    const trade: PublicTrade = { timestamp: epoch, title, side, price, token_id: JSON.stringify([title, row[outcomeColumn]]), transaction_hash: String(index) };
    rows.set(trade, line);
    return [trade];
  });
  if (trades.length !== lines.length) return undefined;
  const pair = findRepeatedBuy(trades);
  if (!pair) return undefined;
  return {
    premise: pair.map(trade => rows.get(trade)).join('\n'),
    prediction: 'In a similar situation, you might enter in stages. These two fills could also come from one order.',
  };
}

function inferLocalDecision(text: string): { premise?: string; prediction?: string; fromFills?: boolean } {
  const fills = readLocalFillPattern(text);
  if (fills) return { ...fills, fromFills: true };
  const condition = text.match(/(?:^|[.!?\n]\s*)(?:if|when|如果|当)\s*([^,.，。;；\n]{2,140})[,，]\s*([^.!?。\n]{2,160})/i);
  if (condition && /\b(?:I|we)\b|我|本人/i.test(condition[2])) {
    return {
      premise: condition[0].trim(),
      prediction: 'When ' + condition[1] + ', you might follow this rule: “' + condition[2] + '”.',
    };
  }
  const premise = text.split(/\n+/).find(line => /\b(wait|unless|only if|new information|news|pullback|buy|sell|add)\b|等待|只有|消息|回调|买入|卖出|加仓/i.test(line));
  const prediction = premise && (/wait.{0,35}pullback|等.{0,12}回调/i.test(premise) && !/don't|not|never|不会|不等/i.test(premise)
    ? 'If the price rises first, you might wait for a pullback before buying.'
    : /wait|unless|only if|等待|只有/i.test(premise) && /news|information|消息/i.test(premise)
      ? 'If the price rises without new information, you might wait before adding.' : undefined);
  return { premise, prediction };
}

function LocalDecisionReview({ active, onFileSelected, followUp, savedUnderstanding, onKeepUnderstanding, retainedUnderstandings, persistentUnderstanding }: {
  active: boolean;
  onFileSelected: () => void;
  followUp?: RetainedUnderstanding;
  savedUnderstanding?: RetainedUnderstanding;
} & UnderstandingAccess) {
  const trial = new URLSearchParams(window.location.search).get('start') === '1';
  const [text, setText] = useState(followUp?.evidence?.reason ?? '');
  const [record, setRecord] = useState(followUp?.evidence?.reason ?? '');
  const [editingSource, setEditingSource] = useState(false);
  const [answer, setAnswer] = useState<Parameters<typeof SwipeJudgmentCard>[0]['feedback']>();
  const [leftOpen, setLeftOpen] = useState(false);
  const [fillCorrection, setFillCorrection] = useState<'split' | 'planned' | 'news'>();
  const [message, setMessage] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const [filePreview, setFilePreview] = useState<{ name: string; excerpt: string; truncated: boolean }>();
  const previewHeading = useRef<HTMLElement>(null);
  const chooseFile = useRef<HTMLButtonElement>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const fileRequest = useRef(0);

  useEffect(() => {
    if (filePreview) previewHeading.current?.focus();
  }, [filePreview]);

  async function previewFile(file: File) {
    const request = ++fileRequest.current;
    if (file.size > 65536 || !/\.(txt|md|csv)$/i.test(file.name)) {
      setReadingFile(false);
      setMessage('Choose a TXT, Markdown or CSV file under 64 KB.');
      return;
    }
    setReadingFile(true);
    setMessage('');
    try {
      const content = await file.text();
      const excerpt = content.slice(0, 8000);
      if (request !== fileRequest.current) return;
      if (!excerpt.trim()) { setMessage('This file is empty. Choose another.'); return; }
      setFilePreview({ name: file.name, excerpt, truncated: content.length > excerpt.length });
      setEditingSource(true);
    } catch {
      if (request === fileRequest.current) setMessage('Could not read this file. Choose it again or try another.');
    } finally {
      if (request === fileRequest.current) setReadingFile(false);
    }
  }
  const input = useRef<HTMLTextAreaElement>(null);
  const [nextDecision, setNextDecision] = useState<RetainedUnderstanding>();
  const [correctedFillRows, setCorrectedFillRows] = useState<string>();
  const [comparison, setComparison] = useState<'same' | 'exception'>();
  const [comparisonReceipt, setComparisonReceipt] = useState<CalibrationEvidence>();
  const baseline = nextDecision || followUp;
  const [modelReading, setModelReading] = useState<{ source: string; result?: LocalDecisionReading; unavailable?: boolean }>();
  const direct = inferLocalDecision(record);
  const matchingReading = (modelReading?.source === record) ? modelReading : undefined;
  const premise = direct.prediction ? direct.premise : matchingReading?.result?.quote;
  const prediction = direct.prediction || matchingReading?.result?.prediction;
  const modelPending = Boolean(record && !direct.prediction && !matchingReading);
  useEffect(() => {
    if (!record || direct.prediction) return;
    const controller = new AbortController();
    void readLocalDecision(record, controller.signal).then(result => {
      if (!controller.signal.aborted) setModelReading({ source: record, result });
    }).catch(() => {
      if (!controller.signal.aborted) setModelReading({ source: record, unavailable: true });
    });
    return () => controller.abort();
  }, [record, direct.prediction]);
  const [starterOpen, setStarterOpen] = useState(false);
  const arrival = usePredictionArrival(active && !starterOpen && prediction ? record : undefined, true);
  const correcting = answer === 'Needs correction' || answer === 'Partly right';
  const fillExplanation = fillCorrection ? explanations[fillCorrection] : undefined;
  const reviewText = filePreview?.excerpt ?? text;
  const showSource = (!record || editingSource) && !starterOpen;
  const sameApproach = useRef<HTMLButtonElement>(null);
  function reviseComparison() {
    setComparison(undefined);
    setComparisonReceipt(undefined);
    window.requestAnimationFrame(() => sameApproach.current?.focus());
  }
  const comparingNewSource = Boolean(baseline?.evidence && record !== baseline.evidence.reason && prediction && !editingSource);
  const needsReplay = Boolean(record && !modelPending && !prediction && !baseline?.evidence && !editingSource);
  function finishStarter(basis: string, prediction: string, evidence?: CalibrationEvidence) {
    setNextDecision({ basis, prediction, evidence });
    setStarterOpen(false);
    setText(evidence?.reason ?? '');
    setRecord(evidence?.reason ?? '');
  }
  const localStep = !record ? 0 : answer === 'Right' ? 3 : prediction && arrival.ready ? 2 : 1;
  return <section className="twin-fluid-step" aria-label="Other trading information">
    <ol className="twin-decision-stages" aria-label="Guided decision review">
      {['A · Share', 'B · Find the condition', 'C · Check my prediction', 'D · Test it again'].map((label, index) =>
        <li key={label} aria-current={index === localStep ? 'step' : undefined}>{label}</li>)}
    </ol>
    {showSource && <span className="twin-dialogue-speaker">Twin</span>}
    {showSource && <p>{baseline ? 'Twin can compare a real trade export or decision note with the earlier decision.'
      : 'An existing trade export or decision note is enough. I’ll look for one decision pattern you can check.'}</p>}
    {active && showSource && !record && !baseline && <button type="button" className="twin-review-later" onClick={() => setStarterOpen(true)}>
      Try one decision without a file ↗
    </button>}
    {active && starterOpen && <>
      <button type="button" className="twin-change-source" onClick={() => setStarterOpen(false)}>← Back to files</button>
      <DecisionFollowUp starter basis={starterBasis} prediction={starterPrediction} persistent={persistentUnderstanding}
        onNext={finishStarter} />
    </>}
    {baseline && savedUnderstanding && <p className="twin-next-context">Understanding you kept: {savedUnderstanding.basis}</p>}
    <form className="twin-note-composer" hidden={!showSource} onSubmit={event => {
      event.preventDefault();
      if (!reviewText.trim()) return;
      setEditingSource(false); setRecord(reviewText.trim()); setComparison(undefined); setComparisonReceipt(undefined); setAnswer(undefined);
      setLeftOpen(false); setFillCorrection(undefined); setMessage('');
    }}>
      <input hidden ref={picker} type="file" accept=".txt,.md,.csv,text/plain,text/csv" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        if (!active) {
          onFileSelected();
          setEditingSource(true);
        }
        void previewFile(file);
      }} />
      {filePreview ? <section className="twin-file-preview" aria-label="Local file preview">
        <strong ref={previewHeading} tabIndex={-1}>{filePreview.name}</strong>
        <p>{filePreview.truncated ? 'The file is longer than this preview. Twin will review only the excerpt shown here.' : 'Twin can review this text on your device.'}</p>
        <pre>{filePreview.excerpt}</pre>
      </section> : !pasteOpen && <div className="twin-file-drop" data-dragging={draggingFile || undefined}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDraggingFile(true);
        }}
        onDragLeave={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDraggingFile(false);
        }}
        onDrop={event => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDraggingFile(false);
          if (event.dataTransfer.files.length !== 1) { setMessage('Drop one file at a time.'); return; }
          void previewFile(event.dataTransfer.files[0]);
        }}>
        <button ref={chooseFile} type="button" onClick={() => picker.current?.click()}>Choose a local file</button>
        <small className="twin-drop-instruction">or drop a file here</small>
        <small>TXT, Markdown or CSV · Up to 64 KB</small>
      </div>}
      {pasteOpen && !filePreview && <label>Trading information<textarea ref={input} rows={3} value={text} maxLength={8000} onChange={event => setText(event.target.value)} /></label>}
      <div className="twin-fluid-actions">
        {filePreview && <>
          <button type="button" onClick={() => picker.current?.click()}>Replace file</button>
          <button type="button" className="twin-change-source" onClick={() => {
            fileRequest.current++;
            setFilePreview(undefined);
            setReadingFile(false);
            setMessage('');
            window.requestAnimationFrame(() => (pasteOpen ? input.current : chooseFile.current)?.focus());
          }}>Remove file</button>
        </>}
        {!filePreview && !pasteOpen && <button type="button" disabled={readingFile} className="twin-change-source" onClick={() => {
          setPasteOpen(true);
          window.requestAnimationFrame(() => input.current?.focus());
        }}>Paste an existing excerpt</button>}
        {(filePreview || pasteOpen) && <button type="submit" disabled={!reviewText.trim() || readingFile}>Send to Twin ↑</button>}
      </div>
      {readingFile && <p role="status">Preparing a local preview…</p>}
      {message && <small role="status">{message}</small>}
    </form>
    {record && !baseline?.evidence && !showSource && !starterOpen && <button className="twin-review-later" type="button" onClick={() => {
      setEditingSource(true);
      window.requestAnimationFrame(() => input.current?.focus());
    }}>Edit the information I shared</button>}
    {baseline && record && !starterOpen && <section className="twin-next-example" aria-label="Compare the next decision">
      <span className="twin-dialogue-speaker">Twin · Follow-up</span>
      <p><strong>Earlier prediction</strong> · {baseline.prediction}</p>
      {baseline.evidence?.platformExampleRemoved && <p role="status">Removed from your training set.</p>}
      {baseline.evidence?.platformExampleId && <TrainingReceipt key={baseline.evidence.platformExampleId} exampleId={baseline.evidence.platformExampleId}
        onRemoved={() => {
          if (baseline.evidence) setNextDecision({ ...baseline, evidence: {
            ...baseline.evidence, platformExampleId: undefined, platformExampleRemoved: true,
          } });
        }} />}
      {baseline.evidence && <p><strong>Previous check</strong> · Twin chose {baseline.evidence.twinAction}. You chose {baseline.evidence.ownerAction}.</p>}
      <blockquote>{baseline.evidence?.reason ?? record}</blockquote>
      {correctedFillRows && <details>
        <summary>Original source rows</summary>
        <pre className="twin-local-fill-rows">{correctedFillRows}</pre>
      </details>}
      {baseline.evidence ? <>
        <p role="status">This example records your choices in this scenario.</p>
        {trial && baseline.basis === starterBasis && <div className="twin-fluid-actions">
          <button type="button" className="twin-change-source" onClick={() => {
            const { scenario, twinAction, ownerAction, matched, reason } = baseline.evidence!;
            try {
              window.sessionStorage.setItem(trialExampleKey, JSON.stringify({
                scenario, twinAction, ownerAction, matched, reason, expiresAt: Date.now() + 30 * 60_000,
              }));
              window.location.assign(trialExampleSignIn);
            } catch {
              setMessage('This browser could not keep the replay for sign-in. You can continue here.');
            }
          }}>Sign in to review and save this example ↗</button>
        </div>}
        {comparingNewSource && <div className="twin-missing-detail" aria-label="Compare with the earlier choice">
          <p><strong>What Twin inferred from the new source</strong> · {prediction}</p>
          {!comparison ? <div className="twin-fluid-actions">
            <button ref={sameApproach} type="button" onClick={() => setComparison('same')}>Same approach</button>
            <button type="button" onClick={() => setComparison('exception')}>Different approach</button>
          </div> : <p role="status">{comparison === 'same' ? 'You marked these decisions as using the same approach.'
            : 'You marked these decisions as using different approaches.'}{' '}
            {comparisonReceipt && !comparisonReceipt.platformExampleId && <button type="button" className="twin-change-source" onClick={reviseComparison}>Change my answer</button>}
          </p>}
          {comparison && prediction && (comparisonReceipt
            ? comparisonReceipt.platformExampleId
              ? <TrainingReceipt exampleId={comparisonReceipt.platformExampleId}
                  onRemoved={() => setComparisonReceipt(undefined)} />
              : <p role="status">This comparison is kept in this review.</p>
            : <DecisionFollowUp key={comparison} basis={baseline.basis} prediction={prediction} persistent={persistentUnderstanding}
                observed={{
                  scenario: 'Compare a hypothetical choice with a decision in a trade file.',
                  twinAction: 'Proposed an interpretation of the new trade file',
                  ownerAction: comparison === 'same' ? 'Same approach' : 'Different approach',
                  reason: 'Earlier choice: ' + baseline.evidence.ownerAction.slice(0, 100) + '. New interpretation: ' + prediction.slice(0, 420),
                  matched: comparison === 'same',
                }}
                onObservedBack={reviseComparison} onNext={(_basis, _prediction, evidence) => setComparisonReceipt(evidence)} />)}
        </div>}
        {!editingSource && (!comparingNewSource || comparisonReceipt) && <div className="twin-missing-detail">
          <p>{baseline.evidence.scenario.toLowerCase().includes('fill')
            ? 'A trade export from a different order can help check whether your correction applies again.'
            : baseline.evidence.matched
              ? 'We made the same move here. A dated trade export can help check whether you usually make this choice.'
              : 'We made different moves here. A dated trade export can help check whether the timing you chose also appears in your trades.'}</p>
          <button type="button" disabled={readingFile} onClick={() => picker.current?.click()}>Choose a trade file ↗</button>
          {readingFile && <small role="status">Preparing a local preview…</small>}
          {message && <small role="status">{message}</small>}
        </div>}
      </> : !comparison ? <div className="twin-fluid-actions">
        <button type="button" onClick={() => setComparison('same')}>This fits the rule</button>
        <button type="button" onClick={() => setComparison('exception')}>This was an exception</button>
      </div> : <p role="status">{comparison === 'same'
        ? 'You marked this example as consistent. We can still check how the rule holds in a different situation.'
        : 'You marked an exception. Use the judgment below to correct what changes your decision.'}</p>}
    </section>}
    {modelPending && !starterOpen && <p role="status" data-twin-activity={active ? 'working' : undefined}>Twin is reading your note on this device…</p>}
    {record && !modelPending && !starterOpen && (prediction ? <>
      <DecisionEvidence label={direct.fromFills ? "I found two buys in the same market" : "I found a condition in what you shared"}
        detail={direct.fromFills ? 'The two rows show separate fills. The record alone leaves the reason open.'
          : premise || 'I used the condition and response in your material.'}
        waiting={active && !arrival.ready} onOpen={arrival.open}>
        {direct.fromFills && <details><summary>Source rows</summary><pre className="twin-local-fill-rows">{premise}</pre></details>}
      </DecisionEvidence>
      <JudgmentSurface enabled={active}>
      <div ref={arrival.anchor} className="twin-judgment-arrival" hidden={!arrival.ready}>
      {answer === 'Right' ? <details className="twin-confirmed-prediction">
        <summary>Confirmed prediction</summary>
        <p>{prediction}</p>
        {premise && <blockquote>{premise}</blockquote>}
        <button type="button" onClick={() => setAnswer('Needs correction')}>Correct this prediction</button>
      </details> : <SwipeJudgmentCard feedback={answer} onAssess={next => { setAnswer(next); setLeftOpen(false); setFillCorrection(undefined); }} onLater={arrival.later}>
        <small>Prediction · {direct.fromFills ? "based on your local fills" : "based on your description"}</small>
        <h3>{prediction}</h3>
        <details><summary>What Twin used</summary><blockquote>{premise}</blockquote>
        </details>
      </SwipeJudgmentCard>}
      {correcting && <section className="twin-missing-detail" aria-label="Correct this judgment">
        <button type="button" className="twin-change-source" onClick={() => {
          setAnswer(undefined); setLeftOpen(false); setFillCorrection(undefined);
        }}>← Back to judgment</button>
        {direct.fromFills && !leftOpen && <>
          <p>How do these two fills relate to your decision?</p>
          <div className="twin-fluid-actions">
            {(['split', 'planned', 'news'] as const).map(option => <button key={option} type="button"
              aria-pressed={fillCorrection === option} onClick={() => setFillCorrection(option)}>
              {explanations[option].label}
            </button>)}
          </div>
          {fillExplanation && <p role="status"><strong>Updated review suggestion</strong> · {fillExplanation.next}</p>}
        </>}
        {leftOpen ? <p role="status">Left open. I won’t treat this prediction as confirmed.</p> :
          <button type="button" className="twin-change-source" onClick={() => setLeftOpen(true)}>Leave this judgment open</button>}
      </section>}
      {active && ((!leftOpen && correcting && (!direct.fromFills || fillExplanation)) ||
        (answer === 'Right' && onKeepUnderstanding)) && premise && <DecisionFollowUp
        key={fillCorrection ?? premise} basis={premise} prediction={fillExplanation?.next ?? prediction}
        observed={correcting && fillExplanation ? {
          scenario: 'Two fills in your local export bought the same outcome.',
          twinAction: 'The fills may reflect entries planned in stages.',
          ownerAction: fillExplanation.label,
          reason: 'You selected: ' + fillExplanation.label + '.',
          matched: fillCorrection === 'planned',
        } : undefined}
        retained={retainedUnderstandings?.some(item => item.basis === premise)} persistent={persistentUnderstanding}
        onRemember={answer === 'Right' ? onKeepUnderstanding : undefined} onNext={(basis, prediction, evidence) => {
          setNextDecision({ basis, prediction, evidence });
          setCorrectedFillRows(direct.fromFills && fillExplanation ? premise : undefined);
          setComparison(undefined);
          setComparisonReceipt(undefined);
          setFilePreview(undefined);
          setPasteOpen(false);
          setText(evidence?.reason ?? ''); setRecord(evidence?.reason ?? ''); setAnswer(undefined); setLeftOpen(false); setFillCorrection(undefined); setMessage(''); setEditingSource(false);
          window.requestAnimationFrame(() => input.current?.focus());
        }} />}
      {active && answer === 'Right' && <SpeakTwinReply text={prediction} />}
      </div>
      </JudgmentSurface>
    </> : needsReplay && <section className="twin-missing-detail">
      <span className="twin-dialogue-speaker">Twin · One thing is missing</span>
      <p role="status">{matchingReading?.unavailable ? 'The local model is unavailable. ' : ''}
        I can’t tell from this excerpt what would have changed your decision.</p>
      <DecisionFollowUp key={record} starter inline basis={starterBasis}
        prediction={starterPrediction} persistent={persistentUnderstanding} onNext={finishStarter} />
    </section>)}
  </section>;
}

export function TradeReview({ onResult, initiallyOpen = false, guidedSources = false, showPreparedStarter = true, voiceHeard = false, onBackToVoice, savedUnderstanding, onKeepUnderstanding, retainedUnderstandings, persistentUnderstanding }: {
  onResult?: (status: TradeReviewStatus) => void;
  initiallyOpen?: boolean;
  guidedSources?: boolean;
  showPreparedStarter?: boolean;
  voiceHeard?: boolean;
  onBackToVoice?: () => void;
  savedUnderstanding?: RetainedUnderstanding;
} & UnderstandingAccess) {
  const [resumedTrial] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return guidedSources && !persistentUnderstanding && query.get('start') === '1' && query.get('resume-example') === '1'
      ? readTrialExample() : undefined;
  });
  const [trialExample, setTrialExample] = useState(() =>
    persistentUnderstanding && new URLSearchParams(window.location.search).get('resume-example') === '1'
      ? readTrialExample() : undefined);
  function dismissTrialExample() {
    try { window.sessionStorage.removeItem(trialExampleKey); } catch { /* The current view can still close. */ }
    setTrialExample(undefined);
  }
  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState(() => {
    try {
      return window.sessionStorage.getItem(tradeDraftKey) ?? '';
    } catch {
      return '';
    }
  });

  function updateDraft(value: string) {
    setDraft(value);
    if (value.trim()) setStarterDismissed(true);
    try {
      const input = value.trim();
      const publicDraft = addressPattern.test(input) ? input : parseProfile(input)?.link;
      if (publicDraft) window.sessionStorage.setItem(tradeDraftKey, publicDraft);
      else window.sessionStorage.removeItem(tradeDraftKey);
    } catch {
      // The draft remains in memory when storage is unavailable.
    }
  }
  const [publicReview, setPublicReview] = useState(initiallyOpen && !resumedTrial);
  const [otherSource, setOtherSource] = useState(Boolean(resumedTrial));
  const [starterMounted, setStarterMounted] = useState(false);
  const [starterDismissed, setStarterDismissed] = useState(Boolean(resumedTrial));
  useEffect(() => setStarterMounted(true), []);
  const [sourcePaused, setSourcePaused] = useState(false);
  const [sourceChoicesOpen, setSourceChoicesOpen] = useState(!resumedTrial);
  const [followUp, setFollowUp] = useState<RetainedUnderstanding | undefined>(() =>
    resumedTrial ? { basis: starterBasis, prediction: starterPrediction, evidence: resumedTrial } : undefined);
  const [followUpVersion, setFollowUpVersion] = useState(0);
  const publicReviewEntry = useRef<HTMLButtonElement>(null);
  const restoreEntryFocus = useRef(false);
  const sampleCard = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publicReview && restoreEntryFocus.current) {
      restoreEntryFocus.current = false;
      (sampleCard.current?.querySelector<HTMLElement>('.twin-judgment-card') || publicReviewEntry.current)?.focus();
    }
  }, [publicReview, started]);
  const [feedback, setFeedback] = useState<Feedback>();
  const [correction, setCorrection] = useState<Correction>();
  const [saved, setSaved] = useState(readReminder);
  const [saveStatus, setSaveStatus] = useState('');
  const selected: Reminder | undefined = correction === 'planned' || correction === 'news'
    ? correction
    : feedback === 'Right' ? 'check' : undefined;

  function saveReminder(next?: Reminder) {
    try {
      if (next) window.localStorage.setItem(reminderKey, next);
      else window.localStorage.removeItem(reminderKey);
      setSaved(next);
      setSaveStatus(next ? 'Saved in this browser.' : 'Reminder removed.');
    } catch {
      setSaveStatus('Could not update the reminder in this browser.');
    }
  }

  const [sampleReply, setSampleReply] = useState('');
  const [sentSampleReply, setSentSampleReply] = useState('');
  const sampleCorrectionOptions = useRef<HTMLFormElement>(null);
  function assessSample(answer: Feedback, revealCorrection = false) {
    setFeedback(answer);
    setCorrection(undefined);
    setSampleReply('');
    setSentSampleReply('');
    if (revealCorrection && answer === 'Needs correction') {
      window.requestAnimationFrame?.(() => sampleCorrectionOptions.current?.querySelector('textarea')?.focus());
    }
  }
  const sourceSection = useRef<HTMLElement>(null);
  function openLocalSource(moveFocus = true) {
    setOtherSource(true);
    setPublicReview(false);
    setSourceChoicesOpen(false);
    setSourcePaused(false);
    setStarterDismissed(true);
    if (!moveFocus) return;
    window.requestAnimationFrame(() => {
      const chooseFile = sourceSection.current?.querySelector<HTMLButtonElement>('.twin-file-drop button');
      (chooseFile?.getClientRects().length ? chooseFile : sourceSection.current)?.focus();
    });
  }
  const needsCorrection = feedback === 'Partly right' || feedback === 'Needs correction';

  return (
    <section className="twin-trade-review" aria-labelledby="trade-title">
      {!initiallyOpen && <h2 id="trade-title">Review my trades</h2>}
      {initiallyOpen && <h2 id="trade-title" className="twin-trade-accessible-title">Review trades with Twin</h2>}
      {saved && !publicReview && (
        <div className="twin-saved-reminder">
          <strong>My review reminder</strong>
          <p>{reminders[saved]}</p>
          <button type="button" onClick={() => saveReminder()}>Remove reminder</button>
        </div>
      )}
      {!publicReview && <div role="status">{saveStatus}</div>}

      {guidedSources && showPreparedStarter && trialExample && <section className="twin-next-example" aria-label="Resume your practice example">
        <p>Here’s the example you brought from your practice replay.</p>
        <DecisionFollowUp basis={starterBasis} prediction={starterPrediction} persistent
          observed={trialExample} onNext={(basis, prediction, evidence) => {
            dismissTrialExample();
            setStarterDismissed(true);
            setFollowUp({ basis, prediction, evidence });
            setFollowUpVersion(version => version + 1);
            setSourceChoicesOpen(false);
            setOtherSource(true);
            setPublicReview(false);
          }} />
      </section>}
      {guidedSources && !trialExample && starterMounted && showPreparedStarter && sourceChoicesOpen && !sourcePaused && !starterDismissed && <DecisionFollowUp starter quietArrival
        basis={starterBasis} prediction={starterPrediction}
        persistent={persistentUnderstanding} onUseFile={() => {
          sourceSection.current?.querySelector<HTMLInputElement>('input[type=file]')?.click();
        }} onNext={(basis, prediction, evidence) => {
          setStarterDismissed(true);
          setFollowUp({ basis, prediction, evidence });
          setFollowUpVersion(version => version + 1);
          setSourceChoicesOpen(false);
          setOtherSource(true);
          setPublicReview(false);
        }} />}
      {guidedSources && <section ref={sourceSection} className="twin-fluid-step twin-source-switch" aria-label="Choose trading information" tabIndex={-1}>
        {sourceChoicesOpen ? <>
          {onBackToVoice && <button type="button" className="twin-change-source" onClick={onBackToVoice}>← Back to voice</button>}
          <span className="twin-dialogue-speaker">Twin</span>
          <p>{starterDismissed ? 'Choose which information you’d like me to review.' : voiceHeard ? 'You’ve heard my voice. Now let’s try a judgment about how you trade.'
            : 'I’ve prepared a short replay. You can try it, or share a real source for me to review.'}</p>
          <div className="twin-fluid-actions">
            <button type="button" aria-pressed={publicReview} onClick={() => { setOtherSource(false); setPublicReview(true); setSourceChoicesOpen(false); setSourcePaused(false); setStarterDismissed(true); }}>Polymarket profile</button>
            <button type="button" aria-pressed={otherSource} onClick={() => openLocalSource()}>Other trading information</button>

          </div>
        </> : <button type="button" className="twin-change-source" onClick={() => { setSourceChoicesOpen(true); setSourcePaused(true); }}>← Back to information sources</button>}
        <div hidden={!otherSource || sourcePaused}><LocalDecisionReview key={followUpVersion} active={otherSource && !sourcePaused} onFileSelected={() => openLocalSource(false)} followUp={followUp} savedUnderstanding={savedUnderstanding} onKeepUnderstanding={onKeepUnderstanding}
          retainedUnderstandings={retainedUnderstandings} persistentUnderstanding={persistentUnderstanding} /></div>
      </section>}
      {!guidedSources && <div hidden={publicReview || started}>
          <TradeNoteComposer firstReview />
          <div className="twin-trade-entry-options">
            <button ref={publicReviewEntry} type="button" onClick={() => setPublicReview(true)}>Read from Polymarket</button>
            <button type="button" onClick={() => { restoreEntryFocus.current = true; setStarted(true); }}>Try an example</button>
          </div>
      </div>}
      {guidedSources || publicReview ? (
        <>
          <div hidden={!publicReview || sourcePaused}><PublicTradeReview active={publicReview && !sourcePaused} showExample={!guidedSources} onKeepUnderstanding={onKeepUnderstanding}
            retainedUnderstandings={retainedUnderstandings} persistentUnderstanding={persistentUnderstanding}
            onOtherSource={(basis, prediction, evidence) => { setFollowUp({ basis, prediction, evidence }); setSourceChoicesOpen(false); setFollowUpVersion(version => version + 1); setOtherSource(true); setPublicReview(false); }} focusInput={!initiallyOpen} draft={draft} onDraftChange={updateDraft} saved={saved} saveStatus={saveStatus} onSave={saveReminder} onResult={onResult} onSample={() => {
            setStarted(true);
            restoreEntryFocus.current = true;
            setPublicReview(false);
          }} /></div>
          {!guidedSources && <div className="twin-trade-entry-options">
            <button type="button" onClick={() => {
              restoreEntryFocus.current = true;
              setPublicReview(false);
            }}>{initiallyOpen ? 'Use local notes' : 'Back to trade review'}</button>
          </div>}
        </>
      ) : started ? (
        <>
          <div ref={sampleCard}>
          <SwipeJudgmentCard feedback={feedback} onAssess={assessSample}>
            <small>Example · 4 fills</small>
            <h3>{!feedback ? 'You may add when the price rises.'
              : correction === 'planned' ? 'You planned to buy in stages.'
              : correction === 'news' ? 'New information prompted you to add to the position.'
              : needsCorrection ? 'I found four instances where you added after the price rose.'
              : 'You confirmed that the price rise prompted you to add.'}</h3>
            <p>{needsCorrection && !correction ? 'The price move is one clue. What prompted you to add is still unclear.' : 'All four example fills followed a price rise.'}</p>
            <details>
              <summary>Show four example trades</summary>
              <ul>
                {trades.map(trade => (
                  <li key={trade.date}>{trade.date} · {trade.market} · {trade.before} → {trade.after} · Added to position</li>
                ))}
              </ul>
            </details>
          </SwipeJudgmentCard>
          </div>
          {needsCorrection && !correction && !sentSampleReply && (
            <div className="twin-dialogue-turn twin-sample-reply">
              <span className="twin-dialogue-speaker">Twin</span>
              <p>Why did you add at the time?</p>
              <form ref={sampleCorrectionOptions} className="twin-correction-composer" onSubmit={event => {
                event.preventDefault();
                if (sampleReply.trim()) setSentSampleReply(sampleReply.trim());
              }}>
                <label>
                  <span className="twin-trade-accessible-title">Reply to Twin</span>
                  <textarea rows={2} maxLength={240} value={sampleReply} placeholder="Tell me what you were thinking"
                    onChange={event => setSampleReply(event.target.value)} />
                </label>
                <button type="submit" aria-label="Send correction" disabled={!sampleReply.trim()}><span aria-hidden="true">↑</span></button>
              </form>
              <div className="twin-correction-suggestions twin-trade-entry-options">
                <button type="button" onClick={() => setCorrection('planned')}>Planned buys</button>
                <button type="button" onClick={() => setCorrection('news')}>New information</button>
                <button type="button" onClick={() => setCorrection('unknown')}>Skip for now</button>
              </div>
            </div>
          )}
          {(correction || sentSampleReply || feedback === 'Right') && (
            <div className="twin-dialogue-turn">
              {sentSampleReply && <div className="twin-dialogue-source"><span>You</span><p>{sentSampleReply}</p></div>}
              <span className="twin-dialogue-speaker">Twin</span>
              <p aria-live="polite">
                <strong>{correction || sentSampleReply ? 'Updated review suggestion' : 'Review suggestion'}</strong>{' '}
                {sentSampleReply ? 'I have noted your reason. A price rise alone does not explain the buy.' : correction ? corrections[correction] : reminders.check}
              </p>
              <SpeakTwinReply key={sentSampleReply || correction || feedback} text={sentSampleReply ? 'I have noted your reason. A price rise alone does not explain the buy.' : correction ? corrections[correction] : reminders.check} />
            </div>
          )}
          {selected && selected !== saved && (
            <button type="button" onClick={() => saveReminder(selected)}>Save reminder</button>
          )}
          {(correction === 'planned' || correction === 'news') && <TradeNoteComposer correction={correction} />}
          <button ref={publicReviewEntry} type="button" onClick={() => setPublicReview(true)}>Review my own trades</button>
        </>
      ) : null}
    </section>
  );
}
