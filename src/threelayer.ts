import {
	CustomLayerInterface,
	CustomRenderMethodInput,
	Map as MapLibre,
	MercatorCoordinate,
} from 'maplibre-gl';
import * as THREE from 'three';
import { Copc, Hierarchy } from 'copc';
import proj4, { Converter } from 'proj4';
import { computeScreenSpaceError } from './sse';

export class ThreeLayer implements CustomLayerInterface {
	id: string;
	type: 'custom';
	renderingMode: '3d';
	url: string;

	private camera: THREE.Camera;
	private scene: THREE.Scene;
	private renderer?: THREE.WebGLRenderer;
	private map?: MapLibre;

	private copc: Copc | null = null;
	private proj?: Converter;
	private nodes: Hierarchy.Node.Map = {};
	private nodeCenters: Record<string, [number, number, number]> = {};
	private pointsMap: Record<string, THREE.Points> = {};
	private pointSize: number = 6;

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
		this.proj = proj4(this.copc.wkt!);

		const { nodes } = await Copc.loadHierarchyPage(
			this.url,
			this.copc.info.rootHierarchyPage,
		);
		this.nodes = nodes;
		this.nodeCenters = Object.entries(nodes).reduce((curr, [k, v]) => {
			const center = calcCubeCenter(this.copc.info.cube, k);
			return {
				...curr,
				[k]: center,
			};
		}, {});

		this.loadNode('0-0-0-0');

		// Setup renderer
		this.renderer = new THREE.WebGLRenderer({
			canvas: map.getCanvas(),
			context: gl,
		});
		this.renderer.autoClear = false;
	}

	private async updatePoints() {
		const cameraPostion = new THREE.Vector3(
			...this.proj!.forward(this.map.transform.getCameraLngLat().toArray()),
			this.map.transform.getCameraAltitude(),
		);

		const nodesSseTested = Object.entries(this.nodeCenters).filter(
			([node, center]) => {
				const depth = parseInt(node.split('-')[0]);
				const sse = computeScreenSpaceError(
					cameraPostion,
					new THREE.Vector3(...center),
					this.map.transform.fov,
					this.copc!.info.spacing * Math.pow(0.5, depth), // 1/1, 1/2, 1/4, 1/8, ...
					this.map.transform.height,
				);
				return sse > 4; // arbitrary threshold
			},
		);

		const maximumDepth = Math.max(
			...nodesSseTested.map(([node]) => parseInt(node.split('-')[0])),
		);
		const nodesToLoad = nodesSseTested.filter(
			([node]) => parseInt(node.split('-')[0]) === maximumDepth,
		);
		nodesToLoad.forEach(([node]) => this.loadNode(node));
	}

	async loadNode(node: string) {
		if (this.pointsMap[node]) return;

		const targetNode = this.nodes[node];
		const positions: Float32Array = new Float32Array(targetNode.pointCount * 3);
		const colors: Float32Array = new Float32Array(targetNode.pointCount * 3);

		const view = await Copc.loadPointDataView(
			this.url,
			this.copc,
			this.nodes[node],
		);
		const getters = ['X', 'Y', 'Z', 'Red', 'Green', 'Blue'].map(view.getter);
		const getPoint = (index: number) => getters.map((get) => get(index));

		for (let i = 0; i < this.nodes[node].pointCount; i++) {
			const point = await getPointPromise(getPoint)(i);
			const [lon, lat] = this.proj.inverse([point[0], point[1]]);
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

		// add new points to the geometry
		const geometry = new THREE.BufferGeometry();
		geometry!.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry!.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			vertexColors: true,
			size: this.pointSize,
			sizeAttenuation: false,
		});

		this.pointsMap[node] = new THREE.Points(geometry, material);
		// no depth test
		this.pointsMap[node].material.depthTest = false;

		this.scene.add(this.pointsMap[node]);

		this.map?.triggerRepaint();
	}

	render(gl: WebGLRenderingContext, options: CustomRenderMethodInput) {
		if (!this.map || !this.renderer) return;

		const m = new THREE.Matrix4().fromArray(
			options.defaultProjectionData.mainMatrix,
		);

		this.camera.projectionMatrix = m;

		this.updatePoints();

		this.renderer.resetState();
		this.renderer.render(this.scene, this.camera);

		this.map.triggerRepaint();
	}
}

function calcCubeCenter(
	cube: [number, number, number, number, number, number],
	node: string,
) {
	const _node = node.split('-').map((n) => parseInt(n)); // 3-4-5-6
	const cubeSizeOfNode = [
		cube[3] - cube[0],
		cube[4] - cube[1],
		cube[5] - cube[2],
	].map((size) => size / Math.pow(2, _node[0]));

	// cube origin + cube size * node + cube size / 2
	const nodeCenter = [
		cube[0] + cubeSizeOfNode[0] * _node[1] + cubeSizeOfNode[0] / 2,
		cube[1] + cubeSizeOfNode[1] * _node[2] + cubeSizeOfNode[1] / 2,
		cube[2] + cubeSizeOfNode[2] * _node[3] + cubeSizeOfNode[2] / 2,
	];
	return nodeCenter;
}

function getPointPromise(getPoint: (index: number) => number[]) {
	return (index: number) =>
		new Promise<number[]>((resolve) => {
			resolve(getPoint(index));
		});
}
