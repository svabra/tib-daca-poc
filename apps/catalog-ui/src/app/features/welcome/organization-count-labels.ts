import { CatalogLanguage } from '../../core/user-preferences.service';

type CountKind = 'offered' | 'consumed' | 'relationship';
const rules = Object.fromEntries((['de','fr','it','en','rm'] as const).map(language=>[language,new Intl.PluralRules(language)])) as Record<CatalogLanguage,Intl.PluralRules>;
const labels:Record<CatalogLanguage,Record<CountKind,readonly [string,string]>> = {
  de:{offered:['angebotenes Datenprodukt','angebotene Datenprodukte'],consumed:['konsumiertes Datenprodukt','konsumierte Datenprodukte'],relationship:['Katalogbeziehung','Katalogbeziehungen']},
  fr:{offered:['produit de données proposé','produits de données proposés'],consumed:['produit de données consommé','produits de données consommés'],relationship:['relation de catalogue','relations de catalogue']},
  it:{offered:['prodotto di dati offerto','prodotti di dati offerti'],consumed:['prodotto di dati consumato','prodotti di dati consumati'],relationship:['relazione di catalogo','relazioni di catalogo']},
  rm:{offered:['product da datas purschì','products da datas purschids'],consumed:['product da datas consumà','products da datas consumads'],relationship:['relaziun da catalog','relaziuns da catalog']},
  en:{offered:['offered data product','offered data products'],consumed:['consumed data product','consumed data products'],relationship:['catalog relationship','catalog relationships']},
};

/** Locale cardinal rules also cover French zero, instead of assuming count === 1. */
export function organizationCountLabel(kind:CountKind,count:number,language:CatalogLanguage):string {
  return `${count} ${labels[language][kind][rules[language].select(count)==='one'?0:1]}`;
}
