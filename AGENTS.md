# Project Agent Guidance

## Database Driver Standard

- Prefer Drizzle with Bun SQL (`drizzle-orm/bun-sql`) for database access in this project.
- Do not introduce alternate DB clients unless explicitly requested.

## JSDoc Requirements

All non-trivial functions must include JSDoc annotations.

JSDoc must include:

- `@param` for all parameters
- `@returns` describing the return value
- A clear description of what the function does

## Commit Standards

- Generate clear, descriptive commit messages that are not verbose.
- Commit messages should be one short sentence.
- Always output the proposed commit message in chat/output.
- The user commits manually after changes are done.
- The user pushes manually after committing.
- Wait for the user to test changes before continuing after a commit-related step.
