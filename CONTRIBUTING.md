# Contributing to dsh-tool-browser

Thank you for your interest in contributing! We welcome bug reports, feature
requests, code changes, and documentation improvements.

For building and running the project locally, see [docs/development.md](docs/development.md).

## Making Changes

1. **Create a branch** from `main` with a descriptive name: `fix/evaljs-security`, `feat/file-upload-tool`
2. **Write or update tests** — E2E tests must pass (`npm test`)
3. **Update README** if adding new tools or changing configuration
4. **Update CHANGELOG.md** under `[Unreleased]`
5. **Submit a PR** with a clear description of what changed and why

## Coding Standards

- TypeScript `strict` mode enabled
- ESM modules only (`"type": "module"`)
- No global mutable state — use dependency injection via closure factory
- All browser operations must handle errors gracefully and return structured results
- File names use kebab-case (`eval-js.ts`); tool names use snake_case (`browser_eval_js`)

## Adding New Tools

Each tool should follow this pattern in its per-tool `apply*Tool()` function:

```typescript
defineTool({
  name: 'browser_do_something',
  description: 'What this tool does...',
  parameters: { /* Zod-like parameter schema */ },
  output: {
    schema: { /* Output JSON Schema */ },
    render: (_args, v) => [{ type: 'text', text: '...' }],
  },
  async execute(args) {
    // Use engine methods, catch errors, return structured result
    try { ... }
    catch (err) { ... }
  },
})
```

## Reporting Issues

Before opening an issue, please:
1. Search existing issues to avoid duplicates
2. Include reproduction steps and expected vs actual behavior
3. Mention DSH version, Node.js version, and OS
4. Attach relevant logs or screenshots

## Security

If you discover a security vulnerability, follow the process in
[SECURITY.md](SECURITY.md): report it privately rather than filing a public
issue. Do not open a pull request for security issues until fixed.
