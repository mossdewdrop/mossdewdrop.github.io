/**
 * Sequence Frame Animator
 * - Drop images / MP4 video to add frames
 * - Timeline supports drag reordering, enable/disable, and delete
 * - Preview the current frame and play back at a given frame rate
 * - Package active frames as a ZIP named after the project ({projectName}_###.png)
 */
(function () {
    'use strict';

    // ===== State =====
    const state = {
        projectName: 'anima',
        frames: [],          // { id, canvas, width, height, thumb, active }
        currentIndex: -1,    // index of the currently previewed frame in frames
        fps: 15,
        playing: false,
        timer: null,
        dragFrameId: null,
        busy: false
    };

    let uid = 0;
    const nextId = () => 'f' + (++uid);

    // ===== DOM =====
    const els = {
        projectName: document.getElementById('projectName'),
        stage: document.getElementById('stage'),
        preview: document.getElementById('preview'),
        emptyTip: document.getElementById('emptyTip'),
        timeline: document.getElementById('timeline'),
        btnPlay: document.getElementById('btnPlay'),
        btnPrev: document.getElementById('btnPrev'),
        btnNext: document.getElementById('btnNext'),
        frameCounter: document.getElementById('frameCounter'),
        fpsInput: document.getElementById('fpsInput'),
        btnDownload: document.getElementById('btnDownload'),
        progressOverlay: document.getElementById('progressOverlay'),
        progressText: document.getElementById('progressText'),
        progressFill: document.getElementById('progressFill')
    };

    const previewCtx = els.preview.getContext('2d');

    // ===== Utilities =====
    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    function cloneCanvas(src) {
        const c = makeCanvas(src.width, src.height);
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }

    // Build a thumbnail data URL
    function makeThumb(canvas) {
        const MAX = 88;
        const scale = Math.min(1, MAX / Math.max(canvas.width, canvas.height));
        const w = Math.max(1, Math.round(canvas.width * scale));
        const h = Math.max(1, Math.round(canvas.height * scale));
        const c = makeCanvas(w, h);
        c.getContext('2d').drawImage(canvas, 0, 0, w, h);
        return c.toDataURL('image/png');
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve) => {
            if (canvas.toBlob) {
                canvas.toBlob((blob) => resolve(blob), 'image/png');
            } else {
                const data = canvas.toDataURL('image/png');
                const bin = atob(data.split(',')[1]);
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resolve(new Blob([arr], { type: 'image/png' }));
            }
        });
    }

    function isVideoFile(file) {
        return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name);
    }

    function isImageFile(file) {
        return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
    }

    // ===== Frame operations =====
    function addFrame(canvas, insertAt) {
        const frame = {
            id: nextId(),
            canvas: canvas,
            width: canvas.width,
            height: canvas.height,
            thumb: makeThumb(canvas),
            active: true
        };
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= state.frames.length) {
            state.frames.splice(insertAt, 0, frame);
        } else {
            state.frames.push(frame);
        }
        return frame;
    }

    function deleteFrame(id) {
        const idx = state.frames.findIndex((f) => f.id === id);
        if (idx < 0) return;
        state.frames.splice(idx, 1);
        if (state.frames.length === 0) {
            state.currentIndex = -1;
        } else if (idx < state.currentIndex) {
            state.currentIndex -= 1;
        } else if (state.currentIndex >= state.frames.length) {
            state.currentIndex = state.frames.length - 1;
        }
    }

    function getCurrentFrame() {
        return state.frames[state.currentIndex] || null;
    }

    // Toggle the active state of a single frame
    function toggleFrameActive(frame) {
        frame.active = !frame.active;
        if (state.playing && !frame.active) restartPlayback();
        renderTimeline();
        renderPreview();
    }

    // ===== Rendering =====
    function renderTimeline() {
        els.timeline.innerHTML = '';
        state.frames.forEach((frame, idx) => {
            const item = document.createElement('div');
            item.className = 'frame-item';
            item.dataset.id = frame.id;
            item.draggable = true;
            if (!frame.active) item.classList.add('disabled');
            if (idx === state.currentIndex) item.classList.add('selected');

            const thumb = document.createElement('div');
            thumb.className = 'frame-thumb';
            const img = document.createElement('img');
            img.src = frame.thumb;
            img.alt = 'frame ' + (idx + 1);
            thumb.appendChild(img);

            const index = document.createElement('div');
            index.className = 'frame-index';
            index.textContent = (idx + 1) + (frame.active ? '' : ' (off)');

            const toggle = document.createElement('button');
            toggle.className = 'frame-toggle';
            toggle.textContent = frame.active ? '✓' : '';
            toggle.title = frame.active ? 'Disable this frame' : 'Enable this frame';

            const del = document.createElement('button');
            del.className = 'frame-delete';
            del.textContent = '×';
            del.title = 'Delete this frame';

            item.appendChild(thumb);
            item.appendChild(index);
            item.appendChild(toggle);
            item.appendChild(del);
            els.timeline.appendChild(item);

            // Select the frame
            item.addEventListener('click', () => {
                state.currentIndex = idx;
                renderTimeline();
                renderPreview();
            });

            // Enable / disable
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFrameActive(frame);
            });

            // Delete
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFrame(frame.id);
                renderTimeline();
                renderPreview();
            });

            // Drag reordering
            item.addEventListener('dragstart', (e) => {
                state.dragFrameId = frame.id;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                // Prevent this drag from being treated as a file drop
                e.dataTransfer.setData('text/plain', frame.id);
            });
            item.addEventListener('dragend', () => {
                state.dragFrameId = null;
                item.classList.remove('dragging');
                clearDropTargets();
            });
            item.addEventListener('dragover', (e) => {
                if (!state.dragFrameId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('drop-target');
                const rect = item.getBoundingClientRect();
                const before = (e.clientX - rect.left) < rect.width / 2;
                item.dataset.dropBefore = before ? '1' : '0';
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drop-target');
            });
            item.addEventListener('drop', (e) => {
                if (!state.dragFrameId) return;
                e.preventDefault();
                e.stopPropagation();
                const draggedId = state.dragFrameId;
                const before = item.dataset.dropBefore === '1';
                reorderFrame(draggedId, frame.id, before);
                clearDropTargets();
                state.dragFrameId = null;
            });
        });

        schedulePreviewResize();
    }

    function clearDropTargets() {
        els.timeline.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    }

    function reorderFrame(draggedId, targetId, before) {
        if (draggedId === targetId) return;
        const currentId = getCurrentFrame() ? getCurrentFrame().id : null;
        const from = state.frames.findIndex((f) => f.id === draggedId);
        if (from < 0) return;
        const moved = state.frames.splice(from, 1)[0];

        let to = state.frames.findIndex((f) => f.id === targetId);
        if (to < 0) to = state.frames.length;
        if (!before) to += 1;
        state.frames.splice(to, 0, moved);

        // Keep the currently selected frame selected
        const newIdx = state.frames.findIndex((f) => f.id === currentId);
        state.currentIndex = newIdx >= 0 ? newIdx : Math.min(from, state.frames.length - 1);

        renderTimeline();
        renderPreview();
    }

    function renderPreview() {
        const frame = getCurrentFrame();
        if (!frame) {
            els.preview.style.display = 'none';
            els.emptyTip.style.display = '';
            previewCtx.clearRect(0, 0, els.preview.width, els.preview.height);
            updateCounter();
            return;
        }

        els.emptyTip.style.display = 'none';
        els.preview.style.display = 'block';

        const maxW = els.stage.clientWidth - 40;
        const maxH = els.stage.clientHeight - 40;
        const scale = Math.min(maxW / frame.width, maxH / frame.height, 1);
        const dispW = Math.max(1, Math.round(frame.width * scale));
        const dispH = Math.max(1, Math.round(frame.height * scale));

        const dpr = window.devicePixelRatio || 1;
        els.preview.width = dispW * dpr;
        els.preview.height = dispH * dpr;
        els.preview.style.width = dispW + 'px';
        els.preview.style.height = dispH + 'px';
        previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        previewCtx.clearRect(0, 0, dispW, dispH);
        previewCtx.drawImage(frame.canvas, 0, 0, dispW, dispH);

        updateCounter();
    }

    function updateCounter() {
        const total = state.frames.length;
        const cur = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
        els.frameCounter.textContent = cur + ' / ' + total;
        els.btnPrev.disabled = total === 0;
        els.btnNext.disabled = total === 0;
        els.btnDownload.disabled = total === 0;
    }

    let resizeRaf = null;
    function schedulePreviewResize() {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => renderPreview());
    }

    // ===== Image import =====
    function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const c = makeCanvas(img.naturalWidth, img.naturalHeight);
                c.getContext('2d').drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve(c);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image: ' + file.name));
            };
            img.src = url;
        });
    }

    // ===== Video import =====
    function seekTo(video, time) {
        return new Promise((resolve) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = time;
        });
    }

    function showProgress(text, ratio) {
        els.progressOverlay.classList.add('show');
        els.progressText.textContent = text;
        els.progressFill.style.width = Math.round((ratio || 0) * 100) + '%';
    }

    function hideProgress() {
        els.progressOverlay.classList.remove('show');
        els.progressFill.style.width = '0%';
    }

    async function loadVideoFrames(file) {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Failed to read video: ' + file.name));
        });

        const duration = video.duration;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!duration || !isFinite(duration) || !vw || !vh) {
            URL.revokeObjectURL(url);
            throw new Error('Invalid video metadata: ' + file.name);
        }

        const fps = state.fps > 0 ? state.fps : 15;
        const step = 1 / fps;
        const times = [];
        for (let t = 0; t < duration; t += step) {
            times.push(Math.min(t, Math.max(0, duration - 0.001)));
        }
        if (times.length === 0) times.push(0);

        const buffer = makeCanvas(vw, vh);
        const ctx = buffer.getContext('2d');
        const grabbed = [];

        for (let i = 0; i < times.length; i++) {
            await seekTo(video, times[i]);
            ctx.clearRect(0, 0, vw, vh);
            ctx.drawImage(video, 0, 0, vw, vh);
            grabbed.push(cloneCanvas(buffer));
            showProgress('Parsing video ' + file.name + ' … (' + (i + 1) + '/' + times.length + ')', (i + 1) / times.length);
            // Yield to the main thread to keep the UI responsive
            await new Promise((r) => setTimeout(r, 0));
        }

        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        return grabbed;
    }

    // ===== Handle dropped files =====
    async function handleFiles(fileList) {
        if (state.busy) return;
        const files = Array.from(fileList);
        if (files.length === 0) return;

        state.busy = true;
        const addedFirstIndex = state.frames.length;

        try {
            for (const file of files) {
                if (isVideoFile(file)) {
                    const canvases = await loadVideoFrames(file);
                    canvases.forEach((c) => addFrame(c));
                } else if (isImageFile(file)) {
                    const canvas = await loadImageFile(file);
                    addFrame(canvas);
                }
            }
        } catch (err) {
            console.error(err);
            alert('Import failed: ' + err.message);
        } finally {
            state.busy = false;
            hideProgress();
        }

        if (state.frames.length > 0 && state.currentIndex < 0) {
            state.currentIndex = addedFirstIndex < state.frames.length ? addedFirstIndex : 0;
        }
        renderTimeline();
        renderPreview();
    }

    // ===== Playback control =====
    function playableIndices() {
        const list = [];
        state.frames.forEach((f, i) => { if (f.active) list.push(i); });
        return list;
    }

    // Left/right arrow (or prev/next): move through the timeline order, including disabled frames
    function stepFrame(dir) {
        const total = state.frames.length;
        if (total === 0) return;
        let idx = state.currentIndex;
        if (idx < 0) idx = dir > 0 ? -1 : 0;
        idx = (idx + dir + total) % total;
        state.currentIndex = idx;
        renderTimeline();
        renderPreview();
    }

    function startPlayback() {
        const list = playableIndices();
        if (list.length === 0) return;
        if (list.indexOf(state.currentIndex) === -1) {
            state.currentIndex = list[0];
            renderTimeline();
            renderPreview();
        }
        state.playing = true;
        els.btnPlay.textContent = '⏸';
        els.btnPlay.classList.add('playing');
        state.timer = setInterval(() => {
            const cur = playableIndices();
            if (cur.length === 0) { stopPlayback(); return; }
            let pos = cur.indexOf(state.currentIndex);
            pos = pos === -1 ? 0 : (pos + 1) % cur.length;
            state.currentIndex = cur[pos];
            highlightCurrent();
            renderPreview();
        }, Math.max(1000 / state.fps, 10));
    }

    function stopPlayback() {
        state.playing = false;
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
        els.btnPlay.textContent = '▶';
        els.btnPlay.classList.remove('playing');
    }

    function togglePlayback() {
        if (state.playing) stopPlayback();
        else startPlayback();
    }

    function restartPlayback() {
        stopPlayback();
        startPlayback();
    }

    // During playback only update the highlight instead of rebuilding the whole timeline
    function highlightCurrent() {
        const items = els.timeline.querySelectorAll('.frame-item');
        items.forEach((el, i) => {
            el.classList.toggle('selected', i === state.currentIndex);
        });
    }

    // ===== Export ZIP =====
    async function downloadZip() {
        const active = state.frames.filter((f) => f.active);
        if (active.length === 0) {
            alert('No active frames to export.');
            return;
        }
        if (typeof JSZip === 'undefined') {
            alert('JSZip is not loaded; cannot package.');
            return;
        }

        els.btnDownload.disabled = true;
        const originalText = els.btnDownload.textContent;
        els.btnDownload.textContent = 'Packaging…';
        showProgress('Packaging ZIP…', 0);

        try {
            const zip = new JSZip();
            const name = (state.projectName || 'anima').trim() || 'anima';
            for (let i = 0; i < active.length; i++) {
                const blob = await canvasToBlob(active[i].canvas);
                const fileName = name + '_' + String(i).padStart(3, '0') + '.png';
                zip.file(fileName, blob);
                showProgress('Packaging ZIP… (' + (i + 1) + '/' + active.length + ')', (i + 1) / active.length);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = name + '.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('Packaging failed: ' + err.message);
        } finally {
            hideProgress();
            els.btnDownload.textContent = originalText;
            els.btnDownload.disabled = false;
        }
    }

    // ===== Event binding =====
    function bindEvents() {
        // Project name
        els.projectName.addEventListener('input', () => {
            state.projectName = els.projectName.value;
        });
        els.projectName.addEventListener('blur', () => {
            if (!els.projectName.value.trim()) {
                els.projectName.value = 'anima';
                state.projectName = 'anima';
            }
        });
        els.projectName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') els.projectName.blur();
        });

        // Playback controls
        els.btnPlay.addEventListener('click', togglePlayback);
        els.btnPrev.addEventListener('click', () => stepFrame(-1));
        els.btnNext.addEventListener('click', () => stepFrame(1));

        // Frame rate
        els.fpsInput.addEventListener('change', () => {
            let v = parseInt(els.fpsInput.value, 10);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 60) v = 60;
            els.fpsInput.value = v;
            state.fps = v;
            if (state.playing) restartPlayback();
        });

        // Download
        els.btnDownload.addEventListener('click', downloadZip);

        // Keyboard shortcuts: Space toggles the current frame's active state, Ctrl/Cmd+Space play/pause, arrow keys switch frames
        document.addEventListener('keydown', (e) => {
            if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    togglePlayback();
                } else {
                    const frame = getCurrentFrame();
                    if (frame) toggleFrameActive(frame);
                }
            }
            else if (e.key === 'ArrowLeft') { stepFrame(-1); }
            else if (e.key === 'ArrowRight') { stepFrame(1); }
        });

        // File drag & drop (the whole window)
        let dragDepth = 0;
        window.addEventListener('dragenter', (e) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
            dragDepth++;
            if (!state.dragFrameId) els.stage.classList.add('drag-over');
        });
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        window.addEventListener('dragleave', (e) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) els.stage.classList.remove('drag-over');
        });
        window.addEventListener('drop', (e) => {
            // Timeline reordering is not handled here
            if (state.dragFrameId) return;
            e.preventDefault();
            dragDepth = 0;
            els.stage.classList.remove('drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
        });

        // Redraw the preview on window resize
        window.addEventListener('resize', schedulePreviewResize);
    }

    // ===== Init =====
    function init() {
        state.projectName = els.projectName.value;
        state.fps = parseInt(els.fpsInput.value, 10) || 15;
        bindEvents();
        renderTimeline();
        renderPreview();
    }

    init();
})();
