import './styles/index.css';
import { demoRecipes } from './data/demo-recipes';
import type { Recipe , MealDBMeal} from './types/recipe';
import { fetchMealData } from './api/themealdb';

// Small, replaceable demo controller. The styles do not depend on this module.
function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
}

const grid = element<HTMLDivElement>('#recipe-grid');
const search = element<HTMLInputElement>('#recipe-search');
const prep = element<HTMLSelectElement>('#prep-time');
const cook = element<HTMLSelectElement>('#cook-time');
const savedToggle = element<HTMLButtonElement>('#saved-toggle');
const dialog = element<HTMLDialogElement>('#recipe-dialog');
const loadMore = element<HTMLButtonElement>('#load-more');
const storageKey = 'sprout:saved-recipes:v1';
let category = 'All';
let savedOnly = false;
let visibleCount = 6;
let openRecipe: Recipe | undefined;
let lastTrigger: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout>;

function readSaved(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && demoRecipes.some((recipe) => recipe.id === id)) : []);
  } catch {
    return new Set();
  }
}

const saved = readSaved();
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const icon = (name: string) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const imagePath = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function card(recipe: MealDBMeal): string {
  const isSaved = saved.has(recipe.idMeal);
  return `<article class="recipe-card">
    <div class="card-image-wrap">
      <button class="card-image-link" type="button" data-open="${recipe.idMeal}" aria-label="View ${escape(recipe.strMeal)}"><img class="card-image" src="${imagePath(recipe.strMealThumb)}" alt="${escape(recipe.strTags)}" width="600" height="400" loading="lazy" decoding="async" /></button>
      <span class="card-label">${escape(recipe.strCategory)}</span>
      <button class="icon-button card-save" type="button" data-save="${recipe.idMeal}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${escape(recipe.strMeal)}" aria-pressed="${isSaved}">${icon('heart')}</button>
    </div>
    <div class="card-body">
      <p class="card-category">${recipe.strCategory === 'Snacks' ? 'Snacks & treats' : recipe.strCategory}</p>
      <h3 class="card-title"><button class="title-button" type="button" data-open="${recipe.idMeal}">${escape(recipe.strMeal)}</button></h3>
      <p class="card-description">${escape(recipe.strInstructions)}</p>
    </div>
  </article>`;
}

async function render(): Promise<void> {
  const query = normalize(search.value);
  const randomRecipe = (await fetchMealData()).meals;
  console.log('Random Recipe:', randomRecipe);
  if (randomRecipe === null){
    throw new Error("no riceps finded")
  }

  grid.innerHTML = randomRecipe.slice(0, visibleCount).map(card).join('');
  element('#result-count').textContent = `${randomRecipe.length} ${savedOnly ? 'saved ' : ''}${randomRecipe.length === 1 ? 'recipe' : 'recipes'} to explore`;
  element('#saved-count').textContent = String(saved.size);
  savedToggle.setAttribute('aria-pressed', String(savedOnly));
  element('#empty-state').hidden = randomRecipe.length > 0;
  element('#empty-description').textContent = savedOnly && saved.size === 0 ? 'Tap a heart on any recipe to keep your favorites here.' : 'Try another ingredient or give your filters a little room.';
  loadMore.hidden = visibleCount >= randomRecipe.length;
  element('#collection-note').textContent = randomRecipe.length === 0 ? '' : visibleCount >= randomRecipe.length ? "That's the whole collection. What will you make first?" : 'Good things are worth making.';
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
    const active = button.dataset.category === category;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const filters = [query && `“${search.value.trim()}”`, category !== 'All' && category, prep.value !== '' && `Prep ≤ ${prep.value} min`, cook.value !== '' && `Cook ≤ ${cook.value} min`, savedOnly && 'Saved recipes'].filter(Boolean);
  element('#active-filters').hidden = filters.length === 0;
  element('#filter-summary').textContent = filters.join(' · ');
}

function showToast(message: string): void {
  clearTimeout(toastTimer);
  const toast = element('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function toggleSaved(id: string): void {
  saved.has(id) ? saved.delete(id) : saved.add(id);
  try {
    localStorage.setItem(storageKey, JSON.stringify([...saved]));
    showToast(saved.has(id) ? 'A good one, saved for later.' : 'Recipe removed from your favorites.');
  } catch {
    showToast('Saved for this visit. Browser storage is unavailable.');
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

function showRecipe(recipe: Recipe, trigger: HTMLElement): void {
  lastTrigger = trigger;
  openRecipe = recipe;
  element('#recipe-detail').innerHTML = `<div class="detail-hero">
    <img class="detail-image" src="${imagePath(recipe.image)}" alt="${escape(recipe.imageAlt)}" width="600" height="600" />
    <div class="detail-intro"><p class="eyebrow">${escape(recipe.category.toUpperCase())} · ${escape(recipe.label.toUpperCase())}</p><h2 id="detail-title">${escape(recipe.title)}</h2><p class="detail-description">${escape(recipe.description)}</p>
      <div class="detail-meta"><div>${icon('clock')}<span><strong>${recipe.prepMinutes} min</strong><small>Prep time</small></span></div><div>${icon('chef')}<span><strong>${recipe.cookMinutes} min</strong><small>Cook time</small></span></div><div>${icon('users')}<span><strong>${recipe.servings}</strong><small>Servings</small></span></div></div>
      <div class="detail-actions"><button class="button button-primary" id="detail-save" type="button" aria-pressed="false"></button><button class="button button-outline" id="print-recipe" type="button">${icon('print')}Print recipe</button></div>
    </div>
  </div><div class="detail-content"><section aria-labelledby="ingredients-title"><h3 id="ingredients-title">A few good ingredients</h3><p class="detail-helper">Tap to check things off as you go.</p><ul class="ingredient-list">${recipe.ingredients.map((ingredient) => `<li><label><input type="checkbox" /><span>${escape(ingredient)}</span></label></li>`).join('')}</ul></section>
  <section aria-labelledby="instructions-title"><h3 id="instructions-title">Let's make it</h3><ol class="instruction-list">${recipe.instructions.map((step) => `<li><span>${escape(step)}</span></li>`).join('')}</ol><p class="detail-note">Make it yours. A little extra lemon, your favorite herbs, a seat at the table.</p></section></div>`;
  updateDetailSave();
  element('#detail-save').addEventListener('click', () => toggleSaved(recipe.id));
  element('#print-recipe').addEventListener('click', () => window.print());
  dialog.showModal();
  dialog.scrollTop = 0;
}

function resetFilters(): void {
  search.value = '';
  prep.value = '';
  cook.value = '';
  category = 'All';
  savedOnly = false;
  visibleCount = 6;
  render();
}

grid.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const saveButton = target?.closest<HTMLButtonElement>('[data-save]');
  if (saveButton?.dataset.save) {
    const id = saveButton.dataset.save;
    toggleSaved(id);
    grid.querySelector<HTMLButtonElement>(`[data-save="${id}"]`)?.focus({ preventScroll: true });
    return;
  }
  const trigger = target?.closest<HTMLButtonElement>('[data-open]');
  const recipe = demoRecipes.find((item) => item.id === trigger?.dataset.open);
  if (recipe && trigger) showRecipe(recipe, trigger);
});

element('#search-form').addEventListener('submit', (event) => { event.preventDefault(); visibleCount = 6; render(); });
search.addEventListener('input', () => { visibleCount = 6; render(); });
[prep, cook].forEach((select) => select.addEventListener('change', () => { visibleCount = 6; render(); }));
document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.addEventListener('click', () => { category = button.dataset.category ?? 'All'; visibleCount = 6; render(); }));
savedToggle.addEventListener('click', () => { savedOnly = !savedOnly; visibleCount = 6; render(); element('#recipes').scrollIntoView({ behavior: 'smooth' }); });
element('#clear-filters').addEventListener('click', () => { resetFilters(); search.focus({ preventScroll: true }); });
element('#reset-search').addEventListener('click', () => { resetFilters(); search.focus({ preventScroll: true }); });
loadMore.addEventListener('click', () => {
  const firstNewCard = visibleCount;
  visibleCount += 6;
  render();
  grid.querySelectorAll<HTMLButtonElement>('.card-image-link')[firstNewCard]?.focus({ preventScroll: true });
});
element('#close-recipe').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
dialog.addEventListener('close', () => {
  const recipeId = openRecipe?.id;
  openRecipe = undefined;
  const returnTarget = lastTrigger?.isConnected ? lastTrigger : grid.querySelector<HTMLButtonElement>(`[data-open="${recipeId}"]`) ?? savedToggle;
  returnTarget.focus({ preventScroll: true });
});
render();
