import { useEffect, useRef, useState } from 'react';

export function InitiativeVoice({ onTranscript, label = 'Answer by voice' }: {
  onTranscript: (text: string) => void;
  label?: string;
}) {
  const session = useRef<{ controller: AbortController; stream?: MediaStream; recorder?: MediaRecorder; limit?: number }>(undefined);
  const [stage, setStage] = useState<'ready' | 'permission' | 'recording' | 'transcribing'>('ready');
  const [notice, setNotice] = useState('');

  useEffect(() => () => {
    const current = session.current;
    current?.controller.abort();
    current?.stream?.getTracks().forEach(track => track.stop());
    window.clearTimeout(current?.limit);
  }, []);

  async function record() {
    const current: NonNullable<typeof session.current> = { controller: new AbortController() };
    session.current = current;
    setStage('permission');
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function') {
        throw new Error('This browser cannot record here. You can still answer by typing.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current.controller.signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      current.stream = stream;
      const recorder = new MediaRecorder(stream);
      current.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        window.clearTimeout(current.limit);
        if (current.controller.signal.aborted) return;
        setStage('transcribing');
        try {
          const response = await fetch('http://127.0.0.1:11435/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: new Blob(chunks, { type: recorder.mimeType }),
            signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(60000)]),
          });
          if (!response.ok) throw new Error('Transcription failed');
          const data = await response.json();
          if (typeof data.text === 'string' && data.text.trim()) {
            if (!current.controller.signal.aborted) {
              onTranscript(data.text.trim());
              setNotice('Transcript ready. Review or edit it before sending.');
            }
          } else setNotice('No speech detected. Try again or type your reply.');
        } catch {
          if (!current.controller.signal.aborted) setNotice('Local transcription was unavailable. Retry or type your reply.');
        } finally {
          if (!current.controller.signal.aborted) setStage('ready');
        }
      };
      recorder.start();
      current.limit = window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000);
      setStage('recording');
    } catch (error) {
      current.stream?.getTracks().forEach(track => track.stop());
      if (!current.controller.signal.aborted) {
        setNotice(error instanceof DOMException ? 'Microphone unavailable. Check permissions or type your reply.'
          : error instanceof Error ? error.message : 'Could not start the microphone.');
        setStage('ready');
      }
    }
  }

  return <>
    <button type="button" disabled={stage === 'permission' || stage === 'transcribing'}
      onClick={() => {
        if (stage === 'recording') session.current?.recorder?.stop();
        else void record();
      }}>{stage === 'recording' ? 'Stop recording' : stage === 'transcribing' ? 'Transcribing locally…' :
        stage === 'permission' ? 'Opening microphone…' : label}</button>
    {notice && <small role="status">{notice}</small>}
  </>;
}
