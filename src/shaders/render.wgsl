struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
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
    
    let particleSize = 0.2;
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    let clipPos = camera.projection * vec4<f32>(viewPos, 1.0);
    let ndc = clipPos.xyz / clipPos.w;
    let screenPos = ndc.xy * 0.5 + 0.5;
    
    let screenRadius = particleSize / abs(viewPos.z);
    let expandedQuadPos = quadPos * 2.0;
    let billboardPos = viewPos + vec3<f32>(expandedQuadPos.x, expandedQuadPos.y, 0.0) * particleSize;
    
    output.position = camera.projection * vec4<f32>(billboardPos, 1.0);
    output.centerPos = screenPos;
    output.particleRadius = screenRadius;
    output.viewPos = viewPos;
    output.worldPos = worldPos.xyz;
    
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
    let r2 = dist * dist;
    let scaled_dist = dist / radius;
    
    if (scaled_dist >= 1.0) {
        return 0.0;
    }
    return (1.0 - scaled_dist * scaled_dist) * (1.0 - scaled_dist * scaled_dist);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let fragCoord = input.position.xy;
    let screenSize = vec2<f32>(1920.0, 1080.0);
    let normalizedCoord = fragCoord / screenSize;
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