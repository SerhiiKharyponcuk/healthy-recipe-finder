import type { Recipe } from '../types/recipe';
import { escapeHtml, icon, readStorage, writeStorage } from './dom';

export function cookingSteps(recipe: Recipe): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return (recipe.instructions ?? []).flatMap((instruction) => {
    const text = instruction.replace(/^step\s+\d+\b[\s.:-]*/i, '').trim();
    if (!text) return [];
    if (text.length < 380) return [text];

    const sentences = [...segmenter.segment(text)].map(({ segment }) => segment.trim());
    const groups: string[] = [];
    for (let index = 0; index < sentences.length; index += 2) {
      groups.push(sentences.slice(index, index + 2).join(' '));
    }
    return groups;
  });
}

export function openCookingMode(
  container: HTMLElement,
  recipe: Recipe,
  steps: string[],
  onExit: () => void,
): void {
  const storageKey = `sprout:cooking:v1:${recipe.id}`;
  const stored = readStorage(storageKey);
  let step = typeof stored === 'number' && Number.isInteger(stored) ? Math.min(Math.max(0, stored), steps.length) : 0;

  function update(next: number): void {
    step = next;
    writeStorage(storageKey, step);
    render();
  }

  function render(): void {
    const finished = step === steps.length;
    container.innerHTML = `<section class="cooking-panel">
      <button class="text-button cooking-back" type="button" data-cook="exit">← Back to recipe</button>
      <p class="eyebrow">COOKING MODE</p>
      <h2 id="detail-title" tabindex="-1">${escapeHtml(recipe.title)}</h2>
      <div class="cooking-progress">
        <span>${finished ? 'All steps complete' : `Step ${step + 1} of ${steps.length}`}</span>
        <progress value="${step}" max="${steps.length}" aria-label="Completed cooking steps"></progress>
      </div>
      <div class="cooking-step">
        <span class="step-number" aria-hidden="true">${finished ? icon('check') : String(step + 1).padStart(2, '0')}</span>
        ${finished ? '<h3>You made it!</h3><p>Time to pull up a chair and enjoy.</p>' : `<p>${escapeHtml(steps[step])}</p>`}
      </div>
      <div class="cooking-actions">
        ${finished ? '<button class="button button-outline" type="button" data-cook="restart">Cook again</button>'
          : `<button class="button button-outline" type="button" data-cook="previous" ${step === 0 ? 'disabled' : ''}>Previous</button>`}
        <button class="button button-primary" type="button" data-cook="${finished ? 'exit' : 'next'}">
          ${finished ? 'Back to recipe' : step + 1 === steps.length ? 'Finish cooking' : 'Next step'} ${icon('arrow')}
        </button>
      </div>
    </section>`;
    container.querySelectorAll<HTMLButtonElement>('[data-cook]').forEach((button) => {
      button.addEventListener('click', () => {
        switch (button.dataset.cook) {
          case 'exit': onExit(); break;
          case 'restart': update(0); break;
          case 'previous': if (step > 0) update(step - 1); break;
          case 'next': if (step < steps.length) update(step + 1); break;
        }
      });
    });
    container.closest('dialog')?.scrollTo({ top: 0 });
    container.querySelector<HTMLElement>('#detail-title')?.focus({ preventScroll: true });
  }

  render();
}
