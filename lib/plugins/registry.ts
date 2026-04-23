import { getPluginState, savePluginState } from "@/lib/runtime/db";
import { mcpService } from "@/lib/mcp/service";
import type { Plugin, PluginTool } from "@/lib/types/runtime";

const builtInTools = (mode: string): PluginTool[] => [
  {
    name: `${mode}.explain`,
    description: `Explain why ${mode} friction is being applied.`,
    parameters: {
      eventId: {
        type: "string",
        description: "The event being inspected.",
        required: true,
      },
    },
  },
];

const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: "system-friction-core",
    name: "Friction Core",
    version: "1.0.0",
    description: "Built-in friction engines for Shield, Kiln, Quarry, and Lab.",
    author: "Stayhand",
    source: "system",
    enabled: true,
    tools: [
      ...builtInTools("shield"),
      ...builtInTools("kiln"),
      ...builtInTools("quarry"),
      ...builtInTools("lab"),
    ],
  },
  {
    id: "system-demo-adapters",
    name: "Demo Adapters",
    version: "1.0.0",
    description: "Built-in adapter surfaces that keep the workspace usable with zero MCP servers.",
    author: "Stayhand",
    source: "system",
    enabled: true,
    tools: [
      {
        name: "adapter.pushDemoEvent",
        description: "Push a demo event into the live queue for the selected connector.",
        parameters: {
          sourceId: {
            type: "string",
            description: "The connector ID to simulate.",
            required: true,
          },
        },
      },
    ],
  },
];

export class PluginRegistry {
  private static instance: PluginRegistry | null = null;

  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  async getPlugins(): Promise<Plugin[]> {
    const dynamicPlugins = await this.getMcpPlugins();
    return [...BUILTIN_PLUGINS, ...dynamicPlugins].map((plugin) => ({
      ...plugin,
      enabled: getPluginState(plugin.id) ?? plugin.enabled,
    }));
  }

  async toggle(id: string, enabled: boolean): Promise<Plugin | null> {
    savePluginState(id, enabled);
    const plugin = (await this.getPlugins()).find((item) => item.id === id) || null;
    return plugin ? { ...plugin, enabled } : null;
  }

  private async getMcpPlugins(): Promise<Plugin[]> {
    const servers = await mcpService.getServers();
    return servers.map((server) => ({
      id: `mcp-${server.name}`,
      name: `MCP: ${server.name}`,
      version: "1.0.0",
      description: server.running
        ? `Dynamic tools from MCP server ${server.name}.`
        : `MCP server ${server.name} is configured but not running.`,
      author: "MCP",
      source: "mcp" as const,
      enabled: true,
      tools: server.tools.map((tool) => ({
        name: tool.fullName,
        description: tool.description,
        parameters: Object.fromEntries(
          Object.entries(tool.inputSchema?.properties || {}).map(([name, schema]) => [
            name,
            {
              type: normalizeType(schema.type),
              description: schema.description || "",
              required: Boolean(tool.inputSchema?.required?.includes(name)),
              enum: schema.enum,
            },
          ])
        ),
      })),
    }));
  }
}

function normalizeType(value: string | undefined): PluginTool["parameters"][string]["type"] {
  if (value === "number" || value === "boolean" || value === "array" || value === "object") {
    return value;
  }
  return "string";
}

export const pluginRegistry = PluginRegistry.getInstance();
