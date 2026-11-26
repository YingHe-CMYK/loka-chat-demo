import { TrainingExamples } from './training-examples';
import { TwinParticles } from './twin-particles';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TwinResultView, TwinWorkspaceView } from './workspace-view';
import { TradeReview, type TradeReviewStatus } from './trade-review';
import './workspace.css';

const AccountRename = lazy(() => import('./account-rename'));

interface LocalSource {
  name: string;
  paused: boolean;
  manual: boolean;
  excerpt: string;
  hasMore: boolean;
}

const draftKey = 'loka-twin-workspace:note-draft';

function readDraft() {
  try {
    return window.sessionStorage.getItem(draftKey) || '';
  } catch {
    return '';
  }
}

const items = [
  { id: 'source', label: 'Source comparison', pending: false },
  { id: 'trades', label: 'Trade review', pending: false },
  { id: 'notes', label: 'Notes', pending: false },
];

function itemFromLocation() {
  if (/^\/twin\/?$/.test(window.location.pathname)) return 'trades';
  const item = new URLSearchParams(window.location.search).get('view');
  return item === 'trades' || item === 'notes' ? item : 'source';
}

export default function TwinWorkspacePage() {
  const root = useRef<HTMLDivElement>(null);
  const [twinName, setTwinName] = useState(() => {
    try {
      if (new URLSearchParams(location.search).get('start') === '1') return sessionStorage.getItem('loka.trade-preview:name')?.trim().slice(0, 24) || undefined;
      return (sessionStorage.getItem('loka.twin-workspace:name') || localStorage.getItem('loka.trade-twin:name'))?.trim().slice(0, 24);
    } catch {
      return undefined;
    }
  });
  const [identitySetup, setIdentitySetup] = useState(() => {
    const step = new URLSearchParams(location.search).get('setup');
    return step === 'appearance' || step === 'voice';
  });
  const focusAfterSetup = useRef(false);
  const [voiceHeard, setVoiceHeard] = useState(false);
  const [understandingContext] = useState(() => {
    try {
      const demo = new URLSearchParams(location.search).get('start') === '1';
      const id = sessionStorage.getItem(demo ? 'loka.trade-preview:id' : 'loka.twin-workspace:id');
      return id ? { id, key: 'loka.twin-understanding:' + id, persistent: !demo && id.startsWith('miro_') } : undefined;
    } catch {
      return undefined;
    }
  });
  const [understandings, setUnderstandings] = useState<{ basis: string; prediction: string }[]>(() => {
    try {
      const storage = understandingContext?.persistent ? localStorage : sessionStorage;
      const value = understandingContext && JSON.parse(storage.getItem(understandingContext.key) || 'null');
      return (Array.isArray(value) ? value : [value])
        .filter(item => item && typeof item.basis === 'string' && typeof item.prediction === 'string').slice(0, 8);
    } catch {
      return [];
    }
  });
  const savedUnderstanding = understandings[0];
  useEffect(() => {
    if (!understandingContext) return;
    try {
      const storage = understandingContext.persistent ? localStorage : sessionStorage;
      if (understandings.length) storage.setItem(understandingContext.key, JSON.stringify(understandings));
      else storage.removeItem(understandingContext.key);
    } catch {
      // The current workspace still retains it in memory.
    }
  }, [understandingContext, understandings]);
  function rememberUnderstanding(basis: string, prediction: string) {
    setUnderstandings(previous => [{ basis, prediction }, ...previous.filter(item => item.basis !== basis)].slice(0, 8));
  }
  const [draft, setDraft] = useState(readDraft);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [currentItem, setCurrentItem] = useState(itemFromLocation);
  const [guidedTrade] = useState(() => itemFromLocation() === "trades");
  const selectedItem = useRef(currentItem);
  const [tradeUnread, setTradeUnread] = useState<TradeReviewStatus>();
  const [sourceError, setSourceError] = useState('');
  const [source, setSource] = useState<LocalSource | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');

  useEffect(() => {
    const workspace = root.current;
    const sourceState = (event: Event) => setSource((event as CustomEvent<LocalSource | null>).detail);
    const receiveSourceError = (event: Event) => setSourceError((event as CustomEvent<string>).detail);
    const finishIdentity = () => {
      focusAfterSetup.current = true;
      setVoiceHeard(workspace?.dataset.twinVoicePreview === 'heard');
      setIdentitySetup(false);
    };
    const changeName = (event: Event) => setTwinName((event as CustomEvent<string>).detail);
    workspace?.addEventListener('twin:name-changed', changeName);
    const resumeIdentity = () => setIdentitySetup(true);
    workspace?.addEventListener('twin:resume-voice-setup', resumeIdentity);
    workspace?.addEventListener('twin:identity-finished', finishIdentity);
    workspace?.addEventListener('twin:source-state', sourceState);
    workspace?.addEventListener('twin:source-error', receiveSourceError);
    const assets = ['/twin-presence/presence.css?v=portrait-flow-18', '/twin-presence/setup.css?v=portrait-flow-18'].map(href => {
      const element = document.createElement('link');
      element.rel = 'stylesheet';
      element.href = href;
      document.head.append(element);
      return element;
    });
    let active = true;
    const entry = document.createElement('script');
    entry.type = 'module';
    entry.src = '/twin-presence/onboarding.mjs?v=portrait-flow-28';
    entry.onload = () => {
      if (!active) return;
      setState('empty');

    };
    entry.onerror = () => { if (active) setState('error'); };
    document.head.append(entry);
    return () => {
      active = false;
      workspace?.removeEventListener('twin:name-changed', changeName);
      workspace?.removeEventListener('twin:resume-voice-setup', resumeIdentity);
      workspace?.removeEventListener('twin:identity-finished', finishIdentity);
      workspace?.removeEventListener('twin:source-state', sourceState);
      workspace?.removeEventListener('twin:source-error', receiveSourceError);
      entry.remove();
      assets.forEach(element => element.remove());
    };
  }, []);

  function updateDraft(value: string) {
    setDraft(value);
    try {
      if (value) window.sessionStorage.setItem(draftKey, value);
      else window.sessionStorage.removeItem(draftKey);
      setDraftSaveFailed(false);
    } catch {
      setDraftSaveFailed(true);
    }
  }

  const activateItem = useCallback((id: string) => {
    selectedItem.current = id;
    setCurrentItem(id);
    if (id === 'trades') setTradeUnread(undefined);
    root.current?.dispatchEvent(new CustomEvent('twin:item-selected', { detail: id }));
  }, []);

  useEffect(() => {
    const restoreItem = () => activateItem(itemFromLocation());
    window.addEventListener('popstate', restoreItem);
    return () => window.removeEventListener('popstate', restoreItem);
  }, [activateItem]);

  function selectItem(id: string) {
    if (id === selectedItem.current) return;
    const url = new URL(window.location.href);
    if (id === 'source') url.searchParams.delete('view');
    else url.searchParams.set('view', id);
    window.history.pushState(window.history.state, '', url);
    activateItem(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  useEffect(() => {
    if (identitySetup || !focusAfterSetup.current) return;
    focusAfterSetup.current = false;
    const frame = window.requestAnimationFrame(() => {
      const firstMove = root.current?.querySelector<HTMLElement>('[data-prepared-first-move]');
      if (firstMove?.getClientRects().length) {
        firstMove.focus({ preventScroll: true });
        firstMove.scrollIntoView({ block: 'nearest' });
      } else {
        root.current?.querySelector<HTMLElement>('.twin-source-switch')?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [identitySetup]);

  function openSettings(detail: 'permissions' | 'source' | 'reminders') {
    root.current?.querySelector('.twin-workspace-header')?.dispatchEvent(new CustomEvent('twin:settings', { detail }));
  }

  return (
    <div className="twin-root" ref={root} data-twin-profile={understandingContext?.id}>
      {understandingContext?.persistent && <Suspense fallback={null}><AccountRename workspace={root} twinId={understandingContext.id} /></Suspense>}
      <TwinWorkspaceView
        twinName={twinName}
        guidedTrade={guidedTrade}
        identity={<div className="twin-identity-stage">
          <div className="vorb twin-workspace-orb" data-likeness={Math.min(3, understandings.length)} aria-label="Twin appearance">{guidedTrade ? <TwinParticles /> : <span className="orb" />}</div>
          {guidedTrade && <div className="twin-orb-activity">
            <span data-orb-state="working" aria-hidden="true">Reviewing your information</span>
            <button type="button" data-orb-state="waiting" onClick={() => {
              root.current?.querySelector<HTMLButtonElement>('[data-twin-activity=waiting] .twin-evidence-open')?.click();
            }}>Open what Twin found ↗</button>
          </div>}
          {guidedTrade && <div id="twin-judgment-dock" className="twin-trade-review" hidden={identitySetup || currentItem !== 'trades'} />}
          {guidedTrade && <div id="twin-calibration-dock" hidden={identitySetup || currentItem !== 'trades'} />}
          {guidedTrade && <button type="button" className="twin-identity-edit" disabled={state !== 'empty'}
            onClick={() => openSettings('permissions')}>
            <span className="twin-identity-add">＋ Set my appearance</span>
            <span className="twin-identity-change">Edit appearance</span>
          </button>}
        </div>}
        composer={<>
          <div className="vcomposer twin-workspace-adapter-anchor" />
          {guidedTrade && !identitySetup && understandings.length > 0 && <details className="twin-personal-understanding">
            <summary>What my Twin kept</summary>
            {understandings.map(item => <section key={item.basis}>
              <blockquote>{item.basis}</blockquote>
              <p>{item.prediction}</p>
              <button type="button" aria-label={understandings.length > 1 ? 'Remove: ' + item.basis : undefined}
                onClick={() => setUnderstandings(previous => previous.filter(entry => entry.basis !== item.basis))}>
                {understandingContext?.persistent ? 'Remove from this device' : 'Remove from this session'}
              </button>
            </section>)}
          </details>}
          {guidedTrade && !identitySetup && understandingContext?.persistent && <TrainingExamples />}
          {guidedTrade && !identitySetup && <details className="twin-review-draft">
            <summary>Private review notes</summary>
            <label>
              <span>My review draft</span>
              <textarea rows={3} value={draft} onChange={event => updateDraft(event.target.value)}
                placeholder="Keep working while Twin reviews your source." />
            </label>
            {draftSaveFailed && <small role="status">The draft is available in this tab. Browser storage is unavailable.</small>}
          </details>}
        </>}
        settings={null}
        currentItem={currentItem}
        items={items.map(item => item.id === 'trades' ? { ...item, status: tradeUnread } : item)}
        onSelectItem={selectItem}
        settingsRecovery={state === 'error' && currentItem !== 'source' && (
          <button type="button" onClick={() => selectItem('source')}>Recover access to your source</button>
        )}
        settingsReady={state === 'empty'}
        onPermissions={() => openSettings('permissions')}
        onReminderSettings={() => openSettings('reminders')}
        result={
          <div className="panel dockx">
            <div className="nav">Preview</div>
            <div className="work-items" hidden />
            {state === 'empty' && currentItem === 'source' && (
              <div className="twin-source-action">
                {source && (
                  <span role="status" className="twin-source-status">
                    {source.paused ? 'Paused' : source.manual ? 'Select a newer version manually' : 'Watching for changes'} · {source.name}
                  </span>
                )}
                {source && (
                  <button
                    type="button"
                    aria-describedby={source.paused && sourceError ? 'twin-source-error' : undefined}
                    onClick={() => root.current?.dispatchEvent(new Event('twin:toggle-source'))}
                  >
                    {source.paused ? sourceError ? 'Retry reading' : 'Resume watching' : 'Pause watching'}
                  </button>
                )}
                {source?.paused && sourceError && (
                  <button type="button" onClick={() => root.current?.dispatchEvent(new Event('twin:choose-source'))}>
                    Replace file
                  </button>
                )}
                {source?.manual && !source.paused && (
                  <button
                    type="button"
                    data-primary
                    aria-describedby={sourceError ? 'twin-source-error' : undefined}
                    onClick={() => root.current?.dispatchEvent(new Event('twin:compare-source'))}
                  >
                    Compare a newer version
                  </button>
                )}
                <button data-twin-source-picker data-primary={source ? undefined : true} type="button" aria-describedby={source ? undefined : sourceError ? 'twin-local-read-scope twin-source-error' : 'twin-local-read-scope'} onClick={() => {
                  if (source) openSettings('source');
                  else root.current?.dispatchEvent(new Event('twin:choose-source'));
                }}>
                  {source ? 'Manage local source' : 'Choose a local source'}
                </button>
                {!source && (
                  <button type="button" onClick={() => root.current?.dispatchEvent(new Event('twin:show-example'))}>
                    Try an example
                  </button>
                )}
              </div>
            )}
            {currentItem === 'source' && sourceError && <p id="twin-source-error" role="status">{sourceError}</p>}
            <div className="dbody" hidden={identitySetup && state !== 'error'}>
              <div className="twin-workspace-source" hidden={currentItem !== 'source'}>
                <TwinResultView state={source ? 'ready' : state}>
                  {source && (
                    <div className="twin-source-preview">
                      <h2>{source.hasMore ? 'Start of file' : 'File preview'}</h2>
                      {source.excerpt.trim() ? <pre>{source.excerpt}{source.hasMore ? '…' : ''}</pre> : <p>There is no displayable text at the start of this file.</p>}
                      <p>{source.paused ? 'Twin will check the file again when you resume.' : source.manual
                        ? 'Choose a newer file with the same name to see the changes.'
                        : 'Twin checks for changes while the workspace is in the foreground.'}</p>
                    </div>
                  )}
                  {state === 'error' && <button type="button" onClick={() => window.location.reload()}>Reload and retry</button>}
                </TwinResultView>
              </div>
              <div hidden={currentItem !== 'trades'}>
                <TradeReview initiallyOpen guidedSources={guidedTrade} showPreparedStarter={!identitySetup && currentItem === 'trades'} voiceHeard={voiceHeard}
                  onBackToVoice={() => root.current?.dispatchEvent(new Event('twin:resume-voice-setup'))}
                  savedUnderstanding={savedUnderstanding} retainedUnderstandings={understandings}
                  persistentUnderstanding={understandingContext?.persistent} onKeepUnderstanding={rememberUnderstanding} onResult={status => { if (selectedItem.current !== 'trades') setTradeUnread(status); }} />
              </div>
              <div hidden={currentItem !== 'notes'}>
                <label htmlFor="twin-note">Session note</label>
                <textarea
                  id="twin-note"
                  rows={5}
                  aria-describedby="twin-note-status"
                  placeholder="Write something you want to keep…"
                  value={draft}
                  onChange={event => updateDraft(event.target.value)}
                />
                <small id="twin-note-status" role="status">
                  {draftSaveFailed ? 'Your changes could not be saved. Copy them before refreshing.' : 'This draft stays in the current tab.'}
                </small>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
