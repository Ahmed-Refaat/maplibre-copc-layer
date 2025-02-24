import { Camera, Vector3 } from 'three';

/**
 * voxelSizeをワールド空間での誤差量と見なし、
 * 画面上でそのサイズが何ピクセルになるか(SSE)を計算する。
 */
export function computeScreenSpaceError(
	cameraCenter: Vector3,
	center: Vector3,
	fov: number,
	geometricError: number,
	screenHeight: number,
) {
	// カメラ位置とオブジェクト中心との距離
	const distance = cameraCenter.distanceTo(center);

	// カメラの垂直視野角をラジアンに変換
	const fovInRadians = fov * (Math.PI / 180);

	// 簡易式：
	//   SSE = ( voxelSize * screenHeight ) / ( 2 * distance * tan(FOV/2) )
	const sse =
		(geometricError * screenHeight) /
		(2.0 * distance * Math.tan(fovInRadians / 2.0));

	return sse;
}
