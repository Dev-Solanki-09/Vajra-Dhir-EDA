export interface MonarchLanguageSpec {
  tokenizer: {
    root: Array<[RegExp, string]>;
  };
}

export const ATO_KEYWORDS = [
  'module',
  'component',
  'interface',
  'net',
  'signal',
  'pin',
  'from',
  'import',
  'assert',
  'within',
  'pass',
  'new',
  'for',
  'in',
];

export const ATO_MONARCH_LANGUAGE: MonarchLanguageSpec = {
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/\b(module|component|interface|net|signal|pin|from|import|assert|within|pass|new|for|in)\b/, 'keyword'],
      [/\b([UJCRLDQ]\d+)\b/, 'type.identifier'],
      [/".*?"/, 'string'],
      [/\b\d+(\.\d+)?(V|A|mA|uF|nF|pF|uH|nH|ohm|kohm|Mohm|MHz|kHz|Hz|%)?\b/, 'number'],
    ],
  },
};

export const KICAD_SEXPR_MONARCH_LANGUAGE: MonarchLanguageSpec = {
  tokenizer: {
    root: [
      [/[()]/, 'delimiter.parenthesis'],
      [/".*?"/, 'string'],
      [/\b(kicad_pcb|kicad_sch|footprint|symbol|segment|via|wire|net|property|pad|at|layers|uuid|locked)\b/, 'keyword'],
      [/\b([UJCRLDQ]\d+)\b/, 'type.identifier'],
      [/-?\d+(\.\d+)?/, 'number'],
    ],
  },
};

export const SPICE_MONARCH_LANGUAGE: MonarchLanguageSpec = {
  tokenizer: {
    root: [
      [/^\*.*$/, 'comment'],
      [/\.(subckt|ends|model|param|tran|ac|dc|op|include|lib|meas)\b/i, 'keyword'],
      [/\b([RCLDQMXU][A-Za-z0-9_]+)\b/, 'type.identifier'],
      [/\b-?\d+(\.\d+)?([munpfkMG]|meg)?\b/i, 'number'],
    ],
  },
};

export const EXTRA_HW_LANGUAGES: Record<string, MonarchLanguageSpec> = {
  c: {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*[\s\S]*?\*\//, 'comment'],
        [/^\s*#\s*(pragma|define|include|ifdef|ifndef|endif|if|else)\b/, 'keyword'],
        [/\b(void|int|uint8_t|uint16_t|uint32_t|int32_t|bool|const|static|struct|enum|return|if|else|for|while)\b/, 'keyword'],
        [/\b([UJCRLDQ]\d+|GPIO_[A-Z0-9_]+|PIN_[A-Z0-9_]+)\b/, 'type.identifier'],
        [/".*?"/, 'string'],
        [/\b(0x[0-9A-Fa-f]+|\d+)\b/, 'number'],
      ],
    },
  },
  yaml: {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/^[ \t]*[A-Za-z0-9_.-]+(?=:)/, 'keyword'],
        [/\b([UJCRLDQ]\d+)\b/, 'type.identifier'],
        [/".*?"|'.*?'/, 'string'],
        [/\b\d+(\.\d+)?\b/, 'number'],
      ],
    },
  },
  python: {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\b(def|class|import|from|as|return|if|elif|else|for|while|with|try|except|None|True|False)\b/, 'keyword'],
        [/".*?"|'.*?'/, 'string'],
        [/\b\d+(\.\d+)?\b/, 'number'],
      ],
    },
  },
  rust: {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\b(fn|let|mut|pub|struct|enum|impl|use|mod|match|if|else|for|while|return|i64|i32|u32|usize|bool)\b/, 'keyword'],
        [/".*?"/, 'string'],
        [/\b\d+\b/, 'number'],
      ],
    },
  },
  json: {
    tokenizer: {
      root: [
        [/".*?"\s*(?=:)/, 'keyword'],
        [/".*?"/, 'string'],
        [/\b(true|false|null)\b/, 'keyword'],
        [/-?\d+(\.\d+)?/, 'number'],
      ],
    },
  },
};
