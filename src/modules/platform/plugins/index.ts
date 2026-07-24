// Sprint 86: Platform Plugins — barrel exports

export type { PlatformPlugin, PluginContext, PluginRegistry } from './plugin';
export { pluginRegistry } from './plugin-registry';
export { loadAllPlugins, disposeAllPlugins } from './plugin-loader';
