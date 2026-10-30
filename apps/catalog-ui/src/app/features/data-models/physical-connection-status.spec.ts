import { physicalConnectionStatus } from './physical-connection-status';
import { FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

describe('physical representation connection labels',()=>{
  it('distinguishes configured connectors, metadata-only inventories and unconfirmed legacy sources',()=>{
    expect(physicalConnectionStatus({...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'postgresql',sourceConnectionConfigured:true}).label).toBe('Mit Quellenanbindung');
    expect(physicalConnectionStatus({...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'postgresql',sourceConnectionConfigured:false}).label).toBe('Nur Strukturmetadaten');
    expect(physicalConnectionStatus({...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'csv',sourceConnectionConfigured:undefined}).label).toBe('Nur Strukturmetadaten');
    expect(physicalConnectionStatus({...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'postgresql',sourceConnectionConfigured:undefined}).label).toBe('Anbindung unbekannt');
  });
});
