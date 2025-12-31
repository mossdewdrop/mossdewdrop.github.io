document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const dropZoneText = document.getElementById('drop-zone-text');
    const imageContainer = document.getElementById('image-container');
    const uploadedImage = document.getElementById('uploaded-image');
    const clearButton = document.getElementById('clear-button');
    const exportButton = document.getElementById('export-button');

    let selections = [];
    let isDrawing = false;
    let startX, startY;
    let currentSelectionBox = null;
    let originalFileName = '';
    let selectionCounter = 0;

    // --- Drag and Drop Logic ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFile(file);
        } else {
            alert('Please drag and drop an image file!');
        }
    });

    function handleFile(file) {
        clearAllSelections();
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage.src = e.target.result;
            uploadedImage.style.display = 'block';
            dropZoneText.style.display = 'none';
        };
        reader.readAsDataURL(file);
        originalFileName = file.name.split('.').slice(0, -1).join('.');
    }
    
    // ---  Prevent default image dragging behavior ---
    uploadedImage.addEventListener('dragstart', (e) => e.preventDefault());


    // --- Selection Logic---

    // 1. Start Drawing (Mouse down on image container)
    imageContainer.addEventListener('mousedown', (e) => {
        // Must hold Ctrl or Command key, and image must be loaded
        if ((!e.ctrlKey && !e.metaKey) || !uploadedImage.src) return;

        // Prevent browser's default image dragging behavior during selection
        e.preventDefault();

        isDrawing = true;
        const rect = imageContainer.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        currentSelectionBox = document.createElement('div');
        currentSelectionBox.className = 'selection-box';
        imageContainer.appendChild(currentSelectionBox);

        // Bind mousemove and mouseup listeners to document
        // This ensures it works even if the mouse moves out of the image area
        document.addEventListener('mousemove', onDrawing);
        document.addEventListener('mouseup', onStopDrawing, { once: true }); // { once: true } ensures the event is triggered only once and then removed
    });

    // 2. Drawing (Mouse move on the entire document)
    function onDrawing(e) {
        if (!isDrawing) return;

        const rect = imageContainer.getBoundingClientRect();
        let currentX = e.clientX - rect.left;
        let currentY = e.clientY - rect.top;
        
        // Limit selection box within image bounds
        currentX = Math.max(0, Math.min(currentX, imageContainer.clientWidth));
        currentY = Math.max(0, Math.min(currentY, imageContainer.clientHeight));

        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);

        currentSelectionBox.style.left = `${left}px`;
        currentSelectionBox.style.top = `${top}px`;
        currentSelectionBox.style.width = `${width}px`;
        currentSelectionBox.style.height = `${height}px`;
    }

    // 3. Stop Drawing (Mouse up on the entire document)
    function onStopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        
        // Remove event listeners from document
        document.removeEventListener('mousemove', onDrawing);

        const width = parseFloat(currentSelectionBox.style.width);
        const height = parseFloat(currentSelectionBox.style.height);

        // Do not create if selection is too small
        if (width < 5 || height < 5) {
            currentSelectionBox.remove();
            currentSelectionBox = null;
            return;
        }

        const id = ++selectionCounter;
        const newSelection = {
            id: id,
            x: parseFloat(currentSelectionBox.style.left),
            y: parseFloat(currentSelectionBox.style.top),
            width: width,
            height: height,
            element: currentSelectionBox
        };
        selections.push(newSelection);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSelection(id);
        };
        currentSelectionBox.appendChild(deleteBtn);

        currentSelectionBox = null;
        updateUIState();
    }


    // --- Buttons and State Management ---
    function deleteSelection(id) {
        const index = selections.findIndex(s => s.id === id);
        if (index > -1) {
            selections[index].element.remove();
            selections.splice(index, 1);
            updateUIState();
        }
    }

    function clearAllSelections() {
        selections.forEach(s => s.element.remove());
        selections = [];
        selectionCounter = 0; // Reset counter
        updateUIState();
    }

    clearButton.addEventListener('click', clearAllSelections);

    function updateUIState() {
        exportButton.disabled = selections.length === 0;
    }

    // --- Export Logic  ---
    exportButton.addEventListener('click', () => {
        if (selections.length === 0) return;

        const img = new Image();
        img.onload = () => {
            const scaleX = img.naturalWidth / uploadedImage.width;
            const scaleY = img.naturalHeight / uploadedImage.height;

            selections.forEach(sel => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const sourceX = sel.x * scaleX;
                const sourceY = sel.y * scaleY;
                const sourceWidth = sel.width * scaleX;
                const sourceHeight = sel.height * scaleY;

                canvas.width = sourceWidth;
                canvas.height = sourceHeight;

                ctx.drawImage(
                    img,
                    sourceX, sourceY, sourceWidth, sourceHeight,
                    0, 0, sourceWidth, sourceHeight
                );

                canvas.toBlob(blob => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `${originalFileName}_${sel.id}.png`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                }, 'image/png');
            });
        };
        img.src = uploadedImage.src;
    });
});