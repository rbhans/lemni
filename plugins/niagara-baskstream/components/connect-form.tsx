"use client"

import { useState, type FormEvent } from "react"
import {
  Alert02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"

import type { StationProfile } from "../shared"
import {
  connect,
  connectionError,
  forgetProfile,
  NIAGARA_ICON,
  stationProfiles,
} from "../client/store"

const EMPTY: StationProfile = {
  name: "",
  station: "",
  username: "",
  allowSelfSigned: false,
}

export function ConnectForm() {
  const profiles = useValue(stationProfiles)
  const lostMessage = useValue(connectionError)
  const [profile, setProfile] = useState<StationProfile>(profiles[0] ?? EMPTY)
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<StationProfile>) =>
    setProfile((p) => ({ ...p, ...patch }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connect(profile, password, remember)
      setPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.")
    } finally {
      setBusy(false)
    }
  }

  const message = error ?? lostMessage

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-3">
      {profiles.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Recent stations
          </span>
          {profiles.map((saved) => {
            const active =
              saved.station === profile.station &&
              saved.username === profile.username
            return (
              <div
                key={`${saved.station}|${saved.username}`}
                className={cn(
                  "group flex items-center gap-2 rounded-md border px-2 py-1.5",
                  active ? "border-ring bg-muted/60" : "hover:bg-muted/40"
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setProfile(saved)}
                >
                  <Icon
                    icon={NIAGARA_ICON}
                    className="size-3.5 text-muted-foreground"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">
                      {saved.name || new URL(saved.station).host}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {saved.username} ·{" "}
                      {saved.station.replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Forget this station"
                  onClick={() => forgetProfile(saved)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                >
                  <Icon icon={Cancel01Icon} className="size-3" />
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="station-url">Station address</FieldLabel>
          <Input
            id="station-url"
            required
            placeholder="https://10.0.0.20"
            autoComplete="url"
            value={profile.station}
            onChange={(e) => update({ station: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="station-name">Name</FieldLabel>
          <Input
            id="station-name"
            placeholder="Riverside ES"
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="station-user">Username</FieldLabel>
            <Input
              id="station-user"
              required
              autoComplete="username"
              value={profile.username}
              onChange={(e) => update({ username: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="station-password">Password</FieldLabel>
            <Input
              id="station-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Switch
            id="station-self-signed"
            checked={profile.allowSelfSigned}
            onCheckedChange={(checked) => update({ allowSelfSigned: checked })}
          />
          <FieldLabel htmlFor="station-self-signed" className="font-normal">
            Allow self-signed certificate
          </FieldLabel>
        </Field>
        {profile.allowSelfSigned ? (
          <FieldDescription className="-mt-1 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
            Certificate checks are off for this station. Anyone on the network
            path could read or change the traffic, including the password. Use
            only on a trusted network.
          </FieldDescription>
        ) : null}
        <Field orientation="horizontal">
          <Switch
            id="station-remember"
            checked={remember}
            onCheckedChange={setRemember}
          />
          <FieldLabel htmlFor="station-remember" className="font-normal">
            Remember address and username (never the password)
          </FieldLabel>
        </Field>
      </FieldGroup>

      {message ? (
        <p
          role="alert"
          className="flex gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11.5px] text-destructive"
        >
          <Icon icon={Alert02Icon} className="mt-px size-3.5" />
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={busy} className="h-8">
        {busy ? "Connecting…" : "Connect"}
      </Button>

      {process.env.NODE_ENV !== "production" ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          No station handy? Run <code className="font-mono">npm run sim</code>{" "}
          and connect to{" "}
          <code className="font-mono">http://127.0.0.1:8710</code> (login in{" "}
          <code className="font-mono">scripts/sim-station.mjs</code>).
        </p>
      ) : null}
    </form>
  )
}
