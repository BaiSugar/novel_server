[English](./README-en.md) | [中文](./README.md)

# Novel Backend

Novel is the backend service for an AI-powered web novel writing platform. It handles authentication, novel and chapter management, prompt templates, context libraries, memos, AI model slots, and unified text / image generation orchestration.

The project is built with Bun, Elysia, and Prisma. It uses MySQL / MariaDB as the primary data store and follows a layered service architecture for complex writing workflows.

## Core Capabilities

- **Accounts and permissions**: registration, login, refresh token rotation, roles, and permission checks.
- **Novel writing management**: novels, chapters, ordering, archive, trash, and encrypted chapter content storage.
- **Prompt system**: prompt categories, template variables, version snapshots, review flow, and favorites.
- **Context library**: character cards, glossary entries, novel bindings, and single-level folder organization.
- **Memos**: global and novel-scoped memos for long-term preferences, writing plans, foreshadowing, and constraints.
- **AI model management**: model slots, provider accounts, model bindings, health state, and failure handling.
- **AI generation orchestration**: unified SSE generation entry, supporting `STANDARD` one-shot generation and `AGENT` tool loops.
- **Editor writing scenarios**: inline continuation, plot advice, selection expansion, chapter edit proposals, and context synchronization.
- **Image generation jobs**: image generation requests, job state, and result management.
- **Logging and audit**: request logs, response logs, audit logs, and unified error envelopes.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Bun |
| Web framework | Elysia 1.4.x |
| ORM | Prisma 7.x |
| Database | MySQL / MariaDB |
| Cache | Redis, optional |
| Type checking | TypeScript |
| Code style | Biome |

## Architecture Overview

```text
Request → plugins chain → controller → service → Prisma → MySQL
                              ↑                    ↑
                            $g            infrastructure and services
```

- `plugins/`: authentication, response macros, rate limiting, OpenAPI, static assets, and generated route mounting.
- `controller/`: thin controller layer for parameter validation, auth macro declarations, and response assembly.
- `service/`: business layer for validation, state transitions, model invocation, tool execution, and database operations.
- `lib/`: infrastructure such as Prisma, logging, audit, errors, and Redis.
- `utils/`: common utilities including tokens, passwords, chapter content codecs, SSE, and word counting.
- `docs/`: API, AI model, AI generation, project structure, and security documentation.

## Main Directories

```text
app/
├── controller/          # API controllers grouped by version and domain
├── service/             # Business services grouped by domain
├── plugins/             # Elysia plugin chain
├── lib/                 # Infrastructure
├── utils/               # Common utilities
├── config/              # Environment configuration
└── bootstrap/           # Startup initialization

prisma/                  # Prisma schema, migrations, and initialization SQL
docs/                    # Integration and design documentation
support/                 # Generated routes and support scripts
```

See [`docs/project-structure.md`](./docs/project-structure.md) for the full structure.

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Create and configure the required `.env` values, especially:

- Database connection settings
- `JWT_SECRET`
- Chapter content encryption key
- Optional Redis URL
- Initial administrator bootstrap settings

### 3. Initialize the database

```bash
bunx --bun prisma generate
bunx --bun prisma migrate dev
```

For production deployments:

```bash
bunx --bun prisma migrate deploy
bunx --bun prisma generate
```

### 4. Start the development server

```bash
bun run dev
```

## Common Commands

```bash
bun run dev                         # Development mode with route generation watcher
bun run build                       # Build Bun output
bun run start                       # Start in production mode
bun run start-hot                   # Start in production mode with hot reload
bun run generate_script             # Generate routes
bun run prisma_generate             # Generate Prisma Client
bun run generate_prisma_migrate_dev # Run development migration
bun run prisma_generate_migrate_deploy # Run production migration and generate Client
bun run prisma_studio               # Open Prisma Studio
bun run fix                         # Format and fix with Biome
```

## API and System Documentation

- [`docs/api.md`](./docs/api.md): frontend API integration documentation.
- [`docs/ai-model.md`](./docs/ai-model.md): AI model slots, accounts, bindings, and health state design.
- [`docs/ai-generation.md`](./docs/ai-generation.md): AI text / image generation, SSE, AGENT tools, and edit proposal design.
- [`docs/security.md`](./docs/security.md): JWT immediate revocation mechanism.
- [`docs/project-structure.md`](./docs/project-structure.md): project structure and layering rules.

## AI Generation Flow

Text generation uses a single unified endpoint:

```text
POST /v1/ai/generation/stream
```

Generation jobs return SSE events, including:

- `job.created`
- `message.delta`
- `message.reasoning_delta`
- `tool.call`
- `tool.result`
- `edit.proposal`
- `message.completed`
- `job.succeeded`
- `job.failed`

The backend is responsible for model context construction, history truncation, tool invocation, sensitive content redaction, chapter edit proposal validation, context synchronization, and job state persistence.

## Development Principles

- Keep controllers thin; put business logic in services.
- Treat user input, model output, tool results, and context content as untrusted data.
- Do not expose sensitive content such as prompt bodies, chapter bodies, or full tool results to the frontend by default.
- Update audit log configuration when adding a new business domain.
- Update `docs/project-structure.md` after adding, deleting, or moving files or directories.

## License

This project is open-sourced under the [GNU Affero General Public License v3.0](./LICENSE).

## Acknowledgements

Thanks to [Elysia](https://elysiajs.com/) for providing the high-performance, type-friendly Bun web framework foundation for this project.

Thanks also to the [Linux.do](https://linux.do/) community for supporting development discussions and technical exchange.