import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, NgZone, afterRenderEffect, inject, input, output, viewChild } from '@angular/core';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineAnimator, PIPELINE_BATCHES, PIPELINE_CONSUMER_Y, PIPELINE_SOURCE_Y, RAW_COLORS } from './documentation-pipeline-animation';
import { PipelineCopy } from './documentation-pipeline';

@Component({
  selector: 'daca-pipeline-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-pipeline-scene.component.html',
  styles: [`
    :host{position:absolute;inset:0;pointer-events:none;z-index:2;color:var(--daca-blue)}
    svg{width:100%;height:100%;overflow:visible}
    .scene-surface{fill:var(--daca-surface);stroke:var(--daca-border-strong);stroke-width:1.2}
    .scene-line{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .route{fill:none;stroke:var(--daca-blue);stroke-width:1;opacity:.14}
    .route.raw-route{stroke-dasharray:3 7;opacity:.13}
    .route.secure-route{stroke-dasharray:4 6;opacity:.22}
    .scene-label{font:11px var(--daca-font,sans-serif);fill:var(--daca-muted);stroke:none;text-anchor:middle}
    .flow-particle{fill:currentColor}.particle-halo{opacity:.13}.particle-core{stroke:var(--daca-surface);stroke-width:1.2}
    .product-body{fill:url(#pipeline-product-gold);stroke:#fff2c7;stroke-width:1.5}
    .product-halo{fill:#d4a017;opacity:.13}.product-shield{color:#583a08;fill:none;stroke:#583a08;stroke-width:1.8;stroke-linejoin:round}
    .product-union-ring{stroke:#d4a017;fill:#d4a017}
    .product-union-wave{stroke:#d4a017;stroke-width:2;fill:none}
  `],
  host: { '[class.is-paused]': '!running()' },
})
export class DocumentationPipelineSceneComponent {
  readonly running = input(true);
  readonly reducedMotion = input(false);
  readonly positionChange = output<number>();
  readonly colors = RAW_COLORS;
  readonly batches = PIPELINE_BATCHES;
  readonly consumerY = PIPELINE_CONSUMER_Y;
  readonly consumers = PIPELINE_CONSUMER_Y.map((_, index) => index);
  readonly sourceY = PIPELINE_SOURCE_Y;
  private readonly preferences = inject(UserPreferencesService);
  private readonly scene = viewChild<ElementRef<SVGElement>>('scene');
  private readonly zone = inject(NgZone);
  private animator?: PipelineAnimator;

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    afterRenderEffect((onCleanup) => {
      const svg = this.scene()?.nativeElement;
      const running = this.running(), reduced = this.reducedMotion();
      if (!svg || !view) return;
      this.animator ??= new PipelineAnimator(svg, view, seconds => this.zone.run(() => this.positionChange.emit(seconds)));
      this.zone.runOutsideAngular(() => this.animator!.setRunning(running && !reduced));
      onCleanup(() => this.animator?.stop());
    });
  }

  seek(seconds: number): void { this.zone.runOutsideAngular(() => this.animator?.seek(seconds)); }

  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
