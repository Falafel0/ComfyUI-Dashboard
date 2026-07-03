import { state } from "./state.js";

let activeMenu = null;

function removeMenu() {
    if (activeMenu) { activeMenu.remove(); activeMenu = null; }
    document.removeEventListener("click", removeMenu, true);
}

function createMenu(items, x, y) {
    removeMenu();
    const menu = document.createElement("div");
    menu.className = "a11-context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    items.forEach(function(item) {
        if (item === null) {
            const hr = document.createElement("hr");
            menu.appendChild(hr);
            return;
        }
        const el = document.createElement("div");
        el.className = "a11-context-item";
        if (item.disabled) el.classList.add("disabled");
        el.textContent = item.label;
        if (!item.disabled) {
            el.onclick = function(e) { e.stopPropagation(); removeMenu(); item.action(); };
        }
        menu.appendChild(el);
    });

    document.body.appendChild(menu);
    activeMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";

    setTimeout(function() { document.addEventListener("click", removeMenu, true); }, 0);
}

// ─── Widget context menu ───

export function showWidgetContextMenu(e, wRef, config, domElement) {
    const isEdit = state.isEditMode;
    const wKey = wRef.nodeId + "_" + wRef.widgetIndex;
    const items = [];

    items.push({
        label: 'Edit "' + (wRef.alias || wRef.widgetName || wRef.name || "Widget") + '"',
        disabled: !isEdit,
        action: function() {
            import("./grid.js").then(function(m) {
                m.openSingleWidgetSettings(wRef, function() {
                    m.renderGridItemContent(domElement, config);
                    m.updateGraphExtra(true);
                });
            });
        }
    });

    items.push({
        label: "Duplicate Widget",
        disabled: !isEdit,
        action: function() {
            if (config && config.widgets) {
                const dup = JSON.parse(JSON.stringify(wRef));
                config.widgets.push(dup);
                import("./grid.js").then(function(m) {
                    m.renderGridItemContent(domElement, config);
                    m.updateGraphExtra(true);
                });
            }
        }
    });

    items.push(null);

    items.push({
        label: "Remove Widget",
        disabled: !isEdit,
        action: function() {
            if (config && config.widgets) {
                config.widgets = config.widgets.filter(function(w) {
                    return !(w.nodeId === wRef.nodeId && w.widgetIndex === wRef.widgetIndex);
                });
                import("./grid.js").then(function(m) {
                    m.renderGridItemContent(domElement, config);
                    m.updateGraphExtra(true);
                });
            }
        }
    });

    createMenu(items, e.clientX, e.clientY);
}

// ─── Container context menu ───

export function showContainerContextMenu(e, el, conf) {
    const isEdit = state.isEditMode;
    const items = [];
    const content = el.querySelector(".grid-stack-item-content") || el;

    items.push({
        label: "Edit Settings",
        disabled: !isEdit,
        action: function() {
            import("./grid.js").then(function(m) {
                m.openFullscreenEditor(conf, content);
            });
        }
    });

    items.push({
        label: (conf.pinned ? "📍 Unpin" : "📌 Pin"),
        disabled: !isEdit,
        action: function() {
            conf.pinned = !conf.pinned;
            content.dataset.config = JSON.stringify(conf);
            import("./grid.js").then(function(m) {
                m.renderGridItemContent(content, conf);
                m.updateGraphExtra(true);
            });
        }
    });

    items.push(null);

    items.push({
        label: "Duplicate",
        disabled: !isEdit,
        action: function() {
            import("./grid.js").then(function(m) {
                const newConf = JSON.parse(JSON.stringify(conf));
                newConf.name = (newConf.name || "Container") + " (copy)";
                delete newConf.gsId;
                m.addGridItem(newConf, { x: null, y: null, w: conf.w || 4, h: conf.h || 2 });
            });
        }
    });

    items.push({
        label: "Delete",
        disabled: !isEdit,
        action: function() {
            import("./state.js").then(function(stateMod) {
                const gsId = el.closest(".grid-stack-item")?.getAttribute("gs-id");
                if (gsId && stateMod.state.grid) {
                    stateMod.state.grid.removeWidget(gsId);
                    import("./grid.js").then(function(m) { m.updateGraphExtra(true); });
                }
            });
        }
    });

    createMenu(items, e.clientX, e.clientY);
}

// ─── Empty area context menu ───

export function showEmptyContextMenu(e) {
    if (!state.isEditMode) return;

    const items = [];

    items.push({
        label: "+ Add Container",
        action: function() {
            import("./grid.js").then(function(m) {
                m.addGridItem({
                    name: "Container",
                    type: "default",
                    widgets: [],
                    w: 4, h: 2
                }, { x: null, y: null, w: 4, h: 2 });
            });
        }
    });

    items.push({
        label: "🔍 Search Node & Add...",
        action: function() {
            const searchInput = document.getElementById("a11-node-search");
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    items.push(null);

    items.push({
        label: "📝 Add Text Container",
        action: function() {
            import("./grid.js").then(function(m) {
                m.addGridItem({
                    name: "Text",
                    type: "text",
                    text: "",
                    w: 4, h: 2
                }, { x: null, y: null, w: 4, h: 2 });
            });
        }
    });

    items.push({
        label: "🖼️ Add Image Container",
        action: function() {
            import("./grid.js").then(function(m) {
                m.addGridItem({
                    name: "Image",
                    type: "image",
                    w: 4, h: 3
                }, { x: null, y: null, w: 4, h: 3 });
            });
        }
    });

    createMenu(items, e.clientX, e.clientY);
}
