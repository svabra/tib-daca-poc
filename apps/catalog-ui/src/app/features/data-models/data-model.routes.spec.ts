import { DATA_MODEL_ROUTES } from './data-model.routes';
import { LogicalModelEditorComponent } from './logical-model-editor.component';

describe('data model routes', () => {
  it('exposes addressable model, mapping and drift detail routes', () => {
    expect(DATA_MODEL_ROUTES.find((route) => route.path === 'models/:id')?.loadComponent).toBeTypeOf('function');
    expect(DATA_MODEL_ROUTES.find((route) => route.path === 'models/:id/mappings')?.loadComponent).toBeTypeOf('function');
    expect(DATA_MODEL_ROUTES.find((route) => route.path === 'models/:id/drift')?.data?.['view']).toBe('drift');
  });

  it('keeps the three requested top-level work areas', () => {
    expect(DATA_MODEL_ROUTES.some((route) => route.path === 'models')).toBe(true);
    expect(DATA_MODEL_ROUTES.some((route) => route.path === 'physical-models')).toBe(true);
    expect(DATA_MODEL_ROUTES.some((route) => route.path === 'mappings')).toBe(true);
  });

  it('uses the secured logical-model editor for both create and detail routes', async()=>{
    const load=(path:string)=>DATA_MODEL_ROUTES.find((route)=>route.path===path)!.loadComponent!() as Promise<unknown>;
    const [createEditor,detailEditor]=await Promise.all([load('models/new'),load('models/:id')]);
    expect(createEditor).toBe(LogicalModelEditorComponent);
    expect(detailEditor).toBe(LogicalModelEditorComponent);
  });
});
