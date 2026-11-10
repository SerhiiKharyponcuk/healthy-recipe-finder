import type { MealDBMeal, MealDBResponse, Recipe, RecipeSearchMode } from '../types/recipe';

const baseUrl = 'https://www.themealdb.com/api/json/v1/1/';

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toRecipe(meal: MealDBMeal, summary: boolean): Recipe | undefined {
  const id = readText(meal?.idMeal);
  const title = readText(meal?.strMeal);
  if (!/^\d+$/.test(id) || !title) return;

  const thumbnail = readText(meal.strMealThumb);
  const recipe: Recipe = {
    id,
    title,
    description: '',
    image: thumbnail.startsWith('https://') ? thumbnail : '',
    imageAlt: title,
    category: readText(meal.strCategory),
    label: readText(meal.strArea),
  };
  if (summary) return recipe;

  const ingredients: string[] = [];
  for (let slot = 1; slot <= 20; slot += 1) {
    const ingredient = readText(meal[`strIngredient${slot}`]);
    if (!ingredient) continue;
    const measure = readText(meal[`strMeasure${slot}`]);
    ingredients.push(measure ? `${measure} ${ingredient}` : ingredient);
  }

  return {
    ...recipe,
    ingredients,
    instructions: readText(meal.strInstructions).split(/\r?\n+/).map((step) => step.trim()).filter(Boolean),
  };
}

async function requestJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`TheMealDB returned HTTP ${response.status}`);
  return response.json();
}

async function requestMeals(url: URL, signal: AbortSignal, summary = false): Promise<Recipe[]> {
  const data = await requestJson(url, signal) as Partial<MealDBResponse> | null;
  if (data?.meals === null) return [];
  if (!Array.isArray(data?.meals)) throw new Error('Unexpected TheMealDB response');

  return data.meals.flatMap((meal) => {
    const recipe = toRecipe(meal, summary);
    return recipe ? [recipe] : [];
  });
}

export function searchRecipes(query: string, mode: RecipeSearchMode, signal: AbortSignal): Promise<Recipe[]> {
  const byIngredient = mode === 'ingredient' && query !== '';
  const url = new URL(byIngredient ? 'filter.php' : 'search.php', baseUrl);
  if (byIngredient) {
    url.searchParams.set('i', query.toLowerCase().replace(/\s+/g, '_'));
  } else {
    url.searchParams.set('s', query);
  }
  return requestMeals(url, signal, byIngredient);
}

export function recipesByLetter(letter: string, signal: AbortSignal): Promise<Recipe[]> {
  const url = new URL('search.php', baseUrl);
  url.searchParams.set('f', letter);
  return requestMeals(url, signal);
}

export async function lookupRecipe(id: string, signal: AbortSignal): Promise<Recipe | undefined> {
  const url = new URL('lookup.php', baseUrl);
  url.searchParams.set('i', id);
  const recipes = await requestMeals(url, signal);
  return recipes.find((recipe) => recipe.id === id);
}

function filterRecipes(key: 'c' | 'a', value: string, signal: AbortSignal): Promise<Recipe[]> {
  const url = new URL('filter.php', baseUrl);
  url.searchParams.set(key, value);
  return requestMeals(url, signal, true);
}

export async function browseRecipes(
  query: string,
  mode: RecipeSearchMode,
  category: string,
  cuisine: string,
  signal: AbortSignal,
): Promise<Recipe[]> {
  const sources: Promise<Recipe[]>[] = [];
  if (query || (!category && !cuisine)) sources.push(searchRecipes(query, mode, signal));
  if (category) sources.push(filterRecipes('c', category, signal));
  if (cuisine) sources.push(filterRecipes('a', cuisine, signal));

  const [primary, ...filters] = await Promise.all(sources);
  const matchingIds = filters.map((recipes) => new Set(recipes.map((recipe) => recipe.id)));
  return primary
    .filter((recipe) => matchingIds.every((ids) => ids.has(recipe.id)))
    .map((recipe) => ({
      ...recipe,
      category: recipe.category || category,
      label: recipe.label || cuisine,
    }));
}

export interface FilterOption {
  value: string;
  label: string;
}

export async function listFilterOptions(
  kind: 'c' | 'a',
  signal: AbortSignal,
): Promise<FilterOption[]> {
  const url = new URL('list.php', baseUrl);
  url.searchParams.set(kind, 'list');
  const data = await requestJson(url, signal) as { meals?: Record<string, unknown>[] } | null;
  if (!Array.isArray(data?.meals)) throw new Error('Unexpected TheMealDB filter list');
  const options = new Map<string, string>();
  for (const meal of data.meals) {
    const value = readText(kind === 'c' ? meal?.strCategory : meal?.strArea);
    if (!value) continue;
    options.set(value, value);
  }
  return [...options].map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

export async function randomRecipe(signal: AbortSignal): Promise<Recipe | undefined> {
  const [recipe] = await requestMeals(new URL('random.php', baseUrl), signal);
  return recipe;
}
