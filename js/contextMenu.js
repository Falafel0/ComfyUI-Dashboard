// Context menu handlers for dashboard-mode
// Widget right-click, container right-click, empty area right-click
// Loaded dynamically from grid.js and ui.js

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
            menu.appendChild(document.createElement("hr"));
            return;
        }
        const el = document.createElement("div");
        el.className = "a11-context-item";
        el.textContent = item.label;
        el.onclick = function(e) { e.stopPropagation(); removeMenu(); item.action(); };
        menu.appendChild(el);
    });
    document.body.appendChild(menu);
    activeMenu = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";
    setTimeout(function() { document.addEventListener("click", removeMenu, true); }, 0);
}

function saveContainer(domElement, config) {
    domElement.dataset.config = JSON.stringify(config);
    import("./grid.js").then(function(m) { m.updateGraphExtra(true); });
}

// ─── Widget context menu ───

export function showWidgetContextMenu(e, wRef, config, domElement) {
    var items = [];
    var wKey = wRef.nodeId + "_" + wRef.widgetIndex;

    items.push({
        label: "Edit \"" + (wRef.widgetName || wRef.name || "Widget") + "\"",
        action: function() {
            var wrapper = domElement.querySelector('.gw-widget-wrapper[data-widget-key="' + wKey + '"]');
            if (wrapper) {
                var editBtn = wrapper.querySelector(".gw-widget-edit");
                if (editBtn) editBtn.click();
            }
        }
    });

    items.push({
        label: "Remove Widget",
        action: function() {
            if (config && config.widgets) {
                config.widgets = config.widgets.filter(function(w) {
                    return !(w.nodeId === wRef.nodeId && w.widgetIndex === wRef.widgetIndex);
                });
                saveContainer(domElement, config);
                import("./grid.js").then(function(m) {
                    m.renderGridItemContent(domElement, config);
                });
            }
        }
    });

    if (items.length > 0) createMenu(items, e.clientX, e.clientY);
}

// ─── Container context menu ───

export function showContainerContextMenu(e, el, conf) {
    var items = [];
    var content = el.querySelector(".grid-stack-item-content") || el;

    items.push({
        label: "Edit Settings",
        action: function() {
            import("./grid.js").then(function(m) {
                m.openFullscreenEditor(conf, content);
            });
        }
    });

    items.push({
        label: conf.pinned ? "Unpin" : "Pin",
        action: function() {
            conf.pinned = !conf.pinned;
            saveContainer(content, conf);
            import("./grid.js").then(function(m) {
                m.renderGridItemContent(content, conf);
            });
        }
    });

    items.push(null);

    items.push({
        label: "Duplicate",
        action: function() {
            import("./grid.js").then(function(m) {
                var newConf = JSON.parse(JSON.stringify(conf));
                newConf.name = (newConf.name || "Container") + " (copy)";
                delete newConf.gsId;
                m.addGridItem(newConf, { x: null, y: null, w: conf.w || 4, h: conf.h || 2 });
            });
        }
    });

    items.push({
        label: "Delete",
        action: function() {
            if (!confirm("Delete \"" + (conf.name || "Container") + "\"?")) return;
            import("./state.js").then(function(stateMod) {
                var gsId = el.closest(".grid-stack-item")?.getAttribute("gs-id");
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
    var items = [];

    items.push({
        label: "Add Text Container",
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
        label: "Add Image Container",
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
