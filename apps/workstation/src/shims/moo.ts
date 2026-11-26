export interface Token {
  type?: string;
  value: string;
  text: string;
  toString?: () => string;
  offset: number;
  lineBreaks: number;
  line: number;
  col: number;
}

export interface LexerState {
  line: number;
  col: number;
  state?: string;
}

export interface Rule {
  match?: RegExp | string | string[];
  lineBreaks?: boolean;
  value?: (text: string) => string;
  error?: boolean;
}

export type Rules = Record<string, RegExp | string | string[] | Rule | Rule[]>;

export interface Lexer {
  index?: number;
  reset: (chunk?: string, info?: LexerState) => Lexer;
  next: () => Token | undefined;
  save: () => LexerState;
  formatError: (token: Token, message?: string) => string;
  [Symbol.iterator]: () => Iterator<Token>;
}

interface CompiledRule {
  type: string;
  regex: RegExp;
  value?: (text: string) => string;
  lineBreaks: boolean;
  isError: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStickyRegex(match: RegExp | string | string[]): RegExp {
  if (match instanceof RegExp) {
    const flags = match.flags.replace(/[gy]/g, '') + 'my';
    return new RegExp(match.source, flags);
  }
  const items = Array.isArray(match) ? match : [match];
  const escaped = items.slice().sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(escaped.join('|'), 'my');
}

const ERROR_SENTINEL: Rule = { error: true };

// eslint-disable-next-line @typescript-eslint/no-namespace
function Moo() {}

namespace Moo {
  export type Token = {
    type?: string;
    value: string;
    text: string;
    toString?: () => string;
    offset: number;
    lineBreaks: number;
    line: number;
    col: number;
  };
  export type LexerState = {
    line: number;
    col: number;
    state?: string;
  };
  export type Rule = {
    match?: RegExp | string | string[];
    lineBreaks?: boolean;
    value?: (text: string) => string;
    error?: boolean;
  };
  export type Rules = Record<string, RegExp | string | string[] | Rule | Rule[]>;
  export type Lexer = {
    index?: number;
    reset: (chunk?: string, info?: LexerState) => Lexer;
    next: () => Token | undefined;
    save: () => LexerState;
    formatError: (token: Token, message?: string) => string;
    [Symbol.iterator]: () => Iterator<Token>;
  };

  export const error: Rule = ERROR_SENTINEL;

  export function compile(rulesObj: Rules): Lexer {
    const compiled: CompiledRule[] = [];
    for (const [type, raw] of Object.entries(rulesObj)) {
      if (raw === ERROR_SENTINEL || (!Array.isArray(raw) && typeof raw === 'object' && !(raw instanceof RegExp) && raw.error)) {
        compiled.push({
          type,
          regex: /[\s\S]/my,
          lineBreaks: false,
          isError: true,
        });
        continue;
      }
      if (Array.isArray(raw) && (raw.length === 0 || typeof raw[0] === 'string')) {
        compiled.push({
          type,
          regex: buildStickyRegex(raw as string[]),
          lineBreaks: false,
          isError: false,
        });
        continue;
      }
      const list = Array.isArray(raw) ? (raw as Rule[]) : [raw as RegExp | string | Rule];
      for (const item of list) {
        if (typeof item === 'string' || item instanceof RegExp) {
          compiled.push({
            type,
            regex: buildStickyRegex(item),
            lineBreaks: false,
            isError: false,
          });
        } else if (item && !Array.isArray(item) && item.match !== undefined) {
          compiled.push({
            type,
            regex: buildStickyRegex(item.match),
            value: item.value,
            lineBreaks: Boolean(item.lineBreaks),
            isError: false,
          });
        }
      }
    }

    let buffer = '';
    let idx = 0;
    let line = 1;
    let col = 1;

    const lexer: Lexer = {
      index: 0,
      reset(chunk = '', info?: LexerState) {
        buffer = chunk;
        idx = 0;
        lexer.index = 0;
        line = info?.line ?? 1;
        col = info?.col ?? 1;
        return lexer;
      },
      save(): LexerState {
        return { line, col, state: 'main' };
      },
      formatError(token: Token, message = 'Syntax error') {
        return `${message} at line ${token.line} col ${token.col}: ${JSON.stringify(token.text)}`;
      },
      next(): Token | undefined {
        if (idx >= buffer.length) return undefined;
        for (let i = 0; i < compiled.length; i++) {
          const rule = compiled[i];
          rule.regex.lastIndex = idx;
          const m = rule.regex.exec(buffer);
          if (!m) continue;
          const text = m[0];
          if (text.length === 0) continue;
          const tokLine = line;
          const tokCol = col;
          const offset = idx;
          idx += text.length;
          lexer.index = idx;
          let lineBreaks = 0;
          if (rule.lineBreaks || text.includes('\n')) {
            const parts = text.split('\n');
            lineBreaks = parts.length - 1;
            if (lineBreaks > 0) {
              line += lineBreaks;
              col = parts[parts.length - 1].length + 1;
            } else {
              col += text.length;
            }
          } else {
            col += text.length;
          }
          const value = rule.value ? rule.value(text) : text;
          return {
            type: rule.type,
            text,
            value,
            offset,
            lineBreaks,
            line: tokLine,
            col: tokCol,
          };
        }
        return undefined;
      },
      [Symbol.iterator]() {
        return {
          next() {
            const val = lexer.next();
            return val === undefined ? { value: undefined, done: true } : { value: val, done: false };
          },
        };
      },
    };
    return lexer;
  }
}

export default Moo;
