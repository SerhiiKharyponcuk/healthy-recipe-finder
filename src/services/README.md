# Запити до TheMealDB

Клієнт у `src/api/themealdb.ts` виконує запити й перетворює результати на модель `Recipe`.

Документація: https://www.themealdb.com/documentation#getting-started

- Пошук за назвою: `/api/json/v1/1/search.php?s=Arrabiata`
- Рецепт за ID: `/api/json/v1/1/lookup.php?i=52772`
- Фільтр за одним інгредієнтом: `/api/json/v1/1/filter.php?i=chicken_breast`

Типи відповіді: `src/types/recipe.ts`. `meals` може бути `null`.
TheMealDB повертає інгредієнти/кількості в полях `strIngredient1…20` / `strMeasure1…20`.
Картки з пошуку за інгредієнтом доповнюються деталями за ID. Час і порції відображаються лише для старих деморецептів, у яких є ці значення.
