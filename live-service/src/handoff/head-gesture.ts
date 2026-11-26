export type FacePose = { turn: number; x: number; width: number; roll: number }
export type TrackingState = 'calibrating' | 'tracking' | 'no-face' | 'multiple' | 'align' | 'return-center'
export type GestureResult = { state: TrackingState; direction: -1 | 0 | 1; progress: number; move?: -1 | 1 }

// Values are normalized by face width. No images or landmarks are retained.
export class HeadGesture {
 private baseline: FacePose | null = null
 private samples: Array<{ pose: FacePose; at: number }> = []
 private smoothed: FacePose | null = null
 private lastSeen = -Infinity
 private candidate: -1 | 0 | 1 = 0
 private candidateAt = 0
 private armed = true
 private firedAt = -Infinity
 private centeredAt: number | null = null
 reset() {
  this.baseline = null; this.samples = []; this.smoothed = null; this.lastSeen = -Infinity
  this.candidate = 0; this.armed = true; this.firedAt = -Infinity; this.centeredAt = null
 }
 update(pose: FacePose | null, count: number, at: number): GestureResult {
  const idle = (state: TrackingState): GestureResult => ({state, direction: 0, progress: 0})
  if (!pose || count !== 1) {
   if (at - this.lastSeen > 800 || count > 1) { this.baseline = null; this.samples = []; this.smoothed = null; this.armed = true }
   this.candidate = 0; this.centeredAt = null
   return idle(count > 1 ? 'multiple' : 'no-face')
  }
  if (!Object.values(pose).every(Number.isFinite) || pose.width < .12 || pose.width > .9 || Math.abs(pose.roll) > .35) {
   this.candidate = 0; this.samples = []; this.smoothed = null
   return idle('align')
  }
  this.lastSeen = at
  this.smoothed = this.smoothed ? {
   turn: this.smoothed.turn * .55 + pose.turn * .45,
   x: this.smoothed.x * .55 + pose.x * .45,
   width: pose.width, roll: pose.roll,
  } : pose
  const current = this.smoothed
  if (!this.baseline) {
   if (Math.abs(current.turn) > .12) { this.samples = []; return idle('align') }
   this.samples.push({pose: current, at})
   this.samples = this.samples.filter(sample => at - sample.at <= 1200)
   const turns = this.samples.map(sample => sample.pose.turn), xs = this.samples.map(sample => sample.pose.x)
   if (Math.max(...turns) - Math.min(...turns) > .045 || Math.max(...xs) - Math.min(...xs) > .025) this.samples = [{pose: current, at}]
   if (this.samples.length >= 8 && at - this.samples[0].at >= 800) {
    const mean = (key: keyof FacePose) => this.samples.reduce((sum, sample) => sum + sample.pose[key], 0) / this.samples.length
    this.baseline = {turn: mean('turn'), x: mean('x'), width: mean('width'), roll: 0}
    this.samples = []; this.armed = true
   }
   return idle(this.baseline ? 'tracking' : 'calibrating')
  }
  const rotation = (current.turn - this.baseline.turn) / .14
  const translation = (current.x - this.baseline.x) / this.baseline.width / .45
  const signal = Math.abs(rotation) >= Math.abs(translation) ? rotation : translation
  if (!this.armed) {
   if (Math.abs(signal) < .38) {
    this.centeredAt ??= at
    if (at - this.centeredAt >= 250 && at - this.firedAt >= 900) { this.armed = true; this.candidate = 0 }
   } else this.centeredAt = null
   return idle(this.armed ? 'tracking' : 'return-center')
  }
  const direction = Math.abs(signal) >= 1 ? (Math.sign(signal) as -1 | 1) : 0
  if (!direction) { this.candidate = 0; return idle('tracking') }
  if (this.candidate !== direction) { this.candidate = direction; this.candidateAt = at }
  const progress = Math.min(1, (at - this.candidateAt) / 300)
  if (progress >= 1) {
   this.armed = false; this.firedAt = at; this.centeredAt = null; this.candidate = 0
   return {state: 'return-center', direction, progress: 1, move: direction}
  }
  return {state: 'tracking', direction, progress}
 }
}
