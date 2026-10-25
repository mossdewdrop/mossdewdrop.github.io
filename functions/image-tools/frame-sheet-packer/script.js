/**
 * Frame Sheet Packer
 * - Merge mode: import a sequence of images, reorder them, pack them into one or more frame sheets.
 * - Split mode: import frame sheets and slice each of them into a numbered frame sequence.
 * - Everything is processed locally in the browser; no uploads.
 */
(function () {
    'use strict';

    // ===== State =====
    const state = {
        mode: 'merge',
        frames: [],          // { id, name, image, url, width, height, thumb }
        page: 0,             // currently previewed sheet in merge mode
        sheets: [],          // { id, name, baseName, image, url, width, height, thumb }
        currentSheet: 0,     // currently previewed sheet in split mode
        dragId: null,
        busy: false
    };

    let uid = 0;
    const nextId = () => 'item_' + (++uid);

    // ===== DOM =====
    const $ = (id) => document.getElementById(id);
    const els = {
        modeButtons: Array.from(document.querySelectorAll('.mode-btn')),
        topbarHint: $('topbarHint'),

        mergeView: $('mergeView'),
        frameCount: $('frameCount'),
        sortBtn: $('sortBtn'),
        frameList: $('frameList'),
        mergeDropHint: $('mergeDropHint'),
        projectName: $('projectName'),
        sheetInfo: $('sheetInfo'),
        mergeStage: $('mergeStage'),
        previewCanvas: $('previewCanvas'),
        mergeEmpty: $('mergeEmpty'),
        pager: $('pager'),
        pagerPrev: $('pagerPrev'),
        pagerNext: $('pagerNext'),
        pagerText: $('pagerText'),
        orderSelect: $('orderSelect'),
        colsInput: $('colsInput'),
        rowsInput: $('rowsInput'),
        perSheetInfo: $('perSheetInfo'),
        exportW: $('exportW'),
        exportH: $('exportH'),
        forceSquare: $('forceSquare'),
        outputInfo: $('outputInfo'),
        downloadBtn: $('downloadBtn'),

        splitView: $('splitView'),
        sheetCount: $('sheetCount'),
        sheetList: $('sheetList'),
        splitDropHint: $('splitDropHint'),
        splitSheetName: $('splitSheetName'),
        splitStage: $('splitStage'),
        splitPreview: $('splitPreview'),
        splitEmpty: $('splitEmpty'),
        splitOrder: $('splitOrder'),
        splitCols: $('splitCols'),
        splitRows: $('splitRows'),
        splitGridInfo: $('splitGridInfo'),
        splitOutputInfo: $('splitOutputInfo'),
        splitDownloadBtn: $('splitDownloadBtn'),

        fileInput: $('fileInput')
    };

    // ===== Utilities =====
    function isImageFile(file) {
        return file.type.startsWith('image/') ||
            /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
    }

    function readPositiveInt(value, fallback) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0) return fallback;
        return Math.min(n, 256);
    }

    function readResolution(value) {
        const n = parseInt(value, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function padNumber(n) {
        return String(n).padStart(3, '0');
    }

    function sanitizeName(raw, fallback) {
        const cleaned = String(raw || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
        return cleaned || fallback;
    }

    function baseNameOf(fileName) {
        return String(fileName || '').replace(/\.[^.]+$/, '');
    }

    function uniqueFolderName(base, used) {
        let candidate = base;
        let index = 2;
        while (used.has(candidate.toLowerCase())) {
            candidate = base + '_' + index;
            index += 1;
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    function isTypingTarget(el) {
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' || el.isContentEditable);
    }

    function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                if (!img.naturalWidth || !img.naturalHeight) {
                    URL.revokeObjectURL(url);
                    reject(new Error('Invalid image: ' + file.name));
                    return;
                }
                resolve({
                    image: img,
                    url: url,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Unable to load image: ' + file.name));
            };
            img.src = url;
        });
    }

    function makeThumb(image, maxSize) {
        const limit = maxSize || 84;
        const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Unable to encode PNG.'));
            }, 'image/png');
        });
    }

    function triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function drawImageContain(ctx, image, x, y, w, h) {
        const iw = image.naturalWidth || image.width;
        const ih = image.naturalHeight || image.height;
        if (!iw || !ih) return;
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function fitPreviewCanvas(canvas, stage) {
        const style = getComputedStyle(stage);
        const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const availW = Math.max(1, stage.clientWidth - padX);
        const availH = Math.max(1, stage.clientHeight - padY);
        const scale = Math.min(availW / canvas.width, availH / canvas.height);
        canvas.style.width = Math.max(1, Math.round(canvas.width * scale)) + 'px';
        canvas.style.height = Math.max(1, Math.round(canvas.height * scale)) + 'px';
    }

    // ===== ZIP writer (store only, no dependencies) =====
    let crcTable = null;

    function getCrcTable() {
        if (crcTable) return crcTable;
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[n] = c >>> 0;
        }
        return crcTable;
    }

    function crc32(bytes) {
        const table = getCrcTable();
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function createZip(entries) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        const now = new Date();
        const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) |
            Math.floor(now.getSeconds() / 2)) & 0xFFFF;
        const dosDate = (((now.getFullYear() - 1980) << 9) |
            ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
        let offset = 0;

        entries.forEach((entry) => {
            const nameBytes = encoder.encode(entry.name);
            const data = entry.data;
            const crc = crc32(data);
            const size = data.length;

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);      // version needed
            lv.setUint16(6, 0x0800, true);  // UTF-8 file names
            lv.setUint16(8, 0, true);       // method: store
            lv.setUint16(10, dosTime, true);
            lv.setUint16(12, dosDate, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, size, true);
            lv.setUint32(22, size, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            local.set(nameBytes, 30);
            localParts.push(local, data);

            const central = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(central.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);      // version made by
            cv.setUint16(6, 20, true);      // version needed
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, dosTime, true);
            cv.setUint16(14, dosDate, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, size, true);
            cv.setUint32(24, size, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);      // extra length
            cv.setUint16(32, 0, true);      // comment length
            cv.setUint16(34, 0, true);      // disk number
            cv.setUint16(36, 0, true);      // internal attributes
            cv.setUint32(38, 0, true);      // external attributes
            cv.setUint32(42, offset, true); // local header offset
            central.set(nameBytes, 46);
            centralParts.push(central);

            offset += local.length + size;
        });

        const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);
        ev.setUint16(20, 0, true);

        return new Blob(localParts.concat(centralParts, [end]), { type: 'application/zip' });
    }

    // ===== Merge layout =====
    function resolveCellSize() {
        let baseW = 1;
        let baseH = 1;
        state.frames.forEach((frame) => {
            baseW = Math.max(baseW, frame.width);
            baseH = Math.max(baseH, frame.height);
        });

        let w = readResolution(els.exportW.value);
        let h = readResolution(els.exportH.value);

        if (w && h) {
            // Both explicit
        } else if (w) {
            h = Math.round(w * baseH / baseW);
        } else if (h) {
            w = Math.round(h * baseW / baseH);
        } else {
            w = baseW;
            h = baseH;
        }

        if (els.forceSquare.checked) {
            const side = Math.max(w, h);
            w = side;
            h = side;
        }

        return {
            w: Math.max(1, Math.round(w)),
            h: Math.max(1, Math.round(h))
        };
    }

    function getMergeLayout() {
        const cols = readPositiveInt(els.colsInput.value, 4);
        const rows = readPositiveInt(els.rowsInput.value, 4);
        const perSheet = cols * rows;
        const sheetCount = Math.max(1, Math.ceil(state.frames.length / perSheet));
        return {
            cols: cols,
            rows: rows,
            perSheet: perSheet,
            sheetCount: sheetCount,
            cell: resolveCellSize(),
            order: els.orderSelect.value
        };
    }

    function paintSheet(canvas, sheetIndex, layout) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const start = sheetIndex * layout.perSheet;
        for (let i = 0; i < layout.perSheet; i += 1) {
            const frame = state.frames[start + i];
            if (!frame) break;
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);
            const drawRow = layout.order === 'bl' ? layout.rows - 1 - row : row;
            drawImageContain(
                ctx,
                frame.image,
                col * layout.cell.w,
                drawRow * layout.cell.h,
                layout.cell.w,
                layout.cell.h
            );
        }
    }

    // ===== Merge preview =====
    function renderMergePreview() {
        const frames = state.frames;
        els.frameCount.textContent = String(frames.length);

        const layout = getMergeLayout();
        els.perSheetInfo.textContent = layout.perSheet + ' / sheet';

        if (state.page >= layout.sheetCount) state.page = layout.sheetCount - 1;
        if (state.page < 0) state.page = 0;

        const sheetW = layout.cell.w * layout.cols;
        const sheetH = layout.cell.h * layout.rows;

        els.mergeStage.classList.toggle('is-empty', !frames.length);

        if (!frames.length) {
            els.previewCanvas.classList.remove('visible');
            els.mergeEmpty.classList.remove('hidden');
            els.pager.classList.remove('visible');
            els.sheetInfo.textContent = '';
            els.outputInfo.textContent = 'Add frames to preview the result';
            return;
        }

        const canvas = els.previewCanvas;
        if (canvas.width !== sheetW || canvas.height !== sheetH) {
            canvas.width = sheetW;
            canvas.height = sheetH;
        }
        paintSheet(canvas, state.page, layout);

        canvas.classList.add('visible');
        els.mergeEmpty.classList.add('hidden');
        fitPreviewCanvas(canvas, els.mergeStage);
        els.pager.classList.toggle('visible', layout.sheetCount > 1);
        els.pagerText.textContent = (state.page + 1) + '/' + layout.sheetCount;

        els.sheetInfo.textContent = layout.sheetCount + (layout.sheetCount > 1 ? ' sheets' : ' sheet');
        els.outputInfo.textContent = frames.length + (frames.length === 1 ? ' frame · ' : ' frames · ') +
            layout.cell.w + '×' + layout.cell.h + ' px per frame · ' +
            sheetW + '×' + sheetH + ' px per sheet';
    }

    function stepPage(dir) {
        if (state.mode !== 'merge' || !state.frames.length) return;
        const layout = getMergeLayout();
        if (layout.sheetCount <= 1) return;
        state.page = (state.page + dir + layout.sheetCount) % layout.sheetCount;
        renderMergePreview();
    }

    // ===== Merge: frame list =====
    function renderFrameList() {
        const list = els.frameList;
        list.innerHTML = '';

        state.frames.forEach((frame, index) => {
            const item = document.createElement('li');
            item.className = 'file-item';
            item.dataset.id = frame.id;
            item.draggable = true;
            item.title = frame.name;

            const thumb = document.createElement('img');
            thumb.className = 'file-thumb';
            thumb.src = frame.thumb;
            thumb.alt = frame.name;
            thumb.draggable = false;

            const meta = document.createElement('div');
            meta.className = 'file-meta';
            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = frame.name;
            const sub = document.createElement('div');
            sub.className = 'file-sub';
            sub.textContent = '#' + (index + 1) + ' · ' + frame.width + '×' + frame.height;
            meta.appendChild(name);
            meta.appendChild(sub);

            const remove = document.createElement('button');
            remove.className = 'remove-btn';
            remove.textContent = '×';
            remove.title = 'Remove this frame';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFrame(frame.id);
            });

            item.appendChild(thumb);
            item.appendChild(meta);
            item.appendChild(remove);
            list.appendChild(item);

            // Drag reordering
            item.addEventListener('dragstart', (e) => {
                state.dragId = frame.id;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', frame.id);
            });
            item.addEventListener('dragend', () => {
                state.dragId = null;
                item.classList.remove('dragging');
                clearDropMarks();
            });
            item.addEventListener('dragover', (e) => {
                if (!state.dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = item.getBoundingClientRect();
                const before = (e.clientY - rect.top) < rect.height / 2;
                item.classList.toggle('drop-before', before);
                item.classList.toggle('drop-after', !before);
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drop-before', 'drop-after');
            });
            item.addEventListener('drop', (e) => {
                if (!state.dragId) return;
                e.preventDefault();
                e.stopPropagation();
                const before = item.classList.contains('drop-before');
                reorderFrames(state.dragId, frame.id, before);
                clearDropMarks();
                state.dragId = null;
            });
        });

        els.frameCount.textContent = String(state.frames.length);
    }

    function clearDropMarks() {
        els.frameList.querySelectorAll('.drop-before, .drop-after').forEach((el) => {
            el.classList.remove('drop-before', 'drop-after');
        });
    }

    function reorderFrames(draggedId, targetId, before) {
        if (draggedId === targetId) return;
        const from = state.frames.findIndex((f) => f.id === draggedId);
        if (from < 0) return;
        const moved = state.frames.splice(from, 1)[0];
        let insertAt = state.frames.findIndex((f) => f.id === targetId);
        if (insertAt < 0) insertAt = state.frames.length;
        if (!before) insertAt += 1;
        state.frames.splice(insertAt, 0, moved);
        renderFrameList();
        scheduleRender();
    }

    function removeFrame(id) {
        const index = state.frames.findIndex((f) => f.id === id);
        if (index < 0) return;
        URL.revokeObjectURL(state.frames[index].url);
        state.frames.splice(index, 1);
        renderFrameList();
        scheduleRender();
    }

    // ===== Split: sheet list =====
    function renderSheetList() {
        const list = els.sheetList;
        list.innerHTML = '';

        state.sheets.forEach((sheet, index) => {
            const item = document.createElement('li');
            item.className = 'file-item selectable' +
                (index === state.currentSheet ? ' selected' : '');
            item.title = sheet.name;

            const thumb = document.createElement('img');
            thumb.className = 'file-thumb';
            thumb.src = sheet.thumb;
            thumb.alt = sheet.name;
            thumb.draggable = false;

            const meta = document.createElement('div');
            meta.className = 'file-meta';
            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = sheet.name;
            const sub = document.createElement('div');
            sub.className = 'file-sub';
            sub.textContent = sheet.width + '×' + sheet.height;
            meta.appendChild(name);
            meta.appendChild(sub);

            const remove = document.createElement('button');
            remove.className = 'remove-btn';
            remove.textContent = '×';
            remove.title = 'Remove this sheet';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                removeSheet(sheet.id);
            });

            item.appendChild(thumb);
            item.appendChild(meta);
            item.appendChild(remove);
            item.addEventListener('click', () => {
                state.currentSheet = index;
                renderSheetList();
                renderSplitPreview();
            });
            list.appendChild(item);
        });

        els.sheetCount.textContent = String(state.sheets.length);
    }

    function removeSheet(id) {
        const index = state.sheets.findIndex((s) => s.id === id);
        if (index < 0) return;
        URL.revokeObjectURL(state.sheets[index].url);
        state.sheets.splice(index, 1);
        if (state.currentSheet >= state.sheets.length) {
            state.currentSheet = state.sheets.length - 1;
        }
        if (state.currentSheet < 0) state.currentSheet = 0;
        renderSheetList();
        renderSplitPreview();
    }

    // ===== Split preview =====
    function getSplitGrid() {
        return {
            cols: readPositiveInt(els.splitCols.value, 4),
            rows: readPositiveInt(els.splitRows.value, 4),
            order: els.splitOrder.value
        };
    }

    function drawSplitGrid(ctx, width, height, grid) {
        const cellW = Math.max(1, Math.floor(width / grid.cols));
        const cellH = Math.max(1, Math.floor(height / grid.rows));
        const base = Math.max(1, Math.round(Math.max(width, height) / 1600));

        ctx.save();
        const path = new Path2D();
        for (let c = 1; c < grid.cols; c += 1) {
            const x = c * cellW + 0.5;
            path.moveTo(x, 0);
            path.lineTo(x, height);
        }
        for (let r = 1; r < grid.rows; r += 1) {
            const y = r * cellH + 0.5;
            path.moveTo(0, y);
            path.lineTo(width, y);
        }
        ctx.lineWidth = base * 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.stroke(path);
        ctx.lineWidth = base;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke(path);
        ctx.restore();

        const fontSize = Math.round(Math.min(cellW, cellH) * 0.16);
        if (fontSize >= 10) {
            ctx.save();
            ctx.font = '600 ' + fontSize + 'px -apple-system, "Segoe UI", sans-serif';
            ctx.textBaseline = 'top';
            const pad = Math.max(3, Math.round(fontSize * 0.25));
            const total = grid.cols * grid.rows;
            for (let i = 0; i < total; i += 1) {
                const col = i % grid.cols;
                const row = Math.floor(i / grid.cols);
                const drawRow = grid.order === 'bl' ? grid.rows - 1 - row : row;
                const x = col * cellW + pad;
                const y = drawRow * cellH + pad;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillText(String(i + 1), x + base, y + base);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(String(i + 1), x, y);
            }
            ctx.restore();
        }

        return { cellW: cellW, cellH: cellH };
    }

    function renderSplitPreview() {
        els.sheetCount.textContent = String(state.sheets.length);
        const sheet = state.sheets[state.currentSheet];
        const grid = getSplitGrid();
        const gridFrames = grid.cols * grid.rows;
        els.splitGridInfo.textContent = grid.cols + '×' + grid.rows + ' = ' +
            gridFrames + (gridFrames === 1 ? ' frame' : ' frames');

        els.splitStage.classList.toggle('is-empty', !sheet);

        if (!sheet) {
            els.splitPreview.classList.remove('visible');
            els.splitEmpty.classList.remove('hidden');
            els.splitSheetName.textContent = 'No sheet selected';
            els.splitOutputInfo.textContent = 'Each frame: —';
            return;
        }

        els.splitSheetName.textContent = sheet.name;

        const canvas = els.splitPreview;
        if (canvas.width !== sheet.width || canvas.height !== sheet.height) {
            canvas.width = sheet.width;
            canvas.height = sheet.height;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sheet.image, 0, 0);
        const cell = drawSplitGrid(ctx, sheet.width, sheet.height, grid);

        canvas.classList.add('visible');
        els.splitEmpty.classList.add('hidden');
        fitPreviewCanvas(canvas, els.splitStage);
        els.splitOutputInfo.textContent = 'Each frame: ' + cell.cellW + '×' + cell.cellH +
            ' px · ' + gridFrames + (gridFrames === 1 ? ' frame' : ' frames') + ' per sheet';
    }

    // ===== Rendering scheduler =====
    let renderQueued = false;

    function scheduleRender() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(() => {
            renderQueued = false;
            if (state.mode === 'merge') renderMergePreview();
            else renderSplitPreview();
        });
    }

    // ===== Import =====
    async function importFiles(files, mode) {
        const images = Array.from(files).filter(isImageFile);
        if (!images.length) return;

        if (mode === 'merge') {
            for (const file of images) {
                try {
                    const loaded = await loadImageFile(file);
                    state.frames.push({
                        id: nextId(),
                        name: file.name,
                        image: loaded.image,
                        url: loaded.url,
                        width: loaded.width,
                        height: loaded.height,
                        thumb: makeThumb(loaded.image)
                    });
                } catch (err) {
                    console.error(err);
                    alert(err.message);
                }
            }
            renderFrameList();
        } else {
            const wasEmpty = state.sheets.length === 0;
            for (const file of images) {
                try {
                    const loaded = await loadImageFile(file);
                    state.sheets.push({
                        id: nextId(),
                        name: file.name,
                        baseName: baseNameOf(file.name),
                        image: loaded.image,
                        url: loaded.url,
                        width: loaded.width,
                        height: loaded.height,
                        thumb: makeThumb(loaded.image)
                    });
                } catch (err) {
                    console.error(err);
                    alert(err.message);
                }
            }
            if (wasEmpty) state.currentSheet = 0;
            renderSheetList();
        }

        scheduleRender();
    }

    function openPicker() {
        els.fileInput.click();
    }

    // ===== Export: merge =====
    async function downloadMerge() {
        if (!state.frames.length) {
            alert('Please add frames first.');
            return;
        }
        if (state.busy) return;

        const layout = getMergeLayout();
        const projectName = sanitizeName(els.projectName.value, 'frame_sheet');
        const button = els.downloadBtn;
        const originalLabel = button.textContent;

        state.busy = true;
        button.disabled = true;

        try {
            if (layout.sheetCount === 1) {
                button.textContent = 'Rendering…';
                const canvas = document.createElement('canvas');
                canvas.width = layout.cell.w * layout.cols;
                canvas.height = layout.cell.h * layout.rows;
                paintSheet(canvas, 0, layout);
                const blob = await canvasToBlob(canvas);
                triggerDownload(blob, projectName + '.png');
            } else {
                const entries = [];
                const canvas = document.createElement('canvas');
                canvas.width = layout.cell.w * layout.cols;
                canvas.height = layout.cell.h * layout.rows;
                for (let i = 0; i < layout.sheetCount; i += 1) {
                    button.textContent = 'Rendering ' + (i + 1) + '/' + layout.sheetCount + '…';
                    paintSheet(canvas, i, layout);
                    const blob = await canvasToBlob(canvas);
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    entries.push({
                        name: projectName + '_' + padNumber(i + 1) + '.png',
                        data: bytes
                    });
                }
                button.textContent = 'Packaging ZIP…';
                triggerDownload(createZip(entries), projectName + '.zip');
            }
        } catch (err) {
            console.error(err);
            alert('Export failed: ' + err.message);
        } finally {
            state.busy = false;
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }

    // ===== Export: split =====
    async function downloadSplit() {
        if (!state.sheets.length) {
            alert('Please add at least one sheet image first.');
            return;
        }
        if (state.busy) return;

        const grid = getSplitGrid();
        const totalFrames = grid.cols * grid.rows;
        const button = els.splitDownloadBtn;
        const originalLabel = button.textContent;

        state.busy = true;
        button.disabled = true;

        try {
            const entries = [];
            const usedNames = new Set();
            const cellCanvas = document.createElement('canvas');
            const ctx = cellCanvas.getContext('2d');

            for (let s = 0; s < state.sheets.length; s += 1) {
                const sheet = state.sheets[s];
                button.textContent = 'Exporting ' + (s + 1) + '/' + state.sheets.length + '…';

                const folder = uniqueFolderName(
                    sanitizeName(sheet.baseName, 'sheet'),
                    usedNames
                );
                const cellW = Math.max(1, Math.floor(sheet.width / grid.cols));
                const cellH = Math.max(1, Math.floor(sheet.height / grid.rows));
                cellCanvas.width = cellW;
                cellCanvas.height = cellH;

                for (let i = 0; i < totalFrames; i += 1) {
                    const col = i % grid.cols;
                    const row = Math.floor(i / grid.cols);
                    const sourceY = (grid.order === 'bl' ? grid.rows - 1 - row : row) * cellH;

                    ctx.clearRect(0, 0, cellW, cellH);
                    ctx.drawImage(
                        sheet.image,
                        col * cellW,
                        sourceY,
                        cellW,
                        cellH,
                        0,
                        0,
                        cellW,
                        cellH
                    );

                    const blob = await canvasToBlob(cellCanvas);
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    entries.push({
                        name: folder + '/' + folder + '_' + padNumber(i + 1) + '.png',
                        data: bytes
                    });
                }
            }

            button.textContent = 'Packaging ZIP…';
            triggerDownload(createZip(entries), 'split_frames.zip');
        } catch (err) {
            console.error(err);
            alert('Export failed: ' + err.message);
        } finally {
            state.busy = false;
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }

    // ===== Mode switching =====
    function setMode(mode) {
        state.mode = mode;
        els.modeButtons.forEach((button) => {
            const active = button.dataset.mode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        els.mergeView.classList.toggle('hidden', mode !== 'merge');
        els.splitView.classList.toggle('hidden', mode !== 'split');
        els.topbarHint.textContent = mode === 'merge'
            ? 'Drop a sequence of images to pack them into frame sheets'
            : 'Drop frame sheets to split them into numbered frame sequences';
        scheduleRender();
    }

    // ===== Events =====
    function bindEvents() {
        els.modeButtons.forEach((button) => {
            button.addEventListener('click', () => setMode(button.dataset.mode));
        });

        // Click-to-browse (empty workspace only)
        els.mergeStage.addEventListener('click', () => {
            if (!state.frames.length) openPicker();
        });
        els.splitStage.addEventListener('click', () => {
            if (!state.sheets.length) openPicker();
        });
        els.mergeDropHint.addEventListener('click', () => openPicker());
        els.splitDropHint.addEventListener('click', () => openPicker());
        els.pager.addEventListener('click', (e) => e.stopPropagation());

        els.fileInput.addEventListener('change', () => {
            const files = Array.from(els.fileInput.files || []);
            els.fileInput.value = '';
            if (files.length) importFiles(files, state.mode);
        });

        // Frame sorting
        els.sortBtn.addEventListener('click', () => {
            state.frames.sort((a, b) => a.name.localeCompare(b.name, undefined, {
                numeric: true,
                sensitivity: 'base'
            }));
            state.page = 0;
            renderFrameList();
            scheduleRender();
        });

        // Pager
        els.pagerPrev.addEventListener('click', () => stepPage(-1));
        els.pagerNext.addEventListener('click', () => stepPage(1));

        // Merge settings
        [els.orderSelect, els.colsInput, els.rowsInput,
            els.exportW, els.exportH, els.forceSquare].forEach((el) => {
            el.addEventListener('input', scheduleRender);
            el.addEventListener('change', scheduleRender);
        });

        // Split settings
        [els.splitOrder, els.splitCols, els.splitRows].forEach((el) => {
            el.addEventListener('input', scheduleRender);
            el.addEventListener('change', scheduleRender);
        });

        // Normalize numeric grid inputs on blur
        [[els.colsInput, 4], [els.rowsInput, 4],
            [els.splitCols, 4], [els.splitRows, 4]].forEach(([input, fallback]) => {
            input.addEventListener('blur', () => {
                const value = parseInt(input.value, 10);
                if (!Number.isFinite(value) || value < 1) input.value = fallback;
                else if (value > 256) input.value = 256;
                scheduleRender();
            });
        });

        els.exportW.addEventListener('blur', normalizeResolutionInput);
        els.exportH.addEventListener('blur', normalizeResolutionInput);

        // Downloads
        els.downloadBtn.addEventListener('click', downloadMerge);
        els.splitDownloadBtn.addEventListener('click', downloadSplit);

        // Keyboard paging for multi-sheet previews
        document.addEventListener('keydown', (e) => {
            if (state.mode !== 'merge' || isTypingTarget(e.target)) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                stepPage(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                stepPage(1);
            }
        });

        // File drag & drop anywhere in the workspace
        bindFileDrop();

        window.addEventListener('resize', scheduleRender);
    }

    function normalizeResolutionInput() {
        const value = parseInt(this.value, 10);
        if (!Number.isFinite(value) || value < 1) this.value = -1;
        scheduleRender();
    }

    function bindFileDrop() {
        const hasFiles = (e) => {
            if (!e.dataTransfer) return false;
            return Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1;
        };

        const activeStage = () => (state.mode === 'merge' ? els.mergeStage : els.splitStage);
        const clearDragOver = () => {
            els.mergeStage.classList.remove('drag-over');
            els.splitStage.classList.remove('drag-over');
        };

        window.addEventListener('dragenter', (e) => {
            if (!hasFiles(e) || state.dragId) return;
            activeStage().classList.add('drag-over');
        });

        window.addEventListener('dragover', (e) => {
            if (hasFiles(e)) e.preventDefault();
        });

        // relatedTarget is null when the dragged files leave the window
        window.addEventListener('dragleave', (e) => {
            if (e.relatedTarget) return;
            clearDragOver();
        });

        window.addEventListener('drop', (e) => {
            if (state.dragId) return;
            clearDragOver();
            if (!hasFiles(e)) return;
            e.preventDefault();
            importFiles(e.dataTransfer.files, state.mode);
        });
    }

    // ===== Init =====
    function init() {
        bindEvents();
        renderFrameList();
        renderSheetList();
        renderMergePreview();
        renderSplitPreview();
    }

    init();
})();
