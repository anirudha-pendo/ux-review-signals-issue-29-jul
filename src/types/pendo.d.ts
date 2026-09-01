interface PendoMetadata {
  id: string;
  [key: string]: unknown;
}

interface PendoIdentifyOptions {
  visitor?: PendoMetadata;
  account?: PendoMetadata;
}

interface Pendo {
  initialize(options: PendoIdentifyOptions): void;
  identify(options: PendoIdentifyOptions): void;
  // Not part of the install-snippet stub — only defined once the agent loads.
  clearSession?(): void;
  track(eventName: string, metadata?: Record<string, unknown>): void;
}

declare const pendo: Pendo;