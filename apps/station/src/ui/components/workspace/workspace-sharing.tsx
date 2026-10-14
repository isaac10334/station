import { useEffect, useState, useSyncExternalStore } from "react";
import { sharing } from "../../../composition";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { IconAction } from "../ui/icon-action";
import { Share, Copy } from "../../lib/icons";

/** Invitation UI owns transient form state; the connection service owns membership and source sync. */
export function WorkspaceSharing() {
  const state = useSyncExternalStore(sharing.subscribe, sharing.get);
  const [open, setOpen] = useState(() => location.hash.startsWith("#share=")),
    [name, setName] = useState(""),
    [role, setRole] = useState<"viewer" | "editor">("editor"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const invitation = location.hash.startsWith("#share=") ? location.href : null;
  useEffect(() => {
    const pointer = (event: PointerEvent) =>
      sharing.presence(event.clientX / innerWidth, event.clientY / innerHeight);
    window.addEventListener("pointermove", pointer, { passive: true });
    return () => window.removeEventListener("pointermove", pointer);
  }, []);
  return (
    <>
      <IconAction
        label="Share workspace"
        className={`size-8 border-transparent ${state.status === "connected" ? "bg-selected text-fg" : "bg-transparent"}`}
        aria-pressed={state.status === "connected"}
        onClick={() => setOpen(true)}
      >
        <Share />
      </IconAction>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {invitation ? "Join a workspace" : "Share workspace"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {state.status === "offline" ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-fg-2">
                  {invitation
                    ? "Join with your own desk. Shared sources stay synchronized; layout and runtime permissions stay local."
                    : "Invite someone to edit shared source on a separate desk. This prototype runs on this Station server and ends when you stop sharing."}
                </p>
                <label className="flex flex-col gap-2 text-xs text-fg-2">
                  Your name
                  <Input
                    value={name}
                    maxLength={48}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </label>
                {!invitation && (
                  <label className="flex flex-col gap-2 text-xs text-fg-2">
                    Invitation access
                    <NativeSelect
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value as "editor" | "viewer")
                      }
                    >
                      <option value="editor">
                        Read and edit shared source
                      </option>
                      <option value="viewer">View shared source</option>
                    </NativeSelect>
                  </label>
                )}
                <p className="text-xs text-fg-3">
                  No credentials, Component grants, artifacts, or installations
                  are shared. Room data lasts one hour in server memory.
                  Cross-device use needs a reachable server; use HTTPS outside
                  local testing.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p role="status" className="text-sm">
                  {state.status === "connecting"
                    ? "Connecting…"
                    : `Connected as ${state.role}`}
                </p>
                {state.invite && (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Invitation link"
                      value={state.invite}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <IconAction
                      label={copied ? "Copied invitation" : "Copy invitation"}
                      onClick={async () => {
                        try {
                          if (!navigator.clipboard)
                            throw new Error("Clipboard unavailable");
                          await navigator.clipboard.writeText(state.invite!);
                          setCopied(true);
                        } catch {
                          setError("Select and copy the invitation link.");
                        }
                      }}
                    >
                      <Copy />
                    </IconAction>
                  </div>
                )}
                <ul aria-label="Participants" className="space-y-3">
                  {state.participants.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>
                        {member.name}
                        {member.id === state.memberId ? " (you)" : ""}
                        <span className="ml-2 text-xs text-fg-3">
                          {member.role}
                        </span>
                      </span>
                      <span className="text-xs text-fg-2">{member.desk}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-fg-3">
                  Cursors are presence indicators across separate desks. This is
                  revision-checked source sharing, not character-level
                  collaborative editing.
                </p>
              </div>
            )}
            {(error || state.error) && (
              <p role="alert" className="mt-4 text-xs text-danger">
                {error || state.error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            {state.status !== "offline" && (
              <Button
                variant="outline"
                onClick={() => {
                  sharing.stop();
                  setOpen(false);
                }}
              >
                {state.role === "owner" ? "Stop sharing" : "Leave workspace"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            {state.status === "offline" && (
              <Button
                disabled={!name.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (invitation) sharing.join(invitation, name);
                    else await sharing.host(name, role);
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Starting…"
                  : invitation
                    ? "Join workspace"
                    : "Create invitation"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state.status === "connected" &&
        state.participants
          .filter((member) => member.id !== state.memberId && member.cursor)
          .map((member, index) => (
            <div
              key={member.id}
              aria-label={`${member.name} cursor`}
              className="pointer-events-none fixed z-50 text-xs"
              style={{
                left: `${member.cursor!.x * 100}%`,
                top: `${member.cursor!.y * 100}%`,
                color: ["#e9b48b", "#9bcca4", "#dda4a8"][index % 3],
              }}
            >
              <svg
                width="16"
                height="20"
                viewBox="0 0 16 20"
                fill="currentColor"
                aria-hidden
              >
                <path d="M1 1v15l4-4 3 6 3-2-3-5h6z" />
              </svg>
              <span className="ml-3 rounded-md border border-line-2 bg-raised px-2 py-1 text-fg">
                {member.name} · {member.desk}
              </span>
            </div>
          ))}
    </>
  );
}
