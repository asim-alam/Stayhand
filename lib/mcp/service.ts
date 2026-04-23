import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig, MCPServerStatus, MCPToolInfo } from "@/lib/types/runtime";
import { getSavedMcpServers, removeMcpServer, saveMcpServer } from "@/lib/runtime/db";

type ConnectionRecord = {
  client: Client;
  transport: SSEClientTransport | StdioClientTransport | StreamableHTTPClientTransport;
  tools: MCPToolInfo[];
  error: string | null;
};

function inferType(config: MCPServerConfig): NonNullable<MCPServerConfig["type"]> {
  if (config.type) {
    return config.type;
  }
  if (config.command) {
    return "stdio";
  }
  return "http";
}

export class MCPService {
  private static instance: MCPService | null = null;
  private configs = new Map<string, MCPServerConfig>();
  private connections = new Map<string, ConnectionRecord>();
  private booted = false;

  static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  private constructor() {
    for (const config of getSavedMcpServers()) {
      this.configs.set(config.name, config);
    }
  }

  async bootAutoStart(): Promise<void> {
    if (this.booted) {
      return;
    }
    this.booted = true;
    const autoStart = [...this.configs.values()].filter((config) => config.autoStart !== false);
    for (const config of autoStart) {
      await this.startServer(config.name).catch(() => undefined);
    }
  }

  async getServers(): Promise<MCPServerStatus[]> {
    await this.bootAutoStart();
    const statuses: MCPServerStatus[] = [];
    for (const config of this.configs.values()) {
      const connection = this.connections.get(config.name);
      statuses.push({
        name: config.name,
        running: Boolean(connection),
        tools: connection?.tools || [],
        error: connection?.error || null,
        config,
        process:
          connection?.transport instanceof StdioClientTransport
            ? { pid: connection.transport.pid }
            : { pid: null },
      });
    }
    return statuses;
  }

  async addServer(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    if (!config.name) {
      return { success: false, error: "Server name is required." };
    }
    if (!config.command && !config.url) {
      return { success: false, error: "Provide either a command or a URL." };
    }
    const normalized = {
      ...config,
      type: inferType(config),
    } satisfies MCPServerConfig;
    this.configs.set(normalized.name, normalized);
    saveMcpServer(normalized);
    if (normalized.autoStart !== false) {
      return this.startServer(normalized.name);
    }
    return { success: true };
  }

  async removeServer(name: string): Promise<{ success: boolean; error?: string }> {
    await this.stopServer(name);
    this.configs.delete(name);
    removeMcpServer(name);
    return { success: true };
  }

  async toggleServer(name: string): Promise<{ success: boolean; running: boolean; error?: string }> {
    if (this.connections.has(name)) {
      await this.stopServer(name);
      return { success: true, running: false };
    }
    const result = await this.startServer(name);
    return { success: result.success, running: result.success, error: result.error };
  }

  async listAllTools(): Promise<MCPToolInfo[]> {
    await this.bootAutoStart();
    const servers = await this.getServers();
    return servers.flatMap((server) => server.tools);
  }

  async executeTool(fullName: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: string; error?: string }> {
    const [serverName, toolName] = fullName.split(":");
    if (!serverName || !toolName) {
      return { success: false, error: "Tool identifier must use server:tool format." };
    }

    const connection = await this.ensureConnection(serverName);
    if (!connection) {
      return { success: false, error: `Server ${serverName} is not running.` };
    }

    try {
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });
      return {
        success: true,
        result: JSON.stringify(result, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed.",
      };
    }
  }

  getRunningCount(): number {
    return this.connections.size;
  }

  private async startServer(name: string): Promise<{ success: boolean; error?: string }> {
    const config = this.configs.get(name);
    if (!config) {
      return { success: false, error: `Unknown MCP server: ${name}` };
    }
    if (this.connections.has(name)) {
      return { success: true };
    }

    try {
      const client = new Client({
        name: "stayhand",
        version: "1.0.0",
      });
      const transport = this.createTransport(config);
      await client.connect(transport);
      const list = await client.listTools();
      const tools: MCPToolInfo[] = list.tools.map((tool) => ({
        server: config.name,
        name: tool.name,
        fullName: `${config.name}:${tool.name}`,
        description: tool.description || "MCP tool",
        inputSchema: tool.inputSchema
          ? {
              type: String(tool.inputSchema.type || "object"),
              properties: Object.fromEntries(
                Object.entries(tool.inputSchema.properties || {}).map(([key, value]) => {
                  const schema = value as {
                    type?: string;
                    description?: string;
                    enum?: string[];
                    default?: unknown;
                  };
                  return [
                    key,
                    {
                      type: schema.type || "string",
                      description: schema.description,
                      enum: schema.enum,
                      default: schema.default,
                    },
                  ];
                })
              ),
              required: tool.inputSchema.required,
            }
          : undefined,
      }));
      this.connections.set(name, {
        client,
        transport,
        tools,
        error: null,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unable to start MCP server.",
      };
    }
  }

  private async stopServer(name: string): Promise<void> {
    const record = this.connections.get(name);
    if (!record) {
      return;
    }
    await record.transport.close();
    this.connections.delete(name);
  }

  private async ensureConnection(name: string): Promise<ConnectionRecord | null> {
    const existing = this.connections.get(name);
    if (existing) {
      return existing;
    }
    const result = await this.startServer(name);
    if (!result.success) {
      return null;
    }
    return this.connections.get(name) || null;
  }

  private createTransport(config: MCPServerConfig): SSEClientTransport | StdioClientTransport | StreamableHTTPClientTransport {
    const type = inferType(config);
    if (type === "stdio") {
      if (!config.command) {
        throw new Error(`MCP server ${config.name} is missing a command.`);
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: "pipe",
      });
    }
    if (!config.url) {
      throw new Error(`MCP server ${config.name} is missing a URL.`);
    }
    const url = new URL(config.url);
    if (type === "sse") {
      return new SSEClientTransport(url);
    }
    return new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: config.headers,
      },
    });
  }
}

export const mcpService = MCPService.getInstance();
