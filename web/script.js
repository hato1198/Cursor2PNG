document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const fileInput = document.getElementById('file-input');
    const addFilesBtn = document.getElementById('add-files-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileListElem = document.getElementById('file-list');
    const sizeInput = document.getElementById('size-input');
    const resetBtn = document.getElementById('reset-btn');
    const resultView = document.getElementById('result-view');
    const placeholderView = document.getElementById('placeholder-view');
    const detailsView = document.getElementById('details-view');
    const infoText = document.getElementById('info-text');
    const previewCanvas = document.getElementById('preview-canvas');
    const downloadInfoBtn = document.getElementById('download-info-btn');
    const downloadImageBtn = document.getElementById('download-image-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleBtn.querySelector('i');

    // --- State Management ---
    let filesStore = [];
    let resultsCache = {}; // Caches both original and resized results { 'fileId-size': result }
    let selectedFileId = null;
    let nextFileId = 0;
    let currentResultForDisplay = null;

    // --- Constants ---
    const TYPE_MAP = {
        "Window NW-SE, Window NW, Window SE": [["斜め", "縮小1"], ["diagonal", "resize 1"]],
        "Window NE-SW, Window NE, Window SW": [["斜め", "縮小2"], ["diagonal", "resize 2"]],
        "Window E-W, Window E, Window W, Resize E-W, Resize E, Resize W": [["左右"], ["horizontal"]],
        "Window N-S, Window N, Window S, Resize N-S, Resize N, Resize S": [["上下"], ["vertical"]],
        "Arrow": [["通常"], ["normal", "arrow"]],
        "Help": [["ヘルプ"], ["help"]],
        "Busy": [["バックグラウンド"], ["background"]],
        "Wait": [["待ち状態"], ["busy", "wait"]],
        "Cell": [["領域"], ["precision", "cross"]],
        "IBeam": [["テキスト"], ["text", "ibeam"]],
        "Forbidden": [["利用不可"], ["unavailable", "no"]],
        "Move, Resize Square": [["移動"], ["move"]],
        "Pointing": [["リンク"], ["link", "hand"]],
    };

    // --- Event Listeners ---
    themeToggleBtn.addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-bs-theme') === 'dark';
        html.setAttribute('data-bs-theme', isDark ? 'light' : 'dark');
        themeIcon.classList.toggle('bi-sun-fill', !isDark);
        themeIcon.classList.toggle('bi-moon-stars-fill', isDark);
    });

    addFilesBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileListElem.addEventListener('click', (e) => {
        const listItem = e.target.closest('.list-group-item');
        if (listItem) {
            const fileId = listItem.dataset.id;
            if (e.target.closest('.delete-btn')) {
                removeFile(fileId);
            } else {
                selectFile(fileId);
            }
        }
    });
    
    sizeInput.addEventListener('change', () => {
        if (selectedFileId) {
            processAndDisplayFile(selectedFileId);
        }
    });

    resetBtn.addEventListener('click', clearAll);

    downloadInfoBtn.addEventListener('click', () => {
        if (currentResultForDisplay) {
            const result = currentResultForDisplay;
            const textContent = generateInfoText(result, true);
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = result.original_filename.split('.').slice(0, -1).join('.');
            a.download = `${baseName}_info.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    downloadImageBtn.addEventListener('click', () => {
         if (currentResultForDisplay) {
            const result = currentResultForDisplay;
            const fullSizeImage = result.image;
            const downloadCanvas = document.createElement('canvas');
            downloadCanvas.width = fullSizeImage.width;
            downloadCanvas.height = fullSizeImage.height;
            const ctx = downloadCanvas.getContext('2d');
            ctx.drawImage(fullSizeImage, 0, 0);
            const a = document.createElement('a');
            const baseName = result.original_filename.split('.').slice(0, -1).join('.');
            a.download = `${baseName}.png`;
            a.href = downloadCanvas.toDataURL('image/png');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    });

    // --- Core Functions ---
    function handleFiles(files) {
        const newFiles = Array.from(files).filter(file => {
            const extension = file.name.split('.').pop().toLowerCase();
            return (extension === 'cur' || extension === 'ani') && !filesStore.some(f => f.name === file.name);
        });

        if (newFiles.length > 0) {
            const hadSelection = !!selectedFileId;
            newFiles.forEach(file => {
                filesStore.push({ id: `file-${nextFileId++}`, file: file, name: file.name });
            });
            renderFileList();
            if (!hadSelection && filesStore.length > 0) {
                selectFile(filesStore[0].id);
            }
        }
    }

    function renderFileList() {
        fileListElem.innerHTML = '';
        if (filesStore.length === 0) {
            fileListElem.innerHTML = '<li class="list-group-item text-muted">ファイルがありません</li>';
            return;
        }
        filesStore.forEach(fileData => {
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            li.dataset.id = fileData.id;
            const fileNameSpan = document.createElement('span');
            fileNameSpan.textContent = fileData.name;
            fileNameSpan.style.wordBreak = 'break-all';
            li.appendChild(fileNameSpan);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger delete-btn ms-2';
            deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            deleteBtn.title = '削除';
            li.appendChild(deleteBtn);
            fileListElem.appendChild(li);
        });
        updateSelectionUI();
    }
    
    function removeFile(fileId) {
        const index = filesStore.findIndex(f => f.id === fileId);
        if (index > -1) {
            // Clear cache related to the file
            Object.keys(resultsCache)
                .filter(key => key.startsWith(`${fileId}-`))
                .forEach(key => delete resultsCache[key]);
            
            filesStore.splice(index, 1);

            if (selectedFileId === fileId) {
                selectedFileId = null;
                clearInfoPreview();
                 if (filesStore.length > 0) {
                    const nextIndex = Math.min(index, filesStore.length - 1);
                    selectFile(filesStore[nextIndex].id);
                } else {
                    renderFileList();
                }
            } else {
                 renderFileList();
            }
        }
    }

    function selectFile(fileId) {
        if (!fileId || !filesStore.some(f => f.id === fileId)) return;
        selectedFileId = fileId;
        updateSelectionUI();
        processAndDisplayFile(fileId);
    }

    async function processAndDisplayFile(fileId) {
        try {
            const targetSize = parseInt(sizeInput.value, 10) || 0;
            const cacheKey = `${fileId}-${targetSize}`;
            
            let result = resultsCache[cacheKey];

            if (!result) {
                const fileData = filesStore.find(f => f.id === fileId);
                const converter = new CursorConverter(fileData.file, targetSize);
                result = await converter.convert();
                resultsCache[cacheKey] = result;
            }
            
            // If the user wants the original size (size=0), but the result is from a resized conversion,
            // ensure the input field shows the actual size of what's being displayed.
            if (targetSize === 0) {
                sizeInput.value = result.frame_size[0];
            }

            displayResult(result);

        } catch (error) {
            console.error('Error processing file:', error);
            const fileData = filesStore.find(f => f.id === fileId);
            alert(`ファイル解析エラー:\n${fileData.name}\n\n${error.message}`);
            removeFile(fileId);
        }
    }

    function clearAll() {
        filesStore = [];
        resultsCache = {};
        selectedFileId = null;
        renderFileList();
        clearInfoPreview();
        sizeInput.value = 0; // Reset global size setting
    }

    // --- UI Update Functions ---
    function updateSelectionUI() {
        Array.from(fileListElem.children).forEach(li => {
            li.classList.toggle('active', li.dataset.id === selectedFileId);
        });
    }

    function displayResult(result) {
        currentResultForDisplay = result;
        placeholderView.classList.add('d-none');
        detailsView.classList.remove('d-none');
        infoText.textContent = generateInfoText(result);

        const ctx = previewCanvas.getContext('2d');
        const img = result.image;
        
        const maxPreviewSize = 600;
        let previewWidth = img.width;
        let previewHeight = img.height;
        if (previewHeight > maxPreviewSize || previewWidth > maxPreviewSize) {
            const ratio = Math.min(maxPreviewSize / previewHeight, maxPreviewSize / previewWidth);
            previewHeight = Math.floor(img.height * ratio);
            previewWidth = Math.floor(img.width * ratio);
        }
        
        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;
        ctx.clearRect(0, 0, previewWidth, previewHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, previewWidth, previewHeight);
    }
    
    function generateInfoText(result, forFile = false) {
        let str = '';
        if (forFile) {
             str += `Source: ${result.original_filename}\n-------------------------------------\n`;
        } else {
             str += `ファイル名: ${result.original_filename}\n-------------------------------------\n`;
        }
        str += `Type: ${result.type}\n`;
        str += `Frames: ${result.frames}\n`;
        str += `Frame Duration: ${result.duration.toFixed(4)}\n`;
        str += `Hot Spot: {${result.hotspot[0]}, ${result.hotspot[1]}}\n`;
        str += `Size: {${result.frame_size[0]}, ${result.frame_size[1]}}`;
        return str;
    }

    function clearInfoPreview() {
        placeholderView.classList.remove('d-none');
        detailsView.classList.add('d-none');
        infoText.textContent = '';
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        currentResultForDisplay = null;
    }

    // --- Main Converter Class ---
    class CursorConverter {
        constructor(file, targetSize) {
            this.file = file;
            this.filename = file.name;
            this.targetSize = targetSize;
            this.type = this._guessType();
        }

        _guessType() {
            const fnLower = this.filename.toLowerCase();
            for (const [type, keywordsLists] of Object.entries(TYPE_MAP)) {
                for (const keywords of keywordsLists) {
                    if (keywords.length > 1 && keywords.every(kw => fnLower.includes(kw))) return type;
                    if (keywords.length === 1 && fnLower.includes(keywords[0])) return type;
                }
            }
            for (const [type, keywordsLists] of Object.entries(TYPE_MAP)) {
                 for (const keywords of keywordsLists) {
                    if (keywords.some(kw => fnLower.includes(kw))) return type;
                }
            }
            return "Unknown";
        }

        async convert() {
            const extension = this.filename.split('.').pop().toLowerCase();
            const buffer = await this.file.arrayBuffer();
            if (extension === 'cur') {
                return this._processCur(buffer);
            } else if (extension === 'ani') {
                return this._processAni(buffer);
            } else {
                throw new Error(`Unsupported file format: ${extension}`);
            }
        }

        _getHotspotFromCurBlob(dataView) {
            try {
                return [dataView.getUint16(10, true), dataView.getUint16(12, true)];
            } catch (e) {
                return [0, 0];
            }
        }

        async _blobToImage(blob) {
            const url = URL.createObjectURL(blob);
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                });
                return img;
            } finally {
                URL.revokeObjectURL(url);
            }
        }
        
        async _resizeImage(image, width, height) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, 0, 0, width, height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            return this._blobToImage(blob);
        }

        async _processCur(buffer) {
            const dataView = new DataView(buffer);
            const blob = new Blob([buffer], { type: 'image/x-icon' });
            const hotspot = this._getHotspotFromCurBlob(dataView);
            let img = await this._blobToImage(blob);
            let finalHotspot = hotspot;
            let finalImg = img;
            
            if (this.targetSize > 0 && img.width > 0 && this.targetSize !== img.width) {
                const scale = this.targetSize / img.width;
                finalImg = await this._resizeImage(img, this.targetSize, this.targetSize);
                finalHotspot = [Math.round(hotspot[0] * scale), Math.round(hotspot[1] * scale)];
            }
            
            return {
                type: this.type, frames: 1, duration: 1.0, hotspot: finalHotspot,
                image: finalImg, original_filename: this.filename, frame_size: [finalImg.width, finalImg.height]
            };
        }

        async _processAni(buffer) {
            const dataView = new DataView(buffer);
            let offset = 0;

            const readFourCC = () => {
                let str = '';
                for (let i = 0; i < 4; i++) str += String.fromCharCode(dataView.getUint8(offset + i));
                offset += 4;
                return str;
            };
            const readDWord = () => {
                const val = dataView.getUint32(offset, true);
                offset += 4;
                return val;
            };

            if (readFourCC() !== 'RIFF' || readDWord() <= 0 || readFourCC() !== 'ACON') throw new Error('Invalid ANI file structure.');

            let anih = null, rates = null, frames = [];
            while (offset < dataView.byteLength) {
                const chunkId = readFourCC();
                const chunkSize = readDWord();
                if (chunkSize > dataView.byteLength) throw new Error("Invalid chunk size in ANI file.");
                const nextChunkOffset = offset + chunkSize + (chunkSize % 2);
                if (chunkId === 'anih') {
                    anih = {
                        cbSize: readDWord(), nFrames: readDWord(), nSteps: readDWord(), iWidth: readDWord(), iHeight: readDWord(),
                        iBitCount: readDWord(), nPlanes: readDWord(), iDispRate: readDWord(), bfAttributes: readDWord()
                    };
                } else if (chunkId === 'rate') {
                    rates = [];
                    for(let i=0; i<anih.nSteps; i++) rates.push(readDWord());
                } else if (chunkId === 'LIST' && readFourCC() === 'fram') {
                    let listEnd = offset - 4 + chunkSize;
                    while(offset < listEnd) {
                        if (readFourCC() === 'icon') {
                           const frameChunkSize = readDWord();
                           frames.push(buffer.slice(offset, offset + frameChunkSize));
                           offset += frameChunkSize + (frameChunkSize % 2);
                        }
                    }
                }
                offset = nextChunkOffset;
            }

            if (!anih) throw new Error("ANI header (anih) not found.");
            
            const jiffy = 1/60.0;
            const ratesInSec = rates ? rates.map(r => r * jiffy) : Array(anih.nFrames).fill(anih.iDispRate * jiffy);
            const minDuration = Math.min(...ratesInSec.filter(r => r > 0));
            if (!isFinite(minDuration)) throw new Error("Invalid frame rate in ANI file.");

            const frameMultipliers = ratesInSec.map(r => Math.max(1, Math.round(r / minDuration)));
            let outputFrames = [], finalHotspot = [0,0], maxWidth = 0, frameSize=[0,0], scale = 1.0;
            
            for (let i = 0; i < frames.length; i++) {
                const blob = new Blob([frames[i]], { type: 'image/x-icon' });
                const hotspot = this._getHotspotFromCurBlob(new DataView(frames[i]));
                let img = await this._blobToImage(blob);
                
                if (this.targetSize > 0 && img.width > 0 && this.targetSize !== img.width) {
                    if (i === 0) scale = this.targetSize / img.width;
                    img = await this._resizeImage(img, this.targetSize, this.targetSize);
                }
                
                if (i === 0) {
                     finalHotspot = (scale !== 1.0) ? [Math.round(hotspot[0] * scale), Math.round(hotspot[1] * scale)] : hotspot;
                     frameSize = [img.width, img.height];
                }

                for (let j = 0; j < frameMultipliers[i]; j++) outputFrames.push(img);
                if (img.width > maxWidth) maxWidth = img.width;
            }
            
            if (maxWidth === 0) throw new Error("Could not process frames to create image.");
            const totalHeight = outputFrames.reduce((sum, f) => sum + f.height, 0);

            const spriteSheetCanvas = document.createElement('canvas');
            spriteSheetCanvas.width = maxWidth;
            spriteSheetCanvas.height = totalHeight;
            const ctx = spriteSheetCanvas.getContext('2d');
            let currentY = 0;
            for (const frame of outputFrames) {
                ctx.drawImage(frame, (maxWidth - frame.width) / 2, currentY);
                currentY += frame.height;
            }
            const spriteSheetImage = await this._blobToImage(await new Promise(res => spriteSheetCanvas.toBlob(res)));

            return {
                type: this.type, frames: outputFrames.length, duration: minDuration, hotspot: finalHotspot,
                image: spriteSheetImage, original_filename: this.filename, frame_size: frameSize
            };
        }
    }
    
    // Initial setup
    renderFileList();
    clearInfoPreview();
});