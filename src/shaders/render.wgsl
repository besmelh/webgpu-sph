struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    viewport: vec2<f32>,
    _padding: vec2<f32>      // 8 bytes padding to maintain 16-byte alignment
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var accumTexture: texture_2d<f32>;
@group(1) @binding(1) var texSampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) centerPos: vec2<f32>,
    @location(2) particleRadius: f32,
    @location(3) viewPos: vec3<f32>,
    @location(4) worldPos: vec3<f32>
};

struct FinalVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
};

@vertex
fn vertexMain(
    @location(0) quadPos: vec2<f32>,
    @location(1) position: vec4<f32>,
    @location(2) velocity: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    // Adjust particle size calculation
    let baseParticleSize = 0.2;  // Increased from 0.02
    // Calculate aspect ratio
    let aspect = camera.viewport.x / camera.viewport.y;
    
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    // Scale particle size with distance and aspect ratio
    let distanceScale = max(1000, min(1.0, 1.0 / abs(viewPos.z)));
    let finalParticleSize = baseParticleSize * distanceScale;
    
    // Adjust billboard position to account for aspect ratio
    let billboardPos = viewPos + vec3<f32>(
        quadPos.x,  // Scale X by aspect ratio
        quadPos.y ,
        0.0
    ) * baseParticleSize;
    
    let clipPos = camera.projection * vec4<f32>(billboardPos, 1.0);
    output.position = clipPos;
    output.viewPos = viewPos;
    output.worldPos = worldPos.xyz;

    // Calculate screen-space position
    let ndc = clipPos.xyz / clipPos.w;
    output.centerPos = ndc.xy * 0.5 + 0.5;
    // Adjust particle radius for screen space
    output.particleRadius = finalParticleSize * 0.5;  // Simplified radius calculation

    let density = position.w;
    let normalizedDensity = density / 1000.0;
    let lowColor = vec3<f32>(0.2, 0.4, 0.8);
    let highColor = vec3<f32>(0.0, 0.6, 1.0);
    output.color = vec4<f32>(mix(lowColor, highColor, normalizedDensity), 1.0);
    
    return output;
}

@vertex
fn vertexFinal(
    @location(0) position: vec2<f32>
) -> FinalVertexOutput {
    var output: FinalVertexOutput;
    output.position = vec4<f32>(position, 0.0, 1.0);
    output.uv = position * 0.5 + 0.5;
    return output;
}

fn calculateField(dist: f32, radius: f32) -> f32 {
    if (dist >= radius) {
        return 0.0;
    }
    let scaled_dist = dist / radius;
    return (1.0 - scaled_dist * scaled_dist) * 0.5;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let fragCoord = input.position.xy;
    // Normalize coordinates with aspect ratio correction
    let normalizedCoord = vec2<f32>(
        fragCoord.x / camera.viewport.x,
        fragCoord.y / camera.viewport.y
    );
    
    let dist = distance(normalizedCoord, input.centerPos);
    let field = calculateField(dist, input.particleRadius);
    
    return vec4<f32>(field, field, field, 1.0);
}

fn calculateNormal(field: f32, pos: vec2<f32>, screenSize: vec2<f32>) -> vec3<f32> {
    let pixelSize = 1.0 / screenSize;
    let dx = dpdx(field) / pixelSize.x;
    let dy = dpdy(field) / pixelSize.y;
    return normalize(vec3<f32>(-dx, -dy, 1.0));
}

@fragment
fn fragmentFinal(input: FinalVertexOutput) -> @location(0) vec4<f32> {


    let fieldSample = textureSample(accumTexture, texSampler, input.uv);   
    return fieldSample;
}