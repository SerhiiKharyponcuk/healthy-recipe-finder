import type { MealDBResponse } from '../types/recipe';

const baseUrl = 'https://www.themealdb.com/api/json/v1/1/random.php';
export function fetchMealData(): Promise<MealDBResponse> {
  return fetch(baseUrl)
    .then((response) => response.json())
    .then((data: MealDBResponse) => {
      console.log(data);
      return data;
    })
    .catch((error) => {
      console.error('Error fetching meal data:', error);
      throw error;
    });
}
