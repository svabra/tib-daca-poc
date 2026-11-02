import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface DacaNotification {
  id:string; title:string; detail:string; createdAt:string;
  route:string; queryParams?:Record<string,string>;
}

@Component({
  selector:'daca-notification-menu',standalone:true,imports:[DatePipe,RouterLink],
  changeDetection:ChangeDetectionStrategy.OnPush,
  styleUrl:'./notification-menu.component.css',
  template:`
    <details #menu>
      <summary class="daca-authority-notification" [attr.aria-label]="label('notifications') + ': ' + items().length" [attr.title]="label('notifications')">
        @if(items().length || error()) { <span class="notification-badge" aria-live="polite">{{items().length ? (items().length > 99 ? '99+' : items().length) : '!'}}</span> }
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 11.6h9.6l-1.1-1.6V6.8a3.7 3.7 0 0 0-7.4 0V10z"/><path d="M6.2 12.1a1.9 1.9 0 0 0 3.6 0"/></svg>
      </summary>
      <section class="notification-panel" [attr.aria-label]="label('messages')">
        <header><strong>{{label('messages')}}</strong><a [routerLink]="href()" (click)="close()">{{label('allTasks')}}</a></header>
        @if(error()){<p class="notification-status" role="alert">{{label('error')}}</p>}
        @if(loading()){<p class="notification-status" role="status">{{label('loading')}}</p>}
        <div class="notification-list">
          @for(item of items();track item.id){
            <a class="notification-item" [attr.data-notification-id]="item.id" [routerLink]="item.route" [queryParams]="item.queryParams" (click)="close()">
              <strong>{{item.title}}</strong><span>{{item.detail}}</span><time [attr.datetime]="item.createdAt">{{item.createdAt | date:'dd.MM.yyyy, HH:mm'}}</time>
            </a>
          } @empty { @if(!loading() && !error()){<p class="notification-status">{{label('empty')}}</p>} }
        </div>
      </section>
    </details>
  `,
})
export class DacaNotificationMenuComponent {
  readonly items=input<readonly DacaNotification[]>([]);
  readonly loading=input(false);
  readonly error=input(false);
  readonly href=input('/tasks');
  readonly locale=input<'de'|'fr'|'it'|'rm'|'en'>('de');
  readonly context=input<string|null>(null);
  private readonly menu=viewChild<ElementRef<HTMLDetailsElement>>('menu');
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  constructor(){effect(()=>{this.context();this.close();});}
  close():void{const menu=this.menu()?.nativeElement;if(menu)menu.open=false;}
  @HostListener('document:click',['$event']) outside(event:MouseEvent):void{if(!this.host.nativeElement.contains(event.target as Node))this.close();}
  @HostListener('document:keydown',['$event']) escape(event:KeyboardEvent):void{
    const menu=this.menu()?.nativeElement;
    if(event.key==='Escape'&&menu?.open){event.preventDefault();event.stopPropagation();this.close();menu.querySelector('summary')?.focus();}
  }
  label(key:string):string{
    const copy:Record<string,readonly [string,string,string,string,string]>={
      notifications:['Benachrichtigungen','Notifications','Notifiche','Messadis','Notifications'],
      messages:['Nachrichten','Messages','Messaggi','Messadis','Messages'],
      allTasks:['Alle Aufgaben','Toutes les tâches','Tutte le attività','Tut las incumbensas','All tasks'],
      empty:['Keine offenen Nachrichten.','Aucun message en attente.','Nessun messaggio in sospeso.','Nagins messadis averts.','No pending messages.'],
      loading:['Nachrichten werden geladen …','Chargement des messages…','Caricamento dei messaggi…','Ils messadis vegnan chargiads …','Loading messages…'],
      error:['Nachrichtenstatus derzeit unbekannt. Unter Aufgaben erneut laden.','État des messages inconnu. Recharger sous Tâches.','Stato dei messaggi sconosciuto. Ricaricare in Attività.','Il status dals messadis n’è betg enconuschent. Chargiar danovamain sut Incumbensas.','Message status is unknown. Retry in Tasks.'],
    };
    return copy[key]?.[({de:0,fr:1,it:2,rm:3,en:4})[this.locale()]]??key;
  }
}
