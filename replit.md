# TEASR - Pay-to-Reveal Social Media Platform

## Overview

TEASR is a Web3-native social media platform where creators monetize exclusive content through pay-to-reveal mechanics using the x402 payment protocol. Users browse blurred previews of images and videos, then pay with cryptocurrency (primarily USDC on Solana/Base) to unlock full content. The platform combines familiar Instagram-style feed design with premium content monetization patterns inspired by OnlyFans/Patreon.

Built as a full-stack TypeScript application with React frontend, Express backend, and PostgreSQL database. Designed for seamless Web3 wallet integration with emphasis on secure content encryption and trust-minimized payment flows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Core Framework**: React 18 with Vite for development and production builds. TypeScript provides type safety across the entire client codebase with strict mode enabled.

**Routing Strategy**: Wouter for lightweight client-side routing. Main routes include feed (`/`), admin dashboard (`/admin`), leaderboard (`/leaderboard`), and user profiles (`/profile/:username`). Chosen over React Router for smaller bundle size and simpler API.

**State Management**: TanStack Query (React Query) handles all server state management, caching, and real-time synchronization. No additional global state library needed since most application state derives from server data. Query keys follow convention `['resource', id]` for cache invalidation.

**UI Component System**: Tailwind CSS utility-first framework with shadcn/ui component library (built on Radix UI primitives). Custom design system defined in `tailwind.config.ts` using HSL color variables for consistent theming. Typography uses Inter for UI elements and Space Grotesk for headings. Component library includes 30+ pre-built components (buttons, modals, forms, cards).

**Real-time Updates**: WebSocket connection to `/ws` endpoint enables live vote count updates and viral post notifications. Custom `useWebSocket` hook manages connection lifecycle with automatic reconnection on disconnect. Broadcasts use JSON message format with `type` field for message routing.

**Web3 Integration**: Solana wallet connectivity using `@solana/web3.js` and `@solana/spl-token` for USDC transfers. Custom `WalletProvider` context manages wallet state globally. Wallet address transmitted via `X-Wallet-Address` header for user identification. x402 payment protocol integration uses `x402-solana` helper library for standardized payment flows.

**Key Design Patterns**:
- Container/Presentational separation: `PostCard` handles display, parent components handle voting/payment logic
- Modal-based workflows for content uploads and payment confirmations
- Instagram-inspired feed layout with creator info at card top
- Blurred thumbnail previews with lock icons for unpaid content
- Progressive image loading with Sharp-generated thumbnails

### Backend Architecture

**Server Framework**: Express.js with TypeScript running on Node.js 18+. ESM module system throughout codebase. Middleware stack includes JSON body parsing with raw body preservation for webhook verification.

**API Design**: RESTful endpoints under `/api` namespace. No API versioning currently implemented. WebSocket server runs on `/ws` path for real-time features. Response format follows `{ success: boolean, data?: any, error?: string }` convention.

**Authentication Model**: Wallet-based authentication using blockchain addresses (Ethereum/Solana). Middleware extracts wallet address from `X-Wallet-Address` header. Users auto-created on first wallet connection with default username format `user_<random>`. No traditional session management - stateless auth via wallet signatures.

**File Upload & Encryption Flow**:
1. Client uploads via multipart form-data (multer middleware, 50MB limit)
2. Server generates random AES-256-GCM symmetric key per post
3. Original file encrypted with content key using Node.js crypto module
4. Encrypted file stored in `/uploads` directory with `.enc` extension
5. Blurred thumbnail generated using Sharp library (500px width, 50px blur radius), stored in `/uploads/thumbnails`
6. Content key encrypted with master key (derived from `JWT_SECRET` env var) and stored in database
7. Metadata saved to PostgreSQL including encryption IV (12 bytes) and auth tag (16 bytes)

**Content Decryption & Access Control**:
- When non-payer requests content, server returns blurred thumbnail only
- After successful x402 payment verification, server decrypts content key using master key
- Server decrypts media file in memory and streams to client
- Optional: Generate short-lived JWT access token for temporary access (1 hour expiry)
- Decryption uses AES-256-GCM with stored IV and auth tag for verification

**x402 Payment Integration** (November 2025):
- **X402PaymentService** (`server/services/x402-payment.ts`) handles payment splitting logic across multiple blockchains
- Supports EVM chains (Base, Ethereum, Polygon, BNB) and Solana for USDC payments
- Platform fee: 0.05 USDC deducted from every locked content transaction
- Platform wallet: `0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020` (testnet and mainnet)
- Payment flow: Platform fee (0.05 USDC) → Creator payment → Investor revenue shares (if applicable)
- **Current Implementation**: Logs intended payment splits to console, does NOT execute actual on-chain transfers
- **Security**: No server-side private keys stored - client signs all transactions via MetaMask
- **Production Roadmap**: See `PAYMENT_IMPLEMENTATION.md` for deployment options (smart contract splitter recommended)
- Network configuration in `server/config/networks.ts` auto-switches based on NODE_ENV
- Payment records stored in `payments` and `platformFees` tables with transaction hash for audit trail
- Investor earnings tracked in `investors.totalEarnings` column when revenue share applies

**Viral Detection System**: Cron job runs every 5 minutes checking posts for viral thresholds (configurable: 10k views OR 500 upvotes in 24 hours). When threshold met, marks post as viral in database and broadcasts WebSocket notification to all connected clients.

### Database Architecture

**ORM & Schema**: Drizzle ORM with PostgreSQL dialect. Schema defined in `shared/schema.ts` using Drizzle's table builders. Migrations stored in `/migrations` directory. Database connection pooling via Neon serverless adapter with WebSocket support.

**Key Tables**:
- `users`: id (UUID), walletAddress (unique), username (unique), bio, profileImagePath, createdAt
- `posts`: id (UUID), creatorId (FK), title, description, encryptedMediaPath, blurredThumbnailPath, mediaType, encryptedKey, iv, authTag, price, isFree, acceptedCryptos, commentsLocked, commentFee, viewCount, upvoteCount, downvoteCount, isViral, viralDetectedAt, createdAt
- `payments`: id (UUID), userId (FK), postId (FK), paymentType ('media' | 'comment'), amount, currency, txHash, network, status, createdAt
- `comments`: id (UUID), postId (FK), userId (FK), content, createdAt
- `votes`: userId (FK), postId (FK), voteType ('up' | 'down'), createdAt - unique constraint on (userId, postId)
- `follows`: followerId (FK), followedId (FK), createdAt - unique constraint on (followerId, followedId)
- `viralNotifications`: id (UUID), postId (FK), notifiedAt

**Indexing Strategy**: Primary keys on all tables. Unique indexes on walletAddress, username. Foreign key indexes for joins (creatorId, userId, postId). No composite indexes yet - may add for common queries like (postId, userId) for vote lookups.

### External Dependencies

**Payment Infrastructure**:
- **x402 Protocol**: Coinbase's HTTP 402 payment standard for pay-per-request APIs. Handles payment challenge/response flow, signature verification, settlement coordination.
- **x402-solana**: Framework-agnostic Solana implementation of x402 protocol. Provides client-side wallet integration and server-side payment verification helpers.
- **Solana Web3.js**: Blockchain interaction library for Solana network. Used for transaction construction, signing, and verification.
- **SPL Token**: Solana Program Library token standard. USDC transfers use SPL token program.

**Cross-Chain Messaging** (Optional/Future):
- **LayerZero V2**: Omnichain interoperability protocol for cross-chain messages. Enables multi-chain payment settlement and creator earnings distribution. Currently in `temp_layerzero/` directory - not yet integrated.

**Database**:
- **Neon Serverless PostgreSQL**: Managed Postgres with HTTP and WebSocket support. Auto-scaling database with connection pooling. Required env var: `DATABASE_URL`.

**File Processing**:
- **Sharp**: High-performance image processing library. Generates blurred thumbnails (JPEG format, 500px width, quality 70). Handles image resizing and blur effects.
- **Multer**: Multipart form-data parsing for file uploads. In-memory storage during upload, then encrypted before disk write.

**Encryption & Security**:
- **Node.js Crypto**: Built-in cryptographic functions. AES-256-GCM for symmetric encryption. Random IV generation. Auth tag verification.
- **jsonwebtoken**: JWT generation for access tokens. HS256 signing using `JWT_SECRET`. 1-hour token expiry for content access.

**Real-time Communication**:
- **ws (WebSocket)**: WebSocket server implementation. Attached to HTTP server on `/ws` path. Broadcasts vote updates and viral notifications to all connected clients.

**UI Components**:
- **Radix UI**: Unstyled, accessible component primitives. 20+ components including Dialog, Dropdown, Tooltip, Toast, etc.
- **Tailwind CSS**: Utility-first CSS framework. Custom design system with HSL color variables. Dark mode support via class strategy.
- **class-variance-authority**: Type-safe component variant system. Used for button sizes/styles, card variants, etc.
- **lucide-react**: Icon library with 1000+ icons. Consistent stroke width and size.

**Development Tools**:
- **Vite**: Fast development server with HMR. Optimized production builds. Plugin-based architecture.
- **TypeScript**: Type checking with strict mode. Path aliases for imports (`@/`, `@shared/`).
- **tsx**: TypeScript execution for server without compilation step.
- **esbuild**: Fast bundler for production server build.

**Environment Variables Required**:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `JWT_SECRET`: Master key for encryption and JWT signing (min 32 chars)
- `NODE_ENV`: 'development' or 'production'
- Optional: `SOLANA_RPC_URL`, `BASE_RPC_URL` for blockchain connections