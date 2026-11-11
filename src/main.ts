import './styles/index.css';
import { translateRecipe } from './api/recipe-translator';
import type { RecipeTranslation } from './api/recipe-translator';
import { browseRecipes, listFilterOptions, lookupRecipe, randomRecipe, recipesByLetter } from './api/themealdb';
import type { FilterOption } from './api/themealdb';
import { demoRecipes } from './data/demo-recipes';
import type { Recipe, RecipeSearchMode } from './types/recipe';
import { cookingSteps, openCookingMode } from './ui/cooking-mode';
import { element, escapeHtml, icon, readStorage, writeStorage } from './ui/dom';
import { initPageTranslation } from './ui/page-translation';
import { addRecipeIngredients } from './ui/shopping-list';

const grid = element<HTMLDivElement>('#recipe-grid');
const search = element<HTMLInputElement>('#recipe-search');
const searchMode = element<HTMLSelectElement>('#search-mode');
const categories = element<HTMLDivElement>('#recipe-categories');
const categoryFilter = element<HTMLSelectElement>('#category-filter');
const cuisineFilter = element<HTMLSelectElement>('#cuisine-filter');
const sort = element<HTMLSelectElement>('#sort-recipes');
const savedToggle = element<HTMLButtonElement>('#saved-toggle');
const dialog = element<HTMLDialogElement>('#recipe-dialog');
const detail = element<HTMLDivElement>('#recipe-detail');
const surprise = element<HTMLButtonElement>('#surprise-recipe');
const loadMore = element<HTMLButtonElement>('#load-more');
const recipeError = element<HTMLDivElement>('#recipe-error');
const storageKey = 'sprout:saved-recipes:v1';
const pageSize = 6;
const catalogLetters = 'abcdefghijklmnopqrstuvwxyz';
const quickCategories = ['', 'Vegetarian', 'Chicken', 'Seafood', 'Pasta', 'Dessert'];
const recipeCache = new Map(demoRecipes.map((recipe) => [recipe.id, recipe]));
const translationCache = new Map<string, RecipeTranslation>();

let recipes: Recipe[] = [];
let allCategories: FilterOption[] = [];
let allCuisines: FilterOption[] = [];
let category = '';
let cuisine = '';
let usingSamples = false;
let savedOnly = false;
let visibleCount = pageSize;
let nextLetter = 0;
let loading = false;
let loadingMore = false;
let loadError: { message: string; retry: () => void } | undefined;
let collectionRequest: AbortController | undefined;
let detailRequest: AbortController | undefined;
let translationRequest: AbortController | undefined;
let searchTimer: ReturnType<typeof setTimeout>;
let openRecipe: Recipe | undefined;
const checkedIngredients = new Set<number>();
let lastTrigger: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout>;

function readSaved(): Set<string> {
  const stored = readStorage(storageKey);
  if (!Array.isArray(stored)) return new Set();
  return new Set(stored.filter((id): id is string =>
    typeof id === 'string' && (/^\d+$/.test(id) || recipeCache.has(id)),
  ));
}

const saved = readSaved();
const imagePath = (image: string) => image.startsWith('https://')
  ? image
  : `${import.meta.env.BASE_URL}images/${encodeURIComponent(image)}`;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function selectedSearchMode(): RecipeSearchMode {
  return searchMode.value === 'ingredient' ? 'ingredient' : 'name';
}

function hasMoreCatalogRecipes(): boolean {
  return !usingSamples && !savedOnly && !category && !cuisine && !search.value.trim() && nextLetter < catalogLetters.length;
}

function updateFilterOptions(): void {
  const categoriesInView = new Set([...quickCategories.filter(Boolean), ...recipes.map((recipe) => recipe.category).filter(Boolean)]);
  const cuisinesInView = new Set(recipes.filter((recipe) => /^\d+$/.test(recipe.id)).map((recipe) => recipe.label).filter(Boolean));
  const categoryOptions = allCategories.length ? allCategories : [...categoriesInView].sort().map((value) => ({ value, label: value }));
  const cuisineOptions = allCuisines.length ? allCuisines : [...cuisinesInView].sort().map((value) => ({ value, label: value }));
  setOptions(categoryFilter, categoryOptions, 'All categories', category);
  setOptions(cuisineFilter, cuisineOptions, 'All cuisines', cuisine);
}

function setOptions(select: HTMLSelectElement, options: FilterOption[], placeholder: string, selected: string): void {
  const values = [{ value: '', label: placeholder }, ...options];
  if (selected && !values.some((option) => option.value === selected)) values.push({ value: selected, label: selected });
  const signature = JSON.stringify(values);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...values.map(({ label, value }) => new Option(label, value)));
    select.dataset.options = signature;
  }
  select.value = selected;
}

function card(recipe: Recipe): string {
  const id = escapeHtml(recipe.id);
  const title = escapeHtml(recipe.title);
  const isSaved = saved.has(recipe.id);
  const image = recipe.image
    ? `<img class="card-image" src="${escapeHtml(imagePath(recipe.image))}" alt="${escapeHtml(recipe.imageAlt)}" width="600" height="400" loading="lazy" decoding="async" />`
    : `<span class="card-image-placeholder" aria-hidden="true">${icon('leaf')}</span>`;

  return `<article class="recipe-card">
    <div class="card-image-wrap">
      <button class="card-image-link" type="button" data-open="${id}" aria-label="View ${title}">${image}</button>
      ${recipe.label ? `<span class="card-label">${escapeHtml(recipe.label)}</span>` : ''}
      <button class="icon-button card-save" type="button" data-save="${id}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${title}" aria-pressed="${isSaved}">${icon('heart')}</button>
    </div>
    <div class="card-body">
      ${recipe.category ? `<p class="card-category">${escapeHtml(recipe.category)}</p>` : ''}
      <h3 class="card-title"><button class="title-button" type="button" data-open="${id}">${title}</button></h3>
      ${recipe.description ? `<p class="card-description">${escapeHtml(recipe.description)}</p>` : ''}
      <div class="card-footer"><button class="recipe-link" type="button" data-open="${id}">View recipe ${icon('arrow')}</button></div>
    </div>
  </article>`;
}

function render(): void {
  const query = search.value.trim();
  const collection = savedOnly ? recipes.filter((recipe) => saved.has(recipe.id)) : recipes;
  updateFilterOptions();
  const choices = savedOnly
    ? ['', ...new Set(collection.map((recipe) => recipe.category).filter(Boolean))]
    : [...new Set([...quickCategories, category])];
  categories.hidden = choices.length === 1;
  const activeChip = categories.querySelector<HTMLButtonElement>(':focus')?.dataset.category;
  categories.innerHTML = choices.map((choice) => {
    const active = choice === category;
    return `<button class="category-chip${active ? ' is-active' : ''}" type="button" data-category="${escapeHtml(choice)}" aria-pressed="${active}">${escapeHtml(choice || 'All recipes')}</button>`;
  }).join('');
  if (activeChip !== undefined) categories.querySelector<HTMLButtonElement>(`[data-category="${CSS.escape(activeChip)}"]`)?.focus({ preventScroll: true });

  const savedQuery = savedOnly ? normalize(query) : '';
  const mode = selectedSearchMode();
  const filtered = collection.filter((recipe) => {
    if (savedOnly && category && recipe.category !== category) return false;
    if (savedOnly && cuisine && recipe.label !== cuisine) return false;
    if (!savedQuery) return true;
    const haystack = mode === 'ingredient' ? recipe.ingredients?.join(' ') ?? '' : recipe.title;
    return normalize(haystack).includes(savedQuery);
  });
  if (sort.value === 'az' || sort.value === 'za') {
    const direction = sort.value === 'az' ? 1 : -1;
    filtered.sort((a, b) => direction * a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  }

  grid.innerHTML = loading
    ? Array.from({ length: pageSize }, () => '<div class="recipe-card recipe-skeleton" aria-hidden="true"><div class="skeleton"></div><span class="skeleton"></span><span class="skeleton"></span></div>').join('')
    : filtered.slice(0, visibleCount).map(card).join('');
  grid.setAttribute('aria-busy', String(loading || loadingMore));
  const noun = `${usingSamples ? 'sample ' : ''}${filtered.length === 1 ? 'recipe' : 'recipes'}`;
  const resultCount = `Showing ${Math.min(visibleCount, filtered.length)} of ${filtered.length} ${noun}`;
  element('#result-count').textContent = loading ? 'Loading recipes…' : loadingMore ? 'Loading more recipes…' : resultCount;
  element('#saved-count').textContent = String(saved.size);
  savedToggle.setAttribute('aria-pressed', String(savedOnly));
  element('#catalog-kicker').textContent = savedOnly ? 'YOUR COLLECTION' : 'THE RECIPE COLLECTION';
  element('#recipes-heading').textContent = savedOnly ? 'Saved recipes.' : 'Find your next favorite.';
  recipeError.hidden = !loadError;
  element('#recipe-error-message').textContent = loadError?.message ?? '';
  element('#empty-state').hidden = loading || loadingMore || Boolean(loadError) || filtered.length > 0 || hasMoreCatalogRecipes();
  element('#empty-description').textContent = savedOnly && saved.size === 0
    ? 'Tap a heart on any recipe to keep your favorites here.'
    : 'Try another name or ingredient, or clear your filters.';
  const moreAvailable = visibleCount < filtered.length || hasMoreCatalogRecipes();
  loadMore.hidden = loading || (!moreAvailable && !loadingMore);
  loadMore.disabled = loadingMore;
  element('#collection-note').textContent = filtered.length === 0
    ? ''
    : moreAvailable ? 'There’s more to explore.' : "You've reached the end of these results.";

  const filters = [query && `“${query}”`, category, cuisine, sort.value !== 'featured' && (sort.value === 'az' ? 'Name A–Z' : 'Name Z–A')].filter(Boolean);
  element('#active-filters').hidden = filters.length === 0;
  element('#filter-summary').textContent = filters.join(' · ');
}

async function getRecipe(id: string, signal: AbortSignal): Promise<Recipe | undefined> {
  const cached = recipeCache.get(id);
  if (cached?.instructions !== undefined) return cached;
  const recipe = await lookupRecipe(id, signal);
  if (recipe) recipeCache.set(id, recipe);
  return recipe;
}

async function loadRecipes(signal: AbortSignal): Promise<void> {
  try {
    if (savedOnly) {
      const results = await Promise.allSettled([...saved].map((id) => getRecipe(id, signal)));
      if (signal.aborted) return;
      recipes = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
      if (recipes.length < results.length) {
        loadError = { message: 'Some saved recipes could not be loaded. Please try again.', retry: refreshRecipes };
      }
    } else {
      const results = await browseRecipes(search.value.trim(), selectedSearchMode(), category, cuisine, signal);
      if (signal.aborted) return;
      recipes = results;
      for (const recipe of results) {
        if (recipe.instructions !== undefined) recipeCache.set(recipe.id, recipe);
      }
    }
  } catch {
    if (!signal.aborted) {
      if (!savedOnly && !search.value.trim() && !category && !cuisine) {
        recipes = demoRecipes;
        usingSamples = true;
        loadError = { message: 'The live catalog is unavailable. Here are a few sample recipes while you wait.', retry: refreshRecipes };
      } else {
        loadError = { message: 'Could not load recipes. Please try again.', retry: refreshRecipes };
      }
    }
  } finally {
    if (!signal.aborted) {
      loading = false;
      render();
    }
  }
}

function refreshRecipes(delay = 0): void {
  clearTimeout(searchTimer);
  collectionRequest?.abort();
  detailRequest?.abort();
  collectionRequest = new AbortController();
  const { signal } = collectionRequest;
  recipes = [];
  usingSamples = false;
  visibleCount = pageSize;
  nextLetter = 0;
  loadError = undefined;
  loadingMore = false;
  loading = true;
  render();
  searchTimer = setTimeout(() => void loadRecipes(signal), delay);
}

async function showMoreRecipes(): Promise<void> {
  if (loading || loadingMore) return;
  const firstNewCard = grid.childElementCount;
  const selectedCategory = category;
  const selectedSort = sort.value;
  const signal = collectionRequest?.signal;

  if (signal && firstNewCard === recipes.length && hasMoreCatalogRecipes()) {
    loadingMore = true;
    loadError = undefined;
    render();
    const knownIds = new Set(recipes.map((recipe) => recipe.id));
    try {
      // Skip letters whose results are empty or already in the catalog.
      while (recipes.length === firstNewCard && hasMoreCatalogRecipes()) {
        const batch = await recipesByLetter(catalogLetters[nextLetter], signal);
        if (signal.aborted) return;
        nextLetter += 1;
        for (const recipe of batch) {
          if (knownIds.has(recipe.id)) continue;
          knownIds.add(recipe.id);
          recipes.push(recipe);
          recipeCache.set(recipe.id, recipe);
        }
      }
    } catch {
      if (signal.aborted) return;
      loadError = { message: 'Could not load more recipes. Please try again.', retry: () => void showMoreRecipes() };
    }
    loadingMore = false;
  }

  const sameView = category === selectedCategory && sort.value === selectedSort;
  if (sameView) visibleCount = firstNewCard + pageSize;
  render();
  if (sameView) grid.querySelectorAll<HTMLButtonElement>('.card-image-link')[firstNewCard]?.focus();
}

function showToast(message: string): void {
  clearTimeout(toastTimer);
  const toast = element('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function toggleSaved(id: string): void {
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  if (writeStorage(storageKey, [...saved])) {
    showToast(saved.has(id) ? 'A good one, saved for later.' : 'Recipe removed from your favorites.');
  } else {
    showToast('Favorites updated for this visit. Browser storage is unavailable.');
  }
  render();
  if (openRecipe) updateDetailSave();
}

function updateDetailSave(): void {
  if (!openRecipe) return;
  const button = element<HTMLButtonElement>('#detail-save');
  const isSaved = saved.has(openRecipe.id);
  button.setAttribute('aria-pressed', String(isSaved));
  button.innerHTML = `${icon('heart')}${isSaved ? 'Recipe saved' : 'Save recipe'}`;
}

function stopRecipeTranslation(): void {
  translationRequest?.abort();
  translationRequest = undefined;
}

function showRecipe(recipe: Recipe, trigger: HTMLElement, translation?: RecipeTranslation, focusLanguage = false): void {
  stopRecipeTranslation();
  if (openRecipe?.id !== recipe.id) checkedIngredients.clear();
  lastTrigger = trigger;
  openRecipe = recipe;
  const language = translation ? 'uk' : 'en';
  const title = translation?.title ?? recipe.title;
  const description = translation?.description ?? recipe.description;
  const eyebrow = [recipe.category, recipe.label].filter(Boolean).join(' · ').toUpperCase();
  const image = recipe.image
    ? `<img class="detail-image" src="${escapeHtml(imagePath(recipe.image))}" alt="${escapeHtml(recipe.imageAlt)}" width="600" height="600" />`
    : '<div class="detail-image" aria-hidden="true"></div>';
  const metadata = [
    recipe.prepMinutes !== undefined && `<div>${icon('clock')}<span><strong>${recipe.prepMinutes} min</strong><small>Prep time</small></span></div>`,
    recipe.cookMinutes !== undefined && `<div>${icon('chef')}<span><strong>${recipe.cookMinutes} min</strong><small>Cook time</small></span></div>`,
    recipe.servings !== undefined && `<div>${icon('users')}<span><strong>${recipe.servings}</strong><small>Servings</small></span></div>`,
  ].filter(Boolean).join('');
  const ingredients = (translation?.ingredients ?? recipe.ingredients)?.map((ingredient, index) =>
    `<li><label><input type="checkbox" data-ingredient="${index}" ${checkedIngredients.has(index) ? 'checked' : ''} /><span>${escapeHtml(ingredient)}</span></label></li>`,
  ).join('');
  const originalSteps = cookingSteps(recipe);
  const steps = translation?.steps ?? originalSteps;
  const instructions = steps.map((step) => `<li><span>${escapeHtml(step)}</span></li>`).join('');
  const scrollTop = focusLanguage ? dialog.scrollTop : 0;

  detail.innerHTML = `<div class="detail-hero">
    ${image}
    <div class="detail-intro">
      ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      <h2 id="detail-title" tabindex="-1" lang="${language}">${escapeHtml(title)}</h2>
      ${description ? `<p class="detail-description" lang="${language}">${escapeHtml(description)}</p>` : ''}
      <div class="recipe-language" translate="no">
        <button class="button button-outline" id="translate-recipe" type="button" lang="${translation ? 'en' : 'uk'}" aria-describedby="translation-status">
          ${icon('globe')} ${translation ? 'English original' : 'Українською'}
        </button>
        <p class="translation-status" id="translation-status" role="status" lang="uk">${translation ? 'Автоматичний переклад. Кількість і температуру можна звірити з оригіналом.' : ''}</p>
      </div>
      ${metadata ? `<div class="detail-meta">${metadata}</div>` : ''}
      <div class="detail-actions">
        ${steps.length ? `<button class="button button-primary" id="start-cooking" type="button" lang="${language}">${icon('chef')} ${translation ? 'Готувати покроково' : 'Cook step by step'}</button>` : ''}
        <button class="button button-outline" id="detail-save" type="button" aria-pressed="false"></button>
        <button class="button button-outline" id="share-recipe" type="button">${icon('link')} Copy link</button>
        <button class="button button-outline" id="print-recipe" type="button">${icon('print')} Print</button>
      </div>
      <p class="detail-helper" id="share-feedback" role="status"></p>
    </div>
  </div>
  <div class="detail-content">
    <section aria-labelledby="ingredients-title"><h3 id="ingredients-title" lang="${language}">${translation ? 'Інгредієнти' : 'A few good ingredients'}</h3>
      ${ingredients ? `<p class="detail-helper">Check ingredients as you prep, or take them shopping.</p>
        <button class="button button-outline add-to-shopping" id="add-ingredients" type="button">${icon('basket')} Add ingredients to list</button>
        <p class="detail-helper" id="ingredient-feedback" role="status"></p>
        <ul class="ingredient-list" lang="${language}">${ingredients}</ul>` : '<p class="detail-helper">Ingredients are unavailable for this recipe.</p>'}
    </section>
    <section aria-labelledby="instructions-title"><h3 id="instructions-title" lang="${language}">${translation ? 'Приготування' : "Let's make it"}</h3>
      ${instructions ? `<ol class="instruction-list" lang="${language}">${instructions}</ol>` : '<p class="detail-helper">Instructions are unavailable for this recipe.</p>'}
    </section>
  </div>`;
  updateDetailSave();
  element('#detail-save').addEventListener('click', () => toggleSaved(recipe.id));
  element('#print-recipe').addEventListener('click', () => window.print());
  element('#share-recipe').addEventListener('click', () => void copyRecipeLink(recipe.id));
  element<HTMLButtonElement>('#translate-recipe').addEventListener('click', () => {
    if (translation) showRecipe(recipe, trigger, undefined, true);
    else void showTranslation(recipe, trigger, originalSteps);
  });
  detail.querySelector('#start-cooking')?.addEventListener('click', () => {
    stopRecipeTranslation();
    openCookingMode(detail, { id: recipe.id, title }, steps, () => showRecipe(recipe, trigger, translation), language);
  });
  detail.querySelector('#add-ingredients')?.addEventListener('click', () => {
    element('#ingredient-feedback').textContent = addRecipeIngredients(recipe);
  });
  detail.querySelector('.ingredient-list')?.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const index = Number(event.target.dataset.ingredient);
    if (event.target.checked) checkedIngredients.add(index);
    else checkedIngredients.delete(index);
  });
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = scrollTop;
  element(focusLanguage ? '#translate-recipe' : '#detail-title').focus({ preventScroll: true });
}

async function showTranslation(recipe: Recipe, trigger: HTMLElement, steps: string[]): Promise<void> {
  if (translationRequest) return;
  const cached = translationCache.get(recipe.id);
  if (cached) {
    showRecipe(recipe, trigger, cached, true);
    return;
  }

  translationRequest = new AbortController();
  const { signal } = translationRequest;
  const button = element('#translate-recipe');
  const status = element('#translation-status');
  button.setAttribute('aria-disabled', 'true');
  status.textContent = 'Готуємо перекладач…';
  try {
    const translation = await translateRecipe(recipe, steps, signal, (progress) => {
      if (signal.aborted) return;
      const message = progress === 'translating' ? 'Перекладаємо рецепт…'
        : `Завантажуємо мовний пакет: ${Math.min(100, Math.floor(progress.download / 10) * 10)}%`;
      if (status.textContent !== message) status.textContent = message;
    });
    if (signal.aborted || !dialog.open) return;
    translationCache.set(recipe.id, translation);
    showRecipe(recipe, trigger, translation, true);
  } catch (error) {
    if (signal.aborted) return;
    status.textContent = error instanceof DOMException && error.name === 'NotSupportedError'
      ? 'Вбудований переклад недоступний у цьому браузері. Спробуйте Chrome на комп’ютері або переклад сторінки у вашому браузері.'
      : 'Не вдалося перекласти рецепт. Перевірте підключення та спробуйте ще раз.';
  } finally {
    if (!signal.aborted) {
      translationRequest = undefined;
      button.removeAttribute('aria-disabled');
    }
  }
}

async function copyRecipeLink(id: string): Promise<void> {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('recipe', id);
  url.hash = '';
  const feedback = element('#share-feedback');
  try {
    await navigator.clipboard.writeText(url.href);
    feedback.textContent = 'Recipe link copied.';
  } catch {
    const field = document.createElement('input');
    field.value = url.href;
    field.readOnly = true;
    field.setAttribute('aria-label', 'Recipe link to copy');
    feedback.replaceChildren('Select and copy this link.', field);
    field.focus();
    field.select();
  }
}

async function openDetails(id: string, trigger: HTMLElement): Promise<void> {
  detailRequest?.abort();
  detailRequest = new AbortController();
  const { signal } = detailRequest;
  try {
    const recipe = await getRecipe(id, signal);
    if (signal.aborted) return;
    if (!recipe) {
      showToast('Recipe details are unavailable.');
      return;
    }
    showRecipe(recipe, trigger);
  } catch {
    if (!signal.aborted) showToast('Could not load recipe details. Please try again.');
  }
}

function searchChanged(delay = 0): void {
  if (!savedOnly) {
    refreshRecipes(delay);
    return;
  }
  visibleCount = pageSize;
  render();
}

function updateSearchPlaceholder(): void {
  search.placeholder = selectedSearchMode() === 'ingredient' ? 'Search by one ingredient…' : 'Search recipes by name…';
}

function resetFilters(exitSaved = false): void {
  search.value = '';
  searchMode.value = 'name';
  category = '';
  cuisine = '';
  sort.value = 'featured';
  if (exitSaved) savedOnly = false;
  updateSearchPlaceholder();
  searchChanged();
  search.focus({ preventScroll: true });
}

grid.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const saveButton = target?.closest<HTMLButtonElement>('[data-save]');
  const id = saveButton?.dataset.save;
  if (id) {
    toggleSaved(id);
    const button = grid.querySelector<HTMLButtonElement>(`[data-save="${CSS.escape(id)}"]`);
    (button ?? savedToggle).focus({ preventScroll: true });
    return;
  }
  const trigger = target?.closest<HTMLButtonElement>('[data-open]');
  if (trigger?.dataset.open) void openDetails(trigger.dataset.open, trigger);
});

categories.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-category]') : null;
  if (!button) return;
  category = button.dataset.category ?? '';
  searchChanged();
});

element('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  searchChanged();
});

search.addEventListener('input', () => searchChanged(300));
searchMode.addEventListener('change', () => {
  updateSearchPlaceholder();
  searchChanged();
});
categoryFilter.addEventListener('change', () => {
  category = categoryFilter.value;
  searchChanged();
});
cuisineFilter.addEventListener('change', () => {
  cuisine = cuisineFilter.value;
  searchChanged();
});
sort.addEventListener('change', () => {
  visibleCount = pageSize;
  render();
});
savedToggle.addEventListener('click', () => {
  savedOnly = !savedOnly;
  search.value = '';
  category = '';
  cuisine = '';
  refreshRecipes();
  element('#recipes').scrollIntoView({ behavior: 'smooth' });
});
document.querySelectorAll('.main-nav [href="#recipes"], .hero-primary').forEach((link) => {
  link.addEventListener('click', () => {
    if (savedOnly) resetFilters(true);
  });
});
element('#clear-filters').addEventListener('click', () => resetFilters());
element('#reset-search').addEventListener('click', () => resetFilters(true));
element('#retry-recipes').addEventListener('click', () => {
  loadError?.retry();
  search.focus({ preventScroll: true });
});
loadMore.addEventListener('click', () => void showMoreRecipes());
surprise.addEventListener('click', async () => {
  detailRequest?.abort();
  detailRequest = new AbortController();
  const { signal } = detailRequest;
  surprise.disabled = true;
  element('#surprise-recipe span').textContent = 'Finding a recipe…';
  try {
    const recipe = await randomRecipe(signal);
    if (signal.aborted) return;
    if (!recipe) {
      showToast('No surprise recipe came back. Please try again.');
      return;
    }
    recipeCache.set(recipe.id, recipe);
    showRecipe(recipe, surprise);
  } catch {
    if (!signal.aborted) showToast('Could not find a surprise recipe. Please try again.');
  } finally {
    surprise.disabled = false;
    element('#surprise-recipe span').textContent = 'Surprise me';
  }
});
element('#close-recipe').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    dialog.close();
  }
});
dialog.addEventListener('close', () => {
  stopRecipeTranslation();
  const recipeId = openRecipe?.id;
  openRecipe = undefined;
  const replacement = recipeId ? grid.querySelector<HTMLButtonElement>(`[data-open="${CSS.escape(recipeId)}"]`) : null;
  const returnTarget = lastTrigger?.isConnected ? lastTrigger : replacement ?? savedToggle;
  returnTarget.focus({ preventScroll: true });
});
initPageTranslation();
refreshRecipes();
const filterSignal = new AbortController().signal;
void Promise.allSettled([listFilterOptions('c', filterSignal), listFilterOptions('a', filterSignal)]).then(([categories, cuisines]) => {
  if (categories.status === 'fulfilled') allCategories = categories.value;
  if (cuisines.status === 'fulfilled') allCuisines = cuisines.value;
  updateFilterOptions();
});

const recipeId = new URLSearchParams(window.location.search).get('recipe');
if (recipeId && (/^\d+$/.test(recipeId) || recipeCache.has(recipeId))) {
  void openDetails(recipeId, element('.hero-primary'));
}
