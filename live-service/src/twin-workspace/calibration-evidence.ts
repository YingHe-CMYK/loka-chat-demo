export interface CalibrationEvidence {
  scenario: string;
  twinAction: string;
  ownerAction: string;
  matched: boolean;
  reason?: string;
  platformExampleId?: string;
  platformExampleRemoved?: boolean;
}

/** Use the disagreement to collect the condition that would explain it. */
export function nextEvidenceRequest(evidence: CalibrationEvidence): { title: string; detail: string; label: string } {
  if (evidence.matched) return {
    title: 'I want to check where this rule stops applying.',
    detail: `We both chose “${evidence.ownerAction}” here. A real occasion when you chose differently will help me distinguish a rule from a one-off choice.`,
    label: 'A time the rule had an exception',
  };
  return {
    title: 'I missed a condition that changed your decision.',
    detail: `I chose “${evidence.twinAction}” and you chose “${evidence.ownerAction}”. What would have needed to change for you to choose what I did?`,
    label: 'The condition I missed',
  };
}
