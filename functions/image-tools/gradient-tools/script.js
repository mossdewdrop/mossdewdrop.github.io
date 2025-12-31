document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const gradientList = document.getElementById('gradient-list');
    const addGradientBtn = document.getElementById('add-gradient-btn');
    const bakeBtn = document.getElementById('bake-btn');
    const commentsEl = document.getElementById('comments');
    const rowHeightEl = document.getElementById('row-height');
    const invertYEl = document.getElementById('invert-y');
    const dropZone = document.getElementById('drop-zone');

    // --- App State ---
    let appState = {
        gradients: [],
        settings: {
            comments: '',
            rowHeight: 16,
            invertY: false,
        }
    };
    
    // --- Utility Functions ---
    const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };
    const rgbToHex = (r, g, b) => `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    const lerp = (a, b, t) => a * (1 - t) + b * t;
    const clamp = (val, min, max) => Math.max(min, Math.min(val, max));

    // --- Core Logic ---

    // Interpolation Functions
    function interpolateLinear(stops, t) {
        if (stops.length === 0) return { r: 0, g: 0, b: 0 };
        if (stops.length === 1) return hexToRgb(stops[0].color);
        
        t = clamp(t, 0, 1);
        
        let stop1 = stops[0];
        let stop2 = stops[stops.length - 1];

        const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);

        for (let i = 0; i < sortedStops.length - 1; i++) {
            if (t >= sortedStops[i].pos && t <= sortedStops[i + 1].pos) {
                stop1 = sortedStops[i];
                stop2 = sortedStops[i + 1];
                break;
            }
        }
        
        const range = stop2.pos - stop1.pos;
        const localT = (range === 0) ? 0 : (t - stop1.pos) / range;
        
        const color1 = hexToRgb(stop1.color);
        const color2 = hexToRgb(stop2.color);
        
        return {
            r: Math.round(lerp(color1.r, color2.r, localT)),
            g: Math.round(lerp(color1.g, color2.g, localT)),
            b: Math.round(lerp(color1.b, color2.b, localT)),
        };
    }
    
    function interpolateBSpline(stops, t) {
        if (stops.length < 2) return interpolateLinear(stops, t);

        const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);

        t = clamp(t, 0, 1) * (sortedStops.length - 1);
        const i = Math.floor(t);
        const localT = t - i;
        
        const getPoint = (index) => hexToRgb(sortedStops[clamp(index, 0, sortedStops.length - 1)].color);

        const p0 = getPoint(i - 1);
        const p1 = getPoint(i);
        const p2 = getPoint(i + 1);
        const p3 = getPoint(i + 2);

        const interpolateComponent = (c0, c1, c2, c3) => {
            const v0 = (c2 - c0) * 0.5;
            const v1 = (c3 - c1) * 0.5;
            const t2 = localT * localT;
            const t3 = t2 * localT;
            return Math.round(clamp((2 * c1 - 2 * c2 + v0 + v1) * t3 + (-3 * c1 + 3 * c2 - 2 * v0 - v1) * t2 + v0 * localT + c1, 0, 255));
        };

        return {
            r: interpolateComponent(p0.r, p1.r, p2.r, p3.r),
            g: interpolateComponent(p0.g, p1.g, p2.g, p3.g),
            b: interpolateComponent(p0.b, p1.b, p2.b, p3.b),
        };
    }
    
    function generatePreviewDataUrl(gradient) {
        const canvas = document.createElement('canvas');
        const width = 256;
        canvas.width = width;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');

        const sortedStops = [...gradient.stops].sort((a, b) => a.pos - b.pos);
        const interpolator = gradient.interpolation === 'bspline' ? interpolateBSpline : interpolateLinear;

        for (let x = 0; x < width; x++) {
            const t = x / (width - 1);
            const color = interpolator(sortedStops, t);
            ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.fillRect(x, 0, 1, 1);
        }

        return canvas.toDataURL();
    }
    
    // --- UI Rendering ---
    function render() {
        gradientList.innerHTML = '';
        appState.gradients.forEach(grad => {
            const gradItem = document.createElement('div');
            gradItem.className = 'gradient-item';
            gradItem.dataset.id = grad.id;
            
            const previewUrl = generatePreviewDataUrl(grad);
            const sortedStops = [...grad.stops].sort((a, b) => a.pos - b.pos);

            gradItem.innerHTML = `
                <div class="gradient-bar-wrapper" data-id="${grad.id}">
                    <div class="gradient-bar" style="background-image: url('${previewUrl}'); background-size: 100% 100%;"></div>
                    ${sortedStops.map(stop => {
                        if (!stop.id) stop.id = generateId(); 
                        return `<div class="color-stop" data-grad-id="${grad.id}" data-stop-id="${stop.id}" style="left: ${stop.pos * 100}%; background-color: ${stop.color};"></div>`
                    }).join('')}
                </div>
                <div class="item-controls">
                    <select class="interpolation-select" data-id="${grad.id}">
                        <option value="linear" ${grad.interpolation === 'linear' ? 'selected' : ''}>Linear</option>
                        <option value="bspline" ${grad.interpolation === 'bspline' ? 'selected' : ''}>B-Spline</option>
                    </select>
                    <button class="delete-gradient-btn" data-id="${grad.id}">X</button>
                </div>
            `;
            gradientList.appendChild(gradItem);
        });
        
        commentsEl.value = appState.settings.comments;
        rowHeightEl.value = appState.settings.rowHeight;
        invertYEl.checked = appState.settings.invertY;
    }

    // --- Event Handlers ---
    
    function addGradient() {
        appState.gradients.push({
            id: generateId(),
            interpolation: 'linear',
            stops: [
                { id: generateId(), color: '#ff0000', pos: 0 },
                { id: generateId(), color: '#0000ff', pos: 1 }
            ]
        });
        render();
    }
    
    function handleListClick(e) {
        const target = e.target;
        
        if (target.classList.contains('delete-gradient-btn')) {
            const id = target.dataset.id;
            appState.gradients = appState.gradients.filter(g => g.id !== id);
            render();
        }
        
        if (target.classList.contains('gradient-bar-wrapper') || target.classList.contains('gradient-bar')) {
            if (e.ctrlKey) {
                const id = target.closest('.gradient-item').dataset.id;
                const grad = appState.gradients.find(g => g.id === id);
                if (grad && grad.stops.length < 16) {
                    const rect = target.closest('.gradient-bar-wrapper').getBoundingClientRect();
                    const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                    const color = interpolateLinear(grad.stops, pos);
                    grad.stops.push({ id: generateId(), color: rgbToHex(color.r, color.g, color.b), pos: pos });
                    render();
                }
            }
        }
    }

    function handleListChange(e) {
        const target = e.target;
        if (target.classList.contains('interpolation-select')) {
            const id = target.dataset.id;
            const grad = appState.gradients.find(g => g.id === id);
            if (grad) {
                grad.interpolation = target.value;
                render();
            }
        }
    }

    let draggedStopInfo = null;
    function handleMouseDown(e) {
        if (!e.target.classList.contains('color-stop')) return;

        e.preventDefault();
        const stopEl = e.target;
        const gradId = stopEl.dataset.gradId;
        const stopId = stopEl.dataset.stopId;
        const grad = appState.gradients.find(g => g.id === gradId);
        if (!grad) return;
        const stop = grad.stops.find(s => s.id === stopId);
        if (!stop) return;

        if (e.ctrlKey) {
            if (grad.stops.length > 2) {
                grad.stops = grad.stops.filter(s => s.id !== stopId);
                render();
            }
            return;
        }

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = stop.color;
        
        colorInput.style.position = 'fixed';
        colorInput.style.top = '-100px';
        
        const onColorChange = (event) => {
            stop.color = event.target.value;
            render();
        };

        const onPickerClose = () => {
            colorInput.removeEventListener('input', onColorChange);
            colorInput.removeEventListener('blur', onPickerClose);
            document.body.removeChild(colorInput);
        };

        colorInput.addEventListener('input', onColorChange);
        colorInput.addEventListener('blur', onPickerClose);
        
        document.body.appendChild(colorInput);
        colorInput.click();

        const barWrapper = stopEl.closest('.gradient-bar-wrapper');
        draggedStopInfo = {
            stop: stop,
            barWrapper: barWrapper,
            barRect: barWrapper.getBoundingClientRect()
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e) {
        if (!draggedStopInfo) return;
        const { stop, barRect } = draggedStopInfo;
        const newPos = clamp((e.clientX - barRect.left) / barRect.width, 0, 1);
        stop.pos = newPos;
        render();
    }
    
    function handleMouseUp() {
        draggedStopInfo = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }
    
    function updateSettings() {
        appState.settings.comments = commentsEl.value;
        appState.settings.rowHeight = parseInt(rowHeightEl.value, 10);
        appState.settings.invertY = invertYEl.checked;
    }

    // ==========================================================
    // ==                 FIXED FUNCTION START                 ==
    // ==========================================================
    // --- Image Baking and Metadata ---
    function bakeImage() {
        const canvas = document.createElement('canvas');
        const canvasSize = 256;
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        
        updateSettings();
        const { rowHeight, invertY } = appState.settings;
        
        // **FIX**: Don't reverse the array. The drawing logic will handle the direction.
        const gradientsToRender = appState.gradients;

        let totalYOffset = 0; // Tracks the offset from the starting edge.
        for (const grad of gradientsToRender) {
            const sortedStops = [...grad.stops].sort((a, b) => a.pos - b.pos);
            const interpolator = grad.interpolation === 'bspline' ? interpolateBSpline : interpolateLinear;
            
            for (let y = 0; y < rowHeight && totalYOffset + y < canvasSize; y++) {
                // Calculate the final Y coordinate for the pixel
                let finalY;
                if (invertY) {
                    // Top-to-bottom drawing (starts from Y=0)
                    finalY = totalYOffset + y;
                } else {
                    // Bottom-to-top drawing (starts from Y=255)
                    finalY = (canvasSize - 1) - (totalYOffset + y);
                }

                for (let x = 0; x < canvasSize; x++) {
                    const t = x / (canvasSize - 1);
                    const color = interpolator(sortedStops, t);
                    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
                    ctx.fillRect(x, finalY, 1, 1);
                }
            }
            totalYOffset += rowHeight;
            if (totalYOffset >= canvasSize) break;
        }
        
        return canvas;
    }
    // ==========================================================
    // ==                  FIXED FUNCTION END                  ==
    // ==========================================================

    async function downloadImageWithMetadata() {
        const canvas = bakeImage();
        const dataUrl = canvas.toDataURL('image/png');
        
        updateSettings();
        const stateToSave = JSON.parse(JSON.stringify(appState));
        stateToSave.gradients.forEach(g => g.stops.forEach(s => delete s.id));
        
        const metadataString = JSON.stringify(stateToSave);
        const compressed = pako.deflate(metadataString, { level: 9 });
        
        const blob = await embedDataInPng(dataUrl, 'gradient-tool-data', compressed);
        
        const link = document.createElement('a');
        link.download = 'gradient.png';
        link.href = URL.createObjectURL(blob);
        link.click();
    }
    
    async function embedDataInPng(dataUrl, keyword, data) {
        const response = await fetch(dataUrl);
        const buffer = await response.arrayBuffer();
        const view = new DataView(buffer);
        const uint8Array = new Uint8Array(buffer);

        let iendPos = -1;
        let offset = 8;

        while (offset < view.byteLength) {
            const dataLength = view.getUint32(offset);
            const chunkType = new TextDecoder().decode(buffer.slice(offset + 4, offset + 8));

            if (chunkType === 'IEND') {
                iendPos = offset;
                break;
            }
            offset += 12 + dataLength;
        }

        if (iendPos === -1) {
            throw new Error("IEND chunk not found");
        }

        const keywordBytes = new TextEncoder().encode(keyword);
        const chunkData = new Uint8Array(keywordBytes.length + 2 + data.length);
        chunkData.set(keywordBytes, 0);
        chunkData[keywordBytes.length] = 0;
        chunkData[keywordBytes.length + 1] = 0;
        chunkData.set(data, keywordBytes.length + 2);

        const ztxtChunk = createPngChunk('zTXt', chunkData);

        const newBuffer = new ArrayBuffer(buffer.byteLength + ztxtChunk.byteLength);
        const newView = new Uint8Array(newBuffer);
        
        newView.set(uint8Array.subarray(0, iendPos), 0);
        newView.set(ztxtChunk, iendPos);
        newView.set(uint8Array.subarray(iendPos), iendPos + ztxtChunk.byteLength);
        
        return new Blob([newBuffer], { type: 'image/png' });
    }

    function createPngChunk(type, data) {
        const chunk = new Uint8Array(12 + data.length);
        const view = new DataView(chunk.buffer);
        
        view.setUint32(0, data.length);
        const typeBytes = new TextEncoder().encode(type);
        chunk.set(typeBytes, 4);
        chunk.set(data, 8);
        
        const crc = crc32(chunk.subarray(4, 8 + data.length));
        view.setUint32(8 + data.length, crc);
        
        return chunk;
    }
    
    const crc32Table = (() => {
        let c; const table = [];
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
        return table;
    })();
    function crc32(bytes) {
        let crc = -1;
        for (let i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ crc32Table[(crc ^ bytes[i]) & 0xff];
        }
        return (crc ^ -1) >>> 0;
    }

    // --- Loading from PNG ---
    function handleFileDrop(e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.items && e.dataTransfer.items[0]) {
            const file = e.dataTransfer.items[0].getAsFile();
            if (file && file.type === 'image/png') {
                loadStateFromPng(file);
            }
        }
    }

    async function loadStateFromPng(file) {
        try {
            const buffer = await file.arrayBuffer();
            const view = new Uint8Array(buffer);
            
            let offset = 8;
            while (offset < view.length) {
                const length = new DataView(buffer, offset, 4).getUint32(0);
                const type = new TextDecoder().decode(buffer.slice(offset + 4, offset + 8));

                if (type === 'zTXt') {
                    const chunkData = view.subarray(offset + 8, offset + 8 + length);
                    let keywordEnd = chunkData.indexOf(0);
                    const keyword = new TextDecoder().decode(chunkData.subarray(0, keywordEnd));
                    
                    if (keyword === 'gradient-tool-data') {
                        const compressedData = chunkData.subarray(keywordEnd + 2);
                        const decompressed = pako.inflate(compressedData, { to: 'string' });
                        appState = JSON.parse(decompressed);
                        render();
                        return;
                    }
                }
                offset += 12 + length;
            }
            alert('No valid configuration data found in this image.');
        } catch (error) {
            console.error('Failed to load configuration:', error);
            alert('Failed to load configuration, the file might be corrupted.');
        }
    }
    
    // --- Init ---
    function init() {
        addGradientBtn.addEventListener('click', addGradient);
        gradientList.addEventListener('click', handleListClick);
        gradientList.addEventListener('change', handleListChange);
        gradientList.addEventListener('mousedown', handleMouseDown);
        bakeBtn.addEventListener('click', downloadImageWithMetadata);
        
        [commentsEl, rowHeightEl, invertYEl].forEach(el => el.addEventListener('change', updateSettings));
        
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', handleFileDrop);

        new Sortable(gradientList, {
            animation: 150,
            onEnd: (evt) => {
                const [movedItem] = appState.gradients.splice(evt.oldIndex, 1);
                appState.gradients.splice(evt.newIndex, 0, movedItem);
            }
        });
        
        addGradient();
    }

    init();
});