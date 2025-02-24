import { CustomLayer } from './layer';
import { ThreeLayer } from './threelayer';

import { Map, addProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useGsiTerrainSource } from 'maplibre-gl-gsi-terrain';

const gsiTerrainSource = useGsiTerrainSource(addProtocol);

const map = new Map({
	container: 'app',
	style: {
		version: 8,
		//projection: { type: 'globe' },
		sources: {
			osm: {
				type: 'raster',
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
			},
			dem: gsiTerrainSource,
		},
		layers: [
			{
				id: 'osm',
				type: 'raster',
				source: 'osm',
			},
		],
		terrain: {
			source: 'dem',
		},
	},
	center: [139.04979382895846, 35.79193396826148],
	zoom: 10,
	hash: true,
});

map.on('load', () => {
	map.addLayer(
		new ThreeLayer('http://localhost:5173/ogochi-dam-translated.copc.laz'),
	);
});
