import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DomainSummary } from '../../core/catalog.models';
import { SemanticPickerComponent } from './semantic-picker.component';

@Component({
  selector:'daca-domain-picker',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  imports: [SemanticPickerComponent],
  template: `<daca-semantic-picker kind="domain" [items]="domains()" [existingItems]="existingDomains()"
    [selectedIds]="selectedIds()" [disabled]="disabled()" [contextKey]="contextKey()" (selectionToggle)="domainToggle.emit($event)" />`,
})
export class DomainPickerComponent {
  readonly domains=input.required<readonly DomainSummary[]>();
  readonly existingDomains=input<readonly DomainSummary[]>([]);
  readonly selectedIds=input.required<readonly string[]>();
  readonly disabled=input(false);
  readonly contextKey=input('');
  readonly domainToggle=output<string>();
}
