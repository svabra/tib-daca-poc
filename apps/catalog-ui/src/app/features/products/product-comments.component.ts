import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CommentVisibility, ProductComment, ProductCommentsApiService } from './product-comments-api.service';

@Component({
  selector: 'daca-product-comments', standalone: true, imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-comments.component.html', styleUrl: './product-comments.component.css',
})
export class ProductCommentsComponent {
  readonly productId = input.required<string>();
  private readonly api = inject(ProductCommentsApiService);
  private readonly identity = inject(DemoIdentityService);
  @ViewChild('composer') private composer?: ElementRef<HTMLDialogElement>;
  readonly items = signal<ProductComment[]>([]);
  readonly canViewPrivate = signal(false);
  readonly nextOffset = signal<number | null>(null);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly error = signal(''); readonly formError = signal(''); readonly notice = signal('');
  readonly pendingDeletion = signal<string | null>(null);
  readonly deleting = signal(false);
  readonly deletionError = signal('');
  text = ''; visibility: CommentVisibility = 'private';
  private contextEpoch = 0; private readEpoch = 0;

  constructor() {
    effect(() => {
      this.productId(); this.identity.userId();
      ++this.contextEpoch;
      if (this.composer?.nativeElement.open) this.composer.nativeElement.close();
      this.clearDraft();
      this.items.set([]); this.canViewPrivate.set(false); this.nextOffset.set(null);
      this.saving.set(false); this.notice.set(''); this.error.set('');
      this.pendingDeletion.set(null); this.deleting.set(false); this.deletionError.set('');
      void this.load();
    });
    inject(DestroyRef).onDestroy(() => { ++this.contextEpoch; ++this.readEpoch; });
  }

  openComposer(): void {
    this.formError.set('');
    this.composer?.nativeElement.showModal();
    this.composer?.nativeElement.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }
  closeComposer(): void { if (this.composer?.nativeElement.open) this.composer.nativeElement.close(); this.clearDraft(); }
  clearDraft(): void { this.text = ''; this.visibility = 'private'; this.formError.set(''); }

  canDelete(comment: ProductComment): boolean {
    return comment.visibility === 'public' && comment.authorUserId === this.identity.userId();
  }

  async deletePublicComment(comment: ProductComment): Promise<void> {
    if (!this.canDelete(comment) || this.deleting() || this.pendingDeletion() !== comment.id) return;
    const context = this.contextEpoch;
    this.deleting.set(true); this.deletionError.set('');
    try {
      await this.api.deletePublic(this.productId(), comment.id);
      if (context !== this.contextEpoch) return;
      this.pendingDeletion.set(null);
      this.notice.set('Öffentlicher Kommentar gelöscht.');
      await this.load();
    } catch {
      if (context === this.contextEpoch) this.deletionError.set('Der Kommentar konnte nicht gelöscht werden. Bitte erneut versuchen.');
    } finally {
      if (context === this.contextEpoch) this.deleting.set(false);
    }
  }

  async load(offset = 0): Promise<void> {
    const context = this.contextEpoch; const read = ++this.readEpoch;
    this.loading.set(true); this.error.set('');
    if (offset === 0) { this.items.set([]); this.nextOffset.set(null); }
    try {
      const page = await this.api.list(this.productId(), offset);
      if (context !== this.contextEpoch || read !== this.readEpoch) return;
      this.items.update(items => offset ? [...items, ...page.items] : page.items);
      this.canViewPrivate.set(page.canViewPrivate); this.nextOffset.set(page.nextOffset);
    } catch {
      if (context === this.contextEpoch && read === this.readEpoch) this.error.set('Kommentare konnten nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      if (context === this.contextEpoch && read === this.readEpoch) this.loading.set(false);
    }
  }

  async saveComment(): Promise<void> {
    const text = this.text.trim(); const visibility = this.visibility;
    if (this.saving() || !text || text.length > 4000) return;
    const context = this.contextEpoch;
    this.saving.set(true); this.formError.set('');
    try {
      await this.api.create(this.productId(), text, visibility);
      if (context !== this.contextEpoch) return;
      this.closeComposer();
      this.notice.set(visibility === 'private'
        ? 'Privater Kommentar übermittelt. Nur der zuständige Data Owner und dessen Stellvertretung können ihn sehen.'
        : 'Öffentlicher Kommentar erfasst. Er ist für alle Leser dieses Datenprodukts sichtbar.');
      await this.load();
    } catch {
      if (context === this.contextEpoch) this.formError.set('Der Kommentar konnte nicht gespeichert werden. Bitte prüfen Sie die Eingabe und versuchen Sie es erneut.');
    } finally {
      if (context === this.contextEpoch) this.saving.set(false);
    }
  }
}
