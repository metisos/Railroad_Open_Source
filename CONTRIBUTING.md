# Contributing to Railroad Memory

First off, thank you for considering contributing to Railroad Memory! It's people like you that make Railroad Memory such a great tool for the AI agent community.

## Code of Conduct

By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, config files)
- **Describe the behavior you observed and what you expected**
- **Include your environment details** (Node.js version, OS, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed feature**
- **Explain why this enhancement would be useful**
- **List any alternative solutions you've considered**

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** and add tests if applicable
4. **Run the test suite**: `npm test`
5. **Run the linter**: `npm run lint`
6. **Build the project**: `npm run build`
7. **Commit your changes** using a descriptive commit message
8. **Push to your fork** and submit a pull request

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/railroad-memory.git
cd railroad-memory

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Project Structure

```
railroad-memory/
├── src/
│   ├── index.ts          # Main entry point (Node.js)
│   ├── browser.ts        # Browser entry point
│   ├── browser-storage.ts # Browser storage adapters
│   ├── session.ts        # Session management
│   ├── storage.ts        # Storage adapters
│   ├── pruning.ts        # Memory pruning logic
│   └── types.ts          # TypeScript type definitions
├── dist/                 # Compiled output
├── tests/                # Test files
└── examples/             # Usage examples
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Style

We use ESLint and Prettier for code formatting. Your code will be automatically checked when you commit.

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add IndexedDB storage adapter for browsers
fix: resolve memory leak in session cleanup
docs: update API reference for pruning config
```

## Architecture Decisions

### Why YAML?

We chose YAML for state persistence because:
1. **Human-readable** - Easy to inspect and debug
2. **Git-friendly** - Diffs are meaningful
3. **Widely supported** - Works everywhere

### Why Not SQLite/Redis/etc?

Railroad is designed to be:
1. **Zero-config** - Works out of the box
2. **Portable** - State files can be copied/backed up
3. **Transparent** - You can see exactly what's stored

For high-scale deployments, custom storage adapters can use any backend.

### Memory Pruning Philosophy

We believe in:
1. **Never losing information** - Archive, don't delete
2. **Importance-based retention** - Keep what matters
3. **Graceful degradation** - Old memories become summaries

## Need Help?

- **Questions?** Open a [Discussion](https://github.com/metiscode/railroad-memory/discussions)
- **Found a bug?** Open an [Issue](https://github.com/metiscode/railroad-memory/issues)
- **Have an idea?** Start a [Discussion](https://github.com/metiscode/railroad-memory/discussions/categories/ideas)

## Recognition

Contributors are recognized in:
- The [README](README.md) contributors section
- Release notes for significant contributions
- Our eternal gratitude!

---

Thank you for contributing to Railroad Memory!
