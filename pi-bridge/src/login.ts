/**
 * In-app login for OAuth providers (ChatGPT subscription).
 *
 * The SDK's login() talks to the user through an interaction object. Here its
 * events are stored so the Settings page can poll them. The browser callback finishes
 * the login by itself.
 */
// Shapes of the SDK's login events and prompts (only the fields this file uses)
export type AuthEvent = { type: string; message?: string; url?: string; instructions?: string; userCode?: string; verificationUri?: string };
export type AuthPrompt = { type: string; message: string; placeholder?: string };

export type LoginSession = {
  status: "running" | "done" | "error";
  events: AuthEvent[];
  error?: string;
};

const sessions = new Map<string, LoginSession>();

/** Forgets the last login attempt for a provider (used after logout). */
export function clearLoginSession(provider: string): void {
  sessions.delete(provider);
}

export function getLoginSession(provider: string): LoginSession | undefined {
  return sessions.get(provider);
}

/** Starts login for a provider unless one is already running. */
export function startLogin(
  provider: string,
  runLogin: (interaction: {
    notify(event: AuthEvent): void;
    prompt(prompt: AuthPrompt): Promise<string>;
  }) => Promise<unknown>,
): LoginSession {
  const existing = sessions.get(provider);
  if (existing?.status === "running") return existing;

  const session: LoginSession = { status: "running", events: [] };
  sessions.set(provider, session);

  const interaction = {
    notify(event: AuthEvent) {
      session.events.push(event);
    },
    prompt(prompt: AuthPrompt): Promise<string> {
      // Browser login completes by itself through the local callback, so no answer is needed.
      // The only question is the login method; always pick the browser.
      if (prompt.type === "select") return Promise.resolve("browser");
      return new Promise<string>(() => {}); // waits for the browser callback
    },
  };

  // The SDK loads Node's crypto/http asynchronously when it starts. A login that
  // starts in that first moment fails before any step runs, so retry it briefly.
  const attempt = async (n: number): Promise<unknown> => {
    try {
      return await runLogin(interaction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const notReady = /only available in Node\.js environments/.test(message);
      if (notReady && n < 10 && session.events.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return attempt(n + 1);
      }
      throw err;
    }
  };

  attempt(0).then(
    () => {
      session.status = "done";
    },
    (err: unknown) => {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
    },
  );
  return session;
}
