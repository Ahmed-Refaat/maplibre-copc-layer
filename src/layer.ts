import {
	CustomLayerInterface,
	Map as MapLibre,
	MercatorCoordinate,
} from 'maplibre-gl';
import * as THREE from 'three';
import { Copc, Hierarchy } from 'copc';
import proj4 from 'proj4';

export class ThreeLayer implements CustomLayerInterface {
	id: string;
	type: 'custom';
	renderingMode: '3d';
	url: string;

	private camera: THREE.Camera;
	private scene: THREE.Scene;
	private renderer?: THREE.WebGLRenderer;
	private map?: MapLibre;
	private center?: { lng: number; lat: number };

	private copc: Copc;
	private nodes: Hierarchy.Node.Map;

	constructor(url: string) {
		this.id = 'three_layer';
		this.type = 'custom';
		this.renderingMode = '3d';
		this.url = url;

		this.camera = new THREE.Camera();
		this.scene = new THREE.Scene();
	}

	async onAdd(map: MapLibre, gl: WebGLRenderingContext) {
		this.map = map;

		// Load COPC data
		this.copc = await Copc.create(this.url);
		const { nodes } = await Copc.loadHierarchyPage(
			this.url,
			this.copc.info.rootHierarchyPage,
		);
		this.nodes = nodes;

		const root = nodes['0-0-0-0']!;
		const view = await Copc.loadPointDataView(this.url, this.copc, root);

		const getters = ['X', 'Y', 'Z', 'Red', 'Green', 'Blue'].map(view.getter);
		const getPoint = (index: number) => getters.map((get) => get(index));

		// Calculate bounds and center
		const lngs = Array.from({ length: root.pointCount }, (_, i) => {
			const point = getPoint(i);
			const [lon] = proj4(this.copc.wkt!).inverse([point[0], point[1]]);
			return lon;
		});
		const lats = Array.from({ length: root.pointCount }, (_, i) => {
			const point = getPoint(i);
			const [, lat] = proj4(this.copc.wkt!).inverse([point[0], point[1]]);
			return lat;
		});

		this.center = {
			lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
			lat: (Math.min(...lats) + Math.max(...lats)) / 2,
		};

		// Create Three.js geometry
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(root.pointCount * 3);
		const colors = new Float32Array(root.pointCount * 3);

		for (let i = 0; i < root.pointCount; i++) {
			const point = getPoint(i);
			const [lon, lat] = proj4(this.copc.wkt!).inverse([point[0], point[1]]);
			const merc = MercatorCoordinate.fromLngLat(
				{ lng: lon, lat: lat },
				point[2],
			);

			positions[i * 3] = merc.x;
			positions[i * 3 + 1] = merc.y;
			positions[i * 3 + 2] = merc.z;

			colors[i * 3] = point[3] / 65535;
			colors[i * 3 + 1] = point[4] / 65535;
			colors[i * 3 + 2] = point[5] / 65535;
		}

		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			vertexColors: true,
			size: 3,
			sizeAttenuation: false,
		});

		const points = new THREE.Points(geometry, material);
		this.scene.add(points);

		// Setup renderer
		this.renderer = new THREE.WebGLRenderer({
			canvas: map.getCanvas(),
			context: gl,
			antialias: true,
		});
		this.renderer.autoClear = false;
	}

	render(gl: WebGLRenderingContext, args: any) {
		if (!this.map || !this.renderer || !this.center) return;

		const m = new THREE.Matrix4().fromArray(
			args.defaultProjectionData.mainMatrix,
		);

		this.camera.projectionMatrix = m;
		this.renderer.resetState();
		this.renderer.render(this.scene, this.camera);
		this.map.triggerRepaint();
	}
}

function calcCopcDepth(error: number, distance: number, dpi: number) {
	return Math.ceil(Math.log2(distance / error));
}
