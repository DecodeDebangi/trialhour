import { capacityPreserving } from './capacityPreserving.js';
import { fairLoad } from './fairLoad.js';
import type { AssignmentStrategy, AssignmentStrategyName } from './strategy.js';

export * from './strategy.js';
export { capacityPreserving, scarcityScore } from './capacityPreserving.js';
export { fairLoad } from './fairLoad.js';

const STRATEGIES: Record<AssignmentStrategyName, AssignmentStrategy> = {
  'capacity-preserving': capacityPreserving,
  'fair-load': fairLoad,
};

export function createAssignmentStrategy(name: AssignmentStrategyName): AssignmentStrategy {
  return STRATEGIES[name];
}
