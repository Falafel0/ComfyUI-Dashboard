import os
import json
import server
from aiohttp import web

# Import all node classes and mappings from nodes.py
from .nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)

WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']


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