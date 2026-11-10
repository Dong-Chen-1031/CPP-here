import { config } from './utils/config';
import { formatList, getLanguage, t } from './utils/i18n';
import { noop } from './utils/noop';
import { checkTargetUrl, DEFAULT_TARGET_URL } from './utils/target';

const customRulesContainer = document.querySelector<HTMLDivElement>('#custom-rules-container');
const targetUrlInput = document.querySelector<HTMLInputElement>('#target-url');
const targetUrlResetButton = document.querySelector<HTMLButtonElement>('#target-url-reset');
const targetUrlError = document.querySelector<HTMLParagraphElement>('#target-url-error');
const targetUrlErrorMessage = document.querySelector<HTMLSpanElement>('#target-url-error-message');
const debugModeInput = document.querySelector<HTMLInputElement>('#debug-mode');

const trashIconTemplate = document.querySelector<HTMLTemplateElement>('#trash-icon');

/**
 * Replaces an element's text with the string data-i18n names. Children marked data-i18n-slot, like the <code> in a
 * description, are kept and put where the string has their {{name}}.
 */
function translateElement(elem: HTMLElement): void {
  const slots = new Map(
    [...elem.querySelectorAll<HTMLElement>('[data-i18n-slot]')].map(slot => [slot.dataset.i18nSlot, slot]),
  );

  // Private-use characters mark where each slot goes, since the string can't contain elements
  const markers = Object.fromEntries([...slots.keys()].map(name => [name, `\uE000${name}\uE000`]));
  const parts = t(elem.dataset.i18n, markers).split(/\uE000(\w+)\uE000/);

  // split() puts the captured slot names at the odd indices
  elem.replaceChildren(...parts.map((part, i) => (i % 2 === 1 ? slots.get(part) : document.createTextNode(part))));
}

// options.html holds the English text, and marks what to translate with data-i18n
document.documentElement.lang = getLanguage();
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(translateElement);
targetUrlResetButton.title = t('options.resetTitle', { url: DEFAULT_TARGET_URL });

function updateCustomRules(): void {
  const rows = customRulesContainer.querySelectorAll('.custom-rules-row');
  const rules: [string, string][] = [];
  const invalidExpressions: string[] = [];

  rows.forEach(row => {
    const expression = row.querySelector('input').value;
    const parserName = row.querySelector('select').value;

    try {
      new RegExp(expression);
    } catch (err) {
      invalidExpressions.push(expression);
    }

    rules.push([expression, parserName]);
  });

  if (rules[rules.length - 1][0].length > 0) {
    rows[rows.length - 1].querySelector('button').classList.remove('invisible');
    addCustomRulesRow();
  }

  const errorElem = document.querySelector('#custom-rules-error');

  if (invalidExpressions.length > 0) {
    const formattedExpressions = invalidExpressions.map(expression => `'${expression}'`);
    if (formattedExpressions.length === 1) {
      errorElem.textContent = t('options.invalidRegex', { expression: formattedExpressions[0] });
    } else {
      errorElem.textContent = t('options.invalidRegexes', { expressions: formatList(formattedExpressions) });
    }

    errorElem.classList.remove('hidden');

    return;
  }

  errorElem.classList.add('hidden');

  const nonEmptyRules = rules.filter(rule => rule[0].trim().length > 0);
  config.set('customRules', nonEmptyRules).then(noop).catch(noop);
}

function addCustomRulesRow(regex?: string, parserName?: string): void {
  const row = document.createElement('div');
  row.classList.add('custom-rules-row');

  const input = document.createElement('input');
  input.classList.add('input');
  input.placeholder = t('options.regexPlaceholder');
  input.spellcheck = false;
  input.value = regex !== undefined ? regex : '';

  const select = document.createElement('select');
  select.classList.add('select');
  for (const parser of PARSER_NAMES) {
    const option = document.createElement('option');
    option.value = parser;
    option.textContent = parser;
    option.selected = parser === parserName;

    if (parserName === undefined && PARSER_NAMES[0] === parser) {
      option.selected = true;
    }

    select.add(option);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('icon-button');
  button.title = t('options.removeRule');
  button.setAttribute('aria-label', t('options.removeRule'));
  button.appendChild(trashIconTemplate.content.cloneNode(true));

  // The last row is the empty one for adding a rule, so it has nothing to remove
  if (regex === undefined) {
    button.classList.add('invisible');
  }

  button.addEventListener('click', () => {
    if (!button.classList.contains('invisible')) {
      row.remove();
      updateCustomRules();
    }
  });

  input.addEventListener('input', () => updateCustomRules());
  select.addEventListener('change', () => updateCustomRules());

  row.appendChild(input);
  row.appendChild(select);
  row.appendChild(button);

  customRulesContainer.appendChild(row);
}

/**
 * Shows whether the target URL can be used. Returns false for URLs the extension can't get access to, which are
 * not saved: the toolbar button would fail with them.
 */
function validateTargetUrl(value: string): boolean {
  const target = checkTargetUrl(value);
  const isValid = !('error' in target);

  targetUrlInput.setAttribute('aria-invalid', `${!isValid}`);
  targetUrlError.classList.toggle('hidden', isValid);
  targetUrlErrorMessage.textContent = 'error' in target ? t('options.notSaved', { error: target.error }) : '';

  return isValid;
}

function saveTargetUrl(value: string): void {
  if (!validateTargetUrl(value)) {
    return;
  }

  const normalized = value.trim();
  config
    .set('targetUrl', normalized.length > 0 ? normalized : DEFAULT_TARGET_URL)
    .then(noop)
    .catch(noop);
}

targetUrlInput.addEventListener('input', function (): void {
  saveTargetUrl(this.value);
});

targetUrlResetButton.addEventListener('click', () => {
  targetUrlInput.value = DEFAULT_TARGET_URL;
  saveTargetUrl(DEFAULT_TARGET_URL);
});

debugModeInput.addEventListener('input', function (): void {
  config.set('debugMode', this.checked).then(noop).catch(noop);
});

config
  .get('customRules')
  .then(rules => {
    for (const rule of rules) {
      addCustomRulesRow(rule[0], rule[1]);
    }

    addCustomRulesRow();
  })
  .catch(noop);

config
  .get('targetUrl')
  .then(value => {
    targetUrlInput.value = value;
    // A URL saved before the allowed hosts changed may no longer work
    validateTargetUrl(value);
  })
  .catch(noop);

config
  .get('debugMode')
  .then(value => {
    debugModeInput.checked = value;
  })
  .catch(noop);
