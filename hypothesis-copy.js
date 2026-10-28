// Authored fallback examples. A local source guess is generated from the user's selected file.
const candidates={
 general:['You accepted the invitation and asked me to look first. Would you like me to propose a question before you explain?'],
 health:[
  'You have been looking at weight management and supplements. Is your real question how treatment fits your work and daily life?',
  'Does managing your health feel harder because every option changes your routine?',
  'Are you comparing options because you do not want to make this decision alone?'],
 meaning:[
  'You keep returning to a choice about direction. Is the hardest part allowing yourself to change?',
  'Are you trying to keep stability while testing a different future?',
  'Is there a path you want to try but have not given yourself room to explore?'],
 connection:[
  'You have thought about reaching out. Is the difficult part having to explain everything again?',
  'Do you want a particular person to understand what has been happening?',
  'Is one honest conversation more important than more social plans?'],
 research:[
  'Is this the research problem taking most of your attention right now?',
  'Which result would change your current hypothesis?',
  'Is there a smaller experiment that could settle this question?']
};
export function hypothesisCopy(s){if(s.source==='sample'&&s.previewFocus&&s.index===s.previewFocusIndex){const q={oura:'The example shows shorter sleep on three nights. Are you looking for a way to make health decisions without disrupting your research?',calendar:'The example calendar has long research blocks. Is protecting uninterrupted time central to your health decisions?',health:'The example shows changing activity across the week. Are you looking for a routine that fits your research work?'};if(q[s.previewFocus])return q[s.previewFocus];}if(['local','app'].includes(s.source)&&s.localGuess&&!(s.results?.length)&&!(s.index||0))return s.localGuess;const list=candidates[s.topic]||candidates.general;const n=(s.results?.length||0)+Math.floor((s.index||0)/3);return list[n%list.length];}
