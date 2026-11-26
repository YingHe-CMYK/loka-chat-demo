import type { CSSProperties } from 'react';

export function JourneyStep({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="twin-journey-step">
      <small>Step {step} of 4</small>
      <span className="twin-journey-track" style={{ '--journey-progress': `${step * 25}%` } as CSSProperties} aria-hidden="true" />
    </div>
  );
}
