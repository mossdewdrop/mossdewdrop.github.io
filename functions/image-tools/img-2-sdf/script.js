document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileList = document.getElementById('file-list');
    const startBtn = document.getElementById('start-btn');
    const invertInput = document.getElementById('invert-input');
    const resolutionSelect = document.getElementById('output-resolution');
    const maxDistSlider = document.getElementById('max-distance');
    const maxDistInput = document.getElementById('max-distance-input');

    let filesToProcess = [];

    function clampIntToRange(value, min, max) {
        const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (!Number.isFinite(parsed)) return null;
        const integer = Math.trunc(parsed);
        return Math.max(min, Math.min(max, integer));
    }

    function setMaxDistance(nextValue) {
        const min = parseInt(maxDistSlider.min, 10);
        const max = parseInt(maxDistSlider.max, 10);
        const clamped = clampIntToRange(nextValue, min, max);
        if (clamped === null) return;
        maxDistSlider.value = String(clamped);
        maxDistInput.value = String(clamped);
    }

    setMaxDistance(maxDistSlider.value);

    maxDistSlider.addEventListener('input', () => {
        setMaxDistance(maxDistSlider.value);
    });

    maxDistInput.addEventListener('input', () => {
        if (maxDistInput.value.trim() === '') return;
        setMaxDistance(maxDistInput.value);
    });

    maxDistInput.addEventListener('change', () => {
        if (maxDistInput.value.trim() === '') {
            setMaxDistance(maxDistSlider.value);
            return;
        }
        setMaxDistance(maxDistInput.value);
    });

    // 拖放事件处理
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
    
    // 也允许点击选择文件
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
                addFileToList(file);
            }
        }
    }

    function addFileToList(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const id = `file-${Date.now()}-${Math.random()}`;
            const li = document.createElement('li');
            li.className = 'file-item';
            li.id = id;
            li.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="progress-bar">
                        <div class="progress-bar-inner"></div>
                    </div>
                </div>
                <button class="delete-btn">&times;</button>
            `;
            fileList.appendChild(li);

            const fileData = { id, file, element: li };
            filesToProcess.push(fileData);

            li.querySelector('.delete-btn').addEventListener('click', () => {
                filesToProcess = filesToProcess.filter(f => f.id !== id);
                li.remove();
            });
        };
        reader.readAsDataURL(file);
    }

    // Start processing
    startBtn.addEventListener('click', async () => {
        if (filesToProcess.length === 0) {
            alert('Please add images first!');
            return;
        }

        startBtn.disabled = true;
        startBtn.textContent = 'Processing...';

        const params = {
            invert: invertInput.checked,
            resolution: resolutionSelect.value,
            maxDistance: parseInt(maxDistSlider.value, 10),
        };

        // Create a Promise pool for parallel processing
        const processingPromises = filesToProcess.map(fileData => {
            return processImage(fileData, params);
        });

        await Promise.all(processingPromises);

        startBtn.disabled = false;
        startBtn.textContent = 'Start Processing';
        // alert('All images processed!');
    });

    function processImage(fileData, params) {
        return new Promise(async (resolve, reject) => {
            const { id, file, element } = fileData;
            const progressBar = element.querySelector('.progress-bar');
            const progressBarInner = element.querySelector('.progress-bar-inner');
            progressBar.style.display = 'block';
            progressBarInner.style.width = '0%';

            // Use createImageBitmap, as it is more worker-friendly
            const imageBitmap = await createImageBitmap(file);

            const worker = new Worker('worker.js');

            worker.onmessage = (e) => {
                const { type, payload } = e.data;
                if (type === 'progress') {
                    progressBarInner.style.width = `${payload.progress}%`;
                } else if (type === 'result') {
                    const { imageData } = payload;
                    downloadImage(imageData, file.name);
                    worker.terminate();
                    resolve();
                } else if (type === 'error') {
                    console.error(`Error processing ${file.name}:`, payload.message);
                    worker.terminate();
                    reject(payload.message);
                }
            };
            
            worker.onerror = (e) => {
                console.error('Worker error:', e);
                reject(e);
            }

            // Send data to worker, second argument is transferable objects for performance
            worker.postMessage({ imageBitmap, params }, [imageBitmap]);
        });
    }

    function downloadImage(imageData, originalName) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        const link = document.createElement('a');
        const filename = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        link.download = `${filename}_sdf.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
});
