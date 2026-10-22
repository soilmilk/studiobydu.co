// Boards behind a password. Kept tiny and import-free because middleware.ts (Edge runtime) reads it.
// The password is the NOTES_PASSWORD environment variable: .env.local locally, and the hosting
// provider's environment settings in production. Without it, private boards stay locked.
export const PRIVATE_BOARDS = ["cs111"];

export const isPrivateBoard = (slug: string) => PRIVATE_BOARDS.includes(slug);
