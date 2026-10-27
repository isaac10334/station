import { useState } from "react";
import { ArrowRight, Box, ShieldCheck } from "lucide-react";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent } from "./components/ui/dialog";
import { AccountSettings } from "./components/workspace/account-settings";
import { useAccount } from "./lib/use-account";

export type DemoIdentity = { kind: "guest" | "demo"; email?: string };

export function Onboarding({ onContinue }: { onContinue: (identity: DemoIdentity) => void }) {
  const [signingIn, setSigningIn] = useState(false);
  const account = useAccount();
  return <Dialog open dismissible={false} onOpenChange={() => {}}><DialogContent size="md" showCloseButton={false} className="onboarding-card" backdropClassName="onboarding-dialog-backdrop" aria-label="Enter Station">
    <div className="onboarding-mark"><Box size={24} /></div>
    {!signingIn ? <><h1>Make a space for what you build.</h1><p>Open your personal workspace to create Rust Components, inspect capabilities, and arrange your dashboard.</p>
      <div className="onboarding-actions"><Button onClick={() => onContinue({ kind: "guest" })}>Continue as guest <ArrowRight size={16} /></Button>{account.enabled && <Button variant="outline" onClick={() => setSigningIn(true)}>Sign in</Button>}</div>
      <div className="onboarding-honesty"><ShieldCheck size={15} /> Your desks and assets stay in this browser for now.</div></>
      : <><button className="onboarding-back" onClick={() => setSigningIn(false)}>← All options</button><div className="text-left"><AccountSettings /></div></>}
  </DialogContent></Dialog>;
}
