import type { SqlInspection, StatementType } from "../types.js";

const DATABASE_REFERENCE_PATTERNS = [
  /\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+`?([A-Za-z0-9_]+)`?\s*\.\s*`?[A-Za-z0-9_]+`?/giu,
  /\b(?:SHOW\s+(?:TABLES|COLUMNS|FIELDS|INDEX|INDEXES)\s+FROM)\s+`?([A-Za-z0-9_]+)`?(?=\s|$)/giu,
];

const normalizeStatementType = (keyword: string): StatementType => {
  switch (keyword) {
    case "SELECT":
      return "select";
    case "SHOW":
      return "show";
    case "DESCRIBE":
    case "DESC":
      return "describe";
    case "EXPLAIN":
      return "explain";
    case "INSERT":
      return "insert";
    case "UPDATE":
      return "update";
    case "DELETE":
      return "delete";
    case "REPLACE":
      return "replace";
    case "CREATE":
    case "ALTER":
    case "DROP":
    case "TRUNCATE":
    case "RENAME":
      return "ddl";
    default:
      return "unknown";
  }
};

const stripTrailingSemicolons = (sql: string): string =>
  sql.replace(/[\s;]+$/u, "").trim();

const isWordCharacter = (value: string | undefined): boolean =>
  value !== undefined && /[A-Za-z0-9_]/u.test(value);

const skipWhitespaceAndComments = (sql: string, startIndex: number): number => {
  let index = startIndex;

  while (index < sql.length) {
    while (index < sql.length && /\s/u.test(sql[index] ?? "")) {
      index += 1;
    }

    const current = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (current === "-" && next === "-") {
      index += 2;
      while (index < sql.length && (sql[index] ?? "") !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "#") {
      index += 1;
      while (index < sql.length && (sql[index] ?? "") !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < sql.length) {
        if ((sql[index] ?? "") === "*" && (sql[index + 1] ?? "") === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    break;
  }

  return index;
};

const readKeywordAt = (
  sql: string,
  startIndex: number,
): { keyword: string; nextIndex: number } => {
  const index = skipWhitespaceAndComments(sql, startIndex);
  let cursor = index;

  while (cursor < sql.length && /[A-Za-z]/u.test(sql[cursor] ?? "")) {
    cursor += 1;
  }

  return {
    keyword: sql.slice(index, cursor).toUpperCase(),
    nextIndex: cursor,
  };
};

const scanBalancedParentheses = (sql: string, startIndex: number): number => {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = startIndex; index < sql.length; index += 1) {
    const current = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (current === "-" && next === "-") {
        inLineComment = true;
        index += 1;
        continue;
      }
      if (current === "#") {
        inLineComment = true;
        continue;
      }
      if (current === "/" && next === "*") {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (current === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (current === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (current === "`" && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    if (current === "(") {
      depth += 1;
      continue;
    }

    if (current === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return sql.length;
};

const findKeywordAtTopLevel = (
  sql: string,
  startIndex: number,
  targetKeyword: string,
): number => {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = startIndex; index < sql.length; index += 1) {
    const current = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (current === "-" && next === "-") {
        inLineComment = true;
        index += 1;
        continue;
      }
      if (current === "#") {
        inLineComment = true;
        continue;
      }
      if (current === "/" && next === "*") {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (current === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (current === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (current === "`" && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    if (current === "(") {
      depth += 1;
      continue;
    }
    if (current === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    if (
      sql.slice(index, index + targetKeyword.length).toUpperCase() === targetKeyword &&
      !isWordCharacter(sql[index - 1]) &&
      !isWordCharacter(sql[index + targetKeyword.length])
    ) {
      return index;
    }
  }

  return -1;
};

const extractMainKeywordAfterLeadingWith = (sql: string): string => {
  let index = skipWhitespaceAndComments(sql, 0);
  const first = readKeywordAt(sql, index);
  if (first.keyword !== "WITH") {
    return "";
  }

  index = first.nextIndex;
  const maybeRecursive = readKeywordAt(sql, index);
  if (maybeRecursive.keyword === "RECURSIVE") {
    index = maybeRecursive.nextIndex;
  }

  while (index < sql.length) {
    index = skipWhitespaceAndComments(sql, index);
    const asIndex = findKeywordAtTopLevel(sql, index, "AS");
    if (asIndex < 0) {
      return "";
    }

    index = skipWhitespaceAndComments(sql, asIndex + 2);
    if ((sql[index] ?? "") !== "(") {
      return "";
    }

    index = scanBalancedParentheses(sql, index);
    index = skipWhitespaceAndComments(sql, index);

    if ((sql[index] ?? "") === ",") {
      index += 1;
      continue;
    }

    return readKeywordAt(sql, index).keyword;
  }

  return "";
};

export const inspectSql = (input: string): SqlInspection => {
  const sql = input.trim();
  let hasMultipleStatements = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (current === "-" && next === "-") {
        inLineComment = true;
        index += 1;
        continue;
      }
      if (current === "#") {
        inLineComment = true;
        continue;
      }
      if (current === "/" && next === "*") {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (current === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (current === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (current === "`" && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick && current === ";") {
      const remaining = sql.slice(index + 1).trim();
      if (remaining.length > 0) {
        hasMultipleStatements = true;
        break;
      }
    }
  }

  const normalizedSql = stripTrailingSemicolons(sql);
  const firstKeyword = readKeywordAt(normalizedSql, 0).keyword;
  const hasLeadingWithClause = firstKeyword === "WITH";
  const mainKeyword = hasLeadingWithClause
    ? extractMainKeywordAfterLeadingWith(normalizedSql)
    : undefined;
  const statementKeyword = hasLeadingWithClause ? mainKeyword ?? "" : firstKeyword;

  return {
    normalizedSql,
    firstKeyword,
    mainKeyword,
    statementType: normalizeStatementType(statementKeyword),
    hasMultipleStatements,
    hasLeadingWithClause,
  };
};

export const extractReferencedDatabases = (sql: string): string[] => {
  const databases = new Set<string>();

  for (const pattern of DATABASE_REFERENCE_PATTERNS) {
    const matches = sql.matchAll(pattern);
    for (const match of matches) {
      const databaseName = match[1];
      if (databaseName) {
        databases.add(databaseName.replace(/`/gu, ""));
      }
    }
  }

  return [...databases];
};
