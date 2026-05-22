import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { state, saveSettings, broadcastWidgetUpdate } from "./state.js";

export function setupExecutionLogic() {
    const btnGenMain = document.getElementById("btn-generate-main");
    const btnRunningGroup = document.getElementById("btn-running-group");
    const btnQueue = document.getElementById("btn-queue-more");
    const btnInterrupt = document.getElementById("btn-interrupt");
    const btnClearQ = document.getElementById("btn-clear");
    const statusEl = document.getElementById("a11-status");
    const queuePanel = document.getElementById("a11-queue-panel");
    const queueList = document.getElementById("a11-queue-list");
    const queueCount = document.getElementById("a11-queue-count");
    const galleryEl = document.getElementById("a11-gallery");
    const mainImg = document.getElementById("a11-preview-img");
    const placeholder = document.getElementById("a11-placeholder");
    const previewBoxWrapper = document.getElementById("a11-preview-box");
    const resumeBtn = document.getElementById("a11-resume-live");
    const batchInput = document.getElementById("a11-batch-count");

    // Init batch count from settings
    if (batchInput && state.settings.batchCount) {
        batchInput.value = state.settings.batchCount;
    }
    if (batchInput) {
        batchInput.addEventListener('change', () => {
            state.settings.batchCount = parseInt(batchInput.value) || 1;
            saveSettings();
        });
    }

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
        if (placeholder.style.display !== 'none') return;
        if (!mainImg.src || mainImg.src === window.location.href) return;
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
            saveBtn.innerText = "\u23F3...";
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
                saveBtn.innerText = "\u2705 Saved!";
                saveBtn.style.background = "#10b981";
                setTimeout(() => { saveBtn.innerText = "\uD83D\uDCBE Save"; saveBtn.style.background = ""; saveBtn.style.pointerEvents = "auto"; }, 2000);
            } else {
                throw new Error(uploadJson.message);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save image: " + err.message);
            saveBtn.innerText = "\u274C Error";
            saveBtn.style.background = "var(--a11-error)";
            setTimeout(() => { saveBtn.innerText = "\uD83D\uDCBE Save"; saveBtn.style.background = ""; saveBtn.style.pointerEvents = "auto"; }, 2000);
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
            const fileName = "A11_Sent_" + Date.now() + ".png";
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
                    setTimeout(() => sendBtn.innerText = "Send \u279C", 1000);
                } else {
                    alert("Could not find image widget on target node.");
                    sendBtn.innerText = "Error";
                    setTimeout(() => sendBtn.innerText = "Send \u279C", 1000);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Failed to send image.");
            sendBtn.innerText = "Error";
            setTimeout(() => sendBtn.innerText = "Send \u279C", 1000);
        }
    };

    function setRunningState(isRunning) {
        const dot = document.getElementById('a11-status-dot');
        const genRow = document.getElementById('a11-generate-row');
        if(isRunning) {
            if (genRow) genRow.style.display = "none";
            btnRunningGroup.style.display = "flex";
            statusEl.innerText = "Generating...";
            statusEl.style.color = "var(--a11-accent)";
            if (dot) dot.style.background = "var(--a11-accent)";
            document.getElementById("a11-progress").style.display = "block";
        } else {
            if (genRow) genRow.style.display = "";
            btnRunningGroup.style.display = "none";
            statusEl.innerText = "Idle";
            statusEl.style.color = "var(--a11-text)";
            if (dot) dot.style.background = "var(--a11-success)";
            document.getElementById("a11-progress").style.width = "0%";
            document.getElementById("a11-progress").style.display = "none";
            refreshQueuePanel();
        }
    }

    btnGenMain.onclick = () => {
        const n = parseInt(document.getElementById('a11-batch-count')?.value) || 1;
        app.queuePrompt(0, n);
        setTimeout(refreshQueuePanel, 200);
    };
    btnQueue.onclick = () => {
        const n = parseInt(document.getElementById('a11-batch-count')?.value) || 1;
        app.queuePrompt(0, n);
        setTimeout(refreshQueuePanel, 200);
    };
    btnInterrupt.onclick = () => {
        api.interrupt();
        livePreviewURL = "";
        mainImg.removeAttribute('src');
        placeholder.style.display = "block";
        updatePreviewBoxState();
        setTimeout(refreshQueuePanel, 200);
    };
    btnClearQ.onclick = async () => {
        await api.interrupt();
        api.clearItems('queue');
        setRunningState(false);
        livePreviewURL = "";
        mainImg.removeAttribute('src');
        placeholder.style.display = "block";
        updatePreviewBoxState();
        setTimeout(refreshQueuePanel, 200);
    };

    async function refreshQueuePanel() {
        if (!queuePanel || !queueList || !queueCount) return;
        try {
            const resp = await fetch('/queue');
            const data = await resp.json();
            const running = data.queue_running || [];
            const pending = data.queue_pending || [];
            const total = running.length + pending.length;

            if (total === 0) {
                queuePanel.style.display = 'none';
                return;
            }

            queueCount.innerText = total + ' item' + (total !== 1 ? 's' : '');
            queuePanel.style.display = '';

            let html = '';
            running.forEach((item, i) => {
                html += '<div class="a11-queue-item">';
                html += '<span class="q-num">#' + (i + 1) + '</span>';
                html += '<span class="q-status running">Running</span>';
                html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (item.prompt?.[0] || '') + '</span>';
                html += '<button class="q-cancel" data-id="' + item.prompt_id + '">\u2716</button>';
                html += '</div>';
            });
            pending.forEach((item, i) => {
                html += '<div class="a11-queue-item">';
                html += '<span class="q-num">#' + (running.length + i + 1) + '</span>';
                html += '<span class="q-status pending">Pending</span>';
                html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (item.prompt?.[0] || '') + '</span>';
                html += '<button class="q-cancel" data-id="' + item.prompt_id + '">\u2716</button>';
                html += '</div>';
            });
            queueList.innerHTML = html;

            queueList.querySelectorAll('.q-cancel').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    await fetch('/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [id] }) });
                    setTimeout(refreshQueuePanel, 300);
                };
            });
        } catch(e) {
            queuePanel.style.display = 'none';
        }
    }

    function updateParamsInfo(snapshot) {
        const el = document.getElementById('a11-params-info');
        if (!el) return '';
        let html = '';

        if (snapshot) {
            html = snapshot;
        } else {
            const nodes = (app.graph._nodes || []).filter(n => n.mode === 0);
            if (nodes.length === 0) {
                el.style.display = 'none';
                return '';
            }

            const groups = {};
            nodes.forEach(node => {
                const cat = node.category || 'Other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(node);
            });

            for (const [group, groupNodes] of Object.entries(groups)) {
                let bodyHtml = '';
                groupNodes.forEach(node => {
                    const nodeName = node.title || node.type;
                    const widgets = node.widgets || [];
                    const params = widgets.filter(w => {
                        if (w.type === 'image' || w.name === 'image') return false;
                        if (w.value == null || w.value === '') return false;
                        if (w.name.startsWith('_') || w.name === 'ui_password') return false;
                        return true;
                    });
                    if (params.length > 0) {
                        bodyHtml += '<div class="p-node"><div class="p-node-name">' + nodeName + '</div>';
                        params.forEach(w => {
                            let val = String(w.value);
                            if (val.length > 200) val = val.slice(0, 200) + '\u2026';
                            bodyHtml += '<div class="p-param"><span class="p-label">' + w.name + ':</span><span class="p-val">' + val + '</span></div>';
                        });
                        bodyHtml += '</div>';
                    }
                });
                if (bodyHtml) {
                    html += '<div class="p-group"><div class="p-group-header">' + group + '</div><div class="p-group-body">' + bodyHtml + '</div></div>';
                }
            }
        }

        if (html) {
            el.innerHTML = html;
            el.style.display = '';

            let collapsed = {};
            try { collapsed = JSON.parse(localStorage.getItem('a11_params_collapsed') || '{}'); } catch(e) {}
            el.querySelectorAll('.p-group').forEach(grp => {
                const name = grp.querySelector('.p-group-header').innerText;
                if (collapsed[name]) grp.classList.add('collapsed');
            });

            el.querySelectorAll('.p-group-header').forEach(hdr => {
                hdr.onclick = () => {
                    const grp = hdr.parentElement;
                    grp.classList.toggle('collapsed');
                    const st = {};
                    el.querySelectorAll('.p-group').forEach(g => {
                        const n = g.querySelector('.p-group-header').innerText;
                        if (g.classList.contains('collapsed')) st[n] = true;
                    });
                    localStorage.setItem('a11_params_collapsed', JSON.stringify(st));
                };
            });
        } else {
            el.style.display = 'none';
        }
        return html;
    }

    if (resumeBtn) {
        resumeBtn.onclick = () => {
            isViewingGallery = false;
            resumeBtn.style.display = "none";
            document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
            // Restore current graph params
            updateParamsInfo();
            if (livePreviewURL) {
                mainImg.src = livePreviewURL;
                placeholder.style.display = "none";
                updatePreviewBoxState();
                return;
            }
            const lastItem = galleryEl.lastChild;
            if (lastItem) {
                const lastImg = lastItem.querySelector("img");
                if (lastImg && lastImg.src) {
                    mainImg.src = lastImg.src;
                    placeholder.style.display = "none";
                    updatePreviewBoxState();
                    lastItem.classList.add("selected");
                }
            }
        };
    }

    const galleryParamsMap = new Map();

    function addToGallery(src, nodeId, paramsHtml) {
        const item = document.createElement("div"); item.className = "a11-gallery-item";
        const img = document.createElement("img"); img.src = src; item.appendChild(img);

        // Store params snapshot safely in Map (data attributes can corrupt large HTML)
        if (paramsHtml) galleryParamsMap.set(item, paramsHtml);

        // Show gallery header
        const gh = document.getElementById('a11-gallery-header');
        if (gh) gh.style.display = '';

        // Overlay with node title
        if (nodeId != null) {
            const node = app.graph.getNodeById(nodeId);
            if (node) {
                const overlay = document.createElement("div");
                overlay.className = "a11-gallery-overlay";
                overlay.innerText = node.title || node.type;
                item.appendChild(overlay);
            }
        }

        item.onclick = () => {
            mainImg.src = src;
            isViewingGallery = true;
            placeholder.style.display = "none";
            updatePreviewBoxState();

            if (resumeBtn) resumeBtn.style.display = "block";

            document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
            item.classList.add("selected");

            // Show saved params for this image
            const savedParams = galleryParamsMap.get(item);
            if (savedParams) updateParamsInfo(savedParams);
        };

        galleryEl.appendChild(item);
        setTimeout(() => galleryEl.scrollLeft = galleryEl.scrollWidth, 50);

        const limit = state.settings.galleryLimit || 50;
        while (galleryEl.children.length > limit) {
            const first = galleryEl.firstChild;
            galleryParamsMap.delete(first);
            galleryEl.removeChild(first);
        }
    }

    document.getElementById("a11-clear-gallery").onclick = () => {
        if(state.settings.confirmActions && !confirm("Clear gallery?")) return;
        galleryEl.innerHTML = "";
        galleryParamsMap.clear();
        mainImg.removeAttribute('src');
        placeholder.style.display = "block";
        updatePreviewBoxState();
        livePreviewURL = "";
        isViewingGallery = false;
        if (resumeBtn) resumeBtn.style.display = "none";
        const gh = document.getElementById('a11-gallery-header');
        if (gh) gh.style.display = 'none';
    };

    api.addEventListener("execution_start", () => {
        setRunningState(true);
        isViewingGallery = false;
        // Clear preview so live preview can show fresh
        mainImg.removeAttribute('src');
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
                const src = "/view?filename=" + d.filename + "&type=" + d.type + "&subfolder=" + d.subfolder + "&t=" + Date.now();

                // Save params snapshot BEFORE adding to gallery
                const paramsSnapshot = updateParamsInfo();

                addToGallery(src, detail.node, paramsSnapshot);

                if (!isViewingGallery) {
                    mainImg.src = src;
                    placeholder.style.display = "none";
                    updatePreviewBoxState();

                    const items = galleryEl.querySelectorAll(".a11-gallery-item");
                    document.querySelectorAll(".a11-gallery-item").forEach(el => el.classList.remove("selected"));
                    if(items.length > 0) items[items.length - 1].classList.add("selected");
                    // Show current params (not snapshot from old image)
                    updateParamsInfo();
                }

                const nodeId = detail.node;
                const nodePreviews = document.querySelectorAll(".a11-node-preview[data-node-id=\"" + nodeId + "\"]");
                nodePreviews.forEach(img => { img.src = src; });
            });

            if (!isViewingGallery) updateParamsInfo();
            livePreviewURL = "";
        }
    });

    api.addEventListener("status", ({ detail }) => {
        const remaining = detail?.exec_info?.queue_remaining;
        refreshQueuePanel();
        if (remaining === 0) {
            setRunningState(false);
        } else if (remaining > 0 && btnRunningGroup.style.display === "none") {
            statusEl.innerText = "Queue: " + remaining + " pending";
            statusEl.style.color = "var(--a11-accent)";
            const dot = document.getElementById('a11-status-dot');
            if (dot) dot.style.background = "var(--a11-warning, #f59e0b)";
        }
    });

    api.addEventListener("progress", ({detail}) => {
        const pct = Math.floor((detail.value/detail.max)*100);
        document.getElementById("a11-progress").style.width = pct + "%";
        let msg = "Generating... step " + Math.floor(detail.value) + "/" + detail.max;
        if (detail.node) {
            const node = app.graph.getNodeById(detail.node);
            if (node) msg += " \u2014 " + (node.title || node.type);
        }
        statusEl.innerText = msg;
    });

    api.addEventListener("b_preview", ({detail}) => {
        const url = URL.createObjectURL(detail);
        livePreviewURL = url;

        if (isViewingGallery) return;
        // Don't overwrite already-loaded final image with lowres blob
        if (mainImg.src && !mainImg.src.startsWith('blob:')) return;

        mainImg.src = url;
        placeholder.style.display="none";
        updatePreviewBoxState();
    });
}