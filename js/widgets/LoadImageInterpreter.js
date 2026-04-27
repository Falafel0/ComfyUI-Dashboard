
import { app } from "../../../scripts/app.js";
import { WidgetInterpreter } from "./WidgetInterpreter.js";
import { state, broadcastWidgetUpdate } from "../state.js";

/**
 * Утилита для загрузки изображений на сервер
 */
async function uploadImage(file) {
    try {
        const body = new FormData();
        body.append("image", file);
        body.append("overwrite", "true");
        const resp = await fetch("/upload/image", { method: "POST", body });
        const json = await resp.json();
        return json.name;
    } catch (error) {
        console.error("Upload failed:", error);
        alert("Upload failed: " + error);
        return null;
    }
}

/**
 * Получить URL изображения ComfyUI
 */
function getComfyImageUrl(filename, type = "input") {
    if (!filename) return "";
    let cleanName = filename;
    let subfolder = "";
    if (filename.includes("/")) {
        const parts = filename.split("/");
        cleanName = parts.pop();
        subfolder = parts.join("/");
    } else if (filename.includes("\\")) {
        const parts = filename.split("\\");
        cleanName = parts.pop();
        subfolder = parts.join("\\");
    }
    return `/view?filename=${encodeURIComponent(cleanName)}&type=${type}&subfolder=${encodeURIComponent(subfolder)}&t=${Date.now()}`;
}

/**
 * Интерпретатор для нод загрузки изображений
 */
export class LoadImageInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 90;
        this.supportedNodeTypes = ['loadimage', 'load image', 'previewimage'];
    }

    canHandle(w, node, options) {
        const isLoadImageNode = node.type && (
            node.type.toLowerCase().includes("load") ||
            (node.widgets && node.widgets.some(wid =>
                wid.name === "upload" ||
                (wid.type === "button" && wid.name.toLowerCase().includes("upload"))
            ))
        );
        const isImageWidget = w.name === "image" ||
                              w.type === "image" ||
                              w.name.toLowerCase().includes("image");

        return isLoadImageNode && isImageWidget;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        if (!options.customHeight) {
            wrapper.classList.add("gw-widget-wrapper--grows");
        }

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const container = document.createElement("div");
        container.className = "a11-upload-area";

        const img = document.createElement("img");
        img.className = "a11-upload-img";
        img.src = getComfyImageUrl(w.value);
        if (options.objectFit) img.style.objectFit = options.objectFit;

        this.setupLiveSync(w, nodeId, img, (newVal) => {
            img.src = getComfyImageUrl(newVal);
        });

        const btnsRow = document.createElement("div");
        btnsRow.style.cssText = "display:flex; gap:5px; width:100%; margin-top:5px; flex-shrink: 0;";

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";

        fileInput.onchange = async (e) => {
            if (e.target.files.length) {
                const f = await uploadImage(e.target.files[0]);
                if (f) {
                    w.value = f;
                    if (w.callback) w.callback(f);
                    this.syncNode();
                }
            }
        };

        if (!options.readOnly) {
            img.style.cursor = "pointer";
            img.title = "Click to replace";
            img.onclick = () => fileInput.click();

            const uploadBtn = document.createElement("button");
            uploadBtn.className = "a11-upload-btn";
            uploadBtn.innerText = "📁 Change";
            uploadBtn.style.flex = "1";
            uploadBtn.onclick = () => fileInput.click();
            btnsRow.appendChild(uploadBtn);

            const maskBtn = document.createElement("button");
            maskBtn.className = "a11-upload-btn";
            maskBtn.innerText = "🖌️ Editor";
            maskBtn.style.flex = "1";
            maskBtn.style.background = "linear-gradient(to bottom, #4f46e5, #4338ca)";
            maskBtn.style.borderColor = "#4338ca";
            maskBtn.onclick = () => this.openMaskEditor(nodeId);
            btnsRow.appendChild(maskBtn);
        } else {
            img.style.cursor = "default";
            img.title = "";
        }

        container.appendChild(img);
        container.appendChild(btnsRow);
        wrapper.appendChild(container);

        this.applyStyles(wrapper, lbl, Array.from(btnsRow.children), options);

        return wrapper;
    }

    setupLiveSync(w, nodeId, domElement, updateFn) {
        if (!w || !domElement) return;
        let lastVal = w.value;
        const loop = () => {
            if (!document.body.contains(domElement)) return;
            if (w.value !== lastVal) {
                lastVal = w.value;
                updateFn(lastVal);
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    syncNode() {
        if (app.canvas && app.canvas.parentNode && app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    openMaskEditor(nodeId) {
        const node = app.graph.getNodeById(nodeId);
        if (!node) return;

        let opened = false;
        const openCallback = () => {
            const elevateModalZIndex = () => {
                Array.from(document.body.children).forEach(el => {
                    const classes = el.className || "";
                    const id = el.id || "";
                    if (classes.includes("comfy-modal") || el.tagName === "DIALOG" ||
                        id.includes("mask") || classes.includes("mask") ||
                        id.includes("canvas") || classes.includes("canvas")) {
                        const style = getComputedStyle(el);
                        if (style.position === 'absolute' || style.position === 'fixed') {
                            el.style.zIndex = "10000";
                        }
                    }
                });
            };
            elevateModalZIndex();
            setTimeout(elevateModalZIndex, 100);
            setTimeout(elevateModalZIndex, 300);
            setTimeout(elevateModalZIndex, 600);
        };

        if (typeof node.openMaskEditor === 'function') {
            node.openMaskEditor();
            opened = true;
            openCallback();
        } else if (node.getExtraMenuOptions) {
            const menuOpts = [];
            node.getExtraMenuOptions(app.canvas, menuOpts);
            const maskOption = menuOpts.find(opt =>
                opt && opt.content && (
                    opt.content.toLowerCase().includes("mask") ||
                    opt.content.toLowerCase().includes("canvas") ||
                    opt.content.toLowerCase().includes("editor")
                )
            );
            if (maskOption && maskOption.callback) {
                maskOption.callback();
                opened = true;
                openCallback();
            }
        }

        if (!opened) {
            alert("MaskEditor or Canvas extension not found on this node. Ensure the image is loaded first!");
        }
    }
}

export default LoadImageInterpreter;
