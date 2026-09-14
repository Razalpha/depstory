function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character ?? "");
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character ?? "");
}

function readIdentifier(source, start) {
  let end = start + 1;
  while (isIdentifierPart(source[end])) end += 1;
  return { value: source.slice(start, end), end };
}

function readQuoted(source, start) {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      if (index + 1 < source.length) value += source[index + 1];
      index += 2;
      continue;
    }
    if (character === quote) return { value, end: index + 1 };
    value += character;
    index += 1;
  }
  return { value, end: source.length };
}

function skipTemplate(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source[index] === "`") return index + 1;
    else index += 1;
  }
  return source.length;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index + 2);
      return newline === -1 ? source.length : skipTrivia(source, newline + 1);
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      return close === -1 ? source.length : skipTrivia(source, close + 2);
    }
    break;
  }
  return index;
}

function readSpecifierAfterFrom(source, start) {
  let index = start;
  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === ";" || character === undefined) return null;
    if (character === '"' || character === "'") {
      index = readQuoted(source, index).end;
      continue;
    }
    if (character === "`") {
      index = skipTemplate(source, index);
      continue;
    }
    if (isIdentifierStart(character)) {
      const token = readIdentifier(source, index);
      if (token.value === "from") {
        const valueStart = skipTrivia(source, token.end);
        if (source[valueStart] === '"' || source[valueStart] === "'") {
          return readQuoted(source, valueStart);
        }
        return null;
      }
      index = token.end;
      continue;
    }
    index += 1;
  }
  return null;
}

/**
 * Extracts literal ESM and CommonJS module specifiers without executing or
 * fully parsing the source. Comments, ordinary strings, and template strings
 * are skipped so examples do not become false-positive dependency usage.
 */
export function extractModuleSpecifiers(source) {
  const specifiers = new Set();
  let index = 0;

  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === undefined) break;
    if (character === '"' || character === "'") {
      index = readQuoted(source, index).end;
      continue;
    }
    if (character === "`") {
      index = skipTemplate(source, index);
      continue;
    }
    if (!isIdentifierStart(character)) {
      index += 1;
      continue;
    }

    const token = readIdentifier(source, index);
    index = token.end;

    if (token.value === "import") {
      let cursor = skipTrivia(source, token.end);
      if (source[cursor] === '"' || source[cursor] === "'") {
        const literal = readQuoted(source, cursor);
        specifiers.add(literal.value);
        index = literal.end;
      } else if (source[cursor] === "(") {
        cursor = skipTrivia(source, cursor + 1);
        if (source[cursor] === '"' || source[cursor] === "'") {
          const literal = readQuoted(source, cursor);
          specifiers.add(literal.value);
          index = literal.end;
        }
      } else if (source[cursor] !== ".") {
        const literal = readSpecifierAfterFrom(source, cursor);
        if (literal) {
          specifiers.add(literal.value);
          index = literal.end;
        }
      }
      continue;
    }

    if (token.value === "export") {
      const literal = readSpecifierAfterFrom(source, token.end);
      if (literal) {
        specifiers.add(literal.value);
        index = literal.end;
      }
      continue;
    }

    if (token.value === "require") {
      let cursor = skipTrivia(source, token.end);
      if (source[cursor] !== "(") continue;
      cursor = skipTrivia(source, cursor + 1);
      if (source[cursor] === '"' || source[cursor] === "'") {
        const literal = readQuoted(source, cursor);
        specifiers.add(literal.value);
        index = literal.end;
      }
    }
  }

  return [...specifiers];
}
