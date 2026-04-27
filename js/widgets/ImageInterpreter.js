
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

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
 * Интерпретатор для виджетов с изображениями (не только LoadImage но и другие)
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class ImageInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 88;
        this.supportedTypes = ['image', 'string'];
        this.supportedNames = ['image', 'img', 'picture', 'photo', 'file', 'filepath', 'image_path'];
    }

    canHandle(w, node, options) {
        const isLoadImageNode = node.type && (
            node.type.toLowerCase().includes("loadimage") ||
            node.type.toLowerCase().includes("load image")
        );

        if (isLoadImageNode) return false;

        const isImageName = this.supportedNames.some(name =>
            w.name.toLowerCase().includes(name)
        );
        const isImageValue = typeof w.value === "string" &&
                            (w.value.endsWith(".png") ||
                             w.value.endsWith(".jpg") ||
                             w.value.endsWith(".jpeg") ||
                             w.value.endsWith(".webp") ||
                             w.value.endsWith(".gif"));

        return isImageName || isImageValue;
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

        if (w.value && (w.value.startsWith("/") || w.value.includes(":\\") || w.value.includes("/"))) {
            img.src = getComfyImageUrl(w.value);
        } else {
            img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%23222'%3E%3Crect width='100' height='100'/%3E%3Ctext x='50' y='50' fill='%23555' font-family='sans-serif' font-size='10' text-anchor='middle' dy='.3em'%3ENO IMAGE%3C/text%3E%3C/svg%3E";
        }

        if (options.objectFit) img.style.objectFit = options.objectFit;

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, img, (newVal) => {
            if (newVal && newVal !== w.value) {
                img.src = getComfyImageUrl(newVal);
            }
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
                    this.sync(w, nodeId, widgetIndex, f);
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
}

export default ImageInterpreter;
