import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('copies the exact supplied safe snippet through the browser clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ClipboardService);

    await service.writeText("SELECT * FROM \"public\".\"facts\" LIMIT 100;");

    expect(writeText).toHaveBeenCalledExactlyOnceWith('SELECT * FROM "public"."facts" LIMIT 100;');
  });

  it('uses a temporary local selection when the async clipboard is unavailable', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
    TestBed.configureTestingModule({});
    const document = TestBed.inject(DOCUMENT);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const service = TestBed.inject(ClipboardService);

    await service.writeText('safe-value');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea[aria-hidden="true"]')).toBeNull();
  });

  it('rejects the operation when no clipboard mechanism succeeds', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
    TestBed.configureTestingModule({});
    const document = TestBed.inject(DOCUMENT);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    const service = TestBed.inject(ClipboardService);

    await expect(service.writeText('safe-value')).rejects.toThrow('Clipboard is unavailable');
  });
});
