// Sprint 86: Platform Plugin — base interface for all platform plugins
// Every plugin implements this interface. No plugin imports concrete services.

export interface PlatformPlugin {
  /** Unique plugin identifier */
  id: string;
  /** Semantic version */
  version: string;
  /** Plugin display name */
  name: string;
  /** Other plugin IDs this plugin depends on */
  dependencies: string[];
  /** Initialize the plugin with platform services */
  initialize(context: PluginContext): void | Promise<void>;
  /** Clean up plugin resources */
  dispose(): void | Promise<void>;
}

/** Services available to plugins during initialization */
export interface PluginContext {
  /** Platform event bus for pub/sub */
  eventBus: {
    subscribe: (eventType: string, handler: (event: unknown) => void) => () => void;
    publish: (event: unknown) => void;
  };
  /** Structured logger */
  logger: {
    info: (meta: Record<string, unknown>, msg: string) => void;
    warn: (meta: Record<string, unknown>, msg: string) => void;
    error: (meta: Record<string, unknown>, msg: string) => void;
  };
  /** Platform configuration (read-only) */
  config: Record<string, unknown>;
  /** Plugin registry for dependency resolution */
  registry: PluginRegistry;
}

/** Plugin registry interface */
export interface PluginRegistry {
  register(plugin: PlatformPlugin): void;
  unregister(pluginId: string): void;
  getPlugin<T extends PlatformPlugin>(pluginId: string): T | undefined;
  getPlugins(): PlatformPlugin[];
  getPluginsByTag(tag: string): PlatformPlugin[];
}
