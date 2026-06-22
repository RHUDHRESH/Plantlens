export type {
  OperationalCommandId,
  OperationalSearchActionContext,
  OperationalSearchDocument,
  OperationalSearchIndex,
  OperationalSearchKind,
  OperationalSearchResult,
} from "./searchTypes";

export { normalizeText, tokenize, uniqueTokens, buildDocumentTokens } from "./tokenizer";
export { expandAliases, getAliasesForToken } from "./thesaurus";
export { buildOperationalSearchIndex, type BuildOperationalSearchIndexParams } from "./searchIndex";
export {
  getOperationalCommandDocuments,
  executeOperationalCommand,
  buildCommandRegistryParams,
  type CommandRegistryParams,
} from "./commandRegistry";
export { scoreOperationalSearch, type ScoreOperationalSearchOptions } from "./scoring";
export {
  executeOperationalSearchResult,
  buildExecuteCommandParams,
} from "./executeSearchResult";
export { useCommandPalette, type UseCommandPaletteReturn } from "./useCommandPalette";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";