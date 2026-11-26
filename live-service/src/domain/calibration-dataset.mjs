const fieldLimits = { scenario: 500, twinAction: 160, ownerAction: 160, reason: 600 };
export const calibrationSQL = {
  save: `INSERT INTO twin_calibration_examples(owner,twin_id,id,example,created_at)
    SELECT owner,ai_id,?,?,? FROM companions WHERE owner=? AND ai_id=?
    ON CONFLICT(owner,twin_id,id) DO NOTHING`,
  list: `SELECT id,example,created_at FROM twin_calibration_examples
    WHERE owner=? AND twin_id=? ORDER BY created_at DESC,id DESC`,
  remove: 'DELETE FROM twin_calibration_examples WHERE owner=? AND twin_id=? AND id=?',
};

export function isCalibrationId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function parseCalibrationExample(body) {
  if (body?.consent !== 'personal-training-v1' || !isCalibrationId(body.id)) return undefined;
  const example = {};
  for (const [field, limit] of Object.entries(fieldLimits)) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!value || value.length > limit) return undefined;
    example[field] = value;
  }
  return { id: body.id, example: { ...example, consentVersion: body.consent } };
}

export function formatCalibrationExample(row) {
  return { id: row.id, ...JSON.parse(row.example), createdAt: row.created_at };
}
