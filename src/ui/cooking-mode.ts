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
  recipe: Pick<Recipe, 'id' | 'title'>,
  steps: string[],
  onExit: () => void,
  language: 'en' | 'uk',
): void {
  const copy = language === 'uk' ? {
    back: 'До рецепта',
    mode: 'РЕЖИМ ПРИГОТУВАННЯ',
    complete: 'Усі кроки виконано',
    step: (current: number, total: number) => `Крок ${current} із ${total}`,
    progress: 'Виконані кроки приготування',
    done: 'Страва готова!',
    enjoy: 'Смачного!',
    restart: 'Готувати знову',
    previous: 'Попередній крок',
    finish: 'Завершити приготування',
    next: 'Наступний крок',
  } : {
    back: 'Back to recipe',
    mode: 'COOKING MODE',
    complete: 'All steps complete',
    step: (current: number, total: number) => `Step ${current} of ${total}`,
    progress: 'Completed cooking steps',
    done: 'You made it!',
    enjoy: 'Time to pull up a chair and enjoy.',
    restart: 'Cook again',
    previous: 'Previous',
    finish: 'Finish cooking',
    next: 'Next step',
  };
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
    container.innerHTML = `<section class="cooking-panel" lang="${language}">
      <button class="text-button cooking-back" type="button" data-cook="exit">← ${copy.back}</button>
      <p class="eyebrow">${copy.mode}</p>
      <h2 id="detail-title" tabindex="-1">${escapeHtml(recipe.title)}</h2>
      <div class="cooking-progress">
        <span>${finished ? copy.complete : copy.step(step + 1, steps.length)}</span>
        <progress value="${step}" max="${steps.length}" aria-label="${copy.progress}"></progress>
      </div>
      <div class="cooking-step">
        <span class="step-number" aria-hidden="true">${finished ? icon('check') : String(step + 1).padStart(2, '0')}</span>
        ${finished ? `<h3>${copy.done}</h3><p>${copy.enjoy}</p>` : `<p>${escapeHtml(steps[step])}</p>`}
      </div>
      <div class="cooking-actions">
        ${finished ? `<button class="button button-outline" type="button" data-cook="restart">${copy.restart}</button>`
          : `<button class="button button-outline" type="button" data-cook="previous" ${step === 0 ? 'disabled' : ''}>${copy.previous}</button>`}
        <button class="button button-primary" type="button" data-cook="${finished ? 'exit' : 'next'}">
          ${finished ? copy.back : step + 1 === steps.length ? copy.finish : copy.next} ${icon('arrow')}
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
