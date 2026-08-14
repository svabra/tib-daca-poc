import { forkJoin, map, Observable } from 'rxjs';

export function loadMatchingQualityWorkspace<TProduct extends { id: string }, TState>(
  productId: string,
  product: Observable<TProduct>,
  state: Observable<TState>,
): Observable<{ product: TProduct; state: TState }> {
  return forkJoin({ product, state }).pipe(map((workspace) => {
    if (workspace.product.id !== productId) {
      throw new Error('The loaded product does not match the quality route.');
    }
    return workspace;
  }));
}
