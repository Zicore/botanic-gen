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
