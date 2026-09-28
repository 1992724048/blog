'use strict'

// GitHub linguist 色表（子集）。键是 GitHub /repos 的 language 字段给出的语言名（即 linguist 的
// 规范名），值是该语言的 linguist 官方色值，逐条取自 github-linguist/linguist 的
// lib/linguist/languages.yml（master，2026-09-28），只收录技术博客可能链到的语言。
//
// 未收录的语言查得 null：卡片照常显示语言名，只是不画点。不兜一个中性色 —— 中性点会被读成
// 「查到了但就是这个色」，比没有点更糟；没有点与语言名文字并存，正是「无色」的自述形态。
const LANGUAGE_COLORS = Object.freeze({
  'C': '#555555',
  'C++': '#f34b7d',
  'C#': '#7355dd',
  'Objective-C': '#438eff',
  'Objective-C++': '#6866fb',
  'Assembly': '#6e4c13',
  'LLVM': '#185619',
  'Rust': '#dea584',
  'Go': '#00add8',
  'Zig': '#ec915c',
  'Nim': '#ffc200',
  'D': '#ba595e',
  'V': '#4f87c4',
  'Odin': '#60affe',
  'Crystal': '#000100',
  'Dart': '#00b4ab',
  'Swift': '#f05138',
  'Java': '#b07219',
  'Kotlin': '#a97bff',
  'Scala': '#c22d40',
  'Groovy': '#4298b8',
  'Clojure': '#db5855',
  'F#': '#b845fc',
  'Haskell': '#5e5086',
  'OCaml': '#ef7a08',
  'Erlang': '#b83998',
  'Elixir': '#8847b9',
  'Elm': '#60b5cc',
  'PureScript': '#1d222d',
  'Idris': '#b30000',
  'Reason': '#ff5847',
  'Standard ML': '#dc566d',
  'Scheme': '#1e4aec',
  'Racket': '#3c5caa',
  'Common Lisp': '#3fb68b',
  'Emacs Lisp': '#c065db',
  'Prolog': '#74283c',
  'Mercury': '#ff2b2b',
  'Eiffel': '#4d6977',
  'Agda': '#315665',
  'Modula-2': '#10253f',
  'Julia': '#a270ba',
  'R': '#198ce7',
  'Lua': '#000080',
  'Ruby': '#701516',
  'Perl': '#0298c3',
  'PHP': '#4f5d95',
  'Fortran': '#4d41b1',
  'Pascal': '#e3f171',
  'Ada': '#02f88c',
  'Vala': '#a56de2',
  'Cython': '#fedf5b',
  'NumPy': '#9c8af9',
  'Python': '#3572a5',
  'Jupyter Notebook': '#da5b0b',
  'Cuda': '#3a4e3a',
  'Vyper': '#9f4cf2',
  'Solidity': '#aa6746',
  'Yul': '#794932',
  'Move': '#4a137a',
  'JavaScript': '#f1e05a',
  'TypeScript': '#3178c6',
  'CoffeeScript': '#244776',
  'Vue': '#41b883',
  'Svelte': '#ff3e00',
  'WebAssembly': '#04133b',
  'Shell': '#89e051',
  'PowerShell': '#012456',
  'Batchfile': '#c1f12e',
  'Tcl': '#e4cc98',
  'Awk': '#c30e9b',
  'sed': '#64b970',
  'Makefile': '#427819',
  'CMake': '#da3434',
  'Meson': '#007800',
  'Dockerfile': '#384d54',
  'Nix': '#7e7eff',
  'Starlark': '#76d275',
  'BitBake': '#00bce4',
  'HCL': '#844fba',
  'Gradle': '#02303a',
  'Gnuplot': '#f0a9f0',
  'MATLAB': '#e16737',
  'Wolfram Language': '#dd1100',
  'Stan': '#b2011d',
  'HTML': '#e34c26',
  'CSS': '#663399',
  'SCSS': '#c6538c',
  'Sass': '#a53b70',
  'Less': '#1d365d',
  'Pug': '#a86454',
  'Handlebars': '#f7931e',
  'Liquid': '#67b8de',
  'Twig': '#c1d026',
  'Blade': '#f7523f',
  'EJS': '#a91e50',
  'JSON': '#292929',
  'JSON5': '#267cb9',
  'JSONLD': '#0c479c',
  'YAML': '#cb171e',
  'TOML': '#9c4221',
  'XML': '#0060ac',
  'SVG': '#ff9900',
  'XSLT': '#eb8ceb',
  'Markdown': '#083fa1',
  'MDX': '#fcb32c',
  'reStructuredText': '#141414',
  'TeX': '#3d6117',
  'CSV': '#237346',
  'Thrift': '#d12127',
  'Avro IDL': '#0040ff',
  'SQL': '#e38c00',
  'TSQL': '#e38c00',
  'ANTLR': '#9dc3ff',
  'PostScript': '#da291c',
  'Forth': '#341708',
  'Kaitai Struct': '#773b37',
  'Verilog': '#b2b7f8',
  'VHDL': '#adb2cb',
  'SystemVerilog': '#dae1c2',
  'G-code': '#d08cf2',
  'OpenSCAD': '#e5cd45'
})

// 色值进的是 HTML style 属性，故在建表时一次性断言格式：写错会在 require 时炸掉整个构建，
// 而不是把一段坏属性写进页面。运行期不再校验。
const HEX_COLOR = /^#[0-9a-f]{6}$/
for (const [name, color] of Object.entries(LANGUAGE_COLORS)) {
  if (!HEX_COLOR.test(color)) throw new Error(`LANGUAGE_COLORS[${name}] is not a 6-digit hex colour: ${color}`)
}

// 键按小写建索引，与 platform.js 的 cacheKey 同理：GitHub 的语言名大小写不敏感，
// 而 sidecar 是可手改的 JSON 落盘文件，不能因为大小写漂移就查不到色。
const COLOR_BY_LOWER_NAME = new Map(
  Object.entries(LANGUAGE_COLORS).map(([name, color]) => [name.toLowerCase(), color])
)

const languageColor = (name) => {
  if (typeof name !== 'string') return null
  return COLOR_BY_LOWER_NAME.get(name.trim().toLowerCase()) ?? null
}

module.exports = { LANGUAGE_COLORS, languageColor }
