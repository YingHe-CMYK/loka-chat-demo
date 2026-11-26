import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StoredTrainingExample } from './training-examples';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';

type AccountRequest = ({
  list?: never;
  name: string;
  removeId?: never;
  example?: never;
} | {
  list?: never;
  name?: never;
  removeId?: never;
  example: { id: string; scenario: string; twinAction: string; ownerAction: string; reason: string };
} | {
  list?: never;
  name?: never;
  example?: never;
  removeId: string;
} | {
  name?: never;
  example?: never;
  removeId?: never;
  list: true;
}) & { resolve: (value: string | StoredTrainingExample[]) => void; reject: (error: Error) => void };
type Config = { ready: boolean; appId: string; clientId?: string };

function AccountRenameRequest({ request, twinId }: { request: AccountRequest; twinId: string }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    async function rename() {
      try {
        const token = authenticated && await getAccessToken();
        if (!token) throw new Error('Your sign-in session has expired. Sign in again before saving.');
        if (controller.signal.aborted) return;
        if (request.list) {
          const query = new URLSearchParams({ twinId });
          const response = await fetch('/api/companion/calibration-examples?' + query, {
            headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
          });
          const { examples } = await response.json();
          if (!response.ok || !Array.isArray(examples)) throw new Error('Could not load your training examples. Try again.');
          if (!controller.signal.aborted) request.resolve(examples);
          return;
        }
        const { example, removeId } = request;
        const response = await fetch(example || removeId ? '/api/companion/calibration-examples' : '/api/companion', {
          method: removeId ? 'DELETE' : example ? 'POST' : 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(removeId ? { id: removeId, twinId } : example ? { ...example, twinId, consent: 'personal-training-v1' } : { name: request.name, twinId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        const { companion, error, saved, removed, id } = await response.json();
        if (removeId) {
          if (!response.ok || !removed) throw new Error('Could not remove this example. Try again.');
          request.resolve(removeId);
          return;
        }
        if (example) {
          if (!response.ok || !saved || id !== example.id) throw new Error('Could not add this example. You can retry or continue on this device.');
          if (!controller.signal.aborted) request.resolve(id);
          return;
        }
        if (error === 'AI_NAME_INVALID') throw new Error('Use up to 24 letters, numbers, spaces, periods, hyphens, or underscores.');
        if (!response.ok || companion?.ai_id !== twinId) throw new Error('Could not save this Twin’s name. Your work is still here. Try again.');
        if (!controller.signal.aborted) request.resolve(companion.name);
      } catch (error) {
        if (!controller.signal.aborted) request.reject(error instanceof Error ? error : new Error('Could not save the name.'));
      }
    }
    void rename();
    return () => controller.abort();
  }, [ready, authenticated, getAccessToken, request, twinId]);
  return null;
}

export default function AccountRename({ workspace, twinId }: { workspace: RefObject<HTMLDivElement | null>; twinId: string }) {
  const [config, setConfig] = useState<Config>();
  const [request, setRequest] = useState<AccountRequest>();
  const requestBusy = useRef(false);
  useEffect(() => {
    const node = workspace.current;
    if (!node) return;
    const handle = (event: Event) => {
      const next = (event as CustomEvent<AccountRequest>).detail;
      if (requestBusy.current) {
        next.reject(new Error('Your Twin is finishing another request. Try again in a moment.'));
        return;
      }
      requestBusy.current = true;
      const done = () => { requestBusy.current = false; setRequest(undefined); };
      setRequest({
        ...next,
        resolve: value => {
          done();
          next.resolve(value);
          if (next.example || next.removeId) node.dispatchEvent(new window.CustomEvent('twin:training-changed', { detail: { removedId: next.removeId } }));
        },
        reject: error => { done(); next.reject(error); },
      });
      if (config) return;
      void fetch('/api/config', { signal: AbortSignal.timeout(8000) }).then(async response => {
        const result: Config = await response.json();
        if (!response.ok || !result.ready || !result.appId) throw new Error('Account service is unavailable. Try again.');
        setConfig(result);
      }).catch(() => {
        done();
        next.reject(new Error('Account service is unavailable. Try again.'));
      });
    };
    node.addEventListener('twin:account-rename', handle);
    node.addEventListener('twin:save-calibration', handle);
    node.addEventListener('twin:remove-calibration', handle);
    node.addEventListener('twin:list-calibration', handle);
    return () => {
      node.removeEventListener('twin:account-rename', handle);
      node.removeEventListener('twin:save-calibration', handle);
      node.removeEventListener('twin:remove-calibration', handle);
      node.removeEventListener('twin:list-calibration', handle);
    };
  }, [workspace, config]);
  useEffect(() => {
    if (!request) return;
    const timeout = window.setTimeout(() => request.reject(new Error('Saving timed out. Try again.')), 24000);
    return () => window.clearTimeout(timeout);
  }, [request]);
  if (!config || !request) return null;
  return <PrivyProvider appId={config.appId} clientId={config.clientId || undefined} config={{
    loginMethods: ['email', 'google'], embeddedWallets: { ethereum: { createOnLogin: 'off' } },
  }}>
    <AccountRenameRequest twinId={twinId} request={request} />
  </PrivyProvider>;
}
