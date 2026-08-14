import { Subject } from 'rxjs';
import { loadMatchingQualityWorkspace } from './quality-workspace-loader';

describe('loadMatchingQualityWorkspace', () => {
  it('waits for the route product even when quality arrives first', () => {
    const product = new Subject<{ id: string; title: string }>();
    const quality = new Subject<{ score: number }>();
    const workspaces: Array<{ product: { id: string; title: string }; state: { score: number } }> = [];
    loadMatchingQualityWorkspace('journey', product, quality).subscribe((workspace) => workspaces.push(workspace));

    quality.next({ score: 2 });
    quality.complete();
    expect(workspaces).toEqual([]);
    product.next({ id: 'journey', title: 'Kantonale Gewerbesteuer' });
    product.complete();
    expect(workspaces[0].product.title).toBe('Kantonale Gewerbesteuer');
    expect(workspaces[0].state.score).toBe(2);
  });

  it('rejects a response for a different product', () => {
    const errors: string[] = [];
    const product = new Subject<{ id: string }>();
    const state = new Subject<object>();
    loadMatchingQualityWorkspace('journey', product, state).subscribe({
      error: (error: Error) => errors.push(error.message),
    });
    product.next({ id: 'other' }); product.complete();
    state.next({}); state.complete();
    expect(errors).toContain('The loaded product does not match the quality route.');
  });
});
