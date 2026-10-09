import { useState } from "react";
import { ArrowRight, Box, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SignInFlow } from "@/components/ui/sign-in-flow";

export type DemoIdentity = { kind: "guest" | "demo"; email?: string };

export function Onboarding({ onContinue }: { onContinue: (identity: DemoIdentity) => void }) {
  const [signingIn, setSigningIn] = useState(false);
  return <Dialog open dismissible={false} onOpenChange={() => {}}><DialogContent size="md" showCloseButton={false} className="onboarding-card" backdropClassName="onboarding-dialog-backdrop" aria-label="Enter Station">
    <div className="onboarding-mark"><Box size={24} /></div>
    <div className="eyebrow">STATION</div>
    {!signingIn ? <><h1>Make a space for what you build.</h1><p>Open your personal workspace to create Rust Components, inspect capabilities, and arrange your dashboard.</p>
      <div className="onboarding-actions"><Button onClick={() => onContinue({ kind: "guest" })}>Continue as guest <ArrowRight size={16} /></Button><Button variant="outline" onClick={() => setSigningIn(true)}><Mail size={16} /> Demo sign in</Button></div>
      <div className="onboarding-honesty"><ShieldCheck size={15} /> Guest and demo identities stay on this device. Account services are not connected yet.</div></>
      : <><button className="onboarding-back" onClick={() => setSigningIn(false)}>← All options</button><div className="demo-code-note">Demo sign in: no email is sent. Enter any email, then use code <strong>123456</strong>.</div><SignInFlow title="Try a demo identity" description="Explore the sign in flow without an account service." codeIntro={{ title: "Enter demo code", description: "Use code 123456 for", announcement: (email) => `Enter demo code 123456 for ${email}` }} defaultMethod="code" onEmailSubmit={() => "code" as const} onCodeSubmit={async (_email, code) => { if (code !== "123456") throw new Error("Use the demo code 123456."); }} onSuccess={(email) => onContinue({ kind: "demo", email })} /></>}
  </DialogContent></Dialog>;
}
