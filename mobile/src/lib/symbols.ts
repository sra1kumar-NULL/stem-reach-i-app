/** Symbol palette for the question editor toolbar. Plain Unicode, so it renders everywhere and students see it unchanged. */
export interface SymbolItem {
  /** What gets inserted. */
  char: string;
  /** Spoken label for screen readers. */
  label: string;
}

export interface SymbolGroup {
  id: string;
  title: string;
  items: SymbolItem[];
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'super',
    title: 'Superscripts',
    items: [
      { char: '⁰', label: 'superscript zero' },
      { char: '¹', label: 'superscript one' },
      { char: '²', label: 'superscript two' },
      { char: '³', label: 'superscript three' },
      { char: '⁴', label: 'superscript four' },
      { char: '⁵', label: 'superscript five' },
      { char: '⁶', label: 'superscript six' },
      { char: '⁷', label: 'superscript seven' },
      { char: '⁸', label: 'superscript eight' },
      { char: '⁹', label: 'superscript nine' },
      { char: '⁺', label: 'superscript plus' },
      { char: '⁻', label: 'superscript minus' },
    ],
  },
  {
    id: 'sub',
    title: 'Subscripts',
    items: [
      { char: '₀', label: 'subscript zero' },
      { char: '₁', label: 'subscript one' },
      { char: '₂', label: 'subscript two' },
      { char: '₃', label: 'subscript three' },
      { char: '₄', label: 'subscript four' },
      { char: '₅', label: 'subscript five' },
      { char: '₆', label: 'subscript six' },
      { char: '₇', label: 'subscript seven' },
      { char: '₈', label: 'subscript eight' },
      { char: '₉', label: 'subscript nine' },
      { char: '₊', label: 'subscript plus' },
      { char: '₋', label: 'subscript minus' },
    ],
  },
  {
    id: 'units',
    title: 'Units',
    items: [
      { char: '°', label: 'degree' },
      { char: '°C', label: 'degrees Celsius' },
      { char: 'Ω', label: 'ohm' },
      { char: 'µ', label: 'micro' },
      { char: 'Å', label: 'angstrom' },
      { char: '%', label: 'percent' },
      { char: '‰', label: 'per mille' },
    ],
  },
  {
    id: 'greek',
    title: 'Greek',
    items: [
      { char: 'α', label: 'alpha' },
      { char: 'β', label: 'beta' },
      { char: 'γ', label: 'gamma' },
      { char: 'δ', label: 'delta' },
      { char: 'Δ', label: 'capital delta' },
      { char: 'ε', label: 'epsilon' },
      { char: 'θ', label: 'theta' },
      { char: 'λ', label: 'lambda' },
      { char: 'μ', label: 'mu' },
      { char: 'π', label: 'pi' },
      { char: 'ρ', label: 'rho' },
      { char: 'σ', label: 'sigma' },
      { char: 'Σ', label: 'capital sigma' },
      { char: 'τ', label: 'tau' },
      { char: 'φ', label: 'phi' },
      { char: 'ω', label: 'omega' },
      { char: 'Ω', label: 'capital omega' },
    ],
  },
  {
    id: 'math',
    title: 'Math',
    items: [
      { char: '×', label: 'multiply' },
      { char: '÷', label: 'divide' },
      { char: '±', label: 'plus or minus' },
      { char: '∓', label: 'minus or plus' },
      { char: '√', label: 'square root' },
      { char: '∛', label: 'cube root' },
      { char: '≈', label: 'approximately equal' },
      { char: '≠', label: 'not equal' },
      { char: '≤', label: 'less than or equal' },
      { char: '≥', label: 'greater than or equal' },
      { char: '∞', label: 'infinity' },
      { char: '∝', label: 'proportional to' },
      { char: '∴', label: 'therefore' },
      { char: '∫', label: 'integral' },
      { char: '·', label: 'dot' },
      { char: '→', label: 'right arrow' },
      { char: '←', label: 'left arrow' },
      { char: '↑', label: 'up arrow' },
      { char: '↓', label: 'down arrow' },
      { char: '⇌', label: 'equilibrium arrows' },
    ],
  },
];
