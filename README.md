# GPU Grid

Distributed GPU computing platform. Clients submit CUDA programs from the browser;
the platform compiles them and runs them on idle GPUs offered by providers.

## Repository layout

- `backend/` — REST API and job scheduler (Node.js, TypeScript, Express)
- `docker-compose.yml` — development infrastructure (PostgreSQL, Redis)

## Development setup

Requirements: Node.js (version in `.nvmrc`, use `nvm install`), Docker with Compose.

    npm install                 # root tooling (Prettier)
    docker compose up -d        # start PostgreSQL and Redis
    cd backend && npm install
    npm run dev                 # backend on http://localhost:3000

Useful commands:

    npm run format              # format the whole repository
    docker compose down         # stop infrastructure (data is kept)
    docker compose down -v      # stop and delete all data
