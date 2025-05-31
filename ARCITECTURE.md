# Architecture Overview

## Level-of-Detail Selection Process

The system determines which COPC nodes to load based on Screen Space Error (SSE) calculations:

1. **Calculate node centers**: Compute the center point of all COPC leaf nodes in the hierarchy
2. **Screen Space Error calculation**: For each node, calculate how many pixels the geometric error would occupy on screen when viewed from the current camera position (considering DPI). Deeper nodes have smaller geometric errors, resulting in fewer screen pixels
3. **Node selection**: Select nodes where the calculated SSE value exceeds a threshold (typically 1 or another configurable constant). This ensures that nodes with geometric errors too small to be meaningfully represented on screen are not loaded

## Three.js and Web Worker Architecture

**Non-blocking processing**: Web Workers are used extensively to prevent blocking the main thread. Heavy operations like loading COPC data, coordinate transformations, and memory allocation are performed in the worker.

**Modular design**: The architecture is designed to be decoupled from MapLibre GL JS, making the rendering components reusable with other mapping libraries.
