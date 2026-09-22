export type PocGuideStatus = 'implemented' | 'simulation' | 'out-of-scope';
export type PocGuideActionTarget = 'internal' | 'daaif-notebook' | 'daaif-loader' | 'daaif-source-explorer';

export interface PocGuideRole {
  readonly name: string;
  readonly responsibility: string;
}

export interface PocGuideAction {
  readonly label: string;
  readonly target: PocGuideActionTarget;
  readonly path?: string;
  readonly demoUserId?: string;
  readonly queryParams?: Readonly<Record<string, string>>;
  readonly fragment?: string;
}

export interface PocGuideScreenshot {
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
}

export interface PocGuideStep {
  readonly title: string;
  readonly description: string;
  readonly status: PocGuideStatus;
  readonly checkpoint?: string;
  readonly warning?: string;
  readonly actions?: readonly PocGuideAction[];
  readonly screenshots?: readonly PocGuideScreenshot[];
}

export interface PocJourney {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly summary: string;
  readonly duration: string;
  readonly difficulty: 'Einfach' | 'Mittel' | 'Fortgeschritten';
  readonly systems: readonly string[];
  readonly roles: readonly PocGuideRole[];
  readonly prerequisites: readonly string[];
  readonly outcome: string;
  readonly repeatability: string;
  readonly verification?: {
    readonly label: string;
    readonly detail: string;
  };
  readonly steps: readonly PocGuideStep[];
}

export interface PocGuideCapability {
  readonly title: string;
  readonly description: string;
  readonly status: PocGuideStatus;
}
