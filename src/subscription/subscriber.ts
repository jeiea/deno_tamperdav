export type SubscriptionRequest = {
  /** relative path */
  path: string;
  depth: number;
  timeoutSeconds: number;
  signal: AbortSignal;
};

export type Subscriber = Disposable & {
  subscribe(request: SubscriptionRequest): Promise<Set<string>>;
};
