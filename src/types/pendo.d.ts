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
  clearSession(): void;
  track(eventName: string, metadata?: Record<string, unknown>): void;
}

declare const pendo: Pendo;