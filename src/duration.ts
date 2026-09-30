import type { ModelDescriptor } from './types';

/** Provider calls cover at least the target. Discrete models may overshoot; never
 * trim a chaining anchor or submit an unsupported remainder. */
export function planDurations(target: number, clip: number, model: Pick<ModelDescriptor, 'maxDurationSeconds' | 'durations'>): number[] {
  if (![target, clip, model.maxDurationSeconds].every(n => Number.isFinite(n) && n > 0) || target > 3600) {
    throw new Error('Duration must be positive and target must not exceed 3600 seconds.');
  }
  const allowed = model.durations?.slice().sort((a, b) => a - b);
  const requested = Math.min(clip, model.maxDurationSeconds);
  const size = allowed ? (allowed.find(n => n >= requested) ?? allowed[allowed.length - 1]) : requested;
  const plan: number[] = [];
  let remaining = target;
  while (remaining > 0.000001) {
    const wanted = Math.min(size, remaining);
    const duration = allowed ? (allowed.find(n => n >= wanted) ?? size) : wanted;
    plan.push(duration);
    remaining -= duration;
  }
  return plan;
}
