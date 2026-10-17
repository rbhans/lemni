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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Icon } from "@/studio/shell/icon"

import { sctApi } from "../client/api"
import {
  connect,
  forgetProfile,
  SCT_ICON,
  sctConnectionError,
  sctProfiles,
  type SctProfile,
} from "../client/store"

const EMPTY: SctProfile = {
  server: "",
  port: 1433,
  username: "",
  trustCertificate: true,
  database: "",
}

export function ConnectForm() {
  const profiles = useValue(sctProfiles)
  const lostMessage = useValue(sctConnectionError)
  const [profile, setProfile] = useState<SctProfile>(profiles[0] ?? EMPTY)
  const [password, setPassword] = useState("")
  const [archives, setArchives] = useState<string[] | null>(null)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<SctProfile>) => {
    setProfile((p) => ({ ...p, ...patch }))
    // A different server or login has different archives.
    if (!("database" in patch)) setArchives(null)
  }

  const { database, ...server } = profile

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!archives) {
        const found = (await sctApi.archives(server, password)).archives
        setArchives(found)
        if (!found.length)
          setError("No SCT archives on this server (or this login can't see them).")
        else if (!found.includes(database)) update({ database: found[0] })
      } else {
        await connect(server, password, database, remember)
        setPassword("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.")
    } finally {
      setBusy(false)
    }
  }

  const message = error ?? lostMessage

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-3">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Open an SCT archive restored to SQL Server. Lemscape only reads it.
      </p>

      {profiles.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Recent servers
          </span>
          {profiles.map((saved) => {
            const active =
              saved.server === profile.server &&
              saved.port === profile.port &&
              saved.username === profile.username
            return (
              <div
                key={`${saved.server}|${saved.port}|${saved.username}`}
                className={cn(
                  "group flex items-center gap-2 rounded-md border px-2 py-1.5",
                  active ? "border-ring bg-muted/60" : "hover:bg-muted/40"
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    setProfile(saved)
                    setArchives(null)
                  }}
                >
                  <Icon
                    icon={SCT_ICON}
                    className="size-3.5 text-muted-foreground"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">
                      {saved.database || saved.server}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {saved.username} · {saved.server}:{saved.port}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Forget this server"
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
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field>
            <FieldLabel htmlFor="sct-server">SQL Server</FieldLabel>
            <Input
              id="sct-server"
              required
              placeholder="127.0.0.1"
              value={profile.server}
              onChange={(e) => update({ server: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sct-port">Port</FieldLabel>
            <Input
              id="sct-port"
              required
              inputMode="numeric"
              value={String(profile.port)}
              onChange={(e) =>
                update({ port: Number(e.target.value.replace(/\D/g, "")) || 0 })
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="sct-user">Username</FieldLabel>
            <Input
              id="sct-user"
              required
              autoComplete="username"
              value={profile.username}
              onChange={(e) => update({ username: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sct-password">Password</FieldLabel>
            <Input
              id="sct-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setArchives(null)
              }}
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Switch
            id="sct-trust"
            checked={profile.trustCertificate}
            onCheckedChange={(checked) => update({ trustCertificate: checked })}
          />
          <FieldLabel htmlFor="sct-trust" className="font-normal">
            Trust the server certificate
          </FieldLabel>
        </Field>
        {profile.trustCertificate ? (
          <FieldDescription className="-mt-1 text-[11px]">
            SQL Express and SCT installs use a self-signed certificate. The
            traffic is still encrypted, but the server isn&apos;t verified: use
            on a network you trust.
          </FieldDescription>
        ) : null}

        {archives?.length ? (
          <Field>
            <FieldLabel>Archive</FieldLabel>
            <Select
              value={database}
              onValueChange={(next) => {
                if (typeof next === "string") update({ database: next })
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an archive">
                  {database || "Choose an archive"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {archives.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field orientation="horizontal">
          <Switch
            id="sct-remember"
            checked={remember}
            onCheckedChange={setRemember}
          />
          <FieldLabel htmlFor="sct-remember" className="font-normal">
            Remember server and username (never the password)
          </FieldLabel>
        </Field>
      </FieldGroup>

      {message ? (
        <p
          role="alert"
          className="flex gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11.5px] text-destructive"
        >
          <Icon icon={Alert02Icon} className="mt-px size-3.5 shrink-0" />
          {message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={busy || (archives !== null && !database)}
        className="h-8"
      >
        {busy
          ? archives
            ? "Opening…"
            : "Looking…"
          : archives?.length
            ? "Open archive"
            : "Find archives"}
      </Button>
    </form>
  )
}
