import type { Recipe } from '../types/recipe';

interface BrowserTranslator {
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

export interface RecipeTranslation {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
}

export type TranslationProgress = { download: number } | 'translating';

export async function translateRecipe(
  recipe: Recipe,
  steps: string[],
  signal: AbortSignal,
  onProgress: (progress: TranslationProgress) => void,
): Promise<RecipeTranslation> {
  const api = (globalThis as typeof globalThis & { Translator?: BrowserTranslatorFactory }).Translator;
  if (!api) throw new DOMException('Browser translation unavailable', 'NotSupportedError');

  // Create directly from the click handler, while the browser still has user activation.
  const translator = await api.create({
    sourceLanguage: 'en',
    targetLanguage: 'uk',
    signal,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event instanceof ProgressEvent) onProgress({ download: event.loaded * 100 });
      });
    },
  });

  async function translate(text: string): Promise<string> {
    signal.throwIfAborted();
    return text ? (await translator.translate(text, { signal })).trim() || text : text;
  }

  async function translateLines(lines: string[]): Promise<string[]> {
    const translated: string[] = [];
    for (const line of lines) translated.push(await translate(line));
    return translated;
  }

  try {
    onProgress('translating');
    // Keep the ingredient order and the same step boundaries as the English recipe.
    return {
      title: await translate(recipe.title),
      description: await translate(recipe.description),
      ingredients: await translateLines(recipe.ingredients ?? []),
      steps: await translateLines(steps),
    };
  } finally {
    translator.destroy();
  }
}
