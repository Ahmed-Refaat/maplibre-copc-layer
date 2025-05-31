import {
	CustomLayerInterface,
	CustomRenderMethodInput,
	Map as MapLibre,
} from 'maplibre-gl';
import * as THREE from 'three';

/**
 * Color modes available for point cloud rendering
 */
export type ColorMode = 'rgb' | 'height' | 'intensity' | 'white';

/**
 * Configuration options for the CopcLayer
 */
export interface CopcLayerOptions {
	/** Size of points in pixels (default: 6) */
	pointSize?: number;
	/** Color mode for rendering points (default: 'rgb') */
	colorMode?: ColorMode;
	/** Maximum number of nodes to keep in cache (default: 100) */
	maxCacheSize?: number;
	/** Screen space error threshold for level-of-detail (default: 8) */
	sseThreshold?: number;
	/** Whether to enable depth testing (default: true) */
	depthTest?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Required<CopcLayerOptions> = {
	pointSize: 6,
	colorMode: 'rgb',
	maxCacheSize: 100,
	sseThreshold: 8,
	depthTest: true,
} as const;

/**
 * A custom MapLibre layer for rendering Cloud-Optimized Point Cloud (COPC) data using Three.js
 *
 * This layer provides efficient rendering of large point cloud datasets by:
 * - Using web workers for data processing
 * - Implementing screen space error (SSE) based level-of-detail
 * - Caching loaded nodes for performance
 * - Supporting multiple color modes
 *
 * @example
 * ```typescript
 * import { ThreeLayer } from 'copc-viewer';
 *
 * const layer = new ThreeLayer('https://example.com/data.copc.laz', {
 *   pointSize: 8,
 *   colorMode: 'height',
 *   sseThreshold: 4
 * });
 *
 * map.addLayer(layer);
 * ```
 */
export class CopcLayer implements CustomLayerInterface {
	/** Layer identifier */
	readonly id: string;
	/** Layer type - always 'custom' */
	readonly type: 'custom' = 'custom';
	/** Rendering mode - always '3d' */
	readonly renderingMode: '3d' = '3d';
	/** URL to the COPC file */
	readonly url: string;

	/** Reference to the MapLibre map instance */
	public map?: MapLibre;
	/** Three.js camera */
	public readonly camera: THREE.Camera;
	/** Three.js scene */
	public readonly scene: THREE.Scene;
	/** Three.js renderer */
	public renderer?: THREE.WebGLRenderer;
	/** Web worker for processing COPC data */
	public readonly worker: Worker;

	/** Map of node IDs to Three.js Points objects */
	private readonly pointsMap: Record<string, THREE.Points> = {};
	/** Current configuration options */
	private readonly options: Required<CopcLayerOptions>;

	/** Current SSE threshold */
	private sseThreshold: number;
	/** List of currently visible node IDs */
	private visibleNodes: string[] = [];
	/** Cache for removed points to avoid recreation */
	private readonly pointCache: Map<string, THREE.Points> = new Map();
	/** Whether the worker has been initialized */
	private workerInitialized: boolean = false;

	/**
	 * Creates a new ThreeLayer instance
	 *
	 * @param url - URL to the COPC file to load
	 * @param options - Configuration options for the layer
	 * @param layerId - Optional custom layer ID (default: 'copc-layer')
	 */
	constructor(
		url: string,
		options: CopcLayerOptions = {},
		layerId: string = 'copc-layer',
	) {
		if (!url || typeof url !== 'string') {
			throw new Error('COPC URL is required and must be a string');
		}

		this.id = layerId;
		this.url = url;

		// Merge options with defaults
		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};
		this.sseThreshold =
			this.options.sseThreshold ?? DEFAULT_OPTIONS.sseThreshold;

		this.camera = new THREE.Camera();
		this.scene = new THREE.Scene();

		// Initialize the worker
		try {
			this.worker = new Worker(new URL('./worker/index.ts', import.meta.url), {
				type: 'module',
			});
			this.setupWorkerMessageHandlers();
		} catch (error) {
			throw new Error(
				`Failed to initialize worker: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private setupWorkerMessageHandlers() {
		this.worker.onmessage = (event) => {
			const message = event.data;

			switch (message.type) {
				case 'initialized':
					// Worker has initialized COPC data
					this.workerInitialized = true;
					this.worker.postMessage({ type: 'loadNode', node: '0-0-0-0' });
					this.map?.panTo(message.center);
					break;
				case 'nodeLoaded':
					// Node data loaded, create THREE.Points and add to scene if needed
					if (!message.alreadyLoaded) {
						// Create new points from the data
						this.createPoints(message.node, message.positions, message.colors);
					}
					this.updateScene();
					break;
				case 'nodesToLoad':
					// Update scene with the new maximum depth
					this.visibleNodes = message.nodes;
					this.updateScene();

					// Load one node at a time to avoid overwhelming the worker
					this.visibleNodes.forEach((node) => {
						this.worker.postMessage({
							type: 'loadNode',
							node,
						});
					});

					break;
				case 'error':
					console.error('Worker error:', message.message);
					break;
			}

			if (this.map) {
				this.map.triggerRepaint();
			}
		};

		this.worker.onerror = (error) => {
			console.error('Worker error event:', error);
		};
	}

	private updateScene() {
		// Prune cache if necessary
		this.pruneCache();

		// Remove ALL points from the scene
		this.scene.children.forEach((c) => this.scene.remove(c));

		// re-add
		this.visibleNodes.forEach((n) => {
			if (this.pointsMap[n]) this.scene.add(this.pointsMap[n]);
		});
	}

	private createPoints(
		node: string,
		positionsBuffer: ArrayBuffer,
		colorsBuffer: ArrayBuffer,
	) {
		const positions = new Float32Array(positionsBuffer);
		const colors = new Float32Array(colorsBuffer);

		// Create geometry and add attributes
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		// Create material with appropriate settings
		const material = this.createPointMaterial();

		// Create the points object and add to pointsMap
		this.pointsMap[node] = new THREE.Points(geometry, material);
	}

	/**
	 * Called when the layer is added to the map
	 * Initializes the Three.js renderer and starts loading COPC data
	 *
	 * @param map - The MapLibre map instance
	 * @param gl - The WebGL rendering context
	 */
	async onAdd(map: MapLibre, gl: WebGLRenderingContext): Promise<void> {
		this.map = map;

		try {
			// Initialize the worker with the COPC URL and options
			this.worker.postMessage({
				type: 'init',
				url: this.url,
				options: {
					colorMode: this.options.colorMode,
					maxCacheSize: this.options.maxCacheSize,
				},
			});

			// Setup renderer
			this.renderer = new THREE.WebGLRenderer({
				canvas: map.getCanvas(),
				context: gl,
			});
			this.renderer.autoClear = false;
		} catch (error) {
			console.error('Failed to initialize ThreeLayer:', error);
			throw error;
		}
	}

	/**
	 * Dynamically adjust the point size for all rendered points
	 *
	 * @param size - New point size in pixels (must be positive)
	 * @throws {Error} If size is not a positive number
	 */
	public setPointSize(size: number): void {
		if (typeof size !== 'number' || size <= 0 || !Number.isFinite(size)) {
			throw new Error('Point size must be a positive finite number');
		}

		this.options.pointSize = size;

		// Update all existing points
		Object.values(this.pointsMap).forEach((points) => {
			if (points.material instanceof THREE.PointsMaterial) {
				points.material.size = size;
				points.material.needsUpdate = true;
			}
		});

		if (this.map) {
			this.map.triggerRepaint();
		}
	}

	/**
	 * Set the Screen Space Error threshold for level-of-detail control
	 *
	 * Higher values show more detail (load more nodes), lower values show less detail.
	 * Typical range is 1-10.
	 *
	 * @param threshold - New SSE threshold (must be positive)
	 * @throws {Error} If threshold is not a positive number
	 */
	public setSseThreshold(threshold: number): void {
		if (
			typeof threshold !== 'number' ||
			threshold <= 0 ||
			!Number.isFinite(threshold)
		) {
			throw new Error('SSE threshold must be a positive finite number');
		}

		this.sseThreshold = threshold;
		this.options.sseThreshold = threshold;

		this.updatePoints();

		if (this.map) {
			this.map.triggerRepaint();
		}
	}

	/**
	 * Toggle depth testing for point rendering
	 *
	 * When enabled, points farther from the camera will be hidden behind
	 * closer points, providing proper 3D depth perception.
	 *
	 * @param enabled - Whether to enable depth testing
	 */
	public toggleDepthTest(enabled: boolean): void {
		if (typeof enabled !== 'boolean') {
			throw new Error('Depth test flag must be a boolean');
		}

		this.options.depthTest = enabled;

		// Update all existing points
		Object.values(this.pointsMap).forEach((points) => {
			if (points.material instanceof THREE.PointsMaterial) {
				points.material.depthTest = enabled;
				points.material.depthWrite = enabled;
				points.material.needsUpdate = true;
			}
		});

		if (this.map) {
			this.map.triggerRepaint();
		}
	}

	/**
	 * Update the visible points based on current camera position
	 * This method is called automatically during rendering
	 */
	private updatePoints(): void {
		if (!this.map || !this.workerInitialized) {
			return;
		}

		try {
			// Get camera position in world coordinates
			const cameraLngLat = this.map.transform.getCameraLngLat().toArray();
			const cameraAltitude = this.map.transform.getCameraAltitude();

			// Send camera information to worker to determine which nodes to load
			this.worker.postMessage({
				type: 'updatePoints',
				cameraPosition: [...cameraLngLat, cameraAltitude],
				mapHeight: this.map.transform.height,
				fov: this.map.transform.fov,
				sseThreshold: this.sseThreshold,
			});
		} catch (error) {
			console.error('Error updating points:', error);
		}
	}

	render(_: WebGLRenderingContext, options: CustomRenderMethodInput) {
		if (!this.map || !this.renderer) return;

		// Update camera projection matrix from map transform
		const m = new THREE.Matrix4().fromArray(
			options.defaultProjectionData.mainMatrix,
		);
		this.camera.projectionMatrix = m;

		// Update scene based on camera position
		this.updatePoints();

		// Render the scene
		this.renderer.resetState();
		this.renderer.render(this.scene, this.camera);

		this.map.triggerRepaint();
	}

	/**
	 * Called when the layer is removed from the map
	 * Cleans up all resources including the worker, geometry, and materials
	 *
	 * @param _map - The MapLibre map instance (unused)
	 * @param _gl - The WebGL rendering context (unused)
	 */
	onRemove(_map: MapLibre, _gl: WebGLRenderingContext): void {
		try {
			// Terminate the worker
			this.worker.terminate();

			// Remove all points from the scene and dispose resources
			Object.keys(this.pointsMap).forEach((node) => {
				const points = this.pointsMap[node];
				if (points) {
					this.scene.remove(points);
					this.disposePoints(points);
				}
			});

			// Dispose of cached points
			this.pointCache.forEach((points) => {
				this.disposePoints(points);
			});

			// Clear all collections
			Object.keys(this.pointsMap).forEach((key) => delete this.pointsMap[key]);
			this.visibleNodes.length = 0;
			this.pointCache.clear();
		} catch (error) {
			console.error('Error during layer cleanup:', error);
		}
	}

	/**
	 * Helper method to properly dispose of Three.js Points objects
	 *
	 * @param points - The Three.js Points object to dispose
	 */
	private disposePoints(points: THREE.Points): void {
		try {
			points.geometry.dispose();
			if (points.material instanceof THREE.Material) {
				points.material.dispose();
			}
		} catch (error) {
			console.warn('Error disposing points:', error);
		}
	}

	/**
	 * Prune the point cache to stay within the maximum cache size limit
	 * Removes the deepest (most detailed) nodes first
	 */
	private pruneCache(): void {
		// If cache size is within limits, do nothing
		if (this.pointCache.size <= this.options.maxCacheSize) {
			return;
		}

		// Get all cached nodes
		const cachedNodes = Array.from(this.pointCache.keys());

		// Sort by depth (higher depth = more detailed = remove first)
		cachedNodes.sort((a, b) => {
			const depthA = parseInt(a.split('-')[0]);
			const depthB = parseInt(b.split('-')[0]);
			return depthB - depthA;
		});

		// Remove nodes until cache is within size limit
		while (
			this.pointCache.size > this.options.maxCacheSize &&
			cachedNodes.length > 0
		) {
			const nodeToRemove = cachedNodes.shift()!;
			const points = this.pointCache.get(nodeToRemove);

			if (points) {
				this.disposePoints(points);
				this.pointCache.delete(nodeToRemove);

				console.log(
					`Removed from cache: ${nodeToRemove}, Cache size: ${this.pointCache.size}`,
				);
			}
		}
	}

	/**
	 * Creates a Three.js material for rendering points based on current options
	 *
	 * @returns A configured PointsMaterial
	 */
	private createPointMaterial(): THREE.PointsMaterial {
		const material = new THREE.PointsMaterial({
			vertexColors: this.options.colorMode !== 'white',
			size: this.options.pointSize,
			depthTest: this.options.depthTest,
			depthWrite: this.options.depthTest,
			sizeAttenuation: true,
		});

		// Set white color if specified
		if (this.options.colorMode === 'white') {
			material.color.setHex(0xffffff);
		}

		return material;
	}

	/**
	 * Get the current point size
	 *
	 * @returns Current point size in pixels
	 */
	public getPointSize(): number {
		return this.options.pointSize;
	}

	/**
	 * Get the current color mode
	 *
	 * @returns Current color mode
	 */
	public getColorMode(): ColorMode {
		return this.options.colorMode;
	}

	/**
	 * Get the current SSE threshold
	 *
	 * @returns Current SSE threshold
	 */
	public getSseThreshold(): number {
		return this.sseThreshold;
	}

	/**
	 * Get whether depth testing is enabled
	 *
	 * @returns True if depth testing is enabled
	 */
	public isDepthTestEnabled(): boolean {
		return this.options.depthTest;
	}

	/**
	 * Get the current configuration options
	 *
	 * @returns A copy of the current options
	 */
	public getOptions(): Readonly<CopcLayerOptions> {
		return { ...this.options };
	}

	/**
	 * Check if the layer is currently loading data
	 *
	 * @returns True if the worker has been initialized and is processing
	 */
	public isLoading(): boolean {
		return this.workerInitialized;
	}

	/**
	 * Get statistics about the currently loaded nodes
	 *
	 * @returns Object containing node statistics
	 */
	public getNodeStats(): { loaded: number; visible: number; cached: number } {
		return {
			loaded: Object.keys(this.pointsMap).length,
			visible: this.visibleNodes.length,
			cached: this.pointCache.size,
		};
	}
}
