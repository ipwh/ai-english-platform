// Sprint 86: Plugin Loader — loads and initializes domain-specific plugins

import type { PlatformPlugin, PluginContext } from './plugin';
import { pluginRegistry } from './plugin-registry';
import { platformEventBus } from '../events/in-memory-event-bus';
import { logger } from '@/shared/logger/logger';
import { config } from '@/shared/config/config';

/** Build the plugin context with all platform services */
function buildPluginContext(): PluginContext {
  return {
    eventBus: {
      subscribe: (eventType, handler) => platformEventBus.subscribe(eventType, handler as any),
      publish: (event) => platformEventBus.publish(event as any),
    },
    logger: {
      info: (meta, msg) => logger.info(meta, msg),
      warn: (meta, msg) => logger.warn(meta, msg),
      error: (meta, msg) => logger.error(meta, msg),
    },
    config: config as unknown as Record<string, unknown>,
    registry: pluginRegistry,
  };
}

/** Load and initialize all registered plugins */
export async function loadAllPlugins(): Promise<void> {
  const context = buildPluginContext();
  const plugins = pluginRegistry.getPlugins();

  // Sort by dependencies (simple topological: deps first)
  const loaded = new Set<string>();
  const load = async (plugin: PlatformPlugin): Promise<void> => {
    if (loaded.has(plugin.id)) return;
    for (const depId of plugin.dependencies) {
      const dep = pluginRegistry.getPlugin(depId);
      if (dep) await load(dep);
    }
    await Promise.resolve(plugin.initialize(context));
    loaded.add(plugin.id);
    logger.info({ module: 'plugin-loader', pluginId: plugin.id }, 'Plugin initialized');
  };

  for (const plugin of plugins) {
    if (!loaded.has(plugin.id)) {
      try {
        await load(plugin);
      } catch (err) {
        logger.error({ module: 'plugin-loader', pluginId: plugin.id, error: String(err) }, 'Plugin initialization failed');
      }
    }
  }

  logger.info({ module: 'plugin-loader', loadedCount: loaded.size, totalCount: plugins.length }, 'Plugin loading complete');
}

/** Dispose all plugins */
export async function disposeAllPlugins(): Promise<void> {
  for (const plugin of pluginRegistry.getPlugins()) {
    try {
      await Promise.resolve(plugin.dispose());
    } catch (err) {
      logger.error({ module: 'plugin-loader', pluginId: plugin.id, error: String(err) }, 'Plugin disposal failed');
    }
  }
  logger.info({ module: 'plugin-loader' }, 'All plugins disposed');
}
