# JWT Token Middleware

<cite>
**Referenced Files in This Document**
- [index.js](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js)
- [package.json](file://aischolarpath-backend-main/aischolarpath-backend-main/package.json)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document explains the JWT token middleware implementation used to protect routes in ScholarPathAI’s backend. It details how the authenticateToken function extracts tokens from Authorization headers, validates them using a secret stored in an environment variable, and injects user context into request objects. It also documents error handling for missing or invalid/expired tokens, shows how to protect routes with this middleware, clarifies expected token format (Bearer), and outlines security considerations for client-side token storage.

## Project Structure
The authentication logic is implemented in the Express application entry point. The middleware is defined once and reused across multiple protected routes. Tokens are issued by login/signup endpoints and verified on subsequent requests.

```mermaid
graph TB
Client["Client App"] --> API["Express App<br/>index.js"]
API --> MW["authenticateToken<br/>middleware"]
MW --> |Valid| RouteHandlers["Protected Route Handlers"]
MW --> |Missing/Invalid| ErrorResponses["401 / 403 Responses"]
RouteHandlers --> DB["Supabase"]
```

**Diagram sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)
- [index.js:519-573](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L519-L573)

**Section sources**
- [index.js:1-15](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1-L15)
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)
- [index.js:519-573](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L519-L573)

## Core Components
- authenticateToken middleware: Extracts Bearer token from Authorization header, verifies it against the secret, and attaches the decoded user id to the request object.
- Protected routes: Multiple route handlers use authenticateToken to enforce authentication before executing business logic.
- Token issuance: Login and signup endpoints sign JWTs containing the user id with a configured expiration.

Key behaviors:
- Missing token returns 401 Unauthorized.
- Invalid or expired token returns 403 Forbidden.
- On success, req.userId is set to the decoded user id for downstream authorization checks.

**Section sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)
- [index.js:519-573](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L519-L573)

## Architecture Overview
The middleware sits between incoming requests and route handlers. It ensures only authenticated requests proceed. Protected routes then rely on req.userId to enforce ownership and access control.

```mermaid
sequenceDiagram
participant C as "Client"
participant E as "Express App"
participant M as "authenticateToken"
participant R as "Route Handler"
participant S as "Supabase"
C->>E : HTTP Request with Authorization : Bearer <token>
E->>M : Call middleware
M->>M : Extract token from header
M->>M : Verify token with JWT_SECRET
alt Valid token
M-->>E : Set req.userId and call next()
E->>R : Invoke handler
R->>S : Read/Write data
S-->>R : Data
R-->>C : Success response
else Missing token
M-->>C : 401 Unauthorized
else Invalid/expired token
M-->>C : 403 Forbidden
end
```

**Diagram sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)
- [index.js:519-573](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L519-L573)

## Detailed Component Analysis

### authenticateToken Middleware
Responsibilities:
- Reads the Authorization header.
- Expects a Bearer token format: "Bearer <token>".
- Verifies the token using the JWT library and the secret from process.env.JWT_SECRET.
- Returns 401 if no token is present.
- Returns 403 if verification fails (invalid or expired).
- On success, sets req.userId to the decoded id and proceeds to the next middleware/handler.

```mermaid
flowchart TD
Start(["Request enters middleware"]) --> CheckHeader["Read Authorization header"]
CheckHeader --> HasToken{"Token present?"}
HasToken -- "No" --> Return401["Respond 401 Unauthorized"]
HasToken -- "Yes" --> Verify["Verify token with JWT_SECRET"]
Verify --> Valid{"Verification ok?"}
Valid -- "No" --> Return403["Respond 403 Forbidden"]
Valid -- "Yes" --> Inject["Set req.userId = decoded.id"]
Inject --> Next["Call next()"]
```

**Diagram sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)

**Section sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)

### Protected Routes Using the Middleware
Examples of routes that require authentication:
- PATCH /api/profile
- GET /api/profile/:id
- POST /api/profile/:id/upload-cv
- POST /api/profile/:id/analyze
- GET /api/language-prep/profile/:profileId
- POST /api/attestation/:authority/init/:profileId
- GET /api/attestation/profile/:profileId
- PATCH /api/attestation/:id/complete
- POST /api/profile/:id/match-scholarships
- GET /api/profile/:id/matches
- GET /api/profile/:id/overview
- POST /api/shortlist
- DELETE /api/shortlist/:id
- GET /api/shortlist/:profileId
- POST /api/applications
- PATCH /api/applications/:id
- GET /api/applications/:profileId
- DELETE /api/applications/:id
- POST /api/notifications
- GET /api/notifications/:profileId
- PATCH /api/notifications/:id/read
- POST /api/notifications/check-deadlines/:profileId
- POST /api/discovery/scrape
- POST /api/discovery/scrape-bulk
- POST /api/discovery/scrape-and-structure
- POST /api/discovery/scrape-official
- POST /api/discovery/scrape-official-bulk
- PATCH /api/scholarships/:id/approve
- GET /api/roadmap/:profileId

These routes rely on req.userId to enforce per-user access controls after authentication.

**Section sources**
- [index.js:70-110](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L70-L110)
- [index.js:112-188](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L112-L188)
- [index.js:356-402](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L356-L402)
- [index.js:438-517](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L438-L517)
- [index.js:575-749](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L575-L749)
- [index.js:751-820](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L751-L820)
- [index.js:822-932](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L822-L932)
- [index.js:983-1051](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L983-L1051)
- [index.js:1054-1100](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1054-L1100)
- [index.js:1183-1493](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1183-L1493)
- [index.js:1508-1526](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1508-L1526)
- [index.js:1546-1595](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1546-L1595)

### Token Issuance (Login/Signup)
- Signup creates a user and signs a JWT with the user id and a 7-day expiration using the secret.
- Login authenticates credentials and issues a JWT with the same structure and expiration.

Clients should store the returned token and include it in subsequent requests.

**Section sources**
- [index.js:519-573](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L519-L573)

## Dependency Analysis
External dependencies relevant to JWT:
- jsonwebtoken: Used to verify and sign tokens.
- dotenv: Loads environment variables including JWT_SECRET at startup.
- express: Provides the middleware and routing framework.

Environment requirements:
- JWT_SECRET must be set; the app validates required env vars at startup and exits if missing.

```mermaid
graph LR
A["index.js"] --> B["jsonwebtoken"]
A --> C["dotenv"]
A --> D["express"]
A --> E["@supabase/supabase-js"]
```

**Diagram sources**
- [package.json:1-14](file://aischolarpath-backend-main/aischolarpath-backend-main/package.json#L1-L14)
- [index.js:1-15](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1-L15)

**Section sources**
- [package.json:1-14](file://aischolarpath-backend-main/aischolarpath-backend-main/package.json#L1-L14)
- [index.js:1-15](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1-L15)

## Performance Considerations
- Token verification is lightweight but occurs per request; ensure JWT_SECRET is stable and network calls to Supabase are efficient.
- Avoid unnecessary logging of sensitive tokens.
- For high traffic, consider caching decoded claims where appropriate and rate-limiting endpoints.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and responses:
- 401 Unauthorized: No token provided. Ensure the Authorization header includes a Bearer token.
- 403 Forbidden: Invalid or expired token. Verify the token was signed with the correct secret and has not expired.
- Environment misconfiguration: If JWT_SECRET is missing, the server will exit at startup. Confirm environment variables are loaded via dotenv.

Operational tips:
- Use consistent token lifetimes (e.g., 7 days) and refresh strategies on the client.
- Validate that clients send Authorization: Bearer <token> exactly as expected.

**Section sources**
- [index.js:32-47](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L47)
- [index.js:1-15](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L1-L15)

## Conclusion
ScholarPathAI uses a simple and effective JWT-based authentication flow. The authenticateToken middleware centralizes token extraction and validation, enforces strict error codes for missing or invalid tokens, and injects user identity into requests for fine-grained authorization. Protect any sensitive route by applying this middleware and ensure clients send properly formatted Bearer tokens.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### How to Protect a Route
- Add authenticateToken as middleware before your route handler.
- Access the authenticated user id via req.userId in your handler.

Example references:
- Protected profile update: [index.js:70-91](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L70-L91)
- Protected profile read: [index.js:94-110](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L94-L110)

**Section sources**
- [index.js:70-110](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L70-L110)

### Expected Token Format
- Header name: Authorization
- Value format: Bearer <token>
- Example: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

**Section sources**
- [index.js:32-35](file://aischolarpath-backend-main/aischolarpath-backend-main/index.js#L32-L35)

### Security Considerations for Client-Side Storage
- Prefer secure, httpOnly cookies when possible to prevent XSS exposure.
- If storing in memory or localStorage, ensure HTTPS-only transport and implement token rotation or short-lived tokens with refresh flows.
- Never log or expose tokens in URLs or analytics payloads.
- Validate token presence and handle 401/403 responses gracefully by prompting re-authentication.

[No sources needed since this section provides general guidance]