import { PluginKey } from '../core';
import { defineExtension, type FountainExtension } from './extension';
import {
  inputRulesPlugin,
  textInputRule,
  type InputRule,
  type InputRulesState,
} from './plugins/input-rules';

export type TypographyRuleValue = false | string;

export interface TypographyQuotePair {
  readonly open: string;
  readonly close: string;
}

export interface TypographyQuoteOptions {
  readonly ltr?: TypographyQuotePair;
  readonly rtl?: TypographyQuotePair;
}

export interface TypographyExtensionOptions {
  readonly emDash?: TypographyRuleValue;
  readonly ellipsis?: TypographyRuleValue;
  readonly openDoubleQuote?: TypographyRuleValue;
  readonly closeDoubleQuote?: TypographyRuleValue;
  readonly openSingleQuote?: TypographyRuleValue;
  readonly closeSingleQuote?: TypographyRuleValue;
  readonly leftArrow?: TypographyRuleValue;
  readonly rightArrow?: TypographyRuleValue;
  readonly copyright?: TypographyRuleValue;
  readonly registeredTrademark?: TypographyRuleValue;
  readonly trademark?: TypographyRuleValue;
  readonly servicemark?: TypographyRuleValue;
  readonly oneHalf?: TypographyRuleValue;
  readonly oneQuarter?: TypographyRuleValue;
  readonly threeQuarters?: TypographyRuleValue;
  readonly plusMinus?: TypographyRuleValue;
  readonly notEqual?: TypographyRuleValue;
  readonly laquo?: TypographyRuleValue;
  readonly raquo?: TypographyRuleValue;
  readonly multiplication?: TypographyRuleValue;
  readonly superscriptTwo?: TypographyRuleValue;
  readonly superscriptThree?: TypographyRuleValue;
  readonly doubleQuotes?: TypographyQuoteOptions;
  readonly singleQuotes?: TypographyQuoteOptions;
  readonly rtl?: boolean;
  readonly undoOnBackspace?: boolean;
}

type RuleName = Exclude<keyof TypographyExtensionOptions, 'doubleQuotes' | 'singleQuotes' | 'rtl' | 'undoOnBackspace'>;

const DEFAULTS: Readonly<Record<RuleName, string>> = Object.freeze({
  emDash: '—',
  ellipsis: '…',
  openDoubleQuote: '“',
  closeDoubleQuote: '”',
  openSingleQuote: '‘',
  closeSingleQuote: '’',
  leftArrow: '←',
  rightArrow: '→',
  copyright: '©',
  registeredTrademark: '®',
  trademark: '™',
  servicemark: '℠',
  oneHalf: '½',
  oneQuarter: '¼',
  threeQuarters: '¾',
  plusMinus: '±',
  notEqual: '≠',
  laquo: '«',
  raquo: '»',
  multiplication: '×',
  superscriptTwo: '²',
  superscriptThree: '³',
});

const LTR_DOUBLE: TypographyQuotePair = Object.freeze({ open: '“', close: '”' });
const RTL_DOUBLE: TypographyQuotePair = Object.freeze({ open: '”', close: '“' });
const LTR_SINGLE: TypographyQuotePair = Object.freeze({ open: '‘', close: '’' });
const RTL_SINGLE: TypographyQuotePair = Object.freeze({ open: '’', close: '‘' });

function configured(
  options: TypographyExtensionOptions,
  name: RuleName,
  quoteFallback?: string,
): string | false {
  const value = options[name];
  if (value === false) return false;
  if (typeof value === 'string') return value;
  return quoteFallback ?? DEFAULTS[name];
}

function addRule(
  rules: InputRule[],
  options: TypographyExtensionOptions,
  name: RuleName,
  find: RegExp,
  replace: string | ((match: RegExpExecArray, value: string) => string),
  fallback?: string,
): void {
  const value = configured(options, name, fallback);
  if (value === false) return;
  rules.push(textInputRule({
    name,
    find,
    replace: typeof replace === 'string' ? replace.replace('$value', value) : (match) => replace(match, value),
  }));
}

/** Returns the independently configurable rule list used by TypographyExtension. */
export function typographyInputRules(options: TypographyExtensionOptions = {}): readonly InputRule[] {
  const double = options.rtl
    ? options.doubleQuotes?.rtl ?? RTL_DOUBLE
    : options.doubleQuotes?.ltr ?? LTR_DOUBLE;
  const single = options.rtl
    ? options.singleQuotes?.rtl ?? RTL_SINGLE
    : options.singleQuotes?.ltr ?? LTR_SINGLE;
  const rules: InputRule[] = [];
  addRule(rules, options, 'emDash', /--$/, '$value');
  addRule(rules, options, 'ellipsis', /\.\.\.$/, '$value');
  addRule(rules, options, 'openDoubleQuote', /(^|[\s([{])"$/, (match, value) => `${match[1] ?? ''}${value}`, double.open);
  addRule(rules, options, 'closeDoubleQuote', /(\S)"$/, (match, value) => `${match[1] ?? ''}${value}`, double.close);
  addRule(rules, options, 'openSingleQuote', /(^|[\s([{])'$/, (match, value) => `${match[1] ?? ''}${value}`, single.open);
  addRule(rules, options, 'closeSingleQuote', /(\S)'$/, (match, value) => `${match[1] ?? ''}${value}`, single.close);
  addRule(rules, options, 'leftArrow', /<-$/, '$value');
  addRule(rules, options, 'rightArrow', /->$/, '$value');
  addRule(rules, options, 'copyright', /\(c\)$/i, '$value');
  addRule(rules, options, 'registeredTrademark', /\(r\)$/i, '$value');
  addRule(rules, options, 'trademark', /\(tm\)$/i, '$value');
  addRule(rules, options, 'servicemark', /\(sm\)$/i, '$value');
  addRule(rules, options, 'oneHalf', /1\/2$/, '$value');
  addRule(rules, options, 'oneQuarter', /1\/4$/, '$value');
  addRule(rules, options, 'threeQuarters', /3\/4$/, '$value');
  addRule(rules, options, 'plusMinus', /\+\/-$/, '$value');
  addRule(rules, options, 'notEqual', /!=$/, '$value');
  addRule(rules, options, 'laquo', /<<$/, '$value');
  addRule(rules, options, 'raquo', />>$/, '$value');
  addRule(rules, options, 'multiplication', /(\d+)(?:x|\*)(\d+)$/i, (match, value) => `${match[1]}${value}${match[2]}`);
  addRule(rules, options, 'superscriptTwo', /\^2$/, '$value');
  addRule(rules, options, 'superscriptThree', /\^3$/, '$value');
  return Object.freeze(rules);
}

function createTypographyExtensionWithKey(
  options: TypographyExtensionOptions,
  key: PluginKey<InputRulesState>,
): FountainExtension {
  return defineExtension({
    name: 'typography',
    plugins: [inputRulesPlugin({
      key,
      rules: typographyInputRules(options),
      undoOnBackspace: options.undoOnBackspace,
    })],
  });
}

export function createTypographyExtension(options: TypographyExtensionOptions = {}): FountainExtension {
  return createTypographyExtensionWithKey(options, new PluginKey<InputRulesState>('typography-input-rules'));
}

export const typographyInputRulesKey = new PluginKey<InputRulesState>('typography-input-rules');
export const TypographyExtension = createTypographyExtensionWithKey({}, typographyInputRulesKey);
