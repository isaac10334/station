import { useChatServices } from "../../chat-services";
import { useEffect, useRef, useState } from "react";
import {
  formatModelPrice,
  type ModelCatalog,
  type CatalogModel,
} from "../../../features/ai/contracts/catalog";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Expanded discovery never sends the key or implies account eligibility. */
export function ChatModelCatalog({
  onSelect,
  onCatalog,
}: {
  onSelect: (id: string) => void;
  onCatalog: (models: readonly CatalogModel[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { catalog: service } = useChatServices();
  const [catalog, setCatalog] = useState<ModelCatalog>(() =>
    service.cached(),
  );
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    void service
      .load(controller.signal, refresh > 0)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCatalog(result);
          onCatalog(result.models);
          setLoading(false);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, refresh, onCatalog]);
  const matches = catalog.models.filter((m) =>
    `${m.name} ${m.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const select = (id: string) => {
    onSelect(id);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" aria-label="Browse all models">
            …
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gateway models</DialogTitle>
          <DialogDescription>
            Public catalog, not account eligibility. Base USD per million input
            / output tokens. Context tiers, caching, reasoning and service tiers
            can change charges.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-5 py-2">
          <Input
            aria-label="Search models or enter custom ID"
            placeholder="Search or provider/model-id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span role="status">
              {loading
                ? "Refreshing public catalog…"
                : `${catalog.source} · ${new Date(catalog.fetchedAt).toLocaleString()}`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => setRefresh((n) => n + 1)}
            >
              Refresh
            </Button>
          </div>
          {/^[\w.-]+\/[\w./:-]+$/.test(query.trim()) &&
            query.trim().length <= 200 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => select(query.trim())}
              >
                Use custom ID: {query.trim()}
              </Button>
            )}
        </div>
        <DialogBody className="max-h-[50vh]">
          <p className="pb-2 text-xs text-fg-3">
            {matches.length} matches
            {matches.length > 100
              ? " · showing first 100; refine your search"
              : ""}
          </p>
          <div className="space-y-1">
            {matches.slice(0, 100).map((model) => (
              <Button
                key={model.id}
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                onClick={() => select(model.id)}
              >
                <span className="min-w-0 break-words">
                  <span className="block">{model.name}</span>
                  <span className="block text-xs text-fg-3">
                    {model.id} · ${formatModelPrice(model.input)} / $
                    {formatModelPrice(model.output)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
