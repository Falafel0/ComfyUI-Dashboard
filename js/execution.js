import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { state, broadcastWidgetUpdate } from "./state.js";

export function setupExecutionLogic() {
    const btnGenMain = document.getElementById("btn-generate-main");
    const btnRunningGroup = document.getElementById("btn-running-group");
    const btnQueue = document.getElementById("btn-queue-more");
    const btnInterrupt = document.getElementById("btn-interrupt");
    const btnClearQ = document.getElementById("btn-clear");
    const statusEl = document.getElementById("a11-status");
    const galleryEl = document.getElementById("a11-gallery");
    const mainImg = document.getElementById("a11-preview-img");
    const placeholder = document.getElementById("a11-placeholder");
    const previewBoxWrapper = document.getElementById("a11-preview-box");
    const resumeBtn = document.getElementById("a11-resume-live");

    const expandBtn = document.getElementById("a11-expand-btn");
    const saveBtn = document.getElementById("a11-manual-save-btn");
    const fsViewer = document.getElementById("a11-fs-viewer");
    const fsImg = document.getElementById("a11-fs-img");
    const fsClose = document.getElementById("a11-fs-close");
    const fsZoomIn = document.getElementById("a11-fs-zoom-in");
    const fsZoomOut = document.getElementById("a11-fs-zoom-out");
    const fsZoomReset = document.getElementById("a11-fs-zoom-reset");

    const saveModal = document.getElementById("a11-save-modal");
    const smFolderSel = document.getElementById("sm-folder-sel");
    const smFolderNew = document.getElementById("sm-folder-new");
    const smFilename = document.getElementById("sm-filename");
    const smCancel = document.getElementById("sm-cancel");
    const smConfirm = document.getElementById("sm-confirm-save");

    let isViewingGallery = false;
    let livePreviewURL = "";

    const updatePreviewBoxState = () => {
        if (placeholder.style.display === "none") previewBoxWrapper.classList.remove("empty");
        else previewBoxWrapper.classList.add("empty");
    };

    expandBtn.onclick = () => {
        if (!mainImg.src || mainImg.src.includes('data:image/svg')) return;
        fsImg.src = mainImg.src;
        fsViewer.classList.add("open");
        resetFs();
    };

    let fsZ = 1, fsPx = 0, fsPy = 0;
    let fsIsPanning = false, fsStartX = 0, fsStartY = 0;

    const updateFs = () => { fsImg.style.transform = `translate(${fsPx}px, ${fsPy}px) scale(${fsZ})`; };
    const resetFs = () => { fsZ = 1; fsPx = 0; fsPy = 0; updateFs(); };

    fsViewer.addEventListener("wheel", (e) => {
        if (e.target.closest('.a11-fs-controls') || e.target === fsClose) return;
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        fsZ = Math.min(Math.max(0.1, fsZ * zoomDelta), 50);
        updateFs();
    });

    fsImg.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        fsIsPanning = true;
        fsStartX = e.clientX - fsPx;
        fsStartY = e.clientY - fsPy;
    });

    window.addEventListener("mousemove", (e) => {
        if (!fsIsPanning) return;
        fsPx = e.clientX - fsStartX;
        fsPy = e.clientY - fsStartY;
        updateFs();
    });

    window.addEventListener("mouseup", () => {
        if (fsIsPanning) fsIsPanning = false;
    });

    fsZoomIn.onclick = () => { fsZ = Math.min(fsZ * 1.2, 50); updateFs(); };
    fsZoomOut.onclick = () => { fsZ = Math.max(fsZ * 0.8, 0.1); updateFs(); };
    fsZoomReset.onclick = resetFs;
    fsClose.onclick = () => fsViewer.classList.remove("open");

    smCancel.onclick = () => saveModal.classList.remove("open");

    saveBtn.onclick = async () => {
        let activeSaveSrc = mainImg.src;

        if (!isViewingGallery && galleryEl.lastChild) {
            activeSaveSrc = galleryEl.lastChild.querySelector("img").src;
        } else if (isViewingGallery) {
             const selected = galleryEl.querySelector(".a11-gallery-item.selected img");
             if (selected) activeSaveSrc = selected.src;
        }

        if (activeSaveSrc.startsWith("blob:") && galleryEl.lastChild) {
            activeSaveSrc = galleryEl.lastChild.querySelector("img").src;
        }

        if (!activeSaveSrc || activeSaveSrc.includes("data:image/svg") || placeholder.style.display !== "none") {
            alert("No image to save."); return;
        }

        saveModal.dataset.srcToSave = activeSaveSrc;

        try {
            const resp = await fetch("/a11_studio/get_output_folders");
            const data = await resp.json();
            smFolderSel.innerHTML = '<option value="">-- ComfyUI Output Root --</option>';
            data.folders.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f;
                opt.innerText = f;
                smFolderSel.appendChild(opt);
            });

            const lastFolder = localStorage.getItem("a11_manual_save_folder") || "";
            if (data.folders.includes(lastFolder)) {
                smFolderSel.value = lastFolder;
            }
        } catch(e) {
            console.error("Could not fetch folders", e);
        }

        smFolderNew.value = "";
        smFilename.value = "";

        saveModal.classList.add("open");
    };

    smConfirm.onclick = async () => {
        const activeSaveSrc = saveModal.dataset.srcToSave;
        const selectedExisting = smFolderSel.value;
        const newFolder = smFolderNew.value.trim();
        const finalFolder = newFolder || selectedExisting;
        const filename = smFilename.value.trim();

        localStorage.setItem("a11_manual_save_folder", finalFolder);
        saveModal.classList.remove("open");

        try {
            saveBtn.innerText = "⏳...";
            saveBtn.style.pointerEvents = "none";

            const response = await fetch(activeSaveSrc);
            const blob = await response.blob();

            const body = new FormData();
            body.append("image", blob, filename || "save.png");
            body.append("folder", finalFolder);
            body.append("filename", filename);

            const uploadResp = await fetch("/a11_studio/save_image", { method: "POST", body });
            const uploadJson = await uploadResp.json();

            if (uploadJson.status === "ok") {
                saveBtn.innerText = "✅ Saved!";
                saveBtn.style.background = "#10b981";
                setTimeout(() => { saveBtn.innerText = "💾 Save"; saveBtn.style.background = ""; saveBtn.style.pointerEvents = "auto"; }, 2000);
            } else {
                throw new Error(uploadJson.message);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save image: " + err.message);
            saveBtn.innerText = "❌ Error";
            saveBtn.style.background = "var(--a11-error)";
            setTimeout(() => { saveBtn.innerText = "💾 Save"; saveBtn.style.background = ""; saveBtn.style.pointerEvents = "auto"; }, 2000);
        }
    };

    const sendBtn = document.getElementById("a11-send-btn");
    const sendTargetSel = document.getElementById("a11-send-target");

    sendBtn.onclick = async () => {
        const targetId = sendTargetSel.value;

        let activeSaveSrc = mainImg.src;
        if (!isViewingGallery && galleryEl.lastChild) {
            activeSaveSrc = galleryEl.lastChild.querySelector("img").src;
        } else if (isViewingGallery) {
             const selected = galleryEl.querySelector(".a11-gallery-item.selected img");
             if (selected) activeSaveSrc = selected.src;
        }
        if (activeSaveSrc.startsWith("blob:") && galleryEl.lastChild) {
            activeSaveSrc = galleryEl.lastChild.querySelector("img").src;
        }

        if (!targetId) { alert("Select a target Load Image node."); return; }
        if (!activeSaveSrc || activeSaveSrc.includes("data:image/svg") || placeholder.style.display !== "none") { alert("No image to send."); return; }

        try {
            sendBtn.innerText = "Sending...";
            const response = await fetch(activeSaveSrc);
            const blob = await response.blob();

            const body = new FormData();
            const fileName = `A11_Sent_${Date.now()}.png`;
            body.append("image", blob, fileName);
            body.append("overwrite", "true");

            const uploadResp = await fetch("/upload/image", { method: "POST", body });
            const uploadJson = await uploadResp.json();

            const node = app.graph.getNodeById(targetId);
            if (node) {
                let imgWidget = node.widgets.find(w => w.name === "image");
                if (!imgWidget && node.widgets.length > 0) {
                    imgWidget = node.widgets.find(w => w.type === "image" || w.name.toLowerCase().includes("image"));
                }

                if (imgWidget) {
                    imgWidget.value = uploadJson.name;
                    if(imgWidget.callback) imgWidget.callback(uploadJson.name);
                    app.graph.setDirtyCanvas(true, true);

                    const widgetIdx = node.widgets.indexOf(imgWidget);
                    broadcastWidgetUpdate(targetId, widgetIdx > -1 ? widgetIdx : 0, uploadJson.name);

                    sendBtn.innerText = "Done!";
                    setTimeout(() => sendBtn.innerText = "Send ➜", 1000);
                } else {
                    alert("Could not find image widget on target node.");
                    sendBtn.innerText = "Error";
                    setTimeout(() => sendBtn.innerText = "Send ➜", 1000);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Failed to send image.");
            sendBtn.innerText = "Error";
            setTimeout(() => sendBtn.innerText = "Send ➜", 1000);
        }
    };

    function setRunningState(isRunning) {
        if(isRunning) {
            btnGenMain.style.display = "none"; btnRunningGroup.style.display = "flex";
            statusEl.innerText = "Generating...";
            statusEl.style.color = "var(--a11-error)";
            document.getElementById("a11-progress").style.display = "block";
        } else {
            btnGenMain.style.display = "block"; btnRunningGroup.style.display = "none";
            statusEl.innerText = "Idle";
            statusEl.style.color = "var(--a11-text)";
            document.getElementById("a11-progress").style.width = "0%";
            document.getElementById("a11-progress").style.display = "none";
        }
    }

    btnGenMain.onclick = () => app.queuePrompt(0);
    btnQueue.onclick = () => app.queuePrompt(0);
    btnInterrupt.onclick = () => api.interrupt();
    btnClearQ.onclick = async () => { await api.interrupt(); api.clearItems('queue'); setRunningState(false); };

    if (resumeBtn) {
        resumeBtn.onclick = () => {
            isViewingGallery = false;
            resumeBtn.style.display = "none";
            document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
            if (livePreviewURL) {
                mainImg.src = livePreviewURL;
                placeholder.style.display = "none";
                updatePreviewBoxState();
            }
        };
    }

    function addToGallery(src) {
        const item = document.createElement("div"); item.className = "a11-gallery-item";
        const img = document.createElement("img"); img.src = src; item.appendChild(img);

        item.onclick = () => {
            mainImg.src = src;
            isViewingGallery = true;
            placeholder.style.display = "none";
            updatePreviewBoxState();

            if (resumeBtn) resumeBtn.style.display = "block";

            document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
            item.classList.add("selected");
        };

        galleryEl.appendChild(item);
        setTimeout(() => galleryEl.scrollLeft = galleryEl.scrollWidth, 50);

        const limit = state.settings.galleryLimit || 50;
        while (galleryEl.children.length > limit) {
            galleryEl.removeChild(galleryEl.firstChild);
        }
    }

    document.getElementById("a11-clear-gallery").onclick = () => {
        if(state.settings.confirmActions && !confirm("Clear gallery?")) return;
        galleryEl.innerHTML = "";
        mainImg.src = "";
        placeholder.style.display = "block";
        updatePreviewBoxState();
        livePreviewURL = "";
        isViewingGallery = false;
        if (resumeBtn) resumeBtn.style.display = "none";
    };

    api.addEventListener("execution_start", () => {
        setRunningState(true);
        isViewingGallery = false;
        if (resumeBtn) resumeBtn.style.display = "none";
        document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
    });

    api.addEventListener("executed", ({ detail }) => {
        if (detail?.output?.images) {
            const currentTab = state.appData.tabs[state.appData.activeIdx];
            const allowedSources = currentTab?.gallerySources ||[];

            if (allowedSources.length > 0) {
                const isAllowed = allowedSources.some(id => id.toString() === detail.node.toString());
                if (!isAllowed) return;
            }

            detail.output.images.forEach(d => {
                const src = `/view?filename=${d.filename}&type=${d.type}&subfolder=${d.subfolder}&t=${Date.now()}`;

                addToGallery(src);

                if (!isViewingGallery) {
                    mainImg.src = src;
                    placeholder.style.display = "none";
                    updatePreviewBoxState();

                    const items = galleryEl.querySelectorAll(".a11-gallery-item");
                    document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
                    if(items.length > 0) items[items.length - 1].classList.add("selected");
                }

                const nodeId = detail.node;
                const nodePreviews = document.querySelectorAll(`.a11-node-preview[data-node-id="${nodeId}"]`);
                nodePreviews.forEach(img => { img.src = src; });
            });
        }
    });

    api.addEventListener("status", ({ detail }) => { if (detail?.exec_info?.queue_remaining === 0) setRunningState(false); });

    api.addEventListener("progress", ({detail}) => {
        document.getElementById("a11-progress").style.width = Math.floor((detail.value/detail.max)*100)+"%";
        document.querySelector(".a11-progress-text").innerText = `${Math.floor(detail.value)} / ${detail.max}`;
    });

    api.addEventListener("b_preview", ({detail}) => {
        const url = URL.createObjectURL(detail);
        livePreviewURL = url;

        if (isViewingGallery) return;

        mainImg.src = url;
        placeholder.style.display="none";
        updatePreviewBoxState();
    });
}