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
        { image: null, sourceChannel: 'R', value: 0 },    // Target R
        { image: null, sourceChannel: 'G', value: 0 },    // Target G
        { image: null, sourceChannel: 'B', value: 0 },    // Target B
        { image: null, sourceChannel: 'A', value: 1 }     // Target A
    ];

    const channelMap = { R: 0, G: 1, B: 2, A: 3 };

    let previewUpdateTimer;

    // --- Main Logic ---

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
     * @returns {Promise<HTMLCanvasElement>} - A canvas with the merged image
     */
    async function mergeImages(width, height) {
        return new Promise((resolve) => {
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;
            const ctx = offscreenCanvas.getContext('2d');

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
            
            const targetImageData = ctx.createImageData(width, height);
            const data = targetImageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // R channel
                const rSource = channelSources[0];
                data[i] = rSource.image ? sourcePixelData[0][i + channelMap[rSource.sourceChannel]] : rSource.value * 255;
                
                // G channel
                const gSource = channelSources[1];
                data[i + 1] = gSource.image ? sourcePixelData[1][i + channelMap[gSource.sourceChannel]] : gSource.value * 255;

                // B channel
                const bSource = channelSources[2];
                data[i + 2] = bSource.image ? sourcePixelData[2][i + channelMap[bSource.sourceChannel]] : bSource.value * 255;

                // A channel
                const aSource = channelSources[3];
                data[i + 3] = aSource.image ? sourcePixelData[3][i + channelMap[aSource.sourceChannel]] : aSource.value * 255;
            }

            ctx.putImageData(targetImageData, 0, 0);
            resolve(offscreenCanvas);
        });
    }

    /**
     * Updates the preview canvas with a 512x512 merged image.
     */
    async function updatePreview() {
        const mergedCanvas = await mergeImages(512, 512);
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(mergedCanvas, 0, 0);
    }

    /**
     * Handles the final merge and download process.
     */
    async function handleMergeAndDownload() {
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        loadingOverlay.classList.remove('hidden');

        const resolution = parseInt(resolutionSelect.value, 10);
        const finalCanvas = await mergeImages(resolution, resolution);

        finalCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `merged-image-${resolution}x${resolution}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge & Download';
            loadingOverlay.classList.add('hidden');
        }, 'image/png');
    }

    // --- Event Listeners Setup ---
    cards.forEach((card, index) => {
        const dropZone = card.querySelector('.drop-zone');
        const fileInput = card.querySelector('.file-input');
        const removeBtn = card.querySelector('.remove-btn');
        const channelSelectors = card.querySelectorAll('input[type="radio"]');
        const slider = card.querySelector('input[type="range"]');
        const sliderValue = card.querySelector('.slider-value');

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

        // Initialize UI
        updateCardUI(index);
        sliderValue.textContent = parseFloat(slider.value).toFixed(2);
    });

    mergeBtn.addEventListener('click', handleMergeAndDownload);

    // --- Initial Run ---
    requestPreviewUpdate(); // Generate initial preview
});