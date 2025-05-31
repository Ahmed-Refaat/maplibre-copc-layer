/**
 * COPC Viewer - A library for loading and rendering Cloud-Optimized Point Cloud (COPC) data in MapLibre GL JS
 *
 * @packageDocumentation
 */

export { CopcLayer, type CopcLayerOptions, type ColorMode } from './copclayer';
export { computeScreenSpaceError } from './worker/sse';

// Re-export commonly used types from dependencies
export type {
	CustomLayerInterface,
	CustomRenderMethodInput,
	Map as MapLibreMap,
} from 'maplibre-gl';
