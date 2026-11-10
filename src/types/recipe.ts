/** Shared model for catalog cards, saved recipes, and recipe details. */
export interface Recipe {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  category: string;
  label: string;
  prepMinutes?: number;
  cookMinutes?: number;
  servings?: number;
  /** Ingredient search returns summaries. Their details are loaded on demand. */
  ingredients?: string[];
  instructions?: string[];
}

export type RecipeSearchMode = 'name' | 'ingredient';

/** Category, ingredients and instructions are absent from ingredient results. */
export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  [key: `strIngredient${number}`]: string | null | undefined;
  [key: `strMeasure${number}`]: string | null | undefined;
}

export interface MealDBResponse {
  meals: MealDBMeal[] | null;
}
