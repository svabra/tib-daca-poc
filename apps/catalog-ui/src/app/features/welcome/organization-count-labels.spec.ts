import { organizationCountLabel } from './organization-count-labels';

describe('Localized data landscape counts', () => {
  it.each([
    ['de', ['0 angebotene Datenprodukte','1 angebotenes Datenprodukt','2 angebotene Datenprodukte'], '1 konsumiertes Datenprodukt','2 konsumierte Datenprodukte','1 Katalogbeziehung','2 Katalogbeziehungen'],
    ['fr', ['0 produit de données proposé','1 produit de données proposé','2 produits de données proposés'], '1 produit de données consommé','2 produits de données consommés','1 relation de catalogue','2 relations de catalogue'],
    ['it', ['0 prodotti di dati offerti','1 prodotto di dati offerto','2 prodotti di dati offerti'], '1 prodotto di dati consumato','2 prodotti di dati consumati','1 relazione di catalogo','2 relazioni di catalogo'],
    ['rm', ['0 products da datas purschids','1 product da datas purschì','2 products da datas purschids'], '1 product da datas consumà','2 products da datas consumads','1 relaziun da catalog','2 relaziuns da catalog'],
    ['en', ['0 offered data products','1 offered data product','2 offered data products'], '1 consumed data product','2 consumed data products','1 catalog relationship','2 catalog relationships'],
  ] as const)('uses locale cardinal forms for %s, including zero', (language,offered,consumedOne,consumedMany,relationOne,relationMany) => {
    for (const count of [0,1,2]) expect(organizationCountLabel('offered',count,language)).toBe(offered[count]);
    expect(organizationCountLabel('consumed',1,language)).toBe(consumedOne);
    expect(organizationCountLabel('consumed',2,language)).toBe(consumedMany);
    expect(organizationCountLabel('relationship',1,language)).toBe(relationOne);
    expect(organizationCountLabel('relationship',2,language)).toBe(relationMany);
  });
});
