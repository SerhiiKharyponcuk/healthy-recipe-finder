/** UI model. All values here belong to the demo, not to TheMealDB. */
export interface Recipe {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
  label: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: string[];
  instructions: string[];
}

/** Selected fields from the API. Adapt these to Recipe in your integration. */
export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strMealThumb: string;
  strYoutube: string | null;
  strSource: string | null;
  strTags: string | null;
  [key: `strIngredient${number}`]: string | null;
  [key: `strMeasure${number}`]: string | null;
}

export interface MealDBResponse {
  meals: MealDBMeal[] | null;
}
