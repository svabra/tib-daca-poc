export type PocSimulationEventType =
  | 'product_submitted'
  | 'quality_below_threshold'
  | 'not_discoverable'
  | 'isbo_restricted';

export interface PocSimulationEventWire {
  id: string;
  eventType: PocSimulationEventType;
  operation: 'trigger' | 'reset' | 'product_reset';
  productId: string;
  productUrn: string;
  fixtureId: string | null;
  actorUserId: string;
  triggerEventId: string | null;
  confirmationName: string | null;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  createdAt: string;
  active: boolean;
}

export interface PocSimulationTriggerWire {
  event: PocSimulationEventWire;
  product: Record<string, unknown>;
  task: Record<string, unknown> | null;
}
