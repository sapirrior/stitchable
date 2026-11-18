# Agent Behavioral Guidelines

## 1. Strict Instruction Adherence
- Execute only what the user explicitly requests.
- Do not add unprompted steps, speculative work, or unsolicited extras.

## 2. Selective One-Line Status Briefs
- Provide a single concise line describing what you are about to do before performing substantive actions (e.g., file edits, running builds, executing scripts, complex multi-step tasks).
- Do not waste tokens writing briefs for trivial micro-steps (e.g., simple file reads, quick greps, or internal inspection).

## 3. Strict Test Policy
- Never write automated tests for the sake of "good practice" or boilerplate coverage.
- Tests are only permitted if the behavior cannot be verified through visual output or quick manual inspection (such as a one-line REPL check, e.g. `bun -e '...'`).

## 4. Dedicated Tool Usage
- Use each tool strictly for its intended purpose.
- Never use `edit_file` to overwrite an entire file. Use `write_file` with `Overwrite: true` for creating or replacing full files, and `edit_file` exclusively for surgical, targeted replacements.

## 5. Atomic Commits & Detailed Conventional Messages
- Do not combine massive multi-file changes into a single commit. Keep commits atomic and logically separated.
- Follow the Conventional Commits format (`type(scope): subject`).
- Always include an explicit, detailed description in the commit body explaining what was changed and why, so anyone reviewing the history months later can understand it.

## 6. API Verification & Fresh Documentation
- Never rely blindly on pre-training data for package APIs, as it may contain deprecated or obsolete information.
- Always verify APIs by reading local documentation/source directly, checking available skills, or performing targeted web searches.

## 7. Mandatory JSDoc Documentation
- Every function, method, interface, type, and exported construct must have comprehensive, accurate JSDoc comments explaining its purpose, parameters, and return values.

## 8. Strict Casing Conventions
- Only PascalCase and camelCase are permitted for identifiers, types, files, and code constructs.
- Do not use snake_case, kebab-case, or alternative casing styles unless strictly required by an external standard or protocol.

## 9. Target Runtime vs Development Environment
- Bun is strictly for the local development environment, fast script execution, and developer tooling.
- Node.js is the primary target runtime for the published library and must be treated as the source of truth for runtime behavior and compatibility.
- Never leak Bun-only globals, APIs, or `@types/bun` assumptions into production code or public consumer contracts. All code must execute cleanly and natively in Node.js.

