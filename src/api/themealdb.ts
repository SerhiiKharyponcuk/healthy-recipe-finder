import type { MealDBResponse } from '../types/recipe';

const baseUrl = 'https://www.themealdb.com/api/json/v1/1/search.php?s=';
export function fetchMealData(q: string): Promise<MealDBResponse> {
  return fetch(baseUrl + q)
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
