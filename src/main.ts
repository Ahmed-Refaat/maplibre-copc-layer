import { ThreeLayer } from './threelayer';

import { Map, addProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useGsiTerrainSource } from 'maplibre-gl-gsi-terrain';

const gsiTerrainSource = useGsiTerrainSource(addProtocol);

const map = new Map({
	container: 'app',
	style: {
		version: 8,
		sources: {
			osm: {
				type: 'raster',
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
			},
			dem: gsiTerrainSource,
		},
		layers: [],
		terrain: {
			source: 'dem',
		},
	},
	center: [139.04979382895846, 35.79193396826148],
	zoom: 10,
	hash: true,
});

let customLayer: ThreeLayer | null = null;

map.on('load', () => {
	loadThreeLayerFromUrlParams();
});

function loadThreeLayerFromUrlParams() {
	const url = new URL(window.location.href);
	const copcUrl = url.searchParams.get('copc');
	const maxCacheSize = url.searchParams.get('maxCache')
		? parseInt(url.searchParams.get('maxCache')!)
		: 100;

	if (copcUrl) {
		customLayer = new ThreeLayer(copcUrl, {
			maxCacheSize: maxCacheSize,
			colorMode: 'height',
			pointSize: 10,
			sseThreshold: 4,
		});
		map.addLayer(customLayer);
	}
}
