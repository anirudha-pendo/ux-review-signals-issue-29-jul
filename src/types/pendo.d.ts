interface Pendo {
  track(eventName: string, metadata?: Record<string, unknown>): void;
}

declare const pendo: Pendo;