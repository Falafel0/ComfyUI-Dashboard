import os
import json
import server
from aiohttp import web

WEB_DIRECTORY = "./js"

__all__ = ['WEB_DIRECTORY']


@server.PromptServer.instance.routes.get("/a11_studio/css/{filename}")
async def serve_css(request):
    filename = request.match_info["filename"]
    css_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "css", filename)
    if not os.path.exists(css_path):
        return web.Response(status=404, text="File not found")
    return web.FileResponse(css_path, headers={"Content-Type": "text/css"})

@server.PromptServer.instance.routes.get("/a11_studio/settings")
async def get_settings(request):
    settings_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "settings.json")
    if os.path.exists(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                return web.json_response(json.load(f))
        except Exception:
            pass
    return web.json_response({})

@server.PromptServer.instance.routes.post("/a11_studio/settings")
async def save_settings_route(request):
    data = await request.json()
    settings_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "settings.json")
    try:
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/a11_studio/get_output_folders")
async def get_output_folders(request):
    import folder_paths
    out_dir = folder_paths.get_output_directory()
    folders = []
    try:
        if os.path.exists(out_dir):
            for entry in os.listdir(out_dir):
                if os.path.isdir(os.path.join(out_dir, entry)):
                    folders.append(entry)
    except Exception:
        pass
    return web.json_response({"folders": sorted(folders)})

@server.PromptServer.instance.routes.post("/a11_studio/save_image")
async def manual_save_image(request):
    import folder_paths
    import time
    post = await request.post()
    image = post.get("image")
    folder = post.get("folder", "").strip()
    filename = post.get("filename", "").strip()
    if image and image.file:
        out_dir = folder_paths.get_output_directory()
        if folder:
            folder = folder.replace("..", "").lstrip("\\/")
            out_dir = os.path.join(out_dir, folder)
            os.makedirs(out_dir, exist_ok=True)
        if not filename:
            filename = f"A11_Save_{int(time.time()*1000)}.png"
        if not filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            filename += ".png"
        filepath = os.path.join(out_dir, filename)
        with open(filepath, "wb") as f:
            f.write(image.file.read())
        return web.json_response({"status": "ok", "filename": filename, "folder": folder})
    return web.json_response({"status": "error", "message": "No image provided"}, status=400)

@server.PromptServer.instance.routes.get("/a11_studio/presets")
async def get_presets(request):
    presets_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "value_presets.json")
    if os.path.exists(presets_file):
        try:
            with open(presets_file, "r", encoding="utf-8") as f:
                return web.json_response(json.load(f))
        except Exception:
            pass
    return web.json_response({"tabs": [], "containers": []})

@server.PromptServer.instance.routes.post("/a11_studio/presets")
async def save_presets(request):
    data = await request.json()
    presets_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "value_presets.json")
    try:
        with open(presets_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/a11_studio/import_csv_presets")
async def import_csv_presets(request):
    """Import style presets from CSV files in presets/csv/ folder."""
    import csv as csv_module
    import io

    data = await request.json()
    csv_filename = data.get("filename", "").strip()

    presets_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "value_presets.json")
    csv_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "presets", "csv")

    imported = []
    errors = []

    files_to_import = []
    if csv_filename:
        fp = os.path.join(csv_dir, csv_filename)
        if os.path.isfile(fp):
            files_to_import.append(fp)
        else:
            return web.json_response({"status": "error", "message": f"File not found: {csv_filename}"}, status=404)
    else:
        if os.path.isdir(csv_dir):
            for entry in sorted(os.listdir(csv_dir)):
                if entry.lower().endswith(".csv"):
                    files_to_import.append(os.path.join(csv_dir, entry))

    for fp in files_to_import:
        try:
            with open(fp, "r", encoding="utf-8-sig") as f:
                reader = csv_module.DictReader(f)
                for row in reader:
                    name = row.get("preset name", "").strip()
                    prompt = row.get("prompt", "").strip()
                    negative = row.get("negative", "").strip()
                    if name:
                        imported.append({
                            "id": f"csv_{os.path.splitext(os.path.basename(fp))[0]}_{name.lower().replace(' ', '_')}",
                            "name": name,
                            "category": os.path.splitext(os.path.basename(fp))[0],
                            "values": [
                                {"nodeTitle": "positive", "nodeType": "CR Prompt Text", "widgetName": "prompt", "value": prompt},
                                {"nodeTitle": "negative", "nodeType": "CR Prompt Text", "widgetName": "prompt", "value": negative}
                            ],
                            "metadata": {"source": "csv_import", "prompt": prompt, "negative": negative},
                            "createdAt": None,
                            "modifiedAt": None
                        })
        except Exception as e:
            errors.append(f"{os.path.basename(fp)}: {str(e)}")

    if imported:
        existing = {"tabs": [], "containers": []}
        if os.path.exists(presets_file):
            try:
                with open(presets_file, "r", encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                pass

        containers = existing.get("containers", [])
        existing_ids = {c.get("id") for c in containers}
        new_containers = [c for c in imported if c["id"] not in existing_ids]
        containers = new_containers + containers
        existing["containers"] = containers

        with open(presets_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=4)

    return web.json_response({
        "status": "ok",
        "imported": len(imported) - len(errors),
        "errors": errors
    })