# Місце для вашої API-логіки

Інтерфейс зараз використовує лише `src/data/demo-recipes.ts`. Мережевих API-запитів немає.

Документація: https://www.themealdb.com/documentation#getting-started

- Пошук за назвою: `/api/json/v1/1/search.php?s=Arrabiata`
- Рецепт за ID: `/api/json/v1/1/lookup.php?i=52772`
- Фільтр за одним інгредієнтом: `/api/json/v1/1/filter.php?i=chicken_breast`

Типи відповіді: `src/types/recipe.ts`. `meals` може бути `null`.
TheMealDB повертає інгредієнти/кількості в полях `strIngredient1…20` / `strMeasure1…20`.
Час приготування, порції та харчова цінність не гарантовані API: сховайте відповідний UI або додайте власні перевірені дані. Значення в демо — приклади для стилізації.

Ви можете повністю замінити `src/main.ts` власною логікою, залишивши класи CSS та семантичну HTML-структуру. Не вставляйте необроблений API-контент через `innerHTML`.
