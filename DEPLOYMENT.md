# Deploy Scribble Room

Deploy the whole project as one Render **Web Service**. Express serves both the frontend and Socket.IO. The root `render.yaml` selects the free compute plan, installs production dependencies, validates/packages the app, starts `npm start`, and checks `/health`. `.node-version` keeps Render on the tested Node 22 major release.

## Repository

Source repository: `https://github.com/cout-Tushar/scribble-room-web3task` (private). The repository root contains `package.json`, `server.js`, `render.yaml`, `scripts/`, and `public/`.

Do not upload `node_modules`, `.env`, or build output. Render installs dependencies and builds from source. The production server uses Render's supplied `PORT`; no secret environment variables or separate frontend URL are needed.

## Render setup

1. Connect the project repository to Render.
2. Create a Blueprint from `render.yaml`, or a Node Web Service with the same build/start commands.
3. Keep the service on one instance: room state is held in process memory.
4. Once deployment succeeds, check `/health` and test two browser sessions: create, join, start, choose, draw, guess, and rematch.

The free service can sleep when idle. Restarts clear active rooms and scores; this is existing backend behavior. No paid service is configured.

The Render service dashboard reports the live URL and deployment status. Verify the health endpoint and multiplayer flow after each release.
