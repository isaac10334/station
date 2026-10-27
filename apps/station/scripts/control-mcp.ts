/** Generated MCP adapter. Policy belongs to application dispatch; annotations never authorize. */
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { z, versionSchema, type OperationDescription } from "@station/protocol";
import type { ControlBackend } from "./control-backends";
/** JSON Schema refs are document-relative. Embedding an operation under params
 * must relocate both recursive root refs and $defs refs to that same subtree. */
export function operationParameterSchema(value:unknown):any {
  if(Array.isArray(value))return value.map(operationParameterSchema);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='$ref'&&typeof child==='string'&&child.startsWith('#')?'#/properties/params'+child.slice(1):operationParameterSchema(child)]));
}
export async function createControlMcp(backend: ControlBackend) {
  const server = new McpServer({ name: "station", version: "0.1.0" });
  const { result: commands } = await backend.execute({
    method: "commands.list",
  });
  for (const command of commands as OperationDescription[])
    server.registerTool(
      `station_${command.method.replaceAll(".", "_")}`,
      {
        description: `${command.description}. Mutations require the version from station_state_inspect.`,
        inputSchema: fromJsonSchema<{
          params?: unknown;
          version?: z.infer<typeof versionSchema>;
          requestId?: string;
        }>({
          type: "object",
          properties: {
            params: operationParameterSchema(command.schema),
            version: JSON.parse(JSON.stringify(z.toJSONSchema(versionSchema))),
            requestId: { type: "string", minLength: 1, maxLength: 200 },
          },
          additionalProperties: false,
        }),
        outputSchema: z.object({
          revision: z.number(),
          version: versionSchema,
          result: z.json(),
        }),
        annotations: {
          readOnlyHint: command.effects.length === 0,
          destructiveHint: command.effects.some(
            (e) => e.includes("write") || e.includes("install"),
          ),
        },
      },
      async (input) => {
        try {
          const { ok, ...output } = await backend.execute({
            method: command.method,
            params: input.params ?? {},
            ...(input.version ? { version: input.version } : {}),
            requestId: input.requestId ?? crypto.randomUUID(),
          });
          return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: (error as any).code ?? "command_failed",
                  message:
                    error instanceof Error ? error.message : "Command failed",
                }),
              },
            ],
          };
        }
      },
    );
  server.registerResource(
    "station-state",
    "station://state",
    {
      description: "Authorized metadata; excludes source/settings/credentials",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            await backend.execute({ method: "state.inspect" }),
          ),
        },
      ],
    }),
  );
  return server;
}
