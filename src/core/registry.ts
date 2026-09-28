import type { Step, StepFactory, StepSpec } from './types';

const factories = new Map<string, StepFactory>();
export function register(type: string, factory: StepFactory): void {
  if (factories.has(type)) throw new Error(`Duplicate step type: ${type}`);
  factories.set(type, factory);
}
export function create(spec: StepSpec): Step {
  const factory = factories.get(spec.type);
  if (!factory) throw new Error(`Unknown step type: ${spec.type}`);
  return factory(spec);
}
export function clearRegistryForTests(): void { factories.clear(); }
