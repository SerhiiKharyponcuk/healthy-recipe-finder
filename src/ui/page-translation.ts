import { createUkrainianTranslator } from '../api/translator';
import type { BrowserTranslator } from '../api/translator';
import { element } from './dom';
import { ukrainianUi } from './ukrainian-ui';

interface TranslatedValue {
  original: string;
  translated: string;
}

interface TranslationSession {
  controller: AbortController;
  translator?: BrowserTranslator;
  text: Map<Text, TranslatedValue>;
  attributes: Map<Element, Map<string, TranslatedValue>>;
  languages: Set<Element>;
  dirty: boolean;
  processing: boolean;
}

const translatedAttributes = ['aria-label', 'aria-description', 'alt', 'title', 'placeholder'];
const excluded = 'script, style, noscript, svg, textarea, [translate="no"]';

export function initPageTranslation(): void {
  const button = element<HTMLButtonElement>('#page-translate');
  const label = element('#page-language-label');
  const shortLabel = element('#page-language-short');
  const status = element('#page-translation-status');
  const root = document.documentElement;
  const originalLanguage = root.lang;
  const cache = new Map<string, string>();
  let session: TranslationSession | undefined;

  function skip(node: Node, current: TranslationSession): boolean {
    const parent = node instanceof Element ? node : node.parentElement;
    if (!parent || parent.closest(excluded)) return true;
    const localized = parent.closest('[lang="uk"]');
    return !!localized && localized !== root && !current.languages.has(localized);
  }

  const observer = new MutationObserver((records) => {
    const current = session;
    if (!current) return;
    const changed = records.some((record) => {
      if (skip(record.target, current)) return false;
      if (record.type === 'characterData') {
        return current.text.get(record.target as Text)?.translated !== record.target.textContent;
      }
      if (record.type === 'attributes') {
        const target = record.target as Element;
        const name = record.attributeName!;
        return current.attributes.get(target)?.get(name)?.translated !== target.getAttribute(name);
      }
      return true;
    });
    if (changed) {
      current.dirty = true;
      void refresh(current);
    }
  });

  function stop(): void {
    const current = session;
    session = undefined;
    observer.disconnect();
    current?.controller.abort();
    current?.translator?.destroy();
    current?.text.forEach((value, node) => {
      if (node.isConnected && node.data === value.translated) node.data = value.original;
    });
    current?.attributes.forEach((attributes, node) => {
      if (!node.isConnected) return;
      attributes.forEach((value, name) => {
        if (node.getAttribute(name) === value.translated) node.setAttribute(name, value.original);
      });
    });
    current?.languages.forEach((node) => {
      if (node.isConnected && node.getAttribute('lang') === 'uk') node.setAttribute('lang', 'en');
    });
    root.lang = originalLanguage;
    delete root.dataset.pageLanguage;
    label.textContent = 'Українською';
    shortLabel.textContent = 'UA';
    label.lang = 'uk';
    button.setAttribute('aria-label', 'Перекласти сторінку українською');
    button.removeAttribute('aria-busy');
    status.hidden = true;
  }

  function fail(current: TranslationSession, error: unknown): void {
    if (session !== current) return;
    stop();
    status.hidden = false;
    status.textContent = error instanceof DOMException && error.name === 'NotSupportedError'
      ? 'Переклад сторінки доступний у Chrome на комп’ютері. В інших браузерах можна скористатися їхньою функцією перекладу сторінок.'
      : 'Не вдалося перекласти сторінку. Перевірте підключення та спробуйте ще раз.';
  }

  async function translated(source: string, current: TranslationSession): Promise<string> {
    const text = source.trim();
    let result = ukrainianUi.get(text) ?? cache.get(text);
    if (result === undefined) {
      result = (await current.translator!.translate(text, { signal: current.controller.signal })).trim() || text;
      if (cache.size >= 1200) cache.delete(cache.keys().next().value!);
      cache.set(text, result);
    }
    return source.replace(text, () => result!);
  }

  function localizeLanguage(node: Element, current: TranslationSession): void {
    const english = node.closest('[lang="en"]');
    if (english && english !== root) {
      current.languages.add(english);
      english.setAttribute('lang', 'uk');
    }
  }

  async function refresh(current: TranslationSession): Promise<void> {
    if (current.processing || !current.translator || session !== current) return;
    current.processing = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'Перекладаємо сторінку…';
    const { signal } = current.controller;
    try {
      while (current.dirty && !signal.aborted) {
        current.dirty = false;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) nodes.push(walker.currentNode as Text);
        for (const node of nodes) {
          if (signal.aborted) return;
          if (!node.isConnected || skip(node, current) || !/[a-z]{2}/i.test(node.data)) continue;
          const source = node.data;
          if (current.text.get(node)?.translated === source) continue;
          const result = await translated(source, current);
          if (signal.aborted) return;
          if (node.isConnected && node.data === source) {
            current.text.set(node, { original: source, translated: result });
            node.data = result;
            localizeLanguage(node.parentElement!, current);
          }
        }
        for (const node of document.body.querySelectorAll<Element>('[aria-label], [aria-description], [alt], [title], [placeholder]')) {
          if (skip(node, current)) continue;
          for (const name of translatedAttributes) {
            if (signal.aborted) return;
            const source = node.getAttribute(name);
            if (!source || !/[a-z]{2}/i.test(source) || current.attributes.get(node)?.get(name)?.translated === source) continue;
            const result = await translated(source, current);
            if (signal.aborted) return;
            if (node.isConnected && node.getAttribute(name) === source) {
              let attributes = current.attributes.get(node);
              if (!attributes) current.attributes.set(node, attributes = new Map());
              attributes.set(name, { original: source, translated: result });
              node.setAttribute(name, result);
            }
          }
        }
        // Removed cards should not stay alive for the rest of the visit.
        for (const node of current.text.keys()) if (!node.isConnected) current.text.delete(node);
        for (const node of current.attributes.keys()) if (!node.isConnected) current.attributes.delete(node);
        for (const node of current.languages) if (!node.isConnected) current.languages.delete(node);
      }
      if (!signal.aborted) {
        button.removeAttribute('aria-busy');
        status.textContent = 'Сторінка українською. Рецепти перекладено автоматично. Пошук — англійською, наприклад chicken. Кнопка English повертає оригінал.';
      }
    } catch (error) {
      if (!signal.aborted) fail(current, error);
    } finally {
      current.processing = false;
    }
  }

  button.addEventListener('click', () => {
    if (session) {
      stop();
      return;
    }
    const current: TranslationSession = {
      controller: new AbortController(), text: new Map(), attributes: new Map(),
      languages: new Set(), dirty: true, processing: false,
    };
    session = current;
    label.textContent = 'English';
    shortLabel.textContent = 'EN';
    label.lang = 'en';
    button.setAttribute('aria-label', 'Повернути англійський оригінал');
    button.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.textContent = 'Готуємо перекладач… Під час першого використання може завантажуватися мовний пакет.';
    void createUkrainianTranslator(current.controller.signal, (progress) => {
      if (session === current && progress !== 'translating') {
        status.textContent = `Завантажуємо мовний пакет: ${Math.min(100, Math.floor(progress.download / 10) * 10)}%`;
      }
    }).then((translator) => {
      if (session !== current) {
        translator.destroy();
        return;
      }
      current.translator = translator;
      root.lang = 'uk';
      root.dataset.pageLanguage = 'uk';
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: translatedAttributes });
      void refresh(current);
    }).catch((error: unknown) => fail(current, error));
  });

  window.addEventListener('pagehide', stop);
}
