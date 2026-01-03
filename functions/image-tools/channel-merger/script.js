document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const cards = document.querySelectorAll('.channel-card');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas.getContext('2d');
    const resolutionSelect = document.getElementById('resolution-select');
    const mergeBtn = document.getElementById('merge-btn');
    const loadingOverlay = document.querySelector('.loading-overlay');

    // --- State Management ---
    const channelSources = [
        { image: null, sourceChannel: 'R', value: 0, invert: false },    // Target R
        { image: null, sourceChannel: 'G', value: 0, invert: false },    // Target G
        { image: null, sourceChannel: 'B', value: 0, invert: false },    // Target B
        { image: null, sourceChannel: 'A', value: 1, invert: false }     // Target A
    ];

    const channelMap = { R: 0, G: 1, B: 2, A: 3 };

    let previewUpdateTimer;

    // --- Main Logic ---
    const crcTable = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32Update(crc, bytes) {
        let c = crc >>> 0;
        for (let i = 0; i < bytes.length; i++) {
            c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return c >>> 0;
    }

    function createPngChunk(type, data) {
        const typeBytes = new Uint8Array(4);
        for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i) & 0xFF;

        const chunk = new Uint8Array(8 + data.length + 4);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, data.length, false);
        chunk.set(typeBytes, 4);
        chunk.set(data, 8);

        let crc = 0xFFFFFFFF;
        crc = crc32Update(crc, typeBytes);
        crc = crc32Update(crc, data);
        crc = (crc ^ 0xFFFFFFFF) >>> 0;
        view.setUint32(8 + data.length, crc, false);
        return chunk;
    }

    async function readAllBytesFromReadableStream(readable) {
        const reader = readable.getReader();
        const chunks = [];
        let totalLength = 0;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
                chunks.push(chunk);
                totalLength += chunk.byteLength;
            }
        } finally {
            reader.releaseLock();
        }

        const out = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return out;
    }

    async function encodeRgbaToPngBlob(width, height, rgbaData) {
        if (typeof CompressionStream === 'undefined') {
            throw new Error('CompressionStream is not available in this browser.');
        }

        const rowBytes = width * 4;
        const compressor = new CompressionStream('deflate');
        const writer = compressor.writable.getWriter();
        const readPromise = readAllBytesFromReadableStream(compressor.readable);

        for (let y = 0; y < height; y++) {
            const row = new Uint8Array(1 + rowBytes);
            row[0] = 0;
            row.set(rgbaData.subarray(y * rowBytes, (y + 1) * rowBytes), 1);
            await writer.write(row);
        }
        await writer.close();

        const compressed = await readPromise;

        const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const ihdr = new Uint8Array(13);
        const ihdrView = new DataView(ihdr.buffer);
        ihdrView.setUint32(0, width, false);
        ihdrView.setUint32(4, height, false);
        ihdr[8] = 8;
        ihdr[9] = 6;
        ihdr[10] = 0;
        ihdr[11] = 0;
        ihdr[12] = 0;

        const pngParts = [
            signature,
            createPngChunk('IHDR', ihdr),
            createPngChunk('IDAT', compressed),
            createPngChunk('IEND', new Uint8Array(0))
        ];
        return new Blob(pngParts, { type: 'image/png' });
    }

    /**
     * Updates the UI for a specific card based on its state (has image or not)
     * @param {number} index - The index of the card (0-3)
     */
    function updateCardUI(index) {
        const card = cards[index];
        const hasImage = !!channelSources[index].image;
        card.classList.toggle('has-image', hasImage);
    }

    /**
     * Handles file input (from drag-drop or file selector)
     * @param {File} file - The image file
     * @param {number} index - The index of the card
     */
    function handleFile(file, index) {
        if (!file || !file.type.startsWith('image/')) {
            alert('请上传图片文件!');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                channelSources[index].image = img;
                card.querySelector('.thumbnail').src = e.target.result;
                updateCardUI(index);
                requestPreviewUpdate();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        const card = cards[index];
    }
    
    /**
     * Requests an asynchronous update of the preview canvas.
     * Uses a debounce to prevent too many updates in a short time.
     */
    function requestPreviewUpdate() {
        loadingOverlay.classList.remove('hidden');
        clearTimeout(previewUpdateTimer);
        previewUpdateTimer = setTimeout(async () => {
            await updatePreview();
            loadingOverlay.classList.add('hidden');
        }, 300); // 300ms debounce
    }

    /**
     * Performs the actual merging logic and draws to a canvas.
     * @param {number} width - The output width
     * @param {number} height - The output height
     * @returns {Promise<ImageData>} - Merged ImageData
     */
    async function mergeImages(width, height) {
        return new Promise((resolve) => {
            const sourcePixelData = [null, null, null, null];

            // Pre-process images to get their pixel data at the target resolution
            for (let i = 0; i < 4; i++) {
                if (channelSources[i].image) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(channelSources[i].image, 0, 0, width, height);
                    sourcePixelData[i] = tempCtx.getImageData(0, 0, width, height).data;
                }
            }
            
            const data = new Uint8ClampedArray(width * height * 4);

            for (let i = 0; i < data.length; i += 4) {
                // R channel
                const rSource = channelSources[0];
                const rValue = rSource.image ? sourcePixelData[0][i + channelMap[rSource.sourceChannel]] : rSource.value * 255;
                data[i] = rSource.invert ? 255 - rValue : rValue;
                
                // G channel
                const gSource = channelSources[1];
                const gValue = gSource.image ? sourcePixelData[1][i + channelMap[gSource.sourceChannel]] : gSource.value * 255;
                data[i + 1] = gSource.invert ? 255 - gValue : gValue;

                // B channel
                const bSource = channelSources[2];
                const bValue = bSource.image ? sourcePixelData[2][i + channelMap[bSource.sourceChannel]] : bSource.value * 255;
                data[i + 2] = bSource.invert ? 255 - bValue : bValue;

                // A channel
                const aSource = channelSources[3];
                const aValue = aSource.image ? sourcePixelData[3][i + channelMap[aSource.sourceChannel]] : aSource.value * 255;
                data[i + 3] = aSource.invert ? 255 - aValue : aValue;
            }

            resolve(new ImageData(data, width, height));
        });
    }

    /**
     * Updates the preview canvas with a 512x512 merged image.
     */
    async function updatePreview() {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const mergedImageData = await mergeImages(512, 512);
        previewCtx.putImageData(mergedImageData, 0, 0);
    }

    /**
     * Handles the final merge and download process.
     */
    async function handleMergeAndDownload() {
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        loadingOverlay.classList.remove('hidden');

        try {
            const resolution = parseInt(resolutionSelect.value, 10);
            const mergedImageData = await mergeImages(resolution, resolution);
            const blob = await encodeRgbaToPngBlob(resolution, resolution, mergedImageData.data);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `merged-image-${resolution}x${resolution}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(`导出失败: ${e && e.message ? e.message : String(e)}`);
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge & Download';
            loadingOverlay.classList.add('hidden');
        }
    }

    // --- Event Listeners Setup ---
    cards.forEach((card, index) => {
        const dropZone = card.querySelector('.drop-zone');
        const fileInput = card.querySelector('.file-input');
        const removeBtn = card.querySelector('.remove-btn');
        const channelSelectors = card.querySelectorAll('input[type="radio"]');
        const slider = card.querySelector('input[type="range"]');
        const sliderValue = card.querySelector('.slider-value');
        const invertCheckbox = card.querySelector('.invert-checkbox');

        // Drag and Drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                handleFile(e.dataTransfer.files[0], index);
            }
        });

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                handleFile(fileInput.files[0], index);
            }
        });

        // Remove image
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            channelSources[index].image = null;
            card.querySelector('.thumbnail').src = '';
            fileInput.value = ''; // Reset file input
            updateCardUI(index);
            requestPreviewUpdate();
        });

        // Source channel selection
        channelSelectors.forEach(radio => {
            radio.addEventListener('change', () => {
                channelSources[index].sourceChannel = radio.value;
                requestPreviewUpdate();
            });
        });

        // Slider value
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            channelSources[index].value = value;
            sliderValue.textContent = value.toFixed(2);
            requestPreviewUpdate();
        });

        invertCheckbox.addEventListener('change', () => {
            channelSources[index].invert = invertCheckbox.checked;
            requestPreviewUpdate();
        });

        // Initialize UI
        updateCardUI(index);
        sliderValue.textContent = parseFloat(slider.value).toFixed(2);
        invertCheckbox.checked = channelSources[index].invert;
    });

    mergeBtn.addEventListener('click', handleMergeAndDownload);

    // --- Initial Run ---
    requestPreviewUpdate(); // Generate initial preview
});
