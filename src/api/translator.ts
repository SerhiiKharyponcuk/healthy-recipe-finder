export interface BrowserTranslator {
  translate(text: string, options: { signal: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface BrowserTranslatorFactory {
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal: AbortSignal;
    monitor: (monitor: EventTarget) => void;
  }): Promise<BrowserTranslator>;
}

export type TranslationProgress = { download: number } | 'translating';

export async function createUkrainianTranslator(
  signal: AbortSignal,
  onProgress: (progress: TranslationProgress) => void,
): Promise<BrowserTranslator> {
  const api = (globalThis as typeof globalThis & { Translator?: BrowserTranslatorFactory }).Translator;
  if (!api) throw new DOMException('Browser translation unavailable', 'NotSupportedError');

  // Call create before awaiting anything: Chrome requires the user's click activation.
  return api.create({
    sourceLanguage: 'en',
    targetLanguage: 'uk',
    signal,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event instanceof ProgressEvent) onProgress({ download: event.loaded * 100 });
      });
    },
  });
}
