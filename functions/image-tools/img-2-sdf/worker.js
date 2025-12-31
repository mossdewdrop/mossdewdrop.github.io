// worker.js - Perform image processing in background thread

self.onmessage = (e) => {
    const { imageBitmap, params } = e.data;
    
    try {
        const result = processSDF(imageBitmap, params);
        self.postMessage({ type: 'result', payload: { imageData: result } }, [result.data.buffer]);
    } catch (error) {
        self.postMessage({ type: 'error', payload: { message: error.message } });
    }
};

function processSDF(bitmap, params) {
    let width = bitmap.width;
    let height = bitmap.height;

    // 1. Determine output resolution based on parameters and draw to Canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (params.resolution !== 'original') {
        const res = parseInt(params.resolution, 10);
        width = res;
        height = res;
        canvas.width = width;
        canvas.height = height;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    self.postMessage({ type: 'progress', payload: { progress: 5 } });

    // 2. Binarization
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;
    const isInside = new Array(width * height);
    
    // Threshold, > 128 is white
    const threshold = 128; 
    for (let i = 0; i < data.length; i += 4) {
        // Simple grayscale
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        let binary = gray > threshold ? 1 : 0; // 1: background, 0: shape
        if (params.invert) {
            binary = 1 - binary;
        }
        isInside[i / 4] = binary === 0;
    }
    self.postMessage({ type: 'progress', payload: { progress: 15 } });


    // 3. JFA Algorithm (Jump Flooding Algorithm)
    const grid = new Array(width * height).fill(null);

    // Pass 0: Initialization
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (isBoundary(x, y, width, height, isInside)) {
                grid[i] = { x, y };
            }
        }
    }
    self.postMessage({ type: 'progress', payload: { progress: 25 } });

    // JFA Passes
    let step = Math.max(width, height) / 2;
    let progress = 25;
    while (step >= 1) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                // Check 8 neighbors
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = Math.round(x + dx * step);
                        const ny = Math.round(y + dy * step);

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborIdx = ny * width + nx;
                            const neighborSeed = grid[neighborIdx];
                            
                            if (neighborSeed) {
                                const currentSeed = grid[i];
                                if (!currentSeed || distSq(x, y, neighborSeed) < distSq(x, y, currentSeed)) {
                                    grid[i] = neighborSeed;
                                }
                            }
                        }
                    }
                }
            }
        }
        step /= 2;
        progress += 7; // Rough progress update
        self.postMessage({ type: 'progress', payload: { progress: Math.min(progress, 90) } });
    }

    // 4. Generate final SDF image
    const outputImageData = new ImageData(width, height);
    for (let i = 0; i < grid.length; i++) {
        const seed = grid[i];
        if (seed) {
            const d = Math.sqrt(distSq(i % width, Math.floor(i / width), seed));
            const sign = isInside[i] ? -1 : 1;
            
            // Map [-max, max] to [0, 255]
            // SDF value 0.5 (i.e. 128) corresponds to boundary with distance 0
            let val = 128 + (sign * d * 128) / params.maxDistance;
            val = Math.max(0, Math.min(255, val)); // Clamp
            
            outputImageData.data[i * 4] = val;
            outputImageData.data[i * 4 + 1] = val;
            outputImageData.data[i * 4 + 2] = val;
            outputImageData.data[i * 4 + 3] = 255;
        } else {
            // No seed point found (completely inside or outside)
            const val = isInside[i] ? 0 : 255;
            outputImageData.data[i * 4] = val;
            outputImageData.data[i * 4 + 1] = val;
            outputImageData.data[i * 4 + 2] = val;
            outputImageData.data[i * 4 + 3] = 255;
        }
    }
    self.postMessage({ type: 'progress', payload: { progress: 100 } });
    
    return outputImageData;
}


// Helper functions
function isBoundary(x, y, width, height, isInside) {
    const i = y * width + x;
    const current = isInside[i];
    // Check 4 neighbors
    if (x > 0 && isInside[i - 1] !== current) return true;
    if (x < width - 1 && isInside[i + 1] !== current) return true;
    if (y > 0 && isInside[i - width] !== current) return true;
    if (y < height - 1 && isInside[i + width] !== current) return true;
    return false;
}

function distSq(x1, y1, p2) {
    return (x1 - p2.x) * (x1 - p2.x) + (y1 - p2.y) * (y1 - p2.y);
}