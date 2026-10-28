import { CatalogI18nService, CatalogTranslationKey } from '../../core/catalog-i18n.service';
import { DomainRelationType } from '../../core/catalog.models';

export const DOMAIN_RELATION_TYPES:readonly DomainRelationType[]=['related','partOf','interfacesWith','overlapsWith'];
const COPY:Record<DomainRelationType,{label:CatalogTranslationKey;description:CatalogTranslationKey}>={
  related:{label:'domainRelationRelated',description:'domainRelationRelatedHelp'},
  partOf:{label:'domainRelationPartOf',description:'domainRelationPartOfHelp'},
  interfacesWith:{label:'domainRelationInterfaces',description:'domainRelationInterfacesHelp'},
  overlapsWith:{label:'domainRelationOverlaps',description:'domainRelationOverlapsHelp'},
};
export function domainRelationLabel(type:DomainRelationType,i18n:CatalogI18nService):string{return i18n.t(COPY[type].label);}
export function domainRelationDescription(type:DomainRelationType,i18n:CatalogI18nService):string{return i18n.t(COPY[type].description);}
