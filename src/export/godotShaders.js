// Godot 4 spatial shaders shipped with the Godot package.
// Vertex data contract (written by the generator):
//   COLOR.rgb = baked AO × tint     UV2.x = branch flex (0..1)     UV2.y = leaf flutter (0..1)

const WIND = /* glsl */ `
group_uniforms wind;
uniform float wind_strength : hint_range(0.0, 3.0) = 0.35;
uniform vec2 wind_direction = vec2(0.94, 0.34);
uniform float wind_speed : hint_range(0.0, 4.0) = 1.0;
uniform float tree_height = 10.0;
group_uniforms;

vec3 botanica_wind(vec3 p, vec3 n, vec2 w, float t, vec3 origin) {
	if (wind_strength <= 0.0) {
		return p;
	}
	vec3 dir = normalize(vec3(wind_direction.x, 0.0, wind_direction.y));
	float h = max(p.y, 0.0) / max(tree_height, 0.01);
	float gust = 0.65 + 0.35 * sin(t * 0.31 + origin.x * 0.05) * sin(t * 0.17 + 1.3 + origin.z * 0.05);
	float phase = dot(p + origin, vec3(0.071, 0.043, 0.067)) * 6.2831;
	float sway = (0.75 + 0.25 * sin(t * 0.9 + phase * 0.1)) * gust;
	vec3 off = dir * (h * h) * sway * wind_strength * tree_height * 0.025;
	float br = sin(t * 1.9 + phase) * 0.6 + sin(t * 3.1 + phase * 1.7) * 0.4;
	off += (dir * 0.5 + vec3(0.0, 0.35, 0.0) + vec3(dir.z, 0.0, -dir.x) * 0.4) * br * w.x * wind_strength * tree_height * 0.012 * gust;
	float fl = sin(t * 9.0 + phase * 4.0) * 0.6 + sin(t * 13.7 + phase * 7.0) * 0.4;
	off += n * fl * w.y * wind_strength * 0.035 * (0.5 + gust);
	off.y -= length(off.xz) * 0.15 * h;
	return p + off;
}
`;

export const GODOT_FOLIAGE_SHADER = `// Botanica foliage shader (Godot 4)
// Alpha-tested, double-sided leaves with translucency, baked AO and wind.
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque, diffuse_burley, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D normal_texture : hint_normal, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D orm_texture : hint_default_white, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D translucency_texture : hint_default_black, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec4 albedo_tint : source_color = vec4(1.0);
uniform float alpha_cutoff : hint_range(0.0, 1.0) = 0.45;
uniform float alpha_mip_boost : hint_range(0.0, 1.0) = 0.25;
uniform float normal_strength : hint_range(0.0, 4.0) = 1.0;
uniform float vertex_ao : hint_range(0.0, 1.0) = 1.0;
uniform float specular_amount : hint_range(0.0, 1.0) = 0.35;
uniform vec3 subsurface_color : source_color = vec3(0.66, 0.77, 0.24);
uniform float translucency : hint_range(0.0, 4.0) = 1.0;
// Keep the (canopy-blended) vertex normal on back faces instead of flipping it.
// Gives soft, volumetric canopy shading; disable for physically flipped normals.
uniform bool keep_back_normals = true;
${WIND}
void vertex() {
	VERTEX = botanica_wind(VERTEX, NORMAL, UV2, TIME * wind_speed, NODE_POSITION_WORLD);
}

void fragment() {
	vec4 a = texture(albedo_texture, UV);
	vec3 ao_tint = mix(vec3(1.0), COLOR.rgb, vertex_ao);
	ALBEDO = a.rgb * albedo_tint.rgb * ao_tint;

	// Mip-aware alpha: counteracts foliage thinning out in the distance.
	vec2 ts = vec2(textureSize(albedo_texture, 0));
	vec2 dx = dFdx(UV * ts);
	vec2 dy = dFdy(UV * ts);
	float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
	ALPHA = a.a * (1.0 + lod * alpha_mip_boost);
	ALPHA_SCISSOR_THRESHOLD = alpha_cutoff;
	ALPHA_ANTIALIASING_EDGE = 0.3;

	if (!FRONT_FACING && keep_back_normals) {
		NORMAL = -NORMAL; // undo Godot's automatic back-face flip
	}
	NORMAL_MAP = texture(normal_texture, UV).rgb;
	NORMAL_MAP_DEPTH = normal_strength;

	vec3 orm = texture(orm_texture, UV).rgb;
	AO = orm.r;
	ROUGHNESS = orm.g;
	METALLIC = 0.0;
	SPECULAR = specular_amount;

	float t = texture(translucency_texture, UV).r * translucency;
	BACKLIGHT = subsurface_color * a.rgb * t * 2.2 * COLOR.r * COLOR.r;
}
`;

export const GODOT_BARK_SHADER = `// Botanica bark shader (Godot 4)
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_texture : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D orm_texture : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 albedo_tint : source_color = vec4(1.0);
uniform float normal_strength : hint_range(0.0, 4.0) = 1.0;
uniform float vertex_ao : hint_range(0.0, 1.0) = 1.0;
uniform float ao_strength : hint_range(0.0, 1.0) = 0.9;
${WIND}
void vertex() {
	VERTEX = botanica_wind(VERTEX, NORMAL, UV2, TIME * wind_speed, NODE_POSITION_WORLD);
}

void fragment() {
	vec3 ao_tint = mix(vec3(1.0), COLOR.rgb, vertex_ao);
	ALBEDO = texture(albedo_texture, UV).rgb * albedo_tint.rgb * ao_tint;
	NORMAL_MAP = texture(normal_texture, UV).rgb;
	NORMAL_MAP_DEPTH = normal_strength;
	vec3 orm = texture(orm_texture, UV).rgb;
	AO = mix(1.0, orm.r, ao_strength);
	ROUGHNESS = orm.g;
	METALLIC = 0.0;
}
`;

// Billboard impostor for the far LOD (see impostor/impostor.js for the atlas conventions).
// Put on a 2×2 QuadMesh: the vertex shader turns it toward the camera — or toward the light in
// shadow passes — and blends the four baked views nearest to that direction.
export const GODOT_IMPOSTOR_SHADER = `// Botanica impostor shader (Godot 4)
// Camera-facing billboard over a hemi-octahedral atlas of baked views, lit with baked normals.
// Casts shadows but does not receive them: in the shadow pass the quad turns toward the light,
// so the visible quad would be cut by its own shadow along a line through the tree center.
// Interior darkening comes from the AO baked into the atlas instead.
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque, diffuse_burley, specular_schlick_ggx, shadows_disabled;

uniform sampler2D albedo_atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform sampler2D normal_atlas : hint_default_white, filter_linear_mipmap, repeat_disable;
uniform float frames = 8.0;
uniform vec3 center = vec3(0.0, 5.0, 0.0);
uniform float radius = 5.0;
uniform float alpha_cutoff : hint_range(0.0, 1.0) = 0.4;
uniform float alpha_mip_boost : hint_range(0.0, 1.0) = 0.25;
uniform float roughness : hint_range(0.0, 1.0) = 0.85;
uniform float specular_amount : hint_range(0.0, 1.0) = 0.3;
uniform vec3 subsurface_color : source_color = vec3(0.66, 0.77, 0.24);
uniform float translucency : hint_range(0.0, 4.0) = 1.0;

varying vec4 imp_a;
varying vec4 imp_b;
varying vec4 imp_c;
varying vec4 imp_d;
varying vec4 imp_w;

vec2 imp_encode(vec3 v) {
	v /= abs(v.x) + abs(v.y) + abs(v.z);
	return vec2(v.x + v.z, v.x - v.z);
}

vec3 imp_decode(vec2 e) {
	vec3 v = vec3((e.x + e.y) * 0.5, 0.0, (e.x - e.y) * 0.5);
	v.y = 1.0 - abs(v.x) - abs(v.z);
	return normalize(v);
}

void imp_basis(vec3 d, out vec3 r, out vec3 u) {
	vec3 up0 = abs(d.y) > 0.999 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
	r = normalize(cross(up0, d));
	u = cross(d, r);
}

// atlas uv (xy) and tile-local uv (zw) where the view ray through this vertex meets the frame plane
vec4 imp_frame_uv(vec2 cell, vec3 o, vec3 dir) {
	vec3 D = imp_decode((cell + 0.5) / frames * 2.0 - 1.0);
	vec3 r;
	vec3 u;
	imp_basis(D, r, u);
	vec3 L = o + dir * (dot(center - o, D) / dot(dir, D)) - center;
	vec2 local = vec2(dot(L, r), -dot(L, u)) / (2.0 * radius) + 0.5;
	return vec4((cell + local) / frames, local);
}

void vertex() {
	mat4 inv_model = inverse(MODEL_MATRIX);
	bool ortho = PROJECTION_MATRIX[3][3] == 1.0;
	vec3 cam = (inv_model * vec4(INV_VIEW_MATRIX[3].xyz, 1.0)).xyz;
	vec3 V = ortho ? normalize((inv_model * vec4(INV_VIEW_MATRIX[2].xyz, 0.0)).xyz) : normalize(cam - center);
	vec3 r;
	vec3 u;
	imp_basis(V, r, u);
	vec3 P = center + (r * VERTEX.x + u * VERTEX.y) * radius;
	vec3 o = ortho ? P + V * radius * 4.0 : cam;
	vec3 dir = ortho ? -V : P - cam;

	vec3 vh = vec3(V.x, max(V.y, 0.0), V.z);
	vh = dot(vh, vh) < 1e-6 ? vec3(0.0, 0.0, 1.0) : normalize(vh);
	vec2 g = (imp_encode(vh) * 0.5 + 0.5) * frames - 0.5;
	vec2 c0 = clamp(floor(g), vec2(0.0), vec2(frames - 1.0));
	vec2 f = clamp(g - c0, 0.0, 1.0);
	vec2 c1 = min(c0 + 1.0, vec2(frames - 1.0));
	imp_a = imp_frame_uv(c0, o, dir);
	imp_b = imp_frame_uv(vec2(c1.x, c0.y), o, dir);
	imp_c = imp_frame_uv(vec2(c0.x, c1.y), o, dir);
	imp_d = imp_frame_uv(c1, o, dir);
	imp_w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);

	VERTEX = P;
	NORMAL = V;
}

void imp_accum(vec4 fr, float w, inout vec4 col, inout vec4 nrm) {
	if (w <= 0.0 || any(lessThan(fr.zw, vec2(0.0))) || any(greaterThan(fr.zw, vec2(1.0)))) {
		return;
	}
	vec4 a = texture(albedo_atlas, fr.xy);
	float aw = a.a * w;
	col += vec4(a.rgb * aw, aw);
	nrm += texture(normal_atlas, fr.xy) * aw;
}

void fragment() {
	vec4 col = vec4(0.0);
	vec4 nrm = vec4(0.0);
	imp_accum(imp_a, imp_w.x, col, nrm);
	imp_accum(imp_b, imp_w.y, col, nrm);
	imp_accum(imp_c, imp_w.z, col, nrm);
	imp_accum(imp_d, imp_w.w, col, nrm);
	float cov = max(col.a, 1e-4);

	vec2 ts = vec2(textureSize(albedo_atlas, 0));
	vec2 dx = dFdx(imp_a.xy * ts);
	vec2 dy = dFdy(imp_a.xy * ts);
	float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
	ALBEDO = col.rgb / cov;
	ALPHA = col.a * (1.0 + lod * alpha_mip_boost);
	ALPHA_SCISSOR_THRESHOLD = alpha_cutoff;
	ALPHA_ANTIALIASING_EDGE = 0.3;

	vec3 n = normalize(nrm.rgb / cov * 2.0 - 1.0);
	NORMAL = normalize((VIEW_MATRIX * (MODEL_MATRIX * vec4(n, 0.0))).xyz);
	ROUGHNESS = roughness;
	METALLIC = 0.0;
	SPECULAR = specular_amount;
	BACKLIGHT = subsurface_color * ALBEDO * (nrm.a / cov) * translucency * 2.2;
}
`;
