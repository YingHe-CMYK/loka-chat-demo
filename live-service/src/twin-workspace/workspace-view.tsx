import type { ReactNode } from 'react';

export interface WorkspaceItem {
  id: string;
  label: string;
  pending: boolean;
  status?: string;
}

export interface TwinWorkspaceViewProps {
  identity: ReactNode;
  twinName?: string;
  composer: ReactNode;
  settings: ReactNode;
  settingsReady?: boolean;
  guidedTrade?: boolean;
  settingsRecovery?: ReactNode;
  result: ReactNode;
  currentItem: string;
  items: WorkspaceItem[];
  onSelectItem: (id: string) => void;
  onPermissions: () => void;
  onReminderSettings: () => void;
}

export function TwinWorkspaceView(props: TwinWorkspaceViewProps) {
  return (
    <main className="twin-workspace" data-view={props.currentItem} data-guided-trade={props.guidedTrade || undefined}>
      <header className="twin-workspace-header">
        <h1>{props.twinName || 'My Twin'}</h1>
        <button type="button" disabled={props.settingsReady === false} onClick={props.onPermissions}>My Twin</button>
        {!props.guidedTrade && <button type="button" disabled={props.settingsReady === false} onClick={props.onReminderSettings}>Alerts</button>}
        {props.settingsRecovery}
        {!props.guidedTrade && <a href="/?identity=1&amp;qb=1" target="_blank" rel="noopener" aria-label="Account points (opens in a new tab)">Points</a>}
      </header>
      <div className="twin-workspace-layout">
        <section className="twin-workspace-companion" aria-label="Twin">
          {props.identity}
          {props.composer}
        </section>
        <section className="twin-workspace-preview" aria-label={props.guidedTrade ? "Import trades and review judgments" : "Preview"}>
          {!props.guidedTrade && <nav aria-label="Workspace items">
            {props.items.map(item => (
              <button
                type="button"
                key={item.id}
                data-twin-item={item.id}
                aria-pressed={item.id === props.currentItem}
                onClick={() => props.onSelectItem(item.id)}
              >
                {item.label}
                {item.id === 'source' && <span data-twin-result-marker hidden={!item.pending}>● New result</span>}
                {item.status && <span>● {item.status}</span>}
              </button>
            ))}
          </nav>}
          {props.result}
        </section>
      </div>
      {props.settings}
    </main>
  );
}

export interface TwinResultViewProps {
  state: 'loading' | 'empty' | 'error' | 'ready';
  children?: ReactNode;
}

export function TwinResultView({ state, children }: TwinResultViewProps) {
  return (
    <section aria-label="Changes to this source" aria-busy={state === 'loading'}>
      {state === 'loading' && <p role="status">Preparing the comparison…</p>}
      {state === 'empty' && <p id="twin-local-read-scope">Choose a TXT or Markdown file to preview it. Twin only reads that file, on this device.</p>}
      {state === 'error' && <div role="alert">{children}</div>}
      {state === 'ready' && children}
    </section>
  );
}
