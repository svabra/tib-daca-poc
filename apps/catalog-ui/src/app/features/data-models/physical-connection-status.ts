import { PhysicalSnapshot } from './data-models.models';

export function physicalConnectionStatus(snapshot:PhysicalSnapshot):{label:string;description:string;configured:boolean|null}{
  const configured=snapshot.sourceConnectionConfigured??(['csv','fixture'].includes(snapshot.sourceType)?false:null);
  if(configured===true)return{configured,label:'Mit Quellenanbindung',description:'Ein technischer Quellen-Connector ist konfiguriert. Dies bestätigt weder die aktuelle Erreichbarkeit noch einen freigegebenen Datenprodukt-Endpoint.'};
  if(configured===false)return{configured,label:'Nur Strukturmetadaten',description:'Die physische Struktur ist beschrieben, ohne technischen Zugriff von DaCa auf das Quellsystem. Die Metadaten können trotzdem zugeordnet werden.'};
  return{configured,label:'Anbindung unbekannt',description:'Für diese Repräsentation liegen keine bestätigten Angaben zur technischen Quellenanbindung vor.'};
}
