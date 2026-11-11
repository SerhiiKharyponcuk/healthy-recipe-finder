import type { Recipe } from '../types/recipe';
import { createUkrainianTranslator } from './translator';
import type { TranslationProgress } from './translator';

export interface RecipeTranslation {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
}

export async function translateRecipe(
  recipe: Recipe,
  steps: string[],
  signal: AbortSignal,
  onProgress: (progress: TranslationProgress) => void,
): Promise<RecipeTranslation> {
  const translator = await createUkrainianTranslator(signal, onProgress);

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
