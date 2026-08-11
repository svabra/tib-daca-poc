import { FALLBACK_SYNC_CONFIGS, FALLBACK_TRUST_GRANTS } from './core/control-plane.seed';

describe('Control-plane preview contract', () => {
  it('models bilateral sharing as independent directed grants', () => {
    const approved = FALLBACK_TRUST_GRANTS.filter((grant) => grant.state === 'approved');
    expect(approved).toHaveLength(2);
    expect(approved[0].providerId).toBe(approved[1].consumerId);
  });

  it('keeps policy sharing out of enabled sync scopes by default', () => {
    const enabled = FALLBACK_SYNC_CONFIGS.filter((configuration) => configuration.enabled);
    expect(enabled.every((configuration) => !configuration.resourceScopes.includes('policies'))).toBe(true);
    expect(enabled.every((configuration) => configuration.conflictStrategy === 'origin-wins')).toBe(true);
  });
});
