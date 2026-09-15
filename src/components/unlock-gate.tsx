"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  forgetUnlock,
  hasRememberedUnlock,
  passwordMatches,
  rememberUnlock,
} from "@/lib/gate";

export function UnlockGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [promptOpen, setPromptOpen] = useState(true);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (hasRememberedUnlock()) {
      setUnlocked(true);
      setPromptOpen(false);
    }
    setReady(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    const ok = await passwordMatches(password);
    setChecking(false);
    if (!ok) {
      setError(true);
      return;
    }
    if (remember) rememberUnlock();
    else forgetUnlock();
    setUnlocked(true);
    setPromptOpen(false);
    setPassword("");
    setError(false);
  }

  return (
    <>
      <div
        className={
          unlocked
            ? undefined
            : "pointer-events-none select-none blur-2xl"
        }
        inert={!unlocked}
        aria-hidden={!unlocked}
      >
        {children}
      </div>

      {ready && !unlocked && promptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-lg"
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted">
              <Lock className="size-5" />
            </div>
            <h2 className="text-lg font-semibold">Podaj hasło</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plan zajęć jest ukryty. Wpisz hasło, żeby zobaczyć dane.
            </p>
            <label className="sr-only" htmlFor="site-password">
              Hasło
            </label>
            <input
              id="site-password"
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(false);
              }}
              className="mt-4 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Hasło"
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 accent-primary"
              />
              Zapamiętaj na tym urządzeniu (30 dni)
            </label>
            {error ? (
              <p className="mt-2 text-sm text-destructive">
                Niepoprawne hasło.
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPromptOpen(false);
                  setError(false);
                }}
              >
                Nie teraz
              </Button>
              <Button type="submit" disabled={checking || password.trim() === ""}>
                Pokaż plan
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {ready && !unlocked && !promptOpen ? (
        <Button
          className="fixed right-4 bottom-4 z-50 shadow-lg"
          onClick={() => setPromptOpen(true)}
        >
          <Lock />
          Odblokuj plan
        </Button>
      ) : null}
    </>
  );
}
