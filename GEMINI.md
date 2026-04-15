<!-- GSD:project-start source:PROJECT.md -->
## Project

**NexaChat Redesign**

A real-time chat application featuring a premium "Elegant Minimalist Dark + Glassmorphism" hybrid UI. It focuses on high-engagement features, rich media sharing via Firebase, and distinctly "Gen-Z" interactive elements like mood-based chat accents and fluid quick interactions to stand out from generic messaging platforms.

**Core Value:** Highly engaging, visually stunning real-time messaging that feels "alive" and uniquely personalized.

### Constraints

- **Tech Stack**: Must utilize Vanilla HTML/CSS/JS frontend as per current architecture; avoid introducing massive component frameworks (React) unless deeply justified, to keep implementation straightforward.
- **Media Storage**: Must use Firebase Storage for heavy media payload delivery, separating it from the Node/MongoDB application instance.
- **Visuals**: No placeholders. High aesthetic standards (vibrant dark color palettes, Google fonts, micro-animations) are absolutely required.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (Node.js for backend, Vanilla JS for frontend)
- HTML
- CSS (Vanilla)
## Runtime & Frameworks
- Node.js
- Express (Backend Web Framework)
- Socket.io (Real-time communication)
## Dependencies (Backend)
- `bcryptjs`: Password hashing
- `cors`: Cross-Origin Resource Sharing
- `dotenv`: Environment variable management
- `jsonwebtoken`: Authentication tokens
- `mongoose`: MongoDB object modeling
- `mongodb-memory-server`: In-memory MongoDB for testing/dev
- `uuid`: Unique identifier generation
## Configuration
- Environment variables configured via `.env` (using `dotenv`)
- Entry point: `server/server.js`
## Frontend Dependencies
- Custom Vanilla JS (`js/auth.js`, `js/chat.js`, `js/utils.js`)
- Socket.io client implementation
## Missing/Alternative
- No build step or bundler (e.g., Webpack, Vite) used for the frontend.
- No frontend framework (React/Vue/Svelte).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Code Style
- **JavaScript Formatting**: Follows standard ES6+ conventions. Arrow functions, let/const, object destructuring.
- **Async/Await**: Used heavily for asynchronous routes and socket events.
## Naming
- **Files**: Backend files are grouped by logical role. Frontend files correspond to pages or modules (`chat.html` -> `chat.js`, `auth.js`).
- **Variables**: `camelCase` for instances and functions, `PascalCase` for classes (e.g. Mongoose Models).
## Patterns
- **Middleware**: Express middleware used primarily for API endpoints handling authentication checks.
- **Event Emitters**: Socket handlers act similarly to controllers for WebSockets, binding to specific event names. 
## Error Handling
- Server REST routes wrap async code in `try/catch` and return HTTP JSON errors (`res.status(500).json(...)`).
- Socket handlers catch errors and emit custom error events or error acknowledgments back to clients.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern
- **Client-Server Architecture**: Vanilla HTML/CSS/JS frontend interacting with a Node.js/Express backend.
- **RESTful API**: Used for standard HTTP endpoints (like authentication and retrieving initial room data).
- **Event-Driven / PubSub**: Used for real-time messaging using Socket.io.
## Layers
## Data Flow
- **Authentication**: HTTP POST from client (`auth.js`) -> Express REST route (`routes/auth.js`) -> MongoDB -> Returns JWT.
- **Messaging**: Client emits socket event (`chat.js`) -> Socket handler validates/routes message (`handlers.js`) -> Saves to DB (`models/Message.js`) -> Broadcasts back to clients.
## Entry Points
- Server: `server/server.js`
- Client: `public/index.html` (Authentication layout), `public/chat.html` (Main chat layout)
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
