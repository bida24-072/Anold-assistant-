import { z } from "zod";
import { LLMToolDefinition, ToolCallRequest, ToolCallResult } from "@/types";

/**
 * A Tool pairs:
 *  - a Zod schema (runtime argument validation)
 *  - a JSON-schema-shaped definition (what we send to the LLM for function calling)
 *  - an executor function that performs the real side effect
 *
 * This is the single source of truth: define a tool once here, and it is
 * simultaneously advertised to the model and safely dispatched at runtime.
 */
export interface Tool<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  schema: z.ZodType<TArgs>;
  /** JSON schema properties matching the zod schema shape, for Gemini function declarations */
  jsonSchemaProperties: Record<string, unknown>;
  requiredFields: string[];
  execute: (args: TArgs) => Promise<string>;
}

class ToolRegistryImpl {
  private tools = new Map<string, Tool<any>>();

  register<T>(tool: Tool<T>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`[ToolRegistry] Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  getDefinitions(): LLMToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.jsonSchemaProperties,
        required: tool.requiredFields,
      },
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(request: ToolCallRequest): Promise<ToolCallResult> {
    const tool = this.tools.get(request.toolName);
    if (!tool) {
      return {
        id: request.id,
        toolName: request.toolName,
        success: false,
        result: "",
        error: `Unknown tool "${request.toolName}". Available tools: ${this.list().join(", ")}`,
      };
    }

    const parsed = tool.schema.safeParse(request.arguments);
    if (!parsed.success) {
      return {
        id: request.id,
        toolName: request.toolName,
        success: false,
        result: "",
        error: `Invalid arguments for "${request.toolName}": ${parsed.error.message}`,
      };
    }

    try {
      const result = await tool.execute(parsed.data);
      return {
        id: request.id,
        toolName: request.toolName,
        success: true,
        result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: request.id,
        toolName: request.toolName,
        success: false,
        result: "",
        error: `Tool "${request.toolName}" threw an error: ${message}`,
      };
    }
  }
}

export const ToolRegistry = new ToolRegistryImpl();
