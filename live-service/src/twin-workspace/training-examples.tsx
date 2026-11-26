import { useCallback, useEffect, useRef, useState } from 'react';

export interface StoredTrainingExample {
  id: string;
  scenario: string;
  twinAction: string;
  ownerAction: string;
  reason: string;
}

function sendRequest<T>(root: Element, action: string, args: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The request timed out. Try again.')), 25000);
    root.dispatchEvent(new window.CustomEvent(action, { detail: {
      ...args,
      resolve: (value: T) => { window.clearTimeout(timeout); resolve(value); },
      reject: (error: Error) => { window.clearTimeout(timeout); reject(error); },
    } }));
  });
}

export function TrainingExamples() {
  const section = useRef<HTMLDetailsElement>(null);
  const loading = useRef(false);
  const [examples, setExamples] = useState<StoredTrainingExample[]>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string>();
  const [requestedExample, setRequestedExample] = useState<string>();

  const load = useCallback(async () => {
    const root = section.current?.closest('.twin-root');
    if (!root || loading.current) return;
    loading.current = true;
    setStatus('Loading your examples…');
    setError('');
    try {
      setExamples(await sendRequest<StoredTrainingExample[]>(root, 'twin:list-calibration', { list: true }));
      setStatus('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load examples.');
      setStatus('');
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    const root = section.current?.closest('.twin-root');
    const refresh = () => { if (section.current?.open) void load(); };
    const openExample = (event: Event) => {
      if (!section.current) return;
      setRequestedExample((event as CustomEvent<string>).detail);
      section.current.open = true;
      void load();
    };
    root?.addEventListener('twin:training-changed', refresh);
    root?.addEventListener('twin:open-training-example', openExample);
    return () => {
      root?.removeEventListener('twin:training-changed', refresh);
      root?.removeEventListener('twin:open-training-example', openExample);
    };
  }, [load]);

  useEffect(() => {
    if (!requestedExample || status === 'Loading your examples…') return;
    const entry = Array.from(section.current?.querySelectorAll<HTMLDetailsElement>('[data-training-example]') ?? [])
      .find(item => item.dataset.trainingExample === requestedExample);
    if (entry) entry.open = true;
    (entry ?? section.current)?.querySelector('summary')?.focus();
    setRequestedExample(undefined);
  }, [examples, requestedExample, status]);

  async function remove(id: string) {
    const root = section.current?.closest('.twin-root');
    if (!root || removing) return;
    setRemoving(id);
    setError('');
    try {
      await sendRequest<string>(root, 'twin:remove-calibration', { removeId: id });
      setExamples(previous => previous?.filter(example => example.id !== id));
      setStatus('Example removed.');
      window.requestAnimationFrame(() => section.current?.querySelector('summary')?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not remove this example.');
    } finally {
      setRemoving(undefined);
    }
  }

  return <details ref={section} id="twin-training-library" className="twin-personal-understanding twin-training-library" onToggle={event => {
    if (event.target === event.currentTarget && event.currentTarget.open) void load();
  }}>
    <summary>My training examples</summary>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Refresh examples</button></p>}
    {examples?.length === 0 && <p>No examples saved yet.</p>}
    {examples?.map(example => <section key={example.id}>
      <details data-training-example={example.id}>
        <summary>{example.scenario}</summary>
        <dl className="twin-training-example">
          <div><dt>Twin predicted</dt><dd>{example.twinAction}</dd></div>
          <div><dt>You chose</dt><dd>{example.ownerAction}</dd></div>
          <div><dt>Sample detail</dt><dd>{example.reason}</dd></div>
        </dl>
        <button type="button" disabled={Boolean(removing)} onClick={() => void remove(example.id)}>
          {removing === example.id ? 'Removing…' : 'Remove this example'}
        </button>
      </details>
    </section>)}
  </details>;
}
