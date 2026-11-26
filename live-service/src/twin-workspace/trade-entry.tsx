import { useEffect, useRef, useState, type ReactNode } from 'react';
import './workspace.css';

export default function TradeEntry({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => {
    const query = new URLSearchParams(location.search);
    if (query.get('view') !== 'trades' && !/^\/twin\/?$/.test(location.pathname)) return true;
    try {
      if (query.get('start') === '1') return query.has('setup') && Boolean(sessionStorage.getItem('loka.trade-preview:name'));
      return Boolean(sessionStorage.getItem('loka.twin-workspace:name') || localStorage.getItem('loka.trade-twin:name'));
    } catch {
      return false;
    }
  });
  const [name, setName] = useState('');
  const [local, setLocal] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [local]);

  function changeStep(next: boolean) {
    moved.current = true;
    setLocal(next);
  }

  const [registration, setRegistration] = useState<'checking' | 'available' | 'unavailable'>('checking');

  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]);
    void fetch('/api/config', { signal }).then(async response => {
      const config = response.ok ? await response.json() : null;
      if (!controller.signal.aborted) setRegistration(config?.ready === true ? 'available' : 'unavailable');
    }).catch(() => {
      if (!controller.signal.aborted) setRegistration('unavailable');
    });
    return () => controller.abort();
  }, [ready]);

  if (ready) return children;
  const identityEntry = new URL('/?identity=1&signin=1&view=trades', location.origin);
  if (/^\/twin\/?$/.test(location.pathname)) identityEntry.searchParams.set('return', 'twin');
  if (new URLSearchParams(location.search).get('initiative') === '1') {
    identityEntry.searchParams.set('initiative', '1');
  }

  return (
    <main className="twin-trade-entry">
      <span className="twin-trade-wordmark">LokaChat</span>
      {!local ? <>
        <h1 ref={heading} tabIndex={-1}>Sign up or sign in</h1>
        <p>Create your Twin to review your trades.</p>
        <div className="twin-entry-actions">
          {registration === 'available' ? (
            <a className="twin-entry-email" href={identityEntry.pathname + identityEntry.search}>
              <span>Sign up or sign in with email</span>
              <span className="twin-entry-arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </span>
            </a>
          ) : (
            <p className="twin-trade-entry-note" role="status">
              {registration === 'checking' ? 'Checking email sign-in…' : 'Email sign-in is temporarily unavailable.'}
            </p>
          )}
          <button type="button" className="twin-entry-local" onClick={() => changeStep(true)}>Try on this device</button>
        </div>
      </> : <>
      <button type="button" className="twin-trade-demo" onClick={() => changeStep(false)}>← Back</button>
      <h1 ref={heading} tabIndex={-1}>Create my Twin</h1>
      <p>Give your Twin a name, then review your trades together.</p>
      <form onSubmit={event => {
        event.preventDefault();
        const twin = name.trim();
        if (!twin) return;
        try {
          if (new URLSearchParams(location.search).get('start') === '1') {
            sessionStorage.setItem('loka.trade-preview:name', twin);
            sessionStorage.setItem('loka.trade-preview:id', crypto.randomUUID());
          } else {
            sessionStorage.setItem('loka.twin-workspace:name', twin);
            sessionStorage.setItem('loka.twin-workspace:id', crypto.randomUUID());
            localStorage.setItem('loka.trade-twin:name', twin);
          }
        } catch {
          // The current session can continue without persistent storage.
        }
        const target = new URL(location.href);
        target.searchParams.set('setup', 'appearance');
        history.replaceState(history.state, '', target);
        setReady(true);
      }}>
        <label htmlFor="first-twin-name">Twin name</label>
        <input id="first-twin-name" required maxLength={24} value={name} onChange={event => setName(event.target.value)} />
        <button disabled={!name.trim()}>Create and continue</button>
      </form>
      <p className="twin-trade-entry-note">This session stays in this browser.</p>
      </>}
    </main>
  );
}
