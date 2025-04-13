import { ThreeLayer } from '../src/threelayer';

import { Map, addProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useGsiTerrainSource } from 'maplibre-gl-gsi-terrain';

import { GUI } from 'lil-gui';

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
				attribution: '© OpenStreetMap contributors',
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
	},
	center: [139.04979382895846, 35.79193396826148],
	zoom: 10,
	maxPitch: 100,
	hash: true,
});

let customLayer: ThreeLayer | null = null;

map.on('load', () => {
	loadThreeLayerFromUrlParams();
});

const parameters = {
	pointSize: 6,
	colorMode: 'rgb' as 'rgb' | 'height' | 'intensity' | 'white',
	maxCacheSize: 100,
	sseThreshold: 4,
	depthTest: true,
};

// Create URL input container
const urlContainer = document.createElement('div');
urlContainer.style.position = 'absolute';
urlContainer.style.top = '10px';
urlContainer.style.left = '10px';
urlContainer.style.zIndex = '1000';
urlContainer.style.backgroundColor = 'white';
urlContainer.style.padding = '10px';
urlContainer.style.borderRadius = '4px';
urlContainer.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

// Create URL input
const urlInput = document.createElement('input');
urlInput.type = 'text';
urlInput.placeholder = 'Enter COPC URL';
urlInput.style.width = '300px';
urlInput.style.padding = '5px';
urlInput.style.marginRight = '5px';

// Create reload button
const reloadButton = document.createElement('button');
reloadButton.textContent = 'Load';
reloadButton.style.padding = '5px 10px';
reloadButton.style.backgroundColor = '#4CAF50';
reloadButton.style.color = 'white';
reloadButton.style.border = 'none';
reloadButton.style.borderRadius = '4px';
reloadButton.style.cursor = 'pointer';

// Add elements to container
urlContainer.appendChild(urlInput);
urlContainer.appendChild(reloadButton);
document.body.appendChild(urlContainer);

// Function to update URL parameters
function updateUrlParameters() {
	const url = new URL(window.location.href);
	url.searchParams.set('pointSize', parameters.pointSize.toString());
	url.searchParams.set('colorMode', parameters.colorMode);
	url.searchParams.set('maxCacheSize', parameters.maxCacheSize.toString());
	url.searchParams.set('sseThreshold', parameters.sseThreshold.toString());
	url.searchParams.set('depthTest', parameters.depthTest.toString());
	window.history.pushState({}, '', url);
}

// Function to load parameters from URL
function loadParametersFromUrl() {
	const url = new URL(window.location.href);

	// Load COPC URL
	const copcUrl = url.searchParams.get('copc');
	if (copcUrl) {
		urlInput.value = copcUrl;
	}

	// Load other parameters
	const pointSize = url.searchParams.get('pointSize');
	if (pointSize) {
		parameters.pointSize = parseInt(pointSize);
	}

	const colorMode = url.searchParams.get('colorMode');
	if (
		colorMode &&
		['rgb', 'height', 'intensity', 'white'].includes(colorMode)
	) {
		parameters.colorMode = colorMode as
			| 'rgb'
			| 'height'
			| 'intensity'
			| 'white';
	}

	const maxCacheSize = url.searchParams.get('maxCacheSize');
	if (maxCacheSize) {
		parameters.maxCacheSize = parseInt(maxCacheSize);
	}

	const sseThreshold = url.searchParams.get('sseThreshold');
	if (sseThreshold) {
		parameters.sseThreshold = parseInt(sseThreshold);
	}

	const depthTest = url.searchParams.get('depthTest');
	if (depthTest) {
		parameters.depthTest = depthTest === 'true';
	}
}

// Load initial parameters from URL
loadParametersFromUrl();

// Initialize GUI
const gui = new GUI({
	title: 'コントロール',
	container: document.getElementById('gui') as HTMLElement,
	width: 400,
});

// Create folders for different categories
const pointsFolder = gui.addFolder('Point Settings');
const renderingFolder = gui.addFolder('Rendering Options');
const performanceFolder = gui.addFolder('Performance');

// Update event listeners to save parameters to URL
pointsFolder
	.add(parameters, 'pointSize', 1, 20, 1)
	.onChange((value: number) => {
		if (customLayer) {
			customLayer.setPointSize(value);
		}
		updateUrlParameters();
	});

pointsFolder
	.add(parameters, 'colorMode', ['rgb', 'height', 'intensity', 'white'])
	.onChange((value: string) => {
		if (customLayer) {
			// Need to recreate the layer with the new color mode
			const currentLayer = customLayer;
			map.removeLayer(currentLayer.id);

			customLayer = new ThreeLayer(currentLayer.url, {
				maxCacheSize: parameters.maxCacheSize,
				colorMode: value as 'rgb' | 'height' | 'intensity' | 'white',
				pointSize: parameters.pointSize,
				sseThreshold: parameters.sseThreshold,
				depthTest: parameters.depthTest,
			});

			map.addLayer(customLayer);
		}
		updateUrlParameters();
	});

// Rendering options
renderingFolder
	.add(parameters, 'depthTest')
	.name('Depth Test')
	.onChange((value: boolean) => {
		if (customLayer) {
			customLayer.toggleDepthTest(value);
		}
		updateUrlParameters();
	});

// Performance settings
performanceFolder
	.add(parameters, 'sseThreshold', 1, 10, 1)
	.name('SSE Threshold')
	.onChange((value: number) => {
		if (customLayer) {
			customLayer.setSseThreshold(value);
		}
		updateUrlParameters();
	});

// Open folders by default
pointsFolder.open();
renderingFolder.open();

// Update loadThreeLayerFromUrlParams to use parameters from URL
function loadThreeLayerFromUrlParams() {
	const url = new URL(window.location.href);
	const copcUrl = url.searchParams.get('copc');
	const maxCacheSize = url.searchParams.get('maxCacheSize')
		? parseInt(url.searchParams.get('maxCacheSize')!)
		: parameters.maxCacheSize;

	if (copcUrl) {
		if (customLayer) {
			map.removeLayer(customLayer.id);
		}
		customLayer = new ThreeLayer(copcUrl, {
			maxCacheSize: maxCacheSize,
			colorMode: parameters.colorMode,
			pointSize: parameters.pointSize,
			sseThreshold: parameters.sseThreshold,
			depthTest: parameters.depthTest,
		});
		map.addLayer(customLayer);
	}
}

// Update reload button event listener to save parameters
reloadButton.addEventListener('click', () => {
	const newUrl = urlInput.value.trim();
	if (newUrl) {
		// Update URL parameters
		const url = new URL(window.location.href);
		url.searchParams.set('copc', newUrl);
		window.history.pushState({}, '', url);

		// Reload COPC data
		loadThreeLayerFromUrlParams();
	}
});
