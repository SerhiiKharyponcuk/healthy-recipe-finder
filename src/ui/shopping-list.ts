import type { Recipe } from '../types/recipe';
import { element, escapeHtml, icon, readStorage, writeStorage } from './dom';

interface ShoppingItem {
  key: string;
  name: string;
  source: string;
  checked: boolean;
}

const storageKey = 'sprout:shopping:v1';
const dialog = element<HTMLDialogElement>('#shopping-dialog');
const toggle = element<HTMLButtonElement>('#shopping-toggle');
const list = element<HTMLUListElement>('#shopping-items');
const input = element<HTMLInputElement>('#shopping-item');
const copyButton = element<HTMLButtonElement>('#copy-shopping');
const clearChecked = element<HTMLButtonElement>('#clear-checked');

function isShoppingItem(value: unknown): value is ShoppingItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<ShoppingItem>;
  return typeof item.key === 'string' && typeof item.name === 'string'
    && typeof item.source === 'string' && typeof item.checked === 'boolean';
}

const stored = readStorage(storageKey);
let items = Array.isArray(stored) ? stored.filter(isShoppingItem) : [];

function render(): void {
  const remaining = items.filter((item) => !item.checked).length;
  element('#shopping-count').textContent = String(remaining);
  toggle.setAttribute('aria-label', `Shopping list, ${remaining} remaining`);
  element('#shopping-status').textContent = items.length ? `${remaining} of ${items.length} items left to pick up` : 'Your list is empty.';
  element('#shopping-empty').hidden = items.length > 0;
  copyButton.disabled = items.length === 0;
  clearChecked.disabled = remaining === items.length;
  list.innerHTML = items.map((item) => {
    const key = escapeHtml(item.key);
    const name = escapeHtml(item.name);
    return `<li class="shopping-row">
      <label><input type="checkbox" data-check="${key}" ${item.checked ? 'checked' : ''} />
        <span>${name}${item.source ? `<small>${escapeHtml(item.source)}</small>` : ''}</span>
      </label>
      <button class="icon-button" type="button" data-remove="${key}" aria-label="Remove ${name}">${icon('close')}</button>
    </li>`;
  }).join('');
}

function update(message: string): string {
  const persisted = writeStorage(storageKey, items);
  const feedback = persisted ? message : `${message} Browser storage is unavailable for this visit.`;
  render();
  element('#shopping-feedback').textContent = feedback;
  return feedback;
}

export function addRecipeIngredients(recipe: Recipe): string {
  const keys = new Set(items.map((item) => item.key));
  let added = 0;
  for (const name of recipe.ingredients ?? []) {
    const key = `${recipe.id}:${name.toLowerCase()}`;
    if (keys.has(key)) continue;
    keys.add(key);
    items.push({ key, name, source: recipe.title, checked: false });
    added += 1;
  }
  if (!added) return 'These ingredients are already on your list.';
  return update(`Added ${added} ${added === 1 ? 'ingredient' : 'ingredients'} to your shopping list.`);
}

toggle.addEventListener('click', () => {
  element('#shopping-feedback').textContent = '';
  dialog.showModal();
  input.focus();
});
element('#close-shopping').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => toggle.focus());

element('#shopping-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  const key = `manual:${name.toLowerCase()}`;
  if (items.some((item) => item.key === key)) {
    element('#shopping-feedback').textContent = 'That item is already on your list.';
    input.select();
    return;
  }
  items.push({ key, name, source: '', checked: false });
  input.value = '';
  update('Item added.');
  input.focus();
});

list.addEventListener('change', (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  const item = items.find((entry) => entry.key === checkbox.dataset.check);
  if (!item) return;
  item.checked = checkbox.checked;
  update(item.checked ? 'Item checked off.' : 'Item added back to the remaining list.');
  list.querySelector<HTMLInputElement>(`[data-check="${CSS.escape(item.key)}"]`)?.focus({ preventScroll: true });
});

list.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-remove]') : null;
  if (!button) return;
  const index = items.findIndex((item) => item.key === button.dataset.remove);
  if (index < 0) return;
  items.splice(index, 1);
  update('Item removed.');
  (list.querySelectorAll<HTMLButtonElement>('[data-remove]')[Math.min(index, items.length - 1)] ?? input)
    .focus({ preventScroll: true });
});

clearChecked.addEventListener('click', () => {
  items = items.filter((item) => !item.checked);
  update('Checked items cleared.');
  input.focus();
});

copyButton.addEventListener('click', async () => {
  const text = items.map((item) => `${item.checked ? '✓' : '•'} ${item.name}`).join('\n');
  const feedback = element('#shopping-feedback');
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = 'Shopping list copied.';
  } catch {
    const field = document.createElement('textarea');
    field.readOnly = true;
    field.value = text;
    field.setAttribute('aria-label', 'Shopping list to copy');
    feedback.replaceChildren('Select and copy the list below.', field);
    field.focus();
    field.select();
  }
});

render();
