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
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  strYoutube: string;
  strSource: string;
  strTags: string;
  [key: `strIngredient${number}`]: string;
  [key: `strMeasure${number}`]: string | null;
}

export interface MealDBResponse {
  meals: MealDBMeal[] | null;
}
