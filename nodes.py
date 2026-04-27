import os
import json
import math
import time
import random
import folder_paths
import comfy.sd
import comfy.samplers
import comfy.utils
import torch
import torch.nn.functional as F
import torchvision.transforms.functional as TF
import nodes

MAX_RESOLUTION = 8192

# ==========================================
# GLOBAL STATE & ANY TYPE
# ==========================================
GLOBAL_STACKS = {}
GLOBAL_SIGNALS = {}

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")

def create_blocker():
    """Creates a blocker node that prevents execution"""
    pass

# ==========================================
# FILE I/O HELPER FUNCTIONS
# ==========================================
def _read_states():
    settings_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "settings.json")
    if os.path.exists(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("states", {})
        except Exception:
            pass
    return {}

def _write_states(states):
    settings_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "settings.json")
    try:
        existing = {}
        if os.path.exists(settings_file):
            with open(settings_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
        existing["states"] = states
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=4)
    except Exception:
        pass

def _read_presets():
    presets_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "value_presets.json")
    if os.path.exists(presets_file):
        try:
            with open(presets_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"tabs": [], "containers":[]}

def _write_presets(presets):
    presets_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "value_presets.json")
    try:
        with open(presets_file, "w", encoding="utf-8") as f:
            json.dump(presets, f, indent=4)
    except Exception:
        pass

def _read_custom_list():
    custom_list_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "fsd_custom_list.txt")
    if os.path.exists(custom_list_file):
        try:
            with open(custom_list_file, "r", encoding="utf-8") as f:
                items =[line.strip() for line in f.readlines() if line.strip()]
                return items if items else["Option 1", "Option 2", "Option 3"]
        except Exception:
            pass
    return["Option 1", "Option 2", "Option 3"]

def _write_custom_list(items):
    custom_list_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "fsd_custom_list.txt")
    try:
        with open(custom_list_file, "w", encoding="utf-8") as f:
            for item in items:
                f.write(item + "\n")
    except Exception:
        pass

def _get_nodes_in_group(group_name):
    return[]

def _parse_multi_ids(multi_id_string):
    if not multi_id_string:
        return []
    return[x.strip() for x in multi_id_string.split(",") if x.strip()]


# ==========================================
# RESIZE & BLEND UTILS FOR FSD PIPES
# ==========================================
def fsd_resize(image, target_w, target_h, mode):
    B, H, W, C = image.shape
    img_moved = image.movedim(-1, 1) # (B, C, H, W)
    
    if mode == "Just resize":
        resized = F.interpolate(img_moved, size=(target_h, target_w), mode="bicubic", align_corners=False)
    
    elif mode == "Crop and resize":
        ratio_img = W / H
        ratio_tgt = target_w / target_h
        if ratio_img > ratio_tgt:
            new_W = int(H * ratio_tgt)
            offset = (W - new_W) // 2
            cropped = img_moved[:, :, :, offset:offset+new_W]
        else:
            new_H = int(W / ratio_tgt)
            offset = (H - new_H) // 2
            cropped = img_moved[:, :, offset:offset+new_H, :]
        resized = F.interpolate(cropped, size=(target_h, target_w), mode="bicubic", align_corners=False)
    
    elif mode == "Resize and fill":
        ratio_img = W / H
        ratio_tgt = target_w / target_h
        if ratio_img > ratio_tgt:
            new_W = target_w; new_H = int(target_w / ratio_img)
        else:
            new_H = target_h; new_W = int(target_h * ratio_img)
        
        resized_inner = F.interpolate(img_moved, size=(new_H, new_W), mode="bicubic", align_corners=False)
        bg = F.interpolate(img_moved, size=(target_h, target_w), mode="bicubic", align_corners=False)
        bg = TF.gaussian_blur(bg, kernel_size=[51, 51]) # Сильное размытие для фона
        
        y_off = (target_h - new_H) // 2
        x_off = (target_w - new_W) // 2
        bg[:, :, y_off:y_off+new_H, x_off:x_off+new_W] = resized_inner
        resized = bg
        
    return resized.movedim(1, -1).clamp(0, 1)


# ==========================================
#[FSD/1. Pipeline Core]
# ==========================================
class FSD_TopPanel:
    @classmethod
    def INPUT_TYPES(s): 
        return {
            "required": {
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"), ), 
                "vae_name": (["Automatic"] + folder_paths.get_filename_list("vae"),), 
                "clip_skip": ("INT", {"default": 1, "min": 1, "max": 12, "step": 1})
            },
            "optional": {
                "model_override": ("MODEL",),
                "clip_override": ("CLIP",),
                "vae_override": ("VAE",)
            }
        }
    RETURN_TYPES = ("FSD_PIPE",)
    FUNCTION = "load"
    CATEGORY = "FSD/1. Pipeline Core"

    def load(self, ckpt_name, vae_name, clip_skip, model_override=None, clip_override=None, vae_override=None):
        if model_override is not None and clip_override is not None and vae_override is not None:
            model, clip, vae = model_override, clip_override, vae_override
        else:
            ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
            model_c, clip_c, vae_c = comfy.sd.load_checkpoint_guess_config(
                ckpt_path, output_vae=True, output_clip=True, 
                embedding_directory=folder_paths.get_folder_paths("embeddings")
            )[:3]
            model = model_override if model_override is not None else model_c
            clip = clip_override if clip_override is not None else clip_c
            vae = vae_override if vae_override is not None else vae_c

        if clip_skip > 1: 
            clip = clip.clone()
            clip.clip_layer(-(clip_skip))
            
        if vae_override is None and vae_name != "Automatic": 
            vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(folder_paths.get_full_path("vae", vae_name)))
            
        # Устанавливаем безопасные дефолтные значения, чтобы пайплайн не падал, если пропущены узлы
        pipe = {
            "model": model, "clip": clip, "vae": vae,
            "target_width": 512, "target_height": 512,
            "steps": 20, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal",
            "denoise": 1.0,
            "positive":[], "negative":[]
        }
        return (pipe, )

class FSD_SamplerSettings:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"default": "dpmpp_2m"}), "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"default": "karras"}), "steps": ("INT", {"default": 20, "min": 1, "max": 150}), "cfg_scale": ("FLOAT", {"default": 7.0, "min": 1.0, "max": 30.0, "step": 0.5})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "set"; CATEGORY = "FSD/1. Pipeline Core"
    def set(self, pipe, sampler_name, scheduler, steps, cfg_scale):
        p = pipe.copy(); p["sampler_name"] = sampler_name; p["scheduler"] = scheduler; p["steps"] = steps; p["cfg"] = cfg_scale
        return (p, )

class FSD_Dimensions:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "width": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}), "height": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}), "batch_size": ("INT", {"default": 1, "min": 1, "max": 64})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "set"; CATEGORY = "FSD/1. Pipeline Core"
    def set(self, pipe, width, height, batch_size):
        p = pipe.copy()
        p["latent"] = {"samples": torch.zeros([batch_size, 4, height // 8, width // 8])}
        p["target_width"] = width; p["target_height"] = height; p["denoise"] = 1.0
        return (p, )

class FSD_Generate:
    @classmethod
    def INPUT_TYPES(s): 
        return {
            "required": {
                "pipe": ("FSD_PIPE",), 
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})
            },
            "optional": {
                "latent_override": ("LATENT", )
            }
        }
    RETURN_TYPES = ("FSD_PIPE", "IMAGE", "LATENT")
    RETURN_NAMES = ("FSD_PIPE", "IMAGE", "LATENT")
    FUNCTION = "generate"
    CATEGORY = "FSD/1. Pipeline Core"

    def generate(self, pipe, seed, latent_override=None):
        p = pipe.copy()
        model, pos, neg, vae = p.get("model"), p.get("positive"), p.get("negative"), p.get("vae")
        
        latent = latent_override if latent_override is not None else p.get("latent")
        
        # Защита, если latent не был создан
        if latent is None:
            latent = {"samples": torch.zeros([1, 4, p.get("target_height", 512) // 8, p.get("target_width", 512) // 8])}
            
        actual_seed = p.get("seed", seed)
        
        sample_res = nodes.common_ksampler(
            model=model, seed=actual_seed, steps=p.get("steps", 20), cfg=p.get("cfg", 7.0), 
            sampler_name=p.get("sampler_name", "euler"), scheduler=p.get("scheduler", "normal"), 
            positive=pos, negative=neg, latent=latent, denoise=p.get("denoise", 1.0)
        )
        gen_image = vae.decode(sample_res[0]["samples"])
        
        p["latent"] = sample_res[0]
        p["image"] = gen_image
        return (p, gen_image, sample_res[0])

class FSD_SaveImage:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"image": ("IMAGE",), "filename_prefix": ("STRING", {"default": "FSD_output"})}, "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}}
    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "FSD/1. Pipeline Core"
    def save(self, image, filename_prefix, prompt=None, extra_pnginfo=None): 
        return nodes.NODE_CLASS_MAPPINGS["SaveImage"]().save_images(images=image, filename_prefix=filename_prefix, prompt=prompt, extra_pnginfo=extra_pnginfo)

# ==========================================
#[FSD/2. Conditioning]
# ==========================================
class FSD_Prompts:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "positive": ("STRING", {"multiline": True, "default": ""}), "negative": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "encode"; CATEGORY = "FSD/2. Conditioning"
    def encode(self, pipe, positive, negative):
        p = pipe.copy()
        clip = p["clip"]
        t_pos = clip.tokenize(positive); c_pos, p_pos = clip.encode_from_tokens(t_pos, return_pooled=True)
        t_neg = clip.tokenize(negative); c_neg, p_neg = clip.encode_from_tokens(t_neg, return_pooled=True)
        p["positive"] = [[c_pos, {"pooled_output": p_pos}]]; p["negative"] = [[c_neg, {"pooled_output": p_neg}]]
        p["pos_text"] = positive; p["neg_text"] = negative 
        return (p, )

class FSD_ControlNet:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "control_net_name": (folder_paths.get_filename_list("controlnet"), ), "image": ("IMAGE",), "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/2. Conditioning"
    def apply(self, pipe, control_net_name, image, strength):
        p = pipe.copy()
        cnet = nodes.ControlNetLoader().load_controlnet(control_net_name)[0]
        cnet_node = nodes.NODE_CLASS_MAPPINGS["ControlNetApplyAdvanced"]()
        p["positive"], p["negative"] = cnet_node.apply_controlnet(p["positive"], p["negative"], cnet, image, strength, 0.0, 1.0)
        return (p, )

class FSD_ConditioningCombine:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_dst": ("FSD_PIPE",), "pipe_src": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "combine"; CATEGORY = "FSD/2. Conditioning"
    def combine(self, pipe_dst, pipe_src):
        p = pipe_dst.copy()
        p["positive"] = p.get("positive",[]) + pipe_src.get("positive",[])
        p["negative"] = p.get("negative",[]) + pipe_src.get("negative",[])
        return (p, )

# ==========================================
# [FSD/3. Modifiers]
# ==========================================
class FSD_LoRA:
    @classmethod
    def INPUT_TYPES(s): 
        loras = ["None"] + folder_paths.get_filename_list("loras")
        return {"required": {"pipe": ("FSD_PIPE",), "lora_name": (loras, ), "strength_model": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}), "strength_clip": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})}, "optional": {"lora_stack": ("LORA_STACK", )}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, lora_name, strength_model, strength_clip, lora_stack=None):
        p = pipe.copy(); loader = nodes.LoraLoader()
        if lora_stack is not None:
            for lora, s_model, s_clip in lora_stack: p["model"], p["clip"] = loader.load_lora(p["model"], p["clip"], lora, s_model, s_clip)
        if lora_name != "None" and (strength_model != 0 or strength_clip != 0):
            p["model"], p["clip"] = loader.load_lora(p["model"], p["clip"], lora_name, strength_model, strength_clip)
        return (p, )

class FSD_LoraStack:
    @classmethod
    def INPUT_TYPES(s): 
        loras =["None"] + folder_paths.get_filename_list("loras")
        return {"required": {"pipe": ("FSD_PIPE",), "lora_1": (loras, ), "strength_1": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}), "lora_2": (loras, ), "strength_2": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}), "lora_3": (loras, ), "strength_3": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),}, "optional": {"lora_stack": ("LORA_STACK", )}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, lora_1, strength_1, lora_2, strength_2, lora_3, strength_3, lora_stack=None):
        p = pipe.copy(); loader = nodes.LoraLoader()
        if lora_stack is not None:
            for lora, s_model, s_clip in lora_stack: p["model"], p["clip"] = loader.load_lora(p["model"], p["clip"], lora, s_model, s_clip)
        for lora, strength in[(lora_1, strength_1), (lora_2, strength_2), (lora_3, strength_3)]:
            if lora != "None" and strength != 0: p["model"], p["clip"] = loader.load_lora(p["model"], p["clip"], lora, strength, strength)
        return (p, )

class FSD_PatchFreeU:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "b1": ("FLOAT", {"default": 1.3, "min": 0.0, "max": 10.0, "step": 0.01}), "b2": ("FLOAT", {"default": 1.4, "min": 0.0, "max": 10.0, "step": 0.01}), "s1": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 10.0, "step": 0.01}), "s2": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 10.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, b1, b2, s1, s2):
        p = pipe.copy()
        if "FreeU_V2" in nodes.NODE_CLASS_MAPPINGS: p["model"] = nodes.NODE_CLASS_MAPPINGS["FreeU_V2"]().patch(p["model"], b1, b2, s1, s2)[0]
        elif "FreeU" in nodes.NODE_CLASS_MAPPINGS: p["model"] = nodes.NODE_CLASS_MAPPINGS["FreeU"]().patch(p["model"], b1, b2, s1, s2)[0]
        return (p, )

class FSD_PatchToMe:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "ratio": ("FLOAT", {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, ratio):
        p = pipe.copy()
        if ratio > 0 and "TomePatchModel" in nodes.NODE_CLASS_MAPPINGS: p["model"] = nodes.NODE_CLASS_MAPPINGS["TomePatchModel"]().patch(p["model"], ratio)[0]
        return (p, )

class FSD_PatchRescaleCFG:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "multiplier": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, multiplier):
        p = pipe.copy()
        if "RescaleCFG" in nodes.NODE_CLASS_MAPPINGS: p["model"] = nodes.NODE_CLASS_MAPPINGS["RescaleCFG"]().patch(p["model"], multiplier)[0]
        return (p, )

class FSD_PatchModelMerge:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "ckpt_name": (folder_paths.get_filename_list("checkpoints"), ), "merge_ratio": ("FLOAT", {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/3. Modifiers"
    def apply(self, pipe, ckpt_name, merge_ratio):
        p = pipe.copy()
        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
        model_to_merge = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=False, output_clip=False)[0]
        if "ModelMergeSimple" in nodes.NODE_CLASS_MAPPINGS: p["model"] = nodes.NODE_CLASS_MAPPINGS["ModelMergeSimple"]().merge(p["model"], model_to_merge, merge_ratio)[0]
        return (p, )

# ==========================================
#[FSD/4. Image Processing]
# ==========================================
class FSD_Img2Img:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "image": ("IMAGE",), "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}), "size_mode": (["Original Size", "Custom", "From Pipe (Dimensions)"],), "width": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}), "height": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}), "resize_mode": (["Just resize", "Crop and resize", "Resize and fill"],), "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "apply"; CATEGORY = "FSD/4. Image Processing"
    def apply(self, pipe, image, seed, size_mode, width, height, resize_mode, denoise):
        p = pipe.copy(); B, H, W, C = image.shape
        if size_mode == "Original Size": tw, th = int(W), int(H)
        elif size_mode == "Custom": tw, th = width, height
        else: tw, th = p.get("target_width", 512), p.get("target_height", 512)
        p["target_width"] = tw; p["target_height"] = th
        resized_image = fsd_resize(image, tw, th, resize_mode)
        p["latent"] = {"samples": p["vae"].encode(resized_image[:,:,:,:3])}
        p["denoise"] = denoise
        p["seed"] = seed
        return (p, )

class FSD_Inpaint:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "pipe": ("FSD_PIPE",), 
            "image": ("IMAGE",), 
            "mask": ("MASK",),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            "size_mode": (["Original Size", "Custom", "From Pipe (Dimensions)"],),
            "width": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
            "height": ("INT", {"default": 512, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
            "resize_scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.05}),
            "inpaint_area": (["Whole picture", "Only masked"],),
            "resize_mode": (["Just resize", "Crop and resize", "Resize and fill"],),
            "mask_mode": (["Inpaint masked", "Inpaint not masked"],),
            "mask_blur": ("INT", {"default": 4, "min": 0, "max": 64, "step": 1}),
            "masked_content": (["original", "fill", "latent noise", "latent nothing"],),
            "context_padding": ("INT", {"default": 32, "min": 0, "max": 256, "step": 4}),
            "context_expand": ("FLOAT", {"default": 1.0, "min": 1.0, "max": 10.0, "step": 0.05}),
            "context_preserve_aspect": ("BOOLEAN", {"default": True}),
            "denoise": ("FLOAT", {"default": 0.75, "min": 0.0, "max": 1.0, "step": 0.01}),
        }}
    
    RETURN_TYPES = ("FSD_PIPE", "IMAGE")
    RETURN_NAMES = ("FSD_PIPE", "IMAGE")
    FUNCTION = "apply"
    CATEGORY = "FSD/4. Image Processing"
    
    def apply(self, pipe, image, mask, seed, size_mode, width, height, resize_scale, inpaint_area, resize_mode, mask_mode, mask_blur, masked_content, context_padding, context_expand, context_preserve_aspect, denoise):
        p = pipe.copy()
        current_image = image[0:1].clone() 
        p["seed"] = seed
        
        for i in range(mask.shape[0]):
            B, H, W, C = current_image.shape
            
            if size_mode == "Original Size": tw, th = int(W), int(H)
            elif size_mode == "Custom": tw, th = width, height
            else: tw, th = p.get("target_width", int(W)), p.get("target_height", int(H))
            
            tw = max(64, int(tw * resize_scale) // 8 * 8)
            th = max(64, int(th * resize_scale) // 8 * 8)
            p["target_width"], p["target_height"] = tw, th
            
            curr_mask = mask[i:i+1].clone()
            if mask_blur > 0:
                k = mask_blur * 2 + 1
                curr_mask = TF.gaussian_blur(curr_mask.unsqueeze(1), kernel_size=[k, k]).squeeze(1)
            if mask_mode == "Inpaint not masked":
                curr_mask = 1.0 - curr_mask
            
            m_exp = curr_mask.unsqueeze(-1).expand_as(current_image)
            img_cont = current_image.clone()
            if masked_content == "fill":
                blurred = TF.gaussian_blur(img_cont.movedim(-1,1), kernel_size=[51,51]).movedim(1,-1)
                img_cont = img_cont * (1 - m_exp) + blurred * m_exp
            elif masked_content == "latent noise":
                img_cont = img_cont * (1 - m_exp) + torch.rand_like(img_cont) * m_exp
            elif masked_content == "latent nothing":
                img_cont = img_cont * (1 - m_exp)
    
            crop_data = None
            if inpaint_area == "Only masked":
                non_zero = torch.nonzero(curr_mask[0])
                if len(non_zero) > 0:
                    y1_r, x1_r = non_zero.min(dim=0).values
                    y2_r, x2_r = non_zero.max(dim=0).values
                    
                    cx, cy = (x1_r + x2_r) / 2.0, (y1_r + y2_r) / 2.0
                    cw, ch = (x2_r - x1_r) + context_padding * 2, (y2_r - y1_r) + context_padding * 2
                    cw, ch = cw * context_expand, ch * context_expand
                    
                    if context_preserve_aspect:
                        target_ar = tw / th
                        if (cw / max(1.0, ch)) > target_ar: ch = cw / target_ar
                        else: cw = ch * target_ar
                            
                    scale = min(W / cw, H / ch, 1.0)
                    cw, ch = int(cw * scale), int(ch * scale)
                    
                    x1 = max(0, min(int(cx - cw // 2), W - cw))
                    y1 = max(0, min(int(cy - ch // 2), H - ch))
                    x2, y2 = x1 + cw, y1 + ch
                    
                    crop_data = (y1, y2, x1, x2)
                    final_img = fsd_resize(img_cont[:, y1:y2, x1:x2, :], tw, th, "Just resize")
                    final_mask = F.interpolate(curr_mask[:, y1:y2, x1:x2].unsqueeze(1), size=(th, tw), mode="bilinear").squeeze(1)
                else:
                    final_img, final_mask = fsd_resize(img_cont, tw, th, resize_mode), F.interpolate(curr_mask.unsqueeze(1), size=(th, tw), mode="bilinear").squeeze(1)
            else:
                final_img, final_mask = fsd_resize(img_cont, tw, th, resize_mode), F.interpolate(curr_mask.unsqueeze(1), size=(th, tw), mode="bilinear").squeeze(1)
    
            latent = nodes.SetLatentNoiseMask().set_mask({"samples": p["vae"].encode(final_img[:,:,:,:3])}, final_mask)[0]
            res = nodes.common_ksampler(p["model"], seed + i, p["steps"], p["cfg"], p["sampler_name"], p["scheduler"], p.get("positive", []), p.get("negative",[]), latent, denoise)
            gen_img = p["vae"].decode(res[0]["samples"])
    
            if crop_data:
                y1, y2, x1, x2 = crop_data
                gen_resized = F.interpolate(gen_img.movedim(-1,1), size=(y2-y1, x2-x1), mode='bicubic').movedim(1,-1)
                m_crop = curr_mask[:, y1:y2, x1:x2].unsqueeze(-1)
                current_image[:, y1:y2, x1:x2, :] = current_image[:, y1:y2, x1:x2, :] * (1 - m_crop) + gen_resized * m_crop
            else:
                current_image = gen_img
        
        p["latent"] = {"samples": p["vae"].encode(current_image[:,:,:,:3])}
        return (p, current_image)

class FSD_HiresFix_Latent:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "upscale_method": (["bilinear", "nearest-exact", "bicubic", "area", "bislerp"],), "scale_by": ("FLOAT", {"default": 2.0, "min": 1.1, "max": 4.0, "step": 0.05}), "hires_steps": ("INT", {"default": 0, "min": 0, "max": 150}), "sampler_name": (["Use Base"] + comfy.samplers.KSampler.SAMPLERS, ), "scheduler": (["Use Base"] + comfy.samplers.KSampler.SCHEDULERS, ), "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),}}
    RETURN_TYPES = ("FSD_PIPE", "IMAGE"); FUNCTION = "apply"; CATEGORY = "FSD/4. Image Processing"
    def apply(self, pipe, upscale_method, scale_by, hires_steps, sampler_name, scheduler, denoise):
        p = pipe.copy(); latent = p["latent"]["samples"]
        B, C, H, W = latent.shape
        upscaled = comfy.utils.common_upscale(latent, int(W * scale_by), int(H * scale_by), upscale_method, "disabled")
        steps = hires_steps if hires_steps > 0 else p["steps"]
        s_name = p["sampler_name"] if sampler_name == "Use Base" else sampler_name
        sched = p["scheduler"] if scheduler == "Use Base" else scheduler
        sample_res = nodes.common_ksampler(model=p["model"], seed=p.get("seed", 0), steps=steps, cfg=p["cfg"], sampler_name=s_name, scheduler=sched, positive=p["positive"], negative=p["negative"], latent={"samples": upscaled}, denoise=denoise)
        p["latent"] = sample_res[0]
        return (p, p["vae"].decode(sample_res[0]["samples"]))

class FSD_HiresFix_Pixel:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "upscale_model": (folder_paths.get_filename_list("upscale_models"), ), "scale_by": ("FLOAT", {"default": 2.0, "min": 1.1, "max": 4.0, "step": 0.05}), "hires_steps": ("INT", {"default": 0, "min": 0, "max": 150}), "sampler_name": (["Use Base"] + comfy.samplers.KSampler.SAMPLERS, ), "scheduler": (["Use Base"] + comfy.samplers.KSampler.SCHEDULERS, ), "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),}}
    RETURN_TYPES = ("FSD_PIPE", "IMAGE"); FUNCTION = "apply"; CATEGORY = "FSD/4. Image Processing"
    def apply(self, pipe, upscale_model, scale_by, hires_steps, sampler_name, scheduler, denoise):
        p = pipe.copy()
        base_img = p["vae"].decode(p["latent"]["samples"])
        model = nodes.NODE_CLASS_MAPPINGS["UpscaleModelLoader"]().load_model(upscale_model)[0]
        up_img = nodes.NODE_CLASS_MAPPINGS["ImageUpscaleWithModel"]().upscale(model, base_img)[0]
        B, H, W, C = base_img.shape
        target_w = int(W * scale_by); target_h = int(H * scale_by)
        up_img = fsd_resize(up_img, target_w, target_h, "Just resize")
        new_latent = {"samples": p["vae"].encode(up_img)}
        steps = hires_steps if hires_steps > 0 else p["steps"]
        s_name = p["sampler_name"] if sampler_name == "Use Base" else sampler_name
        sched = p["scheduler"] if scheduler == "Use Base" else scheduler
        sample_res = nodes.common_ksampler(model=p["model"], seed=p.get("seed", 0), steps=steps, cfg=p["cfg"], sampler_name=s_name, scheduler=sched, positive=p["positive"], negative=p["negative"], latent=new_latent, denoise=denoise)
        p["latent"] = sample_res[0]
        return (p, p["vae"].decode(sample_res[0]["samples"]))

class FSD_TiledUpscale:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "upscale_model": (folder_paths.get_filename_list("upscale_models"), ), "scale_by": ("FLOAT", {"default": 2.0, "min": 1.1, "max": 4.0, "step": 0.05}), "tile_width": ("INT", {"default": 512, "min": 256, "max": 1024, "step": 64}), "tile_height": ("INT", {"default": 512, "min": 256, "max": 1024, "step": 64}), "overlap": ("INT", {"default": 64, "min": 0, "max": 256, "step": 8}), "denoise": ("FLOAT", {"default": 0.35, "min": 0.0, "max": 1.0, "step": 0.01}),}}
    RETURN_TYPES = ("FSD_PIPE", "IMAGE"); FUNCTION = "apply"; CATEGORY = "FSD/4. Image Processing"
    def apply(self, pipe, upscale_model, scale_by, tile_width, tile_height, overlap, denoise):
        p = pipe.copy()
        base_img = p["vae"].decode(p["latent"]["samples"])
        model = nodes.NODE_CLASS_MAPPINGS["UpscaleModelLoader"]().load_model(upscale_model)[0]
        up_img = nodes.NODE_CLASS_MAPPINGS["ImageUpscaleWithModel"]().upscale(model, base_img)[0]
        B, H, W, C = base_img.shape
        target_w, target_h = int(W * scale_by), int(H * scale_by)
        up_img = fsd_resize(up_img, target_w, target_h, "Just resize")
        final_image = torch.zeros_like(up_img)
        weight_map = torch.zeros((1, target_h, target_w, 1), device=up_img.device, dtype=torch.float32)
        stride_x = tile_width - overlap; stride_y = tile_height - overlap
        xs = list(range(0, target_w - tile_width + 1, stride_x)); ys = list(range(0, target_h - tile_height + 1, stride_y))
        if len(xs) == 0 or xs[-1] + tile_width < target_w: xs.append(max(0, target_w - tile_width))
        if len(ys) == 0 or ys[-1] + tile_height < target_h: ys.append(max(0, target_h - tile_height))
        window = torch.ones((tile_height, tile_width), device=up_img.device, dtype=torch.float32)
        for i in range(overlap):
            val = (i + 0.5) / max(1, overlap)
            window[i, :] *= val; window[-i-1, :] *= val; window[:, i] *= val; window[:, -i-1] *= val
        window = window.unsqueeze(0).unsqueeze(-1)
        for y in ys:
            for x in xs:
                tile = up_img[:, y:y+tile_height, x:x+tile_width, :]
                tile_latent = {"samples": p["vae"].encode(tile)}
                res = nodes.common_ksampler(model=p["model"], seed=p.get("seed", 0), steps=p["steps"], cfg=p["cfg"], sampler_name=p["sampler_name"], scheduler=p["scheduler"], positive=p.get("positive", []), negative=p.get("negative",[]), latent=tile_latent, denoise=denoise)
                tile_sampled = p["vae"].decode(res[0]["samples"])
                final_image[:, y:y+tile_height, x:x+tile_width, :] += tile_sampled * window
                weight_map[:, y:y+tile_height, x:x+tile_width, :] += window
        final_image /= weight_map.clamp(min=1e-5)
        p["latent"] = {"samples": p["vae"].encode(final_image)}
        return (p, final_image)


# ==========================================
#[FSD/5. Routing & Intermediates]
# ==========================================
class FSD_PipeSwitch:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_A": ("FSD_PIPE",), "pipe_B": ("FSD_PIPE",), "use_B": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "switch"; CATEGORY = "FSD/5. Routing & Intermediates"
    def switch(self, pipe_A, pipe_B, use_B): return (pipe_B.copy() if use_B else pipe_A.copy(), )

class FSD_Bypass:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_original": ("FSD_PIPE",), "pipe_modified": ("FSD_PIPE",), "bypass": ("BOOLEAN", {"default": True})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "bypass_pipe"; CATEGORY = "FSD/5. Routing & Intermediates"
    def bypass_pipe(self, pipe_original, pipe_modified, bypass): return (pipe_original.copy() if bypass else pipe_modified.copy(), )

class FSD_RandomPipeSwitch:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_A": ("FSD_PIPE",), "pipe_B": ("FSD_PIPE",), "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "switch"; CATEGORY = "FSD/5. Routing & Intermediates"
    def switch(self, pipe_A, pipe_B, seed): return (pipe_B.copy() if seed % 2 == 1 else pipe_A.copy(), )

class FSD_PipeBatchCombine:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_A": ("FSD_PIPE",), "pipe_B": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "combine"; CATEGORY = "FSD/5. Routing & Intermediates"
    def combine(self, pipe_A, pipe_B):
        p = pipe_A.copy()
        lat_A = pipe_A.get("latent", {}).get("samples", None)
        lat_B = pipe_B.get("latent", {}).get("samples", None)
        if lat_A is not None and lat_B is not None: p["latent"] = {"samples": torch.cat((lat_A, lat_B), dim=0)}
        return (p, )

class FSD_OverrideSettings:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "override_steps": ("BOOLEAN", {"default": False}), "steps": ("INT", {"default": 20, "min": 1, "max": 150}), "override_cfg": ("BOOLEAN", {"default": False}), "cfg_scale": ("FLOAT", {"default": 7.0, "min": 1.0, "max": 30.0, "step": 0.5}), "override_sampler": ("BOOLEAN", {"default": False}), "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"default": "dpmpp_2m"}), "override_scheduler": ("BOOLEAN", {"default": False}), "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"default": "karras"})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "override"; CATEGORY = "FSD/5. Routing & Intermediates"
    def override(self, pipe, override_steps, steps, override_cfg, cfg_scale, override_sampler, sampler_name, override_scheduler, scheduler):
        p = pipe.copy()
        if override_steps: p["steps"] = steps
        if override_cfg: p["cfg"] = cfg_scale
        if override_sampler: p["sampler_name"] = sampler_name
        if override_scheduler: p["scheduler"] = scheduler
        return (p, )

class FSD_LatentScale:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "scale_factor": ("FLOAT", {"default": 1.5, "min": 0.1, "max": 4.0, "step": 0.05}), "upscale_method": (["bilinear", "nearest-exact", "bicubic", "area", "bislerp"],)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "scale"; CATEGORY = "FSD/5. Routing & Intermediates"
    def scale(self, pipe, scale_factor, upscale_method):
        p = pipe.copy()
        if "latent" in p and "samples" in p["latent"]:
            latent = p["latent"]["samples"]
            B, C, H, W = latent.shape
            upscaled = comfy.utils.common_upscale(latent, int(W * scale_factor), int(H * scale_factor), upscale_method, "disabled")
            p["latent"] = {"samples": upscaled}
            p["target_width"] = int(p.get("target_width", W * 8) * scale_factor)
            p["target_height"] = int(p.get("target_height", H * 8) * scale_factor)
        return (p, )

class FSD_SetDenoise:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "set_denoise"; CATEGORY = "FSD/5. Routing & Intermediates"
    def set_denoise(self, pipe, denoise):
        p = pipe.copy(); p["denoise"] = denoise; return (p, )

class FSD_PipePreview:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "IMAGE"); FUNCTION = "preview"; CATEGORY = "FSD/5. Routing & Intermediates"
    def preview(self, pipe):
        p = pipe.copy(); latent = p.get("latent", {}).get("samples", None)
        if latent is not None: image = p["vae"].decode(latent)
        else: image = torch.zeros((1, 64, 64, 3)) 
        return (p, image)

class FSD_ClearLatent:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "clear"; CATEGORY = "FSD/5. Routing & Intermediates"
    def clear(self, pipe):
        p = pipe.copy()
        if "latent" in p and "samples" in p["latent"]:
            B, C, H, W = p["latent"]["samples"].shape
            p["latent"] = {"samples": torch.zeros([B, C, H, W], device=p["latent"]["samples"].device)}
            p["denoise"] = 1.0 
        return (p, )

class FSD_SetLatentNoiseMask:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "mask": ("MASK",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "set_mask"; CATEGORY = "FSD/5. Routing & Intermediates"
    def set_mask(self, pipe, mask):
        p = pipe.copy()
        p["latent"] = nodes.SetLatentNoiseMask().set_mask(p.get("latent", {}), mask)[0]
        return (p, )


# ==========================================
#[FSD/6. Bridges & Variables]
# ==========================================
class FSD_PipeToKSampler:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "MODEL", "CONDITIONING", "CONDITIONING", "LATENT")
    RETURN_NAMES = ("FSD_PIPE", "MODEL", "POSITIVE", "NEGATIVE", "LATENT")
    FUNCTION = "extract"; CATEGORY = "FSD/6. Bridges & Variables"
    def extract(self, pipe): return (pipe, pipe.get("model"), pipe.get("positive"), pipe.get("negative"), pipe.get("latent"))

class FSD_UnpackSettings:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "INT", "FLOAT", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("FSD_PIPE", "steps", "cfg", "sampler_name", "scheduler", "denoise")
    FUNCTION = "unpack_settings"; CATEGORY = "FSD/6. Bridges & Variables"
    def unpack_settings(self, pipe): return (pipe, pipe.get("steps", 20), pipe.get("cfg", 7.0), pipe.get("sampler_name", "euler"), pipe.get("scheduler", "normal"), pipe.get("denoise", 1.0))

class FSD_UpdatePipeModel:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "model": ("MODEL",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, model): p = pipe.copy(); p["model"] = model; return (p, )

class FSD_UpdatePipeLatent:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "latent": ("LATENT",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, latent): p = pipe.copy(); p["latent"] = latent; return (p, )

class FSD_UpdatePipeClip:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "clip": ("CLIP",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, clip): p = pipe.copy(); p["clip"] = clip; return (p, )

class FSD_UpdatePipeVae:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "vae": ("VAE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, vae): p = pipe.copy(); p["vae"] = vae; return (p, )

class FSD_UpdatePipePositive:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "positive": ("CONDITIONING",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, positive): p = pipe.copy(); p["positive"] = positive; return (p, )

class FSD_UpdatePipeNegative:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "negative": ("CONDITIONING",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, negative): p = pipe.copy(); p["negative"] = negative; return (p, )

class FSD_UpdatePipeSegs:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "segs": ("SEGS",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "update"; CATEGORY = "FSD/6. Bridges & Variables"
    def update(self, pipe, segs): p = pipe.copy(); p["segs"] = segs; return (p, )

class FSD_ExtractPipeSegs:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "SEGS"); RETURN_NAMES = ("FSD_PIPE", "SEGS")
    FUNCTION = "extract"; CATEGORY = "FSD/6. Bridges & Variables"
    def extract(self, pipe): return (pipe, pipe.get("segs", None))

class FSD_PipeToBasicPipe_Impact:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "BASIC_PIPE"); RETURN_NAMES = ("FSD_PIPE", "BASIC_PIPE")
    FUNCTION = "convert"; CATEGORY = "FSD/6. Bridges & Variables"
    def convert(self, pipe): return (pipe, (pipe.get("model"), pipe.get("clip"), pipe.get("vae"), pipe.get("positive"), pipe.get("negative")))

class FSD_PackPipe:
    @classmethod
    def INPUT_TYPES(s): 
        return {
            "required": {"pipe": ("FSD_PIPE",)}, 
            "optional": {
                "model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), 
                "positive": ("CONDITIONING",), "negative": ("CONDITIONING",), 
                "latent": ("LATENT",), "image": ("IMAGE",), "mask": ("MASK",),
                "segs": ("SEGS",), "seed": ("INT",)
            }
        }
    RETURN_TYPES = ("FSD_PIPE",)
    FUNCTION = "pack"
    CATEGORY = "FSD/6. Bridges & Variables"

    def pack(self, pipe, model=None, clip=None, vae=None, positive=None, negative=None, latent=None, image=None, mask=None, segs=None, seed=None):
        new_pipe = pipe.copy()
        for k, v in zip(["model", "clip", "vae", "positive", "negative", "latent", "image", "mask", "segs", "seed"],[model, clip, vae, positive, negative, latent, image, mask, segs, seed]):
            if v is not None: new_pipe[k] = v
        return (new_pipe, )

class FSD_PipeEdit:
    @classmethod
    def INPUT_TYPES(s): 
        return {
            "required": {"pipe": ("FSD_PIPE",)}, 
            "optional": {
                "model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), 
                "positive": ("CONDITIONING",), "negative": ("CONDITIONING",), 
                "latent": ("LATENT",), "image": ("IMAGE",), "mask": ("MASK",)
            }
        }
    RETURN_TYPES = ("FSD_PIPE",)
    FUNCTION = "edit"
    CATEGORY = "FSD/6. Bridges & Variables"

    def edit(self, pipe, **kwargs):
        p = pipe.copy()
        for k, v in kwargs.items():
            if v is not None: p[k] = v
        return (p, )

class FSD_PipeMerge:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe_base": ("FSD_PIPE",), "pipe_override": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "merge"; CATEGORY = "FSD/6. Bridges & Variables"
    def merge(self, pipe_base, pipe_override):
        p = pipe_base.copy()
        p.update(pipe_override)
        return (p, )

class FSD_PipeInfo:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "STRING"); RETURN_NAMES = ("FSD_PIPE", "INFO")
    FUNCTION = "info"; CATEGORY = "FSD/6. Bridges & Variables"
    def info(self, pipe):
        lines =[]
        for k, v in pipe.items():
            if isinstance(v, torch.Tensor): lines.append(f"{k}: Tensor {list(v.shape)}")
            elif isinstance(v, dict) and "samples" in v: lines.append(f"{k}: Latent {list(v['samples'].shape)}")
            elif isinstance(v, (str, int, float, bool)): lines.append(f"{k}: {v}")
            else: lines.append(f"{k}: {type(v).__name__}")
        return (pipe, "\n".join(lines))

class FSD_UnpackPipe:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "MODEL", "CLIP", "VAE", "CONDITIONING", "CONDITIONING", "LATENT", "IMAGE", "MASK", "INT")
    RETURN_NAMES = ("FSD_PIPE", "MODEL", "CLIP", "VAE", "POSITIVE", "NEGATIVE", "LATENT", "IMAGE", "MASK", "SEED")
    FUNCTION = "unpack"
    CATEGORY = "FSD/6. Bridges & Variables"

    def unpack(self, pipe): 
        return (
            pipe, 
            pipe.get("model"), pipe.get("clip"), pipe.get("vae"), 
            pipe.get("positive"), pipe.get("negative"), pipe.get("latent"),
            pipe.get("image"), pipe.get("mask"), pipe.get("seed", 0)
        )

class FSD_PackBasicPipe:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}, "optional": {"model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), "positive": ("CONDITIONING",), "negative": ("CONDITIONING",)}}
    RETURN_TYPES = ("BASIC_PIPE",); RETURN_NAMES = ("basic_pipe",); FUNCTION = "pack"; CATEGORY = "FSD/6. Bridges & Variables"
    def pack(self, model=None, clip=None, vae=None, positive=None, negative=None, **kwargs): return ((model, clip, vae, positive, negative),)

class FSD_UnpackBasicPipe:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"basic_pipe": ("BASIC_PIPE",)}}
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "CONDITIONING", "CONDITIONING"); RETURN_NAMES = ("model", "clip", "vae", "positive", "negative")
    FUNCTION = "unpack"; CATEGORY = "FSD/6. Bridges & Variables"
    def unpack(self, basic_pipe, **kwargs):
        if isinstance(basic_pipe, tuple) and len(basic_pipe) >= 5: return basic_pipe[:5]
        return (None, None, None, None, None)

class FSD_EditBasicPipe:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"basic_pipe": ("BASIC_PIPE",)}, "optional": {"model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), "positive": ("CONDITIONING",), "negative": ("CONDITIONING",)}}
    RETURN_TYPES = ("BASIC_PIPE",); RETURN_NAMES = ("basic_pipe",); FUNCTION = "edit"; CATEGORY = "FSD/6. Bridges & Variables"
    def edit(self, basic_pipe, model=None, clip=None, vae=None, positive=None, negative=None, **kwargs):
        m, c, v, p, n = None, None, None, None, None
        if isinstance(basic_pipe, tuple) and len(basic_pipe) >= 5: m, c, v, p, n = basic_pipe[:5]
        return (((model or m), (clip or c), (vae or v), (positive or p), (negative or n)),)

class FSD_PipeSetCustom:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "set_custom"; CATEGORY = "FSD/6. Bridges & Variables"
    def set_custom(self, pipe, **kwargs):
        p = pipe.copy()
        for key, value in kwargs.items():
            if value is not None: p[key] = value
        return (p, )

class FSD_PipeGetCustom:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}, "optional": {"key_1": ("STRING", {"default": "my_var_1"}), "key_2": ("STRING", {"default": ""}), "key_3": ("STRING", {"default": ""}), "key_4": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("FSD_PIPE", ANY, ANY, ANY, ANY); RETURN_NAMES = ("FSD_PIPE", "VALUE_1", "VALUE_2", "VALUE_3", "VALUE_4")
    FUNCTION = "get_custom"; CATEGORY = "FSD/6. Bridges & Variables"
    def get_custom(self, pipe, key_1="", key_2="", key_3="", key_4=""):
        return (pipe, pipe.get(key_1, None) if key_1 else None, pipe.get(key_2, None) if key_2 else None, pipe.get(key_3, None) if key_3 else None, pipe.get(key_4, None) if key_4 else None)

class FSD_UniversalPackDynamic:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}}
    RETURN_TYPES = ("UNIVERSAL_PIPE",); RETURN_NAMES = ("pipe",); FUNCTION = "pack"; CATEGORY = "FSD/6. Bridges & Variables"
    def pack(self, **kwargs): return (kwargs,)

# ==========================================
#[FSD/7. Text & Strings]
# ==========================================
class FSD_PromptTextAppend:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "positive_append": ("STRING", {"multiline": True, "default": ""}), "negative_append": ("STRING", {"multiline": True, "default": ""}), "mode": (["Append (Suffix)", "Prepend (Prefix)"],)}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "append"; CATEGORY = "FSD/7. Text & Strings"
    def append(self, pipe, positive_append, negative_append, mode):
        p = pipe.copy(); pos = p.get("pos_text", ""); neg = p.get("neg_text", "")
        if mode == "Append (Suffix)":
            pos = pos + ", " + positive_append if pos else positive_append
            neg = neg + ", " + negative_append if neg else negative_append
        else:
            pos = positive_append + ", " + pos if pos else positive_append
            neg = negative_append + ", " + neg if neg else negative_append
        clip = p["clip"]
        t_pos = clip.tokenize(pos); c_pos, p_pos = clip.encode_from_tokens(t_pos, return_pooled=True)
        t_neg = clip.tokenize(neg); c_neg, p_neg = clip.encode_from_tokens(t_neg, return_pooled=True)
        p["positive"] = [[c_pos, {"pooled_output": p_pos}]]; p["negative"] = [[c_neg, {"pooled_output": p_neg}]]
        p["pos_text"] = pos; p["neg_text"] = neg
        return (p, )

class FSD_PromptTextReplace:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "find_text": ("STRING", {"default": ""}), "replace_text": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "replace"; CATEGORY = "FSD/7. Text & Strings"
    def replace(self, pipe, find_text, replace_text):
        p = pipe.copy()
        pos = p.get("pos_text", "").replace(find_text, replace_text)
        neg = p.get("neg_text", "").replace(find_text, replace_text)
        clip = p["clip"]
        t_pos = clip.tokenize(pos); c_pos, p_pos = clip.encode_from_tokens(t_pos, return_pooled=True)
        t_neg = clip.tokenize(neg); c_neg, p_neg = clip.encode_from_tokens(t_neg, return_pooled=True)
        p["positive"] = [[c_pos, {"pooled_output": p_pos}]]; p["negative"] = [[c_neg, {"pooled_output": p_neg}]]
        p["pos_text"] = pos; p["neg_text"] = neg
        return (p, )

class FSD_PromptTextOverride:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",), "positive": ("STRING", {"multiline": True, "default": ""}), "negative": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("FSD_PIPE",); FUNCTION = "override"; CATEGORY = "FSD/7. Text & Strings"
    def override(self, pipe, positive, negative):
        p = pipe.copy(); clip = p.get("clip")
        if clip is not None:
            t_pos = clip.tokenize(positive); c_pos, p_pos = clip.encode_from_tokens(t_pos, return_pooled=True)
            t_neg = clip.tokenize(negative); c_neg, p_neg = clip.encode_from_tokens(t_neg, return_pooled=True)
            p["positive"] = [[c_pos, {"pooled_output": p_pos}]]; p["negative"] = [[c_neg, {"pooled_output": p_neg}]]
        p["pos_text"] = positive; p["neg_text"] = negative
        return (p, )

class FSD_PromptTextExtract:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"pipe": ("FSD_PIPE",)}}
    RETURN_TYPES = ("FSD_PIPE", "STRING", "STRING"); RETURN_NAMES = ("FSD_PIPE", "POSITIVE_TEXT", "NEGATIVE_TEXT")
    FUNCTION = "extract"; CATEGORY = "FSD/7. Text & Strings"
    def extract(self, pipe): return (pipe, pipe.get("pos_text", ""), pipe.get("neg_text", ""))

class FSD_TextPrimitive:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"text": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "get_text"; CATEGORY = "FSD/7. Text & Strings"
    def get_text(self, text): return (text,)

class FSD_TextConcat:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"separator": ("STRING", {"default": ", "})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "concat"; CATEGORY = "FSD/7. Text & Strings"
    def concat(self, separator, **kwargs):
        texts = [str(kwargs[k]) for k in sorted(kwargs.keys()) if kwargs[k]]
        return (separator.join(texts),)

class FSD_TextRandomLine:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"text": ("STRING", {"multiline": True, "default": ""}), "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "pick"; CATEGORY = "FSD/7. Text & Strings"
    def pick(self, text, seed):
        random.seed(seed); lines =[l.strip() for l in text.split('\n') if l.strip()]
        return (random.choice(lines) if lines else "",)

class FSD_TextSplitToList:
    @classmethod
    def INPUT_TYPES(s): return {"required": {"text": ("STRING", {"forceInput": True, "multiline": True}), "delimiter": ("STRING", {"default": "\\n"})}}
    RETURN_TYPES = ("STRING",); OUTPUT_IS_LIST = (True,); FUNCTION = "split"; CATEGORY = "FSD/7. Text & Strings"
    def split(self, text, delimiter):
        if delimiter == "\\n": delimiter = '\n'
        return ([t.strip() for t in text.split(delimiter) if t.strip()],)

class FSD_ListJoinToText:
    INPUT_IS_LIST = True
    @classmethod
    def INPUT_TYPES(s): return {"required": {"string_list": ("STRING", {"forceInput": True}), "separator": ("STRING", {"default": ", "})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "join_list"; CATEGORY = "FSD/7. Text & Strings"
    def join_list(self, string_list, separator):
        sep = separator[0] if isinstance(separator, list) else separator
        return (sep.join(string_list),)

class FSD_StringJoinDynamic:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"separator": ("STRING", {"default": ", "})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, separator, **kwargs):
        items = [str(kwargs[k]) for k in sorted(kwargs.keys()) if kwargs[k] is not None]
        return (separator.join(items),)

class TextLengthToNumber:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("INT", "FLOAT"); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, text, **kwargs): return (len(text), float(len(text)))

class NumberToPaddedString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"number": ("INT", {"default": 0}), "padding": ("INT", {"default": 3})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, number, padding, **kwargs): return (str(number).zfill(padding),)

class ExtractNumberFromString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": "abc123def"})}}
    RETURN_TYPES = ("INT", "FLOAT"); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, text, **kwargs):
        import re; nums = re.findall(r'\d+', text)
        if nums: return (int(nums[0]), float(nums[0]))
        return (0, 0.0)

class MultiplyText:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": ""}), "count": ("INT", {"default": 1, "min": 0})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, text, count, **kwargs): return (text * count,)

class PercentageFormat:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0}), "decimals": ("INT", {"default": 1, "min": 0})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, value, decimals, **kwargs): return (f"{value*100:.{decimals}f}%",)

class TextToSeed:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("INT",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, text, **kwargs):
        h = 0
        for c in text: h = (h * 31 + ord(c)) & 0xFFFFFFFF
        return (h,)

class SplitResolutionString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"resolution": ("STRING", {"default": "1920x1080"})}}
    RETURN_TYPES = ("INT", "INT"); RETURN_NAMES = ("width", "height"); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, resolution, **kwargs):
        parts = resolution.lower().replace("x", " ").replace("×", " ").split()
        if len(parts) >= 2:
            try: return (int(parts[0]), int(parts[1]))
            except: pass
        return (1920, 1080)

class InjectNumberIntoString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"template": ("STRING", {"default": "Image_[VALUE].png"}), "value": ("FLOAT", {"default": 0.0})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, template, value, **kwargs): return (template.replace("[VALUE]", str(int(value))),)

class JoinNumbersToString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"separator": ("STRING", {"default": ", "})}, "optional": {"num1": ("FLOAT",), "num2": ("FLOAT",), "num3": ("FLOAT",), "num4": ("FLOAT",)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, separator, num1=None, num2=None, num3=None, num4=None, **kwargs):
        nums =[str(n) for n in[num1, num2, num3, num4] if n is not None]
        nums.extend([str(v) for k, v in kwargs.items() if v is not None])
        return (separator.join(nums),)

class TimeToString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"format_string": ("STRING", {"default": "%Y-%m-%d_%H-%M-%S"})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, format_string, **kwargs): return (time.strftime(format_string),)

class StringOccurrenceCounter:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": ""}), "search": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("INT",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, text, search, **kwargs): return (text.count(search),)

class StringReplaceABC:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"template": ("STRING", {"multiline": True, "default": "Value A: [A]\nValue B:[B]\nValue C:[C]"})}, "optional": {"A": ("STRING",), "B": ("STRING",), "C": ("STRING",)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, template, A=None, B=None, C=None, **kwargs):
        res = template
        if A is not None: res = res.replace("[A]", str(A))
        if B is not None: res = res.replace("[B]", str(B))
        if C is not None: res = res.replace("[C]", str(C))
        return (res,)

class StringReplaceAdvancedABCDEF:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"template": ("STRING", {"multiline": True, "default": "Prompt:[A][B], Style:[C]"})}, "optional": {"A": (ANY,), "B": (ANY,), "C": (ANY,), "D": (ANY,), "E": (ANY,), "F": (ANY,)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, template, A=None, B=None, C=None, D=None, E=None, F=None, **kwargs):
        res = template
        for key, val in[("A", A), ("B", B), ("C", C), ("D", D), ("E", E), ("F", F)]:
            if val is not None: res = res.replace(f"[{key}]", str(val))
        return (res,)

class FSD_StringSplitByIndex:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"list_string": ("STRING", {"default": "cat, dog, car, tree", "multiline": True}), "index": ("INT", {"default": 0, "min": 0})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/7. Text & Strings"
    def execute(self, list_string, index, **kwargs):
        items =[x.strip() for x in list_string.split(",") if x.strip()]
        if not items: return ("",)
        return (items[index % len(items)],)

class FSD_StateFormatter:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"template": ("STRING", {"multiline": True, "default": "Value A: [A]\nValue B:[B]\nValue C:[C]"})}, "optional": {"A": (ANY, ), "B": (ANY, ), "C": (ANY, )}}
    RETURN_TYPES = ("STRING",); FUNCTION = "format"; CATEGORY = "FSD/7. Text & Strings"
    def format(self, template, A=None, B=None, C=None, **kwargs):
        result = template
        replacements = {"A": A, "B": B, "C": C}; replacements.update(kwargs)
        for key, value in replacements.items():
            if value is not None: result = result.replace(f"[{key}]", str(value))
        return (result,)

# ==========================================
#[FSD/8. Math]
# ==========================================
class MathAdd:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0, "step": 0.01}), "b": ("FLOAT", {"default": 0.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, **kwargs):
        tot = a + b
        for k, v in kwargs.items():
            if v is not None:
                try: tot += float(v)
                except: pass
        return (tot, int(tot))

class MathSubtract:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0, "step": 0.01}), "b": ("FLOAT", {"default": 0.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, **kwargs): return (a - b, int(a - b))

class MathMultiply:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0, "step": 0.01}), "b": ("FLOAT", {"default": 0.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, **kwargs):
        tot = a * b
        for k, v in kwargs.items():
            if v is not None:
                try: tot *= float(v)
                except: pass
        return (tot, int(tot))

class MathDivide:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0, "step": 0.01}), "b": ("FLOAT", {"default": 1.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, **kwargs): return (a / b if b != 0 else 0.0, int(a / b if b != 0 else 0.0))

class MathModulo:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0, "step": 0.01}), "b": ("FLOAT", {"default": 2.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, **kwargs): return (a % b if b != 0 else 0.0, int(a % b if b != 0 else 0.0))

class MathPower:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"base": ("FLOAT", {"default": 2.0, "step": 0.01}), "exponent": ("FLOAT", {"default": 2.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, base, exponent, **kwargs): return (math.pow(base, exponent), int(math.pow(base, exponent)))

class MathSquareRoot:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 9.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, value, **kwargs): return (math.sqrt(abs(value)), int(math.sqrt(abs(value))))

class MathAbsolute:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": -1.0, "step": 0.01})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, value, **kwargs): return (abs(value), int(abs(value)))

class MathClamp:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.0}), "min_val": ("FLOAT", {"default": 0.0}), "max_val": ("FLOAT", {"default": 1.0})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, value, min_val, max_val, **kwargs): return (max(min_val, min(value, max_val)), int(max(min_val, min(value, max_val))))

class MathLerp:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0}), "b": ("FLOAT", {"default": 100.0}), "t": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/8. Math"
    def execute(self, a, b, t, **kwargs): return (a + (b - a) * t, int(a + (b - a) * t))

class MathExpressionEvaluate:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"expression": ("STRING", {"default": "2 + 2"})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "evaluate"; CATEGORY = "FSD/8. Math"
    def evaluate(self, expression, **kwargs):
        try:
            res = eval(expression, {"__builtins__": {}}, {"math": math})
            return (float(res), int(res))
        except: return (0.0, 0)

# ==========================================
#[FSD/9. Logic & Comparisons]
# ==========================================
class FSD_ExpressionCondition:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"expression": ("STRING", {"default": "1 > 0"})}}
    RETURN_TYPES = ("BOOLEAN", "INT", "FLOAT"); FUNCTION = "evaluate"; CATEGORY = "FSD/9. Logic & Comparisons"
    def evaluate(self, expression, **kwargs):
        try:
            res = eval(expression, {"__builtins__": {}}, {"math": math})
            return (bool(res), 1 if res else 0, float(res) if res else 0.0)
        except: return (False, 0, 0.0)

class FSD_WidgetCondition:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"condition": ("BOOLEAN", {"default": True}), "true_value": ("FLOAT", {"default": 1.0}), "false_value": ("FLOAT", {"default": 0.0})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, condition, true_value, false_value, **kwargs): return (true_value if condition else false_value, int(true_value if condition else false_value))

class FSD_RegexCondition:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": ""}), "pattern": ("STRING", {"default": r"\d+"})}}
    RETURN_TYPES = ("BOOLEAN",); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, text, pattern, **kwargs):
        import re
        try: return (bool(re.search(pattern, text)),)
        except: return (False,)

class LogicAND:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("BOOLEAN", {"default": True}), "b": ("BOOLEAN", {"default": True})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, a, b, **kwargs):
        res = a and b
        for k, v in kwargs.items():
            if v is not None: res = res and bool(v)
        return (res, 1 if res else 0)

class LogicOR:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("BOOLEAN", {"default": False}), "b": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, a, b, **kwargs):
        res = a or b
        for k, v in kwargs.items():
            if v is not None: res = res or bool(v)
        return (res, 1 if res else 0)

class LogicNOT:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("BOOLEAN", {"default": True})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, value, **kwargs): return (not value, 0 if value else 1)

class LogicXOR:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("BOOLEAN", {"default": True}), "b": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, a, b, **kwargs): return (a != b, 1 if a != b else 0)

class CheckValueInRange:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.5}), "min_val": ("FLOAT", {"default": 0.0}), "max_val": ("FLOAT", {"default": 1.0})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, value, min_val, max_val, **kwargs): res = min_val <= value <= max_val; return (res, 1 if res else 0)

class CompareStringsExact:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("STRING", {"default": ""}), "b": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, a, b, **kwargs): res = (a == b); return (res, 1 if res else 0)

class CompareNumbers:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": ("FLOAT", {"default": 0.0}), "b": ("FLOAT", {"default": 0.0}), "operator": (["==", "!=", ">", "<", ">=", "<="],)}}
    RETURN_TYPES = ("BOOLEAN", "INT", "FLOAT"); FUNCTION = "compare"; CATEGORY = "FSD/9. Logic & Comparisons"
    def compare(self, a, b, operator, **kwargs):
        res = False
        if operator == "==": res = (a == b)
        elif operator == "!=": res = (a != b)
        elif operator == ">": res = (a > b)
        elif operator == "<": res = (a < b)
        elif operator == ">=": res = (a >= b)
        elif operator == "<=": res = (a <= b)
        return (res, 1 if res else 0, 1.0 if res else 0.0)

class CompareANY:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"a": (ANY,), "b": (ANY,)}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, a, b, **kwargs): res = (a == b); return (res, 1 if res else 0)

class FSD_LogicANDDynamic:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}}
    RETURN_TYPES = ("BOOLEAN",); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, **kwargs):
        items =[bool(v) for k, v in kwargs.items() if v is not None]
        if not items: return (False,)
        return (all(items),)

class FSD_LogicORDynamic:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}}
    RETURN_TYPES = ("BOOLEAN",); FUNCTION = "execute"; CATEGORY = "FSD/9. Logic & Comparisons"
    def execute(self, **kwargs):
        items =[bool(v) for k, v in kwargs.items() if v is not None]
        if not items: return (False,)
        return (any(items),)

# ==========================================
#[FSD/10. Data & Lists]
# ==========================================
class FSD_MakeList:
    @classmethod
    def INPUT_TYPES(s): return {"required": {}}
    RETURN_TYPES = (ANY,); OUTPUT_IS_LIST = (True,); FUNCTION = "make_list"; CATEGORY = "FSD/10. Data & Lists"
    def make_list(self, **kwargs):
        sorted_keys = sorted(kwargs.keys())
        items = [kwargs[k] for k in sorted_keys if kwargs[k] is not None]
        return (items,)

class FSD_ListSelect:
    INPUT_IS_LIST = True
    @classmethod
    def INPUT_TYPES(s): return {"required": {"list_input": (ANY, ), "index": ("INT", {"default": 0})}}
    RETURN_TYPES = (ANY,); OUTPUT_IS_LIST = (False,); FUNCTION = "select"; CATEGORY = "FSD/10. Data & Lists"
    def select(self, list_input, index):
        idx = index[0] if isinstance(index, list) else index
        if not list_input: return (None,)
        return (list_input[idx % len(list_input)],)

class FSD_ListLength:
    INPUT_IS_LIST = True
    @classmethod
    def INPUT_TYPES(s): return {"required": {"list_input": (ANY, )}}
    RETURN_TYPES = ("INT",); OUTPUT_IS_LIST = (False,); FUNCTION = "get_len"; CATEGORY = "FSD/10. Data & Lists"
    def get_len(self, list_input): return (len(list_input),)

class FSD_GenericBatchCombine:
    @classmethod
    def INPUT_TYPES(s): return {"required": {}}
    RETURN_TYPES = (ANY,); FUNCTION = "combine"; CATEGORY = "FSD/10. Data & Lists"
    def combine(self, **kwargs):
        batches =[kwargs[k] for k in sorted(kwargs.keys()) if kwargs[k] is not None]
        if not batches: return ([],)
        if all(isinstance(b, torch.Tensor) for b in batches): return (torch.cat(batches, dim=0),)
        res =[]
        for b in batches:
            if isinstance(b, list): res.extend(b)
            else: res.append(b)
        return (res,)

# ==========================================
#[FSD/11. State & Stacks]
# ==========================================
class StackPush:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"})}, "optional": {"item": (ANY,)}}
    RETURN_TYPES = ("STRING", "INT"); RETURN_NAMES = ("stack_name", "length")
    FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, stack_name, item=None, **kwargs):
        if stack_name not in GLOBAL_STACKS: GLOBAL_STACKS[stack_name] =[]
        if item is not None: GLOBAL_STACKS[stack_name].append(item)
        for k in sorted(kwargs.keys()):
            if kwargs[k] is not None: GLOBAL_STACKS[stack_name].append(kwargs[k])
        return (stack_name, len(GLOBAL_STACKS[stack_name]))

class StackPop:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"})}}
    RETURN_TYPES = (ANY, "BOOLEAN"); RETURN_NAMES = ("item", "success")
    FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, stack_name, **kwargs):
        if stack_name in GLOBAL_STACKS and len(GLOBAL_STACKS[stack_name]) > 0: item = GLOBAL_STACKS[stack_name].pop()
        else: item = None
        return (item, item is not None)

class StackGetByIndex:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"}), "index": ("INT", {"default": 0})}}
    RETURN_TYPES = (ANY,); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, stack_name, index, **kwargs):
        if stack_name in GLOBAL_STACKS:
            stk = GLOBAL_STACKS[stack_name]
            if stk and -len(stk) <= index < len(stk): return (stk[index],)
        return (None,)

class StackLength:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"})}}
    RETURN_TYPES = ("INT",); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, stack_name, **kwargs): return (len(GLOBAL_STACKS.get(stack_name,[])),)

class StackClear:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"})}}
    RETURN_TYPES = (); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"; OUTPUT_NODE = True
    def execute(self, stack_name, **kwargs):
        if stack_name in GLOBAL_STACKS: GLOBAL_STACKS[stack_name] =[]
        return ()

class StackJoinToString:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"stack_name": ("STRING", {"default": "default"}), "separator": ("STRING", {"default": ", "})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, stack_name, separator, **kwargs):
        return (separator.join(str(x) for x in GLOBAL_STACKS.get(stack_name,[])),)

class MathCounter:
    states = {}
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"step": ("INT", {"default": 1}), "reset": ("BOOLEAN", {"default": False})}, "hidden": {"unique_id": "UNIQUE_ID"}}
    RETURN_TYPES = ("INT", "FLOAT"); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, step, reset, unique_id, **kwargs):
        if unique_id not in self.states or reset: self.states[unique_id] = 0
        if not reset: self.states[unique_id] += step
        return (self.states[unique_id], float(self.states[unique_id]))

class MathAccumulator:
    states = {}
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.0}), "reset": ("BOOLEAN", {"default": False})}, "hidden": {"unique_id": "UNIQUE_ID"}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, value, reset, unique_id, **kwargs):
        if unique_id not in self.states or reset: self.states[unique_id] = 0.0
        if not reset: self.states[unique_id] += value
        return (self.states[unique_id], int(self.states[unique_id]))

class LogicFlipFlop:
    states = {}
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"trigger": ("BOOLEAN", {"default": False})}, "hidden": {"unique_id": "UNIQUE_ID"}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/11. State & Stacks"
    def execute(self, trigger, unique_id, **kwargs):
        if unique_id not in self.states: self.states[unique_id] = False
        if trigger: self.states[unique_id] = not self.states[unique_id]
        return (self.states[unique_id], 1 if self.states[unique_id] else 0)

# ==========================================
#[FSD/12. Switches & Gates]
# ==========================================
class FSD_DynamicSwitchANY:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {"index": ("INT", {"default": 0, "min": 0, "max": 19})},
            "optional": {}
        }
        for i in range(20):
            inputs["optional"][f"input_{i}"] = (ANY,)
        return inputs

    RETURN_TYPES = (ANY,)
    FUNCTION = "execute"
    CATEGORY = "FSD/12. Switches & Gates"

    def execute(self, index, **kwargs):
        return (kwargs.get(f"input_{index}"),)

class FSD_DynamicDiverterANY:
    @classmethod
    def INPUT_TYPES(cls): 
        return {
            "required": {"index": ("INT", {"default": 0, "min": 0, "max": 19})},
            "optional": {"value": (ANY,)}
        }
    RETURN_TYPES = tuple([ANY] * 20)
    RETURN_NAMES = tuple([f"out_{i}" for i in range(20)])
    FUNCTION = "execute"
    CATEGORY = "FSD/12. Switches & Gates"

    def execute(self, index, value=None, **kwargs):
        outs =[None] * 20
        if 0 <= index < 20: outs[index] = value
        return tuple(outs)

class FSD_BooleanSwitchANY:
    @classmethod
    def INPUT_TYPES(cls): return {
        "required": {"condition": ("BOOLEAN", {"default": True})},
        "optional": {"on_true": (ANY,), "on_false": (ANY,)}
    }
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "FSD/12. Switches & Gates"

    def execute(self, condition, on_true=None, on_false=None, **kwargs):
        return (on_true if condition else on_false,)

class FSD_BooleanDiverterANY:
    @classmethod
    def INPUT_TYPES(cls): return {
        "required": {"condition": ("BOOLEAN", {"default": True})},
        "optional": {"value": (ANY,)}
    }
    RETURN_TYPES = (ANY, ANY)
    RETURN_NAMES = ("out_true", "out_false")
    FUNCTION = "execute"
    CATEGORY = "FSD/12. Switches & Gates"

    def execute(self, condition, value=None, **kwargs):
        return (value, None) if condition else (None, value)

class FSD_GateANY:
    @classmethod
    def INPUT_TYPES(cls): return {
        "required": {"open_gate": ("BOOLEAN", {"default": True})},
        "optional": {"value": (ANY,)}
    }
    RETURN_TYPES = (ANY,)
    FUNCTION = "execute"
    CATEGORY = "FSD/12. Switches & Gates"

    def execute(self, open_gate, value=None, **kwargs):
        return (value,) if open_gate else (None,)


# ==========================================
#[FSD/13. Presets & Files]
# ==========================================
class FileSaveState:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"key": ("STRING", {"default": "my_key"}), "value": (ANY,)}}
    RETURN_TYPES = (); FUNCTION = "save"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def save(self, key, value, **kwargs):
        states = _read_states()
        try: json.dumps(value); states[key] = value
        except: states[key] = str(value)
        _write_states(states)
        return ()

class FileLoadState:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"key": ("STRING", {"default": "my_key"}), "fallback": (ANY,)}}
    RETURN_TYPES = (ANY,); FUNCTION = "load"; CATEGORY = "FSD/13. Presets & Files"
    def load(self, key, fallback, **kwargs): return (_read_states().get(key, fallback),)

class FileAppendToList:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"key": ("STRING", {"default": "my_list"}), "value": (ANY,)}}
    RETURN_TYPES = ("INT",); RETURN_NAMES = ("new_length",); FUNCTION = "append"; CATEGORY = "FSD/13. Presets & Files"
    def append(self, key, value, **kwargs):
        states = _read_states()
        if key not in states or not isinstance(states[key], list): states[key] =[]
        states[key].append(value); _write_states(states)
        return (len(states[key]),)

class FileClearStateKey:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"key": ("STRING", {"default": "my_key"})}}
    RETURN_TYPES = (); FUNCTION = "clear"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def clear(self, key, **kwargs):
        states = _read_states()
        if key in states: del states[key]
        _write_states(states)
        return ()

class FileListSavedKeys:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}}
    RETURN_TYPES = ("STRING",); FUNCTION = "list_keys"; CATEGORY = "FSD/13. Presets & Files"
    def list_keys(self, **kwargs): return (", ".join(sorted(_read_states().keys())),)

class FSD_FileLoadStateDropdown:
    @classmethod
    def INPUT_TYPES(cls):
        keys = ["(none)"] + sorted(_read_states().keys())
        return {"required": {"selected_key": (keys,)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/13. Presets & Files"
    def execute(self, selected_key, **kwargs): return ("",) if selected_key == "(none)" else (selected_key,)

class FSD_FileDeleteStateDropdown:
    @classmethod
    def INPUT_TYPES(cls):
        keys =["(none)"] + sorted(_read_states().keys())
        return {"required": {"selected_key": (keys,)}}
    RETURN_TYPES = (); FUNCTION = "execute"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def execute(self, selected_key, **kwargs):
        if selected_key != "(none)":
            states = _read_states()
            if selected_key in states: del states[selected_key]; _write_states(states)
        return ()

class PresetPack:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"group_name": ("STRING", {"default": "default"})}, "optional": {"value": (ANY,)}}
    RETURN_TYPES = ("PRESET_CONTAINER",); FUNCTION = "pack"; CATEGORY = "FSD/13. Presets & Files"
    def pack(self, group_name, value=None, **kwargs):
        container = {"group": group_name, "items": {}}
        if value is not None: container["items"]["value"] = value
        for k, v in kwargs.items():
            if v is not None: container["items"][k] = v
        return (container,)

class PresetUnpack:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"preset_container": ("PRESET_CONTAINER",)}}
    RETURN_TYPES = (ANY,); RETURN_NAMES = ("values...",); FUNCTION = "unpack"; CATEGORY = "FSD/13. Presets & Files"
    def unpack(self, preset_container, **kwargs):
        if isinstance(preset_container, dict) and "items" in preset_container:
            items = preset_container["items"]
            return tuple(items.get(k) for k in sorted(items.keys()))
        return ()

class PresetSaveToFile:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"preset_container": ("PRESET_CONTAINER",)}}
    RETURN_TYPES = (); FUNCTION = "save"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def save(self, preset_container, **kwargs):
        if not isinstance(preset_container, dict): return ()
        presets, group, found = _read_presets(), preset_container.get("group", "default"), False
        for tab in presets.get("tabs",[]):
            if tab.get("name") == group:
                tab["presets"].append(preset_container.get("items", {})); found = True; break
        if not found: presets.setdefault("tabs",[]).append({"name": group, "presets":[preset_container.get("items", {})]})
        _write_presets(presets)
        return ()

class PresetLoadFromFile:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"group_name": ("STRING", {"default": "default"}), "preset_index": ("INT", {"default": 0, "min": 0})}}
    RETURN_TYPES = ("PRESET_CONTAINER",); FUNCTION = "load"; CATEGORY = "FSD/13. Presets & Files"
    def load(self, group_name, preset_index, **kwargs):
        for tab in _read_presets().get("tabs",[]):
            if tab.get("name") == group_name:
                plist = tab.get("presets",[])
                if 0 <= preset_index < len(plist): return ({"group": group_name, "items": plist[preset_index]},)
        return ({"group": group_name, "items": {}},)

class PresetDelete:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"group_name": ("STRING", {"default": "default"}), "preset_index": ("INT", {"default": 0, "min": 0})}}
    RETURN_TYPES = (); FUNCTION = "delete"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def delete(self, group_name, preset_index, **kwargs):
        presets = _read_presets()
        for tab in presets.get("tabs",[]):
            if tab.get("name") == group_name:
                plist = tab.get("presets",[])
                if 0 <= preset_index < len(plist): plist.pop(preset_index)
        _write_presets(presets)
        return ()

class PresetListGroups:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {}}
    RETURN_TYPES = ("STRING",); FUNCTION = "list_groups"; CATEGORY = "FSD/13. Presets & Files"
    def list_groups(self, **kwargs):
        groups =[t.get("name", "") for t in _read_presets().get("tabs", []) if t.get("name")]
        return (", ".join(sorted(groups)),)

class PresetListItemsInGroup:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"group_name": ("STRING", {"default": "default"})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "list_items"; CATEGORY = "FSD/13. Presets & Files"
    def list_items(self, group_name, **kwargs):
        for tab in _read_presets().get("tabs",[]):
            if tab.get("name") == group_name: return (f"{len(tab.get('presets',[]))} presets in group",)
        return ("Group not found",)

class PresetMerge:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"preset_a": ("PRESET_CONTAINER",), "preset_b": ("PRESET_CONTAINER",)}}
    RETURN_TYPES = ("PRESET_CONTAINER",); FUNCTION = "merge"; CATEGORY = "FSD/13. Presets & Files"
    def merge(self, preset_a, preset_b, **kwargs):
        items = {}
        for p in[preset_a, preset_b]:
            if isinstance(p, dict) and "items" in p: items.update(p.get("items", {}))
        return ({"group": "merged", "items": items},)

class PresetUpdateField:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"preset_container": ("PRESET_CONTAINER",), "field_name": ("STRING", {"default": "field"}), "field_value": (ANY,)}}
    RETURN_TYPES = ("PRESET_CONTAINER",); FUNCTION = "update"; CATEGORY = "FSD/13. Presets & Files"
    def update(self, preset_container, field_name, field_value, **kwargs):
        if not isinstance(preset_container, dict): preset_container = {"group": "default", "items": {}}
        items = preset_container.get("items", {})
        items[field_name] = field_value
        return ({"group": preset_container.get("group", "default"), "items": items},)

class PresetExtractSingleField:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"preset_container": ("PRESET_CONTAINER",), "field_name": ("STRING", {"default": "field"})}}
    RETURN_TYPES = (ANY,); FUNCTION = "extract"; CATEGORY = "FSD/13. Presets & Files"
    def extract(self, preset_container, field_name, **kwargs):
        if isinstance(preset_container, dict) and "items" in preset_container: return (preset_container["items"].get(field_name),)
        return (None,)

class FSD_PresetLoadDropdown:
    @classmethod
    def INPUT_TYPES(cls):
        options = ["(none)"]
        for tab in _read_presets().get("tabs",[]):
            grp = tab.get("name", "")
            for i, p in enumerate(tab.get("presets",[])): options.append(f"{grp} #{i}")
        return {"required": {"selected_preset": (options,)}}
    RETURN_TYPES = ("STRING", "INT"); RETURN_NAMES = ("group_name", "preset_index")
    FUNCTION = "execute"; CATEGORY = "FSD/13. Presets & Files"
    def execute(self, selected_preset, **kwargs):
        if selected_preset == "(none)": return ("", 0)
        parts = selected_preset.rsplit(" #", 1)
        if len(parts) == 2:
            try: return (parts[0], int(parts[1]))
            except: pass
        return ("", 0)

class FSD_PresetDeleteDropdown:
    @classmethod
    def INPUT_TYPES(cls):
        options =["(none)"]
        for tab in _read_presets().get("tabs",[]):
            grp = tab.get("name", "")
            for i, p in enumerate(tab.get("presets",[])): options.append(f"{grp} #{i}")
        return {"required": {"selected_preset": (options,)}}
    RETURN_TYPES = (); FUNCTION = "execute"; CATEGORY = "FSD/13. Presets & Files"; OUTPUT_NODE = True
    def execute(self, selected_preset, **kwargs):
        if selected_preset != "(none)":
            parts = selected_preset.rsplit(" #", 1)
            if len(parts) == 2:
                try:
                    group_name, preset_index = parts[0], int(parts[1])
                    presets_data = _read_presets()
                    for tab in presets_data.get("tabs",[]):
                        if tab.get("name") == group_name:
                            plist = tab.get("presets",[])
                            if 0 <= preset_index < len(plist): plist.pop(preset_index)
                    _write_presets(presets_data)
                except: pass
        return ()

# ==========================================
#[FSD/14. Signals & Mutators]
# ==========================================
class SignalSend:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"signal_name": ("STRING", {"default": "signal"}), "value": (ANY,)}}
    RETURN_TYPES = (); FUNCTION = "send"; CATEGORY = "FSD/14. Signals & Mutators"; OUTPUT_NODE = True
    def send(self, signal_name, value, **kwargs): GLOBAL_SIGNALS[signal_name] = value; return ()

class SignalReceive:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"signal_name": ("STRING", {"default": "signal"}), "fallback": (ANY,)}}
    RETURN_TYPES = (ANY,); FUNCTION = "receive"; CATEGORY = "FSD/14. Signals & Mutators"
    def receive(self, signal_name, fallback, **kwargs): return (GLOBAL_SIGNALS.get(signal_name, fallback),)

class ManualTriggerSeed:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"trigger": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("INT",); FUNCTION = "execute"; CATEGORY = "FSD/14. Signals & Mutators"
    def execute(self, trigger, **kwargs): return (random.randint(0, 2**32 - 1) if trigger else 0,)

class FSD_DetectNodesState:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"node_ids": ("STRING", {"default": "1, 2, 3"})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/14. Signals & Mutators"
    def execute(self, node_ids, **kwargs):
        ids = _parse_multi_ids(node_ids); return (len(ids) > 0, len(ids))

class FSD_DetectGroupState:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"group_name": ("STRING", {"default": "group"})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/14. Signals & Mutators"
    def execute(self, group_name, **kwargs):
        nodes = _get_nodes_in_group(group_name); return (len(nodes) > 0, len(nodes))

class FSD_StateMutatorSettings:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"action": (["Set", "Toggle", "Increment"],), "target_type": (["Node IDs", "Group Name"],), "target": ("STRING", {"default": ""}), "widget_name": ("STRING", {"default": "widget"}), "new_value": (ANY,)}}
    RETURN_TYPES = ("STATE_MUTATOR",); FUNCTION = "configure"; CATEGORY = "FSD/14. Signals & Mutators"
    def configure(self, action, target_type, target, widget_name, new_value, **kwargs): return ({"action": action, "target_type": target_type, "target": target, "widget_name": widget_name, "new_value": new_value},)

class FSD_ApplyStateMutator:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"state_mutator": ("STATE_MUTATOR",)}}
    RETURN_TYPES = (); FUNCTION = "apply"; CATEGORY = "FSD/14. Signals & Mutators"; OUTPUT_NODE = True
    def apply(self, state_mutator, **kwargs): return ()

class FSD_LogicAutoMutator:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"condition": ("BOOLEAN", {"default": True}), "true_action": (["Set", "Toggle"],), "false_action": (["Set", "Toggle"],), "target_type": (["Node IDs", "Group Name"],), "target": ("STRING", {"default": ""}), "widget_name": ("STRING", {"default": "widget"}), "true_value": (ANY,), "false_value": (ANY,)}}
    RETURN_TYPES = (); FUNCTION = "execute"; CATEGORY = "FSD/14. Signals & Mutators"; OUTPUT_NODE = True
    def execute(self, condition, true_action, false_action, target_type, target, widget_name, true_value, false_value, **kwargs): return ()

class FSD_AdvancedNodeBypasser:
    @classmethod
    def INPUT_TYPES(cls): 
        return {
            "required": {
                "state": ("BOOLEAN", {"default": False}),
                "action": (["Bypass", "Mute"], {"default": "Bypass"}),
                "target_type": (["Group Name", "Node Title", "Node Type", "Node IDs"], {"default": "Group Name"}),
                "match_type": (["Exact", "Contains", "Regex"], {"default": "Contains"}),
                "target": ("STRING", {"default": ""})
            }
        }
    
    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "FSD/14. Signals & Mutators"
    OUTPUT_NODE = True 

    def execute(self, state, action, target_type, match_type, target, **kwargs):
        return ()

# ==========================================
#[FSD/15. UI & Dropdowns]
# ==========================================
class FSD_DropdownCheckpoints:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_checkpoint": (["(none)"] +[os.path.splitext(c)[0] for c in folder_paths.get_filename_list("checkpoints")],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_checkpoint, **kwargs): return (selected_checkpoint if selected_checkpoint != "(none)" else "",)

class FSD_DropdownLoras:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_lora": (["(none)"] +[os.path.splitext(l)[0] for l in folder_paths.get_filename_list("loras")],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_lora, **kwargs): return (selected_lora if selected_lora != "(none)" else "",)

class FSD_DropdownVAEs:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_vae": (["(none)"] + [os.path.splitext(v)[0] for v in folder_paths.get_filename_list("vae")],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_vae, **kwargs): return (selected_vae if selected_vae != "(none)" else "",)

class FSD_DropdownControlNets:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_controlnet": (["(none)"] + [os.path.splitext(c)[0] for c in folder_paths.get_filename_list("controlnet")],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_controlnet, **kwargs): return (selected_controlnet if selected_controlnet != "(none)" else "",)

class FSD_DropdownSamplers:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_sampler": (["(none)", "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ddim", "uni_pc", "uni_pc_bh2"],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_sampler, **kwargs): return (selected_sampler if selected_sampler != "(none)" else "",)

class FSD_DropdownSchedulers:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_scheduler": (["(none)", "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta", "linear_quadratic"],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_scheduler, **kwargs): return (selected_scheduler if selected_scheduler != "(none)" else "",)

class FSD_DropdownMutatorAction:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": (["Set", "Toggle", "Increment", "Decrement"],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, value, **kwargs): return (value,)

class FSD_DropdownMutatorTarget:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": (["Node IDs (comma separated)", "Group Name"],)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, value, **kwargs): return (value,)

class FSD_DropdownCustomList:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"selected_item": (_read_custom_list(),)}}
    RETURN_TYPES = ("STRING",); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, selected_item, **kwargs): return (selected_item,)

class FSD_CustomListManager:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"action": (["Add", "Remove", "Clear All"],), "item": ("STRING", {"default": "New Option"})}}
    RETURN_TYPES = ("STRING",); RETURN_NAMES = ("status",); FUNCTION = "manage"; CATEGORY = "FSD/15. UI & Dropdowns"; OUTPUT_NODE = True
    def manage(self, action, item, **kwargs):
        items = _read_custom_list(); item = item.strip()
        if action == "Add" and item and item not in items: items.append(item)
        elif action == "Remove" and item in items: items.remove(item)
        elif action == "Clear All": items =[]
        _write_custom_list(items)
        return (f"Action '{action}' executed for '{item}'",)

class BooleanToggle:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("BOOLEAN", {"default": True})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, value, **kwargs): return (value, 1 if value else 0)

class RandomBoolean:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"probability": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0})}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, probability, **kwargs): res = random.random() < probability; return (res, 1 if res else 0)

class MultiBooleanLogic:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"operation": (["AND", "OR"],)}, "optional": {"a": ("BOOLEAN",), "b": ("BOOLEAN",), "c": ("BOOLEAN",), "d": ("BOOLEAN",)}}
    RETURN_TYPES = ("BOOLEAN", "INT"); FUNCTION = "execute"; CATEGORY = "FSD/15. UI & Dropdowns"
    def execute(self, operation, a=None, b=None, c=None, d=None, **kwargs):
        vals =[v for v in[a, b, c, d] if v is not None]
        vals.extend([v for k, v in kwargs.items() if v is not None])
        if not vals: return (False, 0)
        res = all(vals) if operation == "AND" else any(vals)
        return (res, 1 if res else 0)

# ==========================================
# [FSD/16. Converters]
# ==========================================
class FloatToIntAdvanced:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.0}), "rounding_mode": (["round", "floor", "ceiling", "truncate"],)}}
    RETURN_TYPES = ("INT",); FUNCTION = "convert"; CATEGORY = "FSD/16. Converters"
    def convert(self, value, rounding_mode, **kwargs):
        if rounding_mode == "round": return (round(value),)
        elif rounding_mode == "floor": return (math.floor(value),)
        elif rounding_mode == "ceiling": return (math.ceil(value),)
        else: return (int(value),)

class IntToFloat:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("INT", {"default": 0})}}
    RETURN_TYPES = ("FLOAT",); FUNCTION = "convert"; CATEGORY = "FSD/16. Converters"
    def convert(self, value, **kwargs): return (float(value),)

class NumberToStringAdvanced:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"value": ("FLOAT", {"default": 0.0}), "decimals": ("INT", {"default": 2}), "prefix": ("STRING", {"default": ""}), "suffix": ("STRING", {"default": ""})}}
    RETURN_TYPES = ("STRING",); FUNCTION = "convert"; CATEGORY = "FSD/16. Converters"
    def convert(self, value, decimals, prefix, suffix, **kwargs): return (f"{prefix}{value:.{decimals}f}{suffix}",)

class StringToNumberAdvanced:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text": ("STRING", {"default": "0"}), "fallback_value": ("FLOAT", {"default": 0.0})}}
    RETURN_TYPES = ("FLOAT", "INT"); FUNCTION = "convert"; CATEGORY = "FSD/16. Converters"
    def convert(self, text, fallback_value, **kwargs):
        try: return (float(text), int(float(text)))
        except: return (fallback_value, int(fallback_value))

class BooleanToWidget:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"boolean_state": ("BOOLEAN", {"default": True}), "true_string": ("STRING", {"default": "Yes"}), "false_string": ("STRING", {"default": "No"}), "true_number": ("FLOAT", {"default": 1.0}), "false_number": ("FLOAT", {"default": 0.0})}}
    RETURN_TYPES = ("STRING", "FLOAT", "INT"); FUNCTION = "convert"; CATEGORY = "FSD/16. Converters"
    def convert(self, boolean_state, true_string, false_string, true_number, false_number, **kwargs): return (true_string if boolean_state else false_string, true_number if boolean_state else false_number, int(true_number if boolean_state else false_number))

# ==========================================
# [FSD/17. Indexes & Routing]
# ==========================================
class FSD_CustomDropdownRouter:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"route": ([f"Port {i}" for i in range(20)],)}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, route, **kwargs): return (int(route.split(" ")[1]),)

class FSD_IndexSelector:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"index": ("INT", {"default": 0, "min": 0, "max": 9999})}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, index, **kwargs): return (index,)

class FSD_IndexMath:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"index": ("INT", {"default": 0}), "offset": ("INT", {"default": 1}), "max_val": ("INT", {"default": 10, "min": 1})}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, index, offset, max_val, **kwargs): return ((index + offset) % max_val,)

class FSD_StringToIndex:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text_list": ("STRING", {"default": "apple, banana, orange", "multiline": True}), "match_text": ("STRING", {"default": "banana"})}}
    RETURN_TYPES = ("INT", "BOOLEAN")
    RETURN_NAMES = ("index", "found")
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, text_list, match_text, **kwargs):
        items = [x.strip() for x in text_list.split(",")]
        if match_text in items: return (items.index(match_text), True)
        return (0, False)

class FSD_IndexToBoolean:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"index": ("INT", {"default": 0}), "target_index": ("INT", {"default": 1})}}
    RETURN_TYPES = ("BOOLEAN",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, index, target_index, **kwargs): return (index == target_index,)

class FSD_BooleanToIndex:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"bool_val": ("BOOLEAN", {"default": True}), "true_index": ("INT", {"default": 1}), "false_index": ("INT", {"default": 0})}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, bool_val, true_index, false_index, **kwargs): return (true_index if bool_val else false_index,)

class FSD_RandomIndex:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"max_val": ("INT", {"default": 5, "min": 1}), "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, max_val, seed, **kwargs):
        random.seed(seed)
        return (random.randint(0, max_val - 1),)

class FSD_IndexStepper:
    states = {}
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"step": ("INT", {"default": 1}), "max_val": ("INT", {"default": 5, "min": 1}), "reset": ("BOOLEAN", {"default": False})}, "hidden": {"unique_id": "UNIQUE_ID"}}
    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, step, max_val, reset, unique_id, **kwargs):
        if unique_id not in self.states or reset: self.states[unique_id] = 0
        else: self.states[unique_id] = (self.states[unique_id] + step) % max_val
        return (self.states[unique_id],)

class FSD_ListLengthToIndex:
    INPUT_IS_LIST = True
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"list_input": (ANY,)}}
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("max_index", "length")
    OUTPUT_IS_LIST = (False, False)
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, list_input, **kwargs): 
        length = len(list_input) if list_input else 0
        return (max(0, length - 1), length)

class FSD_SelectFromTextLines:
    @classmethod
    def INPUT_TYPES(cls): return {"required": {"text_lines": ("STRING", {"default": "Line 0\nLine 1\nLine 2", "multiline": True}), "index": ("INT", {"default": 0})}}
    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("selected_text", "used_index")
    FUNCTION = "execute"
    CATEGORY = "FSD/17. Indexes & Routing"
    def execute(self, text_lines, index, **kwargs):
        lines =[line.strip() for line in text_lines.split("\n") if line.strip()]
        if not lines: return ("", 0)
        safe_index = index % len(lines)
        return (lines[safe_index], safe_index)


# ==========================================
# NODE REGISTRATION MAPPINGS
# ==========================================
NODE_CLASS_MAPPINGS = {
    # 1. Pipeline Core
    "FSD_TopPanel": FSD_TopPanel,
    "FSD_SamplerSettings": FSD_SamplerSettings,
    "FSD_Dimensions": FSD_Dimensions,
    "FSD_Generate": FSD_Generate,
    "FSD_SaveImage": FSD_SaveImage,

    # 2. Conditioning
    "FSD_Prompts": FSD_Prompts,
    "FSD_ControlNet": FSD_ControlNet,
    "FSD_ConditioningCombine": FSD_ConditioningCombine,

    # 3. Modifiers
    "FSD_LoRA": FSD_LoRA,
    "FSD_LoraStack": FSD_LoraStack,
    "FSD_PatchFreeU": FSD_PatchFreeU,
    "FSD_PatchToMe": FSD_PatchToMe,
    "FSD_PatchRescaleCFG": FSD_PatchRescaleCFG,
    "FSD_PatchModelMerge": FSD_PatchModelMerge,

    # 4. Image Processing
    "FSD_Img2Img": FSD_Img2Img,
    "FSD_Inpaint": FSD_Inpaint,
    "FSD_HiresFix_Latent": FSD_HiresFix_Latent,
    "FSD_HiresFix_Pixel": FSD_HiresFix_Pixel,
    "FSD_TiledUpscale": FSD_TiledUpscale,

    # 5. Routing & Intermediates
    "FSD_PipeSwitch": FSD_PipeSwitch,
    "FSD_Bypass": FSD_Bypass,
    "FSD_RandomPipeSwitch": FSD_RandomPipeSwitch,
    "FSD_PipeBatchCombine": FSD_PipeBatchCombine,
    "FSD_OverrideSettings": FSD_OverrideSettings,
    "FSD_LatentScale": FSD_LatentScale,
    "FSD_SetDenoise": FSD_SetDenoise,
    "FSD_PipePreview": FSD_PipePreview,
    "FSD_ClearLatent": FSD_ClearLatent,
    "FSD_SetLatentNoiseMask": FSD_SetLatentNoiseMask,

    # 6. Bridges & Variables
    "FSD_PipeToKSampler": FSD_PipeToKSampler,
    "FSD_UnpackSettings": FSD_UnpackSettings,
    "FSD_UpdatePipeModel": FSD_UpdatePipeModel,
    "FSD_UpdatePipeLatent": FSD_UpdatePipeLatent,
    "FSD_UpdatePipeClip": FSD_UpdatePipeClip,
    "FSD_UpdatePipeVae": FSD_UpdatePipeVae,
    "FSD_UpdatePipePositive": FSD_UpdatePipePositive,
    "FSD_UpdatePipeNegative": FSD_UpdatePipeNegative,
    "FSD_UpdatePipeSegs": FSD_UpdatePipeSegs,
    "FSD_ExtractPipeSegs": FSD_ExtractPipeSegs,
    "FSD_PipeToBasicPipe_Impact": FSD_PipeToBasicPipe_Impact,
    "FSD_PackPipe": FSD_PackPipe,
    "FSD_PipeEdit": FSD_PipeEdit,
    "FSD_PipeMerge": FSD_PipeMerge,
    "FSD_PipeInfo": FSD_PipeInfo,
    "FSD_UnpackPipe": FSD_UnpackPipe,
    "FSD_PipeSetCustom": FSD_PipeSetCustom,
    "FSD_PipeGetCustom": FSD_PipeGetCustom,
    "FSD_PackBasicPipe": FSD_PackBasicPipe,
    "FSD_UnpackBasicPipe": FSD_UnpackBasicPipe,
    "FSD_EditBasicPipe": FSD_EditBasicPipe,
    "FSD_UniversalPackDynamic": FSD_UniversalPackDynamic,

    # 7. Text & Strings
    "FSD_PromptTextAppend": FSD_PromptTextAppend,
    "FSD_PromptTextReplace": FSD_PromptTextReplace,
    "FSD_PromptTextOverride": FSD_PromptTextOverride,
    "FSD_PromptTextExtract": FSD_PromptTextExtract,
    "FSD_TextPrimitive": FSD_TextPrimitive,
    "FSD_TextConcat": FSD_TextConcat,
    "FSD_TextRandomLine": FSD_TextRandomLine,
    "FSD_TextSplitToList": FSD_TextSplitToList,
    "FSD_ListJoinToText": FSD_ListJoinToText,
    "FSD_StringJoinDynamic": FSD_StringJoinDynamic,
    "TextLengthToNumber": TextLengthToNumber,
    "NumberToPaddedString": NumberToPaddedString,
    "ExtractNumberFromString": ExtractNumberFromString,
    "MultiplyText": MultiplyText,
    "PercentageFormat": PercentageFormat,
    "TextToSeed": TextToSeed,
    "SplitResolutionString": SplitResolutionString,
    "InjectNumberIntoString": InjectNumberIntoString,
    "JoinNumbersToString": JoinNumbersToString,
    "TimeToString": TimeToString,
    "StringOccurrenceCounter": StringOccurrenceCounter,
    "StringReplaceABC": StringReplaceABC,
    "StringReplaceAdvancedABCDEF": StringReplaceAdvancedABCDEF,
    "FSD_StringSplitByIndex": FSD_StringSplitByIndex,
    "FSD_StateFormatter": FSD_StateFormatter,

    # 8. Math
    "MathAdd": MathAdd,
    "MathSubtract": MathSubtract,
    "MathMultiply": MathMultiply,
    "MathDivide": MathDivide,
    "MathModulo": MathModulo,
    "MathPower": MathPower,
    "MathSquareRoot": MathSquareRoot,
    "MathAbsolute": MathAbsolute,
    "MathClamp": MathClamp,
    "MathLerp": MathLerp,
    "MathExpressionEvaluate": MathExpressionEvaluate,

    # 9. Logic & Comparisons
    "FSD_ExpressionCondition": FSD_ExpressionCondition,
    "FSD_WidgetCondition": FSD_WidgetCondition,
    "FSD_RegexCondition": FSD_RegexCondition,
    "LogicAND": LogicAND,
    "LogicOR": LogicOR,
    "LogicNOT": LogicNOT,
    "LogicXOR": LogicXOR,
    "CheckValueInRange": CheckValueInRange,
    "CompareStringsExact": CompareStringsExact,
    "CompareNumbers": CompareNumbers,
    "CompareANY": CompareANY,
    "FSD_LogicANDDynamic": FSD_LogicANDDynamic,
    "FSD_LogicORDynamic": FSD_LogicORDynamic,

    # 10. Data & Lists
    "FSD_MakeList": FSD_MakeList,
    "FSD_ListSelect": FSD_ListSelect,
    "FSD_ListLength": FSD_ListLength,
    "FSD_GenericBatchCombine": FSD_GenericBatchCombine,

    # 11. State & Stacks
    "StackPush": StackPush,
    "StackPop": StackPop,
    "StackGetByIndex": StackGetByIndex,
    "StackLength": StackLength,
    "StackClear": StackClear,
    "StackJoinToString": StackJoinToString,
    "MathCounter": MathCounter,
    "MathAccumulator": MathAccumulator,
    "LogicFlipFlop": LogicFlipFlop,

    # 12. Switches & Gates
    "FSD_DynamicSwitchANY": FSD_DynamicSwitchANY,
    "FSD_DynamicDiverterANY": FSD_DynamicDiverterANY,
    "FSD_BooleanSwitchANY": FSD_BooleanSwitchANY,
    "FSD_BooleanDiverterANY": FSD_BooleanDiverterANY,
    "FSD_GateANY": FSD_GateANY,

    # 13. Presets & Files
    "FileSaveState": FileSaveState,
    "FileLoadState": FileLoadState,
    "FileAppendToList": FileAppendToList,
    "FileClearStateKey": FileClearStateKey,
    "FileListSavedKeys": FileListSavedKeys,
    "FSD_FileLoadStateDropdown": FSD_FileLoadStateDropdown,
    "FSD_FileDeleteStateDropdown": FSD_FileDeleteStateDropdown,
    "PresetPack": PresetPack,
    "PresetUnpack": PresetUnpack,
    "PresetSaveToFile": PresetSaveToFile,
    "PresetLoadFromFile": PresetLoadFromFile,
    "PresetDelete": PresetDelete,
    "PresetListGroups": PresetListGroups,
    "PresetListItemsInGroup": PresetListItemsInGroup,
    "PresetMerge": PresetMerge,
    "PresetUpdateField": PresetUpdateField,
    "PresetExtractSingleField": PresetExtractSingleField,
    "FSD_PresetLoadDropdown": FSD_PresetLoadDropdown,
    "FSD_PresetDeleteDropdown": FSD_PresetDeleteDropdown,

    # 14. Signals & Mutators
    "SignalSend": SignalSend,
    "SignalReceive": SignalReceive,
    "ManualTriggerSeed": ManualTriggerSeed,
    "FSD_DetectNodesState": FSD_DetectNodesState,
    "FSD_DetectGroupState": FSD_DetectGroupState,
    "FSD_StateMutatorSettings": FSD_StateMutatorSettings,
    "FSD_ApplyStateMutator": FSD_ApplyStateMutator,
    "FSD_LogicAutoMutator": FSD_LogicAutoMutator,
    "FSD_AdvancedNodeBypasser": FSD_AdvancedNodeBypasser,

    # 15. UI & Dropdowns
    "FSD_DropdownCheckpoints": FSD_DropdownCheckpoints,
    "FSD_DropdownLoras": FSD_DropdownLoras,
    "FSD_DropdownVAEs": FSD_DropdownVAEs,
    "FSD_DropdownControlNets": FSD_DropdownControlNets,
    "FSD_DropdownSamplers": FSD_DropdownSamplers,
    "FSD_DropdownSchedulers": FSD_DropdownSchedulers,
    "FSD_DropdownMutatorAction": FSD_DropdownMutatorAction,
    "FSD_DropdownMutatorTarget": FSD_DropdownMutatorTarget,
    "FSD_DropdownCustomList": FSD_DropdownCustomList,
    "FSD_CustomListManager": FSD_CustomListManager,
    "BooleanToggle": BooleanToggle,
    "RandomBoolean": RandomBoolean,
    "MultiBooleanLogic": MultiBooleanLogic,

    # 16. Converters
    "FloatToIntAdvanced": FloatToIntAdvanced,
    "IntToFloat": IntToFloat,
    "NumberToStringAdvanced": NumberToStringAdvanced,
    "StringToNumberAdvanced": StringToNumberAdvanced,
    "BooleanToWidget": BooleanToWidget,

    # 17. Indexes & Routing
    "FSD_CustomDropdownRouter": FSD_CustomDropdownRouter,
    "FSD_IndexSelector": FSD_IndexSelector,
    "FSD_IndexMath": FSD_IndexMath,
    "FSD_StringToIndex": FSD_StringToIndex,
    "FSD_IndexToBoolean": FSD_IndexToBoolean,
    "FSD_BooleanToIndex": FSD_BooleanToIndex,
    "FSD_RandomIndex": FSD_RandomIndex,
    "FSD_IndexStepper": FSD_IndexStepper,
    "FSD_ListLengthToIndex": FSD_ListLengthToIndex,
    "FSD_SelectFromTextLines": FSD_SelectFromTextLines
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # 1. Pipeline Core
    "FSD_TopPanel": "⚙️ 1. Checkpoint & VAE (FSD)",
    "FSD_SamplerSettings": "⚙️ 1. Sampler Settings (FSD)",
    "FSD_Dimensions": "⚙️ 1. Dimensions / Text2Img (FSD)",
    "FSD_Generate": "⚙️ 1. Generate Engine (FSD)",
    "FSD_SaveImage": "⚙️ 1. Save Image (FSD)",

    # 2. Conditioning
    "FSD_Prompts": "✍️ 2. Prompts (FSD)",
    "FSD_ControlNet": "✍️ 2. ControlNet (FSD)",
    "FSD_ConditioningCombine": "✍️ 2. Combine Prompts (FSD)",

    # 3. Modifiers
    "FSD_LoRA": "🔌 3. LoRA Apply (FSD)",
    "FSD_LoraStack": "🔌 3. Advanced LoRA Stack (FSD)",
    "FSD_PatchFreeU": "🔌 3. Patch Model: FreeU (FSD)",
    "FSD_PatchToMe": "🔌 3. Patch Model: ToMe (FSD)",
    "FSD_PatchRescaleCFG": "🔌 3. Patch Model: Rescale CFG (FSD)",
    "FSD_PatchModelMerge": "🔌 3. Patch Model: Merge Weights (FSD)",

    # 4. Image Processing
    "FSD_Img2Img": "🖼️ 4. Advanced Img2Img (FSD)",
    "FSD_Inpaint": "🖼️ 4. Advanced Inpaint (FSD)",
    "FSD_HiresFix_Latent": "🖼️ 4. HiresFix (Latent) (FSD)",
    "FSD_HiresFix_Pixel": "🖼️ 4. HiresFix (Model) (FSD)",
    "FSD_TiledUpscale": "🖼️ 4. SD Upscale (Tiled) (FSD)",

    # 5. Routing & Intermediates
    "FSD_PipeSwitch": "🔀 5. Router: Pipe Switch (FSD)",
    "FSD_Bypass": "🔀 5. Router: Pipe Bypass (FSD)",
    "FSD_RandomPipeSwitch": "🔀 5. Router: Random Pipe (FSD)",
    "FSD_PipeBatchCombine": "🔀 5. Router: Batch Combine Pipes (FSD)",
    "FSD_OverrideSettings": "🔀 5. Override Settings (FSD)",
    "FSD_LatentScale": "🔀 5. Latent Scale (FSD)",
    "FSD_SetDenoise": "🔀 5. Set Denoise (FSD)",
    "FSD_PipePreview": "🔀 5. Latent Preview (FSD)",
    "FSD_ClearLatent": "🔀 5. Clear Latent (FSD)",
    "FSD_SetLatentNoiseMask": "🔀 5. Set Noise Mask (FSD)",

    # 6. Bridges & Variables
    "FSD_PipeToKSampler": "📦 6. Bridge: Pipe to KSampler",
    "FSD_UnpackSettings": "📦 6. Bridge: Unpack Settings",
    "FSD_UpdatePipeModel": "📦 6. Pack: Inject Model",
    "FSD_UpdatePipeLatent": "📦 6. Pack: Inject Latent",
    "FSD_UpdatePipeClip": "📦 6. Pack: Inject CLIP",
    "FSD_UpdatePipeVae": "📦 6. Pack: Inject VAE",
    "FSD_UpdatePipePositive": "📦 6. Pack: Inject Positive",
    "FSD_UpdatePipeNegative": "📦 6. Pack: Inject Negative",
    "FSD_UpdatePipeSegs": "📦 6. Pack: Inject SEGS",
    "FSD_ExtractPipeSegs": "📦 6. Extract: SEGS",
    "FSD_PipeToBasicPipe_Impact": "📦 6. Bridge: to Impact BASIC_PIPE",
    "FSD_PackPipe": "📦 6. Bridge: Pack All",
    "FSD_PipeEdit": "📦 6. Bridge: Edit Pipe Component",
    "FSD_PipeMerge": "📦 6. Bridge: Merge Pipes",
    "FSD_PipeInfo": "📦 6. Bridge: Pipe State Info",
    "FSD_UnpackPipe": "📦 6. Bridge: Unpack All",
    "FSD_PipeSetCustom": "📦 6. Variables: Set Any (Dynamic)",
    "FSD_PipeGetCustom": "📦 6. Variables: Get Any (4 Slots)",
    "FSD_PackBasicPipe": "📦 6. Pack Basic Pipe",
    "FSD_UnpackBasicPipe": "📦 6. Unpack Basic Pipe",
    "FSD_EditBasicPipe": "📦 6. Edit Basic Pipe",
    "FSD_UniversalPackDynamic": "📦 6. Universal Pack Dynamic",

    # 7. Text & Strings
    "FSD_PromptTextAppend": "📝 7. Prompt Text Append (FSD)",
    "FSD_PromptTextReplace": "📝 7. Prompt Text Replace (FSD)",
    "FSD_PromptTextOverride": "📝 7. Prompt Text Override (FSD)",
    "FSD_PromptTextExtract": "📝 7. Prompt Text Extract (FSD)",
    "FSD_TextPrimitive": "📝 7. Text: Primitive",
    "FSD_TextConcat": "📝 7. Text: Concat (Dynamic)",
    "FSD_TextRandomLine": "📝 7. Text: Random Line",
    "FSD_TextSplitToList": "📝 7. Text: Split to List",
    "FSD_ListJoinToText": "📝 7. Text: Join from List",
    "FSD_StringJoinDynamic": "📝 7. String Join Dynamic",
    "TextLengthToNumber": "📝 7. Text Length To Number",
    "NumberToPaddedString": "📝 7. Number To Padded String",
    "ExtractNumberFromString": "📝 7. Extract Number From String",
    "MultiplyText": "📝 7. Multiply Text",
    "PercentageFormat": "📝 7. Percentage Format",
    "TextToSeed": "📝 7. Text To Seed",
    "SplitResolutionString": "📝 7. Split Resolution String",
    "InjectNumberIntoString": "📝 7. Inject Number Into String",
    "JoinNumbersToString": "📝 7. Join Numbers To String",
    "TimeToString": "📝 7. Time To String",
    "StringOccurrenceCounter": "📝 7. String Occurrence Counter",
    "StringReplaceABC": "📝 7. String Replace ABC",
    "StringReplaceAdvancedABCDEF": "📝 7. String Replace Advanced ABCDEF",
    "FSD_StringSplitByIndex": "📝 7. String Split By Index",
    "FSD_StateFormatter": "📝 7. State Formatter",

    # 8. Math
    "MathAdd": "➕ 8. Math Add",
    "MathSubtract": "➕ 8. Math Subtract",
    "MathMultiply": "➕ 8. Math Multiply",
    "MathDivide": "➕ 8. Math Divide",
    "MathModulo": "➕ 8. Math Modulo",
    "MathPower": "➕ 8. Math Power",
    "MathSquareRoot": "➕ 8. Math Square Root",
    "MathAbsolute": "➕ 8. Math Absolute",
    "MathClamp": "➕ 8. Math Clamp",
    "MathLerp": "➕ 8. Math Lerp",
    "MathExpressionEvaluate": "➕ 8. Math Expression Evaluate",

    # 9. Logic & Comparisons
    "FSD_ExpressionCondition": "🧠 9. Expression Condition",
    "FSD_WidgetCondition": "🧠 9. Widget Condition",
    "FSD_RegexCondition": "🧠 9. Regex Condition",
    "LogicAND": "🧠 9. Logic AND",
    "LogicOR": "🧠 9. Logic OR",
    "LogicNOT": "🧠 9. Logic NOT",
    "LogicXOR": "🧠 9. Logic XOR",
    "CheckValueInRange": "🧠 9. Check Value In Range",
    "CompareStringsExact": "🧠 9. Compare Strings Exact",
    "CompareNumbers": "🧠 9. Compare Numbers",
    "CompareANY": "🧠 9. Compare ANY",
    "FSD_LogicANDDynamic": "🧠 9. Logic AND Dynamic",
    "FSD_LogicORDynamic": "🧠 9. Logic OR Dynamic",

    # 10. Data & Lists
    "FSD_MakeList": "📂 10. List: Make (Dynamic)",
    "FSD_ListSelect": "📂 10. List: Select Index",
    "FSD_ListLength": "📂 10. List: Length",
    "FSD_GenericBatchCombine": "📂 10. Batch: Combine Any (Dynamic)",

    # 11. State & Stacks
    "StackPush": "💾 11. Stack Push",
    "StackPop": "💾 11. Stack Pop",
    "StackGetByIndex": "💾 11. Stack Get By Index",
    "StackLength": "💾 11. Stack Length",
    "StackClear": "💾 11. Stack Clear",
    "StackJoinToString": "💾 11. Stack Join To String",
    "MathCounter": "💾 11. Math Counter",
    "MathAccumulator": "💾 11. Math Accumulator",
    "LogicFlipFlop": "💾 11. Logic Flip Flop",

    # 12. Switches & Gates
    "FSD_DynamicSwitchANY": "🎛️ 12. Switch ANY (Dynamic)",
    "FSD_DynamicDiverterANY": "🎛️ 12. Diverter ANY (Dynamic)",
    "FSD_BooleanSwitchANY": "🎛️ 12. Bool Switch ANY",
    "FSD_BooleanDiverterANY": "🎛️ 12. Bool Diverter ANY",
    "FSD_GateANY": "🎛️ 12. Gate ANY",

    # 13. Presets & Files
    "FileSaveState": "📁 13. File Save State",
    "FileLoadState": "📁 13. File Load State",
    "FileAppendToList": "📁 13. File Append To List",
    "FileClearStateKey": "📁 13. File Clear State Key",
    "FileListSavedKeys": "📁 13. File List Saved Keys",
    "FSD_FileLoadStateDropdown": "📁 13. File Load State Dropdown",
    "FSD_FileDeleteStateDropdown": "📁 13. File Delete State Dropdown",
    "PresetPack": "📁 13. Preset Pack",
    "PresetUnpack": "📁 13. Preset Unpack",
    "PresetSaveToFile": "📁 13. Preset Save To File",
    "PresetLoadFromFile": "📁 13. Preset Load From File",
    "PresetDelete": "📁 13. Preset Delete",
    "PresetListGroups": "📁 13. Preset List Groups",
    "PresetListItemsInGroup": "📁 13. Preset List Items In Group",
    "PresetMerge": "📁 13. Preset Merge",
    "PresetUpdateField": "📁 13. Preset Update Field",
    "PresetExtractSingleField": "📁 13. Preset Extract Single Field",
    "FSD_PresetLoadDropdown": "📁 13. Preset Load Dropdown",
    "FSD_PresetDeleteDropdown": "📁 13. Preset Delete Dropdown",

    # 14. Signals & Mutators
    "SignalSend": "📡 14. Signal Send",
    "SignalReceive": "📡 14. Signal Receive",
    "ManualTriggerSeed": "📡 14. Manual Trigger Seed",
    "FSD_DetectNodesState": "📡 14. Detect Nodes State",
    "FSD_DetectGroupState": "📡 14. Detect Group State",
    "FSD_StateMutatorSettings": "📡 14. State Mutator Settings",
    "FSD_ApplyStateMutator": "📡 14. Apply State Mutator",
    "FSD_LogicAutoMutator": "📡 14. Logic Auto Mutator",
    "FSD_AdvancedNodeBypasser": "📡 14. Advanced Live Bypasser",

    # 15. UI & Dropdowns
    "FSD_DropdownCheckpoints": "🔽 15. Dropdown Checkpoints",
    "FSD_DropdownLoras": "🔽 15. Dropdown Loras",
    "FSD_DropdownVAEs": "🔽 15. Dropdown VAEs",
    "FSD_DropdownControlNets": "🔽 15. Dropdown ControlNets",
    "FSD_DropdownSamplers": "🔽 15. Dropdown Samplers",
    "FSD_DropdownSchedulers": "🔽 15. Dropdown Schedulers",
    "FSD_DropdownMutatorAction": "🔽 15. Dropdown Mutator Action",
    "FSD_DropdownMutatorTarget": "🔽 15. Dropdown Mutator Target",
    "FSD_DropdownCustomList": "🔽 15. Dropdown Custom List",
    "FSD_CustomListManager": "🔽 15. Custom List Manager",
    "BooleanToggle": "🔽 15. Boolean Toggle",
    "RandomBoolean": "🔽 15. Random Boolean",
    "MultiBooleanLogic": "🔽 15. Multi Boolean Logic",

    # 16. Converters
    "FloatToIntAdvanced": "🔄 16. Float To Int Advanced",
    "IntToFloat": "🔄 16. Int To Float",
    "NumberToStringAdvanced": "🔄 16. Number To String Advanced",
    "StringToNumberAdvanced": "🔄 16. String To Number Advanced",
    "BooleanToWidget": "🔄 16. Boolean To Widget",

    # 17. Indexes & Routing
    "FSD_CustomDropdownRouter": "🔢 17. Dropdown Router (0-19)",
    "FSD_IndexSelector": "🔢 17. Index Selector",
    "FSD_IndexMath": "🔢 17. Index Math (Offset/Wrap)",
    "FSD_StringToIndex": "🔢 17. String to Index Matcher",
    "FSD_IndexToBoolean": "🔢 17. Index to Boolean (Is Match?)",
    "FSD_BooleanToIndex": "🔢 17. Boolean to Index",
    "FSD_RandomIndex": "🔢 17. Random Index (0 to Max)",
    "FSD_IndexStepper": "🔢 17. Index Stepper (Stateful)",
    "FSD_ListLengthToIndex": "🔢 17. List Length to Max Index",
    "FSD_SelectFromTextLines": "🔢 17. Text Line Selector by Index"
}