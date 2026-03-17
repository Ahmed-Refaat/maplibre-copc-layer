import { describe, expect, test } from 'vite-plus/test'
import { computeScreenSpaceError, type Vec3 } from '../src/worker/sse'

describe('computeScreenSpaceError', () => {
	const camera: Vec3 = [0, 0, 0]
	const fov = 60
	const screenHeight = 1080

	test('returns higher SSE for closer objects', () => {
		const near: Vec3 = [0, 0, -10]
		const far: Vec3 = [0, 0, -100]
		const geometricError = 1.0

		const sseNear = computeScreenSpaceError(
			camera,
			near,
			fov,
			geometricError,
			screenHeight,
		)
		const sseFar = computeScreenSpaceError(
			camera,
			far,
			fov,
			geometricError,
			screenHeight,
		)

		expect(sseNear).toBeGreaterThan(sseFar)
	})

	test('returns higher SSE for larger geometric error', () => {
		const center: Vec3 = [0, 0, -50]

		const sseSmall = computeScreenSpaceError(
			camera,
			center,
			fov,
			0.5,
			screenHeight,
		)
		const sseLarge = computeScreenSpaceError(
			camera,
			center,
			fov,
			2.0,
			screenHeight,
		)

		expect(sseLarge).toBeGreaterThan(sseSmall)
	})

	test('maxDistance caps the effective distance', () => {
		const center: Vec3 = [0, 0, -50]
		const geometricError = 1.0

		const sseNoCap = computeScreenSpaceError(
			camera,
			center,
			fov,
			geometricError,
			screenHeight,
		)
		const sseCapped = computeScreenSpaceError(
			camera,
			center,
			fov,
			geometricError,
			screenHeight,
			20, // maxDistance smaller than actual distance (50)
		)

		// Capped distance is smaller, so SSE should be higher
		expect(sseCapped).toBeGreaterThan(sseNoCap)
	})

	test('maxDistance has no effect when distance is within limit', () => {
		const center: Vec3 = [0, 0, -50]
		const geometricError = 1.0

		const sseNoCap = computeScreenSpaceError(
			camera,
			center,
			fov,
			geometricError,
			screenHeight,
		)
		const sseHighCap = computeScreenSpaceError(
			camera,
			center,
			fov,
			geometricError,
			screenHeight,
			1000, // maxDistance much larger than actual distance
		)

		expect(sseHighCap).toBe(sseNoCap)
	})

	test('returns positive SSE for objects in front of camera', () => {
		const center: Vec3 = [0, 0, -50]
		const sse = computeScreenSpaceError(camera, center, fov, 1.0, screenHeight)
		expect(sse).toBeGreaterThan(0)
	})

	test('returns reasonable SSE at very high camera altitude with maxDistance', () => {
		// Simulate Globe View at low zoom: camera at 20,000,000m altitude
		const highCamera: Vec3 = [500000, 500000, 20000000]
		const nodeCenter: Vec3 = [500000, 500000, 100]
		const geometricError = 100 // root node spacing
		const sseThreshold = 8

		// Without maxDistance cap, SSE approaches 0
		const sseNoCap = computeScreenSpaceError(
			highCamera,
			nodeCenter,
			fov,
			geometricError,
			screenHeight,
		)
		expect(sseNoCap).toBeLessThan(sseThreshold)

		// With maxDistance cap (simulating cubeMaxDim * 20), SSE is reasonable
		const cubeMaxDim = 1000 // 1km cube
		const maxDistance = cubeMaxDim * 20
		const sseCapped = computeScreenSpaceError(
			highCamera,
			nodeCenter,
			fov,
			geometricError,
			screenHeight,
			maxDistance,
		)
		expect(sseCapped).toBeGreaterThan(sseThreshold)
	})
})
