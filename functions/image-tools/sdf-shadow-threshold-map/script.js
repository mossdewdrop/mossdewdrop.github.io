// Source From https://github.com/akasaki1211/sdf_shadow_threshold_map
document.addEventListener('DOMContentLoaded', () => {
    // Helper functions for array min/max to avoid stack overflow with spread operator
    function arrayMax(arr) {
        let max = -Infinity;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] > max) max = arr[i];
        }
        return max;
    }

    function arrayMin(arr) {
        let min = Infinity;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] < min) min = arr[i];
        }
        return min;
    }

    // DOM elements
    const dropZone = document.getElementById('drop-zone');
    const imageList = document.getElementById('image-list');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewPlaceholder = document.getElementById('preview-placeholder');
    const downloadArea = document.getElementById('download-area');
    const downloadBtn = document.getElementById('download-btn');
    const generateBtn = document.getElementById('generate-btn');

    // Parameter controls
    const bitDepthSelect = document.getElementById('bit-depth');
    const colorModeSelect = document.getElementById('color-mode');
    const filterModeSelect = document.getElementById('filter-mode');
    const kernelSizeInput = document.getElementById('kernel-size');
    const diameterInput = document.getElementById('diameter');
    const reverseCheckbox = document.getElementById('reverse');
    const gaussianParam = document.getElementById('gaussian-param');
    const bilateralParam = document.getElementById('bilateral-param');

    // State
    let images = [];
    let generatedImageData = null;
    let dragSrcEl = null;
    let sortAscending = true;

    const sortBtn = document.getElementById('sort-btn');

    // Filter mode change handler
    filterModeSelect.addEventListener('change', () => {
        gaussianParam.style.display = filterModeSelect.value === 'gaussian' ? 'flex' : 'none';
        bilateralParam.style.display = filterModeSelect.value === 'bilateral' ? 'flex' : 'none';
    });

    // Sort button handler
    sortBtn.addEventListener('click', () => {
        sortAscending = !sortAscending;
        images.sort((a, b) => {
            const nameA = a.file.name.toLowerCase();
            const nameB = b.file.name.toLowerCase();
            if (sortAscending) {
                return nameA.localeCompare(nameB);
            } else {
                return nameB.localeCompare(nameA);
            }
        });
        sortBtn.textContent = sortAscending ? 'Sort: Ascending' : 'Sort: Descending';
        renderImageList();
    });

    // Ensure odd kernel size
    kernelSizeInput.addEventListener('change', () => {
        let val = parseInt(kernelSizeInput.value);
        if (val % 2 === 0) val++;
        if (val < 1) val = 1;
        kernelSizeInput.value = val;
    });

    // Drag and drop for file upload
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    // Click to select files
    dropZone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.onchange = (e) => handleFiles(e.target.files);
        input.click();
    });

    function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                loadImage(file);
            }
        }
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const imageData = {
                    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    file: file,
                    src: e.target.result,
                    img: img,
                    width: img.width,
                    height: img.height
                };
                images.push(imageData);
                renderImageList();
                updateGenerateButton();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function renderImageList() {
        imageList.innerHTML = '';
        sortBtn.disabled = images.length === 0;
        images.forEach((imgData, index) => {
            const li = document.createElement('li');
            li.className = 'image-item';
            li.dataset.id = imgData.id;
            li.dataset.index = index;
            li.draggable = true;

            li.innerHTML = `
                <span class="order-num">${index + 1}</span>
                <img src="${imgData.src}" alt="${imgData.file.name}">
                <div class="image-info">
                    <div class="image-name">${imgData.file.name}</div>
                    <div class="image-size">${imgData.width}x${imgData.height}</div>
                </div>
                <button class="delete-btn" title="Remove">&times;</button>
            `;

            // Delete handler
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                images = images.filter(i => i.id !== imgData.id);
                renderImageList();
                updateGenerateButton();
            });

            // Drag events for reordering
            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragend', handleDragEnd);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('drop', handleReorderDrop);
            li.addEventListener('dragenter', handleDragEnter);
            li.addEventListener('dragleave', handleDragLeave);

            imageList.appendChild(li);
        });
    }

    function handleDragStart(e) {
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        const items = imageList.querySelectorAll('.image-item');
        items.forEach(item => item.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        if (this !== dragSrcEl) {
            this.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleReorderDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        if (dragSrcEl !== this) {
            const srcIndex = parseInt(dragSrcEl.dataset.index);
            const targetIndex = parseInt(this.dataset.index);

            // Reorder array
            const [moved] = images.splice(srcIndex, 1);
            images.splice(targetIndex, 0, moved);

            renderImageList();
        }

        return false;
    }

    function updateGenerateButton() {
        generateBtn.disabled = images.length < 2;
        if (images.length < 2) {
            generateBtn.textContent = `Generate Shadow Threshold Map (need ${2 - images.length} more image${images.length === 1 ? '' : 's'})`;
        } else {
            generateBtn.textContent = 'Generate Shadow Threshold Map';
        }
    }

    // Generate button handler
    generateBtn.addEventListener('click', async () => {
        if (images.length < 2) return;

        generateBtn.disabled = true;
        generateBtn.classList.add('loading');
        generateBtn.textContent = 'Generating...';
        downloadArea.style.display = 'none';

        try {
            const params = {
                bitDepth: parseInt(bitDepthSelect.value),
                colorMode: colorModeSelect.value,
                reverse: reverseCheckbox.checked,
                filterMode: filterModeSelect.value,
                kernelSize: parseInt(kernelSizeInput.value),
                diameter: parseInt(diameterInput.value)
            };

            const result = await generateShadowThresholdMap(images, params);
            displayResult(result, params);
            generatedImageData = result;
        } catch (error) {
            console.error('Generation error:', error);
            alert('Error generating shadow threshold map: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.classList.remove('loading');
            generateBtn.textContent = 'Generate Shadow Threshold Map';
        }
    });

    // Download button handler
    downloadBtn.addEventListener('click', () => {
        if (!generatedImageData) return;

        const params = {
            bitDepth: parseInt(bitDepthSelect.value),
            colorMode: colorModeSelect.value
        };

        const canvas = document.createElement('canvas');
        canvas.width = generatedImageData.width;
        canvas.height = generatedImageData.height;
        const ctx = canvas.getContext('2d');

        if (params.colorMode === 'rgba') {
            // Create RGBA image
            const imgData = ctx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < generatedImageData.data.length / 4; i++) {
                const gray = generatedImageData.data[i * 4];
                imgData.data[i * 4] = gray;
                imgData.data[i * 4 + 1] = gray;
                imgData.data[i * 4 + 2] = gray;
                imgData.data[i * 4 + 3] = generatedImageData.data[i * 4 + 3];
            }
            ctx.putImageData(imgData, 0, 0);
        } else if (params.colorMode === 'rgb') {
            // Create RGB image
            const imgData = ctx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < generatedImageData.data.length / 4; i++) {
                const gray = generatedImageData.data[i * 4];
                imgData.data[i * 4] = gray;
                imgData.data[i * 4 + 1] = gray;
                imgData.data[i * 4 + 2] = gray;
                imgData.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);
        } else {
            // Grayscale
            const imgData = ctx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < generatedImageData.data.length / 4; i++) {
                const gray = generatedImageData.data[i * 4];
                imgData.data[i * 4] = gray;
                imgData.data[i * 4 + 1] = gray;
                imgData.data[i * 4 + 2] = gray;
                imgData.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);
        }

        const link = document.createElement('a');
        link.download = 'shadow_threshold_map.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    function displayResult(imageData, params) {
        previewCanvas.width = imageData.width;
        previewCanvas.height = imageData.height;
        const ctx = previewCanvas.getContext('2d');

        if (params.colorMode === 'rgba') {
            // RGBA with alpha
            const displayData = ctx.createImageData(imageData.width, imageData.height);
            for (let i = 0; i < imageData.data.length / 4; i++) {
                const gray = imageData.data[i * 4];
                displayData.data[i * 4] = gray;
                displayData.data[i * 4 + 1] = gray;
                displayData.data[i * 4 + 2] = gray;
                displayData.data[i * 4 + 3] = imageData.data[i * 4 + 3];
            }
            ctx.putImageData(displayData, 0, 0);
        } else {
            // Grayscale or RGB
            const displayData = ctx.createImageData(imageData.width, imageData.height);
            for (let i = 0; i < imageData.data.length / 4; i++) {
                const gray = imageData.data[i * 4];
                displayData.data[i * 4] = gray;
                displayData.data[i * 4 + 1] = gray;
                displayData.data[i * 4 + 2] = gray;
                displayData.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(displayData, 0, 0);
        }

        previewCanvas.classList.add('visible');
        previewPlaceholder.classList.add('hidden');
        downloadArea.style.display = 'block';
    }

    // ===== SDF Generation Functions =====

    async function generateShadowThresholdMap(images, params) {
        // Get the dimensions from first image
        const width = images[0].width;
        const height = images[0].height;

        // Process all images to grayscale binary
        const binaryImages = [];
        for (const imgData of images) {
            const binary = await imageToBinary(imgData.img, width, height);
            binaryImages.push(binary);
        }

        // Generate SDF for each binary image
        const sdfImages = binaryImages.map(binary => generateSDF(binary, width, height));

        // Calculate step values
        const gradientCount = images.length - 1;
        const interval = 1.0 / gradientCount;
        const stepValues = [];
        for (let i = 0; i < gradientCount; i++) {
            let start = interval * i;
            let end = interval * (i + 1);
            if (params.reverse) {
                start = 1 - start;
                end = 1 - end;
            }
            stepValues.push({ start, end });
        }

        // Generate gradient maps
        const gradientMaps = [];
        const maskMaps = [];

        for (let i = 0; i < gradientCount; i++) {
            const img1 = binaryImages[i];
            const img2 = binaryImages[i + 1];
            const sdf1 = sdfImages[i];
            const sdf2 = sdfImages[i + 1];
            const { start, end } = stepValues[i];

            // Generate mask
            const mask = getImageDifference(img1, img2, width, height);
            maskMaps.push(mask);

            // Generate gradient from SDF
            const gradient = createGradientFromSDF(sdf1, sdf2, width, height);

            // Apply lerp and mask
            const maskedGradient = applyLerpAndMask(start, end, gradient, mask, width, height);
            gradientMaps.push(maskedGradient);
        }

        // Sum all gradient maps
        let result = new Float64Array(width * height);
        for (let i = 0; i < gradientMaps.length; i++) {
            for (let j = 0; j < result.length; j++) {
                result[j] += gradientMaps[i][j];
            }
        }

        // Normalize
        const maxVal = arrayMax(result);
        const minVal = arrayMin(result);
        if (maxVal > minVal) {
            for (let i = 0; i < result.length; i++) {
                result[i] = (result[i] - minVal) / (maxVal - minVal);
            }
        }

        // Apply filter if specified
        if (params.filterMode === 'gaussian') {
            result = applyGaussianBlur(result, width, height, params.kernelSize);
        } else if (params.filterMode === 'bilateral') {
            result = applyBilateralFilter(result, width, height, params.diameter);
        }

        // Merge mask for RGBA mode
        let mergedMask = null;
        if (params.colorMode === 'rgba') {
            mergedMask = new Float64Array(width * height);
            for (let i = 0; i < maskMaps.length; i++) {
                for (let j = 0; j < mergedMask.length; j++) {
                    mergedMask[j] += maskMaps[i][j];
                }
            }
            // Normalize mask
            const maskMax = arrayMax(mergedMask);
            if (maskMax > 0) {
                for (let i = 0; i < mergedMask.length; i++) {
                    mergedMask[i] = mergedMask[i] / maskMax;
                }
            }
        }

        // Convert to output format
        return createOutputImage(result, mergedMask, width, height, params.bitDepth, params.colorMode);
    }

    function imageToBinary(img, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const binary = new Uint8Array(width * height);

        for (let i = 0; i < width * height; i++) {
            const r = imageData.data[i * 4];
            const g = imageData.data[i * 4 + 1];
            const b = imageData.data[i * 4 + 2];
            // Convert to grayscale
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            // Binarize
            binary[i] = gray > 127 ? 255 : 0;
        }

        return binary;
    }

    function generateSDF(binary, width, height) {
        // Distance transform for inside (foreground)
        const distInside = distanceTransform(binary, width, height, false);
        // Distance transform for outside (background)
        const inverted = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            inverted[i] = 255 - binary[i];
        }
        const distOutside = distanceTransform(inverted, width, height, false);

        // SDF = distance outside - distance inside
        const sdf = new Float64Array(width * height);
        for (let i = 0; i < sdf.length; i++) {
            sdf[i] = Math.abs(distOutside[i] - distInside[i]);
        }

        // Normalize
        const maxVal = arrayMax(sdf);
        if (maxVal > 0) {
            for (let i = 0; i < sdf.length; i++) {
                sdf[i] = sdf[i] / maxVal;
            }
        }

        return sdf;
    }

    function distanceTransform(binary, width, height, useSquared) {
        // Two-pass distance transform algorithm
        const INF = 1e20;
        const dist = new Float64Array(width * height);
        const maxDist = width + height;

        // Initialize: 0 for foreground, INF for background
        for (let i = 0; i < width * height; i++) {
            dist[i] = binary[i] > 127 ? 0 : INF;
        }

        // Forward pass (top-left to bottom-right)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (dist[idx] > 0) {
                    let minDist = dist[idx];
                    // Check left
                    if (x > 0) {
                        minDist = Math.min(minDist, dist[idx - 1] + 1);
                    }
                    // Check up
                    if (y > 0) {
                        minDist = Math.min(minDist, dist[idx - width] + 1);
                    }
                    dist[idx] = minDist;
                }
            }
        }

        // Backward pass (bottom-right to top-left)
        for (let y = height - 1; y >= 0; y--) {
            for (let x = width - 1; x >= 0; x--) {
                const idx = y * width + x;
                if (dist[idx] > 0) {
                    let minDist = dist[idx];
                    // Check right
                    if (x < width - 1) {
                        minDist = Math.min(minDist, dist[idx + 1] + 1);
                    }
                    // Check down
                    if (y < height - 1) {
                        minDist = Math.min(minDist, dist[idx + width] + 1);
                    }
                    dist[idx] = minDist;
                }
            }
        }

        // Square the distances if useSquared is true
        if (useSquared) {
            for (let i = 0; i < dist.length; i++) {
                if (dist[i] < INF) {
                    dist[i] = dist[i] * dist[i];
                }
            }
        }

        return dist;
    }

    function getImageDifference(img1, img2, width, height) {
        const diff = new Float64Array(width * height);
        for (let i = 0; i < diff.length; i++) {
            const n1 = img1[i] / 255.0;
            const n2 = img2[i] / 255.0;
            diff[i] = Math.abs(n2 - n1);
        }
        return diff;
    }

    function createGradientFromSDF(sdf1, sdf2, width, height) {
        const gradient = new Float64Array(width * height);
        for (let i = 0; i < gradient.length; i++) {
            const denom = sdf1[i] + sdf2[i];
            gradient[i] = denom === 0 ? 0 : sdf1[i] / denom;
        }

        // Normalize
        const maxVal = arrayMax(gradient);
        const minVal = arrayMin(gradient);
        if (maxVal > minVal) {
            for (let i = 0; i < gradient.length; i++) {
                gradient[i] = (gradient[i] - minVal) / (maxVal - minVal);
            }
        }

        return gradient;
    }

    function applyLerpAndMask(start, end, gradient, mask, width, height) {
        const result = new Float64Array(width * height);
        for (let i = 0; i < result.length; i++) {
            const lerpVal = start + (end - start) * gradient[i];
            result[i] = lerpVal * mask[i];
        }
        return result;
    }

    function applyGaussianBlur(data, width, height, kernelSize) {
        // Create kernel
        const kernel = createGaussianKernel(kernelSize);
        const half = Math.floor(kernelSize / 2);

        // Horizontal pass
        const temp = new Float64Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;
                for (let k = -half; k <= half; k++) {
                    const px = Math.min(Math.max(x + k, 0), width - 1);
                    const idx = y * width + px;
                    const w = kernel[k + half];
                    sum += data[idx] * w;
                    weightSum += w;
                }
                temp[y * width + x] = sum / weightSum;
            }
        }

        // Vertical pass
        const result = new Float64Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;
                for (let k = -half; k <= half; k++) {
                    const py = Math.min(Math.max(y + k, 0), height - 1);
                    const idx = py * width + x;
                    const w = kernel[k + half];
                    sum += temp[idx] * w;
                    weightSum += w;
                }
                result[y * width + x] = sum / weightSum;
            }
        }

        return result;
    }

    function createGaussianKernel(size) {
        const kernel = new Float64Array(size);
        const sigma = size / 6;
        const half = Math.floor(size / 2);
        let sum = 0;

        for (let i = 0; i < size; i++) {
            const x = i - half;
            kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
            sum += kernel[i];
        }

        // Normalize
        for (let i = 0; i < size; i++) {
            kernel[i] /= sum;
        }

        return kernel;
    }

    function applyBilateralFilter(data, width, height, diameter) {
        const result = new Float64Array(width * height);
        const half = Math.floor(diameter / 2);
        const sigmaColor = 0.1;
        const sigmaSpace = half / 2;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const centerIdx = y * width + x;
                const centerVal = data[centerIdx];

                let sum = 0;
                let weightSum = 0;

                for (let ky = -half; ky <= half; ky++) {
                    for (let kx = -half; kx <= half; kx++) {
                        const py = Math.min(Math.max(y + ky, 0), height - 1);
                        const px = Math.min(Math.max(x + kx, 0), width - 1);
                        const idx = py * width + px;
                        const val = data[idx];

                        // Spatial weight
                        const spaceDist = Math.sqrt(kx * kx + ky * ky);
                        const wSpace = Math.exp(-(spaceDist * spaceDist) / (2 * sigmaSpace * sigmaSpace));

                        // Color weight
                        const colorDist = Math.abs(val - centerVal);
                        const wColor = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));

                        const weight = wSpace * wColor;
                        sum += val * weight;
                        weightSum += weight;
                    }
                }

                result[centerIdx] = sum / weightSum;
            }
        }

        return result;
    }

    function createOutputImage(data, alphaData, width, height, bitDepth, colorMode) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        const maxVal = bitDepth === 16 ? 65535 : 255;
        const scale = maxVal / 255;

        for (let i = 0; i < width * height; i++) {
            const value = Math.round(data[i] * 255);
            const scaledValue = Math.min(255, Math.max(0, value));

            imageData.data[i * 4] = scaledValue;
            imageData.data[i * 4 + 1] = scaledValue;
            imageData.data[i * 4 + 2] = scaledValue;

            if (colorMode === 'rgba' && alphaData) {
                const alpha = Math.round(alphaData[i] * 255);
                imageData.data[i * 4 + 3] = Math.min(255, Math.max(0, alpha));
            } else {
                imageData.data[i * 4 + 3] = 255;
            }
        }

        return imageData;
    }
});
