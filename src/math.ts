import { Bezier } from 'bezier-js'

export interface Vector {
  x: number
  y: number
}
export interface TimedVector extends Vector {
  timestamp: number
}
export const origin: Vector = { x: 0, y: 0 }

// maybe i should've just imported a vector library lol
export const sub = (a: Vector, b: Vector): Vector => ({ x: a.x - b.x, y: a.y - b.y })
export const div = (a: Vector, b: number): Vector => ({ x: a.x / b, y: a.y / b })
export const mult = (a: Vector, b: number): Vector => ({ x: a.x * b, y: a.y * b })
export const add = (a: Vector, b: Vector): Vector => ({ x: a.x + b.x, y: a.y + b.y })

export const extrapolate = (a: Vector, b: Vector): Vector => add(b, sub(b, a))
export const scale = (value: number, range1: [number, number], range2: [number, number]): number =>
  (value - range1[0]) * (range2[1] - range2[0]) / (range1[1] - range1[0]) + range2[0]

export const direction = (a: Vector, b: Vector): Vector => sub(b, a)
export const perpendicular = (a: Vector): Vector => ({ x: a.y, y: -1 * a.x })
export const magnitude = (a: Vector): number =>
  Math.sqrt(Math.pow(a.x, 2) + Math.pow(a.y, 2))
export const unit = (a: Vector): Vector => div(a, magnitude(a))
export const setMagnitude = (a: Vector, amount: number): Vector =>
  mult(unit(a), amount)

export const randomNumberRange = (min: number, max: number): number =>
  Math.random() * (max - min) + min

export const randomVectorOnLine = (a: Vector, b: Vector): Vector => {
  const vec = direction(a, b)
  const multiplier = Math.random()
  return add(a, mult(vec, multiplier))
}

const randomNormalLine = (
  a: Vector,
  b: Vector,
  range: number
): [Vector, Vector] => {
  const randMid = randomVectorOnLine(a, b)
  const normalV = setMagnitude(perpendicular(direction(a, randMid)), range)
  return [randMid, normalV]
}

export const generateBezierAnchors = (
  a: Vector,
  b: Vector,
  spread: number
): [Vector, Vector] => {
  const side = Math.round(Math.random()) === 1 ? 1 : -1
  const calc = (): Vector => {
    const [randMid, normalV] = randomNormalLine(a, b, spread)
    const choice = mult(normalV, side)
    return randomVectorOnLine(randMid, add(randMid, choice))
  }
  return [calc(), calc()].sort((a, b) => a.x - b.x) as [Vector, Vector]
}

export const clamp = (target: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, target))

export const overshoot = (coordinate: Vector, radius: number): Vector => {
  const a = Math.random() * 2 * Math.PI
  const rad = radius * Math.sqrt(Math.random())
  const vector = { x: rad * Math.cos(a), y: rad * Math.sin(a) }
  return add(coordinate, vector)
}

export const bezierCurve = (
  start: Vector,
  finish: Vector,
  /**
   * Default is length from start to finish, clamped to 2 < x < 200
   */
  spreadOverride?: number
): Bezier => {
  // could be played around with
  const MIN_SPREAD = 2
  const MAX_SPREAD = 200
  const vec = direction(start, finish)
  const length = magnitude(vec)
  const spread = spreadOverride ?? clamp(length, MIN_SPREAD, MAX_SPREAD)
  const anchors = generateBezierAnchors(start, finish, spread)
  return new Bezier(start, ...anchors, finish)
}

export const bezierCurveSpeed = (
  t: number,
  P0: Vector,
  P1: Vector,
  P2: Vector,
  P3: Vector
): number => {
  const B1 = 3 * (1 - t) ** 2 * (P1.x - P0.x) + 6 * (1 - t) * t * (P2.x - P1.x) + 3 * t ** 2 * (P3.x - P2.x)
  const B2 = 3 * (1 - t) ** 2 * (P1.y - P0.y) + 6 * (1 - t) * t * (P2.y - P1.y) + 3 * t ** 2 * (P3.y - P2.y)
  return Math.sqrt(B1 ** 2 + B2 ** 2)
}

/**
 * Generates a random number following a normal (Gaussian) distribution using Box-Muller transform.
 */
export const gaussianRandom = (mean: number, stdDev: number): number => {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random() // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return mean + z * stdDev
}

/**
 * Flash & Hogan Minimum Jerk Velocity Profile (biological arm-movement model).
 * Maps normalized time t [0, 1] to normalized position s [0, 1].
 * Optionally skews the deceleration phase to simulate fine motor correction near targets.
 */
export const minimumJerk = (t: number, skew: number = 0.1): number => {
  const clampedT = clamp(t, 0, 1)
  // Base minimum jerk: s(t) = 10*t^3 - 15*t^4 + 6*t^5
  const s = 10 * Math.pow(clampedT, 3) - 15 * Math.pow(clampedT, 4) + 6 * Math.pow(clampedT, 5)
  if (skew === 0) return s
  // Asymmetric deceleration: spending slightly more time on the final 20% of movement
  return Math.pow(s, 1 + (skew * (1 - clampedT)))
}

/**
 * Simulates natural human physiological micro-tremor (8-12Hz sub-pixel oscillations).
 * Prevents mathematical Bézier curves from triggering ML polynomial-classifier bot detectors.
 */
export const addBiometricTremor = (
  points: Vector[],
  intensity: number = 0.35
): Vector[] => {
  if (points.length < 4 || intensity <= 0) return points

  const phaseX = Math.random() * Math.PI * 2
  const phaseY = Math.random() * Math.PI * 2
  const frequency = randomNumberRange(8, 12)

  return points.map((p, i) => {
    // Don't modify the exact start or end coordinates so clicks hit their target
    if (i === 0 || i === points.length - 1) return p

    const progress = i / (points.length - 1)
    // Tremor is strongest in mid-flight and settles down towards target contact
    const envelope = Math.sin(progress * Math.PI)
    const jitterMagnitude = intensity * envelope

    const tremorX = Math.sin(progress * frequency * Math.PI * 2 + phaseX) * jitterMagnitude + (Math.random() - 0.5) * (jitterMagnitude * 0.4)
    const tremorY = Math.cos(progress * frequency * Math.PI * 2 + phaseY) * jitterMagnitude + (Math.random() - 0.5) * (jitterMagnitude * 0.4)

    return {
      x: Number((p.x + tremorX).toFixed(2)),
      y: Number((p.y + tremorY).toFixed(2))
    }
  })
}
